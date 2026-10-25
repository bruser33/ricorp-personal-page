/* Cuentas (SPEC-32 RN-18…RN-26): registro/login con email, Facebook (OAuth en el
   server), verificación de email, recuperación de contraseña, sesión y eliminación. */
import express from 'express';
import crypto from 'node:crypto';
import { AuthToken, User } from '../models/index.js';
import { HttpError, handle } from '../lib/errors.js';
import { cleanName, clMobile, isEmail, normEmail, passwordProblem } from '../lib/validate.js';
import {
  checkPassword,
  clearSessionCookie,
  findToken,
  hashPassword,
  issueToken,
  publicUser,
  startSession,
} from '../lib/session.js';
import { appendCookie, parseCookies, serializeCookie } from '../lib/cookies.js';
import { signState, verifyState } from '../lib/facebook.js';
import { linkFacebookMail, resetPasswordMail, verifyEmailMail } from '../lib/emails.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const FB_NONCE_COOKIE = 'ws_fb_nonce';
export const LOGIN_LIMIT = { max: 5, windowMs: 15 * MIN };

/* Solo rutas propias como destino de vuelta (sin open redirect). */
export function safeReturnTo(r, fallback = '/wstyle/cuenta/') {
  const s = String(r || '');
  return /^\/wstyle\/[A-Za-z0-9\-_/?=&%.:+~]*$/.test(s) && !s.startsWith('//') ? s : fallback;
}

function fieldError(fields) {
  const codes = Object.values(fields);
  return new HttpError(400, codes[0], 'Revisa los datos', { fields });
}

/* Intentos fallidos de login por email (ventana deslizante, en memoria como /api/contact). */
function createLoginLimiter({ max, windowMs }, clock) {
  const fails = new Map();
  const recent = (email) => (fails.get(email) || []).filter((t) => clock() - t < windowMs);
  return {
    blocked: (email) => recent(email).length >= max,
    fail: (email) => fails.set(email, [...recent(email), clock()]),
    clear: (email) => fails.delete(email),
    reset: () => fails.clear(),
  };
}

export function createAuthRouter({ env, clock, mailer, logger, facebook, frontUrl, secret, loginLimit = LOGIN_LIMIT, onAccountDeleted }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);
  const loginLimiter = createLoginLimiter(loginLimit, clock);
  r.loginLimiter = loginLimiter;

  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para continuar');
    return req.user;
  };

  async function sendVerification(user) {
    const token = await issueToken({ type: 'verify_email', userId: user._id, ttlMs: 24 * HOUR, now: clock() });
    const mail = verifyEmailMail({ name: user.name, url: `${frontUrl}/wstyle/cuenta/confirmar/?t=${token}` });
    const out = await mailer.send({ to: user.email, ...mail });
    if (!out.ok) logger.error('[auth] no se pudo enviar "Confirma tu correo" a', user.email);
    return out.ok;
  }

  r.get('/config', (_req, res) => res.json({ facebook: facebook.enabled }));

  r.get('/me', h(async (req, res) => res.json({ user: publicUser(requireUser(req)) })));

  /* Paso "¿Cuál es tu correo?": dice si hay que "Crear cuenta" o "Entrar". */
  r.post('/email-status', h(async (req, res) => {
    const email = normEmail(req.body?.email);
    if (!isEmail(email)) throw fieldError({ email: 'invalid_email' });
    const user = await User.findOne({ email, status: 'active' });
    res.json({ exists: Boolean(user), hasPassword: Boolean(user?.identities?.some((i) => i.provider === 'email' && i.passwordHash)) });
  }));

  r.post('/register', h(async (req, res) => {
    const email = normEmail(req.body?.email);
    const name = cleanName(req.body?.name);
    const phone = clMobile(req.body?.phone);
    const password = String(req.body?.password ?? '');
    const fields = {};
    if (!isEmail(email)) fields.email = 'invalid_email';
    if (!name) fields.name = 'required';
    if (!phone) fields.phone = 'invalid_phone';
    const pw = passwordProblem(password, email);
    if (pw) fields.password = pw;
    if (Object.keys(fields).length) throw fieldError(fields);
    if (await User.exists({ email })) throw new HttpError(409, 'email_taken', 'Ya tienes una cuenta con este correo');
    let user;
    try {
      user = await User.create({
        email,
        name,
        phoneE164: phone,
        roles: ['client'],
        identities: [{ provider: 'email', providerUserId: email, passwordHash: await hashPassword(password) }],
      });
    } catch (err) {
      if (err?.code === 11000) throw new HttpError(409, 'email_taken', 'Ya tienes una cuenta con este correo');
      throw err;
    }
    await startSession(res, user._id, { env, now: clock() });
    const mailOk = await sendVerification(user);
    res.status(201).json({ user: publicUser(user), verificationSent: mailOk });
  }));

  r.post('/login', h(async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    if (loginLimiter.blocked(email)) throw new HttpError(429, 'too_many_attempts', 'Demasiados intentos. Prueba de nuevo en 15 minutos.');
    const user = isEmail(email) ? await User.findOne({ email, status: 'active' }) : null;
    const identity = user?.identities?.find((i) => i.provider === 'email');
    const ok = identity ? await checkPassword(password, identity.passwordHash) : false;
    if (!ok) {
      loginLimiter.fail(email);
      throw new HttpError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    }
    loginLimiter.clear(email);
    await startSession(res, user._id, { env, now: clock() });
    res.json({ user: publicUser(user) });
  }));

  r.post('/logout', h(async (req, res) => {
    if (req.sessionTokenId) await AuthToken.deleteOne({ _id: req.sessionTokenId });
    clearSessionCookie(res, env);
    res.json({ ok: true });
  }));

  /* Completar datos (p.ej. el celular que Facebook no entrega). */
  r.patch('/me', h(async (req, res) => {
    const user = requireUser(req);
    const fields = {};
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) fields.name = 'required';
      else user.name = name;
    }
    if (req.body?.phone !== undefined) {
      const phone = clMobile(req.body.phone);
      if (!phone) fields.phone = 'invalid_phone';
      else user.phoneE164 = phone;
    }
    if (Object.keys(fields).length) throw fieldError(fields);
    await user.save();
    res.json({ user: publicUser(user) });
  }));

  /* CB-24: un barbero o super admin agrega el rol cliente para reservar para sí. */
  r.post('/me/client-role', h(async (req, res) => {
    const user = requireUser(req);
    if (!user.roles.includes('client')) {
      user.roles.push('client');
      await user.save();
    }
    res.json({ user: publicUser(user) });
  }));

  r.post('/resend-verification', h(async (req, res) => {
    const user = requireUser(req);
    if (user.emailVerified || !user.email) return res.json({ ok: true, alreadyVerified: user.emailVerified });
    res.json({ ok: await sendVerification(user) });
  }));

  r.post('/verify-email', h(async (req, res) => {
    const doc = await findToken('verify_email', req.body?.token, clock());
    if (!doc) throw new HttpError(400, 'invalid_token', 'El link no es válido');
    if (doc === 'expired') throw new HttpError(410, 'token_expired', 'El link venció. Pide uno nuevo desde tu cuenta.');
    const user = await User.findById(doc.userId);
    if (!user) throw new HttpError(400, 'invalid_token', 'El link no es válido');
    user.emailVerified = true;
    /* Vincular Facebook pedido con email (CB-20): se confirma al abrir este link. */
    if (doc.data?.facebookId && !user.identities.some((i) => i.provider === 'facebook')) {
      user.identities.push({ provider: 'facebook', providerUserId: doc.data.facebookId });
    }
    await user.save();
    doc.usedAt = new Date(clock());
    await doc.save();
    res.json({ ok: true, user: publicUser(user) });
  }));

  /* RN-22: misma respuesta exista o no la cuenta. */
  r.post('/forgot', h(async (req, res) => {
    const email = normEmail(req.body?.email);
    const user = isEmail(email) ? await User.findOne({ email, status: 'active' }) : null;
    if (user) {
      const token = await issueToken({ type: 'reset_password', userId: user._id, ttlMs: HOUR, now: clock() });
      await mailer.send({ to: user.email, ...resetPasswordMail({ name: user.name, url: `${frontUrl}/wstyle/cuenta/recuperar/?t=${token}` }) });
    }
    res.json({ ok: true, message: 'Si existe una cuenta con ese correo, te enviamos un link' });
  }));

  r.post('/reset', h(async (req, res) => {
    const doc = await findToken('reset_password', req.body?.token, clock());
    if (!doc) throw new HttpError(400, 'invalid_token', 'El link no es válido');
    if (doc === 'expired') throw new HttpError(410, 'token_expired', 'El link venció o ya se usó. Pide uno nuevo.');
    const user = await User.findById(doc.userId);
    if (!user) throw new HttpError(400, 'invalid_token', 'El link no es válido');
    const pw = passwordProblem(req.body?.password, user.email);
    if (pw) throw fieldError({ password: pw });
    const passwordHash = await hashPassword(req.body.password);
    const identity = user.identities.find((i) => i.provider === 'email');
    if (identity) identity.passwordHash = passwordHash;
    else user.identities.push({ provider: 'email', providerUserId: user.email, passwordHash });
    /* Quien recibió el link controla el correo. */
    user.emailVerified = true;
    await user.save();
    doc.usedAt = new Date(clock());
    await doc.save();
    /* Cambiar la contraseña cierra las otras sesiones. */
    await AuthToken.deleteMany({ type: 'session', userId: user._id });
    loginLimiter.clear(user.email);
    res.json({ ok: true });
  }));

  /* RN-26: anonimiza y cancela las citas futuras (lo hace el módulo de citas). */
  r.delete('/me', h(async (req, res) => {
    const user = requireUser(req);
    await anonymizeUser(user._id);
    clearSessionCookie(res, env);
    res.json({ ok: true });
  }));

  async function anonymizeUser(userId) {
    const user = await User.findById(userId);
    if (!user) return;
    if (onAccountDeleted) await onAccountDeleted(user);
    user.set({ name: 'Cliente eliminado', email: undefined, phoneE164: undefined, identities: [], status: 'deleted', deletedAt: new Date(clock()), emailVerified: false });
    await user.save();
    await AuthToken.deleteMany({ userId: user._id });
  }

  /* ─── Facebook */
  const front = (path, params) => {
    const u = new URL(path, frontUrl);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
    return u.toString();
  };

  r.get('/facebook/start', (req, res) => {
    const returnTo = safeReturnTo(req.query.r);
    if (!facebook.enabled) return res.redirect(302, front(returnTo, { fb: 'no_disponible' }));
    const nonce = crypto.randomBytes(16).toString('base64url');
    const state = signState({ r: returnTo, n: nonce, exp: clock() + 10 * MIN }, secret);
    appendCookie(res, serializeCookie(FB_NONCE_COOKIE, nonce, { maxAge: 600, sameSite: 'Lax', secure: Boolean(env.RENDER) }));
    res.redirect(302, facebook.authorizeUrl(state));
  });

  r.get('/facebook/callback', h(async (req, res) => {
    const data = verifyState(req.query.state, secret, clock());
    const nonce = parseCookies(req.headers.cookie)[FB_NONCE_COOKIE];
    appendCookie(res, serializeCookie(FB_NONCE_COOKIE, '', { maxAge: 0 }));
    const returnTo = safeReturnTo(data?.r);
    /* CB-21: state inválido/vencido o cancelado → nunca se crea sesión. */
    if (!data || !nonce || data.n !== nonce) return res.redirect(302, front(returnTo, { fb: 'error' }));
    if (req.query.error) {
      const fb = req.query.error === 'access_denied' ? 'error' : 'no_disponible';
      return res.redirect(302, front(returnTo, { fb }));
    }
    if (!req.query.code) return res.redirect(302, front(returnTo, { fb: 'error' }));
    let profile;
    try {
      profile = await facebook.profileFromCode(String(req.query.code));
    } catch (err) {
      logger.error('[auth] facebook:', err.message);
      return res.redirect(302, front(returnTo, { fb: 'no_disponible' }));
    }
    const now = clock();
    const known = await User.findOne({ identities: { $elemMatch: { provider: 'facebook', providerUserId: profile.id } }, status: 'active' });
    if (known) {
      await startSession(res, known._id, { env, now });
      return res.redirect(302, front(returnTo, { fb: 'ok' }));
    }
    if (!profile.email) {
      /* CB-20: Facebook sin email → se pide uno. */
      const t = await issueToken({ type: 'fb_email', ttlMs: 30 * MIN, now, data: { facebookId: profile.id, name: profile.name, returnTo } });
      return res.redirect(302, front(returnTo, { fb: 'email', t }));
    }
    const existing = await User.findOne({ email: profile.email, status: 'active' });
    if (existing) {
      /* RN-19: no se vincula en silencio; se confirma con la contraseña. */
      const t = await issueToken({ type: 'fb_link', userId: existing._id, ttlMs: 30 * MIN, now, data: { facebookId: profile.id, returnTo } });
      return res.redirect(302, front(returnTo, { fb: 'vincular', t, email: profile.email }));
    }
    const user = await User.create({
      email: profile.email,
      emailVerified: true,
      name: cleanName(profile.name) || profile.email.split('@')[0],
      roles: ['client'],
      identities: [{ provider: 'facebook', providerUserId: profile.id }],
    });
    await startSession(res, user._id, { env, now });
    res.redirect(302, front(returnTo, { fb: 'nuevo' }));
  }));

  /* "Ya tienes una cuenta con <email>. Ingresa tu contraseña para vincular Facebook." */
  r.post('/facebook/link', h(async (req, res) => {
    const doc = await findToken('fb_link', req.body?.token, clock());
    if (!doc || doc === 'expired') throw new HttpError(410, 'token_expired', 'El inicio con Facebook venció. Inténtalo de nuevo.');
    const user = await User.findById(doc.userId);
    const identity = user?.identities?.find((i) => i.provider === 'email');
    if (loginLimiter.blocked(user?.email)) throw new HttpError(429, 'too_many_attempts', 'Demasiados intentos. Prueba de nuevo en 15 minutos.');
    if (!identity || !(await checkPassword(req.body?.password, identity.passwordHash))) {
      loginLimiter.fail(user?.email);
      throw new HttpError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    }
    if (!user.identities.some((i) => i.provider === 'facebook')) user.identities.push({ provider: 'facebook', providerUserId: doc.data.facebookId });
    user.emailVerified = true;
    await user.save();
    doc.usedAt = new Date(clock());
    await doc.save();
    await startSession(res, user._id, { env, now: clock() });
    res.json({ user: publicUser(user), returnTo: doc.data.returnTo });
  }));

  /* "Un último dato" cuando Facebook no entregó el email (CB-20). */
  r.post('/facebook/complete', h(async (req, res) => {
    const doc = await findToken('fb_email', req.body?.token, clock());
    if (!doc || doc === 'expired') throw new HttpError(410, 'token_expired', 'El inicio con Facebook venció. Inténtalo de nuevo.');
    const email = normEmail(req.body?.email);
    const phone = clMobile(req.body?.phone);
    const fields = {};
    if (!isEmail(email)) fields.email = 'invalid_email';
    if (!phone) fields.phone = 'invalid_phone';
    if (Object.keys(fields).length) throw fieldError(fields);
    const existing = await User.findOne({ email, status: 'active' });
    if (existing) {
      /* Se verifica por correo ANTES de vincular a una cuenta existente. */
      const t = await issueToken({ type: 'verify_email', userId: existing._id, ttlMs: 24 * HOUR, now: clock(), data: { facebookId: doc.data.facebookId } });
      await mailer.send({ to: existing.email, ...linkFacebookMail({ name: existing.name, url: `${frontUrl}/wstyle/cuenta/confirmar/?t=${t}` }) });
      doc.usedAt = new Date(clock());
      await doc.save();
      return res.status(202).json({ pending: 'check_email' });
    }
    const user = await User.create({
      email,
      emailVerified: false,
      name: cleanName(doc.data.name) || email.split('@')[0],
      phoneE164: phone,
      roles: ['client'],
      identities: [{ provider: 'facebook', providerUserId: doc.data.facebookId }],
    });
    doc.usedAt = new Date(clock());
    await doc.save();
    await startSession(res, user._id, { env, now: clock() });
    await sendVerification(user);
    res.status(201).json({ user: publicUser(user), returnTo: doc.data.returnTo });
  }));

  /* URL de eliminación de datos que exige Meta (signed_request firmado con el secreto). */
  r.post('/facebook/data-deletion', express.urlencoded({ extended: false }), h(async (req, res) => {
    const data = facebook.enabled ? facebook.parseSignedRequest(req.body?.signed_request) : null;
    if (!data?.user_id) throw new HttpError(400, 'invalid_request', 'signed_request inválido');
    const user = await User.findOne({ identities: { $elemMatch: { provider: 'facebook', providerUserId: String(data.user_id) } } });
    const code = crypto.randomBytes(8).toString('hex');
    if (user) await anonymizeUser(user._id);
    res.json({ url: `${frontUrl}/wstyle/cuenta/?eliminada=${code}`, confirmation_code: code });
  }));

  return r;
}
