/* Convivencia SPEC-57 (puntos) + SPEC-60 (gift cards) + SPEC-54 (lista de espera) contra la BD de test real.
   Mercado Pago se simula en su borde HTTP (test/mp-fake.js); el mailer va en dry-run. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, Business, GiftCard, PointsEntry, PointsWallet, Professional } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { normalizeCode } from '../src/domain/giftcards.js';
import { api, connectDb, disconnectDb, makeClient, PRO_A, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV, sendWebhook, signedHeaders } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time) => new Date(zonedToUtc(MONDAY, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';

describe('puntos + gift cards + lista de espera', () => {
  const t = {};
  before(connectDb);
  after(disconnectDb);
  after(() => t.ctx && stop(t.ctx.server));
  beforeEach(async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ pros: [PRO_A] });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': true, 'payments.localEnabled': true, 'giftCards.onlineEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...MP_ENV }, mercadoPagoFetch: t.mp.fetch });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
    const r = await api(t.ctx.base, 'PUT', '/api/wstyle/points/admin/config', { body: { enabled: true, pointsPer1000: 1 }, cookie: t.admin.cookie });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
  const post = (path, body, cookie = t.admin.cookie) => api(t.ctx.base, 'POST', path, { body: body ?? {}, cookie });
  const get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  const client = () => makeClient({ name: 'Ana Pérez', email: `c${Math.random().toString(36).slice(2, 8)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  const issue = async (amountCLP) => {
    const r = await post('/api/admin/gift-cards', { kind: 'monto', amountCLP, from: 'Camila', to: 'Ana', localMethod: 'efectivo' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.code;
  };
  const card = (code) => GiftCard.findOne({ code: normalizeCode(code) }).lean();
  const book = async (c, { time = '12:00', service = 'corte-barba', method = 'local', code } = {}) => {
    const r = await post('/api/wstyle/appointments', { serviceId: service, professionalId: String(t.seeded.pros[0]._id), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: method, giftCardCode: code }, c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.id;
  };
  const attend = async (id) => {
    assert.equal((await post(`/api/admin/appointments/${id}/confirm`)).status, 200);
    t.ctx.clock.now = (await Appointment.findById(id)).startsAt.getTime();
    assert.equal((await post(`/api/admin/appointments/${id}/start`)).status, 200);
    return post(`/api/admin/appointments/${id}/finish`);
  };

  test('cita pagada entera con gift card: al terminar, la tarjeta queda confirmada y el cliente suma sus puntos', async () => {
    const c = await client();
    const code = await issue(20000);
    const id = await book(c, { code });
    const fin = await attend(id);
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    const a = await Appointment.findById(id).lean();
    assert.equal(a.status, 'terminada');
    assert.equal(a.giftCard.status, 'confirmada');
    assert.equal((await card(code)).balanceCLP, 2000);
    /* Puntos sobre el precio del servicio (RN-02 de SPEC-57): $18.000 × 1 → 18. */
    assert.deepEqual((await PointsEntry.find({ appointmentId: a._id }).lean()).map((e) => [e.type, e.points]), [['ganado', 18]]);
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'client_finished' && m.to === c.user.email);
    assert.match(mail.text, /Sumaste 18 puntos\. Tu saldo: 18 puntos\./);
  });

  test('resto pagado en línea y luego reembolsado: vuelve lo de la gift card y los puntos se revierten una vez', async () => {
    const c = await client();
    const code = await issue(5000);
    const id = await book(c, { code, method: 'online' });
    assert.equal((await post(`/api/wstyle/appointments/${id}/checkout`, {}, c.cookie)).status, 200);
    const p = t.mp.pay(id, { amount: 13000 });
    const hook = () => sendWebhook(t.ctx.base, { dataId: p.id, headers: signedHeaders({ dataId: p.id, ts: String(t.ctx.clock.now) }) });
    assert.equal((await hook()).status, 200);
    assert.equal((await Appointment.findById(id).lean()).payment.status, 'pagado');
    assert.equal((await attend(id)).status, 200);
    assert.equal((await PointsWallet.findOne({ userId: c.user._id })).balance, 18);
    p.status = 'refunded';
    await hook();
    await hook();
    assert.equal((await Appointment.findById(id).lean()).payment.status, 'reembolsado');
    const g = await card(code);
    assert.equal(g.balanceCLP, 5000);
    assert.equal(g.status, 'activa');
    const es = await PointsEntry.find({ userId: c.user._id }).lean();
    assert.deepEqual(es.map((e) => [e.type, e.points]).sort(), [['ganado', 18], ['revertido', -18]]);
    assert.equal((await PointsWallet.findOne({ userId: c.user._id })).balance, 0);
  });

  test('cliente sin presentarse con gift card: no suma puntos y el "no vino" sigue funcionando', async () => {
    const c = await client();
    const code = await issue(20000);
    const id = await book(c, { code });
    const barber = await makeClient({ name: 'Barbero', email: 'b@barberos.test', roles: ['barber'] });
    await Professional.updateOne({ _id: t.seeded.pros[0]._id }, { userId: barber.user._id });
    assert.equal((await post(`/api/wstyle/appointments/${id}/confirm`, {}, barber.cookie)).status, 200);
    t.ctx.clock.now = Date.parse(at('12:20'));
    const ns = await post(`/api/wstyle/appointments/${id}/no-show`, {}, barber.cookie);
    assert.equal(ns.status, 200, JSON.stringify(ns.json));
    assert.equal((await Appointment.findById(id).lean()).status, 'no_asistio');
    assert.equal(await PointsEntry.countDocuments({ userId: c.user._id }), 0);
  });

  test('las rutas de puntos, lista de espera y gift cards conviven bajo /api/wstyle', async () => {
    const c = await client();
    assert.equal((await get('/api/wstyle/points/me', c.cookie)).status, 200);
    assert.equal((await get('/api/wstyle/points/program')).status, 200);
    const w = await get('/api/wstyle/waitlist/mine', c.cookie);
    assert.equal(w.status, 200, JSON.stringify(w.json));
    assert.ok(Array.isArray(w.json.entries));
    const chk = await post('/api/wstyle/gift-cards/check', { code: await issue(10000) }, c.cookie);
    assert.equal(chk.status, 200, JSON.stringify(chk.json));
  });
});
