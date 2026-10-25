/* API del super admin: /api/admin/... (SPEC-34). Solo HTTP: la lógica y la
   autorización (sesión + rol superadmin, en el server) viven en domain/admin.js. */
import express from 'express';
import { handle } from '../lib/errors.js';

export function createAdminRouter({ admin, logger }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);
  const u = (req) => req.user;

  /* Público (CB-01): ¿hay super admin? Solo un booleano. */
  r.get('/status', h(async (_req, res) => res.json(await admin.status())));

  /* Todo lo demás exige superadmin ANTES de leer nada (401 sin sesión, 403 otro rol). */
  r.use(h(async (req, _res, next) => {
    admin.requireAdmin(req.user);
    next();
  }));

  r.get('/overview', h(async (req, res) => res.json(await admin.overview(u(req)))));
  r.get('/notifications', h(async (req, res) => res.json(await admin.notifications(u(req)))));
  r.post('/notifications/read', h(async (req, res) => res.json(await admin.markRead(u(req), req.body?.ids))));
  r.post('/me/password', h(async (req, res) => res.json(await admin.changePassword(u(req), req.body || {}))));

  /* Barberos */
  r.get('/barbers', h(async (req, res) => res.json(await admin.listBarbers(u(req), { status: String(req.query.status || ''), q: String(req.query.q || '') }))));
  r.get('/barbers/:id', h(async (req, res) => res.json(await admin.barberDetail(u(req), req.params.id))));
  for (const action of ['approve', 'reject', 'suspend', 'reactivate', 'reopen']) {
    r.post(`/barbers/:id/${action}`, h(async (req, res) => res.json(await admin.decide(u(req), req.params.id, action, req.body || {}))));
  }
  r.patch('/barbers/:id/profile', h(async (req, res) => res.json({ professional: await admin.editBarber(u(req), req.params.id, 'profile', req.body || {}) })));
  r.put('/barbers/:id/services', h(async (req, res) => res.json(await admin.editBarber(u(req), req.params.id, 'services', req.body || {}))));
  r.put('/barbers/:id/availability', h(async (req, res) => res.json(await admin.editBarber(u(req), req.params.id, 'availability', req.body || {}))));
  r.put('/barbers/:id/home-service', h(async (req, res) => res.json(await admin.editBarber(u(req), req.params.id, 'home-service', req.body || {}))));

  /* Citas */
  r.get('/appointments', h(async (req, res) => res.json(await admin.listAppointments(u(req), req.query))));
  r.get('/appointments.csv', h(async (req, res) => {
    const csv = await admin.exportCsv(u(req), req.query);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="citas-wstyle.csv"`);
    res.send(csv);
  }));
  r.post('/appointments', h(async (req, res) => res.status(201).json(await admin.createAppointment(u(req), req.body || {}))));
  r.get('/appointments/:id', h(async (req, res) => res.json(await admin.viewAppointment(u(req), req.params.id))));
  r.get('/appointments/:id/reassign-options', h(async (req, res) => res.json(await admin.reassignOptions(u(req), req.params.id))));
  r.post('/appointments/:id/reassign', h(async (req, res) => res.json(await admin.reassign(u(req), req.params.id, req.body || {}))));
  r.post('/appointments/:id/collect', h(async (req, res) => res.json(await admin.collect(u(req), req.params.id))));
  /* SPEC-35 RN-09: reembolso total en Mercado Pago (body.paymentId = un pago duplicado). */
  r.post('/appointments/:id/refund', h(async (req, res) => res.json(await admin.refund(u(req), req.params.id, req.body || {}))));
  for (const [path, action] of [['confirm', 'confirm'], ['reject', 'reject'], ['cancel', 'cancel'], ['propose', 'propose'], ['start', 'start'], ['finish', 'finish'], ['no-show', 'no_show']]) {
    r.post(`/appointments/:id/${path}`, h(async (req, res) => res.json(await admin.actOnAppointment(u(req), req.params.id, action, req.body || {}))));
  }

  /* Carta */
  r.get('/services', h(async (req, res) => res.json(await admin.listServices(u(req)))));
  r.post('/services', h(async (req, res) => res.status(201).json(await admin.createService(u(req), req.body || {}))));
  r.patch('/services/:id', h(async (req, res) => res.json(await admin.updateService(u(req), req.params.id, req.body || {}))));
  r.delete('/services/:id', h(async (req, res) => res.json(await admin.removeService(u(req), req.params.id))));
  r.get('/export', h(async (req, res) => res.json(await admin.exportContent(u(req)))));

  /* Horario y cierres */
  r.get('/schedule', h(async (req, res) => res.json(await admin.schedule(u(req)))));
  r.put('/schedule/hours', h(async (req, res) => res.json(await admin.setHours(u(req), req.body || {}))));
  r.post('/schedule/closures', h(async (req, res) => res.status(201).json(await admin.addClosure(u(req), req.body || {}))));
  r.delete('/schedule/closures/:id', h(async (req, res) => res.json(await admin.removeClosure(u(req), req.params.id))));

  /* Estadísticas, configuración y auditoría (solo lectura: no hay PUT/DELETE de auditoría) */
  r.get('/stats', h(async (req, res) => res.json(await admin.stats(u(req), req.query))));
  r.get('/settings', h(async (req, res) => res.json(await admin.getSettings(u(req)))));
  r.put('/settings', h(async (req, res) => res.json(await admin.setSettings(u(req), req.body || {}))));
  r.get('/audit', h(async (req, res) => res.json(await admin.auditList(u(req), req.query))));

  return r;
}
