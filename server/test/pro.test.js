/* SPEC-33 AC-01…AC-09: registro del barbero y su panel, contra la BD de test real.
   Facebook se simula en SU borde HTTP (Graph API); el reloj se inyecta. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Appointment, AvailabilityRule, AuthToken, Membership, PanelNotification, Professional, SlotLock, TimeOff, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { newToken, sha256 } from '../src/lib/session.js';
import { api, connectDb, disconnectDb, eastOf, HOUR, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, sessionCookie, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN = 'admin@wstyle.test';
const FB_ENV = { FB_APP_ID: 'app-123', FB_APP_SECRET: 'shh-super-secreto', FB_REDIRECT_URI: 'http://localhost:4000/api/auth/facebook/callback' };

function fakeGraph(profile) {
  return async (url) => {
    const u = new URL(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname.endsWith('/oauth/access_token')) return u.searchParams.get('code') === 'codigo-bueno' ? json({ access_token: 'tok-1' }) : json({ error: { message: 'Invalid code' } }, 400);
    if (u.pathname.endsWith('/me')) return json(profile);
    return json({ error: { message: 'unexpected' } }, 404);
  };
}

async function sessionFor(userId) {
  const token = newToken();
  await AuthToken.create({ type: 'session', userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 365 * 24 * HOUR) });
  return `ws_session=${token}`;
}

const NEW_BARBER = { email: 'nuevo@barberos.test', name: 'Vicente Soto', phone: '+56 9 4444 5555', password: 'navaja2026', acceptTerms: true };

describe('registro del barbero', () => {
  let ctx;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));
  async function boot(opts = {}) {
    if (ctx) await stop(ctx.server);
    await resetDb();
    await seed();
    ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN, ...(opts.env || {}) }, facebookFetch: opts.facebookFetch });
  }
  const post = (path, body, cookie) => api(ctx.base, 'POST', path, { body, cookie });

  test('AC-01 con email: User barber con contraseña hasheada, Professional y Membership pending; correo al barbero y al super admin', async () => {
    await boot();
    const r = await post('/api/pro/register', NEW_BARBER);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.ok(sessionCookie(r.headers), 'deja la sesión iniciada');
    const user = await User.findOne({ email: 'nuevo@barberos.test' });
    assert.deepEqual([...user.roles], ['barber']);
    assert.equal(user.phoneE164, '+56944445555');
    const id = user.identities.find((i) => i.provider === 'email');
    assert.match(id.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(id.passwordHash, NEW_BARBER.password);
    const pro = await Professional.findOne({ userId: user._id });
    assert.equal(pro.displayName, 'Vicente Soto');
    assert.deepEqual([...pro.categories], ['barberia']);
    const m = await Membership.findOne({ professionalId: pro._id });
    assert.equal(m.status, 'pending');
    assert.ok(ctx.mailer.outbox.some((x) => x.to === 'nuevo@barberos.test' && /Recibimos tu solicitud/.test(x.subject)));
    assert.ok(ctx.mailer.outbox.some((x) => x.to === ADMIN && /Nuevo barbero por aprobar: Vicente Soto/.test(x.subject)));
    /* El panel lo reconoce como barbero pendiente. */
    const me = await api(ctx.base, 'GET', '/api/pro/me', { cookie: sessionCookie(r.headers) });
    assert.equal(me.status, 200);
    assert.equal(me.json.membership.status, 'pending');
  });

  test('AC-01 validaciones: términos, nombre, celular y contraseña', async () => {
    await boot();
    const r = await post('/api/pro/register', { ...NEW_BARBER, name: 'V', phone: '123', password: 'corta', acceptTerms: false });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json.fields).sort(), ['acceptTerms', 'name', 'password', 'phone']);
    assert.equal(await User.countDocuments({ email: 'nuevo@barberos.test' }), 0);
  });

  test('AC-01 / RN-02 email que ya es de un cliente: contraseña mala → 401; buena → agrega el rol barber a la misma cuenta', async () => {
    await boot();
    const reg = await post('/api/auth/register', { email: 'cliente@correo.cl', name: 'Carla Díaz', phone: '987654321', password: 'clave1234' });
    assert.equal(reg.status, 201);
    const bad = await post('/api/pro/register', { email: 'cliente@correo.cl', password: 'otra12345', acceptTerms: true });
    assert.equal(bad.status, 401);
    assert.equal(await Professional.countDocuments({ userId: reg.json.user.id }), 0);
    const ok = await post('/api/pro/register', { email: 'cliente@correo.cl', password: 'clave1234', acceptTerms: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(await User.countDocuments({ email: 'cliente@correo.cl' }), 1);
    const u = await User.findOne({ email: 'cliente@correo.cl' });
    assert.equal(String(u._id), reg.json.user.id);
    assert.deepEqual([...u.roles].sort(), ['barber', 'client']);
    const pro = await Professional.findOne({ userId: u._id });
    assert.equal(pro.displayName, 'Carla Díaz');
    assert.equal((await Membership.findOne({ professionalId: pro._id })).status, 'pending');
  });

  test('AC-02 Facebook: callback válido crea User facebook + barber + Membership pending; la segunda vez entra a la misma cuenta', async () => {
    await boot({ env: FB_ENV, facebookFetch: fakeGraph({ id: 'fb-77', name: 'Tomás Vera', email: 'tomas@fb.cl' }) });
    async function begin() {
      const r = await api(ctx.base, 'GET', `/api/auth/facebook/start?as=barber&r=${encodeURIComponent('/wstyle/pro/registro/')}`);
      assert.equal(r.status, 302);
      const loc = new URL(r.headers.get('location'));
      return { state: loc.searchParams.get('state'), nonce: r.headers.getSetCookie().find((c) => c.startsWith('ws_fb_nonce=')).split(';')[0] };
    }
    const callback = (q, cookie) => api(ctx.base, 'GET', `/api/auth/facebook/callback?${new URLSearchParams(q)}`, { cookie });
    const a = await begin();
    const r = await callback({ code: 'codigo-bueno', state: a.state }, a.nonce);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.pathname, '/wstyle/pro/registro/');
    assert.equal(loc.searchParams.get('fb'), 'nuevo');
    const users = await User.find();
    const u = users.find((x) => x.email === 'tomas@fb.cl');
    assert.ok(u);
    assert.deepEqual([...u.roles], ['barber']);
    assert.deepEqual(u.identities.map((i) => [i.provider, i.providerUserId]), [['facebook', 'fb-77']]);
    const pro = await Professional.findOne({ userId: u._id });
    assert.equal((await Membership.findOne({ professionalId: pro._id })).status, 'pending');
    /* Falta celular + términos: el panel lo pide antes del onboarding. */
    const cookie = sessionCookie(r.headers);
    const me = await api(ctx.base, 'GET', '/api/pro/me', { cookie });
    assert.equal(me.json.needsCompletion, true);
    const done = await post('/api/pro/join', { phone: '9 8888 7777', acceptTerms: true, name: 'Tomás Vera' }, cookie);
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal((await api(ctx.base, 'GET', '/api/pro/me', { cookie })).json.needsCompletion, false);
    assert.ok(ctx.mailer.outbox.some((x) => x.to === ADMIN && /Tomás Vera/.test(x.subject)));

    const b = await begin();
    const r2 = await callback({ code: 'codigo-bueno', state: b.state }, b.nonce);
    assert.equal(new URL(r2.headers.get('location')).searchParams.get('fb'), 'ok');
    assert.equal(await User.countDocuments({ email: 'tomas@fb.cl' }), 1);
    assert.equal(await Professional.countDocuments({ userId: u._id }), 1);
  });

  test('AC-02 state inválido no crea nada', async () => {
    await boot({ env: FB_ENV, facebookFetch: fakeGraph({ id: 'fb-78', name: 'X', email: 'x@fb.cl' }) });
    const before = await User.countDocuments();
    const r = await api(ctx.base, 'GET', `/api/auth/facebook/callback?code=codigo-bueno&state=falso.firma`, { cookie: 'ws_fb_nonce=abc' });
    assert.equal(r.status, 302);
    assert.equal(new URL(r.headers.get('location')).searchParams.get('fb'), 'error');
    assert.equal(await User.countDocuments(), before);
    assert.equal(await Professional.countDocuments({ displayName: 'X' }), 0);
  });

  test('CB-13 Facebook sin email: se pide el correo y se verifica antes de enviar a revisión', async () => {
    await boot({ env: FB_ENV, facebookFetch: fakeGraph({ id: 'fb-79', name: 'Sin Correo' }) });
    const s = await api(ctx.base, 'GET', `/api/auth/facebook/start?as=barber&r=${encodeURIComponent('/wstyle/pro/registro/')}`);
    const state = new URL(s.headers.get('location')).searchParams.get('state');
    const nonce = s.headers.getSetCookie().find((c) => c.startsWith('ws_fb_nonce=')).split(';')[0];
    const r = await api(ctx.base, 'GET', `/api/auth/facebook/callback?${new URLSearchParams({ code: 'codigo-bueno', state })}`, { cookie: nonce });
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.searchParams.get('fb'), 'email');
    const done = await post('/api/pro/facebook/register', { token: loc.searchParams.get('t'), email: 'sincorreo@correo.cl', phone: '987650000', name: 'Sin Correo', acceptTerms: true });
    assert.equal(done.status, 201, JSON.stringify(done.json));
    const u = await User.findOne({ email: 'sincorreo@correo.cl' });
    assert.equal(u.emailVerified, false);
    assert.deepEqual([...u.roles], ['barber']);
    const cookie = sessionCookie(done.headers);
    /* Onboarding mínimo y "Enviar a revisión" → bloqueado hasta verificar el correo. */
    await api(ctx.base, 'PUT', '/api/pro/services', { body: { serviceIds: ['corte'] }, cookie });
    await api(ctx.base, 'PUT', '/api/pro/availability', { body: { rules: [{ weekday: 1, start: '10:00', end: '14:00' }] }, cookie });
    const sub = await post('/api/pro/submit', {}, cookie);
    assert.equal(sub.status, 409);
    assert.equal(sub.json.error, 'email_unverified');
    await User.updateOne({ _id: u._id }, { emailVerified: true });
    assert.equal((await post('/api/pro/submit', {}, cookie)).status, 200);
  });
});

describe('panel del barbero', () => {
  let ctx, seeded, proA, proB, cookieA, cookieB;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    seeded = await seed({ pros: [PRO_A, PRO_B] });
    [proA, proB] = seeded.pros;
    ctx = await start({
      now: SUNDAY_9AM,
      env: { SUPERADMIN_EMAIL: ADMIN },
      geocoder: async ({ street }) => (street.startsWith('Sin coords') ? { lat: NaN, lng: NaN } : eastOf(5)),
    });
    cookieA = await sessionFor(proA.userId);
    cookieB = await sessionFor(proB.userId);
  });

  const post = (path, body, cookie) => api(ctx.base, 'POST', path, { body, cookie });
  const put = (path, body, cookie) => api(ctx.base, 'PUT', path, { body, cookie });
  const get = (path, cookie) => api(ctx.base, 'GET', path, { cookie });
  const book = async (client, startsAt, extra = {}, proId = proA._id) => {
    const r = await post('/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(proId), startsAt, mode: 'shop', acceptPolicies: true, paymentMethod: 'local', ...extra }, client.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.id;
  };
  const publicSlots = async (proId, date = MONDAY, mode = 'shop') =>
    (await get(`/api/wstyle/availability?service=corte&professional=${proId}&from=${date}&to=${date}&mode=${mode}`)).json.days[0]?.slots.map((s) => s.label) ?? [];

  test('AC-03 pendiente / rechazado / suspendido no opera ni aparece; aprobado sí', async () => {
    const reg = await post('/api/pro/register', NEW_BARBER);
    const cookie = sessionCookie(reg.headers);
    /* Pendiente: completa su perfil… */
    assert.equal((await put('/api/pro/services', { serviceIds: ['corte'] }, cookie)).status, 200);
    assert.equal((await put('/api/pro/availability', { rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '10:00', end: '20:00' })) }, cookie)).status, 200);
    assert.equal((await post('/api/pro/submit', {}, cookie)).status, 200);
    const pro = await Professional.findOne({ userId: reg.json.user.id });
    /* …pero no opera (CB-01) ni aparece en la reserva pública. */
    for (const [method, path, body] of [
      ['GET', `/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`],
      ['POST', '/api/pro/invitations', { phone: '987654321', name: 'Carla', serviceId: 'corte', startsAt: at('12:00') }],
    ]) {
      const r = await api(ctx.base, method, path, { body, cookie });
      assert.equal(r.status, 403, path);
      assert.equal(r.json.error, 'not_approved');
    }
    const cat = await get('/api/wstyle/catalog');
    assert.ok(!cat.json.professionals.some((p) => p.id === String(pro._id)));
    assert.deepEqual(await publicSlots(pro._id), []);

    /* Aprobado (helper de SPEC-34) → aparece y opera; correo de bienvenida y notificación. */
    await ctx.app.locals.pro.setMembershipStatus(pro._id, 'approved');
    assert.ok((await get('/api/wstyle/catalog')).json.professionals.some((p) => p.id === String(pro._id)));
    assert.ok((await publicSlots(pro._id)).includes('12:00'));
    assert.equal((await get(`/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, cookie)).status, 200);
    assert.ok(ctx.mailer.outbox.some((m) => m.to === NEW_BARBER.email && /Bienvenido a WS Style/.test(m.subject)));
    const notes = await get('/api/pro/notifications', cookie);
    assert.ok(notes.json.items.some((n) => n.kind === 'account_approved' && !n.read));

    /* Con una cita: confirmar/iniciar también quedan bloqueados al suspender (CB-02: la sesión sigue, la llamada no). */
    const c = await makeClient();
    const id = await book(c, at('12:00'), {}, pro._id);
    await ctx.app.locals.pro.setMembershipStatus(pro._id, 'suspended');
    for (const action of ['confirm', 'start']) {
      const r = await post(`/api/pro/appointments/${id}/${action}`, {}, cookie);
      assert.equal(r.status, 403, action);
      assert.equal(r.json.error, 'suspended');
    }
    assert.deepEqual(await publicSlots(pro._id), []);
    await ctx.app.locals.pro.setMembershipStatus(pro._id, 'rejected', 'Faltan fotos de tu trabajo');
    const me = await get('/api/pro/me', cookie);
    assert.equal(me.json.membership.status, 'rejected');
    assert.equal(me.json.membership.reason, 'Faltan fotos de tu trabajo');
    assert.equal((await get(`/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, cookie)).status, 403);
  });

  test('AC-04 cada barbero solo ve sus citas (id ajeno → 404); un cliente en /pro → 403; sin email del cliente', async () => {
    const c = await makeClient({ name: 'Ana', email: 'ana.secreta@clientes.test' });
    const id = await book(c, at('13:00'));
    const mine = await get(`/api/pro/appointments/${id}`, cookieA);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.customer.name, 'Ana');
    assert.equal(mine.json.customer.phone, '+56987654321');
    assert.ok(!JSON.stringify(mine.json).includes('ana.secreta@clientes.test'));
    const agenda = await get(`/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, cookieA);
    assert.equal(agenda.json.days[0].appointments.length, 1);
    assert.ok(!JSON.stringify(agenda.json).includes('ana.secreta@clientes.test'));
    /* B no la ve ni la toca (CB-14). */
    assert.equal((await get(`/api/pro/appointments/${id}`, cookieB)).status, 404);
    assert.equal((await post(`/api/pro/appointments/${id}/confirm`, {}, cookieB)).status, 404);
    assert.equal((await get(`/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, cookieB)).json.days[0].appointments.length, 0);
    /* Un cliente no entra al panel. */
    const r = await get(`/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, c.cookie);
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'not_barber');
    assert.equal((await get('/api/pro/me')).status, 401);
  });

  test('AC-05 disponibilidad recortada al horario del local; ausencia que choca → 409 con la lista; se refleja en las horas libres', async () => {
    const r = await put('/api/pro/availability', { rules: [
      { weekday: 1, start: '08:00', end: '22:00' },
      { weekday: 2, start: '10:00', end: '14:00' },
      { weekday: 2, start: '15:00', end: '20:00' },
      { weekday: 7, start: '10:00', end: '14:00' },
    ] }, cookieA);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.rules.map((x) => `${x.weekday} ${x.start}-${x.end}`), ['1 10:00-20:00', '2 10:00-14:00', '2 15:00-20:00']);
    assert.ok(r.json.adjustments.includes('WS Style abre de 10:00 a 20:00 los lunes; ajustamos tu horario.'));
    assert.ok(r.json.adjustments.some((m) => /domingos/.test(m)));
    assert.equal(await AvailabilityRule.countDocuments({ professionalId: proA._id }), 3);
    const slots = await publicSlots(proA._id);
    assert.ok(slots.includes('10:00') && slots.includes('19:15') && !slots.includes('19:30'));
    const tuesday = await publicSlots(proA._id, '2026-11-03');
    assert.ok(!tuesday.includes('14:00') && tuesday.includes('15:00'));
    /* Rangos inválidos. */
    assert.equal((await put('/api/pro/availability', { rules: [{ weekday: 1, start: '14:00', end: '12:00' }] }, cookieA)).status, 400);

    /* Ausencia que choca con una cita activa → 409 con la lista (CB-04). */
    const c = await makeClient({ name: 'Bruno' });
    const id = await book(c, at('13:00'));
    const clash = await post('/api/pro/time-off', { fromDate: MONDAY, toDate: MONDAY, reason: 'Trámite' }, cookieA);
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error, 'time_off_conflict');
    assert.deepEqual(clash.json.appointments.map((a) => a.id), [id]);
    assert.equal(await TimeOff.countDocuments(), 0);
    /* Sin choque → se guarda y saca esas horas. */
    const ok = await post('/api/pro/time-off', { fromDate: '2026-11-03', fromTime: '10:00', toDate: '2026-11-03', toTime: '12:00', reason: 'Trámite' }, cookieA);
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    const t2 = await publicSlots(proA._id, '2026-11-03');
    assert.ok(!t2.includes('10:00') && !t2.includes('11:15') && t2.includes('12:00'));
    assert.equal((await api(ctx.base, 'DELETE', `/api/pro/time-off/${ok.json.timeOff.id}`, { cookie: cookieA })).status, 200);
    assert.ok((await publicSlots(proA._id, '2026-11-03')).includes('10:00'));
  });

  test('AC-06 domicilio: validaciones y apagarlo deja de ofrecerlo sin tocar citas existentes', async () => {
    const bad = await put('/api/pro/home-service', { enabled: true, surchargeCLP: 60000, radiusKm: 0, travelBufferMin: 120 }, cookieA);
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.json.fields).sort(), ['radiusKm', 'surchargeCLP', 'travelBufferMin']);
    const ok = await put('/api/pro/home-service', { enabled: true, surchargeCLP: 5000, radiusKm: 12, travelBufferMin: 20 }, cookieA);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.homeService, { enabled: true, surchargeCLP: 5000, radiusKm: 12, travelBufferMin: 20 });
    /* Cita a domicilio confirmada. */
    const c = await makeClient();
    const id = await book(c, at('14:00'), { mode: 'home', address: { street: 'Los Aromos 123', commune: 'Ñuñoa' } });
    await post(`/api/pro/appointments/${id}/confirm`, {}, cookieA);
    const off = await put('/api/pro/home-service', { enabled: false }, cookieA);
    assert.equal(off.status, 200);
    const q = await post('/api/wstyle/quote', { serviceId: 'corte', professionalId: String(proA._id), address: { street: 'Los Aromos 123', commune: 'Ñuñoa' } });
    assert.equal(q.status, 422);
    assert.equal(q.json.error, 'no_home_service');
    assert.deepEqual(await publicSlots(proA._id, MONDAY, 'home'), []);
    const appt = await Appointment.findById(id);
    assert.equal(appt.status, 'confirmada');
    assert.equal(appt.location.kind, 'home');
    /* RN-15 la tarjeta trae moto (kind home), km y "Cómo llegar" con destino. */
    const view = await get(`/api/pro/appointments/${id}`, cookieA);
    assert.equal(view.json.location.kind, 'home');
    assert.equal(view.json.location.distanceKm, 5);
    assert.match(view.json.mapsUrl, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-33\.4378,-70\.596/);
    assert.equal(view.json.telUrl, 'tel:+56987654321');
  });

  test('CB-09 dirección sin coordenadas → "Cómo llegar" usa la dirección en texto', async () => {
    const c = await makeClient();
    const id = await book(c, at('14:00'), { mode: 'home', address: { street: 'Los Aromos 123', commune: 'Ñuñoa' } });
    await Appointment.updateOne({ _id: id }, { $unset: { 'location.point': 1 } });
    const view = await get(`/api/pro/appointments/${id}`, cookieA);
    assert.equal(view.json.mapsUrl, `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Los Aromos 123, Ñuñoa')}`);
  });

  test('AC-07 acciones con reloj inyectado: confirmar, rechazar, proponer, cancelar, iniciar, terminar e inasistencia', async () => {
    const c = await makeClient({ name: 'Carla', email: 'carla@clientes.test' });
    /* Rechazar exige motivo. */
    const r1 = await book(c, at('12:00'));
    let r = await post(`/api/pro/appointments/${r1}/reject`, {}, cookieA);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'reason_required');
    r = await post(`/api/pro/appointments/${r1}/reject`, { reasonCode: 'enfermedad' }, cookieA);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'cancelada');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'carla@clientes.test' && /cancelada/.test(m.subject) && /Enfermedad/.test(m.text) && /wa\.me/.test(m.text)));
    /* CB-11: la segunda pestaña confirma algo ya rechazado → 409. */
    r = await post(`/api/pro/appointments/${r1}/confirm`, {}, cookieA);
    assert.equal(r.status, 409);

    /* Confirmar → proponer (mover = propuesta, no cambio directo). */
    const id = await book(c, at('13:00'));
    r = await post(`/api/pro/appointments/${id}/confirm`, {}, cookieA);
    assert.equal(r.json.status, 'confirmada');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'carla@clientes.test' && /confirmada/.test(m.subject)));
    r = await post(`/api/pro/appointments/${id}/propose`, { startsAt: at('16:00') }, cookieA);
    assert.equal(r.json.status, 'propuesta_cambio');
    assert.equal(r.json.startsAt, at('13:00'), 'la hora original no cambia hasta que el cliente acepte');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'carla@clientes.test' && /quiere mover tu cita/.test(m.subject)));
    /* CB-05: mover a una hora ocupada → 409. */
    const other = await makeClient({ phone: '+56911119999' });
    const busy = await book(other, at('15:00'));
    r = await post(`/api/pro/appointments/${busy}/confirm`, {}, cookieA);
    r = await post(`/api/pro/appointments/${busy}/propose`, { startsAt: at('16:00') }, cookieA);
    assert.equal(r.status, 409);
    /* Cancelar con motivo de la lista ("Otro" exige texto). */
    r = await post(`/api/pro/appointments/${busy}/cancel`, { reasonCode: 'otro' }, cookieA);
    assert.equal(r.status, 400);
    r = await post(`/api/pro/appointments/${busy}/cancel`, { reasonCode: 'otro', reasonText: 'Se cortó la luz' }, cookieA);
    assert.equal(r.json.status, 'cancelada');
    assert.match((await Appointment.findById(busy)).history.at(-1).reason, /Otro: Se cortó la luz/);

    /* Iniciar: solo desde 15 min antes y confirmada (CB-06). */
    const c2 = await makeClient({ name: 'Diego', email: 'diego@clientes.test', phone: '+56922223333' });
    const s = await book(c2, at('17:00'));
    r = await post(`/api/pro/appointments/${s}/start`, {}, cookieA);
    assert.equal(r.status, 409, 'pendiente no se inicia');
    await post(`/api/pro/appointments/${s}/confirm`, {}, cookieA);
    ctx.clock.now = Date.parse(at('16:44'));
    let v = await get(`/api/pro/appointments/${s}`, cookieA);
    assert.ok(!v.json.actions.includes('start'));
    r = await post(`/api/pro/appointments/${s}/start`, {}, cookieA);
    assert.equal(r.status, 409);
    assert.equal(r.json.reason, 'too_early');
    ctx.clock.now = Date.parse(at('16:45'));
    v = await get(`/api/pro/appointments/${s}`, cookieA);
    assert.ok(v.json.actions.includes('start'));
    r = await post(`/api/pro/appointments/${s}/start`, {}, cookieA);
    assert.equal(r.json.status, 'en_curso');
    /* Terminar: registra "¿Cobraste?". */
    r = await post(`/api/pro/appointments/${s}/finish`, {}, cookieA);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'collected_required');
    r = await post(`/api/pro/appointments/${s}/finish`, { collected: false }, cookieA);
    assert.equal(r.json.status, 'terminada');
    assert.equal((await Appointment.findById(s)).payment.status, 'pago_pendiente');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'diego@clientes.test' && /Gracias/.test(m.subject)));
    r = await post(`/api/pro/appointments/${s}/no-show`, {}, cookieA);
    assert.equal(r.status, 409, 'terminada → no_asistio inválida');

    /* Inasistencia: desde 15 min después del inicio. */
    const c3 = await makeClient({ name: 'Elena', email: 'elena@clientes.test', phone: '+56933334444' });
    ctx.clock.now = SUNDAY_9AM;
    const n = await book(c3, at('12:00', '2026-11-03'));
    await post(`/api/pro/appointments/${n}/confirm`, {}, cookieA);
    ctx.clock.now = Date.parse(at('12:14', '2026-11-03'));
    assert.equal((await post(`/api/pro/appointments/${n}/no-show`, {}, cookieA)).status, 409);
    ctx.clock.now = Date.parse(at('12:15', '2026-11-03'));
    r = await post(`/api/pro/appointments/${n}/no-show`, {}, cookieA);
    assert.equal(r.json.status, 'no_asistio');
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'elena@clientes.test' && /inasistencia/i.test(m.subject)));
    const h = (await Appointment.findById(n)).history.map((x) => `${x.from ?? '∅'}→${x.to}:${x.by}`);
    assert.deepEqual(h, ['∅→pendiente:client', 'pendiente→confirmada:barber', 'confirmada→no_asistio:barber']);
  });

  test('AC-08 invitar: ocupa la hora, pago en el local, link wa.me prellenado; 409 si está ocupada; expira a las 24 h', async () => {
    /* CB-07 errores en el campo. */
    let r = await post('/api/pro/invitations', { phone: '12345', name: 'Carla', serviceId: 'corte', startsAt: at('12:00') }, cookieA);
    assert.equal(r.status, 400);
    assert.equal(r.json.fields.phone, 'invalid_phone');
    r = await post('/api/pro/invitations', { phone: '987654321', name: 'Carla', serviceId: 'corte', startsAt: at('08:00', '2026-11-01') }, cookieA);
    assert.equal(r.status, 400);
    assert.equal(r.json.fields.startsAt, 'past');

    r = await post('/api/pro/invitations', { phone: '9 8765 4321', name: 'Carla', serviceId: 'corte', startsAt: at('12:00') }, cookieA);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const inv = r.json.appointment;
    assert.equal(inv.status, 'invitacion_enviada');
    const appt = await Appointment.findById(inv.id);
    assert.equal(appt.payment.method, 'local');
    assert.equal(appt.source, 'pro_invite');
    assert.equal(appt.expiresAt.toISOString(), new Date(SUNDAY_9AM + 24 * HOUR).toISOString());
    const wa = new URL(r.json.whatsappUrl);
    assert.equal(wa.origin + wa.pathname, 'https://wa.me/56987654321');
    const text = wa.searchParams.get('text');
    assert.match(text, /^Hola Carla, te agendé Corte el lunes 2 de noviembre a las 12:00 en WS Style\. Confírmala aquí: http:\/\/localhost:5173\/wstyle\/cita\/\?id=/);
    assert.ok(r.json.whatsappUrl.includes(encodeURIComponent('Confírmala')), 'texto codificado');
    assert.ok(text.endsWith(r.json.inviteUrl));
    assert.ok(!(await publicSlots(proA._id)).includes('12:00'), 'ocupa la hora');
    /* Hora ocupada → 409. */
    r = await post('/api/pro/invitations', { phone: '987650000', name: 'Otro', serviceId: 'corte', startsAt: at('12:00') }, cookieA);
    assert.equal(r.status, 409);

    /* El cliente invitado entra con el link, la confirma y queda asociado. */
    const c = await makeClient({ name: 'Carla Real', email: 'carla2@clientes.test', phone: '+56900001111' });
    const link = new URL(text.split('aquí: ')[1]);
    assert.equal((await get(`/api/wstyle/appointments/${inv.id}`, c.cookie)).status, 404, 'sin el token del link no la ve');
    const v = await get(`/api/wstyle/appointments/${inv.id}?inv=${link.searchParams.get('inv')}`, c.cookie);
    assert.equal(v.status, 200, JSON.stringify(v.json));
    assert.deepEqual(v.json.actions.includes('confirm'), true);
    const conf = await post(`/api/wstyle/appointments/${inv.id}/confirm`, {}, c.cookie);
    assert.equal(conf.json.status, 'confirmada');
    assert.equal(String((await Appointment.findById(inv.id)).customerUserId), String(c.user._id));
    const notes = await get('/api/pro/notifications', cookieA);
    assert.ok(notes.json.items.some((n) => n.kind === 'invite_confirmed'));

    /* Otra invitación sin confirmar → a las 24 h expira y libera la hora. */
    r = await post('/api/pro/invitations', { phone: '987650000', name: 'Pedro', serviceId: 'corte', startsAt: at('12:00', '2026-11-04') }, cookieA);
    const second = r.json.appointment.id;
    assert.equal(await SlotLock.countDocuments({ appointmentId: second }), 3);
    ctx.clock.now = SUNDAY_9AM + 24 * HOUR;
    await ctx.app.locals.agenda.runExpirations();
    assert.equal((await Appointment.findById(second)).status, 'expirada');
    assert.equal(await SlotLock.countDocuments({ appointmentId: second }), 0);
    assert.ok((await get('/api/pro/notifications', cookieA)).json.items.some((n) => n.kind === 'invite_expired'));
  });

  test('AC-08 / RN-12 celular de un cliente existente: la invitación se asocia a su cuenta y le llega por correo', async () => {
    const c = await makeClient({ name: 'Rosa', email: 'rosa@clientes.test', phone: '+56977776666' });
    const r = await post('/api/pro/invitations', { phone: '977776666', name: 'Rosa', serviceId: 'corte', startsAt: at('14:00'), mode: 'shop' }, cookieA);
    assert.equal(r.status, 201);
    assert.equal(String((await Appointment.findById(r.json.appointment.id)).customerUserId), String(c.user._id));
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'rosa@clientes.test' && /te agendó/.test(m.subject)));
    /* Ya asociada: la ve sin token y la confirma. */
    const conf = await post(`/api/wstyle/appointments/${r.json.appointment.id}/confirm`, {}, c.cookie);
    assert.equal(conf.json.status, 'confirmada');
  });

  test('RN-08 una invitación aún no aceptada se reprograma libremente (se reenvía el link)', async () => {
    const r = await post('/api/pro/invitations', { phone: '987654321', name: 'Carla', serviceId: 'corte', startsAt: at('12:00') }, cookieA);
    const id = r.json.appointment.id;
    const m = await post(`/api/pro/appointments/${id}/reschedule`, { startsAt: at('15:00') }, cookieA);
    assert.equal(m.status, 200, JSON.stringify(m.json));
    assert.equal(m.json.appointment.startsAt, at('15:00'));
    assert.equal(m.json.appointment.status, 'invitacion_enviada');
    assert.match(new URL(m.json.whatsappUrl).searchParams.get('text'), /a las 15:00/);
    const locks = (await SlotLock.find({ appointmentId: id }).sort({ slotStart: 1 })).map((l) => l.slotStart.toISOString());
    assert.equal(locks[0], at('15:00'));
  });

  test('RN-16 notificaciones del panel: nueva cita y cancelación del cliente; marcar como leídas', async () => {
    const c = await makeClient({ name: 'Ana' });
    const id = await book(c, at('13:00'));
    await post(`/api/wstyle/appointments/${id}/cancel`, { reason: 'Me enfermé' }, c.cookie);
    const n = await get('/api/pro/notifications', cookieA);
    assert.deepEqual(n.json.items.map((x) => x.kind).sort(), ['client_cancelled', 'new']);
    assert.equal(n.json.unread, 2);
    assert.equal((await post('/api/pro/notifications/read', {}, cookieA)).status, 200);
    assert.equal((await get('/api/pro/notifications', cookieA)).json.unread, 0);
    assert.equal(await PanelNotification.countDocuments({ userId: proB.userId }), 0);
  });

  test('RN-04 / CB-12 quitar un servicio mantiene sus citas futuras; servicios solo de la carta', async () => {
    const c = await makeClient();
    const id = await book(c, at('13:00'));
    assert.equal((await put('/api/pro/services', { serviceIds: ['inventado'] }, cookieA)).status, 400);
    assert.equal((await put('/api/pro/services', { serviceIds: [] }, cookieA)).status, 400);
    const r = await put('/api/pro/services', { serviceIds: ['corte-barba'] }, cookieA);
    assert.equal(r.status, 200);
    assert.equal((await Appointment.findById(id)).status, 'pendiente');
    assert.deepEqual(await publicSlots(proA._id), []);
  });

  test('AC-09 fotos: hasta 4, ≤ 5 MB, tipo por contenido; se guardan cuadradas en WebP', async () => {
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#a07040' } }).png().toBuffer();
    const jpg = await sharp({ create: { width: 600, height: 1000, channels: 3, background: '#203040' } }).jpeg().toBuffer();
    const upload = async (files) => {
      const fd = new FormData();
      for (const [name, buf, type] of files) fd.append('photos', new Blob([buf], { type }), name);
      const res = await fetch(ctx.base + '/api/pro/photos', { method: 'POST', body: fd, headers: { Cookie: cookieA } });
      return { status: res.status, json: await res.json() };
    };
    let r = await upload([['uno.png', png, 'image/png'], ['dos.jpg', jpg, 'image/jpeg']]);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.photos.length, 2);
    const img = await fetch(ctx.base + r.json.photos[0].url);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 800);
    /* La primera es la principal: la usa el catálogo público. */
    const cat = await get('/api/wstyle/catalog');
    assert.equal(cat.json.professionals.find((p) => p.id === String(proA._id)).photo, r.json.photos[0].url);

    /* CB-10: 12 MB, PDF renombrado, y la 5.ª foto. */
    const big = Buffer.concat([png, Buffer.alloc(12 * 1024 * 1024)]);
    r = await upload([['grande.png', big, 'image/png']]);
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'photo_too_large');
    r = await upload([['falso.jpg', Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), 'image/jpeg']]);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_image');
    r = await upload([['3.png', png, 'image/png'], ['4.png', png, 'image/png'], ['5.png', png, 'image/png']]);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'too_many_photos');
    assert.equal((await Professional.findById(proA._id)).photos.length, 2);
    /* Elegir principal y borrar. */
    const ids = (await get('/api/pro/me', cookieA)).json.professional.photos.map((p) => p.id);
    r = await post(`/api/pro/photos/${ids[1]}/main`, {}, cookieA);
    assert.equal(r.json.photos[0].id, ids[1]);
    r = await api(ctx.base, 'DELETE', `/api/pro/photos/${ids[0]}`, { cookie: cookieA });
    assert.equal(r.json.photos.length, 1);
    assert.equal((await fetch(ctx.base + `/api/wstyle/photos/${ids[0]}`)).status, 404);
  });
});

void MIN;
