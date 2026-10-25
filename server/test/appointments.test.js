/* SPEC-32 AC-05…AC-14, AC-24: reservas, estados, domicilio, límites y correos,
   contra la BD de test real. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, Professional, Service, SlotLock, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { createApp } from '../src/app.js';
import { api, connectDb, disconnectDb, eastOf, HOUR, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop, silent } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();

function booking(proId, startsAt, extra = {}) {
  return { serviceId: 'corte', professionalId: String(proId), startsAt, mode: 'shop', acceptPolicies: true, paymentMethod: 'local', note: '', ...extra };
}

describe('citas', () => {
  let ctx, seeded, pro;
  before(connectDb);
  after(disconnectDb);
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    seeded = await seed({ pros: [PRO_A, PRO_B] });
    pro = seeded.pros[0];
    ctx = await start({ now: SUNDAY_9AM, geocoder: async ({ street }) => (street.startsWith('Lejos') ? eastOf(12.4) : street.startsWith('Nada') ? null : eastOf(5)) });
  });
  after(async () => ctx && stop(ctx.server));

  const post = (path, body, cookie) => api(ctx.base, 'POST', path, { body, cookie });
  const barberCookie = async (p = pro) => {
    const c = await makeClient({ name: p.displayName, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };

  test('crea la cita pendiente con precio congelado, bloques y correos (flujo principal)', async () => {
    const c = await makeClient({ name: 'Ana', email: 'ana@clientes.test' });
    const res = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie);
    assert.equal(res.status, 201);
    assert.equal(res.json.appointment.status, 'pendiente');
    assert.equal(res.json.appointment.professional.name, 'Barbero A');
    const appt = await Appointment.findById(res.json.id);
    assert.equal(appt.startsAt.toISOString(), '2026-11-02T15:00:00.000Z');
    assert.equal(appt.pricing.totalCLP, 12000);
    assert.equal(await SlotLock.countDocuments({ appointmentId: appt._id }), 3);
    /* AC-14: correo al cliente y al barbero, con link a la cita y wa.me. */
    const toClient = ctx.mailer.outbox.find((m) => m.to === 'ana@clientes.test');
    const toBarber = ctx.mailer.outbox.find((m) => m.to === 'a@barberos.test');
    assert.match(toClient.text, /esperando confirmación de Barbero A/);
    for (const m of [toClient, toBarber]) {
      assert.ok(m.text.includes(`http://localhost:5173/wstyle/cita/?id=${appt._id}`));
      assert.match(m.text, /https:\/\/wa\.me\/569\d{8}/);
    }
    assert.ok(toBarber.text.includes('wa.me/56987654321'));
  });

  test('AC-05 20 POST simultáneos a la misma hora y barbero → 1 × 201 y 19 × 409 slot_taken', async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, (_, i) => makeClient({ phone: `+5699000${String(i).padStart(4, '0')}` })));
    const results = await Promise.all(clients.map((c) => post('/api/wstyle/appointments', booking(pro._id, at('15:00')), c.cookie)));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((s) => s === 201).length, 1);
    assert.equal(codes.filter((s) => s === 409).length, 19);
    for (const r of results.filter((x) => x.status === 409)) assert.ok(['slot_taken', 'slot_unavailable'].includes(r.json.error), r.json.error);
    assert.ok(results.filter((x) => x.status === 409).some((r) => r.json.error === 'slot_taken'));
    assert.equal(await Appointment.countDocuments({}), 1);
    const [appt] = await Appointment.find();
    assert.equal(await SlotLock.countDocuments({}), 3);
    assert.equal(await SlotLock.countDocuments({ appointmentId: appt._id }), 3);
  });

  test('CB-11 doble clic con la misma clave de idempotencia → una sola cita', async () => {
    const c = await makeClient();
    const body = booking(pro._id, at('12:30'), { idempotencyKey: 'intento-1' });
    const [a, b] = await Promise.all([post('/api/wstyle/appointments', body, c.cookie), post('/api/wstyle/appointments', body, c.cookie)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.json.id, b.json.id);
    assert.equal(await Appointment.countDocuments({}), 1);
  });

  test('RN-06 "sin preferencia" asigna al libre con menos citas ese día (empate: el primero)', async () => {
    const c1 = await makeClient({ phone: '+56911111111' });
    const r1 = await post('/api/wstyle/appointments', booking('any', at('12:00')), c1.cookie);
    assert.equal(r1.json.appointment.professional.name, 'Barbero A');
    const c2 = await makeClient({ phone: '+56922222222' });
    const r2 = await post('/api/wstyle/appointments', booking('any', at('16:00')), c2.cookie);
    assert.equal(r2.json.appointment.professional.name, 'Barbero B');
  });

  test('AC-06 transiciones válidas e inválidas, con historial', async () => {
    const c = await makeClient();
    const bCookie = await barberCookie();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('13:00')), c.cookie);
    const id = json.id;
    /* El cliente no puede confirmar su propia cita pendiente. */
    let r = await post(`/api/wstyle/appointments/${id}/confirm`, {}, c.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'invalid_transition');
    r = await post(`/api/wstyle/appointments/${id}/confirm`, {}, bCookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'confirmada');
    /* Iniciar y terminar. */
    ctx.clock.now = Date.parse(at('13:00'));
    assert.equal((await post(`/api/wstyle/appointments/${id}/start`, {}, bCookie)).json.status, 'en_curso');
    assert.equal((await post(`/api/wstyle/appointments/${id}/finish`, { collected: true }, bCookie)).json.status, 'terminada');
    /* terminada → cancelada: inválida. */
    r = await post(`/api/wstyle/appointments/${id}/cancel`, {}, bCookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'invalid_transition');
    const appt = await Appointment.findById(id);
    assert.deepEqual(appt.history.map((h) => `${h.from ?? '∅'}→${h.to}:${h.by}`), ['∅→pendiente:client', 'pendiente→confirmada:barber', 'confirmada→en_curso:barber', 'en_curso→terminada:barber']);
    for (const h of appt.history) assert.ok(h.at instanceof Date);
  });

  test('AC-06 / CB-13 cancelar a menos de 3 h → 409; con 3 h o más → cancelada y libera la hora', async () => {
    const c = await makeClient({ email: 'canc@clientes.test' });
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('17:00')), c.cookie);
    ctx.clock.now = Date.parse(at('14:30'));
    let r = await post(`/api/wstyle/appointments/${json.id}/cancel`, {}, c.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'invalid_transition');
    assert.equal(r.json.message, 'Ya no se puede cancelar en línea');
    const view = await api(ctx.base, 'GET', `/api/wstyle/appointments/${json.id}`, { cookie: c.cookie });
    assert.ok(!view.json.actions.includes('cancel'), 'el botón se oculta');
    ctx.clock.now = Date.parse(at('14:00'));
    r = await post(`/api/wstyle/appointments/${json.id}/cancel`, { reason: 'Me surgió algo' }, c.cookie);
    assert.equal(r.json.status, 'cancelada');
    assert.equal(await SlotLock.countDocuments({}), 0);
    /* AC-14: cancelada → correo al cliente y al barbero (con motivo). */
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'canc@clientes.test' && /cancelada/i.test(m.subject) && /el cliente/.test(m.text)));
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'a@barberos.test' && /canceló/.test(m.subject) && /Me surgió algo/.test(m.text)));
  });

  test('AC-07 pendiente sin confirmar expira a las 12 h (o a 2 h del inicio) y libera los bloques', async () => {
    const c = await makeClient({ email: 'exp@clientes.test' });
    /* Reserva para el martes 12:00, hecha el domingo 9:00 → vence el domingo 21:00. */
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('12:00', '2026-11-03')), c.cookie);
    ctx.clock.now = SUNDAY_9AM + 12 * HOUR - MIN;
    assert.deepEqual(await ctx.app.locals.agenda.runExpirations(), { expired: 0, lapsed: 0 });
    ctx.clock.now = SUNDAY_9AM + 12 * HOUR;
    assert.deepEqual(await ctx.app.locals.agenda.runExpirations(), { expired: 1, lapsed: 0 });
    const appt = await Appointment.findById(json.id);
    assert.equal(appt.status, 'expirada');
    assert.equal(appt.history.at(-1).by, 'system');
    assert.equal(await SlotLock.countDocuments({}), 0);
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'exp@clientes.test' && /expiró/.test(m.subject)));

    /* A 2 h del inicio si eso ocurre antes: lunes 12:00 reservado el domingo a las 23:00 → vence el lunes 10:00. */
    ctx.clock.now = Date.parse(at('23:00', '2026-11-01'));
    const r2 = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie);
    assert.equal((await Appointment.findById(r2.json.id)).expiresAt.toISOString(), at('10:00'));
  });

  test('AC-12 propuesta: ambas horas bloqueadas; aceptar → confirmada en la nueva y libera la original', async () => {
    const c = await makeClient({ email: 'prop@clientes.test' });
    const bCookie = await barberCookie();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('13:00')), c.cookie);
    await post(`/api/wstyle/appointments/${json.id}/confirm`, {}, bCookie);
    const r = await post(`/api/wstyle/appointments/${json.id}/propose`, { startsAt: at('16:00') }, bCookie);
    assert.equal(r.json.status, 'propuesta_cambio');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'prop@clientes.test' && /quiere mover tu cita/.test(m.subject)));
    /* Ambas horas ocupadas para cualquiera. */
    const av = await api(ctx.base, 'GET', `/api/wstyle/availability?service=corte&professional=${pro._id}&from=${MONDAY}&to=${MONDAY}`);
    const ls = av.json.days[0].slots.map((s) => s.label);
    assert.ok(!ls.includes('13:00') && !ls.includes('16:00'));
    /* El cliente ve antes » ahora y acepta. */
    const view = await api(ctx.base, 'GET', `/api/wstyle/appointments/${json.id}`, { cookie: c.cookie });
    assert.deepEqual(view.json.actions.sort(), ['accept', 'cancel', 'counter']);
    assert.equal(view.json.proposal.startsAt, at('16:00'));
    const acc = await post(`/api/wstyle/appointments/${json.id}/accept`, {}, c.cookie);
    assert.equal(acc.json.status, 'confirmada');
    assert.equal(acc.json.startsAt, at('16:00'));
    const locks = await SlotLock.find({ appointmentId: json.id }).sort({ slotStart: 1 });
    assert.equal(locks.length, 3);
    assert.equal(locks[0].slotStart.toISOString(), at('16:00'));
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'a@barberos.test' && /aceptó/.test(m.subject)));
  });

  test('AC-12 contrapropuesta → pendiente en la hora elegida; AC-06 aceptar una propuesta caducada → 409', async () => {
    const c = await makeClient();
    const bCookie = await barberCookie();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('13:00')), c.cookie);
    await post(`/api/wstyle/appointments/${json.id}/propose`, { startsAt: at('16:00') }, bCookie);
    /* Contrapropone 13:15 (solapa su propia hora original: se permite). */
    const av = await api(ctx.base, 'GET', `/api/wstyle/availability?service=corte&professional=${pro._id}&from=${MONDAY}&to=${MONDAY}&appointment=${json.id}`, { cookie: c.cookie });
    assert.ok(av.json.days[0].slots.some((s) => s.label === '13:15'));
    const r = await post(`/api/wstyle/appointments/${json.id}/counter`, { startsAt: at('13:15') }, c.cookie);
    assert.equal(r.json.status, 'pendiente');
    assert.equal(r.json.startsAt, at('13:15'));
    const locks = (await SlotLock.find({}).sort({ slotStart: 1 })).map((l) => l.slotStart.toISOString());
    assert.deepEqual(locks, [at('13:15'), at('13:30'), at('13:45')]);

    /* Nueva propuesta que caduca (12 h) y el cliente intenta aceptar tarde. */
    await post(`/api/wstyle/appointments/${json.id}/propose`, { startsAt: at('16:00') }, bCookie);
    ctx.clock.now += 12 * HOUR;
    const late = await post(`/api/wstyle/appointments/${json.id}/accept`, {}, c.cookie);
    assert.equal(late.status, 409);
    assert.equal(late.json.error, 'invalid_transition');
    /* AC-07 propuesta sin respuesta: venía de pendiente → expirada y libera todo. */
    const out = await ctx.app.locals.agenda.runExpirations();
    assert.equal(out.lapsed, 1);
    assert.equal((await Appointment.findById(json.id)).status, 'expirada');
    assert.equal(await SlotLock.countDocuments({}), 0);
  });

  test('AC-07 propuesta sin respuesta sobre una cita confirmada → vuelve a confirmada en la hora original', async () => {
    const c = await makeClient();
    const bCookie = await barberCookie();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('13:00', '2026-11-04')), c.cookie);
    await post(`/api/wstyle/appointments/${json.id}/confirm`, {}, bCookie);
    await post(`/api/wstyle/appointments/${json.id}/propose`, { startsAt: at('16:00', '2026-11-04') }, bCookie);
    assert.equal(await SlotLock.countDocuments({}), 6);
    ctx.clock.now += 12 * HOUR;
    await ctx.app.locals.agenda.runExpirations();
    const appt = await Appointment.findById(json.id);
    assert.equal(appt.status, 'confirmada');
    assert.equal(appt.startsAt.toISOString(), at('13:00', '2026-11-04'));
    assert.equal(await SlotLock.countDocuments({}), 3);
  });

  test('AC-08 domicilio: a 5 km total = precio + 3.000 y ocupa ±30 min; a 12,4 km → 422 out_of_range', async () => {
    const c = await makeClient();
    const quote = await post('/api/wstyle/quote', { serviceId: 'corte', professionalId: String(pro._id), address: { street: 'Av. Siempre Viva 742', commune: 'Providencia' } });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.distanceKm, 5);
    assert.equal(quote.json.professionals[0].totalCLP, 15000);
    const r = await post('/api/wstyle/appointments', booking(pro._id, at('14:00'), { mode: 'home', address: { street: 'Av. Siempre Viva 742', commune: 'Providencia' } }), c.cookie);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.appointment.pricing, { priceCLP: 12000, surchargeCLP: 3000, totalCLP: 15000 });
    const locks = (await SlotLock.find({}).sort({ slotStart: 1 })).map((l) => l.slotStart.toISOString());
    /* 13:30 (traslado) … 15:10 (40 min + 30 de vuelta) → bloques 13:30–15:15. */
    assert.equal(locks[0], at('13:30'));
    assert.equal(locks.at(-1), at('15:00'));
    assert.equal(locks.length, 7);

    const far = await post('/api/wstyle/appointments', booking(pro._id, at('16:30'), { mode: 'home', address: { street: 'Lejos 1', commune: 'Pirque' } }), c.cookie);
    assert.equal(far.status, 422);
    assert.equal(far.json.error, 'out_of_range');
    assert.equal(far.json.distanceKm, 12.4);
    assert.equal(far.json.message, 'Esta dirección está a 12,4 km; Barbero A va hasta 8 km. Puedes elegir otro barbero o atenderte en el local.');
    const none = await post('/api/wstyle/quote', { serviceId: 'corte', professionalId: String(pro._id), address: { street: 'Nada 1', commune: 'X' } });
    assert.equal(none.status, 422);
    assert.equal(none.json.error, 'address_not_found');
  });

  test('AC-09 validación por campo, honeypot y sin sesión', async () => {
    const c = await makeClient({ phone: undefined });
    await User.updateOne({ _id: c.user._id }, { $unset: { phoneE164: 1 } });
    let r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00'), { phone: '+1 555 0100', note: 'x'.repeat(301), acceptPolicies: false }), c.cookie);
    assert.equal(r.status, 400);
    assert.deepEqual(r.json.fields, { phone: 'invalid_phone', note: 'too_long', acceptPolicies: 'required' });
    r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00'), { website: 'http://spam' }), c.cookie);
    assert.equal(r.status, 200);
    assert.equal(await Appointment.countDocuments({}), 0);
    r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')));
    assert.equal(r.status, 401);
    /* El celular que faltaba se guarda en la cuenta. */
    r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00'), { phone: '9 8765 4321' }), c.cookie);
    assert.equal(r.status, 201);
    assert.equal((await User.findById(c.user._id)).phoneE164, '+56987654321');
  });

  test('CB-02 hora que ya no es válida (pasó la anticipación) → 409 slot_unavailable', async () => {
    const c = await makeClient();
    ctx.clock.now = Date.parse(at('11:00'));
    const r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'slot_unavailable');
  });

  test('AC-10 tercera cita activa de la cuenta o del mismo celular → 409; sexto intento por IP → 429', async () => {
    const c = await makeClient({ phone: '+56955555555' });
    assert.equal((await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie)).status, 201);
    assert.equal((await post('/api/wstyle/appointments', booking(pro._id, at('13:00')), c.cookie)).status, 201);
    const third = await post('/api/wstyle/appointments', booking(pro._id, at('14:00')), c.cookie);
    assert.equal(third.status, 409);
    assert.equal(third.json.error, 'too_many_active');
    /* Otra cuenta con el mismo celular. */
    const other = await makeClient({ phone: '+56955555555' });
    const r = await post('/api/wstyle/appointments', booking(pro._id, at('15:00')), other.cookie);
    assert.equal(r.json.error, 'too_many_active');

    await stop(ctx.server);
    ctx = await start({ now: SUNDAY_9AM, bookingRateLimit: { max: 5, windowMs: 10 * MIN } });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await post('/api/wstyle/appointments', booking(pro._id, at('16:00')))).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  });

  test('AC-11 cambiar el precio de la carta no cambia el total de la cita', async () => {
    const c = await makeClient();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie);
    await Service.updateOne({ slug: 'corte' }, { priceCLP: 99000, name: 'Corte premium', active: false });
    const view = await api(ctx.base, 'GET', `/api/wstyle/appointments/${json.id}`, { cookie: c.cookie });
    assert.equal(view.json.pricing.totalCLP, 12000);
    assert.equal(view.json.service.name, 'Corte');
  });

  test('AC-13 acceso a la cita: sin sesión 401, otro cliente 404, dueño/barbero/super admin 200', async () => {
    const owner = await makeClient();
    const { json } = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), owner.cookie);
    const url = `/api/wstyle/appointments/${json.id}`;
    assert.equal((await api(ctx.base, 'GET', url)).status, 401);
    const other = await makeClient({ phone: '+56912121212' });
    const o = await api(ctx.base, 'GET', url, { cookie: other.cookie });
    assert.equal(o.status, 404);
    assert.equal(o.json.error, 'not_found');
    assert.equal((await api(ctx.base, 'GET', '/api/wstyle/appointments/000000000000000000000000', { cookie: owner.cookie })).status, 404);
    assert.equal((await api(ctx.base, 'GET', url, { cookie: owner.cookie })).status, 200);
    assert.equal((await api(ctx.base, 'GET', url, { cookie: await barberCookie() })).status, 200);
    const admin = await makeClient({ roles: ['superadmin'], phone: '+56913131313' });
    assert.equal((await api(ctx.base, 'GET', url, { cookie: admin.cookie })).status, 200);
  });

  test('AC-24 "Mis citas" lista solo las de esa cuenta (próximas y pasadas)', async () => {
    const a = await makeClient({ phone: '+56914141414' });
    const b = await makeClient({ phone: '+56915151515' });
    const r1 = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), a.cookie);
    await post('/api/wstyle/appointments', booking(pro._id, at('14:00')), b.cookie);
    await post(`/api/wstyle/appointments/${r1.json.id}/cancel`, {}, a.cookie);
    await post('/api/wstyle/appointments', booking(pro._id, at('16:00')), a.cookie);
    const mine = await api(ctx.base, 'GET', '/api/wstyle/appointments/mine', { cookie: a.cookie });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.json.upcoming.map((x) => x.when.slice(-5)), ['16:00']);
    assert.deepEqual(mine.json.past.map((x) => x.status), ['cancelada']);
    assert.equal((await api(ctx.base, 'GET', '/api/wstyle/appointments/mine')).status, 401);
  });

  test('CB-24 un barbero no puede reservarse consigo mismo; sin rol cliente → 403 not_client', async () => {
    const bCookie = await barberCookie();
    let r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), bCookie);
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'not_client');
    await post('/api/auth/me/client-role', {}, bCookie);
    r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), bCookie);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'self_booking');
    const other = seeded.pros[1];
    r = await post('/api/wstyle/appointments', booking(other._id, at('12:00')), bCookie);
    assert.equal(r.status, 201);
  });

  test('AC-14 si el correo falla, la cita se crea igual', async () => {
    await stop(ctx.server);
    const broken = { outbox: [], mode: 'resend', send: async () => ({ ok: false, status: 'failed', error: 'boom' }) };
    ctx = await start({ now: SUNDAY_9AM, mailer: broken });
    const c = await makeClient();
    const r = await post('/api/wstyle/appointments', booking(pro._id, at('12:00')), c.cookie);
    assert.equal(r.status, 201);
    assert.equal(r.json.mailOk, false);
    assert.equal(await Appointment.countDocuments({}), 1);
  });
});

describe('agenda sin BD conectada', () => {
  test('responde 503 db_unavailable (no se cae)', async () => {
    const app = createApp({ env: {}, logger: silent });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const r = await api(base, 'GET', '/api/wstyle/catalog');
    assert.equal(r.status, 503);
    await stop(server);
  });
});
