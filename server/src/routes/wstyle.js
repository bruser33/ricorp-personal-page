/* API de la agenda de WS Style: /api/wstyle/... (SPEC-32). */
import express from 'express';
import multer from 'multer';
import { HttpError, handle } from '../lib/errors.js';
import { imageUpload, notFoundPhoto, photoFile, streamPhoto } from '../lib/photos.js';
import { MAX_RECEIPT_BYTES } from '../lib/receipts.js';

export function createWstyleRouter({ agenda, payments, deposits, reviews, logger, bookingLimiter, reviewLimiter = (_req, _res, next) => next(), giftCards = null, giftCardLimiter = null, styles = null }) {
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

  /* Reseñas (SPEC-52): resumen y visibles (público), formulario y creación (cliente dueño de la cita). */
  r.get('/reviews', h(async (req, res) => res.json(await reviews.publicList(req.query))));
  r.get('/reviews/eligibility', h(async (req, res) => res.json(await reviews.eligibility(requireUser(req), String(req.query.cita || '')))));
  r.post('/reviews', reviewLimiter, h(async (req, res) => res.status(201).json(await reviews.create(requireUser(req), req.body || {}))));

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

  /* ─── SPEC-56: seña por transferencia. */
  r.post('/deposit/preview', h(async (req, res) => res.json(await deposits.preview(req.user, req.body || {}))));

  /* Un archivo de hasta 5 MB, en memoria (va directo al almacenamiento, nunca a Mongo). */
  const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: MAX_RECEIPT_BYTES, fields: 5 } }).single('file');
  const receiveReceipt = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Tu sesión venció. Inicia sesión para continuar.' });
    receiptUpload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: 'file_too_large', message: 'El archivo pesa más de 5 MB. Sube una captura o un PDF más liviano.' });
      return res.status(400).json({ ok: false, error: 'invalid_upload', message: 'Sube un solo archivo (captura, foto o PDF).' });
    });
  };
  r.post('/appointments/:id/deposit/receipt', receiveReceipt, h(async (req, res) => {
    const user = requireUser(req);
    const { replay } = await deposits.upload(req.params.id, user, req.file);
    res.status(replay ? 200 : 201).json({ ok: true, replay, appointment: await agenda.view(req.params.id, user) });
  }));
  r.get('/appointments/:id/deposit/receipt', h(async (req, res) => {
    const f = await deposits.receipt(req.params.id, req.user);
    res.set({
      'Content-Type': f.contentType,
      'Content-Length': String(f.body.length),
      'Content-Disposition': `inline; filename="${f.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      /* Un PDF abierto en línea no puede ejecutar nada en el origen de la API. */
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cache-Control': 'private, no-store',
    });
    res.end(f.body);
  }));
  /* CB-08: cambiar a "Pagar en línea" durante el plazo de la seña. */
  r.post('/appointments/:id/deposit/pay-online', h(async (req, res) => {
    const user = requireUser(req);
    const b = await agenda.business();
    await deposits.payOnline(req.params.id, user, { online: agenda.paymentOptions(b).online });
    res.json(await agenda.view(req.params.id, user));
  }));

  /* ─── Gift cards (SPEC-60) */
  if (giftCards) {
    /* Compra en línea (requiere sesión) → preferencia de Mercado Pago con external_reference gc:<id>. */
    r.post('/gift-cards', h(async (req, res) => res.status(201).json(await giftCards.purchase(requireUser(req), req.body || {}))));
    r.get('/gift-cards/card', h(async (req, res) => res.json(await giftCards.publicCard(req.query.t))));
    /* RN-12: validar un código. Limitado por usuario + IP; inexistente/vencida/anulada → misma respuesta. */
    r.post('/gift-cards/check', h(async (req, res) => {
      const user = requireUser(req);
      const wait = giftCardLimiter ? giftCardLimiter.hit(`${user._id}|${req.ip || 'unknown'}`) : 0;
      if (wait) {
        res.set('Retry-After', String(wait));
        return res.status(429).json({ ok: false, error: 'too_many_requests', message: 'Demasiados intentos. Espera unos minutos y vuelve a probar.', retryAfter: wait });
      }
      res.json(await giftCards.check(user, req.body?.code));
    }));
    r.get('/gift-cards/:id', h(async (req, res) => res.json(await giftCards.purchaseStatus(requireUser(req), req.params.id))));
    r.post('/gift-cards/:id/checkout', h(async (req, res) => res.json(await giftCards.retry(requireUser(req), req.params.id))));
  }

  return r;
}
