/* API de la lista de espera (SPEC-54). Tres routers chicos: cliente (/api/wstyle/waitlist),
   barbero (/api/pro/waitlist) y super admin (/api/admin/waitlist). La autorización por rol
   (matriz de SPEC-34) vive en domain/waitlist.js. */
import express from 'express';
import { handle } from '../lib/errors.js';

export function createWaitlistRouters({ waitlist, logger, bookingLimiter }) {
  const h = (fn) => handle(fn, logger);
  const u = (req) => req.user;

  const client = express.Router();
  /* RN-02: anotarse comparte el rate limit de la reserva (5 cada 10 min por IP). */
  client.post('/', bookingLimiter, h(async (req, res) => res.status(201).json(await waitlist.join(u(req), req.body || {}))));
  client.get('/mine', h(async (req, res) => res.json(await waitlist.mine(u(req)))));
  client.get('/offer', h(async (req, res) => res.json(await waitlist.offer(u(req), String(req.query.t || '')))));
  client.delete('/:id', h(async (req, res) => res.json(await waitlist.leave(u(req), req.params.id))));

  const staff = (asAdmin) => {
    const r = express.Router();
    r.get('/', h(async (req, res) => res.json(await waitlist.staffList(u(req), { from: String(req.query.from || ''), to: String(req.query.to || '') }, asAdmin))));
    r.post('/:id/notify', h(async (req, res) => res.json(await waitlist.staffNotify(u(req), req.params.id, asAdmin))));
    r.delete('/:id', h(async (req, res) => res.json(await waitlist.staffRemove(u(req), req.params.id, asAdmin))));
    return r;
  };

  return { client, pro: staff(false), admin: staff(true) };
}
