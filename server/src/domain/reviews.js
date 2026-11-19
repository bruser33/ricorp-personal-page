/* Reseñas de clientes de WS Style (SPEC-52). Solo el dueño de una cita `terminada` deja UNA reseña por cita, hasta
   60 días después de atendido (RN-01…RN-03). Se publican al instante (RN-08); el super admin puede ocultarlas y
   volver a mostrarlas (RN-09, auditado en domain/admin.js). La respuesta pública nunca lleva datos personales. */
import mongoose from 'mongoose';
import { Appointment, Notification, Review, User } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/db.js';
import { adminAlertMail } from '../lib/emails.js';
import { displayName, sanitizeComment, starsText, validateReviewBody } from '../lib/reviewText.js';
import { formatLong } from './time.js';

const DAY = 24 * 60 * 60 * 1000;
const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const REVIEW_WINDOW_DAYS = 60;
export const PUBLIC_PAGE_SIZE = 6;
export const ADMIN_PAGE_SIZE = 20;
export const MAX_HIDE_REASON = 200;

/* Momento en que terminó la cita: el último paso a `terminada` del historial (o, si no está, la hora de término). */
export function finishedAt(appt) {
  const h = [...(appt.history || [])].reverse().find((x) => x.to === 'terminada');
  return new Date(h?.at ?? appt.endsAt).getTime();
}

/* RN-03: ¿todavía se puede reseñar? (`now` en ms). */
export const withinWindow = (appt, now) => now - finishedAt(appt) <= REVIEW_WINDOW_DAYS * DAY;

/* ¿Muestra "Dejar reseña"? (Mis citas): terminada, con cuenta, sin reseña y dentro del plazo. */
export const canReview = (appt, hasReview, now) => appt.status === 'terminada' && Boolean(appt.customerUserId) && !hasReview && withinWindow(appt, now);

const notFound = () => new HttpError(404, 'appointment_not_found', 'No encontramos esa cita en tu cuenta');

/* Vista pública (AC-04): sin email, teléfono, userId, cita ni motivo de ocultamiento. */
export const publicReview = (r) => ({
  id: String(r._id),
  rating: r.rating,
  comment: r.comment,
  author: r.authorName || 'Cliente de WS Style',
  service: r.serviceName || '',
  createdAt: new Date(r.createdAt).toISOString(),
});

export function createReviews({ agenda, clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173', adminInbox = null }) {
  const requireUser = (user) => {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para dejar tu reseña.');
    return user;
  };

  /* RN-01 / RN-13: la cita tiene que ser del usuario de la sesión. Ajena o inexistente → el mismo 404. */
  async function ownAppointment(b, user, apptId) {
    const _id = oid(apptId);
    const appt = _id ? await Appointment.findOne({ _id, businessId: b._id, customerUserId: user._id }).lean() : null;
    if (!appt) throw notFound();
    return appt;
  }

  const apptSummary = (appt, tz) => ({
    id: String(appt._id),
    service: appt.serviceSnapshot?.name || 'Servicio',
    professional: appt.professionalSnapshot?.displayName || '',
    startsAt: new Date(appt.startsAt).toISOString(),
    when: formatLong(new Date(appt.startsAt).getTime(), tz),
    status: appt.status,
  });

  /* GET /reviews/eligibility?cita=… → qué mostrar en el formulario: open | reviewed | expired | not_attended. */
  async function eligibility(user, apptId) {
    requireUser(user);
    const b = await agenda.business();
    const appt = await ownAppointment(b, user, apptId);
    const review = await Review.findOne({ appointmentId: appt._id }).lean();
    const now = clock();
    const state = review ? 'reviewed' : appt.status !== 'terminada' ? 'not_attended' : !withinWindow(appt, now) ? 'expired' : 'open';
    return {
      state,
      appointment: apptSummary(appt, b.timezone),
      review: review ? { rating: review.rating, comment: review.comment, createdAt: new Date(review.createdAt).toISOString() } : null,
      deadline: appt.status === 'terminada' ? new Date(finishedAt(appt) + REVIEW_WINDOW_DAYS * DAY).toISOString() : null,
    };
  }

  /* POST /reviews { appointmentId, rating, comment } (RN-01…RN-08). */
  async function create(user, body = {}) {
    requireUser(user);
    const b = await agenda.business();
    const appt = await ownAppointment(b, user, body.appointmentId);
    if (appt.status !== 'terminada') throw new HttpError(409, 'not_attended', 'Solo puedes reseñar una cita atendida.');
    if (await Review.exists({ appointmentId: appt._id })) throw new HttpError(409, 'already_reviewed', 'Ya dejaste una reseña para esta cita.');
    if (!withinWindow(appt, clock())) throw new HttpError(409, 'review_window_closed', 'El plazo para reseñar esta cita terminó.');
    const { rating, comment } = validateReviewBody(body);
    const fresh = await User.findById(user._id, { name: 1 }).lean();
    let review;
    try {
      review = await Review.create({
        businessId: b._id,
        appointmentId: appt._id,
        userId: user._id,
        rating,
        comment,
        authorName: displayName(fresh?.name ?? user.name),
        serviceName: appt.serviceSnapshot?.name || '',
        professionalName: appt.professionalSnapshot?.displayName || '',
        status: 'visible',
        /* Fecha de publicación según el reloj del negocio (inyectable en los tests). */
        createdAt: new Date(clock()),
      });
    } catch (err) {
      /* CB-02: dos envíos a la vez → el índice único deja pasar uno solo. */
      if (isDuplicateKey(err)) throw new HttpError(409, 'already_reviewed', 'Ya dejaste una reseña para esta cita.');
      throw err;
    }
    await alertAdmin(b, review).catch((err) => logger.error('[reseñas] aviso al admin falló:', err.message));
    return { ok: true, review: publicReview(review) };
  }

  /* RN asunción 10 / AC-07: bandeja del panel + un correo por cada super admin (queda en Notification). */
  async function alertAdmin(b, review) {
    const title = `Nueva reseña: ${starsText(review.rating)}`;
    const body = `${review.authorName} · ${review.serviceName}: “${review.comment}”`;
    await adminInbox?.notify({ kind: 'review_new', title, body, appointmentId: review.appointmentId, email: false });
    const url = `${frontUrl}/wstyle/admin/resenas/?id=${review._id}`;
    const mail = adminAlertMail({ title, body: `${body}\nSi no corresponde, puedes ocultarla desde el panel.`, url, kind: 'review_new' });
    for (const to of (await adminInbox?.emails()) ?? []) {
      const out = await mailer.send({ to, ...mail });
      await Notification.create({ businessId: b._id, appointmentId: review.appointmentId, to, template: mail.template, status: out.status, error: out.error }).catch(() => {});
    }
  }

  /* GET /reviews?page= (público, RN-10): resumen de las visibles + 6 por página, la más reciente primero. */
  async function publicList(q = {}) {
    const b = await agenda.business();
    const page = Math.min(1000, Math.max(1, Number.parseInt(q.page, 10) || 1));
    const filter = { businessId: b._id, status: 'visible' };
    const [agg, items] = await Promise.all([
      Review.aggregate([{ $match: filter }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
      Review.find(filter, { rating: 1, comment: 1, authorName: 1, serviceName: 1, createdAt: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PUBLIC_PAGE_SIZE)
        .limit(PUBLIC_PAGE_SIZE)
        .lean(),
    ]);
    const count = agg[0]?.count ?? 0;
    const average = count ? Math.round(agg[0].avg * 10) / 10 : 0;
    const pages = Math.max(1, Math.ceil(count / PUBLIC_PAGE_SIZE));
    return { summary: { average, count }, page, pages, hasMore: page < pages, items: items.map(publicReview) };
  }

  /* ─── Super admin (las rutas validan el rol y auditan en domain/admin.js). */
  async function adminList(b, q = {}) {
    const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
    const filter = { businessId: b._id };
    if (q.status) {
      if (!['visible', 'hidden'].includes(String(q.status))) throw new HttpError(400, 'invalid_status', 'Filtro inválido');
      filter.status = String(q.status);
    }
    if (q.rating) {
      const r = Number(q.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) throw new HttpError(400, 'invalid_rating', 'Filtro inválido');
      filter.rating = r;
    }
    const text = String(q.q ?? '').trim().slice(0, 80);
    if (text) {
      const re = new RegExp(escapeRe(text), 'i');
      const users = await User.find({ $or: [{ name: re }, { email: re }] }, { _id: 1 }).limit(200).lean();
      filter.$or = [{ authorName: re }, { comment: re }, { serviceName: re }, { professionalName: re }, ...(users.length ? [{ userId: { $in: users.map((u) => u._id) } }] : [])];
    }
    const base = { businessId: b._id };
    const [items, total, visible, hidden] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).lean(),
      Review.countDocuments(filter),
      Review.countDocuments({ ...base, status: 'visible' }),
      Review.countDocuments({ ...base, status: 'hidden' }),
    ]);
    const owners = new Map((await User.find({ _id: { $in: items.map((r) => r.userId) } }, { name: 1, email: 1, status: 1 }).lean()).map((u) => [String(u._id), u]));
    return {
      page,
      pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
      total,
      counts: { visible, hidden },
      items: items.map((r) => {
        const u = owners.get(String(r.userId));
        return {
          ...publicReview(r),
          status: r.status,
          professional: r.professionalName || '',
          appointmentId: String(r.appointmentId),
          customer: { name: u?.status === 'deleted' ? 'Cuenta eliminada' : u?.name || '', email: u?.status === 'deleted' ? null : u?.email || null },
          hidden: r.status === 'hidden' ? { at: r.hidden?.at ? new Date(r.hidden.at).toISOString() : null, by: r.hidden?.by || 'admin', reason: r.hidden?.reason || '' } : null,
        };
      }),
    };
  }

  async function loadReview(b, id) {
    const _id = oid(id);
    const r = _id ? await Review.findOne({ _id, businessId: b._id }).lean() : null;
    if (!r) throw new HttpError(404, 'not_found', 'No encontramos esa reseña');
    return r;
  }

  /* RN-09: ocultar (motivo opcional, solo interno). Condicional sobre el estado: dos clics → un solo cambio. */
  async function hide(b, user, id, body = {}) {
    const r = await loadReview(b, id);
    const reason = sanitizeComment(typeof body.reason === 'string' ? body.reason : '').replace(/\s+/g, ' ').slice(0, MAX_HIDE_REASON);
    const hidden = { at: new Date(clock()), byUserId: user._id, by: 'admin', reason };
    const out = await Review.findOneAndUpdate({ _id: r._id, status: 'visible' }, { $set: { status: 'hidden', hidden } }, { new: true }).lean();
    if (!out) throw new HttpError(409, 'already_hidden', 'Esta reseña ya está oculta.');
    return { before: r, after: out };
  }

  async function show(b, _user, id) {
    const r = await loadReview(b, id);
    const owner = await User.findById(r.userId, { status: 1 }).lean();
    if ((r.status === 'hidden' && r.hidden?.by === 'account_deleted') || !owner || owner.status === 'deleted') throw new HttpError(409, 'account_deleted', 'El cliente eliminó su cuenta: su reseña no se puede volver a mostrar.');
    const out = await Review.findOneAndUpdate({ _id: r._id, status: 'hidden' }, { $set: { status: 'visible' }, $unset: { hidden: 1 } }, { new: true }).lean();
    if (!out) throw new HttpError(409, 'already_visible', 'Esta reseña ya está visible.');
    return { before: r, after: out };
  }

  /* RN-12: al eliminar la cuenta, sus reseñas visibles se ocultan y dejan de contar. */
  async function hideForUser(userId) {
    /* Todas (también las que el admin ya había ocultado): ninguna se puede volver a mostrar. */
    await Review.updateMany({ userId }, { $set: { status: 'hidden', 'hidden.at': new Date(clock()), 'hidden.by': 'account_deleted' } });
  }

  /* Tarjeta de Inicio del panel: reseñas nuevas de los últimos 7 días. */
  const countSince = (b, days = 7) => Review.countDocuments({ businessId: b._id, createdAt: { $gte: new Date(clock() - days * DAY) } });

  return { eligibility, create, publicList, adminList, hide, show, hideForUser, countSince };
}
