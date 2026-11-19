/* API de la agenda de WS Style: /api/wstyle/... (SPEC-32). */
import express from 'express';
import { HttpError, handle } from '../lib/errors.js';
import { imageUpload, notFoundPhoto, photoFile, streamPhoto } from '../lib/photos.js';

export function createWstyleRouter({ agenda, payments, logger, bookingLimiter, styles = null }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);
  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    return req.user;
  };

  r.get('/catalog', h(async (_req, res) => res.json(await agenda.catalog())));

  /* SPEC-59: catálogo de estilos (público, solo activos) y foto de referencia del cliente. */
  if (styles) {
    r.get('/styles', h(async (req, res) => res.json(await styles.publicList({ service: String(req.query.service || '') }))));
    /* La sesión se revisa ANTES de recibir el archivo (no se bufferean fotos de anónimos). */
    r.post('/reference-photo', h(async (req, _res, next) => { requireUser(req); next(); }), imageUpload({ field: 'photo' }), h(async (req, res) => res.status(201).json(await styles.uploadClientPhoto(req.user, req.file))));
    r.delete('/reference-photo/:id', h(async (req, res) => res.json(await styles.discardClientPhoto(requireUser(req), req.params.id))));
    /* RN-04: privada. Sin sesión → 401; con sesión y sin permiso → 404 (no revela si existe). */
    r.get('/reference-photos/:id', h(async (req, res) => {
      requireUser(req);
      const file = await photoFile(req.params.id);
      if (!file || file.metadata?.kind !== 'client' || !(await styles.canSeeClientPhoto(req.user, req.params.id))) return notFoundPhoto(res);
      streamPhoto(file, res, { restricted: true });
    }));
    r.put('/appointments/:id/reference', h(async (req, res) => res.json(await styles.changeReference(requireUser(req), req.params.id, req.body || {}))));
  }

  r.get('/availability', h(async (req, res) => {
    const q = req.query;
    let exclude = null;
    /* Contrapropuesta: los bloques de la propia cita no cuentan como ocupados. */
    if (q.appointment) exclude = (await agenda.load(String(q.appointment), req.user)).appt._id;
    res.json(
      await agenda.availability({
        serviceId: String(q.service || ''),
        professionalId: String(q.professional || 'any'),
        from: String(q.from || ''),
        to: String(q.to || ''),
        mode: String(q.mode || 'shop'),
        exclude,
        userId: req.user?._id,
      })
    );
  }));

  r.post('/quote', h(async (req, res) => {
    const b = req.body || {};
    res.json(await agenda.quoteHome({ serviceId: b.serviceId, professionalId: b.professionalId || 'any', address: b.address }));
  }));

  /* Honeypot primero (bot → 200 fingido), luego sesión, luego todo lo demás. */
  r.post('/appointments', bookingLimiter, h(async (req, res) => {
    if (String(req.body?.website ?? '').trim()) {
      logger.log('[agenda] honeypot lleno: se descarta sin crear cita');
      return res.json({ ok: true });
    }
    const user = requireUser(req);
    const { appt, replay, mailOk } = await agenda.create({ user, input: req.body || {} });
    res.status(replay ? 200 : 201).json({ ok: true, id: String(appt._id), mailOk: replay ? undefined : mailOk, appointment: await agenda.view(String(appt._id), user) });
  }));

  r.get('/appointments/mine', h(async (req, res) => res.json(await agenda.mine(requireUser(req)))));

  /* ?inv=<token>: link de una invitación del barbero (SPEC-33 RN-12) → asocia la cita a quien la abre. */
  /* SPEC-35: si la cita espera un pago, antes de responder se consulta a Mercado Pago (el
     `?pago=` de la vuelta del checkout no se cree; CB-03 / CB-05). */
  r.get('/appointments/:id', h(async (req, res) => {
    await payments?.syncForView(req.params.id, req.user);
    res.json(await agenda.view(req.params.id, req.user, { inv: req.query.inv ? String(req.query.inv) : null }));
  }));

  /* SPEC-35: crear la preferencia de Checkout Pro (o reintentar) y pasar a pagar en el local. */
  r.post('/appointments/:id/checkout', h(async (req, res) => {
    const user = requireUser(req);
    if (!payments?.ready) return res.status(503).json({ ok: false, error: 'payments_not_configured', message: 'El pago en línea no está disponible. Puedes pagar en el local.' });
    res.json(await payments.checkout(req.params.id, user));
  }));
  r.post('/appointments/:id/pay-local', h(async (req, res) => res.json(await agenda.payLocal(req.params.id, requireUser(req)))));

  for (const [path, action] of [
    ['cancel', 'cancel'],
    ['accept', 'accept'],
    ['counter', 'counter'],
    ['confirm', 'confirm'],
    ['propose', 'propose'],
    ['start', 'start'],
    ['finish', 'finish'],
    ['no-show', 'no_show'],
  ]) {
    r.post(`/appointments/:id/${path}`, h(async (req, res) => {
      res.json(await agenda.act(req.params.id, requireUser(req), action, req.body || {}));
    }));
  }

  return r;
}
