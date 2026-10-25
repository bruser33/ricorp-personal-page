/* SPEC-38 AC-08…AC-11: "Continuar con Google" contra la BD de test real. Google es un
   servicio externo: se simula SOLO su token endpoint con un fetch inyectado que devuelve
   id_tokens sin firmar (el server no verifica la firma: los recibe por TLS directo del token
   endpoint, OIDC Core 3.1.3.7). Usuarios, sesiones y tokens van a la BD real. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../src/models/index.js';
import { hashPassword } from '../src/lib/session.js';
import { signState } from '../src/lib/facebook.js';
import { api, connectDb, disconnectDb, resetDb, sessionCookie, start, stop } from './helpers.js';

const GG_ENV = {
  GOOGLE_CLIENT_ID: 'cliente-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'gg-secreto-no-mostrar',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/auth/google/callback',
};
const NOW = Date.parse('2026-11-01T12:00:00Z');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.firma-no-verificada`;

/* Token endpoint simulado. `claims(nonce)` arma el id_token; el nonce real se toma del
   authorize URL que generó /start (como haría Google). */
function fakeGoogle(state) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = new URLSearchParams(init.body || '');
    calls.push({ url: String(url), body: Object.fromEntries(body) });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url) !== 'https://oauth2.googleapis.com/token') return json({ error: 'unexpected' }, 404);
    if (state.down) return json({ error: 'server_error' }, 500);
    if (body.get('client_secret') !== GG_ENV.GOOGLE_CLIENT_SECRET || body.get('grant_type') !== 'authorization_code') return json({ error: 'invalid_client' }, 401);
    if (body.get('code') !== 'codigo-bueno') return json({ error: 'invalid_grant' }, 400);
    const claims = {
      iss: 'https://accounts.google.com',
      aud: GG_ENV.GOOGLE_CLIENT_ID,
      sub: '1098765432100',
      email: 'ana@gmail.com',
      email_verified: true,
      name: 'Ana Pérez',
      nonce: state.nonce,
      iat: Math.floor(NOW / 1000),
      exp: Math.floor(NOW / 1000) + 3600,
      ...state.claims,
    };
    return json({ access_token: 'ya29.x', id_token: jwt(claims), token_type: 'Bearer', expires_in: 3599 });
  };
  return { fetchImpl, calls };
}

describe('login con Google (SPEC-38)', () => {
  let ctx;
  let gstate;
  let fake;
  const logs = [];
  const logger = { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) };
  before(connectDb);
  after(disconnectDb);
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    logs.length = 0;
    gstate = { claims: {} };
    fake = fakeGoogle(gstate);
    ctx = await start({ now: NOW, env: GG_ENV, googleFetch: fake.fetchImpl, logger });
  });
  after(async () => ctx && stop(ctx.server));

  const get = (path, cookie) => api(ctx.base, 'GET', path, { cookie });
  const seen = [];
  const remember = (r) => {
    seen.push(JSON.stringify(r.json ?? ''), r.headers.get('location') || '', ...(r.headers.getSetCookie?.() || []));
    return r;
  };

  /* /start → { state, nonceCookie, authorizeUrl } */
  async function startFlow(returnTo = '/wstyle/reservar/?servicio=corte') {
    const r = remember(await get(`/api/auth/google/start?r=${encodeURIComponent(returnTo)}`));
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location'));
    const raw = r.headers.getSetCookie().find((c) => c.startsWith('ws_gg_nonce='));
    gstate.nonce = loc.searchParams.get('nonce');
    return { loc, state: loc.searchParams.get('state'), cookie: raw.split(';')[0], raw };
  }
  const callback = async (q, cookie) => remember(await get(`/api/auth/google/callback?${new URLSearchParams(q)}`, cookie));
  const back = (r) => new URL(r.headers.get('location'));

  test('AC-08 start: redirige a Google con scope openid email profile, state, nonce y cookie httpOnly', async () => {
    const { loc, state, raw } = await startFlow();
    assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(loc.searchParams.get('scope'), 'openid email profile');
    assert.equal(loc.searchParams.get('response_type'), 'code');
    assert.equal(loc.searchParams.get('client_id'), GG_ENV.GOOGLE_CLIENT_ID);
    assert.equal(loc.searchParams.get('redirect_uri'), GG_ENV.GOOGLE_REDIRECT_URI);
    assert.ok(state && loc.searchParams.get('nonce'));
    assert.match(raw, /HttpOnly/);
    assert.match(raw, /SameSite=Lax/);
    assert.ok(!loc.toString().includes(GG_ENV.GOOGLE_CLIENT_SECRET));
    const cfg = await get('/api/auth/config');
    assert.deepEqual(cfg.json, { facebook: false, google: true });
  });

  test('AC-08 callback feliz: crea User google verificado, sesión y vuelve al returnTo con gg=nuevo; 2.º login gg=ok', async () => {
    const f = await startFlow();
    const r = await callback({ code: 'codigo-bueno', state: f.state }, f.cookie);
    assert.equal(r.status, 302);
    const to = back(r);
    assert.equal(to.pathname, '/wstyle/reservar/');
    assert.equal(to.searchParams.get('servicio'), 'corte');
    assert.equal(to.searchParams.get('gg'), 'nuevo');
    const sc = sessionCookie(r.headers);
    assert.ok(sc);
    const me = await get('/api/auth/me', sc);
    assert.equal(me.json.user.email, 'ana@gmail.com');
    assert.equal(me.json.user.emailVerified, true);
    assert.deepEqual(me.json.user.providers, ['google']);
    assert.deepEqual(me.json.user.roles, ['client']);
    const u = await User.findOne({ email: 'ana@gmail.com' });
    assert.equal(u.identities[0].providerUserId, '1098765432100');
    /* El token endpoint recibió el secreto (server a server) y el mismo redirect_uri. */
    assert.equal(fake.calls[0].body.redirect_uri, GG_ENV.GOOGLE_REDIRECT_URI);

    const f2 = await startFlow('/wstyle/cuenta/');
    const r2 = await callback({ code: 'codigo-bueno', state: f2.state }, f2.cookie);
    assert.equal(back(r2).searchParams.get('gg'), 'ok');
    assert.equal(back(r2).pathname, '/wstyle/cuenta/');
    assert.equal(await User.countDocuments(), 1);
  });

  const noSession = async (r, gg = 'error') => {
    assert.equal(r.status, 302);
    assert.equal(back(r).searchParams.get('gg'), gg);
    assert.equal(sessionCookie(r.headers), null);
  };

  test('AC-09 email_verified false → sin usuario ni sesión', async () => {
    const f = await startFlow();
    gstate.claims = { email_verified: false };
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie));
    assert.equal(await User.countDocuments(), 0);
  });

  test('AC-09 state alterado, nonce de cookie distinto, nonce del id_token distinto, aud ajeno, vencido → sin sesión', async () => {
    let f = await startFlow();
    await noSession(await callback({ code: 'codigo-bueno', state: f.state.slice(0, -2) + 'xx' }, f.cookie));
    f = await startFlow();
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, 'ws_gg_nonce=otro'));
    f = await startFlow();
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }));
    /* state firmado por el server pero de Facebook (sin p:'google') → no sirve acá. */
    f = await startFlow();
    const nonce = f.cookie.split('=')[1];
    const fbState = signState({ r: '/wstyle/cuenta/', n: nonce, exp: NOW + 60_000 }, 'test-secret');
    await noSession(await callback({ code: 'codigo-bueno', state: fbState }, f.cookie));
    f = await startFlow();
    gstate.nonce = 'nonce-de-otro-intento';
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie));
    f = await startFlow();
    gstate.claims = { aud: 'otra-app.apps.googleusercontent.com' };
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie));
    f = await startFlow();
    gstate.claims = { iss: 'https://evil.example' };
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie));
    f = await startFlow();
    gstate.claims = { exp: Math.floor(NOW / 1000) - 10 };
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie));
    f = await startFlow();
    gstate.claims = {};
    await noSession(await callback({ code: 'codigo-malo', state: f.state }, f.cookie));
    assert.equal(await User.countDocuments(), 0);
  });

  test('AC-09 access_denied → gg=error; Google caído → gg=no_disponible', async () => {
    let f = await startFlow();
    await noSession(await callback({ error: 'access_denied', state: f.state }, f.cookie));
    f = await startFlow();
    gstate.down = true;
    await noSession(await callback({ code: 'codigo-bueno', state: f.state }, f.cookie), 'no_disponible');
  });

  test('AC-09 sin configurar → /config google:false y start redirige con gg=no_disponible', async () => {
    await stop(ctx.server);
    ctx = await start({ now: NOW, googleFetch: fake.fetchImpl, logger });
    assert.equal((await get('/api/auth/config')).json.google, false);
    const r = await get('/api/auth/google/start?r=%2Fwstyle%2Freservar%2F');
    assert.equal(r.status, 302);
    const to = back(r);
    assert.equal(to.pathname, '/wstyle/reservar/');
    assert.equal(to.searchParams.get('gg'), 'no_disponible');
  });

  test('AC-10 email con contraseña → gg=vincular; link con contraseña incorrecta 401, correcta vincula y entra', async () => {
    await User.create({ email: 'ana@gmail.com', name: 'Ana', roles: ['client'], identities: [{ provider: 'email', providerUserId: 'ana@gmail.com', passwordHash: await hashPassword('clave1234') }] });
    const f = await startFlow();
    const r = await callback({ code: 'codigo-bueno', state: f.state }, f.cookie);
    const to = back(r);
    assert.equal(to.searchParams.get('gg'), 'vincular');
    assert.equal(to.searchParams.get('email'), 'ana@gmail.com');
    assert.equal(sessionCookie(r.headers), null);
    const t = to.searchParams.get('t');
    const bad = remember(await api(ctx.base, 'POST', '/api/auth/google/link', { body: { token: t, password: 'otra9999' } }));
    assert.equal(bad.status, 401);
    const ok = remember(await api(ctx.base, 'POST', '/api/auth/google/link', { body: { token: t, password: 'clave1234' } }));
    assert.equal(ok.status, 200);
    assert.ok(sessionCookie(ok.headers));
    assert.deepEqual(ok.json.user.providers.sort(), ['email', 'google']);
    assert.equal(ok.json.returnTo, '/wstyle/reservar/?servicio=corte');
    /* El token es de un solo uso. */
    assert.equal((await api(ctx.base, 'POST', '/api/auth/google/link', { body: { token: t, password: 'clave1234' } })).status, 410);
    /* Siguiente login con Google entra directo. */
    const f2 = await startFlow();
    assert.equal(back(await callback({ code: 'codigo-bueno', state: f2.state }, f2.cookie)).searchParams.get('gg'), 'ok');
  });

  test('AC-10 cuenta solo Facebook con ese email → se vincula y entra (email verificado)', async () => {
    await User.create({ email: 'ana@gmail.com', emailVerified: false, name: 'Ana', roles: ['client'], identities: [{ provider: 'facebook', providerUserId: 'fb-1' }] });
    const f = await startFlow();
    const r = await callback({ code: 'codigo-bueno', state: f.state }, f.cookie);
    assert.equal(back(r).searchParams.get('gg'), 'ok');
    assert.ok(sessionCookie(r.headers));
    const u = await User.findOne({ email: 'ana@gmail.com' });
    assert.deepEqual(u.identities.map((i) => i.provider).sort(), ['facebook', 'google']);
    assert.equal(u.emailVerified, true);
    assert.equal(await User.countDocuments(), 1);
  });

  test('AC-11 GOOGLE_CLIENT_SECRET nunca aparece en respuestas, Location, cookies ni logs', async () => {
    const f = await startFlow();
    gstate.down = true;
    await callback({ code: 'codigo-bueno', state: f.state }, f.cookie);
    gstate.down = false;
    const f2 = await startFlow();
    await callback({ code: 'codigo-bueno', state: f2.state }, f2.cookie);
    remember(await get('/api/auth/config'));
    const all = [...seen, ...logs].join('\n');
    assert.ok(!all.includes(GG_ENV.GOOGLE_CLIENT_SECRET));
  });
});
