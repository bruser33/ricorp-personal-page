/* SPEC-32 AC-20…AC-22: cuentas con email y Facebook contra la BD de test real.
   Facebook es un servicio externo: se simula SU borde HTTP (Graph API) con un
   fetch inyectado; usuarios, sesiones y tokens van a la BD real. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthToken, User } from '../src/models/index.js';
import { api, connectDb, disconnectDb, HOUR, MIN, resetDb, sessionCookie, start, stop } from './helpers.js';

const FB_ENV = { FB_APP_ID: 'app-123', FB_APP_SECRET: 'shh-super-secreto', FB_REDIRECT_URI: 'http://localhost:4000/api/auth/facebook/callback' };

/* Graph API simulado: `profile` = lo que devuelve /me. */
function fakeGraph(profile, calls = []) {
  return async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname.endsWith('/oauth/access_token')) {
      if (u.searchParams.get('client_secret') !== FB_ENV.FB_APP_SECRET) return json({ error: { message: 'bad secret' } }, 400);
      return u.searchParams.get('code') === 'codigo-bueno' ? json({ access_token: 'tok-1' }) : json({ error: { message: 'Invalid code' } }, 400);
    }
    if (u.pathname.endsWith('/me')) {
      assert.ok(u.searchParams.get('appsecret_proof'), 'firma appsecret_proof');
      return json(profile);
    }
    return json({ error: { message: 'unexpected' } }, 404);
  };
}

describe('cuentas', () => {
  let ctx;
  const logs = [];
  before(connectDb);
  after(disconnectDb);
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    logs.length = 0;
    ctx = await start({ now: Date.parse('2026-11-01T12:00:00Z') });
  });
  after(async () => ctx && stop(ctx.server));

  const post = (path, body, cookie) => api(ctx.base, 'POST', path, { body, cookie });
  const register = (over = {}) => post('/api/auth/register', { email: 'Pedro@Ejemplo.cl', name: '  Pedro  ', phone: '+56 9 1234 5678', password: 'clave1234', ...over });

  test('AC-20 registro con email: 201, rol client, hash (no el texto), correo de confirmación y cookie httpOnly', async () => {
    const r = await register();
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.user.roles, ['client']);
    assert.equal(r.json.user.email, 'pedro@ejemplo.cl');
    assert.equal(r.json.user.name, 'Pedro');
    assert.equal(r.json.user.phone, '+56912345678');
    assert.ok(!JSON.stringify(r.json).includes('clave1234'));
    assert.ok(!JSON.stringify(r.json).includes('passwordHash'));
    const raw = r.headers.getSetCookie().find((c) => c.startsWith('ws_session='));
    assert.match(raw, /HttpOnly/);
    assert.match(raw, /SameSite=Lax/);
    const u = await User.findOne({ email: 'pedro@ejemplo.cl' });
    const id = u.identities.find((i) => i.provider === 'email');
    assert.ok(id.passwordHash && id.passwordHash !== 'clave1234' && id.passwordHash.startsWith('$2'));
    assert.equal(u.emailVerified, false);
    const mail = ctx.mailer.outbox.find((m) => m.to === 'pedro@ejemplo.cl');
    assert.equal(mail.subject, 'Confirma tu correo · WS Style');
    assert.ok(!mail.text.includes('clave1234'));
    /* Sesión válida. */
    const me = await api(ctx.base, 'GET', '/api/auth/me', { cookie: sessionCookie(r.headers) });
    assert.equal(me.json.user.email, 'pedro@ejemplo.cl');
  });

  test('AC-20 email repetido (mayúsculas) → 409 email_taken; contraseña débil → 400 weak_password', async () => {
    await register();
    const again = await register({ email: 'PEDRO@ejemplo.CL' });
    assert.equal(again.status, 409);
    assert.equal(again.json.error, 'email_taken');
    for (const password of ['corta1', 'solo-letras', '12345678', 'sinnumeros']) {
      const r = await register({ email: 'otro@correo.cl', password });
      assert.equal(r.status, 400, password);
      assert.equal(r.json.error, 'weak_password');
    }
    const same = await register({ email: 'a1b2c3d4@x.cl', password: 'a1b2c3d4@x.cl' });
    assert.equal(same.json.error, 'weak_password');
    const bad = await register({ email: 'no-es-email', name: '   ', phone: '123', password: 'clave1234' });
    assert.deepEqual(bad.json.fields, { email: 'invalid_email', name: 'required', phone: 'invalid_phone' });
  });

  test('AC-20 link de confirmación marca emailVerified; vencido → 410', async () => {
    await register();
    const token = new URL(ctx.mailer.outbox.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
    const ok = await post('/api/auth/verify-email', { token });
    assert.equal(ok.status, 200);
    assert.equal((await User.findOne({ email: 'pedro@ejemplo.cl' })).emailVerified, true);
    assert.equal((await post('/api/auth/verify-email', { token })).status, 410, 'un solo uso');
    /* Otro link, vencido (24 h). */
    await register({ email: 'b@ejemplo.cl' });
    const t2 = new URL(ctx.mailer.outbox.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
    ctx.clock.now += 24 * HOUR + MIN;
    assert.equal((await post('/api/auth/verify-email', { token: t2 })).status, 410);
    assert.equal((await post('/api/auth/verify-email', { token: 'inventado' })).status, 400);
  });

  test('AC-21 login: correcta → sesión; incorrecta → 401 genérico; 6.º intento fallido → 429', async () => {
    await register();
    const ok = await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'clave1234' });
    assert.equal(ok.status, 200);
    assert.ok(sessionCookie(ok.headers));
    const ghost = await post('/api/auth/login', { email: 'nadie@ejemplo.cl', password: 'clave1234' });
    assert.equal(ghost.status, 401);
    assert.equal(ghost.json.message, 'Correo o contraseña incorrectos');
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'mala1234' })).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    const blocked = await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'clave1234' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.message, 'Demasiados intentos. Prueba de nuevo en 15 minutos.');
    ctx.clock.now += 15 * MIN + 1000;
    assert.equal((await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'clave1234' })).status, 200);
  });

  test('AC-21 recuperar: misma respuesta exista o no; link de un solo uso; cambia la contraseña', async () => {
    await register();
    ctx.mailer.outbox.length = 0;
    const a = await post('/api/auth/forgot', { email: 'pedro@ejemplo.cl' });
    const b = await post('/api/auth/forgot', { email: 'nadie@ejemplo.cl' });
    assert.deepEqual(a.json, b.json);
    assert.equal(a.status, b.status);
    assert.equal(ctx.mailer.outbox.length, 1);
    const token = new URL(ctx.mailer.outbox[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
    assert.equal((await post('/api/auth/reset', { token, password: 'nueva5678' })).status, 200);
    assert.equal((await post('/api/auth/reset', { token, password: 'otra56789' })).status, 410);
    assert.equal((await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'clave1234' })).status, 401);
    assert.equal((await post('/api/auth/login', { email: 'pedro@ejemplo.cl', password: 'nueva5678' })).status, 200);
  });

  test('AC-21 cerrar sesión invalida la sesión en el server', async () => {
    const r = await register();
    const cookie = sessionCookie(r.headers);
    assert.equal((await api(ctx.base, 'GET', '/api/auth/me', { cookie })).status, 200);
    await post('/api/auth/logout', {}, cookie);
    assert.equal((await api(ctx.base, 'GET', '/api/auth/me', { cookie })).status, 401);
    assert.equal(await AuthToken.countDocuments({ type: 'session' }), 0);
  });

  test('RN-26 eliminar la cuenta la anonimiza', async () => {
    const r = await register();
    const cookie = sessionCookie(r.headers);
    assert.equal((await api(ctx.base, 'DELETE', '/api/auth/me', { cookie })).status, 200);
    const u = await User.findById(r.json.user.id);
    assert.equal(u.name, 'Cliente eliminado');
    assert.equal(u.email, undefined);
    assert.equal(u.status, 'deleted');
    assert.equal((await api(ctx.base, 'GET', '/api/auth/me', { cookie })).status, 401);
  });
});

describe('Facebook (AC-22)', () => {
  let ctx;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));

  async function boot(profile, env = FB_ENV) {
    if (ctx) await stop(ctx.server);
    await resetDb();
    ctx = await start({ now: Date.parse('2026-11-01T12:00:00Z'), env, facebookFetch: fakeGraph(profile) });
  }

  /* Sigue el /start: devuelve state y la cookie del nonce. */
  async function begin(returnTo = '/wstyle/reservar/?servicio=corte') {
    const r = await api(ctx.base, 'GET', `/api/auth/facebook/start?r=${encodeURIComponent(returnTo)}`);
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.host, 'www.facebook.com');
    assert.equal(loc.searchParams.get('client_id'), 'app-123');
    assert.ok(!loc.toString().includes(FB_ENV.FB_APP_SECRET), 'el secreto no sale al navegador');
    const nonce = r.headers.getSetCookie().find((c) => c.startsWith('ws_fb_nonce=')).split(';')[0];
    return { state: loc.searchParams.get('state'), nonce };
  }
  const callback = (q, cookie) => api(ctx.base, 'GET', `/api/auth/facebook/callback?${new URLSearchParams(q)}`, { cookie });

  test('code y state válidos → User con identidad facebook y email verificado; segundo login entra a la misma cuenta', async () => {
    await boot({ id: 'fb-1', name: 'Ana Pérez', email: 'ana@fb.cl' });
    const { state, nonce } = await begin();
    const r = await callback({ code: 'codigo-bueno', state }, nonce);
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.pathname, '/wstyle/reservar/');
    assert.equal(loc.searchParams.get('servicio'), 'corte');
    assert.equal(loc.searchParams.get('fb'), 'nuevo');
    assert.ok(sessionCookie(r.headers));
    const users = await User.find();
    assert.equal(users.length, 1);
    assert.equal(users[0].emailVerified, true);
    assert.deepEqual(users[0].identities.map((i) => [i.provider, i.providerUserId]), [['facebook', 'fb-1']]);
    for (const h of [JSON.stringify(Object.fromEntries(r.headers)), r.headers.get('location')]) assert.ok(!h.includes(FB_ENV.FB_APP_SECRET));

    const again = await begin();
    const r2 = await callback({ code: 'codigo-bueno', state: again.state }, again.nonce);
    assert.equal(new URL(r2.headers.get('location')).searchParams.get('fb'), 'ok');
    assert.equal(await User.countDocuments(), 1);
  });

  test('email ya registrado con contraseña → no vincula hasta confirmar la contraseña', async () => {
    await boot({ id: 'fb-2', name: 'Pedro', email: 'pedro@ejemplo.cl' });
    await api(ctx.base, 'POST', '/api/auth/register', { body: { email: 'pedro@ejemplo.cl', name: 'Pedro', phone: '+56912345678', password: 'clave1234' } });
    const { state, nonce } = await begin();
    const r = await callback({ code: 'codigo-bueno', state }, nonce);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.searchParams.get('fb'), 'vincular');
    assert.equal(sessionCookie(r.headers), null, 'sin sesión todavía');
    assert.ok(!(await User.findOne({ email: 'pedro@ejemplo.cl' })).identities.some((i) => i.provider === 'facebook'));
    const t = loc.searchParams.get('t');
    const bad = await api(ctx.base, 'POST', '/api/auth/facebook/link', { body: { token: t, password: 'mala1234' } });
    assert.equal(bad.status, 401);
    const ok = await api(ctx.base, 'POST', '/api/auth/facebook/link', { body: { token: t, password: 'clave1234' } });
    assert.equal(ok.status, 200);
    assert.ok(sessionCookie(ok.headers));
    assert.equal(ok.json.returnTo, '/wstyle/reservar/?servicio=corte');
    assert.deepEqual(ok.json.user.providers.sort(), ['email', 'facebook']);
  });

  test('state inválido o error=access_denied → sin sesión y vuelve con fb=error', async () => {
    await boot({ id: 'fb-3', name: 'X', email: 'x@fb.cl' });
    const { state, nonce } = await begin();
    for (const q of [{ code: 'codigo-bueno', state: state.slice(0, -2) + 'xx' }, { error: 'access_denied', state }, { code: 'codigo-bueno', state: 'basura' }]) {
      const r = await callback(q, nonce);
      assert.equal(r.status, 302);
      assert.equal(new URL(r.headers.get('location')).searchParams.get('fb'), 'error');
      assert.equal(sessionCookie(r.headers), null);
    }
    /* Sin la cookie del nonce (CSRF) tampoco. */
    const r = await callback({ code: 'codigo-bueno', state });
    assert.equal(new URL(r.headers.get('location')).searchParams.get('fb'), 'error');
    /* State vencido (10 min). */
    const fresh = await begin();
    ctx.clock.now += 11 * MIN;
    const late = await callback({ code: 'codigo-bueno', state: fresh.state }, fresh.nonce);
    assert.equal(new URL(late.headers.get('location')).searchParams.get('fb'), 'error');
    assert.equal(await User.countDocuments(), 0);
  });

  test('Facebook sin email → pide email (y celular) y crea la cuenta; con email existente se verifica por correo antes de vincular', async () => {
    await boot({ id: 'fb-4', name: 'Sin Correo' });
    let { state, nonce } = await begin('/wstyle/cuenta/');
    let r = await callback({ code: 'codigo-bueno', state }, nonce);
    let loc = new URL(r.headers.get('location'));
    assert.equal(loc.searchParams.get('fb'), 'email');
    assert.equal(sessionCookie(r.headers), null);
    const done = await api(ctx.base, 'POST', '/api/auth/facebook/complete', { body: { token: loc.searchParams.get('t'), email: 'nuevo@correo.cl', phone: '987654321' } });
    assert.equal(done.status, 201);
    assert.equal(done.json.user.emailVerified, false);
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'nuevo@correo.cl' && /Confirma tu correo/.test(m.subject)));

    /* Otro Facebook sin email que dice ser de una cuenta existente (creada con contraseña). */
    await stop(ctx.server);
    ctx = await start({ now: Date.parse('2026-11-01T12:00:00Z'), env: FB_ENV, facebookFetch: fakeGraph({ id: 'fb-5', name: 'Dueño' }) });
    await api(ctx.base, 'POST', '/api/auth/register', { body: { email: 'dueno@correo.cl', name: 'Dueño', phone: '+56912345678', password: 'clave1234' } });
    ({ state, nonce } = await begin('/wstyle/cuenta/'));
    r = await callback({ code: 'codigo-bueno', state }, nonce);
    loc = new URL(r.headers.get('location'));
    const pending = await api(ctx.base, 'POST', '/api/auth/facebook/complete', { body: { token: loc.searchParams.get('t'), email: 'dueno@correo.cl', phone: '987654321' } });
    assert.equal(pending.status, 202);
    assert.equal(sessionCookie(pending.headers), null);
    const owner = await User.findOne({ email: 'dueno@correo.cl' });
    assert.ok(!owner.identities.some((i) => i.providerUserId === 'fb-5'), 'no se vincula sin verificar');
    const mail = ctx.mailer.outbox.find((m) => m.to === 'dueno@correo.cl' && /vincular Facebook/.test(m.subject));
    const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
    assert.equal((await api(ctx.base, 'POST', '/api/auth/verify-email', { body: { token } })).status, 200);
    assert.ok((await User.findById(owner._id)).identities.some((i) => i.providerUserId === 'fb-5'));
  });

  test('sin credenciales de Facebook el botón se apaga (config) y /start vuelve con fb=no_disponible', async () => {
    await boot({}, {});
    assert.deepEqual((await api(ctx.base, 'GET', '/api/auth/config')).json, { facebook: false });
    const r = await api(ctx.base, 'GET', '/api/auth/facebook/start?r=/wstyle/cuenta/');
    assert.equal(new URL(r.headers.get('location')).searchParams.get('fb'), 'no_disponible');
    /* returnTo externo → se ignora (sin open redirect). */
    const evil = await api(ctx.base, 'GET', '/api/auth/facebook/start?r=https://evil.example/');
    assert.equal(new URL(evil.headers.get('location')).pathname, '/wstyle/cuenta/');
  });
});
