/* API de la agenda de WS Style: /api/wstyle/... (SPEC-32). */
import express from 'express';
import { HttpError, handle } from '../lib/errors.js';

export function createWstyleRouter({ agenda, logger, bookingLimiter }) {
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

  r.get('/appointments/:id', h(async (req, res) => res.json(await agenda.view(req.params.id, req.user))));

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
