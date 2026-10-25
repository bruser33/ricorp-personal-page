/* Panel del super admin de WS Style (SPEC-34): barberos, citas, carta, horario y cierres,
   estadísticas, configuración y auditoría. Usa el modelo y la máquina de estados de
   SPEC-32 (agenda.js) y las reglas del barbero de SPEC-33 (pro.js). Toda ruta valida la
   sesión y el rol en el server; toda acción queda en AuditLog (RN-09). */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  Appointment,
  AuditLog,
  AvailabilityRule,
  BLOCKING,
  Business,
  Membership,
  PanelNotification,
  PlatformSettings,
  Professional,
  ProfessionalService,
  Service,
  SlotLock,
  User,
} from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey, withTransaction } from '../lib/db.js';
import { checkPassword, hashPassword, publicUser } from '../lib/session.js';
import { clMobile, cleanName, isEmail, MAX_NOTE, normEmail, passwordProblem } from '../lib/validate.js';
import { reassignedMail } from '../lib/emails.js';
import { csvCell } from '../lib/csv.js';
import { slotsFor } from './availability.js';
import { entriesToWeek, fitsInRanges, parseWeek, weekToEntries, weekToSiteRows } from './hours.js';
import { computeStats, monthRange, parseRange } from './stats.js';
import { addDays, formatLong, isDate, isoWeekday, wallClock, zonedToUtc } from './time.js';
import { photoUrl, STATUS_LABEL } from './agenda.js';
import { applyLocalCollection, boletaClash, parseCollectInput } from './tax.js';
import { currentRates, MAX_PAYMENT_FEE_PERCENT, quote, ratesFrom, ratesView } from './pricing.js';

const MIN = 60 * 1000;
const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const fieldError = (fields, message = 'Revisa los datos') => new HttpError(400, Object.values(fields)[0], message, { fields });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Reglas de agenda configurables (RN-08) y sus límites. */
export const RULE_LIMITS = {
  minLeadMinutes: [0, 2880],
  horizonDays: [1, 180],
  cancelUntilMinutes: [0, 2880],
  confirmWithinMinutes: [15, 2880],
  inviteTtlHours: [1, 72],
  maxActivePerCustomer: [1, 10],
};
export const MAX_FEE_PERCENT = 50;

/* Transiciones de la membresía del barbero (RN-02). */
const DECISIONS = {
  approve: { from: ['pending'], to: 'approved', audit: 'barber.approve' },
  reject: { from: ['pending'], to: 'rejected', reason: true, audit: 'barber.reject' },
  suspend: { from: ['approved'], to: 'suspended', reason: true, audit: 'barber.suspend' },
  reactivate: { from: ['suspended'], to: 'approved', audit: 'barber.reactivate' },
  reopen: { from: ['rejected'], to: 'pending', audit: 'barber.reopen' },
};

const DECISIONS_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

/* Columnas del CSV de citas (RN-03). */
export const CSV_COLUMNS = [
  ['id', 'ID'],
  ['date', 'Fecha'],
  ['time', 'Hora'],
  ['professional', 'Barbero'],
  ['customer', 'Cliente'],
  ['phone', 'Celular'],
  ['email', 'Email'],
  ['service', 'Servicio'],
  ['mode', 'Modalidad'],
  ['address', 'Dirección'],
  ['status', 'Estado'],
  ['priceCLP', 'Precio'],
  ['surchargeCLP', 'Recargo'],
  ['totalCLP', 'Total'],
  ['paymentMethod', 'Método de pago'],
  ['paymentStatus', 'Estado del pago'],
  /* SPEC-38: administración de la plataforma (cobrada al cliente desde SPEC-38; antes, interna),
     procesamiento del pago en línea y la parte del barbero (servicio + domicilio). */
  ['platformFeeCLP', 'Comisión'],
  ['paymentFeeCLP', 'Procesamiento pago'],
  ['barberCLP', 'Parte del barbero'],
  ['source', 'Origen'],
];


export function createAdmin({ agenda, pro, clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173', env = {}, adminInbox, onlinePayments = { ready: false }, payments = null, billing = null }) {
  /* ─── Acceso */
  function requireAdmin(user) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    if (!user.roles.includes('superadmin')) throw new HttpError(403, 'forbidden', 'Esta cuenta no es de administrador');
    return user;
  }

  async function ctx(user) {
    requireAdmin(user);
    return agenda.business();
  }

  /* CB-01: /wstyle/admin/ muestra "Panel no configurado" si no hay super admin. Público: solo un booleano. */
  async function status() {
    return { configured: Boolean(await User.exists({ roles: 'superadmin', status: 'active' })) };
  }

  /* ─── Auditoría (RN-09): solo inserta. */
  async function audit(user, b, action, { entity = null, entityId = null, summary = '', before = null, after = null } = {}) {
    try {
      await AuditLog.create({ businessId: b?._id, actorUserId: user._id, actorEmail: user.email, action, entity, entityId: entityId ? String(entityId) : null, summary, before, after, at: new Date(clock()) });
    } catch (err) {
      logger.error('[admin] auditoría falló:', err.message);
    }
  }

  async function auditList(user, q = {}) {
    const b = await ctx(user);
    const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
    const per = 50;
    const filter = { businessId: b._id };
    if (q.action) filter.action = new RegExp('^' + escapeRe(String(q.action)));
    const [items, total] = await Promise.all([AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * per).limit(per).lean(), AuditLog.countDocuments(filter)]);
    return {
      page,
      pages: Math.max(1, Math.ceil(total / per)),
      total,
      items: items.map((x) => ({ id: String(x._id), at: x.at.toISOString(), actor: x.actorEmail || String(x.actorUserId), action: x.action, entity: x.entity, entityId: x.entityId, summary: x.summary || '', before: x.before ?? null, after: x.after ?? null })),
    };
  }

  /* ─── Inicio del panel */
  async function overview(user) {
    const b = await ctx(user);
    const now = clock();
    const tz = b.timezone;
    const today = wallClock(now, tz).date;
    const dayStart = new Date(zonedToUtc(today, '00:00', tz));
    const dayEnd = new Date(zonedToUtc(addDays(today, 1), '00:00', tz));
    const month = monthRange(now, tz);
    const [pendingBarbers, todayCount, pendingConfirm, refunds, monthStats, unread, alerts] = await Promise.all([
      Membership.countDocuments({ businessId: b._id, status: 'pending', submittedAt: { $ne: null } }),
      Appointment.countDocuments({ businessId: b._id, startsAt: { $gte: dayStart, $lt: dayEnd }, status: { $nin: ['cancelada', 'expirada'] } }),
      Appointment.countDocuments({ businessId: b._id, status: 'pendiente' }),
      Appointment.countDocuments({ businessId: b._id, $or: [{ 'payment.status': 'reembolso_pendiente' }, { 'payment.duplicates.status': 'reembolso_pendiente' }] }),
      computeStats(b, month),
      PanelNotification.countDocuments({ userId: user._id, readAt: null }),
      suspendedAlerts(b, now),
    ]);
    return {
      today,
      cards: { pendingBarbers, today: todayCount, pendingConfirm, refundsPending: refunds, monthRevenueCLP: monthStats.revenue.totalCLP },
      alerts,
      unread,
      user: publicUser(user),
    };
  }

  /* CB-03: alerta fija mientras un barbero suspendido tenga citas futuras sin resolver. */
  async function suspendedAlerts(b, now) {
    const ms = await Membership.find({ businessId: b._id, status: 'suspended' }).lean();
    const out = [];
    for (const m of ms) {
      const n = await Appointment.countDocuments({ businessId: b._id, professionalId: m.professionalId, status: { $in: BLOCKING }, startsAt: { $gt: new Date(now) } });
      if (!n) continue;
      const p = await Professional.findById(m.professionalId, { displayName: 1 }).lean();
      out.push({ kind: 'suspended_with_appointments', professionalId: String(m.professionalId), name: p?.displayName || 'Barbero', count: n, message: `${p?.displayName || 'Un barbero suspendido'} tiene ${n} ${n === 1 ? 'cita futura' : 'citas futuras'} por resolver` });
    }
    return out;
  }

  async function notifications(user) {
    requireAdmin(user);
    const [items, unread] = await Promise.all([
      PanelNotification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      PanelNotification.countDocuments({ userId: user._id, readAt: null }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body || '', appointmentId: n.appointmentId ? String(n.appointmentId) : null, professionalId: n.professionalId ? String(n.professionalId) : null, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })),
    };
  }

  async function markRead(user, ids) {
    requireAdmin(user);
    const q = { userId: user._id, readAt: null };
    if (Array.isArray(ids) && ids.length) q._id = { $in: ids.map(oid).filter(Boolean) };
    await PanelNotification.updateMany(q, { readAt: new Date(clock()) });
    return { ok: true };
  }

  /* ─── Barberos (RN-02) */
  async function listBarbers(user, { status: st = '', q = '' } = {}) {
    const b = await ctx(user);
    const filter = { businessId: b._id };
    if (st) {
      if (!DECISIONS_STATUSES.includes(st)) throw new HttpError(400, 'invalid_status', 'Estado inválido');
      filter.status = st;
    }
    const ms = await Membership.find(filter).sort({ submittedAt: -1, createdAt: -1 }).lean();
    const pros = await Professional.find({ _id: { $in: ms.map((m) => m.professionalId) } }).lean();
    const users = await User.find({ _id: { $in: pros.map((p) => p.userId).filter(Boolean) } }, { email: 1, phoneE164: 1, name: 1 }).lean();
    const counts = await Membership.aggregate([{ $match: { businessId: b._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const needle = String(q || '').trim().toLowerCase();
    const items = [];
    for (const m of ms) {
      const p = pros.find((x) => String(x._id) === String(m.professionalId));
      if (!p) continue;
      const u = users.find((x) => String(x._id) === String(p.userId));
      const row = {
        id: String(p._id),
        name: p.displayName,
        email: u?.email || p.email || null,
        phone: p.phone || u?.phoneE164 || null,
        photo: p.photos?.[0] ? photoUrl(p.photos[0]) : null,
        status: m.status,
        reason: m.reason || null,
        submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null,
        createdAt: (m.createdAt || p.createdAt)?.toISOString?.() ?? null,
      };
      if (needle && ![row.name, row.email, row.phone].some((v) => String(v || '').toLowerCase().includes(needle))) continue;
      items.push(row);
    }
    return { items, counts: Object.fromEntries(DECISIONS_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])) };
  }

  async function loadBarber(b, id) {
    const _id = oid(id);
    const p = _id ? await Professional.findById(_id) : null;
    const m = p ? await Membership.findOne({ businessId: b._id, professionalId: p._id }) : null;
    if (!p || !m) throw new HttpError(404, 'not_found', 'No encontramos ese barbero');
    return { p, m };
  }

  async function futureOf(b, professionalId, now) {
    const list = await Appointment.find({ businessId: b._id, professionalId, status: { $in: BLOCKING }, startsAt: { $gt: new Date(now) } }).sort({ startsAt: 1 });
    return Promise.all(list.map((a) => serializeAdmin(a, b, now)));
  }

  async function barberDetail(user, id) {
    const b = await ctx(user);
    const now = clock();
    const { p, m } = await loadBarber(b, id);
    const u = p.userId ? await User.findById(p.userId).lean() : null;
    const [services, links, rules, future, stats] = await Promise.all([
      Service.find({ businessId: b._id }).sort({ order: 1 }).lean(),
      ProfessionalService.find({ businessId: b._id, professionalId: p._id }).lean(),
      AvailabilityRule.find({ businessId: b._id, professionalId: p._id }).sort({ weekday: 1, start: 1 }).lean(),
      futureOf(b, p._id, now),
      computeStats(b, { ...monthRange(now, b.timezone), professionalId: p._id }),
    ]);
    const mine = new Set(links.map((l) => String(l.serviceId)));
    const totals = await Appointment.aggregate([
      { $match: { businessId: b._id, professionalId: p._id } },
      { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$pricing.totalCLP' } } },
    ]);
    const n = (s) => totals.find((t) => t._id === s)?.n ?? 0;
    return {
      professional: { ...pro.serializePro(p), email: u?.email || p.email || null, userName: u?.name || null, termsAcceptedAt: p.termsAcceptedAt ? p.termsAcceptedAt.toISOString() : null },
      membership: { status: m.status, reason: m.reason || null, submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null, decidedAt: m.decidedAt ? m.decidedAt.toISOString() : null },
      services: services.filter((s) => !s.archivedAt).map((s) => ({ id: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin, active: s.active, selected: mine.has(String(s._id)) })),
      rules: rules.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end })),
      futureAppointments: future,
      metrics: {
        appointments: totals.reduce((acc, t) => acc + t.n, 0),
        finished: n('terminada'),
        cancelled: n('cancelada'),
        noShows: n('no_asistio'),
        revenueCLP: totals.find((t) => t._id === 'terminada')?.total ?? 0,
        month: stats.barbers[0] || null,
      },
      self: Boolean(p.userId && String(p.userId) === String(user._id)),
    };
  }

  async function decide(user, id, action, body = {}) {
    const b = await ctx(user);
    const rule = DECISIONS[action];
    if (!rule) throw new HttpError(404, 'not_found', 'Acción desconocida');
    const { p, m } = await loadBarber(b, id);
    /* CB-11: el admin no se suspende ni se rechaza a sí mismo. */
    if (p.userId && String(p.userId) === String(user._id) && ['suspend', 'reject'].includes(action)) {
      throw new HttpError(409, 'self_action', 'No puedes suspender ni rechazar tu propia cuenta');
    }
    const reason = String(body.reason ?? '').trim().slice(0, 300);
    if (rule.reason && !reason) throw fieldError({ reason: 'required' }, 'Escribe el motivo');
    if (!rule.from.includes(m.status)) {
      throw new HttpError(409, 'invalid_transition', `No se puede ${{ approve: 'aprobar', reject: 'rechazar', suspend: 'suspender', reactivate: 'reactivar', reopen: 'reabrir' }[action]} un barbero en estado "${m.status}"`, { status: m.status });
    }
    const before = { status: m.status, reason: m.reason || null };
    let updated;
    if (action === 'reopen') {
      /* Asunción 3: el rechazado vuelve a "pendiente" y tiene que enviar su perfil otra vez. */
      updated = await Membership.findOneAndUpdate({ _id: m._id }, { status: 'pending', $unset: { reason: 1, submittedAt: 1 }, decidedAt: new Date(clock()) }, { new: true });
    } else {
      updated = await pro.setMembershipStatus(p._id, rule.to, reason);
    }
    const now = clock();
    const future = action === 'suspend' ? await futureOf(b, p._id, now) : [];
    await audit(user, b, rule.audit, { entity: 'barber', entityId: p._id, summary: `${p.displayName}${reason ? ` — ${reason}` : ''}`, before, after: { status: updated.status, reason: updated.reason || null } });
    /* RN-10 / CB-03: suspendido con citas → aviso (las citas NO se cancelan solas; asunción 2). */
    if (action === 'suspend' && future.length) {
      await adminInbox?.notify({ kind: 'suspended_with_appointments', title: `${p.displayName} quedó suspendido con ${future.length} ${future.length === 1 ? 'cita futura' : 'citas futuras'}`, body: 'Reasigna o cancela cada cita desde su ficha.', professionalId: p._id, path: 'barberos/' });
    }
    return { membership: { status: updated.status, reason: updated.reason || null }, futureAppointments: future };
  }

  /* El admin edita perfil, servicios, disponibilidad y domicilio de cualquier barbero. */
  async function editBarber(user, id, what, body) {
    const b = await ctx(user);
    const { p } = await loadBarber(b, id);
    const actor = pro.forAdmin(p._id);
    const before = what === 'services' ? (await ProfessionalService.find({ professionalId: p._id }).lean()).map((l) => String(l.serviceId)) : null;
    const out =
      what === 'profile' ? await pro.updateProfile(actor, body)
      : what === 'services' ? await pro.setServices(actor, body)
      : what === 'availability' ? await pro.setAvailability(actor, body)
      : await pro.setHomeService(actor, body);
    await audit(user, b, `barber.${what}`, { entity: 'barber', entityId: p._id, summary: p.displayName, before, after: body });
    return out;
  }

  /* ─── Citas (RN-03) */
  async function serializeAdmin(appt, b, now) {
    const out = await agenda.serialize(appt, 'admin', b, now);
    out.customer = { name: appt.customerSnapshot?.name || '', phone: appt.customerSnapshot?.phoneE164 || null, email: appt.customerSnapshot?.email || null };
    /* SPEC-38 RN-13: en citas antiguas la comisión era interna (no se cobró): el admin la ve aparte. */
    out.pricing = { ...out.pricing, platformFeeRate: appt.pricing?.platformFeeRate ?? 0 };
    if (!appt.pricing?.feesIncluded) out.pricing.internalFeeCLP = appt.pricing?.platformFeeCLP ?? 0;
    out.canReassign = REASSIGNABLE.includes(appt.status) && appt.startsAt.getTime() > now;
    out.canCollect = canCollect(appt);
    out.statusLabel = STATUS_LABEL[appt.status];
    /* SPEC-35: datos del pago en línea para reembolsar (ids de Mercado Pago, error del último intento). */
    const p = appt.payment || {};
    if (p.method === 'online') {
      out.payment = {
        ...out.payment,
        mpPaymentId: p.mpPaymentId || null,
        refundError: p.refundError || null,
        refundInFlight: Boolean(p.refundInFlight),
        duplicates: (p.duplicates || []).map((d) => ({ mpPaymentId: d.mpPaymentId, amountCLP: d.amountCLP, status: d.status, refundError: d.refundError || null })),
      };
    }
    out.canRefund = Boolean(payments?.ready) && p.method === 'online' && p.status === 'reembolso_pendiente' && Boolean(p.mpPaymentId) && !p.refundInFlight;
    return out;
  }

  /* SPEC-35 RN-09: reembolso total (el server llama a Mercado Pago; el doble clic no duplica). */
  async function refund(user, id, body = {}) {
    const b = await ctx(user);
    const before = await loadAppt(b, id);
    const paymentId = body.paymentId ? String(body.paymentId) : undefined;
    const summary = `${before.customerSnapshot?.name || 'Cliente'} · $${before.pricing?.totalCLP} · pago ${paymentId || before.payment?.mpPaymentId || '—'}`;
    if (!payments) throw new HttpError(503, 'payments_not_configured', 'Mercado Pago no está configurado');
    try {
      const r = await payments.refund(user, id, { paymentId });
      await audit(user, b, 'appointment.refund', { entity: 'appointment', entityId: before._id, summary, before: { payment: before.payment?.status }, after: { payment: r.appt.payment?.status, duplicate: r.duplicate || undefined } });
      return serializeAdmin(r.appt, b, clock());
    } catch (err) {
      if (err instanceof HttpError && err.code === 'refund_failed') {
        await audit(user, b, 'appointment.refund_failed', { entity: 'appointment', entityId: before._id, summary: `${summary} — ${err.extra?.refundError || err.message}` });
      }
      throw err;
    }
  }

  const REASSIGNABLE = ['pendiente', 'pendiente_pago', 'confirmada', 'invitacion_enviada'];
  const canCollect = (a) => (a.payment?.method || 'local') === 'local' && ['pendiente', 'pago_pendiente'].includes(a.payment?.status || 'pendiente') && ['confirmada', 'en_curso', 'terminada'].includes(a.status);

  function buildFilter(b, q) {
    const tz = b.timezone;
    const f = { businessId: b._id };
    const from = q.from ? String(q.from) : '';
    const to = q.to ? String(q.to) : from;
    if (from || to) {
      if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && to < from)) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
      f.startsAt = {};
      if (from) f.startsAt.$gte = new Date(zonedToUtc(from, '00:00', tz));
      if (to) f.startsAt.$lt = new Date(zonedToUtc(addDays(to, 1), '00:00', tz));
    }
    if (q.professional) {
      const id = oid(q.professional);
      if (!id) throw new HttpError(400, 'invalid_professional', 'Barbero inválido');
      f.professionalId = id;
    }
    if (q.status) f.status = { $in: String(q.status).split(',').filter(Boolean) };
    if (q.paymentMethod) f['payment.method'] = String(q.paymentMethod);
    if (q.paymentStatus) f['payment.status'] = { $in: String(q.paymentStatus).split(',').filter(Boolean) };
    if (q.mode === 'home' || q.mode === 'shop') f['location.kind'] = q.mode === 'home' ? 'home' : { $ne: 'home' };
    const needle = String(q.q || '').trim();
    if (needle) {
      const re = new RegExp(escapeRe(needle), 'i');
      const digits = needle.replace(/\D/g, '');
      f.$or = [{ 'customerSnapshot.name': re }, { 'customerSnapshot.email': re }, ...(digits.length >= 4 ? [{ 'customerSnapshot.phoneE164': new RegExp(escapeRe(digits)) }] : [])];
    }
    return f;
  }

  async function listAppointments(user, q = {}) {
    const b = await ctx(user);
    const now = clock();
    const filter = buildFilter(b, q);
    const LIMIT = 500;
    const list = await Appointment.find(filter).sort({ startsAt: 1 }).limit(LIMIT + 1);
    const items = await Promise.all(list.slice(0, LIMIT).map((a) => serializeAdmin(a, b, now)));
    return { items, truncated: list.length > LIMIT, timezone: b.timezone };
  }

  async function exportCsv(user, q = {}) {
    const b = await ctx(user);
    const list = await Appointment.find(buildFilter(b, q)).sort({ startsAt: 1 }).limit(5000).lean();
    const rows = list.map((a) => {
      const w = wallClock(a.startsAt.getTime(), b.timezone);
      const r = {
        id: String(a._id),
        date: w.date,
        time: w.time,
        professional: a.professionalSnapshot?.displayName || '',
        customer: a.customerSnapshot?.name || '',
        phone: a.customerSnapshot?.phoneE164 || '',
        email: a.customerSnapshot?.email || '',
        service: a.serviceSnapshot?.name || '',
        mode: a.location?.kind === 'home' ? 'Domicilio' : 'Local',
        address: a.location?.kind === 'home' ? a.location?.address?.formatted || '' : '',
        status: STATUS_LABEL[a.status] || a.status,
        priceCLP: a.pricing?.priceCLP ?? '',
        surchargeCLP: a.pricing?.surchargeCLP ?? 0,
        totalCLP: a.pricing?.totalCLP ?? '',
        paymentMethod: (a.payment?.method || 'local') === 'local' ? 'En el local' : 'En línea',
        paymentStatus: a.payment?.status || 'pendiente',
        platformFeeCLP: a.pricing?.platformFeeCLP ?? 0,
        paymentFeeCLP: a.pricing?.paymentFeeCLP ?? 0,
        barberCLP: a.pricing?.barberCLP ?? (a.pricing?.priceCLP ?? 0) + (a.pricing?.surchargeCLP ?? 0),
        source: a.source || 'web',
      };
      return CSV_COLUMNS.map(([k]) => csvCell(r[k])).join(',');
    });
    await audit(user, b, 'appointments.export', { entity: 'appointment', summary: `${rows.length} citas`, after: q });
    /* BOM: Excel abre el UTF-8 con tildes bien. */
    return '﻿' + [CSV_COLUMNS.map(([, h]) => csvCell(h)).join(','), ...rows].join('\r\n') + '\r\n';
  }

  async function loadAppt(b, id) {
    const _id = oid(id);
    const a = _id ? await Appointment.findOne({ _id, businessId: b._id }) : null;
    if (!a) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    return a;
  }

  async function viewAppointment(user, id) {
    const b = await ctx(user);
    return serializeAdmin(await loadAppt(b, id), b, clock());
  }

  const ACTIONS = { confirm: 'confirm', cancel: 'cancel', propose: 'propose', start: 'start', finish: 'finish', no_show: 'no_show', reject: 'reject' };

  async function actOnAppointment(user, id, action, payload = {}) {
    const b = await ctx(user);
    const appt = await loadAppt(b, id);
    if (!ACTIONS[action]) throw new HttpError(404, 'not_found', 'Acción desconocida');
    const reason = String(payload.reason ?? '').trim();
    if ((action === 'cancel' || action === 'reject') && !reason) throw fieldError({ reason: 'required' }, 'Escribe el motivo');
    const before = { status: appt.status, startsAt: appt.startsAt.toISOString(), payment: appt.payment?.status };
    await agenda.actAs(b, appt, 'admin', action, { ...payload, reason }, user);
    const fresh = await Appointment.findById(appt._id);
    await audit(user, b, `appointment.${action}`, {
      entity: 'appointment',
      entityId: appt._id,
      summary: `${appt.customerSnapshot?.name || 'Cliente'} · ${appt.serviceSnapshot?.name || ''} · ${formatLong(appt.startsAt.getTime(), b.timezone)}${reason ? ` — ${reason}` : ''}`,
      before,
      after: { status: fresh.status, startsAt: fresh.startsAt.toISOString(), payment: fresh.payment?.status, proposal: fresh.proposal?.startsAt ? fresh.proposal.startsAt.toISOString() : undefined },
    });
    return serializeAdmin(fresh, b, clock());
  }

  /* RN-03: pago en el local cobrado (p.ej. cita terminada "sin cobrar" que se cobró después).
     SPEC-37: con la forma de pago y, si ya se emitió, el N° de la boleta SII. */
  async function collect(user, id, body = {}) {
    const b = await ctx(user);
    const current = await loadAppt(b, id);
    if (!canCollect(current)) throw new HttpError(409, 'invalid_transition', 'Esta cita no tiene un pago en el local por cobrar', { reason: 'bad_state' });
    const input = parseCollectInput(body);
    if (input.number && (await Appointment.exists({ businessId: b._id, 'payment.taxDoc.kind': 'boleta_sii', 'payment.taxDoc.number': input.number }))) throw boletaClash();
    const before = { payment: current.payment?.status };
    const appt = await agenda.mutate(b, current._id, (a) => {
      if (!canCollect(a)) throw new HttpError(409, 'invalid_transition', 'Recarga para ver el estado actual', { reason: 'stale' });
      applyLocalCollection(a, { ...input, provider: billing?.provider ?? payments?.taxProvider ?? { id: 'voucher', automaticFor: () => null }, now: clock() });
      return { by: 'admin', byUserId: user._id, reason: 'Pago en el local cobrado' };
    });
    await audit(user, b, 'appointment.collect', { entity: 'appointment', entityId: appt._id, summary: `${appt.customerSnapshot?.name || 'Cliente'} · $${appt.pricing?.totalCLP}${input.method ? ` · ${input.method}` : ''}${input.number ? ` · boleta ${input.number}` : ''}`, before, after: { payment: 'cobrado', method: input.method, boleta: input.number } });
    return serializeAdmin(appt, b, clock());
  }

  /* ─── Pagos y rendición (SPEC-37). El RUT del emisor nunca sale del server. */
  async function listPayments(user, q = {}) {
    const b = await ctx(user);
    return billing.list(b, q, { role: 'admin' });
  }

  async function registerBoleta(user, id, body = {}) {
    const b = await ctx(user);
    const r = await billing.registerBoleta(b, id, body.number, { by: 'admin', user });
    await audit(user, b, 'payment.boleta', { entity: 'appointment', entityId: r.appt._id, summary: `${r.appt.customerSnapshot?.name || 'Cliente'} · $${r.appt.pricing?.totalCLP} · boleta ${r.payment?.boletaNumber}`, before: { boleta: r.before }, after: { boleta: r.payment?.boletaNumber } });
    return { payment: r.payment };
  }

  async function rendicion(user, q = {}) {
    const b = await ctx(user);
    return billing.rendicion(b, q);
  }

  async function rendicionCsv(user, q = {}) {
    const b = await ctx(user);
    const r = await billing.rendicionCsv(b, q);
    await audit(user, b, 'rendicion.export', { entity: 'business', summary: `Rendición ${r.month}`, after: { month: r.month } });
    return r;
  }

  /* CB-04: candidatos para reasignar = aprobados, que hacen el servicio (y domicilio con
     radio suficiente) y están libres a esa hora. */
  async function reassignCandidates(b, appt, now) {
    const mode = appt.location?.kind === 'home' ? 'home' : 'shop';
    const svcDoc = await Service.findById(appt.serviceSnapshot.serviceId).lean();
    const service = { ...(svcDoc || {}), _id: appt.serviceSnapshot.serviceId, durationMin: appt.serviceSnapshot.durationMin };
    let pros = (await agenda.professionals(b, { service, mode })).filter((p) => String(p._id) !== String(appt.professionalId));
    if (mode === 'home') pros = pros.filter((p) => (appt.location?.distanceKm ?? 0) <= (p.homeService?.radiusKm ?? 0));
    if (!pros.length || appt.startsAt.getTime() <= now) return [];
    const date = wallClock(appt.startsAt.getTime(), b.timezone).date;
    const [day] = await agenda.availabilityFor(b, { service, pros, from: date, to: date, mode, now, minLeadMin: 0 });
    const slot = day?.slots.find((s) => Date.parse(s.startsAt) === appt.startsAt.getTime());
    return pros.filter((p) => slot?.professionalIds.includes(String(p._id)));
  }

  async function reassignOptions(user, id) {
    const b = await ctx(user);
    const appt = await loadAppt(b, id);
    const list = REASSIGNABLE.includes(appt.status) ? await reassignCandidates(b, appt, clock()) : [];
    return { options: list.map((p) => ({ id: String(p._id), name: p.displayName })) };
  }

  async function reassign(user, id, body = {}) {
    const b = await ctx(user);
    const now = clock();
    const current = await loadAppt(b, id);
    if (!REASSIGNABLE.includes(current.status) || current.startsAt.getTime() <= now) {
      throw new HttpError(409, 'invalid_transition', 'Esta cita ya no se puede reasignar', { reason: 'bad_state' });
    }
    const target = (await reassignCandidates(b, current, now)).find((p) => String(p._id) === String(body.professionalId || ''));
    if (!target) throw new HttpError(409, 'not_available', 'Ese barbero no hace este servicio o no está libre a esa hora');
    const fromName = current.professionalSnapshot?.displayName || 'El barbero';
    const fromId = current.professionalId;
    const appt = await agenda.mutate(b, current._id, async (a, session) => {
      if (!REASSIGNABLE.includes(a.status) || String(a.professionalId) !== String(fromId)) throw new HttpError(409, 'invalid_transition', 'Recarga para ver el estado actual', { reason: 'stale' });
      /* Mismo bloque de agenda, otro barbero: se mueven los SlotLock en la misma transacción. */
      const buffer = a.location?.kind === 'home' ? target.homeService?.travelBufferMin ?? 30 : 0;
      await SlotLock.deleteMany({ appointmentId: a._id }, { session });
      await SlotLock.insertMany(
        slotsFor(a.startsAt.getTime(), a.serviceSnapshot.durationMin, buffer).map((t) => ({ businessId: b._id, professionalId: target._id, slotStart: new Date(t), appointmentId: a._id, kind: 'main' })),
        { session, ordered: true }
      );
      a.professionalId = target._id;
      a.professionalSnapshot = { displayName: target.displayName, phone: target.phone };
      a.location.travelBufferMin = buffer;
      return { by: 'admin', byUserId: user._id, reason: `Reasignada de ${fromName} a ${target.displayName}` };
    });
    const when = formatLong(appt.startsAt.getTime(), b.timezone);
    const clientEmail = appt.customerSnapshot?.email;
    if (clientEmail) await mailer.send({ to: clientEmail, ...reassignedMail({ appt, when, url: `${frontUrl}/wstyle/cita/?id=${appt._id}`, from: fromName, to: target.displayName }) });
    await agenda.notify(b, appt, 'barber', 'reassigned_to_you');
    const old = await Professional.findById(fromId).lean();
    if (old?.userId) await PanelNotification.create({ userId: old.userId, professionalId: old._id, appointmentId: appt._id, kind: 'reassigned_away', title: 'Tu cita fue reasignada a otro barbero', body: `${appt.customerSnapshot?.name || 'Cliente'} · ${when}` }).catch(() => {});
    await audit(user, b, 'appointment.reassign', { entity: 'appointment', entityId: appt._id, summary: `${fromName} → ${target.displayName} · ${when}`, before: { professionalId: String(fromId), professional: fromName }, after: { professionalId: String(target._id), professional: target.displayName } });
    return serializeAdmin(appt, b, clock());
  }

  /* RN-03: el admin agenda a nombre de un cliente que llamó por teléfono (queda confirmada). */
  async function createAppointment(user, body = {}) {
    const b = await ctx(user);
    const now = clock();
    const fields = {};
    const name = cleanName(body.name);
    if (name.length < 2) fields.name = 'required';
    const phone = clMobile(body.phone);
    if (!phone) fields.phone = 'invalid_phone';
    const email = body.email ? normEmail(body.email) : '';
    if (email && !isEmail(email)) fields.email = 'invalid_email';
    const service = await agenda.findService(b, body.serviceId);
    if (!service) fields.serviceId = 'invalid_service';
    const startMs = Date.parse(body.startsAt);
    if (!Number.isFinite(startMs)) fields.startsAt = 'invalid_start';
    else if (startMs <= now) fields.startsAt = 'past';
    const note = String(body.note ?? '').trim();
    if (note.length > MAX_NOTE) fields.note = 'too_long';
    if (Object.keys(fields).length) throw fieldError(fields);
    let pros = await agenda.professionals(b, { service, mode: 'shop' });
    if (body.professionalId && body.professionalId !== 'any') pros = pros.filter((p) => String(p._id) === String(body.professionalId));
    const date = wallClock(startMs, b.timezone).date;
    const [day] = await agenda.availabilityFor(b, { service, pros, from: date, to: date, mode: 'shop', now, minLeadMin: 0 });
    const slot = day?.slots.find((s) => Date.parse(s.startsAt) === startMs);
    const target = slot && pros.find((p) => slot.professionalIds.includes(String(p._id)));
    if (!target) throw new HttpError(409, 'slot_unavailable', 'Esa hora no está libre para ese barbero. Elige otra.');
    const customer = await User.findOne({ status: 'active', $or: [...(email ? [{ email }] : []), { phoneE164: phone }] }).lean();
    /* SPEC-38 RN-21: agendada por WS Style = pago en el local → administración sí, procesamiento no. */
    const pricing = quote({ priceCLP: service.priceCLP, surchargeCLP: 0, method: 'local', ...(await currentRates()) });
    const doc = {
      _id: new ObjectId(),
      businessId: b._id,
      professionalId: target._id,
      customerUserId: customer?._id ?? null,
      customerSnapshot: { name, phoneE164: phone, email: email || customer?.email || undefined },
      serviceSnapshot: { serviceId: service._id, slug: service.slug, name: service.name, priceCLP: service.priceCLP, durationMin: service.durationMin },
      professionalSnapshot: { displayName: target.displayName, phone: target.phone },
      startsAt: new Date(startMs),
      endsAt: new Date(startMs + service.durationMin * MIN),
      location: { kind: 'shop', travelBufferMin: 0 },
      pricing,
      payment: { method: 'local', status: 'pendiente' },
      note: note || undefined,
      status: 'confirmada',
      history: [{ at: new Date(now), from: null, to: 'confirmada', by: 'admin', byUserId: user._id, reason: 'Agendada por WS Style (teléfono)' }],
      source: 'admin',
    };
    let appt;
    try {
      appt = await withTransaction(async (session, { transactional }) => {
        try {
          await SlotLock.insertMany(slotsFor(startMs, service.durationMin, 0).map((t) => ({ businessId: b._id, professionalId: target._id, slotStart: new Date(t), appointmentId: doc._id, kind: 'main' })), { session, ordered: true });
          const [created] = await Appointment.create([doc], { session });
          return created;
        } catch (err) {
          if (!transactional) await SlotLock.deleteMany({ appointmentId: doc._id });
          throw err;
        }
      }, logger);
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'slot_taken', 'Esa hora se acaba de ocupar. Elige otra.');
      throw err;
    }
    await Promise.all([doc.customerSnapshot.email ? agenda.notify(b, appt, 'client', 'confirmed') : null, agenda.notify(b, appt, 'barber', 'admin_booked')]);
    await audit(user, b, 'appointment.create', { entity: 'appointment', entityId: appt._id, summary: `${name} · ${service.name} · ${formatLong(startMs, b.timezone)} · ${target.displayName}`, after: { status: 'confirmada', professional: target.displayName, totalCLP: doc.pricing.totalCLP } });
    return serializeAdmin(appt, b, now);
  }

  /* ─── Carta (RN-04) */
  const serializeService = (s, counts = new Map()) => ({
    _id: String(s._id),
    id: s.slug,
    name: s.name,
    description: s.description || '',
    priceCLP: s.priceCLP,
    durationMin: s.durationMin,
    homeServiceAllowed: s.homeServiceAllowed !== false,
    active: Boolean(s.active),
    archived: Boolean(s.archivedAt),
    order: s.order ?? 0,
    appointments: counts.get(String(s._id)) ?? 0,
    updatedAt: s.updatedAt.toISOString(),
  });

  async function listServices(user) {
    const b = await ctx(user);
    const services = await Service.find({ businessId: b._id }).sort({ archivedAt: 1, order: 1, createdAt: 1 }).lean();
    const counts = new Map((await Appointment.aggregate([{ $match: { businessId: b._id } }, { $group: { _id: '$serviceSnapshot.serviceId', n: { $sum: 1 } } }])).map((c) => [String(c._id), c.n]));
    return { items: services.map((s) => serializeService(s, counts)) };
  }

  /* CB-06: precio entero > 0; duración 5–240 múltiplo de 5. Devuelve los campos válidos. */
  function validateService(body, { partial = false } = {}) {
    const fields = {};
    const out = {};
    const has = (k) => body[k] !== undefined;
    if (!partial || has('name')) {
      const n = cleanName(body.name);
      if (n.length < 2 || n.length > 60) fields.name = 'invalid_name';
      else out.name = n;
    }
    if (has('description')) {
      const d = String(body.description ?? '').trim();
      if (d.length > 300) fields.description = 'too_long';
      else out.description = d;
    }
    if (!partial || has('priceCLP')) {
      const raw = body.priceCLP;
      const v = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 10_000_000) fields.priceCLP = 'invalid_price';
      else out.priceCLP = v;
    }
    if (!partial || has('durationMin')) {
      const raw = body.durationMin;
      const v = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 5 || v > 240 || v % 5 !== 0) fields.durationMin = 'invalid_duration';
      else out.durationMin = v;
    }
    for (const k of ['homeServiceAllowed', 'active']) {
      if (has(k)) {
        if (typeof body[k] !== 'boolean') fields[k] = 'invalid';
        else out[k] = body[k];
      }
    }
    if (has('order')) {
      const v = Number(body.order);
      if (!Number.isInteger(v) || v < 0 || v > 999) fields.order = 'invalid';
      else out.order = v;
    }
    if (Object.keys(fields).length) {
      const msg = fields.priceCLP ? 'El precio tiene que ser un número entero mayor que 0' : fields.durationMin ? 'La duración tiene que estar entre 5 y 240 minutos, en múltiplos de 5' : 'Revisa los datos del servicio';
      throw fieldError(fields, msg);
    }
    return out;
  }

  const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'servicio';

  /* Barberos que dejan de ser reservables si este servicio deja de estar activo (CB-05). */
  async function orphanedBarbers(b, serviceId) {
    const links = await ProfessionalService.find({ businessId: b._id, serviceId }).lean();
    if (!links.length) return [];
    const active = new Set((await Service.distinct('_id', { businessId: b._id, active: true, _id: { $ne: serviceId } })).map(String));
    const out = [];
    for (const l of links) {
      const others = await ProfessionalService.find({ businessId: b._id, professionalId: l.professionalId }).lean();
      if (others.some((o) => active.has(String(o.serviceId)))) continue;
      const m = await Membership.findOne({ businessId: b._id, professionalId: l.professionalId, status: 'approved' }).lean();
      if (!m) continue;
      const p = await Professional.findById(l.professionalId, { displayName: 1 }).lean();
      if (p) out.push(p.displayName);
    }
    return out;
  }

  async function createService(user, body = {}) {
    const b = await ctx(user);
    const data = validateService(body);
    const base = body.id ? slugify(String(body.id)) : slugify(data.name);
    let slug = base;
    for (let i = 2; await Service.exists({ businessId: b._id, slug }); i++) slug = `${base}-${i}`;
    const last = await Service.findOne({ businessId: b._id }).sort({ order: -1 }).lean();
    const s = await Service.create({ businessId: b._id, slug, description: '', homeServiceAllowed: true, active: true, order: (last?.order ?? -1) + 1, ...data });
    await audit(user, b, 'service.create', { entity: 'service', entityId: s._id, summary: `${s.name} · $${s.priceCLP} · ${s.durationMin} min`, after: serializeService(s.toObject()) });
    return { service: serializeService(s.toObject()) };
  }

  const AUDIT_FIELDS = ['name', 'description', 'priceCLP', 'durationMin', 'homeServiceAllowed', 'active', 'order', 'archived'];
  const pick = (s) => Object.fromEntries(AUDIT_FIELDS.map((k) => [k, k === 'archived' ? Boolean(s.archivedAt) : s[k]]));

  async function updateService(user, id, body = {}) {
    const b = await ctx(user);
    const _id = oid(id);
    const current = _id ? await Service.findOne({ _id, businessId: b._id }).lean() : null;
    if (!current) throw new HttpError(404, 'not_found', 'No encontramos ese servicio');
    const data = validateService(body, { partial: true });
    if (body.archived === false) Object.assign(data, { archivedAt: null, active: true });
    if (body.archived === true) Object.assign(data, { archivedAt: new Date(clock()), active: false });
    /* CB-09: control de versión con updatedAt; la otra pestaña recibe 409. */
    const version = Date.parse(body.updatedAt);
    if (!Number.isFinite(version)) throw fieldError({ updatedAt: 'required' }, 'Falta la versión del servicio; recarga');
    if (version !== current.updatedAt.getTime()) throw new HttpError(409, 'stale', 'Este servicio cambió mientras lo editabas. Recarga para ver la versión actual.', { current: serializeService(current) });
    const deactivating = current.active && data.active === false;
    const warnings = deactivating ? await orphanedBarbers(b, current._id) : [];
    const updated = await Service.findOneAndUpdate({ _id: current._id, updatedAt: current.updatedAt }, { $set: data }, { new: true }).lean();
    if (!updated) throw new HttpError(409, 'stale', 'Este servicio cambió mientras lo editabas. Recarga para ver la versión actual.');
    /* RN-04: un cambio de precio NO toca las citas existentes (llevan su precio congelado). */
    await audit(user, b, current.priceCLP !== updated.priceCLP ? 'service.price' : 'service.update', { entity: 'service', entityId: current._id, summary: updated.name, before: pick(current), after: pick(updated) });
    if (warnings.length) await adminInbox?.notify({ kind: 'barber_unbookable', title: `${warnings.join(', ')} ya no ${warnings.length === 1 ? 'es reservable' : 'son reservables'}`, body: `"${updated.name}" era su único servicio activo.`, path: 'barberos/', email: false });
    return { service: serializeService(updated), unbookableBarbers: warnings };
  }

  /* RN-04: sin citas se borra; con citas se archiva. */
  async function removeService(user, id) {
    const b = await ctx(user);
    const _id = oid(id);
    const current = _id ? await Service.findOne({ _id, businessId: b._id }).lean() : null;
    if (!current) throw new HttpError(404, 'not_found', 'No encontramos ese servicio');
    const warnings = current.active ? await orphanedBarbers(b, current._id) : [];
    const used = await Appointment.exists({ 'serviceSnapshot.serviceId': current._id });
    if (used) {
      const updated = await Service.findByIdAndUpdate(current._id, { active: false, archivedAt: new Date(clock()) }, { new: true }).lean();
      await audit(user, b, 'service.archive', { entity: 'service', entityId: current._id, summary: current.name, before: pick(current), after: pick(updated) });
      if (warnings.length) await adminInbox?.notify({ kind: 'barber_unbookable', title: `${warnings.join(', ')} ya no ${warnings.length === 1 ? 'es reservable' : 'son reservables'}`, body: `"${current.name}" era su único servicio activo.`, path: 'barberos/', email: false });
      return { result: 'archived', service: serializeService(updated), unbookableBarbers: warnings };
    }
    await Service.deleteOne({ _id: current._id });
    await ProfessionalService.deleteMany({ businessId: b._id, serviceId: current._id });
    await audit(user, b, 'service.delete', { entity: 'service', entityId: current._id, summary: current.name, before: pick(current) });
    return { result: 'deleted', unbookableBarbers: warnings };
  }

  /* RN-06: "Exportar a JSON" → services.json + filas de horario de site.json (no hace commits). */
  async function exportContent(user) {
    const b = await ctx(user);
    const services = await Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean();
    await audit(user, b, 'content.export', { entity: 'business', summary: `${services.length} servicios` });
    return {
      services: services.map((s) => ({ id: s.slug, name: s.name, description: s.description || '', priceCLP: s.priceCLP, durationMin: s.durationMin })),
      hours: weekToSiteRows(entriesToWeek(b.hours)),
    };
  }

  /* ─── Horario y cierres (RN-05) */
  async function schedule(user) {
    const b = await ctx(user);
    const today = wallClock(clock(), b.timezone).date;
    return { timezone: b.timezone, week: entriesToWeek(b.hours), closures: (b.closures || []).filter((c) => c.date >= today).sort((x, y) => x.date.localeCompare(y.date)).map((c) => ({ id: String(c._id), date: c.date, reason: c.reason || '', groupId: c.groupId || null })) };
  }

  async function activeFuture(b, now, extra = {}) {
    return Appointment.find({ businessId: b._id, status: { $in: BLOCKING }, endsAt: { $gt: new Date(now) }, ...extra }).sort({ startsAt: 1 });
  }

  async function setHours(user, body = {}) {
    const b = await ctx(user);
    const parsed = parseWeek(body.week);
    if (parsed.error) throw new HttpError(400, parsed.error, parsed.message);
    const now = clock();
    /* Reducir el horario con citas afectadas → 409 con la lista (se resuelven antes). */
    const clash = [];
    for (const a of await activeFuture(b, now)) {
      const s = wallClock(a.startsAt.getTime(), b.timezone);
      const e = wallClock(a.endsAt.getTime(), b.timezone);
      const startMin = s.hour * 60 + s.minute;
      const endMin = e.date === s.date ? e.hour * 60 + e.minute : 1440;
      const day = parsed.week.find((d) => d.weekday === isoWeekday(s.date));
      if (!fitsInRanges(day.ranges, startMin, endMin)) clash.push(a);
    }
    if (clash.length) {
      const appointments = await Promise.all(clash.map((a) => serializeAdmin(a, b, now)));
      throw new HttpError(409, 'schedule_conflict', `Hay ${clash.length} ${clash.length === 1 ? 'cita activa' : 'citas activas'} fuera del horario nuevo. Reasígnalas, muévelas o cancélalas antes de guardar.`, { appointments });
    }
    const before = entriesToWeek(b.hours);
    await Business.updateOne({ _id: b._id }, { hours: weekToEntries(parsed.week) });
    await audit(user, b, 'schedule.hours', { entity: 'business', entityId: b._id, summary: 'Horario semanal', before, after: parsed.week });
    return schedule(user);
  }

  async function addClosure(user, body = {}) {
    const b = await ctx(user);
    const now = clock();
    const today = wallClock(now, b.timezone).date;
    const fromDate = String(body.fromDate ?? '');
    const toDate = String(body.toDate || fromDate);
    const reason = String(body.reason ?? '').trim().slice(0, 80);
    const fields = {};
    if (!isDate(fromDate)) fields.fromDate = 'invalid_date';
    else if (fromDate < today) fields.fromDate = 'past';
    if (!isDate(toDate) || toDate < fromDate) fields.toDate = 'invalid_date';
    else if (addDays(fromDate, 60) < toDate) fields.toDate = 'too_long';
    if (!reason) fields.reason = 'required';
    if (Object.keys(fields).length) throw fieldError(fields, fields.reason ? 'Escribe el motivo del cierre' : 'Revisa las fechas (máximo 61 días)');
    const dates = [];
    for (let d = fromDate; d <= toDate; d = addDays(d, 1)) dates.push(d);
    const start = new Date(zonedToUtc(fromDate, '00:00', b.timezone));
    const end = new Date(zonedToUtc(addDays(toDate, 1), '00:00', b.timezone));
    const clash = await activeFuture(b, now, { startsAt: { $gte: start, $lt: end } });
    if (clash.length) {
      const appointments = await Promise.all(clash.map((a) => serializeAdmin(a, b, now)));
      throw new HttpError(409, 'closure_conflict', `Hay ${clash.length} ${clash.length === 1 ? 'cita activa' : 'citas activas'} en esas fechas. Reasígnalas, muévelas o cancélalas antes de cerrar.`, { appointments });
    }
    const groupId = crypto.randomBytes(6).toString('hex');
    const existing = new Set((b.closures || []).map((c) => c.date));
    const add = dates.filter((d) => !existing.has(d)).map((date) => ({ date, reason, groupId }));
    if (add.length) await Business.updateOne({ _id: b._id }, { $push: { closures: { $each: add } } });
    await audit(user, b, 'schedule.closure_add', { entity: 'business', entityId: b._id, summary: `${reason}: ${fromDate}${toDate !== fromDate ? ` a ${toDate}` : ''}`, after: { fromDate, toDate, reason } });
    return schedule(user);
  }

  async function removeClosure(user, id) {
    const b = await ctx(user);
    const c = (b.closures || []).find((x) => String(x._id) === String(id));
    if (!c) throw new HttpError(404, 'not_found', 'No encontramos ese cierre');
    await Business.updateOne({ _id: b._id }, { $pull: { closures: { _id: c._id } } });
    await audit(user, b, 'schedule.closure_remove', { entity: 'business', entityId: b._id, summary: `${c.reason || 'Cierre'}: ${c.date}`, before: { date: c.date, reason: c.reason } });
    return schedule(user);
  }

  /* ─── Estadísticas (RN-07) */
  async function stats(user, q = {}) {
    const b = await ctx(user);
    return computeStats(b, parseRange(q, clock(), b.timezone));
  }

  /* ─── Configuración (RN-08). Las credenciales de pago NUNCA pasan por acá. */
  function mpInfo() {
    const token = String(env.MP_ACCESS_TOKEN || '');
    return { configured: Boolean(token), mode: !token ? null : token.startsWith('TEST-') ? 'sandbox' : 'production', ready: Boolean(onlinePayments.ready) };
  }

  async function getSettings(user) {
    const b = await ctx(user);
    const rates = ratesView(ratesFrom(await PlatformSettings.findOne({ key: 'default' }).lean()));
    return {
      payments: { online: Boolean(b.payments?.onlineEnabled), local: b.payments?.localEnabled !== false },
      mercadoPago: mpInfo(),
      platformFeePercent: rates.platformFeePercent,
      /* SPEC-38 RN-08: comisión de Mercado Pago que paga el cliente al pagar en línea (+ IVA si corresponde). */
      paymentFeePercent: rates.paymentFeePercent,
      paymentFeeVat: rates.paymentFeeVat,
      rules: Object.fromEntries(Object.keys(RULE_LIMITS).map((k) => [k, b.settings?.[k]])),
      limits: { rules: RULE_LIMITS, platformFeePercent: [0, MAX_FEE_PERCENT], paymentFeePercent: [0, MAX_PAYMENT_FEE_PERCENT] },
    };
  }

  const ALLOWED_SETTINGS = new Set(['payments', 'platformFeePercent', 'paymentFeePercent', 'paymentFeeVat', 'rules']);
  /* % con hasta 2 decimales dentro de [0, max]. */
  const validPercent = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && Math.abs(Math.round(v * 100) - v * 100) <= 1e-6;

  async function setSettings(user, body = {}) {
    const b = await ctx(user);
    /* AC-09: nada de credenciales (ni ningún otro campo desconocido). */
    const unknown = Object.keys(body).filter((k) => !ALLOWED_SETTINGS.has(k));
    if (unknown.length) throw new HttpError(400, 'unknown_field', `No se puede configurar "${unknown[0]}" desde el panel. Las credenciales de pago van en server/.env.`, { fields: Object.fromEntries(unknown.map((k) => [k, 'not_allowed'])) });
    const fields = {};
    const set = {};
    if (body.payments !== undefined) {
      const p = body.payments || {};
      const extra = Object.keys(p).filter((k) => !['online', 'local'].includes(k));
      if (extra.length) fields.payments = 'not_allowed';
      for (const k of ['online', 'local']) if (p[k] !== undefined && typeof p[k] !== 'boolean') fields[`payments.${k}`] = 'invalid';
      const online = p.online ?? Boolean(b.payments?.onlineEnabled);
      const local = p.local ?? b.payments?.localEnabled !== false;
      if (!online && !local) fields['payments.local'] = 'one_required';
      set['payments.onlineEnabled'] = online;
      set['payments.localEnabled'] = local;
    }
    const fee = {};
    if (body.platformFeePercent !== undefined) {
      const v = body.platformFeePercent;
      if (!validPercent(v, MAX_FEE_PERCENT)) fields.platformFeePercent = 'out_of_range';
      else fee.defaultPlatformFeeRate = Math.round(v * 100) / 10000;
    }
    if (body.paymentFeePercent !== undefined) {
      const v = body.paymentFeePercent;
      if (!validPercent(v, MAX_PAYMENT_FEE_PERCENT)) fields.paymentFeePercent = 'out_of_range';
      else fee.paymentFeeRate = Math.round(v * 100) / 10000;
    }
    if (body.paymentFeeVat !== undefined) {
      if (typeof body.paymentFeeVat !== 'boolean') fields.paymentFeeVat = 'invalid';
      else fee.paymentFeeVat = body.paymentFeeVat;
    }
    if (body.rules !== undefined) {
      for (const [k, v] of Object.entries(body.rules || {})) {
        const lim = RULE_LIMITS[k];
        if (!lim) fields[`rules.${k}`] = 'not_allowed';
        else if (typeof v !== 'number' || !Number.isInteger(v) || v < lim[0] || v > lim[1]) fields[`rules.${k}`] = 'out_of_range';
        else set[`settings.${k}`] = v;
      }
    }
    if (Object.keys(fields).length) throw fieldError(fields, fields['payments.local'] === 'one_required' ? 'Deja al menos una forma de pago habilitada' : 'Revisa los valores');
    const before = await getSettings(user);
    if (Object.keys(set).length) await Business.updateOne({ _id: b._id }, { $set: set });
    /* RN-08: la comisión se congela en cada cita nueva; cambiarla no toca las existentes. */
    if (Object.keys(fee).length) await PlatformSettings.updateOne({ key: 'default' }, { $set: fee }, { upsert: true });
    const after = await getSettings(user);
    const strip = (x) => ({ payments: x.payments, platformFeePercent: x.platformFeePercent, paymentFeePercent: x.paymentFeePercent, paymentFeeVat: x.paymentFeeVat, rules: x.rules });
    await audit(user, b, 'settings.update', { entity: 'settings', summary: 'Configuración', before: strip(before), after: strip(after) });
    return after;
  }

  /* ─── Mi cuenta */
  async function changePassword(user, body = {}) {
    requireAdmin(user);
    const identity = user.identities.find((i) => i.provider === 'email' && i.passwordHash);
    if (!identity || !(await checkPassword(body.current, identity.passwordHash))) throw fieldError({ current: 'invalid_credentials' }, 'La contraseña actual no es correcta');
    const problem = passwordProblem(body.password, user.email);
    if (problem) throw fieldError({ password: problem }, 'Mínimo 8 caracteres, con letras y números');
    identity.passwordHash = await hashPassword(body.password);
    await user.save();
    await audit(user, await agenda.business().catch(() => null), 'account.password', { entity: 'user', entityId: user._id, summary: user.email });
    return { ok: true };
  }

  return {
    requireAdmin,
    status,
    overview,
    notifications,
    markRead,
    listBarbers,
    barberDetail,
    decide,
    editBarber,
    listAppointments,
    exportCsv,
    viewAppointment,
    actOnAppointment,
    collect,
    refund,
    listPayments,
    registerBoleta,
    rendicion,
    rendicionCsv,
    reassignOptions,
    reassign,
    createAppointment,
    listServices,
    createService,
    updateService,
    removeService,
    exportContent,
    schedule,
    setHours,
    addClosure,
    removeClosure,
    stats,
    getSettings,
    setSettings,
    auditList,
    changePassword,
  };
}

