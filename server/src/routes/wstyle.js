/* API de la agenda de WS Style: /api/wstyle/... (SPEC-32). */
import express from 'express';
import multer from 'multer';
import { HttpError, handle } from '../lib/errors.js';
import { MAX_RECEIPT_BYTES } from '../lib/receipts.js';

export function createWstyleRouter({ agenda, payments, deposits, logger, bookingLimiter }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);
  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    return req.user;
  };

  r.get('/catalog', h(async (_req, res) => res.json(await agenda.catalog())));

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

  return r;
}
