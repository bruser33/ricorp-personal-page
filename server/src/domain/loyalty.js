/* Puntos por cita y canje de productos (SPEC-57). Lógica y autorización en el server;
   routes/loyalty.js solo traduce HTTP. Se engancha a la agenda en dos puntos:
   - agenda.actAs('finish') llama a earnForAppointment DENTRO de la transacción que
     pasa la cita a `terminada` (RN-01, RN-03);
   - payments.txn llama a revertForAppointment cuando el pago en línea pasa a
     `reembolsado` o `contracargo` (RN-06). */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Appointment, AuditLog, Membership, Notification, Professional, User } from '../models/index.js';
import { LoyaltySettings, PointsEntry, PointsWallet, Redemption, RewardProduct } from '../models/loyalty.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey, withTransaction } from '../lib/db.js';
import { deletePhoto, storePhoto } from '../lib/photos.js';
import { pointsCancelledMail, pointsRedeemedMail } from '../lib/emails.js';
import { photoUrl } from './agenda.js';
import { formatLong } from './time.js';

const { ObjectId } = mongoose.Types;

export const MAX_RATE = 100;
export const MAX_COST = 100_000;
export const MAX_STOCK = 100_000;
export const REVERT_ON_PAYMENT = ['reembolsado', 'contracargo'];

/* RN-02: puntos = floor(precio del servicio × tasa / 1000). Ni domicilio ni tarifa de servicio. */
export function pointsFor(priceCLP, rate) {
  const price = Math.max(0, Math.trunc(Number(priceCLP) || 0));
  const r = Math.max(0, Math.trunc(Number(rate) || 0));
  return Math.floor((price * r) / 1000);
}

/* RN-08: 6 caracteres sin ambiguos (sin 0/O, 1/I/L), con prefijo WS-. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^WS-[A-HJ-KM-NP-Z2-9]{6}$/;
export const newCode = () => 'WS-' + Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
/* "ws 7kq4m9", "WS-7KQ4M9", "7kq4m9" → "WS-7KQ4M9"; cualquier otra cosa → null. */
export function normalizeCode(q) {
  let s = String(q ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 8 && s.startsWith('WS')) s = s.slice(2);
  const code = `WS-${s}`;
  return CODE_RE.test(code) ? code : null;
}

export const ENTRY_LABEL = { ganado: 'Ganaste', canjeado: 'Canje', devuelto: 'Devolución', revertido: 'Reversión', ajuste: 'Ajuste' };
export const REDEMPTION_LABEL = { pendiente_retiro: 'Por retirar', entregado: 'Entregado', anulado: 'Anulado' };

const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const fieldError = (fields, message = 'Revisa los datos') => new HttpError(400, Object.values(fields)[0], message, { fields });
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iso = (d) => (d ? new Date(d).toISOString() : null);

/* Entero desde JSON o multipart ("120" → 120). '' / null → null. undefined → undefined. Otro → NaN. */
function intOf(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : /^-?\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN;
  return Number.isInteger(n) ? n : NaN;
}
function boolOf(v) {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return NaN;
}

export function createLoyalty({ agenda, clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173' }) {
  const now = () => new Date(clock());

  /* ─── Acceso */
  const requireUser = (user) => {
    if (!user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    return user;
  };
  const isAdmin = (user) => Boolean(user?.roles?.includes('superadmin'));
  function requireAdmin(user) {
    requireUser(user);
    if (!isAdmin(user)) throw new HttpError(403, 'forbidden', 'Solo el administrador puede hacer esto');
    return user;
  }
  /* Barbero aprobado del negocio o super admin (entregar / anular canjes, asunción 7). */
  async function requireStaff(user, b) {
    requireUser(user);
    if (isAdmin(user)) return 'admin';
    const pro = await Professional.findOne({ userId: user._id, status: 'active' }).lean();
    if (pro && (await Membership.exists({ businessId: b._id, professionalId: pro._id, status: 'approved' }))) return 'barber';
    throw new HttpError(403, 'forbidden', 'Solo el equipo de WS Style puede ver los canjes');
  }

  async function audit(user, b, action, { entity = null, entityId = null, summary = '', before = null, after = null } = {}) {
    try {
      await AuditLog.create({ businessId: b?._id, actorUserId: user._id, actorEmail: user.email, action, entity, entityId: entityId ? String(entityId) : null, summary, before, after, at: now() });
    } catch (err) {
      logger.error('[puntos] auditoría falló:', err.message);
    }
  }

  /* ─── Configuración */
  async function settingsOf(businessId, session = null) {
    const s = await LoyaltySettings.findOne({ businessId }).session(session).lean();
    return { enabled: Boolean(s?.enabled), pointsPer1000: Number.isInteger(s?.pointsPer1000) ? s.pointsPer1000 : 1 };
  }

  /* ─── Libro: cada movimiento actualiza el saldo en caché en la misma transacción. */
  async function post(entry, session) {
    await PointsEntry.create([{ ...entry, at: entry.at || now() }], { session });
    await PointsWallet.updateOne({ businessId: entry.businessId, userId: entry.userId }, { $inc: { balance: entry.points } }, { upsert: true, session });
  }

  async function balanceOf(businessId, userId) {
    const w = await PointsWallet.findOne({ businessId, userId }).lean();
    return w?.balance ?? 0;
  }

  /* RN-01/RN-02/RN-03. Se llama dentro de la transacción de "Terminar". null = la cita no da puntos. */
  async function earnForAppointment(b, appt, session = null) {
    if (appt.source !== 'web' || !appt.customerUserId) return null;
    const s = await settingsOf(b._id, session);
    if (!s.enabled) return null;
    const points = pointsFor(appt.pricing?.priceCLP ?? appt.serviceSnapshot?.priceCLP, s.pointsPer1000);
    if (!points) return null;
    const u = await User.findById(appt.customerUserId).session(session).lean();
    if (!u || u.status !== 'active') return null;
    if (await PointsEntry.exists({ appointmentId: appt._id, type: 'ganado' }).session(session)) return null;
    await post({ businessId: b._id, userId: appt.customerUserId, type: 'ganado', points, appointmentId: appt._id, reason: appt.serviceSnapshot?.name || 'Cita', by: 'system' }, session);
    return { points, rate: s.pointsPer1000 };
  }

  /* RN-06: revierte los puntos ganados por una cita (una sola vez). null = nada que revertir. */
  async function revertForAppointment(appt, { session = null, by = 'system', byUserId, reason } = {}) {
    const g = await PointsEntry.findOne({ appointmentId: appt._id, type: 'ganado' }).session(session).lean();
    if (!g) return null;
    if (await PointsEntry.exists({ appointmentId: appt._id, type: 'revertido' }).session(session)) return null;
    await post({ businessId: g.businessId, userId: g.userId, type: 'revertido', points: -g.points, appointmentId: appt._id, reason: reason || 'Reversión', by, byUserId }, session);
    return { points: g.points, userId: g.userId };
  }

  /* ─── Vistas */
  const productView = (p, { admin = false, redemptions } = {}) => ({
    id: String(p._id),
    name: p.name,
    description: p.description || '',
    photo: p.photoId ? photoUrl(p.photoId) : null,
    costPoints: p.costPoints,
    stock: p.stock ?? null,
    soldOut: p.stock !== null && p.stock !== undefined && p.stock <= 0,
    ...(admin ? { active: Boolean(p.active), order: p.order ?? 0, redemptions: redemptions ?? 0, updatedAt: iso(p.updatedAt) } : {}),
  });

  async function entryViews(entries) {
    const apptIds = entries.filter((e) => e.appointmentId).map((e) => e.appointmentId);
    const redIds = entries.filter((e) => e.redemptionId).map((e) => e.redemptionId);
    const [appts, reds] = await Promise.all([
      apptIds.length ? Appointment.find({ _id: { $in: apptIds } }, { serviceSnapshot: 1, startsAt: 1 }).lean() : [],
      redIds.length ? Redemption.find({ _id: { $in: redIds } }, { product: 1, code: 1 }).lean() : [],
    ]);
    const A = new Map(appts.map((a) => [String(a._id), a]));
    const R = new Map(reds.map((r) => [String(r._id), r]));
    return entries.map((e) => {
      const a = e.appointmentId ? A.get(String(e.appointmentId)) : null;
      const r = e.redemptionId ? R.get(String(e.redemptionId)) : null;
      let detail = e.reason || '';
      if (a && e.type === 'ganado') detail = `${a.serviceSnapshot?.name || 'Cita'} · ${formatLong(a.startsAt.getTime(), 'America/Santiago')}`;
      if (r && e.type === 'canjeado') detail = `${r.product?.name || 'Producto'} · ${r.code}`;
      if (r && e.type === 'devuelto') detail = `${r.product?.name || 'Producto'} · ${r.code}${e.reason ? ` — ${e.reason}` : ''}`;
      return {
        id: String(e._id),
        type: e.type,
        label: ENTRY_LABEL[e.type],
        points: e.points,
        detail,
        reason: e.reason || null,
        at: iso(e.at),
        appointmentId: e.appointmentId ? String(e.appointmentId) : null,
        redemptionId: e.redemptionId ? String(e.redemptionId) : null,
      };
    });
  }

  async function redemptionViews(list, { staff = false } = {}) {
    let users = new Map();
    if (staff && list.length) {
      const us = await User.find({ _id: { $in: [...new Set(list.map((r) => String(r.userId)))] } }, { name: 1, email: 1, status: 1, phoneE164: 1 }).lean();
      users = new Map(us.map((u) => [String(u._id), u]));
    }
    return list.map((r) => {
      const u = users.get(String(r.userId));
      return {
        id: String(r._id),
        code: r.code,
        status: r.status,
        statusLabel: REDEMPTION_LABEL[r.status],
        product: { id: String(r.productId), name: r.product?.name || 'Producto', costPoints: r.product?.costPoints ?? 0, photo: r.product?.photoId ? photoUrl(r.product.photoId) : null },
        createdAt: iso(r.createdAt),
        deliveredAt: iso(r.deliveredAt),
        cancelledAt: iso(r.cancelledAt),
        cancelReason: r.cancelReason || null,
        ...(staff
          ? { customer: { id: String(r.userId), name: u?.status === 'deleted' ? 'Cliente eliminado' : u?.name || r.customer?.name || 'Cliente', email: u?.status === 'deleted' ? null : u?.email || null, deleted: u?.status === 'deleted' } }
          : {}),
      };
    });
  }

  /* ─── Público */
  async function program() {
    const b = await agenda.business();
    const s = await settingsOf(b._id);
    return { enabled: s.enabled };
  }

  async function products() {
    const b = await agenda.business();
    const list = await RewardProduct.find({ businessId: b._id, active: true }).sort({ order: 1, createdAt: 1 }).lean();
    return { items: list.map((p) => productView(p)) };
  }

  /* ─── Cliente */
  async function ledgerFor(b, userId, { limit = 100 } = {}) {
    const [balance, entries, reds] = await Promise.all([
      balanceOf(b._id, userId),
      PointsEntry.find({ businessId: b._id, userId }).sort({ at: -1, _id: -1 }).limit(limit).lean(),
      Redemption.find({ businessId: b._id, userId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return { balance, entries: await entryViews(entries), redemptions: await redemptionViews(reds) };
  }

  async function mine(user) {
    requireUser(user);
    const b = await agenda.business();
    const [s, data, list] = await Promise.all([settingsOf(b._id), ledgerFor(b, user._id), products()]);
    return { program: s, ...data, products: list.items };
  }

  /* Ledger de un cliente: el propio, o cualquiera para el super admin. Otro → 404 (no revela que existe). */
  async function ledger(user, userId) {
    requireUser(user);
    const b = await agenda.business();
    const _id = oid(userId);
    const self = _id && String(_id) === String(user._id);
    if (!_id || (!self && !isAdmin(user))) throw new HttpError(404, 'not_found', 'No encontramos ese cliente');
    const u = self ? user : await User.findById(_id).lean();
    if (!u) throw new HttpError(404, 'not_found', 'No encontramos ese cliente');
    return { customer: { id: String(u._id), name: u.status === 'deleted' ? 'Cliente eliminado' : u.name, email: u.status === 'deleted' ? null : u.email }, ...(await ledgerFor(b, u._id, { limit: 300 })) };
  }

  async function sendMail(b, to, mail) {
    if (!to) return false;
    try {
      const out = await mailer.send({ to, ...mail });
      await Notification.create({ businessId: b._id, to, template: mail.template, status: out.status, error: out.error }).catch(() => {});
      return out.ok;
    } catch (err) {
      logger.error('[puntos] correo falló:', err.message);
      return false;
    }
  }

  /* RN-05: canje atómico. */
  async function redeem(user, body = {}) {
    requireUser(user);
    const b = await agenda.business();
    const productId = oid(body.productId);
    if (!productId) throw fieldError({ productId: 'required' }, 'Elige un producto');
    const key = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 100) : null;
    const replay = async () => {
      const prev = key ? await Redemption.findOne({ userId: user._id, idempotencyKey: key }).lean() : null;
      return prev ? { replay: true, redemption: (await redemptionViews([prev]))[0], balance: await balanceOf(b._id, user._id) } : null;
    };
    const prev = await replay();
    if (prev) return prev;

    let red;
    try {
      red = await withTransaction(async (session) => {
        const p = await RewardProduct.findOne({ _id: productId, businessId: b._id }).session(session).lean();
        if (!p || !p.active) throw new HttpError(409, 'product_unavailable', 'Este producto ya no está disponible');
        const limited = p.stock !== null && p.stock !== undefined;
        if (limited && p.stock <= 0) throw new HttpError(409, 'sold_out', 'Se agotó');
        /* Nunca negativo por un canje: descuento condicional sobre el saldo. */
        const w = await PointsWallet.findOneAndUpdate({ businessId: b._id, userId: user._id, balance: { $gte: p.costPoints } }, { $inc: { balance: -p.costPoints } }, { session, new: true });
        if (!w) throw new HttpError(409, 'not_enough_points', 'No te alcanzan los puntos');
        if (limited) {
          const u = await RewardProduct.updateOne({ _id: p._id, stock: { $gt: 0 } }, { $inc: { stock: -1 } }, { session });
          if (!u.modifiedCount) throw new HttpError(409, 'sold_out', 'Se agotó');
        }
        let code = newCode();
        for (let i = 0; i < 5 && (await Redemption.exists({ businessId: b._id, code }).session(session)); i++) code = newCode();
        const [r] = await Redemption.create(
          [{ businessId: b._id, userId: user._id, productId: p._id, product: { name: p.name, costPoints: p.costPoints, photoId: p.photoId }, customer: { name: user.name, email: user.email }, code, status: 'pendiente_retiro', ...(key ? { idempotencyKey: key } : {}) }],
          { session }
        );
        await PointsEntry.create([{ businessId: b._id, userId: user._id, type: 'canjeado', points: -p.costPoints, redemptionId: r._id, reason: p.name, by: 'client', byUserId: user._id, at: now() }], { session });
        return r;
      }, logger);
    } catch (err) {
      if (isDuplicateKey(err)) {
        const again = await replay();
        if (again) return again;
        throw new HttpError(409, 'conflict', 'Intenta de nuevo');
      }
      throw err;
    }
    const balance = await balanceOf(b._id, user._id);
    const mailOk = await sendMail(b, user.email, pointsRedeemedMail({ name: user.name, product: red.product.name, cost: red.product.costPoints, code: red.code, balance, url: `${frontUrl}/wstyle/cuenta/puntos/` }));
    logger.log(`[puntos] canje ${red.code} · ${red.product.name} · −${red.product.costPoints}`);
    return { replay: false, redemption: (await redemptionViews([red.toObject()]))[0], balance, mailOk };
  }

  /* ─── Equipo: canjes por entregar */
  async function listRedemptions(user, q = {}) {
    const b = await agenda.business();
    await requireStaff(user, b);
    const filter = { businessId: b._id };
    const raw = String(q.q ?? '').trim();
    if (raw) {
      const code = normalizeCode(raw);
      if (!code) return { items: [], query: raw };
      filter.code = code;
    } else {
      const st = String(q.status || 'pendiente_retiro');
      if (st !== 'all') filter.status = st;
    }
    const list = await Redemption.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return { items: await redemptionViews(list, { staff: true }), query: raw || null };
  }

  async function loadRedemption(b, id) {
    const _id = oid(id);
    const r = _id ? await Redemption.findOne({ _id, businessId: b._id }).lean() : null;
    if (!r) throw new HttpError(404, 'not_found', 'No encontramos ese canje');
    return r;
  }
  const finalState = (r) =>
    new HttpError(409, 'invalid_state', r.status === 'entregado' ? 'Este canje ya fue entregado' : 'Este canje fue anulado', { status: r.status, statusLabel: REDEMPTION_LABEL[r.status] });

  async function deliver(user, id) {
    const b = await agenda.business();
    const role = await requireStaff(user, b);
    const r = await loadRedemption(b, id);
    const u = await Redemption.updateOne({ _id: r._id, status: 'pendiente_retiro' }, { $set: { status: 'entregado', deliveredAt: now(), deliveredBy: user._id } });
    const fresh = await Redemption.findById(r._id).lean();
    if (!u.modifiedCount) throw finalState(fresh);
    await audit(user, b, 'points.redemption_deliver', { entity: 'redemption', entityId: r._id, summary: `${r.code} · ${r.product?.name} · ${role === 'barber' ? 'barbero' : 'admin'}`, before: { status: r.status }, after: { status: 'entregado' } });
    return { redemption: (await redemptionViews([fresh], { staff: true }))[0] };
  }

  async function cancel(user, id, body = {}) {
    const b = await agenda.business();
    const role = await requireStaff(user, b);
    const reason = String(body.reason ?? '').trim().slice(0, 300);
    if (!reason) throw fieldError({ reason: 'required' }, 'Escribe el motivo');
    const r = await loadRedemption(b, id);
    if (r.status !== 'pendiente_retiro') throw finalState(r);
    const ok = await withTransaction(async (session) => {
      const u = await Redemption.updateOne({ _id: r._id, status: 'pendiente_retiro' }, { $set: { status: 'anulado', cancelledAt: now(), cancelledBy: user._id, cancelReason: reason } }, { session });
      if (!u.modifiedCount) return false;
      await post({ businessId: b._id, userId: r.userId, type: 'devuelto', points: r.product.costPoints, redemptionId: r._id, reason, by: role, byUserId: user._id }, session);
      await RewardProduct.updateOne({ _id: r.productId, stock: { $type: 'number' } }, { $inc: { stock: 1 } }, { session });
      return true;
    }, logger);
    const fresh = await Redemption.findById(r._id).lean();
    if (!ok) throw finalState(fresh);
    await audit(user, b, 'points.redemption_cancel', { entity: 'redemption', entityId: r._id, summary: `${r.code} · ${r.product?.name} — ${reason}`, before: { status: 'pendiente_retiro' }, after: { status: 'anulado', reason, returned: r.product.costPoints } });
    const owner = await User.findById(r.userId).lean();
    if (owner?.status === 'active') {
      await sendMail(b, owner.email, pointsCancelledMail({ name: owner.name, product: r.product.name, points: r.product.costPoints, code: r.code, reason, balance: await balanceOf(b._id, r.userId), url: `${frontUrl}/wstyle/cuenta/puntos/` }));
    }
    return { redemption: (await redemptionViews([fresh], { staff: true }))[0] };
  }

  /* ─── Super admin: configuración */
  async function getConfig(user) {
    requireAdmin(user);
    const b = await agenda.business();
    return { ...(await settingsOf(b._id)), limits: { pointsPer1000: [0, MAX_RATE] } };
  }

  async function setConfig(user, body = {}) {
    requireAdmin(user);
    const b = await agenda.business();
    const unknown = Object.keys(body).filter((k) => !['enabled', 'pointsPer1000'].includes(k));
    const fields = Object.fromEntries(unknown.map((k) => [k, 'not_allowed']));
    const set = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') fields.enabled = 'invalid';
      else set.enabled = body.enabled;
    }
    if (body.pointsPer1000 !== undefined) {
      const n = body.pointsPer1000;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_RATE) fields.pointsPer1000 = 'out_of_range';
      else set.pointsPer1000 = n;
    }
    if (Object.keys(fields).length) throw fieldError(fields, `La tasa es un entero de 0 a ${MAX_RATE}`);
    const before = await settingsOf(b._id);
    await LoyaltySettings.updateOne({ businessId: b._id }, { $set: set }, { upsert: true });
    const after = await settingsOf(b._id);
    await audit(user, b, 'points.config', { entity: 'settings', summary: `Puntos: ${after.enabled ? 'activo' : 'apagado'} · ${after.pointsPer1000} por $1.000`, before, after });
    return { ...after, limits: { pointsPer1000: [0, MAX_RATE] } };
  }

  /* ─── Super admin: productos (RN-09) */
  function parseProduct(body, { partial = false } = {}) {
    const fields = {};
    const out = {};
    if (!partial || body.name !== undefined) {
      const name = String(body.name ?? '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 80) fields.name = 'required';
      else out.name = name;
    }
    if (body.description !== undefined) {
      const d = String(body.description ?? '').trim();
      if (d.length > 300) fields.description = 'too_long';
      else out.description = d;
    }
    if (!partial || body.costPoints !== undefined) {
      const c = intOf(body.costPoints);
      if (!Number.isInteger(c) || c < 1 || c > MAX_COST) fields.costPoints = 'out_of_range';
      else out.costPoints = c;
    }
    if (body.stock !== undefined) {
      const s = intOf(body.stock);
      if (s !== null && (!Number.isInteger(s) || s < 0 || s > MAX_STOCK)) fields.stock = 'out_of_range';
      else out.stock = s;
    }
    if (body.active !== undefined) {
      const a = boolOf(body.active);
      if (typeof a !== 'boolean') fields.active = 'invalid';
      else out.active = a;
    }
    if (Object.keys(fields).length) throw fieldError(fields);
    return out;
  }

  async function storeProductPhoto(file) {
    if (!file) return undefined;
    try {
      return await storePhoto(file.buffer, { kind: 'reward' });
    } catch (err) {
      if (err.code === 'invalid_image') throw new HttpError(400, 'invalid_image', 'La foto tiene que ser una imagen JPG, PNG o WebP');
      throw err;
    }
  }

  async function listProducts(user) {
    requireAdmin(user);
    const b = await agenda.business();
    const list = await RewardProduct.find({ businessId: b._id }).sort({ order: 1, createdAt: 1 }).lean();
    const counts = await Redemption.aggregate([{ $match: { businessId: b._id } }, { $group: { _id: '$productId', n: { $sum: 1 } } }]);
    const C = new Map(counts.map((c) => [String(c._id), c.n]));
    return { items: list.map((p) => productView(p, { admin: true, redemptions: C.get(String(p._id)) ?? 0 })) };
  }

  async function createProduct(user, body = {}, file = null) {
    requireAdmin(user);
    const b = await agenda.business();
    const data = parseProduct(body);
    const photoId = await storeProductPhoto(file);
    const last = await RewardProduct.findOne({ businessId: b._id }).sort({ order: -1 }).lean();
    const p = await RewardProduct.create({ businessId: b._id, stock: null, active: true, ...data, photoId: photoId ?? null, order: (last?.order ?? -1) + 1 });
    await audit(user, b, 'points.product_create', { entity: 'reward', entityId: p._id, summary: `${p.name} · ${p.costPoints} pts${p.stock !== null ? ` · stock ${p.stock}` : ''}`, after: productView(p.toObject()) });
    return { product: productView(p.toObject(), { admin: true }) };
  }

  async function loadProduct(b, id) {
    const _id = oid(id);
    const p = _id ? await RewardProduct.findOne({ _id, businessId: b._id }).lean() : null;
    if (!p) throw new HttpError(404, 'not_found', 'No encontramos ese producto');
    return p;
  }

  async function updateProduct(user, id, body = {}, file = null) {
    requireAdmin(user);
    const b = await agenda.business();
    const current = await loadProduct(b, id);
    const data = parseProduct(body, { partial: true });
    const photoId = await storeProductPhoto(file);
    const removePhoto = body.removePhoto === true || body.removePhoto === 'true';
    if (photoId !== undefined) data.photoId = photoId;
    else if (removePhoto) data.photoId = null;
    const updated = await RewardProduct.findOneAndUpdate({ _id: current._id }, { $set: data }, { new: true }).lean();
    /* La foto anterior solo se borra si ningún canje la congeló. */
    if (data.photoId !== undefined && current.photoId && current.photoId !== data.photoId && !(await Redemption.exists({ 'product.photoId': current.photoId }))) await deletePhoto(current.photoId);
    const pick = (p) => ({ name: p.name, description: p.description, costPoints: p.costPoints, stock: p.stock ?? null, active: p.active, photo: Boolean(p.photoId) });
    const action = current.active !== updated.active ? (updated.active ? 'points.product_activate' : 'points.product_deactivate') : 'points.product_update';
    await audit(user, b, action, { entity: 'reward', entityId: current._id, summary: updated.name, before: pick(current), after: pick(updated) });
    return { product: productView(updated, { admin: true }) };
  }

  /* RN-09: con canjes no se borra, se desactiva. */
  async function removeProduct(user, id) {
    requireAdmin(user);
    const b = await agenda.business();
    const current = await loadProduct(b, id);
    if (await Redemption.exists({ productId: current._id })) {
      await RewardProduct.updateOne({ _id: current._id }, { $set: { active: false } });
      await audit(user, b, 'points.product_deactivate', { entity: 'reward', entityId: current._id, summary: `${current.name} (tiene canjes: se desactiva)`, before: { active: current.active }, after: { active: false } });
      return { result: 'deactivated' };
    }
    await RewardProduct.deleteOne({ _id: current._id });
    if (current.photoId) await deletePhoto(current.photoId);
    await audit(user, b, 'points.product_delete', { entity: 'reward', entityId: current._id, summary: current.name, before: { name: current.name, costPoints: current.costPoints } });
    return { result: 'deleted' };
  }

  async function reorderProducts(user, body = {}) {
    requireAdmin(user);
    const b = await agenda.business();
    const ids = Array.isArray(body.ids) ? body.ids.map(oid) : null;
    if (!ids || !ids.length || ids.some((x) => !x)) throw fieldError({ ids: 'invalid' }, 'Orden inválido');
    const found = await RewardProduct.countDocuments({ businessId: b._id, _id: { $in: ids } });
    if (found !== ids.length) throw fieldError({ ids: 'invalid' }, 'Orden inválido');
    await RewardProduct.bulkWrite(ids.map((_id, order) => ({ updateOne: { filter: { _id }, update: { $set: { order } } } })));
    await audit(user, b, 'points.product_reorder', { entity: 'reward', summary: `${ids.length} productos`, after: ids.map(String) });
    return listProducts(user);
  }

  /* ─── Super admin: clientes, ajustes y reversión */
  async function customers(user, q = {}) {
    requireAdmin(user);
    const b = await agenda.business();
    const text = String(q.q ?? '').trim().slice(0, 80);
    let users;
    if (text) {
      const re = new RegExp(escapeRe(text), 'i');
      users = await User.find({ status: 'active', $or: [{ name: re }, { email: re }] }, { name: 1, email: 1 }).limit(20).lean();
    } else {
      const ws = await PointsWallet.find({ businessId: b._id }).sort({ updatedAt: -1 }).limit(20).lean();
      const us = await User.find({ _id: { $in: ws.map((w) => w.userId) } }, { name: 1, email: 1, status: 1 }).lean();
      const U = new Map(us.map((u) => [String(u._id), u]));
      users = ws.map((w) => U.get(String(w.userId))).filter(Boolean);
    }
    const ws = await PointsWallet.find({ businessId: b._id, userId: { $in: users.map((u) => u._id) } }).lean();
    const W = new Map(ws.map((w) => [String(w.userId), w.balance]));
    return { items: users.map((u) => ({ id: String(u._id), name: u.status === 'deleted' ? 'Cliente eliminado' : u.name, email: u.status === 'deleted' ? null : u.email, balance: W.get(String(u._id)) ?? 0 })) };
  }

  /* RN-10 */
  async function adjust(user, userId, body = {}) {
    requireAdmin(user);
    const b = await agenda.business();
    const _id = oid(userId);
    const target = _id ? await User.findById(_id).lean() : null;
    if (!target) throw new HttpError(404, 'not_found', 'No encontramos ese cliente');
    const points = intOf(body.points);
    const reason = String(body.reason ?? '').trim();
    const fields = {};
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_COST) fields.points = 'invalid';
    if (reason.length < 5 || reason.length > 200) fields.reason = 'required';
    if (Object.keys(fields).length) throw fieldError(fields, fields.reason ? 'Escribe el motivo (5 a 200 caracteres)' : 'Ingresa un número entero distinto de 0');
    const before = await balanceOf(b._id, target._id);
    await withTransaction((session) => post({ businessId: b._id, userId: target._id, type: 'ajuste', points, reason, by: 'admin', byUserId: user._id }, session), logger);
    const balance = await balanceOf(b._id, target._id);
    await audit(user, b, 'points.adjust', { entity: 'user', entityId: target._id, summary: `${target.name || target.email}: ${points > 0 ? '+' : ''}${points} — ${reason}`, before: { balance: before }, after: { balance, points, reason } });
    return { balance };
  }

  async function revertAppointment(user, apptId, body = {}) {
    requireAdmin(user);
    const b = await agenda.business();
    const reason = String(body.reason ?? '').trim();
    if (!reason || reason.length > 200) throw fieldError({ reason: 'required' }, 'Escribe el motivo');
    const _id = oid(apptId);
    const appt = _id ? await Appointment.findOne({ _id, businessId: b._id }).lean() : null;
    if (!appt) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    const r = await withTransaction((session) => revertForAppointment(appt, { session, by: 'admin', byUserId: user._id, reason }), logger);
    if (r) await audit(user, b, 'points.revert', { entity: 'appointment', entityId: appt._id, summary: `${appt.customerSnapshot?.name || 'Cliente'} · −${r.points} pts — ${reason}`, after: { points: -r.points, reason } });
    return { changed: Boolean(r), points: r ? -r.points : 0, balance: appt.customerUserId ? await balanceOf(b._id, appt.customerUserId) : 0 };
  }

  /* Puntos de una cita (para el panel del admin: ¿dio puntos? ¿se revirtieron?). */
  async function forAppointment(user, apptId) {
    requireAdmin(user);
    const _id = oid(apptId);
    if (!_id) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    const es = await PointsEntry.find({ appointmentId: _id }).lean();
    const g = es.find((e) => e.type === 'ganado');
    const r = es.find((e) => e.type === 'revertido');
    return { earned: g?.points ?? 0, reverted: Boolean(r), revertedAt: iso(r?.at) };
  }

  return {
    pointsFor,
    settingsOf,
    balanceOf,
    earnForAppointment,
    revertForAppointment,
    program,
    products,
    mine,
    ledger,
    redeem,
    listRedemptions,
    deliver,
    cancel,
    getConfig,
    setConfig,
    listProducts,
    createProduct,
    updateProduct,
    removeProduct,
    reorderProducts,
    customers,
    adjust,
    revertAppointment,
    forAppointment,
  };
}
