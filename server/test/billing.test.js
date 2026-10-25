/* SPEC-37 AC-01…AC-10: pagos en el panel y respaldo tributario (voucher MP / boleta SII
   manual), contra la BD de test real. Mercado Pago es un servicio externo: se simula su
   borde HTTP (test/mp-fake.js). Los montos esperados de la rendición están calculados a mano
   (comentarios junto a cada número). */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Appointment, Business, PaymentEvent, Professional } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { saleLines, taxBreakdown, parseBoletaNumber } from '../src/domain/tax.js';
import { createTaxDocumentProvider, TAX_DOCUMENT_PROVIDERS } from '../src/lib/taxDocuments.js';
import { api, connectDb, disconnectDb, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV, MP_TOKEN, sendWebhook, signedHeaders } from './mp-fake.js';

const TZ = 'America/Santiago';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date) => new Date(zonedToUtc(date, time, TZ));
const ADMIN_EMAIL = 'dueno@wstyle.test';
/* RUT ficticio (formato válido) solo para comprobar que nunca sale del server. */
const FAKE_RUT = '76.543.210-K';
const WARNING = "El modelo voucher solo es válido si en el SII declaraste 'No emito boleta cuando recibo un pago electrónico'. Validar con contador.";

function world({ env = {} } = {}) {
  const t = { ctx: null, mp: null, seeded: null, admin: null, logs: [] };
  const logger = { log: (...a) => t.logs.push(a.join(' ')), warn: (...a) => t.logs.push(a.join(' ')), error: (...a) => t.logs.push(a.join(' ')) };
  t.boot = async (extra = {}) => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.logs.length = 0;
    t.seeded = await seed({ pros: [PRO_A, PRO_B] });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': true, 'payments.localEnabled': true } });
    t.mp = fakeMercadoPago();
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...MP_ENV, ...env, ...extra }, mercadoPagoFetch: t.mp.fetch, logger });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.post = (path, body = {}, cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  t.pro = (i = 0) => t.seeded.pros[i];
  t.hook = (dataId) => sendWebhook(t.ctx.base, { dataId, headers: signedHeaders({ dataId, ts: String(t.ctx.clock.now) }) });
  t.barberCookie = async (p = t.pro(0)) => {
    const c = await makeClient({ name: p.displayName, email: `sesion.${Math.random().toString(36).slice(2, 7)}@barberos.test`, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };
  /* Cita sembrada directo en la BD (para reportes no hace falta pasar por la reserva). */
  t.appt = async ({ pro = t.pro(0), price = 12000, surcharge = 0, date = '2026-11-03', time = '12:00', status = 'terminada', payment = {}, createdAt = null, name = 'Cliente Demo', service = 'Corte' } = {}) => {
    const startsAt = at(time, date);
    const doc = await Appointment.create({
      businessId: t.seeded.business._id,
      professionalId: pro._id,
      customerSnapshot: { name, email: 'demo@clientes.test', phoneE164: '+56911112222' },
      serviceSnapshot: { slug: 'corte', name: service, priceCLP: price, durationMin: 40 },
      professionalSnapshot: { displayName: pro.displayName },
      startsAt,
      endsAt: new Date(startsAt.getTime() + 40 * MIN),
      location: surcharge ? { kind: 'home', address: { formatted: 'Av. Siempre Viva 742' } } : { kind: 'shop' },
      pricing: { priceCLP: price, surchargeCLP: surcharge, totalCLP: price + surcharge },
      payment,
      status,
      history: [],
    });
    await Appointment.collection.updateOne({ _id: doc._id }, { $set: { createdAt: createdAt ? new Date(createdAt) : startsAt } });
    return String(doc._id);
  };
  return t;
}

/* Pago con Mercado Pago ya aprobado (como lo deja el webhook). */
const mpPaid = ({ id, paidAt, fee = 0, amount, model = 'voucher', status = 'pagado', refundedAt = null, doc = 'voucher' }) => ({
  method: 'online',
  status,
  mpPaymentId: id,
  mpStatus: status === 'reembolsado' ? 'refunded' : 'approved',
  paidAt,
  ...(refundedAt ? { refundedAt } : {}),
  mpFeeCLP: fee,
  mpNetCLP: amount - fee,
  taxModel: model,
  taxDoc: doc === 'voucher' ? { kind: 'voucher_mp', number: id, provider: model, at: paidAt } : { kind: 'boleta_sii', number: doc, provider: model, at: paidAt },
});

describe('SPEC-37 · cálculo neto/IVA y proveedor de documentos (sin BD)', () => {
  test('AC-05 neto = round(total / 1,19) e IVA = total − neto con los precios de la carta y el recargo por domicilio', () => {
    const carta = JSON.parse(readFileSync(new URL('../../client/public/wstyle/content/services.json', import.meta.url), 'utf8'));
    assert.ok(carta.length >= 3);
    for (const s of carta) {
      for (const surcharge of [0, 2000, 3000, 3500, 5000]) {
        const total = s.priceCLP + surcharge;
        const { netCLP, ivaCLP, totalCLP } = taxBreakdown(total);
        assert.equal(totalCLP, total);
        assert.equal(netCLP + ivaCLP, total, `${s.id} + ${surcharge}`);
        assert.ok(Number.isInteger(netCLP) && Number.isInteger(ivaCLP));
        assert.ok(Math.abs(netCLP * 1.19 - total) <= 1, `${s.id}+${surcharge}: ${netCLP} × 1,19 vs ${total}`);
        /* RN-4: el recargo va en una línea aparte y suma al monto afecto. */
        const lines = saleLines({ priceCLP: s.priceCLP, surchargeCLP: surcharge, totalCLP: total }, s.name);
        assert.equal(lines.reduce((acc, l) => acc + l.amountCLP, 0), total);
        assert.equal(lines.length, surcharge ? 2 : 1);
        if (surcharge) assert.match(lines[1].label, /domicilio/i);
        /* Calcular por línea o por el total difiere a lo más en $1. */
        const perLine = lines.reduce((acc, l) => acc + taxBreakdown(l.amountCLP).netCLP, 0);
        assert.ok(Math.abs(perLine - netCLP) <= 1);
      }
    }
    assert.deepEqual(taxBreakdown(12000), { totalCLP: 12000, netCLP: 10084, ivaCLP: 1916 });
    assert.deepEqual(taxBreakdown(15000), { totalCLP: 15000, netCLP: 12605, ivaCLP: 2395 });
    assert.deepEqual(taxBreakdown(18000), { totalCLP: 18000, netCLP: 15126, ivaCLP: 2874 });
  });

  test('N° de boleta: solo dígitos (acepta "N° 1.234"), sin ceros a la izquierda', () => {
    assert.equal(parseBoletaNumber('1001'), '1001');
    assert.equal(parseBoletaNumber(' N° 1.234 '), '1234');
    assert.equal(parseBoletaNumber('#0042'), '42');
    for (const bad of ['', 'abc', '0', '12a', '-5', '12345678901', null, undefined]) assert.equal(parseBoletaNumber(bad), null, String(bad));
  });

  test('AC-10 TaxDocumentProvider: voucher y manual, elegidos por configuración', () => {
    assert.deepEqual(Object.keys(TAX_DOCUMENT_PROVIDERS).sort(), ['manual', 'voucher']);
    const warns = [];
    const logger = { warn: (m) => warns.push(m) };
    const voucher = createTaxDocumentProvider({}, logger);
    const manual = createTaxDocumentProvider({ SII_TAX_PROVIDER: 'manual' }, logger);
    for (const p of [voucher, manual]) {
      for (const k of ['id', 'label', 'declaredModel']) assert.equal(typeof p[k], 'string', k);
      for (const k of ['automaticFor', 'acceptsManual']) assert.equal(typeof p[k], 'function', k);
    }
    assert.equal(voucher.id, 'voucher');
    assert.equal(manual.id, 'manual');
    const online = { channel: 'online', mpPaymentId: '555', amountCLP: 12000, at: new Date(SUNDAY_9AM) };
    const local = { channel: 'local', amountCLP: 12000, at: new Date(SUNDAY_9AM) };
    assert.deepEqual(voucher.automaticFor(online), { kind: 'voucher_mp', number: '555', provider: 'voucher', at: new Date(SUNDAY_9AM) });
    assert.equal(voucher.automaticFor(local), null);
    assert.equal(voucher.acceptsManual(online), false);
    assert.equal(voucher.acceptsManual(local), true);
    assert.equal(manual.automaticFor(online), null);
    assert.equal(manual.acceptsManual(online), true);
    assert.equal(manual.acceptsManual(local), true);
    /* Un valor desconocido no tumba el server: avisa y usa voucher. */
    assert.equal(createTaxDocumentProvider({ SII_TAX_PROVIDER: 'libredte' }, logger).id, 'voucher');
    assert.equal(warns.length, 1);
  });
});

describe('SPEC-37 · pagos y rendición en el panel', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 el super admin ve los pagos con filtros y totales; el barbero solo los suyos; cliente y visitante → 403', async () => {
    const a = await t.appt({ payment: mpPaid({ id: '7001', paidAt: at('12:40', '2026-11-03'), fee: 419, amount: 12000 }) });
    const b = await t.appt({ pro: t.pro(1), date: '2026-11-04', price: 18000, service: 'Corte + barba', payment: { method: 'local', status: 'cobrado', localMethod: 'efectivo', collectedAt: at('13:00', '2026-11-04'), taxModel: 'voucher' } });
    const c = await t.appt({ date: '2026-11-05', status: 'pendiente_pago', payment: { method: 'online', status: 'rechazado', mpPaymentId: '7002', mpStatus: 'rejected' } });
    const d = await t.appt({ pro: t.pro(1), date: '2026-11-06', payment: { method: 'local', status: 'pago_pendiente' } });
    await t.appt({ date: '2026-10-20', payment: mpPaid({ id: '7003', paidAt: at('12:40', '2026-10-20'), amount: 12000 }) });

    const r = await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const byAppt = Object.fromEntries(r.json.items.map((x) => [x.appointmentId, x]));
    assert.deepEqual(Object.keys(byAppt).sort(), [a, b, c, d].sort());
    assert.equal(byAppt[a].status, 'aprobado');
    assert.equal(byAppt[a].backing, 'voucher_mp');
    assert.equal(byAppt[b].method, 'efectivo');
    assert.equal(byAppt[b].backing, 'sin_respaldo');
    assert.equal(byAppt[c].status, 'rechazado');
    assert.equal(byAppt[c].backing, null);
    assert.equal(byAppt[d].status, 'por_cobrar');
    for (const x of r.json.items) for (const k of ['date', 'customer', 'professional', 'service', 'method', 'amountCLP', 'status', 'backing']) assert.ok(k in x, k);
    /* Totales del período: solo los aprobados suman a las ventas. */
    assert.equal(r.json.totals.approvedCLP, 30000);
    assert.equal(r.json.totals.approvedCount, 2);
    assert.equal(r.json.totals.mpFeesCLP, 419);
    assert.equal(r.json.totals.unbacked.count, 1);
    assert.equal(r.json.totals.unbacked.totalCLP, 18000);
    assert.equal(r.json.totals.porCobrar.totalCLP, 12000);
    assert.equal(r.json.warning, WARNING);

    /* Filtros: barbero, método, estado, sin respaldo, fecha. */
    const ids = async (q) => (await t.get(`/api/admin/payments?from=2026-11-01&to=2026-11-30&${q}`, t.admin.cookie)).json.items.map((x) => x.appointmentId).sort();
    assert.deepEqual(await ids(`professional=${t.pro(1)._id}`), [b, d].sort());
    assert.deepEqual(await ids('method=online'), [a, c].sort());
    assert.deepEqual(await ids('method=efectivo'), [b]);
    assert.deepEqual(await ids('status=aprobado'), [a, b].sort());
    assert.deepEqual(await ids('backing=sin_respaldo'), [b]);
    assert.deepEqual(await ids('backing=voucher_mp'), [a]);
    assert.deepEqual((await t.get('/api/admin/payments?from=2026-10-01&to=2026-10-31', t.admin.cookie)).json.items.length, 1);
    assert.equal((await t.get('/api/admin/payments?from=2026-11-30&to=2026-11-01', t.admin.cookie)).status, 400);

    /* El barbero A ve solo los pagos de sus citas, sin totales del local ni comisiones. */
    const bc = await t.barberCookie(t.pro(0));
    const mine = await t.get('/api/pro/payments?from=2026-11-01&to=2026-11-30', bc);
    assert.equal(mine.status, 200, JSON.stringify(mine.json));
    assert.deepEqual(mine.json.items.map((x) => x.appointmentId).sort(), [a, c].sort());
    assert.equal(mine.json.totals, undefined);
    assert.equal(mine.json.items.find((x) => x.appointmentId === a).mp.feeCLP, undefined);
    assert.equal(mine.json.items[0].customer.email, undefined);

    /* Cliente, barbero (en la API del admin) y visitante → 403. */
    const client = await makeClient({});
    for (const [path, method] of [['/api/admin/payments', 'GET'], ['/api/admin/rendicion?month=2026-11', 'GET'], ['/api/admin/rendicion.csv?month=2026-11', 'GET'], [`/api/admin/payments/${b}/boleta`, 'POST']]) {
      for (const cookie of [undefined, client.cookie, bc]) {
        const res = await api(t.ctx.base, method, path, { cookie, body: method === 'POST' ? { number: '1' } : undefined });
        assert.equal(res.status, 403, `${method} ${path} ${cookie ? 'con sesión' : 'visitante'}`);
      }
    }
    for (const cookie of [undefined, client.cookie]) assert.equal((await t.get('/api/pro/payments', cookie)).status, 403);
  });

  test('AC-02 un pago MP aprobado aparece con id, monto, comisión, neto recibido y voucher MP; el webhook repetido no lo duplica', async () => {
    const c = await makeClient({ name: 'Ana Pérez', email: 'ana@clientes.test' });
    const book = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at('12:00', '2026-11-02').toISOString(), mode: 'shop', acceptPolicies: true, paymentMethod: 'online' }, c.cookie);
    assert.equal(book.status, 201, JSON.stringify(book.json));
    const id = book.json.id;
    t.mp.pay(id, { id: '8001', amount: 12000, fee: 419 });
    const hooks = await Promise.all([1, 2, 3, 4, 5].map(() => t.hook('8001')));
    assert.ok(hooks.every((h) => h.status === 200));
    assert.equal(await PaymentEvent.countDocuments({ mpPaymentId: '8001' }), 1);

    const r = await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie);
    assert.equal(r.json.items.length, 1);
    const p = r.json.items[0];
    assert.equal(p.appointmentId, id);
    assert.equal(p.status, 'aprobado');
    assert.equal(p.method, 'mercadopago');
    assert.equal(p.amountCLP, 12000);
    assert.deepEqual({ id: p.mp.paymentId, fee: p.mp.feeCLP, net: p.mp.netReceivedCLP }, { id: '8001', fee: 419, net: 11581 });
    assert.equal(p.backing, 'voucher_mp');
    assert.equal(p.boletaNumber, null);
    assert.equal(p.canRegisterBoleta, false);
    assert.deepEqual(p.tax, { netCLP: 10084, ivaCLP: 1916, estimated: true });
    assert.equal(p.customer.name, 'Ana Pérez');

    /* El cliente ve el respaldo en "Mis citas". */
    const mine = await t.get(`/api/wstyle/appointments/${id}`, c.cookie);
    assert.equal(mine.json.payment.backing.kind, 'voucher_mp');
    assert.match(mine.json.payment.backing.label, /Mercado Pago/);
  });

  test('AC-03 pago en el local cobrado: con N° de boleta queda "boleta SII", sin él "sin respaldo"; se puede registrar después', async () => {
    const bc = await t.barberCookie(t.pro(0));
    const x = await t.appt({ status: 'en_curso', payment: { method: 'local', status: 'pendiente' } });
    const y = await t.appt({ status: 'en_curso', time: '13:00', payment: { method: 'local', status: 'pendiente' } });
    const other = await t.appt({ pro: t.pro(1), status: 'terminada', time: '14:00', payment: { method: 'local', status: 'cobrado', localMethod: 'efectivo', collectedAt: at('14:40', '2026-11-03') } });

    /* Método inválido → 400; boleta inválida → 400. */
    assert.equal((await t.post(`/api/pro/appointments/${x}/finish`, { collected: true, localMethod: 'cheque' }, bc)).status, 400);
    assert.equal((await t.post(`/api/pro/appointments/${x}/finish`, { collected: true, localMethod: 'efectivo', boletaNumber: 'abc' }, bc)).status, 400);
    let r = await t.post(`/api/pro/appointments/${x}/finish`, { collected: true, localMethod: 'efectivo', boletaNumber: 'N° 1001' }, bc);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await t.post(`/api/pro/appointments/${y}/finish`, { collected: true, localMethod: 'transferencia' }, bc);
    assert.equal(r.status, 200, JSON.stringify(r.json));

    t.ctx.clock.now = Date.parse('2026-11-04T12:00:00Z');
    const list = (await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie)).json.items;
    const row = (id) => list.find((p) => p.appointmentId === id);
    assert.deepEqual([row(x).method, row(x).status, row(x).backing, row(x).boletaNumber], ['efectivo', 'aprobado', 'boleta_sii', '1001']);
    assert.deepEqual([row(y).method, row(y).status, row(y).backing, row(y).boletaNumber], ['transferencia', 'aprobado', 'sin_respaldo', null]);
    assert.equal(row(y).canRegisterBoleta, true);

    /* El N° no se repite entre pagos. */
    const dup = await t.post(`/api/admin/payments/${y}/boleta`, { number: '1001' }, t.admin.cookie);
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error, 'boleta_duplicada');
    /* El barbero registra el N° de su cita; la de otro barbero → 404. */
    assert.equal((await t.post(`/api/pro/payments/${other}/boleta`, { number: '1003' }, bc)).status, 404);
    r = await t.post(`/api/pro/payments/${y}/boleta`, { number: '1002' }, bc);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.payment.backing, 'boleta_sii');
    assert.equal(r.json.payment.boletaNumber, '1002');
    /* El admin lo puede corregir (queda en la auditoría). */
    r = await t.post(`/api/admin/payments/${y}/boleta`, { number: '1012' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await Appointment.findById(y)).payment.taxDoc.number, '1012');
    const audit = await t.get('/api/admin/audit?action=payment.boleta', t.admin.cookie);
    assert.equal(audit.json.items.length, 1);

    /* El admin marca cobrada una cita terminada sin cobrar, con método y N° de boleta. */
    const z = await t.appt({ time: '16:00', status: 'terminada', payment: { method: 'local', status: 'pago_pendiente' } });
    r = await t.post(`/api/admin/appointments/${z}/collect`, { method: 'transferencia', boletaNumber: '1020' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const za = await Appointment.findById(z);
    assert.deepEqual([za.payment.status, za.payment.localMethod, za.payment.taxDoc.kind, za.payment.taxDoc.number], ['cobrado', 'transferencia', 'boleta_sii', '1020']);
  });

  test('AC-04 no se puede asignar un N° de boleta a un pago con voucher MP (una venta, un solo respaldo)', async () => {
    const a = await t.appt({ payment: mpPaid({ id: '7101', paidAt: at('12:40', '2026-11-03'), amount: 12000 }) });
    const r = await t.post(`/api/admin/payments/${a}/boleta`, { number: '3001' }, t.admin.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'already_backed');
    const doc = await Appointment.findById(a);
    assert.equal(doc.payment.taxDoc.kind, 'voucher_mp');
    assert.equal(doc.payment.taxDoc.number, '7101');
    /* Un pago que no está aprobado tampoco admite boleta. */
    const p = await t.appt({ status: 'confirmada', payment: { method: 'local', status: 'pendiente' } });
    assert.equal((await t.post(`/api/admin/payments/${p}/boleta`, { number: '3002' }, t.admin.cookie)).status, 409);
  });

  test('AC-06 rendición del mes: totales por respaldo, neto, IVA, reembolsos, comisiones, cuadre, tramos y CSV', async () => {
    const d = (day, time = '12:40') => at(time, `2026-11-${String(day).padStart(2, '0')}`);
    // A. MP 12.000, comisión 419, voucher (3-nov).
    await t.appt({ date: '2026-11-03', payment: mpPaid({ id: 'A1', paidAt: d(3), fee: 419, amount: 12000 }) });
    // B. MP a domicilio 12.000 + 3.000 = 15.000, comisión 524, voucher (5-nov).
    await t.appt({ date: '2026-11-05', surcharge: 3000, payment: mpPaid({ id: 'B1', paidAt: d(5), fee: 524, amount: 15000 }) });
    // C. MP 18.000, comisión 628, reembolsado el 10-nov.
    await t.appt({ date: '2026-11-06', price: 18000, status: 'cancelada', payment: mpPaid({ id: 'C1', paidAt: d(6), fee: 628, amount: 18000, status: 'reembolsado', refundedAt: d(10) }) });
    // D. Local efectivo con boleta 1001 (9-nov).
    await t.appt({ date: '2026-11-09', payment: { method: 'local', status: 'cobrado', localMethod: 'efectivo', collectedAt: d(9), taxModel: 'voucher', taxDoc: { kind: 'boleta_sii', number: '1001', provider: 'voucher', at: d(9) } } });
    // E. Local transferencia sin boleta 18.000 (12-nov).
    await t.appt({ date: '2026-11-12', price: 18000, payment: { method: 'local', status: 'cobrado', localMethod: 'transferencia', collectedAt: d(12), taxModel: 'voucher' } });
    // F. MP rechazado: no suma.
    await t.appt({ date: '2026-11-13', status: 'cancelada', payment: { method: 'online', status: 'rechazado', mpPaymentId: 'F1', mpStatus: 'rejected' } });
    // G. Local terminada sin cobrar: por cobrar.
    await t.appt({ date: '2026-11-14', payment: { method: 'local', status: 'pago_pendiente' } });
    // H. MP de octubre: fuera del mes.
    await t.appt({ date: '2026-10-28', payment: mpPaid({ id: 'H1', paidAt: at('12:40', '2026-10-28'), fee: 419, amount: 12000 }) });
    // I. MP de octubre reembolsado el 2-nov: el reembolso cuenta en noviembre.
    await t.appt({ date: '2026-10-29', status: 'cancelada', payment: mpPaid({ id: 'I1', paidAt: at('12:40', '2026-10-29'), fee: 419, amount: 12000, status: 'reembolsado', refundedAt: d(2) }) });
    // J. Cambio de modelo a mitad de mes: desde el 20-nov "siempre emito boleta" (manual); MP 18.000 con boleta 2001.
    await t.appt({ date: '2026-11-20', price: 18000, payment: mpPaid({ id: 'J1', paidAt: d(20), fee: 628, amount: 18000, model: 'manual', doc: '2001' }) });

    const r = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const s = r.json;
    assert.equal(s.month, '2026-11');
    // Ventas: A 12.000 + B 15.000 + C 18.000 + D 12.000 + E 18.000 + J 18.000 = 93.000 (6).
    assert.equal(s.totals.approvedCLP, 93000);
    assert.equal(s.totals.approvedCount, 6);
    // Reembolsos del mes: C 18.000 + I 12.000 = 30.000 (2).
    assert.equal(s.totals.refundsCLP, 30000);
    assert.equal(s.totals.refundsCount, 2);
    assert.equal(s.totals.netSalesCLP, 63000);
    // Neto ventas 10.084+12.605+15.126+10.084+15.126+15.126 = 78.151; reembolsos 15.126+10.084 = 25.210 → 52.941.
    assert.equal(s.totals.netCLP, 52941);
    // IVA ventas 1.916+2.395+2.874+1.916+2.874+2.874 = 14.849; reembolsos 2.874+1.916 = 4.790 → 10.059.
    assert.equal(s.totals.ivaCLP, 10059);
    assert.equal(s.totals.netCLP + s.totals.ivaCLP, s.totals.netSalesCLP);
    // Comisiones MP de las ventas del mes: 419 + 524 + 628 + 628 = 2.199; neto recibido 60.801.
    assert.equal(s.totals.mpFeesCLP, 2199);
    assert.equal(s.totals.mpNetReceivedCLP, 60801);
    // Por respaldo: voucher emite A+B+C = 45.000 y se le descuentan C+I = 30.000; boletas D+J = 30.000; sin respaldo E.
    assert.deepEqual(s.byBacking.voucher_mp, { count: 3, issuedCLP: 45000, refundedCLP: 30000, netCLP: 15000 });
    assert.deepEqual(s.byBacking.boleta_sii, { count: 2, issuedCLP: 30000, refundedCLP: 0, netCLP: 30000 });
    assert.deepEqual(s.byBacking.sin_respaldo, { count: 1, issuedCLP: 18000, refundedCLP: 0, netCLP: 18000 });
    // Regla 7: 93.000 − 30.000 = 15.000 + 30.000 + 18.000.
    assert.deepEqual([s.cuadre.approvedMinusRefundsCLP, s.cuadre.backedCLP, s.cuadre.ok, s.cuadre.differences.length], [63000, 63000, true, 0]);
    assert.deepEqual(s.unbacked.map((u) => u.amountCLP), [18000]);
    assert.deepEqual(s.porCobrar, { count: 1, totalCLP: 12000 });
    // Dos tramos: voucher del 3 al 12 (5 ventas, 75.000) y manual desde el 20 (1 venta, 18.000).
    assert.deepEqual(s.tramos.map((x) => [x.model, x.from, x.to, x.count, x.totalCLP]), [['voucher', '2026-11-03', '2026-11-12', 5, 75000], ['manual', '2026-11-20', '2026-11-20', 1, 18000]]);
    assert.equal(s.warning, WARNING);
    assert.equal(s.estimated, true);

    /* CSV: una línea por venta y por reembolso (negativo); la columna Monto suma lo mismo que el resumen. */
    const res = await fetch(`${t.ctx.base}/api/admin/rendicion.csv?month=2026-11`, { headers: { Cookie: t.admin.cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /rendicion-wstyle-2026-11\.csv/);
    const csv = (await res.text()).replace(/^﻿/, '');
    const lines = csv.trim().split(/\r\n/);
    const header = lines[0].split(',');
    for (const col of ['Fecha', 'Tipo', 'Respaldo', 'N° documento', 'Monto', 'Neto (est.)', 'IVA (est.)', 'Comisión MP', 'Modelo']) assert.ok(header.includes(col), col);
    const body = lines.slice(1, lines.indexOf(''));
    assert.equal(body.filter((l) => l.includes(',Venta,')).length, 6);
    assert.equal(body.filter((l) => l.includes(',Reembolso,')).length, 2);
    const iMonto = header.indexOf('Monto');
    assert.equal(body.reduce((acc, l) => acc + Number(l.split(',')[iMonto]), 0), 63000);
    assert.ok(lines.some((l) => l.startsWith('Cuadre,')), 'trae el resumen del cuadre');

    /* Una diferencia: un "respaldo" sobre un pago que nunca se aprobó rompe el cuadre y se lista. */
    await Appointment.updateOne({ 'payment.mpPaymentId': 'F1' }, { $set: { 'payment.taxDoc': { kind: 'voucher_mp', number: 'F1', provider: 'voucher', at: d(13) } } });
    const bad = (await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie)).json;
    assert.equal(bad.cuadre.ok, false);
    assert.deepEqual(bad.cuadre.differences.map((x) => x.reason), ['respaldo_sin_pago_aprobado']);
    assert.equal(bad.cuadre.backedCLP - bad.cuadre.approvedMinusRefundsCLP, 12000);
    assert.equal((await t.get('/api/admin/rendicion?month=2026-13', t.admin.cookie)).status, 400);
  });

  test('AC-07/AC-09 sin RUT el emisor queda "pendiente"; con RUT el panel solo sabe que está configurado (el RUT no sale del server)', async () => {
    let s = (await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie)).json;
    assert.deepEqual(s.emitter, { configured: false, label: 'Emisor pendiente', name: null, provider: 'voucher', providerLabel: s.emitter.providerLabel, declaredModel: s.emitter.declaredModel });
    assert.equal((await t.get('/api/admin/payments', t.admin.cookie)).json.emitter.configured, false);

    await t.boot({ SII_EMITTER_RUT: FAKE_RUT, SII_EMITTER_NAME: 'Dueño de Prueba' });
    const bodies = [];
    const p = await t.appt({ payment: mpPaid({ id: '7201', paidAt: at('12:40', '2026-11-03'), fee: 419, amount: 12000 }) });
    for (const path of ['/api/admin/payments', '/api/admin/rendicion?month=2026-11', `/api/admin/appointments/${p}`, '/api/admin/settings', '/api/admin/overview']) {
      const r = await t.get(path, t.admin.cookie);
      assert.equal(r.status, 200, path);
      bodies.push(JSON.stringify(r.json));
    }
    const csv = await (await fetch(`${t.ctx.base}/api/admin/rendicion.csv?month=2026-11`, { headers: { Cookie: t.admin.cookie } })).text();
    s = JSON.parse(bodies[1]);
    assert.equal(s.emitter.configured, true);
    assert.equal(s.emitter.label, 'Emisor configurado');
    assert.equal(s.emitter.name, 'Dueño de Prueba');
    assert.equal(s.estimated, false);
    const rutDigits = FAKE_RUT.replace(/\D/g, '');
    for (const text of [...bodies, csv, ...t.logs]) {
      assert.ok(!text.includes(FAKE_RUT) && !text.replace(/\D/g, '').includes(rutDigits), 'el RUT no sale del server');
      assert.ok(!text.includes(MP_TOKEN), 'el token no sale del server');
    }
  });

  test('AC-10 con SII_TAX_PROVIDER=manual un pago MP aprobado no lleva voucher y admite su boleta', async () => {
    await t.boot({ SII_TAX_PROVIDER: 'manual' });
    const c = await makeClient({ name: 'Bea', email: 'bea@clientes.test' });
    const book = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at('12:00', '2026-11-02').toISOString(), mode: 'shop', acceptPolicies: true, paymentMethod: 'online' }, c.cookie);
    const id = book.json.id;
    t.mp.pay(id, { id: '8101', amount: 12000, fee: 419 });
    assert.equal((await t.hook('8101')).status, 200);
    let row = (await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie)).json.items[0];
    assert.deepEqual([row.status, row.backing, row.canRegisterBoleta, row.taxModel], ['aprobado', 'sin_respaldo', true, 'manual']);
    const r = await t.post(`/api/admin/payments/${id}/boleta`, { number: '5001' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    row = (await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie)).json.items[0];
    assert.deepEqual([row.backing, row.boletaNumber], ['boleta_sii', '5001']);
    const em = (await t.get('/api/admin/payments', t.admin.cookie)).json.emitter;
    assert.equal(em.provider, 'manual');
  });

  test('Casos borde: contracargo y reembolso desde MP se descuentan; pendiente no suma', async () => {
    const c = await makeClient({ name: 'Caro', email: 'caro@clientes.test' });
    const mk = async (time) => (await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at(time, '2026-11-02').toISOString(), mode: 'shop', acceptPolicies: true, paymentMethod: 'online' }, c.cookie)).json.id;
    const a = await mk('12:00');
    const b = await mk('15:00');
    t.mp.pay(a, { id: '8201', amount: 12000, fee: 419 });
    t.mp.pay(b, { id: '8202', amount: 12000, status: 'in_process' });
    await t.hook('8201');
    await t.hook('8202');
    t.mp.pay(a, { id: '8201', amount: 12000, fee: 419, status: 'charged_back' });
    await t.hook('8201');
    const s = (await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie)).json;
    assert.equal(s.totals.approvedCLP, 12000);
    assert.equal(s.totals.refundsCLP, 12000);
    assert.equal(s.totals.netSalesCLP, 0);
    assert.equal(s.cuadre.ok, true);
    const rows = (await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie)).json.items;
    assert.equal(rows.find((x) => x.appointmentId === a).status, 'contracargo');
    assert.deepEqual([rows.find((x) => x.appointmentId === b).status, rows.find((x) => x.appointmentId === b).backing], ['pendiente', null]);
  });
});
