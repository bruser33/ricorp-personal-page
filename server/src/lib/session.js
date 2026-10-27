/* Sesión (RN-23): token aleatorio en cookie httpOnly; en la BD solo su hash
   (AuthToken type 'session'), así "Cerrar sesión" la invalida en el server.
   30 días, renovable: cada uso con más de un día de antigüedad la extiende. */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AuthToken, User } from '../models/index.js';
import { appendCookie, parseCookies, serializeCookie } from './cookies.js';

export const SESSION_COOKIE = 'ws_session';
export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

export const hashPassword = (p) => bcrypt.hash(String(p), 10);
export const checkPassword = (p, hash) => (hash ? bcrypt.compare(String(p), hash) : Promise.resolve(false));

export async function issueToken({ type, userId = null, ttlMs, now, data }) {
  const token = newToken();
  await AuthToken.create({ type, userId, tokenHash: sha256(token), expiresAt: new Date(now + ttlMs), data });
  return token;
}

/* Token de un solo uso vigente → doc (sin marcarlo usado). 'expired' si existe y venció o ya se usó. */
export async function findToken(type, token, now) {
  if (!token || typeof token !== 'string') return null;
  const doc = await AuthToken.findOne({ type, tokenHash: sha256(token) });
  if (!doc) return null;
  if (doc.usedAt || doc.expiresAt.getTime() <= now) return 'expired';
  return doc;
}

export function cookieOptions(env) {
  const sameSite = env.COOKIE_SAMESITE || 'Lax';
  const secure = ['1', 'true'].includes(String(env.COOKIE_SECURE || '').toLowerCase()) || Boolean(env.RENDER);
  return { sameSite, secure };
}

export async function startSession(res, userId, { env, now }) {
  const token = await issueToken({ type: 'session', userId, ttlMs: SESSION_DAYS * DAY, now });
  appendCookie(res, serializeCookie(SESSION_COOKIE, token, { maxAge: (SESSION_DAYS * DAY) / 1000, ...cookieOptions(env) }));
  return token;
}

export function clearSessionCookie(res, env) {
  appendCookie(res, serializeCookie(SESSION_COOKIE, '', { maxAge: 0, ...cookieOptions(env) }));
}

export function readSessionToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

/* Middleware: deja req.user (doc) y req.sessionTokenId si hay sesión válida. */
export function sessionMiddleware({ clock }) {
  return async (req, _res, next) => {
    req.user = null;
    try {
      const token = readSessionToken(req);
      if (!token) return next();
      const now = clock();
      const doc = await AuthToken.findOne({ type: 'session', tokenHash: sha256(token) });
      if (!doc || doc.expiresAt.getTime() <= now) return next();
      const user = await User.findById(doc.userId);
      if (!user || user.status !== 'active') return next();
      req.user = user;
      req.sessionTokenId = doc._id;
      if (doc.expiresAt.getTime() - now < (SESSION_DAYS - 1) * DAY) {
        await AuthToken.updateOne({ _id: doc._id }, { expiresAt: new Date(now + SESSION_DAYS * DAY) });
      }
    } catch (err) {
      return next(err);
    }
    next();
  };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    name: u.name || '',
    email: u.email || null,
    emailVerified: Boolean(u.emailVerified),
    phone: u.phoneE164 || null,
    roles: [...(u.roles || [])],
    providers: (u.identities || []).map((i) => i.provider),
  };
}
