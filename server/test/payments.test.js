/* SPEC-35 AC-01…AC-11: pago en línea con Mercado Pago Checkout Pro, contra la BD de test
   real. Mercado Pago es un servicio externo: se simula su borde HTTP (test/mp-fake.js) y las
   firmas de los webhooks se calculan acá con un MP_WEBHOOK_SECRET de prueba. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, Business, PanelNotification, PaymentEvent, Professional, SlotLock } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { api, connectDb, disconnectDb, HOUR, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV, MP_SECRET, MP_TOKEN, sendWebhook, signedHeaders } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';

function world({ env = MP_ENV, onlineEnabled = true } = {}) {
  const t = { ctx: null, mp: null, seeded: null, admin: null, logs: [] };
  const logger = { log: (...a) => t.logs.push(a.join(' ')), warn: (...a) => t.logs.push(a.join(' ')), error: (...a) => t.logs.push(a.join(' ')) };
  t.boot = async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.logs.length = 0;
    t.seeded = await seed({ pros: [PRO_A, PRO_B] });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': onlineEnabled, 'payments.localEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...env }, mercadoPagoFetch: t.mp.fetch, logger });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.post = (path, body = {}, cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  t.pro = (i = 0) => t.seeded.pros[i];
  t.book = async ({ time = '12:00', pro = t.pro(0), method = 'online', client } = {}) => {
    const c = client || (await makeClient({ name: 'Ana Pérez', email: `ana${Math.random().toString(36).slice(2, 7)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` }));
    const r = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(pro._id), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: method }, c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return { id: r.json.id, client: c, res: r };
  };
  /* Webhook firmado "ahora" según el reloj inyectado del server. */
  t.hook = (dataId, over = {}) => sendWebhook(t.ctx.base, { dataId, type: over.type, headers: over.headers ?? signedHeaders({ dataId, ts: String(t.ctx.clock.now), ...over }) });
  t.appt = (id) => Appointment.findById(id);
  t.mails = (re) => t.ctx.mailer.outbox.filter((m) => re.test(m.template || ''));
  t.barberCookie = async (p = t.pro(0)) => {
    const c = await makeClient({ name: p.displayName, email: `sesion.${Math.random().toString(36).slice(2, 7)}@barberos.test`, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };
  return t;
}

describe('SPEC-35 pago en línea', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 la preferencia se arma en el server con el total, la referencia, las URLs y el vencimiento', async () => {
    const cat = await t.get('/api/wstyle/catalog');
    assert.deepEqual(cat.json.business.payments, { online: true, local: true });
    const { id, client, res } = await t.book();
    assert.equal(res.json.appointment.status, 'pendiente_pago');
    assert.equal(res.json.appointment.payment.method, 'online');
    /* RN-04: los correos de "reserva recibida" salen recién cuando el pago se aprueba. */
    assert.equal(t.ctx.mailer.outbox.length, 0);
    const appt = await t.appt(id);
    assert.equal(appt.expiresAt.getTime(), SUNDAY_9AM + 15 * MIN);
    assert.equal(await SlotLock.countDocuments({ appointmentId: appt._id }), 3);

    const r = await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.initPoint, /^https:\/\/www\.mercadopago\.cl\/checkout/);
    const [call] = t.mp.callsTo('POST', /^\/checkout\/preferences$/);
    const p = call.body;
    assert.deepEqual(p.items.map((i) => [i.quantity, i.unit_price, i.currency_id]), [[1, 12000, 'CLP']]);
    assert.match(p.items[0].title, /^Corte · WS Style · .+ 12:00$/);
    assert.equal(p.external_reference, id);
    assert.equal(p.payer.email, client.user.email);
    for (const k of ['success', 'failure', 'pending']) assert.ok(p.back_urls[k].startsWith(`https://ricorp.test/wstyle/cita/?id=${id}&pago=`), p.back_urls[k]);
    assert.equal(p.auto_return, 'approved');
    assert.equal(p.notification_url, 'https://api.ricorp.test/api/payments/mp/webhook');
    assert.equal(p.expires, true);
    assert.equal(Date.parse(p.expiration_date_to), SUNDAY_9AM + 15 * MIN);
    assert.deepEqual(p.payment_methods.excluded_payment_types.map((x) => x.id).sort(), ['atm', 'bank_transfer', 'ticket']);
    assert.equal(p.statement_descriptor, 'WSSTYLE');
    assert.ok(call.headers['x-idempotency-key']);
    assert.equal((await t.appt(id)).payment.preferenceId, 'pref-1');

    /* Cada intento lleva su propia clave de idempotencia. */
    await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    const keys = t.mp.callsTo('POST', /^\/checkout\/preferences$/).map((c) => c.headers['x-idempotency-key']);
    assert.equal(new Set(keys).size, 2);

    /* Cita ajena → 404; sin sesión → 401. */
    const other = await makeClient({});
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, other.cookie)).status, 404);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/checkout`, {})).status, 401);

    /* Ya pagada → 409. */
    t.mp.pay(id, { id: '9001', amount: 12000 });
    assert.equal((await t.hook('9001')).status, 200);
    const paid = await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    assert.equal(paid.status, 409);
    assert.equal(paid.json.error, 'already_paid');
  });

  test('CB-10 Mercado Pago falla al crear la preferencia → la cita sigue esperando el pago y se puede reintentar o pasar al local', async () => {
    const { id, client } = await t.book();
    t.mp.state.failPreference = 500;
    const r = await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    assert.equal(r.status, 502);
    assert.equal(r.json.error, 'payment_provider_error');
    const view = await t.get(`/api/wstyle/appointments/${id}`, client.cookie);
    assert.equal(view.json.status, 'pendiente_pago');
    assert.ok(view.json.actions.includes('pay'));
    assert.ok(view.json.actions.includes('pay_local'));
    t.mp.state.failPreference = null;
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie)).status, 200);
  });

  test('AC-03 firma: válida procesa; alterada, ausente, de otro data.id o vieja → 401 sin cambios', async () => {
    const { id } = await t.book();
    t.mp.pay(id, { id: '777', amount: 12000 });
    const now = String(t.ctx.clock.now);
    const bad = [
      { 'x-signature': signedHeaders({ dataId: '777', ts: now })['x-signature'].replace(/v1=./, 'v1=0'), 'x-request-id': 'r1' },
      {},
      signedHeaders({ dataId: '777', ts: now, signId: '778' }),
      signedHeaders({ dataId: '777', ts: String(t.ctx.clock.now - 11 * MIN) }),
      signedHeaders({ dataId: '777', ts: now, secret: 'otra-clave' }),
    ];
    for (const headers of bad) {
      const r = await t.hook('777', { headers });
      assert.equal(r.status, 401, JSON.stringify(headers));
    }
    assert.equal((await t.appt(id)).status, 'pendiente_pago');
    assert.equal(await PaymentEvent.countDocuments({}), 0);
    assert.equal(t.mp.callsTo('GET', /^\/v1\/payments\//).length, 0);
    /* ts en segundos también vale (versiones anteriores del panel). */
    assert.equal((await t.hook('777', { ts: String(Math.floor(t.ctx.clock.now / 1000)) })).status, 200);
    assert.equal((await t.appt(id)).status, 'pendiente');
    /* Otro tipo de notificación con firma válida → 200 sin hacer nada. */
    const other = await t.hook('abc', { type: 'merchant_order' });
    assert.equal(other.status, 200);
    assert.ok(t.logs.some((l) => /firma inválida/.test(l)));
  });

  test('AC-04 approved → pagado y la cita pasa a esperar al barbero, con correos "Pagado en línea"', async () => {
    const { id, client } = await t.book();
    t.mp.pay(id, { id: '1001', amount: 12000 });
    assert.equal((await t.hook('1001')).status, 200);
    const a = await t.appt(id);
    assert.equal(a.status, 'pendiente');
    assert.equal(a.payment.status, 'pagado');
    assert.equal(a.payment.mpPaymentId, '1001');
    assert.ok(a.expiresAt.getTime() > SUNDAY_9AM + HOUR);
    const toClient = t.ctx.mailer.outbox.find((m) => m.to === client.user.email);
    const toBarber = t.ctx.mailer.outbox.find((m) => m.to === 'a@barberos.test');
    for (const m of [toClient, toBarber]) assert.match(m.text, /Pagado en línea/);
    const view = await t.get(`/api/wstyle/appointments/${id}`, client.cookie);
    assert.equal(view.json.payment.status, 'pagado');
    assert.ok(!view.json.actions.includes('pay'));
  });

  test('AC-04 rejected / cancelled → sigue esperando el pago con Reintentar y Pagar en el local', async () => {
    const booked = {};
    for (const [status, mpId, time] of [['rejected', '2001', '12:00'], ['cancelled', '2002', '13:00']]) {
      const b = await t.book({ time });
      booked[status] = b;
      t.mp.pay(b.id, { id: mpId, status, amount: 12000 });
      assert.equal((await t.hook(mpId)).status, 200);
      const a = await t.appt(b.id);
      assert.equal(a.status, 'pendiente_pago', status);
      assert.equal(a.payment.status, 'rechazado', status);
      assert.equal(a.expiresAt.getTime(), SUNDAY_9AM + 15 * MIN, 'mismo vencimiento original');
      const view = await t.get(`/api/wstyle/appointments/${b.id}`, b.client.cookie);
      assert.deepEqual(['pay', 'pay_local'].filter((x) => view.json.actions.includes(x)), ['pay', 'pay_local']);
    }
    /* "Cambiar a pagar en el local": pasa a pendiente con pago en el local y salen los correos. */
    const r = await t.post(`/api/wstyle/appointments/${booked.rejected.id}/pay-local`, {}, booked.rejected.client.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.status, 'pendiente');
    assert.equal(r.json.payment.method, 'local');
    assert.equal(t.mails(/client_received/).length, 1);
    assert.equal(t.mails(/barber_new/).length, 1);
    /* Reintentar: nueva preferencia con el vencimiento original. */
    assert.equal((await t.post(`/api/wstyle/appointments/${booked.cancelled.id}/checkout`, {}, booked.cancelled.client.cookie)).status, 200);
    const pref = t.mp.callsTo('POST', /^\/checkout\/preferences$/).at(-1).body;
    assert.equal(Date.parse(pref.expiration_date_to), SUNDAY_9AM + 15 * MIN);
  });

  test('AC-04 / AC-06 in_process y pending extienden la retención a 2 h; luego se cancela y libera la hora', async () => {
    const a1 = await t.book({ time: '12:00' });
    const a2 = await t.book({ time: '14:00' });
    const a3 = await t.book({ time: '16:00' });
    t.mp.pay(a1.id, { id: '3001', status: 'in_process', amount: 12000 });
    t.mp.pay(a2.id, { id: '3002', status: 'pending', amount: 12000 });
    for (const x of ['3001', '3002']) assert.equal((await t.hook(x)).status, 200);
    for (const x of [a1, a2]) {
      const a = await t.appt(x.id);
      assert.equal(a.payment.status, 'en_proceso');
      assert.equal(a.expiresAt.getTime(), SUNDAY_9AM + 2 * HOUR);
    }
    /* A los 16 min: la que no tiene pago se cancela y libera la hora; las "en proceso" siguen. */
    t.ctx.clock.now = SUNDAY_9AM + 16 * MIN;
    const r1 = await t.ctx.app.locals.payments.runHolds();
    assert.equal(r1.cancelled, 1);
    const c3 = await t.appt(a3.id);
    assert.equal(c3.status, 'cancelada');
    assert.match(c3.history.at(-1).reason, /pago no completado/i);
    assert.equal(await SlotLock.countDocuments({ appointmentId: c3._id }), 0);
    assert.equal(t.mails(/client_payment_incomplete/).length, 1);
    assert.equal((await t.appt(a1.id)).status, 'pendiente_pago');
    /* A las 2 h 1 min también caen las "en proceso". */
    t.ctx.clock.now = SUNDAY_9AM + 2 * HOUR + MIN;
    const r2 = await t.ctx.app.locals.payments.runHolds();
    assert.equal(r2.cancelled, 2);
    assert.equal(await SlotLock.countDocuments({}), 0);
  });

  test('AC-04 refunded y charged_back', async () => {
    const { id } = await t.book();
    t.mp.pay(id, { id: '4001', amount: 12000 });
    await t.hook('4001');
    /* Contracargo: alerta al admin; la cita NO cambia de estado. */
    t.mp.pay(id, { id: '4001', status: 'charged_back', amount: 12000 });
    assert.equal((await t.hook('4001')).status, 200);
    let a = await t.appt(id);
    assert.equal(a.status, 'pendiente');
    assert.equal(a.payment.status, 'contracargo');
    assert.ok(await PanelNotification.exists({ userId: t.admin.user._id, kind: 'payment_chargeback' }));

    const b = await t.book({ time: '15:00' });
    t.mp.pay(b.id, { id: '4002', amount: 12000 });
    await t.hook('4002');
    t.mp.pay(b.id, { id: '4002', status: 'refunded', amount: 12000 });
    assert.equal((await t.hook('4002')).status, 200);
    a = await t.appt(b.id);
    assert.equal(a.payment.status, 'reembolsado');
  });

  test('AC-05 el mismo approved 5 veces y en paralelo → un cambio, un PaymentEvent, un correo; pending después no retrocede', async () => {
    const { id, client } = await t.book();
    t.mp.pay(id, { id: '5001', amount: 12000 });
    const rs = await Promise.all(Array.from({ length: 5 }, () => t.hook('5001')));
    for (const r of rs) assert.ok([200, 201].includes(r.status), String(r.status));
    assert.equal(await PaymentEvent.countDocuments({ mpPaymentId: '5001', status: 'approved' }), 1);
    const a = await t.appt(id);
    assert.equal(a.history.filter((h) => h.to === 'pendiente').length, 1);
    assert.equal(t.ctx.mailer.outbox.filter((m) => m.to === client.user.email).length, 1);
    /* Fuera de orden: llega "pending" después del "approved" → no se vuelve atrás. */
    t.mp.pay(id, { id: '5001', status: 'pending', amount: 12000 });
    await t.hook('5001');
    const b = await t.appt(id);
    assert.equal(b.payment.status, 'pagado');
    assert.equal(b.status, 'pendiente');
    for (let i = 0; i < 3; i++) await t.hook('5001');
    assert.equal(await PaymentEvent.countDocuments({ mpPaymentId: '5001' }), 2);
  });

  test('AC-07 aprobado tarde: hora libre → vuelve a pendiente; hora ocupada → reembolso pendiente + alerta', async () => {
    const a = await t.book({ time: '12:00' });
    const b = await t.book({ time: '14:00' });
    t.ctx.clock.now = SUNDAY_9AM + 16 * MIN;
    await t.ctx.app.locals.payments.runHolds();
    assert.equal((await t.appt(a.id)).status, 'cancelada');
    /* La hora de B la toma otro cliente (pago en el local). */
    const taker = await t.book({ time: '14:00', method: 'local' });
    assert.ok(taker.id);
    t.mp.pay(a.id, { id: '6001', amount: 12000 });
    t.mp.pay(b.id, { id: '6002', amount: 12000 });
    await t.hook('6001');
    await t.hook('6002');
    const ra = await t.appt(a.id);
    assert.equal(ra.status, 'pendiente');
    assert.equal(ra.payment.status, 'pagado');
    assert.equal(await SlotLock.countDocuments({ appointmentId: ra._id }), 3);
    const rb = await t.appt(b.id);
    assert.equal(rb.status, 'cancelada');
    assert.equal(rb.payment.status, 'reembolso_pendiente');
    assert.ok(await PanelNotification.exists({ kind: 'payment_late' }));
  });

  test('AC-07 / CB-07 monto distinto o pago sin cita → no se marca pagado + alerta', async () => {
    const { id } = await t.book();
    t.mp.pay(id, { id: '6101', amount: 100 });
    assert.equal((await t.hook('6101')).status, 200);
    const a = await t.appt(id);
    assert.equal(a.status, 'pendiente_pago');
    assert.notEqual(a.payment.status, 'pagado');
    assert.ok(await PanelNotification.exists({ kind: 'payment_mismatch' }));
    t.mp.pay('000000000000000000000000', { id: '6102', amount: 12000 });
    assert.equal((await t.hook('6102')).status, 200);
    assert.ok(await PanelNotification.exists({ kind: 'payment_orphan' }));
    /* Moneda distinta tampoco. */
    t.mp.pay(id, { id: '6103', amount: 12000, currency: 'USD' });
    await t.hook('6103');
    assert.notEqual((await t.appt(id)).payment.status, 'pagado');
  });

  test('AC-08 volver con ?pago=approved sin pago real no cambia nada; si el pago existe, la página lo trae (CB-03)', async () => {
    const { id, client } = await t.book();
    const r = await t.get(`/api/wstyle/appointments/${id}?pago=approved`, client.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'pendiente_pago');
    assert.equal(r.json.payment.status, 'pendiente');
    assert.equal(t.mp.callsTo('GET', /^\/v1\/payments\/search$/).length, 1, 'consulta a Mercado Pago, no a la URL');
    /* El webhook se perdió pero el pago existe: la página lo resuelve consultando a Mercado Pago. */
    t.mp.pay(id, { id: '7001', amount: 12000 });
    t.ctx.clock.now += 10_000;
    const r2 = await t.get(`/api/wstyle/appointments/${id}?pago=approved`, client.cookie);
    assert.equal(r2.json.status, 'pendiente');
    assert.equal(r2.json.payment.status, 'pagado');
  });

  test('AC-09 conciliación: con el webhook perdido aplica el estado y es idempotente con el webhook tardío', async () => {
    const { id, client } = await t.book();
    t.mp.pay(id, { id: '8001', amount: 12000 });
    const r = await t.ctx.app.locals.payments.reconcile();
    assert.equal(r.checked, 1);
    let a = await t.appt(id);
    assert.equal(a.payment.status, 'pagado');
    assert.equal(a.status, 'pendiente');
    assert.equal(await t.hook('8001').then((x) => x.status), 200);
    await t.ctx.app.locals.payments.reconcile();
    a = await t.appt(id);
    assert.equal(a.history.filter((h) => h.to === 'pendiente').length, 1);
    assert.equal(await PaymentEvent.countDocuments({ mpPaymentId: '8001' }), 1);
    assert.equal(t.ctx.mailer.outbox.filter((m) => m.to === client.user.email).length, 1);
  });

  test('AC-10 rechazo del barbero → reembolso pendiente; el admin reembolsa una sola vez; errores visibles; solo superadmin', async () => {
    const { id, client } = await t.book();
    t.mp.pay(id, { id: '9101', amount: 12000 });
    await t.hook('9101');
    const barber = await t.barberCookie();
    const rej = await t.post(`/api/pro/appointments/${id}/reject`, { reasonCode: 'imprevisto' }, barber);
    assert.equal(rej.status, 200, JSON.stringify(rej.json));
    let a = await t.appt(id);
    assert.equal(a.status, 'cancelada');
    assert.equal(a.payment.status, 'reembolso_pendiente');
    assert.ok(await PanelNotification.exists({ kind: 'refund_due' }));
    assert.equal((await t.get('/api/admin/overview', t.admin.cookie)).json.cards.refundsPending, 1);

    /* Solo superadmin. */
    assert.equal((await t.post(`/api/admin/appointments/${id}/refund`, {}, client.cookie)).status, 403);
    assert.equal((await t.post(`/api/admin/appointments/${id}/refund`, {}, barber)).status, 403);

    /* Error de Mercado Pago → sigue pendiente con el mensaje; se puede reintentar. */
    t.mp.state.failRefund = 'insufficient_amount';
    const fail = await t.post(`/api/admin/appointments/${id}/refund`, {}, t.admin.cookie);
    assert.equal(fail.status, 502);
    a = await t.appt(id);
    assert.equal(a.payment.status, 'reembolso_pendiente');
    assert.match(a.payment.refundError, /insufficient_amount/);
    const sheet = await t.get(`/api/admin/appointments/${id}`, t.admin.cookie);
    assert.match(sheet.json.payment.refundError, /insufficient_amount/);
    assert.equal(sheet.json.canRefund, true);

    /* Doble clic: dos POST en paralelo → una sola llamada al reembolso que funciona. */
    t.mp.state.failRefund = null;
    const before = t.mp.callsTo('POST', /\/refunds$/).length;
    const rs = await Promise.all([t.post(`/api/admin/appointments/${id}/refund`, {}, t.admin.cookie), t.post(`/api/admin/appointments/${id}/refund`, {}, t.admin.cookie)]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(t.mp.callsTo('POST', /\/refunds$/).length - before, 1);
    const call = t.mp.callsTo('POST', /\/refunds$/).at(-1);
    assert.equal(call.path, '/v1/payments/9101/refunds');
    assert.ok(call.headers['x-idempotency-key']);
    a = await t.appt(id);
    assert.equal(a.payment.status, 'reembolsado');
    assert.equal(t.mails(/client_refunded/).length, 1);
    assert.match(t.mails(/client_refunded/)[0].text, /Te devolvimos \$12\.000/);
    /* El webhook "refunded" que manda Mercado Pago después no cambia nada más. */
    await t.hook('9101');
    assert.equal(t.mails(/client_refunded/).length, 1);
    assert.equal((await t.post(`/api/admin/appointments/${id}/refund`, {}, t.admin.cookie)).status, 409);
  });

  test('RN-09 el cliente cancela una cita pagada dentro del plazo → reembolso pendiente; la expiración sin confirmar también', async () => {
    const a = await t.book({ time: '12:00' });
    const b = await t.book({ time: '15:00' });
    t.mp.pay(a.id, { id: '9201', amount: 12000 });
    t.mp.pay(b.id, { id: '9202', amount: 12000 });
    await t.hook('9201');
    await t.hook('9202');
    assert.equal((await t.post(`/api/wstyle/appointments/${a.id}/cancel`, {}, a.client.cookie)).status, 200);
    assert.equal((await t.appt(a.id)).payment.status, 'reembolso_pendiente');
    t.ctx.clock.now = SUNDAY_9AM + 13 * HOUR;
    await t.ctx.app.locals.agenda.runExpirations();
    const eb = await t.appt(b.id);
    assert.equal(eb.status, 'expirada');
    assert.equal(eb.payment.status, 'reembolso_pendiente');
  });

  test('CB-08 dos pestañas pagan la misma cita → el segundo pago queda para reembolso', async () => {
    const { id } = await t.book();
    t.mp.pay(id, { id: '9301', amount: 12000 });
    t.mp.pay(id, { id: '9302', amount: 12000 });
    await t.hook('9301');
    await t.hook('9302');
    const a = await t.appt(id);
    assert.equal(a.payment.status, 'pagado');
    assert.equal(a.payment.mpPaymentId, '9301');
    assert.deepEqual(a.payment.duplicates.map((d) => [d.mpPaymentId, d.status]), [['9302', 'reembolso_pendiente']]);
    assert.ok(await PanelNotification.exists({ kind: 'payment_duplicate' }));
    const r = await t.post(`/api/admin/appointments/${id}/refund`, { paymentId: '9302' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const b = await t.appt(id);
    assert.equal(b.payment.status, 'pagado');
    assert.equal(b.payment.duplicates[0].status, 'reembolsado');
    assert.equal(t.mp.callsTo('POST', /\/refunds$/)[0].path, '/v1/payments/9302/refunds');
  });

  test('AC-02 los secretos no salen por la API ni por los logs', async () => {
    const { id, client } = await t.book();
    t.mp.state.failPreference = 500;
    await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    t.mp.state.failPreference = null;
    const bodies = [];
    bodies.push((await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie)).json);
    t.mp.pay(id, { id: '9401', amount: 12000 });
    bodies.push((await t.hook('9401')).json);
    bodies.push((await t.hook('9401', { headers: { 'x-signature': 'ts=1,v1=00' } })).json);
    for (const path of [`/api/wstyle/appointments/${id}`, '/api/wstyle/catalog', '/api/health', '/api/wstyle/appointments/mine']) bodies.push((await t.get(path, client.cookie)).json);
    for (const path of ['/api/admin/settings', '/api/admin/overview', `/api/admin/appointments/${id}`, '/api/admin/appointments']) bodies.push((await t.get(path, t.admin.cookie)).json);
    const all = JSON.stringify(bodies) + '\n' + t.logs.join('\n');
    for (const secret of [MP_TOKEN, MP_SECRET]) assert.ok(!all.includes(secret), 'filtra un secreto');
    assert.ok(t.logs.length > 0, 'hubo logs que revisar');
    const s = await t.get('/api/admin/settings', t.admin.cookie);
    assert.deepEqual(s.json.mercadoPago, { configured: true, mode: 'sandbox', ready: true });
  });
});

describe('SPEC-35 sin credenciales (AC-11 / CB-09)', () => {
  const t = world({ env: { PUBLIC_SITE_URL: 'https://ricorp.test' } });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('sin MP_ACCESS_TOKEN "Pagar en línea" no se ofrece y el checkout responde 503', async () => {
    const cat = await t.get('/api/wstyle/catalog');
    assert.deepEqual(cat.json.business.payments, { online: false, local: true });
    const c = await makeClient({});
    const r = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at('12:00'), mode: 'shop', acceptPolicies: true, paymentMethod: 'online' }, c.cookie);
    assert.equal(r.status, 400);
    assert.equal(r.json.fields.paymentMethod, 'payment_unavailable');
    const { id, client } = await t.book({ method: 'local' });
    const co = await t.post(`/api/wstyle/appointments/${id}/checkout`, {}, client.cookie);
    assert.equal(co.status, 503);
    assert.equal(co.json.error, 'payments_not_configured');
    const s = await t.get('/api/admin/settings', t.admin.cookie);
    assert.deepEqual(s.json.mercadoPago, { configured: false, mode: null, ready: false });
    /* Webhook sin clave configurada → 401 (nunca se procesa sin verificar). */
    assert.equal((await sendWebhook(t.ctx.base, { dataId: '1', headers: signedHeaders({ dataId: '1', ts: String(t.ctx.clock.now) }) })).status, 401);
    assert.equal(t.mp.calls.length, 0);
  });
});
