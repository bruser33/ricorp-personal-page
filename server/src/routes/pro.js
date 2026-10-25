/* API del barbero: /api/pro/... (SPEC-33). Registro con email o Facebook, perfil,
   disponibilidad, domicilio, fotos y el panel de trabajo. La lógica vive en
   domain/pro.js; acá solo HTTP. */
import express from 'express';
import multer from 'multer';
import { User } from '../models/index.js';
import { HttpError, handle } from '../lib/errors.js';
import { checkPassword, findToken, hashPassword, issueToken, publicUser, startSession } from '../lib/session.js';
import { clMobile, isEmail, normEmail, passwordProblem } from '../lib/validate.js';
import { linkFacebookMail, verifyEmailMail } from '../lib/emails.js';
import { MAX_PHOTO_BYTES, MAX_PHOTOS } from '../lib/photos.js';
import { validName } from '../domain/pro.js';
import { computeStats, parseRange } from '../domain/stats.js';

const HOUR = 60 * 60 * 1000;

const fieldError = (fields) => new HttpError(400, Object.values(fields)[0], 'Revisa los datos', { fields });

export function createProRouter({ pro, env, clock, mailer, logger, frontUrl, loginLimiter, billing = null }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 5 } });
  function receivePhotos(req, res, next) {
    upload.array('photos', MAX_PHOTOS)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'photo_too_large', message: 'Cada foto puede pesar hasta 5 MB.', maxBytes: MAX_PHOTO_BYTES });
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ ok: false, error: 'too_many_photos', message: `Puedes subir hasta ${MAX_PHOTOS} fotos.`, max: MAX_PHOTOS });
      next(err);
    });
  }

  async function sendVerification(user) {
    const token = await issueToken({ type: 'verify_email', userId: user._id, ttlMs: 24 * HOUR, now: clock() });
    const out = await mailer.send({ to: user.email, ...verifyEmailMail({ name: user.name, url: `${frontUrl}/wstyle/cuenta/confirmar/?t=${token}` }) });
    return out.ok;
  }

  /* Paso A.2: "Crear cuenta de barbero". Si el email ya es de una cuenta (RN-02), se
     pide su contraseña y se agrega el rol a ESA cuenta. */
  r.post('/register', h(async (req, res) => {
    const b = req.body || {};
    const email = normEmail(b.email);
    if (!isEmail(email)) throw fieldError({ email: 'invalid_email' });
    const acceptTerms = b.acceptTerms === true;
    const existing = await User.findOne({ email, status: 'active' });
    if (existing) {
      if (loginLimiter.blocked(email)) throw new HttpError(429, 'too_many_attempts', 'Demasiados intentos. Prueba de nuevo en 15 minutos.');
      const identity = existing.identities.find((i) => i.provider === 'email' && i.passwordHash);
      if (!identity) throw new HttpError(409, 'use_facebook', 'Esta cuenta entra con Facebook. Usa "Continuar con Facebook".');
      if (!(await checkPassword(b.password, identity.passwordHash))) {
        loginLimiter.fail(email);
        throw new HttpError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
      }
      loginLimiter.clear(email);
      const phone = b.phone ? clMobile(b.phone) : existing.phoneE164;
      const fields = {};
      if (!phone) fields.phone = 'invalid_phone';
      if (!acceptTerms) fields.acceptTerms = 'required';
      if (Object.keys(fields).length) throw fieldError(fields);
      await pro.ensureBarber(existing, { phone, acceptTerms: true });
      await startSession(res, existing._id, { env, now: clock() });
      return res.json({ user: publicUser(existing), existing: true });
    }
    const name = validName(b.name);
    const phone = clMobile(b.phone);
    const fields = {};
    if (!name) fields.name = 'invalid_name';
    if (!phone) fields.phone = 'invalid_phone';
    const pw = passwordProblem(b.password, email);
    if (pw) fields.password = pw;
    if (!acceptTerms) fields.acceptTerms = 'required';
    if (Object.keys(fields).length) throw fieldError(fields);
    let user;
    try {
      user = await User.create({ email, name, phoneE164: phone, roles: ['barber'], identities: [{ provider: 'email', providerUserId: email, passwordHash: await hashPassword(b.password) }] });
    } catch (err) {
      if (err?.code === 11000) throw new HttpError(409, 'email_taken', 'Ya tienes una cuenta con este correo');
      throw err;
    }
    await pro.ensureBarber(user, { phone, name, acceptTerms: true });
    await startSession(res, user._id, { env, now: clock() });
    res.status(201).json({ user: publicUser(user), existing: false });
  }));

  /* Con sesión: agregar el perfil de barbero a la cuenta (cliente logueado, o quien
     volvió de Facebook y le falta celular + términos). */
  r.post('/join', h(async (req, res) => {
    const user = req.user;
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para continuar');
    const b = req.body || {};
    const fields = {};
    const phone = b.phone !== undefined && String(b.phone).trim() !== '' ? clMobile(b.phone) : user.phoneE164;
    if (!phone) fields.phone = 'invalid_phone';
    let name = null;
    if (b.name !== undefined) {
      name = validName(b.name);
      if (!name) fields.name = 'invalid_name';
    }
    if (b.acceptTerms !== true) fields.acceptTerms = 'required';
    if (Object.keys(fields).length) throw fieldError(fields);
    if (name) user.name = name;
    await pro.ensureBarber(user, { phone, name, acceptTerms: true });
    res.json({ user: publicUser(user) });
  }));

  /* CB-13: Facebook no entregó el email → se pide, y se verifica antes de enviar a revisión. */
  r.post('/facebook/register', h(async (req, res) => {
    const b = req.body || {};
    const doc = await findToken('fb_email', b.token, clock());
    if (!doc || doc === 'expired') throw new HttpError(410, 'token_expired', 'El inicio con Facebook venció. Inténtalo de nuevo.');
    const email = normEmail(b.email);
    const phone = clMobile(b.phone);
    const name = validName(b.name ?? doc.data?.name);
    const fields = {};
    if (!isEmail(email)) fields.email = 'invalid_email';
    if (!phone) fields.phone = 'invalid_phone';
    if (!name) fields.name = 'invalid_name';
    if (b.acceptTerms !== true) fields.acceptTerms = 'required';
    if (Object.keys(fields).length) throw fieldError(fields);
    const existing = await User.findOne({ email, status: 'active' });
    if (existing) {
      const t = await issueToken({ type: 'verify_email', userId: existing._id, ttlMs: 24 * HOUR, now: clock(), data: { facebookId: doc.data.facebookId } });
      await mailer.send({ to: existing.email, ...linkFacebookMail({ name: existing.name, url: `${frontUrl}/wstyle/cuenta/confirmar/?t=${t}` }) });
      doc.usedAt = new Date(clock());
      await doc.save();
      return res.status(202).json({ pending: 'check_email' });
    }
    const user = await User.create({ email, emailVerified: false, name, phoneE164: phone, roles: ['barber'], identities: [{ provider: 'facebook', providerUserId: doc.data.facebookId }] });
    doc.usedAt = new Date(clock());
    await doc.save();
    const p = await pro.ensureBarber(user, { phone, name, acceptTerms: true });
    p.emailCheckRequired = true;
    await p.save();
    await startSession(res, user._id, { env, now: clock() });
    await sendVerification(user);
    res.status(201).json({ user: publicUser(user) });
  }));

  const u = (req) => req.user;

  r.get('/me', h(async (req, res) => res.json(await pro.me(u(req)))));
  r.patch('/profile', h(async (req, res) => res.json({ professional: await pro.updateProfile(u(req), req.body || {}) })));
  r.put('/services', h(async (req, res) => res.json(await pro.setServices(u(req), req.body || {}))));
  r.put('/availability', h(async (req, res) => res.json(await pro.setAvailability(u(req), req.body || {}))));
  r.put('/home-service', h(async (req, res) => res.json(await pro.setHomeService(u(req), req.body || {}))));
  r.post('/time-off', h(async (req, res) => res.status(201).json(await pro.addTimeOff(u(req), req.body || {}))));
  r.delete('/time-off/:id', h(async (req, res) => res.json(await pro.removeTimeOff(u(req), req.params.id))));
  /* La sesión se revisa ANTES de recibir los archivos (no se bufferean fotos de anónimos). */
  r.post('/photos', h(async (req, _res, next) => { await pro.context(u(req), { edit: true }); next(); }), receivePhotos, h(async (req, res) => res.json(await pro.addPhotos(u(req), req.files || []))));
  r.delete('/photos/:id', h(async (req, res) => res.json(await pro.removePhoto(u(req), req.params.id))));
  r.post('/photos/:id/main', h(async (req, res) => res.json(await pro.mainPhoto(u(req), req.params.id))));
  r.post('/submit', h(async (req, res) => res.json(await pro.submit(u(req)))));

  r.get('/agenda', h(async (req, res) => res.json(await pro.agendaRange(u(req), { from: String(req.query.from || ''), to: String(req.query.to || '') }))));
  r.get('/slots', h(async (req, res) => {
    const q = req.query;
    res.json(await pro.slots(u(req), { service: String(q.service || ''), date: String(q.date || ''), mode: String(q.mode || 'shop'), appointment: q.appointment ? String(q.appointment) : null }));
  }));
  r.get('/appointments/:id', h(async (req, res) => res.json(await pro.viewAppointment(u(req), req.params.id))));
  for (const [path, action] of [
    ['confirm', 'confirm'],
    ['reject', 'reject'],
    ['propose', 'propose'],
    ['reschedule', 'reschedule'],
    ['cancel', 'cancel'],
    ['start', 'start'],
    ['finish', 'finish'],
    ['no-show', 'no_show'],
  ]) {
    r.post(`/appointments/:id/${path}`, h(async (req, res) => res.json(await pro.act(u(req), req.params.id, action, req.body || {}))));
  }
  r.post('/invitations', h(async (req, res) => res.status(201).json(await pro.invite(u(req), req.body || {}))));
  /* SPEC-34 RN-07 / asunción 7: el barbero aprobado ve solo SUS estadísticas. */
  r.get('/stats', h(async (req, res) => {
    const { b, pro: me } = await pro.context(u(req), { operate: true });
    res.json(await computeStats(b, { ...parseRange(req.query, clock(), b.timezone), professionalId: me._id }));
  }));
  /* SPEC-37 regla 1 / asunción 4: el barbero ve solo los pagos de SUS citas (sin totales del local
     ni comisiones) y registra el N° de boleta de sus cobros en el local. Sin sesión → 403. */
  const barberPay = async (req) => {
    if (!req.user) throw new HttpError(403, 'forbidden', 'Inicia sesión con tu cuenta de barbero.');
    if (!billing) throw new HttpError(503, 'unavailable', 'Pagos no disponibles');
    return pro.context(u(req), { operate: true });
  };
  r.get('/payments', h(async (req, res) => {
    const { b, pro: me } = await barberPay(req);
    res.json(await billing.list(b, req.query, { role: 'barber', professionalId: me._id }));
  }));
  r.post('/payments/:id/boleta', h(async (req, res) => {
    const { b, pro: me } = await barberPay(req);
    const out = await billing.registerBoleta(b, req.params.id, req.body?.number, { professionalId: me._id, by: 'barber', user: u(req) });
    res.json({ payment: out.payment });
  }));
  r.get('/notifications', h(async (req, res) => res.json(await pro.notifications(u(req)))));
  r.post('/notifications/read', h(async (req, res) => res.json(await pro.markRead(u(req), req.body?.ids))));

  return r;
}
