/* API de puntos y canjes de WS Style: /api/wstyle/points/... (SPEC-57). Solo HTTP: la
   lógica y la autorización (sesión + rol, en el server) viven en domain/loyalty.js.
   Matriz (se suma a la de SPEC-34):
   - público: /program, /products
   - con sesión (cualquier rol, como cliente): /me, /redeem, /customers/:id/ledger (propio; otro → 404)
   - barbero aprobado o super admin: /redemptions, /redemptions/:id/deliver|cancel
   - super admin: /admin/... */
import express from 'express';
import multer from 'multer';
import { handle, HttpError } from '../lib/errors.js';
import { MAX_PHOTO_BYTES } from '../lib/photos.js';

export function createLoyaltyRouter({ loyalty, logger }) {
  const r = express.Router();
  const h = (fn) => handle(fn, logger);
  const u = (req) => req.user;

  /* Foto del producto: misma tubería y mismo tope que las fotos del barbero (CB-11). */
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10 } });
  function receivePhoto(req, res, next) {
    if (!req.is('multipart/form-data')) return next();
    upload.single('photo')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: 'photo_too_large', message: 'La foto puede pesar hasta 5 MB.', maxBytes: MAX_PHOTO_BYTES });
      return res.status(400).json({ ok: false, error: 'invalid_upload', message: 'Sube una sola foto (JPG, PNG o WebP).' });
    });
  }

  /* Público */
  r.get('/program', h(async (_req, res) => res.json(await loyalty.program())));
  r.get('/products', h(async (_req, res) => res.json(await loyalty.products())));

  /* Cliente (cualquier cuenta con sesión) */
  r.get('/me', h(async (req, res) => res.json(await loyalty.mine(u(req)))));
  r.post('/redeem', h(async (req, res) => {
    const out = await loyalty.redeem(u(req), req.body || {});
    res.status(out.replay ? 200 : 201).json(out);
  }));
  r.get('/customers/:id/ledger', h(async (req, res) => res.json(await loyalty.ledger(u(req), req.params.id))));

  /* Equipo en el local: barbero aprobado o super admin */
  r.get('/redemptions', h(async (req, res) => res.json(await loyalty.listRedemptions(u(req), req.query))));
  r.post('/redemptions/:id/deliver', h(async (req, res) => res.json(await loyalty.deliver(u(req), req.params.id))));
  r.post('/redemptions/:id/cancel', h(async (req, res) => res.json(await loyalty.cancel(u(req), req.params.id, req.body || {}))));

  /* Super admin: exige el rol ANTES de leer nada (401 sin sesión, 403 otro rol). */
  const adminOnly = h(async (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    if (!req.user.roles.includes('superadmin')) throw new HttpError(403, 'forbidden', 'Solo el administrador puede hacer esto');
    next();
  });
  r.get('/admin/config', adminOnly, h(async (req, res) => res.json(await loyalty.getConfig(u(req)))));
  r.put('/admin/config', adminOnly, h(async (req, res) => res.json(await loyalty.setConfig(u(req), req.body || {}))));
  r.get('/admin/products', adminOnly, h(async (req, res) => res.json(await loyalty.listProducts(u(req)))));
  r.post('/admin/products', adminOnly, receivePhoto, h(async (req, res) => res.status(201).json(await loyalty.createProduct(u(req), req.body || {}, req.file))));
  r.put('/admin/products/order', adminOnly, h(async (req, res) => res.json(await loyalty.reorderProducts(u(req), req.body || {}))));
  r.patch('/admin/products/:id', adminOnly, receivePhoto, h(async (req, res) => res.json(await loyalty.updateProduct(u(req), req.params.id, req.body || {}, req.file))));
  r.delete('/admin/products/:id', adminOnly, h(async (req, res) => res.json(await loyalty.removeProduct(u(req), req.params.id))));
  r.get('/admin/customers', adminOnly, h(async (req, res) => res.json(await loyalty.customers(u(req), req.query))));
  r.post('/admin/customers/:id/adjust', adminOnly, h(async (req, res) => res.json(await loyalty.adjust(u(req), req.params.id, req.body || {}))));
  r.get('/admin/appointments/:id', adminOnly, h(async (req, res) => res.json(await loyalty.forAppointment(u(req), req.params.id))));
  r.post('/admin/appointments/:id/revert', adminOnly, h(async (req, res) => res.json(await loyalty.revertAppointment(u(req), req.params.id, req.body || {}))));

  return r;
}
