/* SPEC-60 AC-01…AC-07: gift cards contra la BD de test real. Mercado Pago es un servicio externo:
   se simula su borde HTTP (test/mp-fake.js); el mailer va en dry-run. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Appointment, AuditLog, Business, GiftCard, PanelNotification, Professional } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { quote } from '../src/domain/pricing.js';
import { coverage, normalizeCode, payableCLP } from '../src/domain/giftcards.js';
import { api, connectDb, DEFAULT_FEES, disconnectDb, HOUR, makeClient, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV, sendWebhook, signedHeaders } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const DAY = 24 * HOUR;
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';

function world({ fees, checkLimit } = {}) {
  const t = { ctx: null, mp: null, seeded: null, admin: null };
  t.boot = async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ pros: [PRO_A, PRO_B], ...(fees ? { fees } : {}) });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': true, 'payments.localEnabled': true, 'giftCards.onlineEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...MP_ENV }, mercadoPagoFetch: t.mp.fetch, ...(checkLimit ? { giftCardCheckLimit: checkLimit } : {}) });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.post = (path, body = {}, cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  t.put = (path, body = {}, cookie) => api(t.ctx.base, 'PUT', path, { body, cookie });
  t.pro = (i = 0) => t.seeded.pros[i];
  t.client = (name = 'Ana Pérez') => makeClient({ name, email: `c${Math.random().toString(36).slice(2, 8)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  t.issue = async (body = {}) => {
    const r = await t.post('/api/admin/gift-cards', { kind: 'monto', amountCLP: 20000, from: 'Camila', to: 'Valentina', message: '¡Feliz cumple!', localMethod: 'efectivo', ...body }, t.admin.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };
  t.book = async ({ time = '12:00', service = 'corte', pro = t.pro(0), method = 'local', code, client, idempotencyKey } = {}) => {
    const c = client || (await t.client());
    const r = await t.post('/api/wstyle/appointments', { serviceId: service, professionalId: String(pro._id), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: method, giftCardCode: code, idempotencyKey }, c.cookie);
    return { ...r, client: c, id: r.json?.id };
  };
  t.card = (code) => GiftCard.findOne({ code: normalizeCode(code) }).lean();
  t.hook = (dataId) => sendWebhook(t.ctx.base, { dataId, headers: signedHeaders({ dataId, ts: String(t.ctx.clock.now) }) });
  t.barberCookie = async (p = t.pro(0)) => {
    const c = await makeClient({ name: p.displayName, email: `s.${Math.random().toString(36).slice(2, 7)}@barberos.test`, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };
  return t;
}

describe('SPEC-60 gift cards', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-02 emisión manual: el super admin emite una tarjeta activa que queda en la rendición; client y barber → 403', async () => {
    const card = await t.issue({ amountCLP: 30000 });
    assert.equal(card.status, 'activa');
    assert.equal(card.balanceCLP, 30000);
    assert.equal(card.origin, 'local');
    assert.match(card.code, /^WS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.notEqual(card.token, card.code);
    /* Vence 12 meses después de la emisión (RN-03). */
    assert.equal(new Date(card.expiresAt).toISOString().slice(0, 10), '2027-11-01');
    assert.ok(await AuditLog.exists({ action: 'giftcard.issue' }));

    const rend = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
    assert.equal(rend.status, 200, JSON.stringify(rend.json));
    const sale = rend.json.sales.find((s) => s.giftCardId === card.id);
    assert.ok(sale, 'la venta de la gift card está en la rendición');
    assert.equal(sale.amountCLP, 30000);
    assert.equal(sale.method, 'efectivo');
    assert.equal(rend.json.totals.approvedCLP, 30000);

    const client = await t.client();
    const barber = await t.barberCookie();
    for (const cookie of [client.cookie, barber]) {
      assert.equal((await t.post('/api/admin/gift-cards', { kind: 'monto', amountCLP: 30000, from: 'A', to: 'B', localMethod: 'efectivo' }, cookie)).status, 403);
      assert.equal((await t.get('/api/admin/gift-cards', cookie)).status, 403);
    }
    assert.equal((await t.get('/api/admin/gift-cards')).status, 401);

    /* RN-10: el body no fija saldo ni estado; validaciones de monto y nombres. */
    const forged = await t.issue({ balanceCLP: 999999, status: 'usada', code: 'WS-AAAA-AAAA' });
    assert.equal(forged.balanceCLP, 20000);
    assert.equal(forged.status, 'activa');
    assert.notEqual(forged.code, 'WS-AAAA-AAAA');
    for (const bad of [{ amountCLP: 4999 }, { amountCLP: 200001 }, { amountCLP: 10000.5 }, { from: '' }, { to: 'x'.repeat(41) }, { message: 'x'.repeat(141) }, { localMethod: 'cheque' }, { kind: 'servicio', serviceId: 'no-existe' }]) {
      const r = await t.post('/api/admin/gift-cards', { kind: 'monto', amountCLP: 20000, from: 'A', to: 'B', localMethod: 'efectivo', ...bad }, t.admin.cookie);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    /* CB-10: el mensaje se guarda como texto plano. */
    const html = await t.issue({ message: '<img src=x onerror=alert(1)>Hola <b>crack</b>' });
    assert.equal(html.message, 'Hola crack');
  });

  test('AC-03 canje: cubre el total, guarda el saldo y el resto se paga en línea por la diferencia', async () => {
    const card = await t.issue({ amountCLP: 20000 });
    /* Corte + barba ($18.000) con una tarjeta de $20.000 → total a pagar $0, saldo $2.000. CB-03: minúsculas sin guiones. */
    const r1 = await t.book({ service: 'corte-barba', code: card.code.toLowerCase().replace(/-/g, '') });
    assert.equal(r1.status, 201, JSON.stringify(r1.json));
    const a1 = await Appointment.findById(r1.id).lean();
    assert.equal(a1.status, 'pendiente');
    assert.equal(a1.giftCard.amountCLP, 18000);
    assert.equal(a1.giftCard.status, 'reservada');
    assert.equal(payableCLP(a1), 0);
    assert.equal(a1.payment.status, 'cobrado');
    assert.equal(r1.json.appointment.pricing.giftCardCLP, 18000);
    assert.equal(r1.json.appointment.pricing.dueCLP, 0);
    assert.equal(r1.json.appointment.giftCard.code, card.code);
    assert.equal((await t.card(card.code)).balanceCLP, 2000);

    /* Corte ($12.000) con saldo $2.000 → resto $10.000 en línea. */
    const r2 = await t.book({ time: '14:00', service: 'corte', code: card.code, method: 'online' });
    assert.equal(r2.status, 201, JSON.stringify(r2.json));
    assert.equal(r2.json.appointment.status, 'pendiente_pago');
    const g = await t.card(card.code);
    assert.equal(g.balanceCLP, 0);
    assert.equal(g.status, 'usada');
    const co = await t.post(`/api/wstyle/appointments/${r2.id}/checkout`, {}, r2.client.cookie);
    assert.equal(co.status, 200, JSON.stringify(co.json));
    const [pref] = t.mp.callsTo('POST', /^\/checkout\/preferences$/);
    assert.equal(pref.body.items[0].unit_price, 10000);
    const paid = t.mp.pay(r2.id, { amount: 10000 });
    assert.equal((await t.hook(paid.id)).status, 200);
    const a2 = await Appointment.findById(r2.id).lean();
    assert.equal(a2.payment.status, 'pagado');
    assert.equal(a2.status, 'pendiente');
    assert.equal(a2.giftCard.status, 'confirmada');

    /* La rendición no cuenta dos veces: la cita de $0 no aparece; la otra cuenta solo los $10.000. */
    const rend = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
    assert.equal(rend.json.totals.approvedCLP, 20000 + 10000);
    assert.ok(!rend.json.sales.some((s) => s.appointmentId === r1.id));

    /* Una tarjeta usada ya no es válida (CB-04). */
    const r3 = await t.book({ time: '16:00', code: card.code });
    assert.equal(r3.status, 409);
    assert.equal(r3.json.message, 'Código no válido');

    /* Al terminar, la cita cubierta no pregunta "¿Cobraste?" y su gift card queda confirmada. */
    const barber = await t.barberCookie();
    assert.equal((await t.post(`/api/wstyle/appointments/${r1.id}/confirm`, {}, barber)).status, 200);
    t.ctx.clock.now = Date.parse(at('13:30'));
    assert.equal((await t.post(`/api/wstyle/appointments/${r1.id}/start`, {}, barber)).status, 200);
    const fin = await t.post(`/api/wstyle/appointments/${r1.id}/finish`, {}, barber);
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    assert.equal((await Appointment.findById(r1.id).lean()).giftCard.status, 'confirmada');
  });

  test('AC-03 gift card de servicio: cubre ese servicio con su tarifa; en otro servicio actúa como monto', async () => {
    const card = await t.issue({ kind: 'servicio', serviceId: 'corte-barba' });
    assert.equal(card.amountCLP, 18000);
    const r = await t.book({ service: 'corte', code: card.code, method: 'online' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    /* Corte $12.000 < $18.000 → cubre todo y quedan $6.000 (CB-09). */
    assert.equal(r.json.appointment.status, 'pendiente');
    assert.equal((await t.card(card.code)).balanceCLP, 6000);
    /* Unit test de la regla con tarifa (RN-04): servicio + su tarifa, sin domicilio. */
    const pricing = quote({ priceCLP: 18000, surchargeCLP: 3000, ...DEFAULT_FEES });
    const svc = coverage({ kind: 'servicio', amountCLP: 18000, balanceCLP: 18000, service: { serviceId: 'x' } }, pricing, 'x');
    assert.equal(svc.amountCLP, quote({ priceCLP: 18000, ...DEFAULT_FEES }).totalCLP);
    assert.equal(svc.debitCLP, 18000);
    const other = coverage({ kind: 'servicio', amountCLP: 18000, balanceCLP: 18000, service: { serviceId: 'x' } }, pricing, 'y');
    assert.equal(other.amountCLP, 18000);
  });

  test('AC-04 concurrencia: varias reservas a la vez con la misma tarjeta → solo una aplica y el saldo nunca es negativo', async () => {
    const card = await t.issue({ amountCLP: 12000 });
    const results = await Promise.all(['12:00', '13:00', '14:00', '15:00', '16:00'].map((time) => t.book({ time, code: card.code })));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    assert.equal(ok.length, 1, JSON.stringify(results.map((r) => [r.status, r.json?.error])));
    assert.equal(rejected.length, 4);
    const g = await t.card(card.code);
    assert.equal(g.balanceCLP, 0);
    assert.equal(g.status, 'usada');
    assert.equal(g.movements.filter((m) => m.kind === 'canje').length, 1);
    assert.equal(await Appointment.countDocuments({ 'giftCard.giftCardId': g._id }), 1);

    /* CB-01: doble clic en confirmar (misma idempotencyKey) → una sola aplicación. */
    const card2 = await t.issue({ amountCLP: 50000 });
    const c = await t.client();
    const [x, y] = await Promise.all([t.book({ time: '17:00', code: card2.code, client: c, idempotencyKey: 'k-1' }), t.book({ time: '17:00', code: card2.code, client: c, idempotencyKey: 'k-1' })]);
    assert.ok([x.status, y.status].includes(201));
    assert.equal((await t.card(card2.code)).balanceCLP, 50000 - 12000);
  });

  test('AC-05 devolución: cancelar, expirar o reembolsar devuelve lo aplicado una sola vez', async () => {
    const card = await t.issue({ amountCLP: 20000 });
    const r = await t.book({ code: card.code });
    assert.equal((await t.card(card.code)).balanceCLP, 8000);
    const c1 = await t.post(`/api/wstyle/appointments/${r.id}/cancel`, { reason: 'No puedo' }, r.client.cookie);
    assert.equal(c1.status, 200, JSON.stringify(c1.json));
    const c2 = await t.post(`/api/wstyle/appointments/${r.id}/cancel`, { reason: 'No puedo' }, r.client.cookie);
    assert.equal(c2.status, 409);
    let g = await t.card(card.code);
    assert.equal(g.balanceCLP, 20000);
    assert.equal(g.movements.filter((m) => m.kind === 'reversion').length, 1);
    assert.equal((await Appointment.findById(r.id).lean()).giftCard.status, 'revertida');
    /* Revert repetido (otra vía) no duplica. */
    assert.equal(await t.ctx.app.locals.giftCards.revert(r.id), false);

    /* Expira sin confirmación del barbero → vuelve. Usada entera → vuelve a activa. */
    const card2 = await t.issue({ amountCLP: 12000 });
    const r2 = await t.book({ time: '13:00', code: card2.code });
    assert.equal((await t.card(card2.code)).status, 'usada');
    t.ctx.clock.now = SUNDAY_9AM + DAY;
    await t.ctx.app.locals.agenda.runExpirations();
    assert.equal((await Appointment.findById(r2.id).lean()).status, 'expirada');
    g = await t.card(card2.code);
    assert.equal(g.balanceCLP, 12000);
    assert.equal(g.status, 'activa');
    t.ctx.clock.now = SUNDAY_9AM;

    /* Resto pagado en línea y reembolsado desde Mercado Pago → la parte de la gift card vuelve. */
    const card3 = await t.issue({ amountCLP: 5000 });
    const r3 = await t.book({ time: '15:00', code: card3.code, method: 'online' });
    assert.equal(r3.status, 201, JSON.stringify(r3.json));
    await t.post(`/api/wstyle/appointments/${r3.id}/checkout`, {}, r3.client.cookie);
    const p = t.mp.pay(r3.id, { amount: 7000 });
    await t.hook(p.id);
    assert.equal((await Appointment.findById(r3.id).lean()).payment.status, 'pagado');
    assert.equal((await t.card(card3.code)).balanceCLP, 0);
    p.status = 'refunded';
    await t.hook(p.id);
    assert.equal((await Appointment.findById(r3.id).lean()).payment.status, 'reembolsado');
    g = await t.card(card3.code);
    assert.equal(g.balanceCLP, 5000);
    assert.equal(g.status, 'activa');

    /* Cita en línea que no se paga: la retención la cancela y la tarjeta recupera el saldo. */
    const card4 = await t.issue({ amountCLP: 5000 });
    const r4 = await t.book({ time: '16:00', code: card4.code, method: 'online' });
    t.ctx.clock.now = SUNDAY_9AM + HOUR;
    await t.ctx.app.locals.payments.runHolds();
    assert.equal((await Appointment.findById(r4.id).lean()).status, 'cancelada');
    assert.equal((await t.card(card4.code)).balanceCLP, 5000);
  });

  test('AC-06 validar códigos: misma respuesta ante inexistente, vencido, anulado o por pagar; minúsculas sin guiones se reconocen', async () => {
    const c = await t.client();
    const card = await t.issue({ amountCLP: 20000, from: 'Camila' });
    const ok = await t.post('/api/wstyle/gift-cards/check', { code: card.code.toLowerCase().replace(/-/g, '') }, c.cookie);
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.code, card.code);
    assert.equal(ok.json.from, 'Camila');
    assert.equal(ok.json.balanceCLP, 20000);
    assert.equal((await t.post('/api/wstyle/gift-cards/check', { code: card.code })).status, 401);

    const voided = await t.issue();
    await t.post(`/api/admin/gift-cards/${voided.id}/void`, { reason: 'Error' }, t.admin.cookie);
    const expired = await t.issue();
    await GiftCard.updateOne({ _id: expired.id }, { $set: { expiresAt: new Date(SUNDAY_9AM - 1000) } });
    const pending = await GiftCard.create({ businessId: (await Business.findOne())._id, code: 'WS-PPPP-PPPP', token: 'x'.repeat(32), kind: 'monto', amountCLP: 10000, balanceCLP: 10000, status: 'pendiente_pago', origin: 'online' });
    const answers = [];
    for (const code of ['WS-ZZZZ-ZZZZ', voided.code, expired.code, pending.code]) {
      const r = await t.post('/api/wstyle/gift-cards/check', { code }, c.cookie);
      answers.push([r.status, r.json.error, r.json.message]);
    }
    assert.deepEqual(answers, Array(4).fill([404, 'giftcard_invalid', 'Código no válido']));
    /* En el panel el admin ve el motivo real (CB-04). */
    const d = await t.get(`/api/admin/gift-cards/${voided.id}`, t.admin.cookie);
    assert.match(d.json.unusableReason, /^Anulada: Error/);
  });

  test('AC-07 anulación (motivo obligatorio y auditada), vencimiento al día 366 y extensión', async () => {
    const card = await t.issue();
    const noReason = await t.post(`/api/admin/gift-cards/${card.id}/void`, {}, t.admin.cookie);
    assert.equal(noReason.status, 400);
    const card2 = await t.issue();
    t.ctx.clock.now = SUNDAY_9AM + 366 * DAY;
    await t.ctx.app.locals.giftCards.runTasks();
    assert.equal((await t.card(card2.code)).status, 'vencida');
    const c = await t.client();
    assert.equal((await t.post('/api/wstyle/gift-cards/check', { code: card2.code }, c.cookie)).status, 404);
    const ext = await t.post(`/api/admin/gift-cards/${card2.id}/extend`, { months: 3 }, t.admin.cookie);
    assert.equal(ext.status, 200, JSON.stringify(ext.json));
    assert.equal(ext.json.status, 'activa');
    assert.equal((await t.post('/api/wstyle/gift-cards/check', { code: card2.code }, c.cookie)).status, 200);
    assert.ok(await AuditLog.exists({ action: 'giftcard.extend' }));

    const v = await t.post(`/api/admin/gift-cards/${card.id}/void`, { reason: 'Vendida por error' }, t.admin.cookie);
    assert.equal(v.status, 200);
    assert.equal(v.json.status, 'anulada');
    assert.ok(await AuditLog.exists({ action: 'giftcard.void', summary: /Vendida por error/ }));
    const list = await t.get('/api/admin/gift-cards?status=anulada', t.admin.cookie);
    assert.deepEqual(list.json.items.map((i) => i.id), [card.id]);
    assert.equal(list.json.counters.anulada, 1);
    const search = await t.get(`/api/admin/gift-cards?q=${card2.code.slice(3, 7).toLowerCase()}`, t.admin.cookie);
    assert.ok(search.json.items.some((i) => i.id === card2.id));
  });
});

describe('SPEC-60 compra en línea (AC-01) y venta apagada (AC-10)', () => {
  const t = world({ fees: DEFAULT_FEES });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 compra: preferencia gc:<id> por valor + tarifa; aprobada con el monto exacto → activa y correo; repetida no cambia; monto distinto → alerta', async () => {
    const buyer = await t.client('Camila');
    const cat = await t.get('/api/wstyle/catalog');
    assert.equal(cat.json.business.giftCards.online, true);
    assert.equal((await t.post('/api/wstyle/gift-cards', { kind: 'monto', amountCLP: 20000, from: 'Camila', to: 'Valentina', email: 'camila@x.test' })).status, 401);
    const r = await t.post('/api/wstyle/gift-cards', { kind: 'monto', amountCLP: 20000, from: 'Camila', to: 'Valentina', message: '¡Feliz cumple!', email: 'camila@x.test', status: 'activa', balanceCLP: 1 }, buyer.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const expected = quote({ priceCLP: 20000, ...DEFAULT_FEES }).totalCLP;
    assert.equal(r.json.pricing.totalCLP, expected);
    let g = await GiftCard.findById(r.json.id).lean();
    assert.equal(g.status, 'pendiente_pago');
    assert.equal(g.balanceCLP, 20000);
    const [pref] = t.mp.callsTo('POST', /^\/checkout\/preferences$/);
    assert.equal(pref.body.external_reference, `gc:${r.json.id}`);
    assert.equal(pref.body.items[0].unit_price, expected);
    assert.ok(pref.body.back_urls.success.startsWith(`https://ricorp.test/wstyle/regalar/?gc=${r.json.id}&pago=`));

    /* Antes de pagar no se ve la tarjeta ni se canjea. */
    assert.equal((await t.get(`/api/wstyle/gift-cards/card?t=${g.token}`)).status, 404);

    /* CB-07: primero pending, después approved → una sola activación. */
    const pend = t.mp.pay(`gc:${r.json.id}`, { status: 'pending', amount: expected });
    await t.hook(pend.id);
    assert.equal((await GiftCard.findById(r.json.id).lean()).status, 'pendiente_pago');
    pend.status = 'approved';
    assert.equal((await t.hook(pend.id)).status, 200);
    g = await GiftCard.findById(r.json.id).lean();
    assert.equal(g.status, 'activa');
    assert.equal(g.balanceCLP, 20000);
    assert.equal(g.payment.mpPaymentId, String(pend.id));
    assert.equal(t.ctx.mailer.outbox.filter((m) => m.template === 'gift_card' && m.to === 'camila@x.test').length, 1);
    await t.hook(pend.id);
    await t.ctx.app.locals.payments.reconcile();
    assert.equal(t.ctx.mailer.outbox.filter((m) => m.template === 'gift_card').length, 1);
    assert.equal((await GiftCard.findById(r.json.id).lean()).movements.filter((m) => m.kind === 'activacion').length, 1);

    /* La vuelta de Mercado Pago consulta el estado y entrega el enlace a la tarjeta. */
    const st = await t.get(`/api/wstyle/gift-cards/${r.json.id}`, buyer.cookie);
    assert.equal(st.json.status, 'activa');
    const view = await t.get(`/api/wstyle/gift-cards/card?t=${st.json.token}`);
    assert.equal(view.status, 200);
    assert.equal(view.json.to, 'Valentina');
    assert.equal(view.json.code, g.code);

    /* La rendición cuenta la venta (valor + tarifa) con el voucher de Mercado Pago. */
    const rend = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
    const sale = rend.json.sales.find((s) => s.giftCardId === r.json.id);
    assert.equal(sale.amountCLP, expected);
    assert.equal(sale.backing, 'voucher_mp');
    assert.equal(rend.json.cuadre.ok, true);

    /* CB-08: monto distinto → no se activa y se alerta. */
    const r2 = await t.post('/api/wstyle/gift-cards', { kind: 'monto', amountCLP: 10000, from: 'A', to: 'B', email: 'a@x.test' }, buyer.cookie);
    const bad = t.mp.pay(`gc:${r2.json.id}`, { amount: 100 });
    await t.hook(bad.id);
    assert.equal((await GiftCard.findById(r2.json.id).lean()).status, 'pendiente_pago');
    assert.ok(await PanelNotification.exists({ kind: 'payment_mismatch' }));

    /* RN-08: más de 24 h sin pagar → descartada (no aparece en "Por pagar"). */
    t.ctx.clock.now = SUNDAY_9AM + 25 * HOUR;
    await GiftCard.collection.updateOne({ _id: new mongoose.Types.ObjectId(r2.json.id) }, { $set: { createdAt: new Date(SUNDAY_9AM) } });
    await t.ctx.app.locals.giftCards.runTasks();
    const list = await t.get('/api/admin/gift-cards', t.admin.cookie);
    assert.equal(list.json.counters.pendiente_pago, 0);
    assert.equal(list.json.counters.activa, 1);

    /* Reembolso de una compra sin usar → anulada. */
    pend.status = 'refunded';
    await t.hook(pend.id);
    assert.equal((await GiftCard.findById(r.json.id).lean()).status, 'anulada');
  });

  test('AC-01 reembolso de una compra ya usada → bloqueada y alerta; los pagos de citas siguen funcionando', async () => {
    const buyer = await t.client('Camila');
    const r = await t.post('/api/wstyle/gift-cards', { kind: 'monto', amountCLP: 50000, from: 'Camila', to: 'Vale', email: 'camila@x.test' }, buyer.cookie);
    const pay = t.mp.pay(`gc:${r.json.id}`, { amount: r.json.pricing.totalCLP });
    await t.hook(pay.id);
    const g = await GiftCard.findById(r.json.id).lean();
    const b = await t.book({ code: g.code });
    assert.equal(b.status, 201, JSON.stringify(b.json));
    pay.status = 'refunded';
    await t.hook(pay.id);
    const after = await GiftCard.findById(r.json.id).lean();
    assert.equal(after.blocked, true);
    assert.ok(await PanelNotification.exists({ kind: 'giftcard_refunded_used' }));
    const c = await t.client();
    assert.equal((await t.post('/api/wstyle/gift-cards/check', { code: g.code }, c.cookie)).status, 404);
  });

  test('AC-10 venta apagada: compra rechazada, catálogo sin venta, el canje sigue funcionando', async () => {
    await Business.updateOne({}, { $set: { 'giftCards.onlineEnabled': false } });
    const cat = await t.get('/api/wstyle/catalog');
    assert.equal(cat.json.business.giftCards.online, false);
    const buyer = await t.client();
    const r = await t.post('/api/wstyle/gift-cards', { kind: 'monto', amountCLP: 20000, from: 'A', to: 'B', email: 'a@x.test' }, buyer.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.message, 'Por ahora las gift cards se venden en el local');
    const card = await t.issue({ amountCLP: 50000 });
    assert.equal((await t.book({ code: card.code })).status, 201);
    /* Ajustes: el interruptor y la vigencia se guardan desde Configuración. */
    const s = await t.put('/api/admin/settings', { giftCards: { onlineEnabled: true, validityMonths: 6 } }, t.admin.cookie);
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.deepEqual(s.json.giftCards, { onlineEnabled: true, validityMonths: 6 });
    assert.equal((await t.put('/api/admin/settings', { giftCards: { validityMonths: 0 } }, t.admin.cookie)).status, 400);
  });
});

describe('SPEC-60 limitador de tasa (AC-06)', () => {
  const t = world({ checkLimit: { max: 3, windowMs: 60_000 } });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('después de N intentos responde 429', async () => {
    const c = await t.client();
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await t.post('/api/wstyle/gift-cards/check', { code: 'WS-ZZZZ-ZZZ' + 'ABCD'[i] }, c.cookie)).status);
    assert.deepEqual(codes, [404, 404, 404, 429]);
  });
});
