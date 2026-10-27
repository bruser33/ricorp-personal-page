/* SPEC-38: desglose "como Uber" (tarifa de servicio = administración + costo de pagos, igual en el local o en
   línea), puerta de sesión, monto de Mercado Pago, configuración y migración de defaults. BD de test real;
   Mercado Pago es externo y se simula su borde HTTP (test/mp-fake.js). */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, Business, PlatformSettings } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { breakdownLines, effectivePaymentPpm, ensurePlatformDefaults, grossUpFee, quote } from '../src/domain/pricing.js';
import { saleLines } from '../src/domain/tax.js';
import { api, connectDb, DEFAULT_FEES, disconnectDb, makeClient, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV, sendWebhook, signedHeaders } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';
const RATES = { platformFeeRate: 0.1, paymentFeeRate: 0.0319, paymentFeeVat: true };

/* Vectores compartidos con client/src/wstyle/agenda/pricing.test.ts (deben dar lo mismo). */
export const VECTORS = [
  { in: { priceCLP: 12000, surchargeCLP: 0, ...RATES }, out: { platformFeeCLP: 1200, paymentFeeCLP: 521, serviceFeeCLP: 1721, totalCLP: 13721, barberCLP: 12000 } },
  { in: { priceCLP: 12000, surchargeCLP: 3000, ...RATES }, out: { platformFeeCLP: 1500, paymentFeeCLP: 652, serviceFeeCLP: 2152, totalCLP: 17152, barberCLP: 15000 } },
  { in: { priceCLP: 18000, surchargeCLP: 0, ...RATES }, out: { platformFeeCLP: 1800, paymentFeeCLP: 782, serviceFeeCLP: 2582, totalCLP: 20582, barberCLP: 18000 } },
  { in: { priceCLP: 12000, surchargeCLP: 0, platformFeeRate: 0.1, paymentFeeRate: 0.0319, paymentFeeVat: false }, out: { platformFeeCLP: 1200, paymentFeeCLP: 435, serviceFeeCLP: 1635, totalCLP: 13635, barberCLP: 12000 } },
  { in: { priceCLP: 12345, surchargeCLP: 0, platformFeeRate: 0.1, paymentFeeRate: 0, paymentFeeVat: true }, out: { platformFeeCLP: 1235, paymentFeeCLP: 0, serviceFeeCLP: 1235, totalCLP: 13580, barberCLP: 12345 } },
  { in: { priceCLP: 12000, surchargeCLP: 0, platformFeeRate: 0, paymentFeeRate: 0, paymentFeeVat: true }, out: { platformFeeCLP: 0, paymentFeeCLP: 0, serviceFeeCLP: 0, totalCLP: 12000, barberCLP: 12000 } },
];

describe('SPEC-38 desglose (matemática)', () => {
  test('AC-03 vectores: administración, costo de pagos, tarifa de servicio y total', () => {
    for (const v of VECTORS) {
      const q = quote(v.in);
      for (const [k, want] of Object.entries(v.out)) assert.equal(q[k], want, `${JSON.stringify(v.in)} ${k}`);
      assert.equal(q.totalCLP, q.priceCLP + q.surchargeCLP + q.platformFeeCLP + q.paymentFeeCLP, 'total = suma de líneas');
      assert.equal(q.serviceFeeCLP, q.platformFeeCLP + q.paymentFeeCLP);
      assert.equal(q.feesIncluded, true);
    }
  });

  test('"como Uber": el total es el mismo pagando en el local o en línea', () => {
    for (const v of VECTORS) {
      const local = quote({ ...v.in, method: 'local' });
      const online = quote({ ...v.in, method: 'online' });
      assert.equal(local.totalCLP, online.totalCLP);
      assert.equal(local.paymentFeeCLP, online.paymentFeeCLP);
      assert.deepEqual([local.paymentMethod, online.paymentMethod], ['local', 'online']);
    }
  });

  test('ejemplo resuelto de la spec: 13.200 / (1 − 0,037961) → 13.721', () => {
    assert.equal(effectivePaymentPpm(0.0319, true), 37961);
    assert.equal(effectivePaymentPpm(0.0319, false), 31900);
    assert.equal(grossUpFee(13200, 37961), 521);
    assert.equal(grossUpFee(0, 37961), 0);
    assert.equal(grossUpFee(13200, 0), 0);
  });

  test('el costo de pagos deja siempre al negocio ≥ base después de la comisión, sin sobrar un peso', () => {
    for (let base = 1000; base <= 200000; base += 137) {
      for (const ppm of [31900, 37961, 49900]) {
        const total = base + grossUpFee(base, ppm);
        assert.ok(total - (total * ppm) / 1e6 >= base - 1e-9, `base ${base} ppm ${ppm}`);
        assert.ok(total - 1 - ((total - 1) * ppm) / 1e6 < base, `mínimo: base ${base} ppm ${ppm}`);
      }
    }
  });

  test('líneas: el cliente ve una sola "Tarifa de servicio"; el admin y la venta SII, las dos partes', () => {
    const p = quote({ priceCLP: 12000, surchargeCLP: 3000, ...RATES });
    const client = breakdownLines(p, 'Corte');
    assert.deepEqual(client.lines.map((l) => [l.kind, l.amountCLP]), [['service', 12000], ['home_surcharge', 3000], ['service_fee', 2152]]);
    assert.equal(client.lines[2].label, 'Tarifa de servicio');
    assert.equal(client.lines[2].hint, 'administración 10 % + costo de pagos');
    const sale = saleLines(p, 'Corte');
    assert.deepEqual(sale.map((l) => [l.kind, l.amountCLP]), [['service', 12000], ['home_surcharge', 3000], ['platform_fee', 1500], ['payment_fee', 652]]);
    assert.equal(sale.reduce((a, l) => a + l.amountCLP, 0), p.totalCLP);
    /* Cita antigua (sin feesIncluded): como antes. */
    assert.deepEqual(saleLines({ priceCLP: 12000, surchargeCLP: 0, totalCLP: 12000, platformFeeCLP: 1200 }, 'Corte').map((l) => l.amountCLP), [12000]);
  });
});

describe('SPEC-38 migración de defaults (RN-09)', () => {
  before(connectDb);
  after(disconnectDb);
  beforeEach(resetDb);

  test('AC-07 crea los defaults si no hay documento', async () => {
    assert.deepEqual(await ensurePlatformDefaults(), { created: true, migrated: false });
    const s = await PlatformSettings.findOne({ key: 'default' }).lean();
    assert.deepEqual([s.defaultPlatformFeeRate, s.paymentFeeRate, s.paymentFeeVat, s.appliedDefaults], [0.1, 0.0319, true, ['spec38']]);
  });

  test('AC-07 sube 0 % → 10 % una sola vez; respeta un 5 % existente; después respeta un 0 % del admin', async () => {
    await PlatformSettings.collection.insertOne({ key: 'default', defaultPlatformFeeRate: 0, paymentProviders: [] });
    assert.equal((await ensurePlatformDefaults()).migrated, true);
    let s = await PlatformSettings.findOne({ key: 'default' }).lean();
    assert.deepEqual([s.defaultPlatformFeeRate, s.paymentFeeRate, s.paymentFeeVat], [0.1, 0.0319, true]);
    /* El admin decide 0 % después: reiniciar no lo pisa. */
    await PlatformSettings.updateOne({ key: 'default' }, { $set: { defaultPlatformFeeRate: 0 } });
    assert.equal((await ensurePlatformDefaults()).migrated, false);
    s = await PlatformSettings.findOne({ key: 'default' }).lean();
    assert.equal(s.defaultPlatformFeeRate, 0);

    await resetDb();
    await PlatformSettings.collection.insertOne({ key: 'default', defaultPlatformFeeRate: 0.05, paymentFeeRate: 0.02, paymentFeeVat: false });
    await ensurePlatformDefaults();
    s = await PlatformSettings.findOne({ key: 'default' }).lean();
    assert.deepEqual([s.defaultPlatformFeeRate, s.paymentFeeRate, s.paymentFeeVat], [0.05, 0.02, false]);
  });

  test('CB-10 dos arranques a la vez no duplican ni fallan', async () => {
    await Promise.all([ensurePlatformDefaults(), ensurePlatformDefaults(), ensurePlatformDefaults()]);
    assert.equal(await PlatformSettings.countDocuments({}), 1);
  });
});

describe('SPEC-38 reserva con los defaults reales', () => {
  const t = { ctx: null, mp: null, seeded: null, admin: null };
  before(connectDb);
  after(disconnectDb);
  beforeEach(async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ pros: [PRO_A, PRO_B], fees: DEFAULT_FEES });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': true, 'payments.localEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...MP_ENV }, mercadoPagoFetch: t.mp.fetch, geocoder: async () => ({ lat: -33.4378, lng: -70.6506 + 5 / 92.83, formatted: '5 km' }) });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  });
  after(async () => t.ctx && stop(t.ctx.server));

  const post = (path, body, cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  const get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  const booking = (over = {}) => ({ serviceId: 'corte', professionalId: String(t.seeded.pros[0]._id), startsAt: at('12:00'), mode: 'shop', acceptPolicies: true, paymentMethod: 'local', ...over });
  const client = () => makeClient({ email: `c${Math.random().toString(36).slice(2, 8)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  const hook = (dataId) => sendWebhook(t.ctx.base, { dataId, headers: signedHeaders({ dataId, ts: String(t.ctx.clock.now) }) });

  test('AC-01 sin sesión → 401 y no se crea nada', async () => {
    const r = await post('/api/wstyle/appointments', booking());
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'unauthorized');
    assert.equal(await Appointment.countDocuments({}), 0);
  });

  test('RN-20 el catálogo expone las tasas vigentes', async () => {
    const cat = await get('/api/wstyle/catalog');
    assert.deepEqual(cat.json.business.pricing, { platformFeePercent: 10, paymentFeePercent: 3.19, paymentFeeVat: true });
    assert.equal(cat.json.services.find((s) => s.id === 'corte').priceCLP, 12000);
  });

  test('AC-04 en el local: total $13.721 con la tarifa de servicio congelada; cambiar las tasas no la toca', async () => {
    const c = await client();
    const r = await post('/api/wstyle/appointments', booking(), c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const p = r.json.appointment.pricing;
    assert.deepEqual([p.priceCLP, p.serviceFeeCLP, p.platformFeeCLP, p.paymentFeeCLP, p.totalCLP, p.barberCLP, p.platformFeePercent], [12000, 1721, 1200, 521, 13721, 12000, 10]);
    const stored = (await Appointment.findById(r.json.id)).pricing;
    assert.deepEqual([stored.platformFeeRate, stored.paymentFeeRate, stored.paymentFeeVat, stored.paymentMethod, stored.feesIncluded], [0.1, 0.0319, true, 'local', true]);
    /* El correo al cliente lleva el desglose con una sola tarifa; el del barbero, además su parte. */
    const toClient = t.ctx.mailer.outbox.find((m) => m.to === c.user.email);
    assert.match(toClient.text, /Corte: \$12\.000/);
    assert.match(toClient.text, /Tarifa de servicio: \$1\.721 \(administración 10 % \+ costo de pagos\)/);
    assert.match(toClient.text, /Total: \$13\.721/);
    const toBarber = t.ctx.mailer.outbox.find((m) => m.to === PRO_A.email);
    assert.match(toBarber.text, /Tu parte \(servicio\): \$12\.000/);

    const s = await api(t.ctx.base, 'PUT', '/api/admin/settings', { body: { platformFeePercent: 20, paymentFeePercent: 5 }, cookie: t.admin.cookie });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    const view = await get(`/api/wstyle/appointments/${r.json.id}`, c.cookie);
    assert.equal(view.json.pricing.totalCLP, 13721);
    /* Una cita nueva sí usa las tasas nuevas. */
    const r2 = await post('/api/wstyle/appointments', booking({ startsAt: at('15:00') }), (await client()).cookie);
    assert.equal(r2.json.appointment.pricing.platformFeeCLP, 2400);
  });

  test('AC-05 en línea: mismo total, la preferencia de Mercado Pago es $13.721 y solo ese monto la paga', async () => {
    const c = await client();
    const r = await post('/api/wstyle/appointments', booking({ paymentMethod: 'online' }), c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.appointment.pricing.totalCLP, 13721);
    const co = await post(`/api/wstyle/appointments/${r.json.id}/checkout`, {}, c.cookie);
    assert.equal(co.status, 200, JSON.stringify(co.json));
    const [call] = t.mp.callsTo('POST', /^\/checkout\/preferences$/);
    assert.deepEqual(call.body.items.map((i) => i.unit_price), [13721]);

    /* Un pago por el precio sin tarifa no la marca pagada (CB-07). */
    t.mp.pay(r.json.id, { id: '38001', amount: 13200 });
    await hook('38001');
    assert.equal((await Appointment.findById(r.json.id)).payment.status, 'pendiente');
    t.mp.pay(r.json.id, { id: '38002', amount: 13721, fee: 521 });
    await hook('38002');
    const a = await Appointment.findById(r.json.id);
    assert.equal(a.payment.status, 'pagado');
    assert.equal(a.status, 'pendiente');
    assert.equal(a.pricing.paymentMethod, 'online');
  });

  test('RN-11 cambiar a pagar en el local no cambia el total', async () => {
    const c = await client();
    const r = await post('/api/wstyle/appointments', booking({ paymentMethod: 'online' }), c.cookie);
    const local = await post(`/api/wstyle/appointments/${r.json.id}/pay-local`, {}, c.cookie);
    assert.equal(local.status, 200, JSON.stringify(local.json));
    assert.equal(local.json.payment.method, 'local');
    assert.equal(local.json.pricing.totalCLP, 13721);
    assert.equal((await Appointment.findById(r.json.id)).pricing.paymentMethod, 'local');
  });

  test('a domicilio: $12.000 + $3.000 + tarifa $2.152 = $17.152; el barbero gana $15.000', async () => {
    const r = await post('/api/wstyle/appointments', booking({ startsAt: at('14:00'), mode: 'home', address: { street: 'Av. Siempre Viva 742', commune: 'Providencia' } }), (await client()).cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const p = r.json.appointment.pricing;
    assert.deepEqual([p.surchargeCLP, p.serviceFeeCLP, p.totalCLP, p.barberCLP], [3000, 2152, 17152, 15000]);
  });

  test('AC-06 configuración: costo de pagos e IVA se validan, se guardan y se auditan', async () => {
    const put = (body) => api(t.ctx.base, 'PUT', '/api/admin/settings', { body, cookie: t.admin.cookie });
    const g = await get('/api/admin/settings', t.admin.cookie);
    assert.deepEqual([g.json.platformFeePercent, g.json.paymentFeePercent, g.json.paymentFeeVat], [10, 3.19, true]);
    assert.deepEqual(g.json.limits.paymentFeePercent, [0, 10]);
    for (const bad of [-1, 10.01, '3', 3.199, null]) {
      const r = await put({ paymentFeePercent: bad });
      assert.equal(r.status, 400, String(bad));
      assert.equal(r.json.fields.paymentFeePercent, 'out_of_range');
    }
    for (const bad of ['si', 1, null]) assert.equal((await put({ paymentFeeVat: bad })).json.fields?.paymentFeeVat, 'invalid', String(bad));
    const ok = await put({ paymentFeePercent: 2.5, paymentFeeVat: false });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.json.paymentFeePercent, ok.json.paymentFeeVat], [2.5, false]);
    const cat = await get('/api/wstyle/catalog');
    assert.deepEqual(cat.json.business.pricing, { platformFeePercent: 10, paymentFeePercent: 2.5, paymentFeeVat: false });
    /* Ceros apagan la tarifa entera. */
    await put({ platformFeePercent: 0, paymentFeePercent: 0 });
    const r = await post('/api/wstyle/appointments', booking(), (await client()).cookie);
    assert.deepEqual([r.json.appointment.pricing.serviceFeeCLP, r.json.appointment.pricing.totalCLP], [0, 12000]);
  });

  test('RN-19 admin: CSV y ficha con las dos partes separadas', async () => {
    const r = await post('/api/wstyle/appointments', booking(), (await client()).cookie);
    const res = await fetch(`${t.ctx.base}/api/admin/appointments.csv?from=${MONDAY}&to=${MONDAY}`, { headers: { Cookie: t.admin.cookie } });
    const line = (await res.text()).trim().split('\r\n')[1];
    assert.ok(line.includes(',12000,0,13721,En el local,pendiente,1200,521,12000,web'), line);
    const sheet = await get(`/api/admin/appointments/${r.json.id}`, t.admin.cookie);
    assert.equal(sheet.status, 200);
    assert.deepEqual([sheet.json.pricing.platformFeeCLP, sheet.json.pricing.paymentFeeCLP, sheet.json.pricing.internalFeeCLP], [1200, 521, undefined]);
  });
});
