/* SPEC-57 AC-01…AC-07: puntos por cita y canje de productos, contra la BD de test REAL
   (replica set de un nodo), mailer en dry-run y reloj inyectado. Mercado Pago se simula
   en su borde HTTP (test/mp-fake.js). */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Appointment, AuditLog, Business, Notification, PointsEntry, PointsWallet, Professional, Redemption, RewardProduct, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { CODE_RE, normalizeCode, newCode, pointsFor } from '../src/domain/loyalty.js';
import { api, connectDb, disconnectDb, makeClient, PRO_A, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';
const SERVICES = [
  { id: 'corte', name: 'Corte', priceCLP: 10000, durationMin: 30 },
  { id: 'corte-barba', name: 'Corte + barba', priceCLP: 15000, durationMin: 60 },
];

function world({ online = false } = {}) {
  const t = { ctx: null, seeded: null, admin: null, mp: null };
  t.boot = async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ services: SERVICES, pros: [PRO_A] });
    if (online) await Business.updateOne({}, { $set: { 'payments.onlineEnabled': true, 'payments.localEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: online ? MP_ENV : {}, mercadoPagoFetch: t.mp.fetch });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
    t.business = await Business.findOne({}).lean();
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.req = (method, path, body, cookie = t.admin.cookie) => api(t.ctx.base, method, path, { body: method === 'GET' ? undefined : body ?? {}, cookie });
  t.get = (path, cookie) => t.req('GET', path, undefined, cookie);
  t.post = (path, body, cookie) => t.req('POST', path, body, cookie);
  t.put = (path, body, cookie) => t.req('PUT', path, body, cookie);
  t.pro = () => t.seeded.pros[0];
  t.client = (name = 'Pedro Cliente') => makeClient({ name, email: `p${Math.random().toString(36).slice(2, 8)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  t.config = (body) => t.put('/api/wstyle/points/admin/config', body);
  t.book = async ({ client, service = 'corte-barba', time = '12:00', date = MONDAY, method = 'local' }) => {
    const r = await t.post('/api/wstyle/appointments', { serviceId: service, professionalId: String(t.pro()._id), startsAt: at(time, date), mode: 'shop', acceptPolicies: true, paymentMethod: method }, client.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.id;
  };
  /* Confirmar → iniciar → terminar desde el panel del admin. */
  t.attend = async (id) => {
    let r = await t.post(`/api/admin/appointments/${id}/confirm`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const appt = await Appointment.findById(id);
    t.ctx.clock.now = appt.startsAt.getTime();
    r = await t.post(`/api/admin/appointments/${id}/start`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return t.post(`/api/admin/appointments/${id}/finish`);
  };
  t.barberCookie = async () => {
    const c = await makeClient({ name: 'Barbero A', email: `sesion.${Math.random().toString(36).slice(2, 7)}@barberos.test`, roles: ['barber'] });
    await Professional.updateOne({ _id: t.pro()._id }, { userId: c.user._id });
    return c.cookie;
  };
  t.product = async (body) => {
    const r = await t.post('/api/wstyle/points/admin/products', body);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.product;
  };
  t.give = async (client, points) => {
    const r = await t.post(`/api/wstyle/points/admin/customers/${client.user._id}/adjust`, { points, reason: 'Saldo inicial de prueba' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  };
  t.entries = (filter = {}) => PointsEntry.find(filter).lean();
  return t;
}

describe('AC-02 cálculo de puntos', () => {
  test('vectores de RN-02', () => {
    assert.equal(pointsFor(10000, 1), 10);
    assert.equal(pointsFor(9990, 1), 9);
    assert.equal(pointsFor(50000, 1), 50);
    assert.equal(pointsFor(12500, 1), 12);
    assert.equal(pointsFor(12500, 2), 25);
    assert.equal(pointsFor(15000, 1), 15);
    assert.equal(pointsFor(10000, 0), 0);
    assert.equal(pointsFor(undefined, 1), 0);
  });

  test('código de retiro: formato sin ambiguos y normalización de la búsqueda', () => {
    for (let i = 0; i < 500; i++) assert.match(newCode(), /^WS-[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.equal(normalizeCode('ws 7kq4m9'), 'WS-7KQ4M9');
    assert.equal(normalizeCode('7KQ4M9'), 'WS-7KQ4M9');
    assert.equal(normalizeCode('WS-7KQ4M0'), null);
    assert.equal(normalizeCode('hola'), null);
    assert.ok(CODE_RE.test('WS-7KQ4M9'));
  });
});

describe('SPEC-57 acreditación, cálculo y correos', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 cita web de $15.000 con tasa 1 → un solo ganado +15; repetir no duplica', async () => {
    assert.equal((await t.config({ enabled: true, pointsPer1000: 1 })).status, 200);
    const c = await t.client();
    const id = await t.book({ client: c });
    const r = await t.attend(id);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.status, 'terminada');
    const es = await t.entries({ appointmentId: new Appointment({ _id: id })._id });
    assert.deepEqual(es.map((e) => [e.type, e.points]), [['ganado', 15]]);
    /* Terminar de nuevo → 409, y reintentar la acreditación no duplica. */
    assert.equal((await t.post(`/api/admin/appointments/${id}/finish`)).status, 409);
    const appt = await Appointment.findById(id);
    assert.equal(await t.ctx.app.locals.loyalty.earnForAppointment(t.business, appt), null);
    assert.equal(await PointsEntry.countDocuments({ type: 'ganado' }), 1);
    const me = await t.get('/api/wstyle/points/me', c.cookie);
    assert.equal(me.status, 200);
    assert.equal(me.json.balance, 15);
    assert.equal(me.json.entries[0].label, 'Ganaste');
    assert.match(me.json.entries[0].detail, /Corte \+ barba/);
    /* AC-07: el "Gracias por venir" trae la línea de puntos. */
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'client_finished' && m.to === c.user.email);
    assert.ok(mail, 'sin correo client_finished');
    assert.match(mail.text, /Sumaste 15 puntos\. Tu saldo: 15 puntos\./);
  });

  test('AC-01 citas admin / pro_invite y programa apagado → sin movimiento (ni línea en el correo)', async () => {
    const c = await t.client();
    /* Apagado (default, asunción 1) */
    const off = await t.book({ client: c, time: '12:00' });
    assert.equal((await t.attend(off)).status, 200);
    assert.equal(await PointsEntry.countDocuments({}), 0);
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'client_finished');
    assert.ok(mail);
    assert.doesNotMatch(mail.text, /Sumaste/);

    await t.config({ enabled: true });
    for (const [i, source] of [['14:00', 'admin'], ['16:00', 'pro_invite']].map(([time, s]) => [time, s])) {
      const c2 = await t.client();
      t.ctx.clock.now = SUNDAY_9AM;
      const id = await t.book({ client: c2, time: i });
      await Appointment.updateOne({ _id: id }, { $set: { source } });
      assert.equal((await t.attend(id)).status, 200);
    }
    assert.equal(await PointsEntry.countDocuments({}), 0);
  });

  test('AC-02 domicilio y tarifa de servicio no suman; tasa 2 y tasa 0', async () => {
    const loyalty = t.ctx.app.locals.loyalty;
    const c = await t.client();
    const fake = (priceCLP, extra = {}) => new Appointment({ businessId: t.business._id, professionalId: t.pro()._id, customerUserId: c.user._id, source: 'web', status: 'terminada', startsAt: new Date(), endsAt: new Date(), pricing: { priceCLP, ...extra } });
    await t.config({ enabled: true, pointsPer1000: 1 });
    /* CB-03: servicio $10.000 + domicilio $5.000 + tarifa → 10 */
    assert.deepEqual(await loyalty.earnForAppointment(t.business, fake(10000, { surchargeCLP: 5000, serviceFeeCLP: 1650, totalCLP: 16650 })), { points: 10, rate: 1 });
    assert.equal((await loyalty.earnForAppointment(t.business, fake(9990))).points, 9);
    await t.config({ pointsPer1000: 2 });
    assert.equal((await loyalty.earnForAppointment(t.business, fake(12500))).points, 25);
    await t.config({ pointsPer1000: 0 });
    assert.equal(await loyalty.earnForAppointment(t.business, fake(50000)), null);
    assert.deepEqual((await t.entries()).map((e) => e.points).sort((a, b) => a - b), [9, 10, 25]);
    assert.equal(await loyalty.balanceOf(t.business._id, c.user._id), 44);
    /* Pago ya reembolsado antes de terminar → no da puntos (RN-06). */
    assert.equal(await loyalty.earnForAppointment(t.business, fake(20000, {}) .set('payment.status', 'reembolsado')), null);
    /* Cuenta eliminada → no da puntos (RN-01). */
    await t.config({ pointsPer1000: 1 });
    await User.updateOne({ _id: c.user._id }, { status: 'deleted' });
    assert.equal(await loyalty.earnForAppointment(t.business, fake(20000)), null);
  });

  test('config: validación y auditoría', async () => {
    assert.equal((await t.config({ pointsPer1000: 101 })).status, 400);
    assert.equal((await t.config({ pointsPer1000: 1.5 })).status, 400);
    assert.equal((await t.config({ enabled: 'si' })).status, 400);
    assert.equal((await t.config({ secret: 1 })).status, 400);
    const r = await t.config({ enabled: true, pointsPer1000: 3 });
    assert.deepEqual([r.json.enabled, r.json.pointsPer1000], [true, 3]);
    assert.deepEqual((await t.get('/api/wstyle/points/program', null)).json, { enabled: true });
    assert.ok(await AuditLog.exists({ action: 'points.config' }));
  });
});

describe('SPEC-57 AC-03 reversión', () => {
  const t = world({ online: true });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('pago reembolsado (applyPayment con el MP fake) → revertido −N una sola vez', async () => {
    await t.config({ enabled: true });
    const c = await t.client();
    const id = await t.book({ client: c, method: 'online' });
    const payments = t.ctx.app.locals.payments;
    assert.equal(await payments.applyPayment(t.mp.pay(id, { id: '9101', amount: 15000 }), 'webhook'), 'paid');
    assert.equal((await t.attend(id)).status, 200);
    assert.equal((await PointsWallet.findOne({ userId: c.user._id })).balance, 15);
    assert.equal(await payments.applyPayment(t.mp.pay(id, { id: '9101', status: 'refunded', amount: 15000 }), 'webhook'), 'refunded');
    let es = await t.entries({ userId: c.user._id });
    assert.deepEqual(es.map((e) => [e.type, e.points]).sort(), [['ganado', 15], ['revertido', -15]]);
    /* Mismo evento otra vez y luego un contracargo → no hay un segundo revertido. */
    assert.equal(await payments.applyPayment(t.mp.pay(id, { id: '9101', status: 'refunded', amount: 15000 }), 'reconcile'), 'duplicate');
    await payments.applyPayment(t.mp.pay(id, { id: '9101', status: 'charged_back', amount: 15000 }), 'webhook');
    es = await t.entries({ userId: c.user._id });
    assert.equal(es.filter((e) => e.type === 'revertido').length, 1);
    assert.equal((await PointsWallet.findOne({ userId: c.user._id })).balance, 0);
    /* Manual sobre la misma cita: no cambia nada. */
    const r = await t.post(`/api/wstyle/points/admin/appointments/${id}/revert`, { reason: 'Error de cobro' });
    assert.equal(r.status, 200);
    assert.equal(r.json.changed, false);
  });

  test('[Revertir puntos] manual: sin motivo 400; con motivo OK; repetir no cambia nada', async () => {
    await t.config({ enabled: true });
    const c = await t.client();
    const id = await t.book({ client: c, method: 'local' });
    assert.equal((await t.attend(id)).status, 200);
    assert.equal((await t.post(`/api/wstyle/points/admin/appointments/${id}/revert`, {})).status, 400);
    let r = await t.post(`/api/wstyle/points/admin/appointments/${id}/revert`, { reason: 'Cita mal terminada' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.changed, r.json.points, r.json.balance], [true, -15, 0]);
    r = await t.post(`/api/wstyle/points/admin/appointments/${id}/revert`, { reason: 'Otra vez' });
    assert.deepEqual([r.json.changed, r.json.balance], [false, 0]);
    assert.equal(await PointsEntry.countDocuments({ type: 'revertido' }), 1);
    assert.ok(await AuditLog.exists({ action: 'points.revert' }));
    assert.deepEqual((await t.get(`/api/wstyle/points/admin/appointments/${id}`)).json, { earned: 15, reverted: true, revertedAt: new Date(t.ctx.clock.now).toISOString() });
  });

  test('CB-06 reversión de puntos ya canjeados → saldo negativo y sin canje posible', async () => {
    await t.config({ enabled: true });
    const c = await t.client();
    const id = await t.book({ client: c, method: 'local' });
    assert.equal((await t.attend(id)).status, 200);
    const p = await t.product({ name: 'Peineta', costPoints: 10 });
    assert.equal((await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)).status, 201);
    await t.post(`/api/wstyle/points/admin/appointments/${id}/revert`, { reason: 'Reembolso manual' });
    const me = await t.get('/api/wstyle/points/me', c.cookie);
    assert.equal(me.json.balance, -10);
    const r = await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'not_enough_points');
  });
});

describe('SPEC-57 canjes', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-04 saldo 130, producto de 120 con stock 1 → 201, saldo 10, stock 0, código; segundo → 409', async () => {
    const c = await t.client();
    await t.give(c, 130);
    const p = await t.product({ name: 'Cera mate', costPoints: 120, stock: 1, description: 'Fijación media' });
    const r = await t.post('/api/wstyle/points/redeem', { productId: p.id, idempotencyKey: 'k1' }, c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.match(r.json.redemption.code, /^WS-[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.equal(r.json.redemption.status, 'pendiente_retiro');
    assert.equal(r.json.balance, 10);
    assert.equal((await RewardProduct.findById(p.id)).stock, 0);
    /* Doble clic con la misma confirmación → el mismo canje (CB-04). */
    const again = await t.post('/api/wstyle/points/redeem', { productId: p.id, idempotencyKey: 'k1' }, c.cookie);
    assert.equal(again.status, 200);
    assert.equal(again.json.redemption.id, r.json.redemption.id);
    const second = await t.post('/api/wstyle/points/redeem', { productId: p.id, idempotencyKey: 'k2' }, c.cookie);
    assert.equal(second.status, 409);
    const me = await t.get('/api/wstyle/points/me', c.cookie);
    assert.equal(me.json.balance, 10);
    assert.equal(me.json.redemptions.length, 1);
    assert.equal(me.json.redemptions[0].code, r.json.redemption.code);
    /* El saldo es la suma del libro. */
    const sum = (await t.entries({ userId: c.user._id })).reduce((a, e) => a + e.points, 0);
    assert.equal(sum, 10);
    /* AC-07: correo con el código */
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'client_points_redeemed');
    assert.ok(mail && mail.text.includes(r.json.redemption.code));
    assert.ok(await Notification.exists({ template: 'client_points_redeemed', to: c.user.email }));
  });

  test('AC-04 dos canjes simultáneos con saldo para uno solo → exactamente uno OK', async () => {
    const c = await t.client();
    await t.give(c, 130);
    const p = await t.product({ name: 'Cera mate', costPoints: 120 });
    const rs = await Promise.all([1, 2, 3].map((i) => t.post('/api/wstyle/points/redeem', { productId: p.id, idempotencyKey: `par-${i}` }, c.cookie)));
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
    assert.equal(await Redemption.countDocuments({}), 1);
    assert.equal((await PointsWallet.findOne({ userId: c.user._id })).balance, 10);
  });

  test('CB-05 stock 1 y dos clientes a la vez → uno OK y el otro 409 "Se agotó"', async () => {
    const [a, b] = [await t.client('Ana'), await t.client('Beto')];
    await t.give(a, 500);
    await t.give(b, 500);
    const p = await t.product({ name: 'Shampoo', costPoints: 100, stock: 1 });
    const rs = await Promise.all([a, b].map((c) => t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)));
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
    assert.equal(rs.find((r) => r.status === 409).json.message, 'Se agotó');
    assert.equal((await RewardProduct.findById(p.id)).stock, 0);
    assert.equal(await Redemption.countDocuments({}), 1);
    const balances = (await PointsWallet.find({}).lean()).map((w) => w.balance).sort();
    assert.deepEqual(balances, [400, 500]);
  });

  test('AC-05 entrega y anulación (barbero), estados finales, client 403, auditoría', async () => {
    const c = await t.client();
    await t.give(c, 300);
    const p = await t.product({ name: 'Cera mate', costPoints: 120, stock: 5 });
    const r1 = (await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)).json.redemption;
    const r2 = (await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)).json.redemption;
    const barber = await t.barberCookie();
    /* Client → 403 en todo lo del equipo */
    assert.equal((await t.get('/api/wstyle/points/redemptions', c.cookie)).status, 403);
    assert.equal((await t.post(`/api/wstyle/points/redemptions/${r1.id}/deliver`, {}, c.cookie)).status, 403);
    assert.equal((await t.post(`/api/wstyle/points/redemptions/${r1.id}/cancel`, { reason: 'x' }, c.cookie)).status, 403);
    /* Búsqueda por código (minúsculas y sin guion) */
    const found = await t.get(`/api/wstyle/points/redemptions?q=${r1.code.slice(3).toLowerCase()}`, barber);
    assert.equal(found.status, 200);
    assert.deepEqual(found.json.items.map((x) => x.id), [r1.id]);
    assert.equal(found.json.items[0].customer.name, 'Pedro Cliente');
    /* CB-08 */
    assert.deepEqual((await t.get('/api/wstyle/points/redemptions?q=WS-ZZZZZZ', barber)).json.items, []);
    assert.equal((await t.get('/api/wstyle/points/redemptions', barber)).json.items.length, 2);
    /* Entregar */
    const d = await t.post(`/api/wstyle/points/redemptions/${r1.id}/deliver`, {}, barber);
    assert.equal(d.status, 200, JSON.stringify(d.json));
    assert.equal(d.json.redemption.status, 'entregado');
    /* CB-07: anular un entregado → 409 con el estado; entregar otra vez → 409 */
    let x = await t.post(`/api/wstyle/points/redemptions/${r1.id}/cancel`, { reason: 'Error' }, barber);
    assert.equal(x.status, 409);
    assert.equal(x.json.status, 'entregado');
    assert.equal((await t.post(`/api/wstyle/points/redemptions/${r1.id}/deliver`, {}, barber)).status, 409);
    /* Anular sin motivo → 400; con motivo → anulado, devuelto +120, stock repuesto */
    assert.equal((await t.post(`/api/wstyle/points/redemptions/${r2.id}/cancel`, {}, barber)).status, 400);
    const stockBefore = (await RewardProduct.findById(p.id)).stock;
    x = await t.post(`/api/wstyle/points/redemptions/${r2.id}/cancel`, { reason: 'Sin stock físico' }, barber);
    assert.equal(x.status, 200, JSON.stringify(x.json));
    assert.equal(x.json.redemption.status, 'anulado');
    assert.equal((await RewardProduct.findById(p.id)).stock, stockBefore + 1);
    const dev = await PointsEntry.findOne({ type: 'devuelto' }).lean();
    assert.equal(dev.points, 120);
    assert.equal((await t.get('/api/wstyle/points/me', c.cookie)).json.balance, 300 - 240 + 120);
    /* Entregar un anulado → 409 */
    x = await t.post(`/api/wstyle/points/redemptions/${r2.id}/deliver`, {}, barber);
    assert.equal(x.status, 409);
    assert.equal(x.json.status, 'anulado');
    assert.ok(await AuditLog.exists({ action: 'points.redemption_deliver' }));
    assert.ok(await AuditLog.exists({ action: 'points.redemption_cancel' }));
    assert.ok(t.ctx.mailer.outbox.some((m) => m.template === 'client_points_cancelled' && m.text.includes('Sin stock físico')));
    /* El admin también ve la lista */
    assert.equal((await t.get('/api/wstyle/points/redemptions?status=all')).json.items.length, 2);
  });

  test('CB-10 producto desactivado: no se puede canjear, pero los canjes pendientes se entregan; con canjes no se borra', async () => {
    const c = await t.client();
    await t.give(c, 300);
    const p = await t.product({ name: 'Cera', costPoints: 100 });
    const red = (await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)).json.redemption;
    const del = await t.req('DELETE', `/api/wstyle/points/admin/products/${p.id}`);
    assert.deepEqual(del.json, { result: 'deactivated' });
    assert.equal((await t.get('/api/wstyle/points/products', null)).json.items.length, 0);
    assert.equal((await t.post('/api/wstyle/points/redeem', { productId: p.id }, c.cookie)).status, 409);
    assert.equal((await t.post(`/api/wstyle/points/redemptions/${red.id}/deliver`)).status, 200);
    const q = await t.product({ name: 'Sin canjes', costPoints: 5 });
    assert.deepEqual((await t.req('DELETE', `/api/wstyle/points/admin/products/${q.id}`)).json, { result: 'deleted' });
  });

  test('productos: validación, foto (CB-11), orden y catálogo público', async () => {
    assert.equal((await t.post('/api/wstyle/points/admin/products', { name: 'X', costPoints: 0 })).status, 400);
    assert.equal((await t.post('/api/wstyle/points/admin/products', { name: 'X', costPoints: 100001 })).status, 400);
    assert.equal((await t.post('/api/wstyle/points/admin/products', { name: 'X', costPoints: 10, stock: -1 })).status, 400);
    assert.equal((await t.post('/api/wstyle/points/admin/products', { name: '', costPoints: 10 })).status, 400);
    const send = async (file, fields = {}) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      if (file) fd.append('photo', new Blob([file.buf], { type: file.type }), file.name);
      const res = await fetch(`${t.ctx.base}/api/wstyle/points/admin/products`, { method: 'POST', body: fd, headers: { Cookie: t.admin.cookie } });
      return { status: res.status, json: await res.json() };
    };
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#B8875A' } }).png().toBuffer();
    const ok = await send({ buf: png, type: 'image/png', name: 'cera.png' }, { name: 'Cera mate', costPoints: '120', stock: '10', description: 'Fijación media' });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.match(ok.json.product.photo, /^\/api\/wstyle\/photos\/[a-f0-9]{24}$/);
    assert.equal(ok.json.product.stock, 10);
    assert.equal((await fetch(t.ctx.base + ok.json.product.photo)).headers.get('content-type'), 'image/webp');
    const bad = await send({ buf: Buffer.from('no soy una imagen, soy texto plano'), type: 'image/png', name: 'x.png' }, { name: 'Malo', costPoints: '10' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'invalid_image');
    const big = await send({ buf: Buffer.alloc(5 * 1024 * 1024 + 10, 1), type: 'image/png', name: 'big.png' }, { name: 'Grande', costPoints: '10' });
    assert.equal(big.status, 400);
    assert.equal(big.json.error, 'photo_too_large');
    const second = await t.product({ name: 'Shampoo', costPoints: 80 });
    const ord = await t.put('/api/wstyle/points/admin/products/order', { ids: [second.id, ok.json.product.id] });
    assert.equal(ord.status, 200);
    const pub = await t.get('/api/wstyle/points/products', null);
    assert.deepEqual(pub.json.items.map((x) => x.name), ['Shampoo', 'Cera mate']);
    /* Editar: desactivar con PATCH */
    const patch = await t.req('PATCH', `/api/wstyle/points/admin/products/${second.id}`, { active: false, stock: '' });
    assert.equal(patch.status, 200, JSON.stringify(patch.json));
    assert.deepEqual([patch.json.product.active, patch.json.product.stock], [false, null]);
    assert.deepEqual((await t.get('/api/wstyle/points/products', null)).json.items.map((x) => x.name), ['Cera mate']);
    assert.ok(await AuditLog.exists({ action: 'points.product_create' }));
    assert.ok(await AuditLog.exists({ action: 'points.product_deactivate' }));
  });

  test('AC-06 ajuste y autorización', async () => {
    const c = await t.client();
    const other = await t.client('Otra');
    const barber = await t.barberCookie();
    const adj = (body, cookie) => t.post(`/api/wstyle/points/admin/customers/${c.user._id}/adjust`, body, cookie);
    assert.equal((await adj({ points: 10 })).status, 400);
    assert.equal((await adj({ points: 10, reason: 'abc' })).status, 400);
    assert.equal((await adj({ points: 0, reason: 'Regalo de cumpleaños' })).status, 400);
    assert.equal((await adj({ points: 1.5, reason: 'Regalo de cumpleaños' })).status, 400);
    for (const cookie of [c.cookie, barber]) {
      assert.equal((await adj({ points: 10, reason: 'Regalo de cumpleaños' }, cookie)).status, 403);
      assert.equal((await t.post('/api/wstyle/points/admin/products', { name: 'X', costPoints: 10 }, cookie)).status, 403);
      assert.equal((await t.put('/api/wstyle/points/admin/config', { enabled: true }, cookie)).status, 403);
    }
    assert.equal((await adj({ points: 10, reason: 'Regalo de cumpleaños' }, null)).status, 401);
    const ok = await adj({ points: -5, reason: 'Corrección de un canje' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.balance, -5);
    assert.ok(await AuditLog.exists({ action: 'points.adjust' }));
    /* Ledger: el propio sí, el de otro → 404; el admin ve cualquiera. */
    assert.equal((await t.get(`/api/wstyle/points/customers/${c.user._id}/ledger`, c.cookie)).status, 200);
    assert.equal((await t.get(`/api/wstyle/points/customers/${c.user._id}/ledger`, other.cookie)).status, 404);
    assert.equal((await t.get(`/api/wstyle/points/customers/${c.user._id}/ledger`, barber)).status, 404);
    const led = await t.get(`/api/wstyle/points/customers/${c.user._id}/ledger`);
    assert.equal(led.json.balance, -5);
    assert.equal(led.json.entries[0].type, 'ajuste');
    /* Buscar clientes */
    const found = await t.get('/api/wstyle/points/admin/customers?q=pedro');
    assert.ok(found.json.items.some((x) => x.id === String(c.user._id) && x.balance === -5));
    /* Anónimo: catálogo y programa sí; /me no. */
    assert.equal((await t.get('/api/wstyle/points/products', null)).status, 200);
    assert.equal((await t.get('/api/wstyle/points/me', null)).status, 401);
    assert.equal((await t.post('/api/wstyle/points/redeem', {}, null)).status, 401);
  });
});
