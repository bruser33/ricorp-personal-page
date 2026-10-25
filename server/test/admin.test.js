/* SPEC-34 AC-01…AC-10: panel del super admin contra la BD de test REAL (replica set de un
   nodo), mailer en dry-run y reloj inyectado. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Appointment, AuditLog, Business, Membership, PanelNotification, Professional, Service, SlotLock, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { ensureSuperAdmin } from '../src/seed-admin.js';
import { hoursFromSite, importCatalog, readContent } from '../src/seed.js';
import { CSV_COLUMNS } from '../src/domain/admin.js';
import { api, connectDb, disconnectDb, makeClient, MIN, PRO_A, PRO_B, PRO_C, resetDb, seed, sessionCookie, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';

function captureLogger() {
  const lines = [];
  return { lines, log: (...a) => lines.push(['log', a.join(' ')]), warn: (...a) => lines.push(['warn', a.join(' ')]), error: (...a) => lines.push(['error', a.join(' ')]) };
}

describe('AC-01 seed del super admin', () => {
  let ctx;
  before(connectDb);
  after(disconnectDb);
  beforeEach(resetDb);
  after(async () => ctx && stop(ctx.server));

  test('sin super admins y con variables → crea uno con contraseña hasheada y puede entrar', async () => {
    const out = await ensureSuperAdmin({ env: { SUPERADMIN_EMAIL: 'Dueno@WStyle.test', SUPERADMIN_PASSWORD: 'tijeras2026' }, logger: captureLogger() });
    assert.equal(out.created, true);
    const u = await User.findOne({ email: ADMIN_EMAIL });
    assert.deepEqual([...u.roles], ['superadmin']);
    const id = u.identities.find((i) => i.provider === 'email');
    assert.match(id.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(id.passwordHash, 'tijeras2026');
    await seed();
    ctx = await start({ now: SUNDAY_9AM });
    const login = await api(ctx.base, 'POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: 'tijeras2026' } });
    assert.equal(login.status, 200);
    const ov = await api(ctx.base, 'GET', '/api/admin/overview', { cookie: sessionCookie(login.headers) });
    assert.equal(ov.status, 200);
    assert.equal((await api(ctx.base, 'GET', '/api/admin/status')).json.configured, true);
    await stop(ctx.server);
    ctx = null;
  });

  test('CB-02 con uno existente → no crea otro ni cambia su contraseña aunque cambien las variables', async () => {
    await ensureSuperAdmin({ env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, SUPERADMIN_PASSWORD: 'tijeras2026' }, logger: captureLogger() });
    const hash = (await User.findOne({ email: ADMIN_EMAIL })).identities[0].passwordHash;
    const out = await ensureSuperAdmin({ env: { SUPERADMIN_EMAIL: 'otro@wstyle.test', SUPERADMIN_PASSWORD: 'navajas2027' }, logger: captureLogger() });
    assert.equal(out.created, false);
    assert.equal(out.reason, 'exists');
    assert.equal(await User.countDocuments({ roles: 'superadmin' }), 1);
    assert.equal(await User.countDocuments({ email: 'otro@wstyle.test' }), 0);
    assert.equal((await User.findOne({ email: ADMIN_EMAIL })).identities[0].passwordHash, hash);
  });

  test('CB-01 sin variables → no crea nada, loguea aviso y el panel dice "no configurado"', async () => {
    const logger = captureLogger();
    const out = await ensureSuperAdmin({ env: {}, logger });
    assert.equal(out.created, false);
    assert.equal(out.reason, 'unconfigured');
    assert.ok(logger.lines.some(([lvl, l]) => lvl === 'warn' && /SUPERADMIN_EMAIL/.test(l)));
    assert.equal(await User.countDocuments({ roles: 'superadmin' }), 0);
    await seed();
    ctx = await start({ now: SUNDAY_9AM });
    assert.deepEqual((await api(ctx.base, 'GET', '/api/admin/status')).json, { configured: false });
    await stop(ctx.server);
    ctx = null;
  });

  test('contraseña débil → no crea (y lo avisa)', async () => {
    const logger = captureLogger();
    const out = await ensureSuperAdmin({ env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, SUPERADMIN_PASSWORD: 'corta' }, logger });
    assert.equal(out.created, false);
    assert.equal(out.reason, 'weak_password');
    assert.equal(await User.countDocuments({}), 0);
  });
});

/* ─── Infra común del panel */
function panel({ pros = [PRO_A, PRO_B], env = {}, onlinePayments } = {}) {
  const t = { ctx: null, seeded: null, admin: null };
  t.boot = async (opts = {}) => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ pros: opts.pros || pros });
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...env, ...(opts.env || {}) }, onlinePayments: opts.onlinePayments ?? onlinePayments, geocoder: async () => ({ lat: -33.4378, lng: -70.6506 + 5 / 92.83, formatted: '5 km' }) });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
    return t;
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.get = (path, cookie = t.admin.cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.post = (path, body = {}, cookie = t.admin.cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  t.put = (path, body = {}, cookie = t.admin.cookie) => api(t.ctx.base, 'PUT', path, { body, cookie });
  t.patch = (path, body = {}, cookie = t.admin.cookie) => api(t.ctx.base, 'PATCH', path, { body, cookie });
  t.del = (path, cookie = t.admin.cookie) => api(t.ctx.base, 'DELETE', path, { cookie });
  t.pro = (i) => t.seeded.pros[i];
  /* Barbero con sesión (User barber vinculado al Professional del seed). */
  t.barberCookie = async (p) => {
    const user = await User.findById(p.userId);
    const c = await makeClient({ name: p.displayName, email: `sesion.${user.email}`, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };
  t.book = async ({ pro, time = '12:00', date = MONDAY, service = 'corte', client, extra = {} }) => {
    const c = client || (await makeClient({ name: 'Ana Pérez', email: `ana${Math.random().toString(36).slice(2, 7)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` }));
    const r = await t.post('/api/wstyle/appointments', { serviceId: service, professionalId: String(pro._id), startsAt: at(time, date), mode: 'shop', acceptPolicies: true, paymentMethod: 'local', ...extra }, c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return { id: r.json.id, client: c };
  };
  return t;
}

describe('AC-03 ciclo de vida del barbero', () => {
  const t = panel({ pros: [PRO_A, { ...PRO_B, membershipStatus: 'pending' }, { ...PRO_C, membershipStatus: 'pending' }] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('aprobar: Membership aprobada, correo de bienvenida, auditoría y aparece en la reserva', async () => {
    const b = t.pro(1);
    await Membership.updateOne({ professionalId: b._id }, { submittedAt: new Date(SUNDAY_9AM) });
    const list = await t.get('/api/admin/barbers?status=pending');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.items.map((x) => x.name).sort(), ['Barbero B', 'Barbero C']);
    assert.equal(list.json.counts.pending, 2);
    assert.equal((await t.get('/api/admin/overview')).json.cards.pendingBarbers, 1);
    let cat = await t.get('/api/wstyle/catalog', null);
    assert.ok(!cat.json.professionals.some((p) => p.name === 'Barbero B'));
    const r = await t.post(`/api/admin/barbers/${b._id}/approve`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await Membership.findOne({ professionalId: b._id })).status, 'approved');
    assert.ok(t.ctx.mailer.outbox.some((m) => m.to === 'b@barberos.test' && /Bienvenido/.test(m.subject)));
    const log = await AuditLog.findOne({ action: 'barber.approve' });
    assert.equal(String(log.actorUserId), String(t.admin.user._id));
    assert.deepEqual(log.before, { status: 'pending', reason: null });
    assert.equal(log.after.status, 'approved');
    cat = await t.get('/api/wstyle/catalog', null);
    assert.ok(cat.json.professionals.some((p) => p.name === 'Barbero B'));
    /* Aprobar dos veces → 409. */
    assert.equal((await t.post(`/api/admin/barbers/${b._id}/approve`)).status, 409);
  });

  test('rechazar exige motivo, se le envía, y solo vuelve a postular si el admin lo reabre', async () => {
    const c = t.pro(2);
    const noReason = await t.post(`/api/admin/barbers/${c._id}/reject`, { reason: '  ' });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.json.fields.reason, 'required');
    const r = await t.post(`/api/admin/barbers/${c._id}/reject`, { reason: 'Faltan fotos de tus trabajos' });
    assert.equal(r.status, 200);
    const m = await Membership.findOne({ professionalId: c._id });
    assert.equal(m.status, 'rejected');
    assert.equal(m.reason, 'Faltan fotos de tus trabajos');
    assert.ok(t.ctx.mailer.outbox.some((x) => x.to === 'c@barberos.test' && /no fue aprobado/.test(x.subject) && /Faltan fotos/.test(x.text)));
    assert.ok(await AuditLog.exists({ action: 'barber.reject' }));
    /* El rechazado no puede reenviar su perfil… */
    const cookie = await t.barberCookie(c);
    assert.equal((await t.post('/api/pro/submit', {}, cookie)).status, 403);
    /* …hasta que el admin lo reabre. */
    assert.equal((await t.post(`/api/admin/barbers/${c._id}/reopen`)).status, 200);
    const again = await Membership.findOne({ professionalId: c._id });
    assert.equal(again.status, 'pending');
    assert.equal(again.submittedAt, undefined);
    assert.notEqual((await t.post('/api/pro/submit', {}, cookie)).status, 403);
  });

  test('suspender (motivo obligatorio) lista sus citas futuras sin cancelarlas y lo saca de la disponibilidad; reactivar lo devuelve', async () => {
    const a = t.pro(0);
    const { id } = await t.book({ pro: a });
    assert.equal((await t.post(`/api/admin/barbers/${a._id}/suspend`, {})).status, 400);
    const r = await t.post(`/api/admin/barbers/${a._id}/suspend`, { reason: 'Reclamos de clientes' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.membership.status, 'suspended');
    assert.equal(r.json.futureAppointments.length, 1);
    assert.equal(r.json.futureAppointments[0].id, id);
    /* Asunción 2: la cita sigue viva (el admin decide cita por cita). */
    assert.equal((await Appointment.findById(id)).status, 'pendiente');
    assert.ok(t.ctx.mailer.outbox.some((x) => x.to === 'a@barberos.test' && /suspendido/.test(x.subject)));
    const avail = await t.get(`/api/wstyle/availability?service=corte&professional=${a._id}&from=${MONDAY}&to=${MONDAY}`, null);
    assert.equal(avail.json.days.reduce((n, d) => n + d.slots.length, 0), 0);
    /* CB-03: alerta fija en el inicio + aviso en la bandeja. */
    const ov = await t.get('/api/admin/overview');
    assert.equal(ov.json.alerts.length, 1);
    assert.match(ov.json.alerts[0].message, /1 cita futura/);
    assert.ok(await PanelNotification.exists({ userId: t.admin.user._id, kind: 'suspended_with_appointments' }));
    assert.ok(await AuditLog.exists({ action: 'barber.suspend', 'after.status': 'suspended' }));
    /* El suspendido no opera. */
    const cookie = await t.barberCookie(a);
    assert.equal((await t.get('/api/pro/agenda', cookie)).status, 403);
    const re = await t.post(`/api/admin/barbers/${a._id}/reactivate`);
    assert.equal(re.status, 200);
    const back = await t.get(`/api/wstyle/availability?service=corte&professional=${a._id}&from=${MONDAY}&to=${MONDAY}`, null);
    assert.ok(back.json.days[0].slots.length > 0);
    assert.ok(await AuditLog.exists({ action: 'barber.reactivate' }));
  });

  test('ficha del barbero: datos, servicios, disponibilidad, citas y métricas', async () => {
    const a = t.pro(0);
    await t.book({ pro: a });
    const r = await t.get(`/api/admin/barbers/${a._id}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.professional.displayName, 'Barbero A');
    assert.equal(r.json.professional.email, 'a@barberos.test');
    assert.equal(r.json.rules.length, 5);
    assert.ok(r.json.services.find((s) => s.id === 'corte').selected);
    assert.equal(r.json.futureAppointments.length, 1);
    assert.equal(r.json.metrics.appointments, 1);
    assert.equal((await t.get('/api/admin/barbers/000000000000000000000000')).status, 404);
  });

  test('el admin edita servicios y disponibilidad de un barbero (queda auditado)', async () => {
    const c = t.pro(2);
    const r = await t.put(`/api/admin/barbers/${c._id}/services`, { serviceIds: ['corte', 'corte-barba'] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.serviceIds.sort(), ['corte', 'corte-barba']);
    const av = await t.put(`/api/admin/barbers/${c._id}/availability`, { rules: [{ weekday: 1, start: '09:00', end: '13:00' }] });
    assert.equal(av.status, 200);
    assert.deepEqual(av.json.rules, [{ weekday: 1, start: '10:00', end: '13:00' }]);
    assert.ok(await AuditLog.exists({ action: 'barber.services' }));
    assert.ok(await AuditLog.exists({ action: 'barber.availability' }));
  });

  test('CB-11 el admin no puede suspenderse a sí mismo ni borrar la única cuenta de super admin', async () => {
    const c = t.pro(2);
    await Professional.updateOne({ _id: c._id }, { userId: t.admin.user._id });
    await Membership.updateOne({ professionalId: c._id }, { status: 'approved' });
    const r = await t.post(`/api/admin/barbers/${c._id}/suspend`, { reason: 'prueba' });
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'self_action');
    const del = await t.del('/api/auth/me');
    assert.equal(del.status, 409);
    assert.equal(del.json.error, 'last_superadmin');
    assert.equal((await User.findById(t.admin.user._id)).status, 'active');
  });
});

describe('AC-04 citas del admin', () => {
  const t = panel({ pros: [PRO_A, PRO_B, PRO_C] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('filtros por fecha, barbero, estado, pago, domicilio y búsqueda', async () => {
    const [a, b] = [t.pro(0), t.pro(1)];
    const ana = await makeClient({ name: 'Ana Pérez', email: 'ana@clientes.test', phone: '+56911112222' });
    const bruno = await makeClient({ name: 'Bruno Díaz', email: 'bruno@clientes.test', phone: '+56933334444' });
    const x1 = await t.book({ pro: a, time: '12:00', client: ana });
    await t.book({ pro: b, time: '13:00', service: 'corte-barba', client: bruno });
    await t.book({ pro: a, time: '12:00', date: TUESDAY, client: ana });
    const list = async (q) => (await t.get('/api/admin/appointments?' + new URLSearchParams(q))).json.items;
    assert.equal((await list({ from: MONDAY, to: MONDAY })).length, 2);
    assert.equal((await list({ from: TUESDAY })).length, 1);
    assert.equal((await list({ professional: String(b._id) })).length, 1);
    assert.equal((await list({ status: 'pendiente' })).length, 3);
    assert.equal((await t.post(`/api/admin/appointments/${x1.id}/confirm`)).status, 200);
    const conf = await list({ status: 'confirmada' });
    assert.deepEqual(conf.map((x) => x.id), [x1.id]);
    assert.equal((await list({ q: 'bruno' })).length, 1);
    assert.equal((await list({ q: '3333 4444' })).length, 1);
    assert.equal((await list({ q: 'ana@clientes' })).length, 2);
    assert.equal((await list({ paymentMethod: 'local', paymentStatus: 'pendiente' })).length, 3);
    assert.equal((await list({ mode: 'home' })).length, 0);
    assert.equal((await list({ mode: 'shop' })).length, 3);
    assert.equal((await t.get('/api/admin/appointments?from=2026-13-01')).status, 400);
    /* Cada item trae el email del cliente (solo el admin lo ve). */
    assert.equal(conf[0].customer.email, 'ana@clientes.test');
  });

  test('reasignar valida servicio y disponibilidad y mueve los bloques en la misma transacción', async () => {
    const [a, b, c] = [t.pro(0), t.pro(1), t.pro(2)];
    const x = await t.book({ pro: a, time: '12:00', service: 'corte' });
    const busyB = await t.book({ pro: b, time: '13:00', service: 'corte-barba' });
    await t.book({ pro: a, time: '13:00', service: 'corte' });
    const opts = await t.get(`/api/admin/appointments/${x.id}/reassign-options`);
    assert.deepEqual(opts.json.options.map((o) => o.name).sort(), ['Barbero B', 'Barbero C']);
    const r = await t.post(`/api/admin/appointments/${x.id}/reassign`, { professionalId: String(b._id) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.professional.name, 'Barbero B');
    const appt = await Appointment.findById(x.id);
    assert.equal(String(appt.professionalId), String(b._id));
    assert.equal(appt.pricing.totalCLP, 12000);
    const locks = await SlotLock.find({ appointmentId: appt._id });
    assert.equal(locks.length, 3);
    assert.ok(locks.every((l) => String(l.professionalId) === String(b._id)));
    assert.ok(appt.history.at(-1).reason.includes('Reasignada de Barbero A a Barbero B'));
    assert.ok(t.ctx.mailer.outbox.some((m) => /Cambió el barbero/.test(m.subject)));
    const log = await AuditLog.findOne({ action: 'appointment.reassign' });
    assert.equal(log.before.professional, 'Barbero A');
    assert.equal(log.after.professional, 'Barbero B');
    /* CB-04: A ocupado a las 13:00 → no aparece y forzarlo da 409. */
    const busyOpts = await t.get(`/api/admin/appointments/${busyB.id}/reassign-options`);
    assert.ok(!busyOpts.json.options.some((o) => o.id === String(a._id)));
    /* C no hace "Corte + barba". */
    assert.ok(!busyOpts.json.options.some((o) => o.id === String(c._id)));
    for (const target of [a, c]) {
      const forced = await t.post(`/api/admin/appointments/${busyB.id}/reassign`, { professionalId: String(target._id) });
      assert.equal(forced.status, 409);
    }
    assert.equal(String((await Appointment.findById(busyB.id)).professionalId), String(b._id));
  });

  test('cancelar exige motivo; inasistencia, cobro en el local y crear cita por teléfono', async () => {
    const a = t.pro(0);
    const x = await t.book({ pro: a, time: '12:00' });
    assert.equal((await t.post(`/api/admin/appointments/${x.id}/cancel`, {})).status, 400);
    const c = await t.post(`/api/admin/appointments/${x.id}/cancel`, { reason: 'Local cerrado por corte de luz' });
    assert.equal(c.status, 200);
    assert.equal(c.json.status, 'cancelada');
    assert.equal(await SlotLock.countDocuments({ appointmentId: x.id }), 0);
    assert.ok(t.ctx.mailer.outbox.some((m) => m.to === 'a@barberos.test' && /WS Style canceló/.test(m.subject)));
    /* Por teléfono: queda confirmada, a nombre del cliente. */
    const n = await t.post('/api/admin/appointments', { name: 'Carlos Soto', phone: '9 8888 7777', serviceId: 'corte', professionalId: String(a._id), startsAt: at('15:00') });
    assert.equal(n.status, 201, JSON.stringify(n.json));
    assert.equal(n.json.status, 'confirmada');
    const appt = await Appointment.findById(n.json.id);
    assert.equal(appt.source, 'admin');
    assert.equal(appt.customerSnapshot.phoneE164, '+56988887777');
    assert.equal(await SlotLock.countDocuments({ appointmentId: appt._id }), 3);
    /* Hora ocupada → 409. */
    assert.equal((await t.post('/api/admin/appointments', { name: 'Otro', phone: '9 8888 6666', serviceId: 'corte', professionalId: String(a._id), startsAt: at('15:00') })).status, 409);
    /* Inasistencia y cobro: el reloj pasa la hora. */
    t.ctx.clock.now = Date.parse(at('15:20'));
    const ns = await t.post(`/api/admin/appointments/${n.json.id}/no-show`);
    assert.equal(ns.status, 200);
    assert.equal(ns.json.status, 'no_asistio');
    const y = await t.post('/api/admin/appointments', { name: 'Diana', phone: '9 7777 1111', serviceId: 'corte', professionalId: String(a._id), startsAt: at('16:00') });
    t.ctx.clock.now = Date.parse(at('16:00'));
    assert.equal((await t.post(`/api/admin/appointments/${y.json.id}/start`)).status, 200);
    assert.equal((await t.post(`/api/admin/appointments/${y.json.id}/finish`)).status, 200);
    const col = await t.post(`/api/admin/appointments/${y.json.id}/collect`);
    assert.equal(col.status, 200, JSON.stringify(col.json));
    assert.equal(col.json.payment.status, 'cobrado');
    assert.equal((await t.post(`/api/admin/appointments/${y.json.id}/collect`)).status, 409);
    for (const action of ['appointment.cancel', 'appointment.create', 'appointment.no_show', 'appointment.collect']) assert.ok(await AuditLog.exists({ action }), action);
  });

  test('CSV con las columnas acordadas', async () => {
    const a = t.pro(0);
    const ana = await makeClient({ name: 'Ana "La Jefa" Pérez', email: 'ana@clientes.test', phone: '+56911112222' });
    await t.book({ pro: a, time: '12:00', client: ana });
    await t.book({ pro: a, time: '12:00', date: TUESDAY });
    const res = await fetch(`${t.ctx.base}/api/admin/appointments.csv?from=${MONDAY}&to=${MONDAY}`, { headers: { Cookie: t.admin.cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const text = (await res.text()).replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    assert.equal(lines[0], CSV_COLUMNS.map(([, h]) => h).join(','));
    assert.equal(lines[0], 'ID,Fecha,Hora,Barbero,Cliente,Celular,Email,Servicio,Modalidad,Dirección,Estado,Precio,Recargo,Total,Método de pago,Estado del pago,Comisión,Origen');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes(`${MONDAY},12:00,Barbero A,"Ana ""La Jefa"" Pérez",+56911112222,ana@clientes.test,Corte,Local,,Esperando confirmación,12000,0,12000,En el local,pendiente,0,web`), lines[1]);
    /* Sin sesión de admin → 401/403. */
    assert.equal((await fetch(`${t.ctx.base}/api/admin/appointments.csv`)).status, 401);
  });
});

describe('AC-05 carta', () => {
  const t = panel({ pros: [PRO_A, PRO_C] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('CB-06 validaciones: precio entero > 0 y duración 5–240 múltiplo de 5', async () => {
    const base = { name: 'Corte niño', priceCLP: 9000, durationMin: 30 };
    for (const [patch, field] of [
      [{ priceCLP: 0 }, 'priceCLP'],
      [{ priceCLP: -500 }, 'priceCLP'],
      [{ priceCLP: 9000.5 }, 'priceCLP'],
      [{ priceCLP: '9.000' }, 'priceCLP'],
      [{ durationMin: 42 }, 'durationMin'],
      [{ durationMin: 0 }, 'durationMin'],
      [{ durationMin: 245 }, 'durationMin'],
      [{ name: '' }, 'name'],
    ]) {
      const r = await t.post('/api/admin/services', { ...base, ...patch });
      assert.equal(r.status, 400, JSON.stringify(patch));
      assert.ok(r.json.fields[field], JSON.stringify(r.json));
      assert.ok(r.json.message);
    }
    const ok = await t.post('/api/admin/services', base);
    assert.equal(ok.status, 201);
    assert.equal(ok.json.service.id, 'corte-nino');
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.ok(cat.json.services.some((s) => s.id === 'corte-nino' && s.priceCLP === 9000));
  });

  test('cambiar el precio no altera citas existentes; conflicto de versión → 409', async () => {
    const x = await t.book({ pro: t.pro(0) });
    const { items } = (await t.get('/api/admin/services')).json;
    const corte = items.find((s) => s.id === 'corte');
    assert.equal(corte.appointments, 1);
    const r = await t.patch(`/api/admin/services/${corte._id}`, { priceCLP: 15000, updatedAt: corte.updatedAt });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.service.priceCLP, 15000);
    assert.equal((await Appointment.findById(x.id)).pricing.totalCLP, 12000);
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.equal(cat.json.services.find((s) => s.id === 'corte').priceCLP, 15000);
    const log = await AuditLog.findOne({ action: 'service.price' });
    assert.equal(log.before.priceCLP, 12000);
    assert.equal(log.after.priceCLP, 15000);
    /* CB-09: la otra pestaña todavía tiene la versión vieja. */
    const stale = await t.patch(`/api/admin/services/${corte._id}`, { priceCLP: 13000, updatedAt: corte.updatedAt });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error, 'stale');
    assert.match(stale.json.message, /cambió mientras lo editabas/);
    assert.equal((await Service.findById(corte._id)).priceCLP, 15000);
  });

  test('con citas se archiva (y avisa si un barbero queda sin servicios); sin citas se borra', async () => {
    await t.book({ pro: t.pro(0) });
    const { items } = (await t.get('/api/admin/services')).json;
    const corte = items.find((s) => s.id === 'corte');
    const r = await t.del(`/api/admin/services/${corte._id}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.result, 'archived');
    /* CB-05: Barbero C solo hacía "Corte" → deja de ser reservable. */
    assert.deepEqual(r.json.unbookableBarbers, ['Barbero C']);
    assert.ok(await Service.exists({ _id: corte._id, active: false, archivedAt: { $ne: null } }));
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.ok(!cat.json.services.some((s) => s.id === 'corte'));
    assert.ok(!cat.json.professionals.some((p) => p.name === 'Barbero C'));
    assert.ok(cat.json.professionals.some((p) => p.name === 'Barbero A'));
    const after = (await t.get('/api/admin/services')).json.items.find((s) => s.id === 'corte');
    assert.equal(after.archived, true);
    /* Desarchivar lo devuelve. */
    const back = await t.patch(`/api/admin/services/${corte._id}`, { archived: false, updatedAt: after.updatedAt });
    assert.equal(back.status, 200);
    assert.ok((await t.get('/api/wstyle/catalog', null)).json.professionals.some((p) => p.name === 'Barbero C'));
    /* Sin citas: se borra de verdad. */
    const barba = items.find((s) => s.id === 'corte-barba');
    const d = await t.del(`/api/admin/services/${barba._id}`);
    assert.equal(d.json.result, 'deleted');
    assert.equal(await Service.countDocuments({ _id: barba._id }), 0);
    for (const action of ['service.archive', 'service.delete']) assert.ok(await AuditLog.exists({ action }), action);
  });
});

describe('AC-06 horario y cierres', () => {
  const t = panel({ pros: [PRO_A] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  const slots = async (date) => {
    const r = await t.get(`/api/wstyle/availability?service=corte&professional=any&from=${date}&to=${date}`, null);
    return r.json.days.find((d) => d.date === date)?.slots.map((s) => s.label) ?? [];
  };

  test('un cierre deja esos días sin horas; con citas en esas fechas → 409 con la lista', async () => {
    assert.ok((await slots(MONDAY)).length > 0);
    assert.equal((await t.post('/api/admin/schedule/closures', { fromDate: MONDAY, toDate: TUESDAY })).status, 400);
    const r = await t.post('/api/admin/schedule/closures', { fromDate: MONDAY, toDate: TUESDAY, reason: 'Fiestas' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual(r.json.closures.map((c) => c.date), [MONDAY, TUESDAY]);
    assert.deepEqual(await slots(MONDAY), []);
    assert.deepEqual(await slots(TUESDAY), []);
    assert.ok((await slots('2026-11-04')).length > 0);
    assert.ok(await AuditLog.exists({ action: 'schedule.closure_add' }));
    const x = await t.book({ pro: t.pro(0), date: '2026-11-04' });
    const clash = await t.post('/api/admin/schedule/closures', { fromDate: '2026-11-04', reason: 'Mantención' });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error, 'closure_conflict');
    assert.deepEqual(clash.json.appointments.map((a) => a.id), [x.id]);
    /* Quitar el cierre devuelve las horas. */
    const del = await t.del(`/api/admin/schedule/closures/${r.json.closures[0].id}`);
    assert.equal(del.status, 200);
    assert.ok((await slots(MONDAY)).length > 0);
  });

  test('reducir el horario con citas afectadas → 409 con la lista; varios rangos por día', async () => {
    const x = await t.book({ pro: t.pro(0), time: '12:00' });
    const week = (await t.get('/api/admin/schedule')).json.week;
    assert.deepEqual(week[0], { weekday: 1, ranges: [{ opens: '10:00', closes: '20:00' }] });
    const shorter = week.map((d) => (d.weekday === 1 ? { ...d, ranges: [{ opens: '10:00', closes: '12:30' }] } : d));
    const r = await t.put('/api/admin/schedule/hours', { week: shorter });
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'schedule_conflict');
    assert.deepEqual(r.json.appointments.map((a) => a.id), [x.id]);
    /* Validación: rangos que se pisan. */
    const bad = week.map((d) => (d.weekday === 2 ? { ...d, ranges: [{ opens: '10:00', closes: '14:00' }, { opens: '13:00', closes: '18:00' }] } : d));
    assert.equal((await t.put('/api/admin/schedule/hours', { week: bad })).status, 400);
    /* Martes con almuerzo: 10–14 y 15–20. Lunes intacto (la cita sigue cabiendo). */
    const lunch = week.map((d) => (d.weekday === 2 ? { ...d, ranges: [{ opens: '10:00', closes: '14:00' }, { opens: '15:00', closes: '20:00' }] } : d));
    const ok = await t.put('/api/admin/schedule/hours', { week: lunch });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const tue = await slots(TUESDAY);
    assert.ok(tue.includes('13:15'));
    assert.ok(!tue.includes('13:30'));
    assert.ok(!tue.includes('14:30'));
    assert.ok(tue.includes('15:00'));
    const log = await AuditLog.findOne({ action: 'schedule.hours' });
    assert.deepEqual(log.before[1].ranges, [{ opens: '10:00', closes: '20:00' }]);
    assert.equal(log.after[1].ranges.length, 2);
    /* La landing recibe el horario en el formato de site.json. */
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.deepEqual(cat.json.business.hoursRows.filter((h) => h.dayCodes === 'Tu'), [
      { days: 'Martes', dayCodes: 'Tu', opens: '10:00', closes: '14:00' },
      { days: 'Martes', dayCodes: 'Tu', opens: '15:00', closes: '20:00' },
    ]);
  });
});

describe('AC-07 migración de la carta y exportación', () => {
  const t = panel({ pros: [PRO_A] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('el seed importa services.json y el horario de site.json; idempotente y no pisa lo editado', async () => {
    await resetDb();
    const content = readContent();
    const first = await importCatalog(content);
    assert.equal(first.created, content.services.length);
    await Service.updateOne({ businessId: first.business._id, slug: 'corte' }, { priceCLP: 14000 });
    await Business.updateOne({ _id: first.business._id }, { hours: [{ weekday: 1, opens: '11:00', closes: '19:00' }] });
    const second = await importCatalog(content);
    assert.equal(second.created, 0);
    assert.equal(await Service.countDocuments({}), content.services.length);
    assert.equal(await Business.countDocuments({}), 1);
    assert.equal((await Service.findOne({ slug: 'corte' })).priceCLP, 14000);
    assert.deepEqual((await Business.findOne({})).hours.map((h) => h.opens), ['11:00']);
  });

  test('GET /api/wstyle/catalog devuelve lo de la BD y el horario en el formato de site.json', async () => {
    await resetDb();
    const content = readContent();
    await importCatalog(content);
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.deepEqual(cat.json.services.map((s) => s.id), content.services.map((s) => s.id));
    const rows = content.site.hours.map(({ days, dayCodes, opens, closes }) => ({ days, dayCodes, opens: opens ?? null, closes: closes ?? null }));
    assert.deepEqual(cat.json.business.hoursRows, rows);
    assert.equal(hoursFromSite(content.site).length, 7);
  });

  test('"Exportar a JSON" produce el mismo formato que services.json', async () => {
    const r = await t.get('/api/admin/export');
    assert.equal(r.status, 200);
    const original = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../client/public/wstyle/content/services.json'), 'utf8'));
    const keys = Object.keys(original[0]).filter((k) => k !== 'placeholder');
    for (const s of r.json.services) assert.deepEqual(Object.keys(s), keys);
    assert.deepEqual(r.json.services.map((s) => s.id), ['corte', 'corte-barba']);
    assert.deepEqual(Object.keys(r.json.hours[0]), ['days', 'dayCodes', 'opens', 'closes']);
    assert.deepEqual(r.json.hours[0], { days: 'Lunes a viernes', dayCodes: 'Mo-Fr', opens: '10:00', closes: '20:00' });
    assert.ok(await AuditLog.exists({ action: 'content.export' }));
  });
});

describe('AC-08 estadísticas', () => {
  const t = panel({ pros: [PRO_A, PRO_B] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  async function seedKnown() {
    const b = t.seeded.business;
    const [A, B] = [t.pro(0), t.pro(1)];
    const svc = Object.fromEntries(t.seeded.services.map((s) => [s.slug, s]));
    const mk = (pro, date, time, slug, status, { total, method = 'local', pay = 'pendiente', fee = 0, home = false } = {}) => {
      const s = svc[slug];
      const startsAt = new Date(zonedToUtc(date, time, TZ));
      return {
        businessId: b._id,
        professionalId: pro._id,
        customerSnapshot: { name: 'Cliente', phoneE164: '+56911111111' },
        serviceSnapshot: { serviceId: s._id, slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin },
        professionalSnapshot: { displayName: pro.displayName },
        startsAt,
        endsAt: new Date(startsAt.getTime() + s.durationMin * MIN),
        location: { kind: home ? 'home' : 'shop' },
        pricing: { priceCLP: s.priceCLP, surchargeCLP: (total ?? s.priceCLP) - s.priceCLP, totalCLP: total ?? s.priceCLP, platformFeeRate: 0, platformFeeCLP: fee },
        payment: { method, status: pay },
        status,
        history: [],
      };
    };
    await Appointment.insertMany([
      mk(A, '2026-11-02', '12:00', 'corte', 'terminada', { pay: 'cobrado' }),
      mk(A, '2026-11-02', '13:00', 'corte-barba', 'terminada', { method: 'online', pay: 'pagado', fee: 1800 }),
      mk(A, '2026-11-03', '12:00', 'corte', 'terminada', { pay: 'pago_pendiente' }),
      mk(A, '2026-11-04', '12:00', 'corte', 'cancelada'),
      mk(B, '2026-11-02', '12:00', 'corte', 'terminada', { total: 15000, pay: 'cobrado', home: true }),
      mk(B, '2026-11-03', '12:00', 'corte-barba', 'confirmada'),
      mk(B, '2026-11-05', '12:00', 'corte', 'no_asistio'),
      /* Fuera del mes: no cuenta. */
      mk(A, '2026-12-01', '12:00', 'corte', 'terminada', { total: 99999, pay: 'cobrado' }),
      mk(A, '2026-10-31', '23:30', 'corte', 'terminada', { total: 88888, pay: 'cobrado' }),
    ]);
  }

  test('totales del mes en curso coinciden con los calculados a mano', async () => {
    await seedKnown();
    const r = await t.get('/api/admin/stats');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const s = r.json;
    assert.equal(s.from, '2026-11-01');
    assert.equal(s.to, '2026-11-30');
    assert.equal(s.total, 7);
    assert.equal(s.byStatus.terminada, 4);
    assert.equal(s.byStatus.cancelada, 1);
    assert.equal(s.byStatus.confirmada, 1);
    assert.equal(s.byStatus.no_asistio, 1);
    /* 12.000 + 18.000 + 12.000 + 15.000 */
    assert.deepEqual(s.revenue, { totalCLP: 57000, onlineCLP: 18000, localCLP: 27000, pendingCLP: 12000 });
    assert.equal(s.averageTicketCLP, 14250);
    assert.deepEqual(s.topServices.map((x) => [x.id, x.count]), [['corte', 4], ['corte-barba', 2]]);
    assert.equal(s.homePct, 16.7);
    assert.equal(s.platformFeeCLP, 1800);
    const A = s.barbers.find((x) => x.name === 'Barbero A');
    const B = s.barbers.find((x) => x.name === 'Barbero B');
    /* 21 días hábiles en nov-2026 × 6 h (12–18) = 7.560 min disponibles. */
    assert.deepEqual(A, { id: String(t.pro(0)._id), name: 'Barbero A', appointments: 4, finished: 3, revenueCLP: 42000, cancellations: 1, noShows: 0, bookedMin: 140, availableMin: 7560, occupancyPct: 1.9 });
    assert.deepEqual(B, { id: String(t.pro(1)._id), name: 'Barbero B', appointments: 3, finished: 1, revenueCLP: 15000, cancellations: 0, noShows: 1, bookedMin: 140, availableMin: 7560, occupancyPct: 1.9 });
    assert.equal(s.days.length, 30);
    assert.deepEqual(s.days.find((d) => d.date === '2026-11-02'), { date: '2026-11-02', appointments: 3, revenueCLP: 45000 });
  });

  test('CB-10 un rango que cruza el cambio de hora no pierde ni duplica horas', async () => {
    const b = t.seeded.business;
    const A = t.pro(0);
    const svc = t.seeded.services[0];
    const mk = (date, time) => {
      const startsAt = new Date(zonedToUtc(date, time, TZ));
      return { businessId: b._id, professionalId: A._id, serviceSnapshot: { serviceId: svc._id, slug: 'corte', name: 'Corte', priceCLP: 12000, durationMin: 40 }, startsAt, endsAt: new Date(startsAt.getTime() + 40 * MIN), pricing: { totalCLP: 12000 }, payment: { method: 'local', status: 'cobrado' }, status: 'terminada', history: [] };
    };
    /* Chile adelanta la hora el domingo 6-sep-2026 a las 00:00. */
    await Appointment.insertMany([mk('2026-09-04', '23:45'), mk('2026-09-05', '00:30'), mk('2026-09-07', '23:30'), mk('2026-09-08', '00:15')]);
    const r = await t.get('/api/admin/stats?from=2026-09-05&to=2026-09-07');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 2);
    assert.deepEqual(r.json.days.map((d) => [d.date, d.appointments]), [['2026-09-05', 1], ['2026-09-06', 0], ['2026-09-07', 1]]);
    /* Sábado sin turno, domingo cerrado, lunes 12–18 = 360 min exactos. */
    assert.equal(r.json.barbers.find((x) => x.name === 'Barbero A').availableMin, 360);
    assert.equal((await t.get('/api/admin/stats?from=2026-09-07&to=2026-09-05')).status, 400);
  });

  test('el barbero aprobado ve solo SUS estadísticas', async () => {
    await seedKnown();
    const cookie = await t.barberCookie(t.pro(1));
    const r = await t.get('/api/pro/stats', cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 3);
    assert.deepEqual(r.json.barbers.map((x) => x.name), ['Barbero B']);
    assert.equal(r.json.revenue.totalCLP, 15000);
    assert.equal((await t.get('/api/admin/stats', cookie)).status, 403);
  });
});

describe('AC-09 configuración', () => {
  const MP_TOKEN = 'TEST-123456-secreto-de-prueba';
  const t = panel({ pros: [PRO_A], env: { MP_ACCESS_TOKEN: MP_TOKEN, MP_WEBHOOK_SECRET: 'whsec-no-mostrar', FB_APP_SECRET: 'fb-no-mostrar' }, onlinePayments: { ready: true } });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('la comisión se congela: cambiarla aplica solo a citas nuevas', async () => {
    const before = await t.book({ pro: t.pro(0), time: '12:00' });
    const r = await t.put('/api/admin/settings', { platformFeePercent: 10 });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.platformFeePercent, 10);
    assert.equal((await Appointment.findById(before.id)).pricing.platformFeeRate, 0);
    const after = await t.book({ pro: t.pro(0), time: '14:00' });
    const appt = await Appointment.findById(after.id);
    assert.equal(appt.pricing.platformFeeRate, 0.1);
    assert.equal(appt.pricing.platformFeeCLP, 1200);
    for (const bad of [-1, 51, '10', 12.345]) assert.equal((await t.put('/api/admin/settings', { platformFeePercent: bad })).status, 400, String(bad));
    const log = await AuditLog.findOne({ action: 'settings.update' });
    assert.equal(log.before.platformFeePercent, 0);
    assert.equal(log.after.platformFeePercent, 10);
  });

  test('deshabilitar "Pagar en línea" la quita del paso 4; al menos una forma de pago', async () => {
    let cat = await t.get('/api/wstyle/catalog', null);
    assert.deepEqual(cat.json.business.payments, { online: false, local: true });
    assert.equal((await t.put('/api/admin/settings', { payments: { online: true } })).status, 200);
    cat = await t.get('/api/wstyle/catalog', null);
    assert.deepEqual(cat.json.business.payments, { online: true, local: true });
    assert.equal((await t.put('/api/admin/settings', { payments: { online: false } })).status, 200);
    cat = await t.get('/api/wstyle/catalog', null);
    assert.equal(cat.json.business.payments.online, false);
    const c = await makeClient({});
    const r = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at('12:00'), mode: 'shop', acceptPolicies: true, paymentMethod: 'online' }, c.cookie);
    assert.equal(r.status, 400);
    assert.equal(r.json.fields.paymentMethod, 'payment_unavailable');
    const none = await t.put('/api/admin/settings', { payments: { online: false, local: false } });
    assert.equal(none.status, 400);
    /* Pago en el local deshabilitado → tampoco se acepta. */
    await t.put('/api/admin/settings', { payments: { online: true, local: false } });
    const r2 = await t.post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(t.pro(0)._id), startsAt: at('12:00'), mode: 'shop', acceptPolicies: true, paymentMethod: 'local' }, c.cookie);
    assert.equal(r2.status, 400);
  });

  test('reglas de agenda configurables con límites', async () => {
    const r = await t.put('/api/admin/settings', { rules: { minLeadMinutes: 60, horizonDays: 14, inviteTtlHours: 12 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.rules.minLeadMinutes, 60);
    const cat = await t.get('/api/wstyle/catalog', null);
    assert.equal(cat.json.business.settings.minLeadMinutes, 60);
    assert.equal(cat.json.business.settings.horizonDays, 14);
    assert.equal((await t.put('/api/admin/settings', { rules: { horizonDays: 0 } })).status, 400);
    assert.equal((await t.put('/api/admin/settings', { rules: { slotMinutes: 10 } })).status, 400);
  });

  test('las credenciales de pago no se pueden leer ni escribir desde ningún endpoint', async () => {
    const s = await t.get('/api/admin/settings');
    assert.equal(s.status, 200);
    assert.deepEqual(s.json.mercadoPago, { configured: true, mode: 'sandbox', ready: true });
    for (const path of ['/api/admin/settings', '/api/admin/overview', '/api/wstyle/catalog', '/api/health', '/api/admin/export', '/api/auth/config']) {
      const body = JSON.stringify((await t.get(path)).json);
      for (const secret of [MP_TOKEN, 'whsec-no-mostrar', 'fb-no-mostrar']) assert.ok(!body.includes(secret), `${path} filtra un secreto`);
    }
    for (const body of [{ MP_ACCESS_TOKEN: 'APP_USR-x' }, { mercadoPago: { accessToken: 'x' } }, { payments: { accessToken: 'x' } }]) {
      const r = await t.put('/api/admin/settings', body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });
});

describe('AC-10 auditoría', () => {
  const t = panel({ pros: [PRO_A, { ...PRO_B, membershipStatus: 'pending' }] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('cada acción de RN-09 deja actor, fecha, acción y antes/después; no se puede editar ni borrar', async () => {
    const [a, b] = [t.pro(0), t.pro(1)];
    await t.post(`/api/admin/barbers/${b._id}/approve`);
    const x = await t.book({ pro: a, time: '12:00' });
    const y = await t.book({ pro: a, time: '14:00' });
    await t.post(`/api/admin/appointments/${x.id}/reassign`, { professionalId: String(b._id) });
    await t.post(`/api/admin/appointments/${y.id}/cancel`, { reason: 'Prueba' });
    await t.post(`/api/admin/barbers/${a._id}/suspend`, { reason: 'Prueba' });
    const corte = (await t.get('/api/admin/services')).json.items.find((s) => s.id === 'corte');
    await t.patch(`/api/admin/services/${corte._id}`, { priceCLP: 13000, updatedAt: corte.updatedAt });
    const week = (await t.get('/api/admin/schedule')).json.week.map((d) => (d.weekday === 6 ? { ...d, ranges: [] } : d));
    await t.put('/api/admin/schedule/hours', { week });
    await t.put('/api/admin/settings', { platformFeePercent: 5 });
    const expected = ['barber.approve', 'appointment.reassign', 'appointment.cancel', 'barber.suspend', 'service.price', 'schedule.hours', 'settings.update'];
    const logs = await AuditLog.find({}).sort({ at: 1 }).lean();
    for (const action of expected) {
      const l = logs.find((x) => x.action === action);
      assert.ok(l, action);
      assert.equal(String(l.actorUserId), String(t.admin.user._id));
      assert.equal(l.actorEmail, ADMIN_EMAIL);
      assert.ok(l.at instanceof Date);
      assert.ok(l.before !== undefined && l.after !== undefined && (l.before !== null || l.after !== null), action);
    }
    const list = await t.get('/api/admin/audit');
    assert.equal(list.status, 200);
    assert.ok(expected.every((action) => list.json.items.some((i) => i.action === action)));
    const id = list.json.items[0].id;
    for (const [method, path] of [['PUT', `/api/admin/audit/${id}`], ['PATCH', `/api/admin/audit/${id}`], ['DELETE', `/api/admin/audit/${id}`], ['DELETE', '/api/admin/audit'], ['POST', '/api/admin/audit']]) {
      const r = await api(t.ctx.base, method, path, { cookie: t.admin.cookie, body: {} });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
    assert.equal(await AuditLog.countDocuments({}), logs.length);
    /* Ninguna ruta del router de admin escribe sobre /audit. */
    const adminLayer = t.ctx.app._router.stack.find((l) => l.name === 'router' && l.regexp.test('/api/admin'));
    const writes = adminLayer.handle.stack.filter((l) => l.route && /audit/.test(l.route.path) && !l.route.methods.get);
    assert.equal(writes.length, 0);
  });
});

describe('RN-10 avisos al super admin', () => {
  const t = panel({ pros: [PRO_A] });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('nuevo barbero por aprobar y cita cancelada por el barbero → bandeja del panel (+ correo)', async () => {
    const reg = await t.post('/api/pro/register', { email: 'nuevo@barberos.test', name: 'Vicente Soto', phone: '+56 9 4444 5555', password: 'navaja2026', acceptTerms: true }, null);
    assert.equal(reg.status, 201);
    const x = await t.book({ pro: t.pro(0) });
    const cookie = await t.barberCookie(t.pro(0));
    const c = await t.post(`/api/pro/appointments/${x.id}/cancel`, { reasonCode: 'enfermedad' }, cookie);
    assert.equal(c.status, 200, JSON.stringify(c.json));
    const n = await t.get('/api/admin/notifications');
    assert.equal(n.status, 200);
    assert.ok(n.json.items.some((i) => i.kind === 'barber_new' && /Vicente Soto/.test(i.title)));
    assert.ok(n.json.items.some((i) => i.kind === 'barber_cancelled' && /Enfermedad/.test(i.body)));
    assert.equal(n.json.unread, 2);
    assert.ok(t.ctx.mailer.outbox.some((m) => m.to === ADMIN_EMAIL && /canceló una cita/.test(m.subject)));
    assert.ok(t.ctx.mailer.outbox.some((m) => m.to === ADMIN_EMAIL && /Nuevo barbero por aprobar/.test(m.subject)));
    await t.post('/api/admin/notifications/read', {});
    assert.equal((await t.get('/api/admin/notifications')).json.unread, 0);
    assert.equal((await t.get('/api/admin/overview')).json.unread, 0);
  });
});

describe('AC-02 matriz de autorización', () => {
  const t = panel({ pros: [PRO_A, { ...PRO_B, membershipStatus: 'pending' }, PRO_C] });
  before(connectDb);
  after(disconnectDb);
  before(() => t.boot());
  after(() => t.stop());

  /* Lista TODAS las rutas registradas en la app ("GET /api/admin/barbers/:id"). */
  function allRoutes(app) {
    const prefixes = ['/api/auth', '/api/wstyle', '/api/pro', '/api/admin'];
    const out = [];
    for (const layer of app._router.stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${layer.route.path}`);
      } else if (layer.name === 'router') {
        const prefix = prefixes.find((p) => layer.regexp.test(p));
        for (const l of layer.handle.stack) if (l.route) for (const m of Object.keys(l.route.methods)) out.push(`${m.toUpperCase()} ${prefix}${l.route.path}`);
      }
    }
    return [...new Set(out)];
  }

  test('cada endpoint × cada rol responde según la matriz', async () => {
    const [A, B, C] = [t.pro(0), t.pro(1), t.pro(2)];
    const roles = {
      anon: null,
      client: (await makeClient({ name: 'Cliente Uno', email: 'uno@clientes.test', phone: '+56912340001' })).cookie,
      approved: await t.barberCookie(A),
      pending: await t.barberCookie(B),
      admin: t.admin.cookie,
    };
    const owner = await makeClient({ name: 'Dueña Cita', email: 'duena@clientes.test', phone: '+56912340002' });
    /* Cita de PRO_A (aprobado) de OTRO cliente: para "client" es ajena (404). */
    const appt = (await t.book({ pro: A, time: '12:00', client: owner })).id;
    const fake = '0123456789abcdef01234567';

    /* Valores: número = status exacto; OK = permitido (ni 401 ni 403, < 500); ANY = público (solo < 500 y ≠ 403);
       SKIP = no se ejecuta con ese rol (destructivo para la sesión del propio test: logout, borrar cuenta). */
    const OK = 'ok';
    const ANY = 'any';
    const SKIP = 'skip';
    const pub = { anon: ANY, client: ANY, approved: ANY, pending: ANY, admin: ANY };
    const logged = { anon: 401, client: OK, approved: OK, pending: OK, admin: OK };
    const barberEdit = { anon: 401, client: 403, approved: OK, pending: OK, admin: 403 };
    const barberOperate = { anon: 401, client: 403, approved: OK, pending: 403, admin: 403 };
    const adminOnly = { anon: 401, client: 403, approved: 403, pending: 403, admin: OK };
    const ownAppt = { anon: 401, client: 404, approved: OK, pending: 404, admin: OK };

    const M = [
      ['GET /api/health', pub], ['GET /api/news', pub], ['POST /api/contact', pub], ['GET /api/wstyle/photos/:id', pub, { path: `/api/wstyle/photos/${fake}` }],
      /* Cuentas: registro / login / Facebook (anónimo ✓) */
      ['GET /api/auth/config', pub], ['GET /api/auth/me', logged], ['POST /api/auth/email-status', pub], ['POST /api/auth/register', pub], ['POST /api/auth/login', pub],
      ['POST /api/auth/logout', { anon: ANY, client: SKIP, approved: SKIP, pending: SKIP, admin: SKIP }],
      ['PATCH /api/auth/me', logged], ['POST /api/auth/resend-verification', logged],
      ['POST /api/auth/verify-email', pub], ['POST /api/auth/forgot', pub], ['POST /api/auth/reset', pub],
      ['DELETE /api/auth/me', { anon: 401, client: SKIP, approved: SKIP, pending: SKIP, admin: 409 }],
      ['GET /api/auth/facebook/start', pub], ['GET /api/auth/facebook/callback', pub], ['POST /api/auth/facebook/link', pub], ['POST /api/auth/facebook/complete', pub], ['POST /api/auth/facebook/data-deletion', pub],
      /* Catálogo público y horas libres */
      ['GET /api/wstyle/catalog', pub], ['GET /api/wstyle/availability', pub, { path: `/api/wstyle/availability?service=corte&from=${MONDAY}&to=${MONDAY}` }], ['POST /api/wstyle/quote', pub],
      /* Citas propias (cliente); el barbero aprobado ve las suyas; el admin todas; ajenas → 404 */
      ['POST /api/wstyle/appointments', { anon: 401, client: OK, approved: 403, pending: 403, admin: 403 }, { body: { serviceId: 'corte', professionalId: String(A._id), startsAt: at('16:00'), acceptPolicies: true } }],
      ['GET /api/wstyle/appointments/mine', logged],
      ['GET /api/wstyle/appointments/:id', ownAppt, { path: `/api/wstyle/appointments/${appt}` }],
      ...['cancel', 'accept', 'counter', 'confirm', 'propose', 'start', 'finish', 'no-show', 'pay-local'].map((a) => [`POST /api/wstyle/appointments/:id/${a}`, ownAppt, { path: `/api/wstyle/appointments/${appt}/${a}` }]),
      /* SPEC-35: sin credenciales de Mercado Pago (este panel no las tiene) → 503 con sesión. Con credenciales: test/payments.test.js. */
      ['POST /api/wstyle/appointments/:id/checkout', { anon: 401, client: 503, approved: 503, pending: 503, admin: 503 }, { path: `/api/wstyle/appointments/${appt}/checkout` }],
      /* Webhook público: lo autentica la firma x-signature (sin firma → 401 para todos). */
      ['POST /api/payments/mp/webhook', { anon: 401, client: 401, approved: 401, pending: 401, admin: 401 }, { path: '/api/payments/mp/webhook?data.id=1&type=payment' }],
      /* Barbero: registro (anónimo), perfil propio (aprobado y pendiente), operación (solo aprobado) */
      ['POST /api/pro/register', pub], ['POST /api/pro/facebook/register', pub],
      ['GET /api/pro/me', barberEdit], ['PATCH /api/pro/profile', barberEdit], ['PUT /api/pro/services', barberEdit], ['PUT /api/pro/availability', barberEdit],
      ['PUT /api/pro/home-service', barberEdit], ['POST /api/pro/time-off', barberEdit], ['DELETE /api/pro/time-off/:id', barberEdit, { path: `/api/pro/time-off/${fake}` }],
      ['POST /api/pro/photos', barberEdit], ['DELETE /api/pro/photos/:id', barberEdit, { path: `/api/pro/photos/${fake}` }], ['POST /api/pro/photos/:id/main', barberEdit, { path: `/api/pro/photos/${fake}/main` }],
      ['POST /api/pro/submit', barberEdit], ['GET /api/pro/notifications', barberEdit], ['POST /api/pro/notifications/read', barberEdit],
      ['GET /api/pro/agenda', barberOperate], ['GET /api/pro/slots', barberOperate, { path: `/api/pro/slots?service=corte&date=${MONDAY}` }], ['GET /api/pro/stats', barberOperate],
      ['GET /api/pro/appointments/:id', barberOperate, { path: `/api/pro/appointments/${appt}` }],
      ...['confirm', 'reject', 'propose', 'reschedule', 'cancel', 'start', 'finish', 'no-show'].map((a) => [`POST /api/pro/appointments/:id/${a}`, barberOperate, { path: `/api/pro/appointments/${appt}/${a}` }]),
      ['POST /api/pro/invitations', barberOperate],
      /* SPEC-37: pagos del barbero (solo los suyos); sin sesión también 403. */
      ['GET /api/pro/payments', { ...barberOperate, anon: 403 }], ['POST /api/pro/payments/:id/boleta', { ...barberOperate, anon: 403 }, { path: `/api/pro/payments/${appt}/boleta` }],
      /* Super admin */
      ['GET /api/admin/status', pub],
      ['GET /api/admin/overview', adminOnly], ['GET /api/admin/notifications', adminOnly], ['POST /api/admin/notifications/read', adminOnly], ['POST /api/admin/me/password', adminOnly],
      ['GET /api/admin/barbers', adminOnly], ['GET /api/admin/barbers/:id', adminOnly, { path: `/api/admin/barbers/${C._id}` }],
      ...['approve', 'reject', 'suspend', 'reactivate', 'reopen'].map((a) => [`POST /api/admin/barbers/:id/${a}`, adminOnly, { path: `/api/admin/barbers/${C._id}/${a}` }]),
      ['PATCH /api/admin/barbers/:id/profile', adminOnly, { path: `/api/admin/barbers/${C._id}/profile` }], ['PUT /api/admin/barbers/:id/services', adminOnly, { path: `/api/admin/barbers/${C._id}/services` }],
      ['PUT /api/admin/barbers/:id/availability', adminOnly, { path: `/api/admin/barbers/${C._id}/availability` }], ['PUT /api/admin/barbers/:id/home-service', adminOnly, { path: `/api/admin/barbers/${C._id}/home-service` }],
      ['GET /api/admin/appointments', adminOnly], ['GET /api/admin/appointments.csv', adminOnly], ['POST /api/admin/appointments', adminOnly],
      ['GET /api/admin/appointments/:id', adminOnly, { path: `/api/admin/appointments/${appt}` }],
      ['GET /api/admin/appointments/:id/reassign-options', adminOnly, { path: `/api/admin/appointments/${appt}/reassign-options` }],
      ['POST /api/admin/appointments/:id/reassign', adminOnly, { path: `/api/admin/appointments/${appt}/reassign` }],
      ['POST /api/admin/appointments/:id/collect', adminOnly, { path: `/api/admin/appointments/${appt}/collect` }],
      ['POST /api/admin/appointments/:id/refund', { ...adminOnly, admin: 503 }, { path: `/api/admin/appointments/${appt}/refund` }],
      ...['confirm', 'reject', 'cancel', 'propose', 'start', 'finish', 'no-show'].map((a) => [`POST /api/admin/appointments/:id/${a}`, adminOnly, { path: `/api/admin/appointments/${appt}/${a}` }]),
      ['GET /api/admin/services', adminOnly], ['POST /api/admin/services', adminOnly],
      ['PATCH /api/admin/services/:id', adminOnly, { path: `/api/admin/services/${fake}` }], ['DELETE /api/admin/services/:id', adminOnly, { path: `/api/admin/services/${fake}` }],
      ['GET /api/admin/export', adminOnly],
      ['GET /api/admin/schedule', adminOnly], ['PUT /api/admin/schedule/hours', adminOnly], ['POST /api/admin/schedule/closures', adminOnly],
      ['DELETE /api/admin/schedule/closures/:id', adminOnly, { path: `/api/admin/schedule/closures/${fake}` }],
      ['GET /api/admin/stats', adminOnly], ['GET /api/admin/settings', adminOnly], ['PUT /api/admin/settings', adminOnly], ['GET /api/admin/audit', adminOnly],
      /* SPEC-37 regla 1: pagos y rendición solo para el super admin; el resto (también el visitante) → 403. */
      ['GET /api/admin/payments', { ...adminOnly, anon: 403 }], ['POST /api/admin/payments/:id/boleta', { ...adminOnly, anon: 403 }, { path: `/api/admin/payments/${appt}/boleta` }],
      ['GET /api/admin/rendicion', { ...adminOnly, anon: 403 }], ['GET /api/admin/rendicion.csv', { ...adminOnly, anon: 403 }],
      /* Al final: agregan roles a la cuenta (cliente → barbero, barbero → cliente) y cambiarían las filas anteriores. */
      ['POST /api/auth/me/client-role', logged],
      ['POST /api/pro/join', { anon: 401, client: OK, approved: OK, pending: OK, admin: OK }],
    ];

    /* Completitud: la matriz cubre CADA endpoint registrado (y nada que no exista). */
    const registered = allRoutes(t.ctx.app).sort();
    const covered = M.map(([k]) => k).sort();
    assert.deepEqual(covered, registered);

    const failures = [];
    for (const [key, expect, opts = {}] of M) {
      const [method, pattern] = key.split(' ');
      const path = opts.path || pattern;
      for (const [role, cookie] of Object.entries(roles)) {
        const want = expect[role];
        if (want === SKIP) continue;
        const r = await api(t.ctx.base, method, path, { cookie, body: method === 'GET' ? undefined : opts.body ?? {} });
        const ok =
          typeof want === 'number' ? r.status === want
          : want === OK ? ![401, 403].includes(r.status) && r.status < 500
          : r.status !== 403 && r.status < 500;
        if (!ok) failures.push(`${key} [${role}] → ${r.status} (esperado ${want}) ${JSON.stringify(r.json)?.slice(0, 120)}`);
      }
    }
    assert.deepEqual(failures, []);
  });
});
