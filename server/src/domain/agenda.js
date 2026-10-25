/* Agenda: catálogo, disponibilidad, creación de citas y máquina de estados
   (SPEC-32). El nombre no dice "wstyle" a propósito: el mismo módulo sirve a
   cualquier Business (escalable a /api/businesses/:slug/... en un futuro). */
import mongoose from 'mongoose';
import {
  Appointment,
  AvailabilityRule,
  BLOCKING,
  Business,
  CustomerProfile,
  FINAL,
  Membership,
  Notification,
  PanelNotification,
  PlatformSettings,
  Professional,
  ProfessionalService,
  Service,
  SlotLock,
  TimeOff,
  User,
} from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey, withTransaction } from '../lib/db.js';
import { clMobile, MAX_NOTE } from '../lib/validate.js';
import { appointmentMail, BARBER_EVENT_TITLE, waLink } from '../lib/emails.js';
import { daySlots, distanceKm, slotsFor } from './availability.js';
import { addDays, formatLong, isDate, isoWeekday, wallClock, zonedToUtc } from './time.js';
import { entriesToWeek, weekToSiteRows } from './hours.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const { ObjectId } = mongoose.Types;

export const STATUS_LABEL = {
  pendiente_pago: 'Esperando el pago',
  pendiente: 'Esperando confirmación',
  invitacion_enviada: 'Invitación enviada',
  confirmada: 'Confirmada',
  propuesta_cambio: 'Propuesta de cambio',
  en_curso: 'En curso',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  no_asistio: 'No asistió',
};

/* Fotos del barbero (SPEC-33 RN-17): en Professional.photos se guarda el id del archivo en
   GridFS; hacia afuera va la URL relativa a la API (el front le antepone su API_BASE). */
export const photoUrl = (idOrUrl) => (/^[a-f0-9]{24}$/.test(String(idOrUrl)) ? `/api/wstyle/photos/${idOrUrl}` : idOrUrl);

/* Motivos de cancelación del barbero (SPEC-33 RN-09). */
export const CANCEL_REASONS = { imprevisto: 'Imprevisto personal', enfermedad: 'Enfermedad', local: 'Problema con el local', otro: 'Otro' };

/* Margen para "Iniciar" e "Inasistencia" (SPEC-33 RN-10, RN-11). */
export const START_WINDOW_MIN = 15;

const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const notFound = () => new HttpError(404, 'not_found', 'No encontramos esta cita');
const invalid = (reason, message = 'Esta acción ya no es posible. Recarga para ver el estado actual.') =>
  new HttpError(409, 'invalid_transition', message, { reason });

/* SPEC-35 RN-03: la hora se retiene 15 min mientras el cliente paga en línea. */
export const PAYMENT_HOLD_MIN = 15;
/* Estados del pago en línea antes de aprobarse (se puede ir y venir entre ellos) y después
   (monótonos: nunca se vuelve de "pagado" a uno de antes). */
export const PAY_OPEN = ['pendiente', 'en_proceso', 'rechazado'];

/* `onlinePayments.ready`: hay credenciales de Mercado Pago (SPEC-35). Sin ellas "Pagar en
   línea" no se ofrece aunque el admin lo habilite (CB-09). */
export function createAgenda({ clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173', geocoder, businessSlug = 'ws-style', adminInbox = null, onlinePayments = { ready: false } }) {
  async function business() {
    const b = await Business.findOne({ slug: businessSlug }).lean();
    if (!b) throw new HttpError(503, 'agenda_unavailable', 'La agenda aún no está configurada');
    return b;
  }

  async function findService(b, idOrSlug) {
    const q = { businessId: b._id, active: true };
    const id = oid(idOrSlug);
    return Service.findOne(id ? { ...q, _id: id } : { ...q, slug: String(idOrSlug || '') }).lean();
  }

  /* Profesionales que pueden atender: aprobados en el negocio, activos, con
     disponibilidad cargada (CB-06) y, si se pide, que hagan ese servicio / domicilio. */
  async function professionals(b, { service = null, mode = 'shop' } = {}) {
    const memberships = await Membership.find({ businessId: b._id, status: 'approved' }).sort({ order: 1, createdAt: 1 }).lean();
    const ids = memberships.map((m) => m.professionalId);
    const [pros, rules, allLinks, activeIds] = await Promise.all([
      Professional.find({ _id: { $in: ids }, status: 'active' }).lean(),
      AvailabilityRule.find({ businessId: b._id, professionalId: { $in: ids } }).lean(),
      ProfessionalService.find({ businessId: b._id, professionalId: { $in: ids } }).lean(),
      Service.distinct('_id', { businessId: b._id, active: true }),
    ]);
    /* SPEC-34 CB-05: un servicio archivado/inactivo no cuenta (si era el único, el barbero deja de ser reservable). */
    const active = new Set(activeIds.map(String));
    const links = allLinks.filter((l) => active.has(String(l.serviceId)));
    const byId = new Map(pros.map((p) => [String(p._id), p]));
    const out = [];
    for (const m of memberships) {
      const p = byId.get(String(m.professionalId));
      if (!p) continue;
      const myRules = rules.filter((r) => String(r.professionalId) === String(p._id));
      if (!myRules.length) continue;
      const serviceIds = links.filter((l) => String(l.professionalId) === String(p._id)).map((l) => String(l.serviceId));
      /* SPEC-33 RN-04: sin al menos un servicio no es reservable. */
      if (!serviceIds.length) continue;
      if (service && !serviceIds.includes(String(service._id))) continue;
      if (mode === 'home' && (!p.homeService?.enabled || (service && service.homeServiceAllowed === false))) continue;
      out.push({ ...p, rules: myRules, serviceIds });
    }
    return out;
  }

  const publicPro = (p) => ({
    id: String(p._id),
    name: p.displayName,
    specialty: p.specialty || '',
    photo: p.photos?.[0] ? photoUrl(p.photos[0]) : null,
    homeService: p.homeService?.enabled ? { surchargeCLP: p.homeService.surchargeCLP, radiusKm: p.homeService.radiusKm } : null,
    serviceIds: p.serviceIds,
  });

  async function catalog() {
    const b = await business();
    const [services, pros] = await Promise.all([Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean(), professionals(b)]);
    return {
      business: {
        name: b.name,
        timezone: b.timezone,
        address: b.address,
        hours: b.hours,
        /* SPEC-34 RN-06: el horario en el formato de site.json, para que la landing lo reemplace tal cual. */
        hoursRows: weekToSiteRows(entriesToWeek(b.hours)),
        closures: (b.closures || []).filter((c) => c.date >= wallClock(clock(), b.timezone).date).map((c) => ({ date: c.date, reason: c.reason || '' })),
        policies: b.policies,
        whatsapp: b.contact?.whatsapp || null,
        contact: { whatsapp: b.contact?.whatsapp || null, phone: b.contact?.phone || null, address: b.address || {} },
        settings: { minLeadMinutes: b.settings.minLeadMinutes, horizonDays: b.settings.horizonDays, cancelUntilMinutes: b.settings.cancelUntilMinutes },
        payments: paymentOptions(b),
      },
      services: services.map((s) => ({ id: s.slug, name: s.name, description: s.description || '', priceCLP: s.priceCLP, durationMin: s.durationMin, homeServiceAllowed: s.homeServiceAllowed !== false })),
      professionals: pros.map((p) => {
        const slugs = new Map(services.map((x) => [String(x._id), x.slug]));
        return { ...publicPro(p), serviceIds: p.serviceIds.map((id) => slugs.get(id)).filter(Boolean) };
      }),
    };
  }

  /* SPEC-34 RN-08: formas de pago que se ofrecen en el paso 4 de la reserva. */
  function paymentOptions(b) {
    return { online: Boolean(b.payments?.onlineEnabled && onlinePayments.ready), local: b.payments?.localEnabled !== false };
  }

  /* Horas libres por día para una lista de profesionales. `exclude` = cita propia
     (contrapropuesta: sus bloques no se cuentan como ocupados). */
  async function availabilityFor(b, { service, pros, from, to, mode, now, exclude = null, minLeadMin = b.settings.minLeadMinutes }) {
    const tz = b.timezone;
    const today = wallClock(now, tz).date;
    const lastDay = addDays(today, b.settings.horizonDays);
    if (from < today) from = today;
    if (to > lastDay) to = lastDay;
    const days = [];
    if (from > to || !pros.length) return days;
    const rangeStart = new Date(zonedToUtc(from, '00:00', tz) - 3 * HOUR);
    const rangeEnd = new Date(zonedToUtc(addDays(to, 1), '00:00', tz) + 3 * HOUR);
    const proIds = pros.map((p) => p._id);
    const lockQuery = { professionalId: { $in: proIds }, slotStart: { $gte: rangeStart, $lt: rangeEnd } };
    if (exclude) lockQuery.appointmentId = { $ne: exclude };
    const [locks, offs] = await Promise.all([
      SlotLock.find(lockQuery, { professionalId: 1, slotStart: 1 }).lean(),
      TimeOff.find({ businessId: b._id, professionalId: { $in: proIds }, startsAt: { $lt: rangeEnd }, endsAt: { $gt: rangeStart } }).lean(),
    ]);
    const lockedBy = new Map(pros.map((p) => [String(p._id), new Set()]));
    for (const l of locks) lockedBy.get(String(l.professionalId))?.add(l.slotStart.getTime());
    const closures = (b.closures || []).map((c) => c.date);
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const wd = isoWeekday(date);
      const shopHours = (b.hours || []).filter((h) => h.weekday === wd);
      const merged = new Map();
      for (const p of pros) {
        const slots = daySlots({
          date,
          tz,
          shopHours,
          closures,
          rules: p.rules.filter((r) => r.weekday === wd),
          timeOffs: offs.filter((o) => String(o.professionalId) === String(p._id)),
          locked: lockedBy.get(String(p._id)),
          durationMin: service.durationMin,
          bufferMin: mode === 'home' ? p.homeService?.travelBufferMin ?? 30 : 0,
          now,
          minLeadMin,
          horizonDays: b.settings.horizonDays,
        });
        for (const s of slots) {
          if (!merged.has(s.startsAt)) merged.set(s.startsAt, { startsAt: s.startsAt, label: s.label, professionalIds: [] });
          merged.get(s.startsAt).professionalIds.push(String(p._id));
        }
      }
      days.push({ date, slots: [...merged.values()].sort((a, c) => a.startsAt - c.startsAt).map((s) => ({ ...s, startsAt: new Date(s.startsAt).toISOString() })) });
    }
    return days;
  }

  async function availability({ serviceId, professionalId = 'any', from, to, mode = 'shop', exclude = null, userId = null }) {
    const b = await business();
    const service = await findService(b, serviceId);
    if (!service) throw new HttpError(400, 'invalid_service', 'Ese servicio no existe');
    if (!isDate(from) || !isDate(to) || to < from || addDays(from, 45) < to) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
    if (!['shop', 'home'].includes(mode)) throw new HttpError(400, 'invalid_mode', 'Modo inválido');
    let pros = await professionals(b, { service, mode });
    if (userId) pros = pros.filter((p) => String(p.userId || '') !== String(userId));
    if (professionalId && professionalId !== 'any') pros = pros.filter((p) => String(p._id) === String(professionalId));
    return { timezone: b.timezone, days: await availabilityFor(b, { service, pros, from, to, mode, now: clock(), exclude }) };
  }

  /* Dirección → punto, distancia al local y recargo por profesional (RN-07). */
  async function locate(b, address) {
    const street = String(address?.street ?? '').trim();
    const commune = String(address?.commune ?? '').trim();
    const fields = {};
    if (!street || street.length > 120) fields.street = 'required';
    if (!commune || commune.length > 60) fields.commune = 'required';
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], 'Revisa la dirección', { fields });
    const hit = await geocoder({ street, commune });
    if (!hit) throw new HttpError(422, 'address_not_found', 'No encontramos esa dirección. Revisa calle, número y comuna.');
    const origin = b.location?.coordinates;
    const km = origin ? Math.round(distanceKm(origin, [hit.lng, hit.lat]) * 10) / 10 : 0;
    return { street, commune, details: String(address?.details ?? '').trim().slice(0, 120), formatted: `${street}, ${commune}`, geocoded: hit.formatted, point: { type: 'Point', coordinates: [hit.lng, hit.lat] }, distanceKm: km };
  }

  function outOfRange(km, pros) {
    const p = pros[0];
    const msg =
      pros.length === 1
        ? `Esta dirección está a ${km.toLocaleString('es-CL')} km; ${p.displayName} va hasta ${p.homeService.radiusKm} km. Puedes elegir otro barbero o atenderte en el local.`
        : `Esta dirección está a ${km.toLocaleString('es-CL')} km y ningún barbero llega tan lejos. Puedes atenderte en el local.`;
    return new HttpError(422, 'out_of_range', msg, { distanceKm: km, radiusKm: pros.length === 1 ? p.homeService.radiusKm : Math.max(0, ...pros.map((x) => x.homeService.radiusKm)) });
  }

  async function quoteHome({ serviceId, professionalId = 'any', address }) {
    const b = await business();
    const service = await findService(b, serviceId);
    if (!service) throw new HttpError(400, 'invalid_service', 'Ese servicio no existe');
    let pros = await professionals(b, { service, mode: 'home' });
    if (professionalId !== 'any') pros = pros.filter((p) => String(p._id) === String(professionalId));
    if (!pros.length) throw new HttpError(422, 'no_home_service', 'Este barbero no hace domicilio');
    const loc = await locate(b, address);
    const inRange = pros.filter((p) => loc.distanceKm <= p.homeService.radiusKm);
    if (!inRange.length) throw outOfRange(loc.distanceKm, pros);
    return {
      distanceKm: loc.distanceKm,
      formatted: loc.formatted,
      priceCLP: service.priceCLP,
      professionals: inRange.map((p) => ({ id: String(p._id), surchargeCLP: p.homeService.surchargeCLP, totalCLP: service.priceCLP + p.homeService.surchargeCLP })),
    };
  }

  /* Plazo del barbero para confirmar (RN-11). */
  function confirmDeadline(b, startsAt, now) {
    return Math.min(now + b.settings.confirmWithinMinutes * MIN, startsAt - b.settings.minLeadMinutes * MIN);
  }

  /* SPEC-35 RN-09: una cita pagada en línea que se cae queda para reembolso. Se llama dentro
     de la mutación; devuelve true si la marcó (el aviso al admin va después). */
  function markRefundDue(a) {
    if (a.payment?.method === 'online' && a.payment?.status === 'pagado') {
      a.payment.status = 'reembolso_pendiente';
      return true;
    }
    return false;
  }

  async function alertRefundDue(b, appt, why) {
    await adminInbox?.notify({
      kind: 'refund_due',
      title: `Reembolso pendiente: ${appt.customerSnapshot?.name || 'Cliente'} · $${Number(appt.pricing?.totalCLP || 0).toLocaleString('es-CL')}`,
      body: `${appt.serviceSnapshot?.name || ''} · ${formatLong(appt.startsAt.getTime(), b.timezone)} · ${why}. Reembólsalo desde la ficha de la cita.`,
      appointmentId: appt._id,
      professionalId: appt.professionalId,
      path: 'citas/?pago=reembolso_pendiente',
    });
  }

  /* ─── Crear cita (RN-02…RN-15). Nada de lo que manda el cliente es autoridad. */
  async function create({ user, input }) {
    const now = clock();
    const b = await business();
    if (!user.roles.includes('client')) throw new HttpError(403, 'not_client', 'Para reservar necesitas agregar el perfil de cliente a tu cuenta');

    const idempotencyKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.length <= 80 ? input.idempotencyKey : undefined;
    if (idempotencyKey) {
      const prev = await Appointment.findOne({ customerUserId: user._id, idempotencyKey });
      if (prev) return { appt: prev, replay: true };
    }

    const fields = {};
    const service = await findService(b, input.serviceId);
    if (!service) fields.serviceId = 'invalid_service';
    const startsAt = Date.parse(input.startsAt);
    if (!Number.isFinite(startsAt)) fields.startsAt = 'invalid_start';
    const mode = input.mode === 'home' ? 'home' : 'shop';
    const phone = input.phone !== undefined && String(input.phone).trim() !== '' ? clMobile(input.phone) : user.phoneE164 || null;
    if (!phone) fields.phone = 'invalid_phone';
    const note = String(input.note ?? '').trim();
    if (note.length > MAX_NOTE) fields.note = 'too_long';
    if (input.acceptPolicies !== true) fields.acceptPolicies = 'required';
    const payMethod = input.paymentMethod === undefined ? 'local' : input.paymentMethod;
    const payOpts = paymentOptions(b);
    if (!['local', 'online'].includes(payMethod)) fields.paymentMethod = 'invalid_payment';
    /* SPEC-34 AC-09: una forma de pago deshabilitada por el admin se rechaza aunque el front la mande.
       "En línea" además necesita SPEC-35 (hasta entonces nunca se acepta). */
    else if (payMethod === 'local' && !payOpts.local) fields.paymentMethod = 'payment_unavailable';
    else if (payMethod === 'online' && !payOpts.online) fields.paymentMethod = 'payment_unavailable';
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], 'Revisa los datos', { fields });

    let pros = await professionals(b, { service, mode });
    const wanted = input.professionalId && input.professionalId !== 'any' ? String(input.professionalId) : 'any';
    if (wanted !== 'any') {
      const mine = await Professional.exists({ _id: oid(wanted), userId: user._id });
      if (mine) throw new HttpError(400, 'self_booking', 'No puedes reservar contigo mismo', { fields: { professionalId: 'self_booking' } });
      pros = pros.filter((p) => String(p._id) === wanted);
      if (!pros.length) throw new HttpError(400, 'invalid_professional', 'Ese barbero no está disponible para este servicio', { fields: { professionalId: 'invalid_professional' } });
    } else {
      pros = pros.filter((p) => String(p.userId || '') !== String(user._id));
    }

    if (!pros.length) {
      if (mode === 'home') throw new HttpError(422, 'no_home_service', 'Ningún barbero hace domicilio para este servicio');
      throw new HttpError(409, 'slot_unavailable', 'Esa hora ya no está disponible. Elige otra.');
    }
    let location = { kind: 'shop', travelBufferMin: 0 };
    if (mode === 'home') {
      const loc = await locate(b, input.address);
      const inRange = pros.filter((p) => loc.distanceKm <= p.homeService.radiusKm);
      if (!inRange.length) throw outOfRange(loc.distanceKm, pros);
      pros = inRange;
      location = { kind: 'home', address: { street: loc.street, commune: loc.commune, details: loc.details, formatted: loc.formatted }, point: loc.point, distanceKm: loc.distanceKm };
    }

    /* RN-14 / CB-10: máx. 2 citas activas futuras por cuenta y por celular. */
    const active = await Appointment.countDocuments({
      status: { $in: BLOCKING },
      startsAt: { $gt: new Date(now) },
      $or: [{ customerUserId: user._id }, { 'customerSnapshot.phoneE164': phone }],
    });
    if (active >= b.settings.maxActivePerCustomer) throw new HttpError(409, 'too_many_active', `Ya tienes ${b.settings.maxActivePerCustomer} horas reservadas. Cancela una para tomar otra.`);

    /* Revalida la hora contra la disponibilidad real de ese día (CB-02). */
    const date = wallClock(startsAt, b.timezone).date;
    const [day] = await availabilityFor(b, { service, pros, from: date, to: date, mode, now });
    const slot = day?.slots.find((s) => Date.parse(s.startsAt) === startsAt);
    if (!slot) throw new HttpError(409, 'slot_unavailable', 'Esa hora ya no está disponible. Elige otra.');
    let candidates = pros.filter((p) => slot.professionalIds.includes(String(p._id)));
    if (wanted === 'any' && candidates.length > 1) {
      /* RN-06: el que tenga menos citas ese día; empate: orden de la lista. */
      const dayStart = new Date(zonedToUtc(date, '00:00', b.timezone));
      const dayEnd = new Date(zonedToUtc(addDays(date, 1), '00:00', b.timezone));
      const counts = await Appointment.aggregate([
        { $match: { professionalId: { $in: candidates.map((c) => c._id) }, status: { $in: BLOCKING }, startsAt: { $gte: dayStart, $lt: dayEnd } } },
        { $group: { _id: '$professionalId', n: { $sum: 1 } } },
      ]);
      const n = (p) => counts.find((c) => String(c._id) === String(p._id))?.n ?? 0;
      candidates = candidates.map((p, i) => ({ p, i })).sort((a, c) => n(a.p) - n(c.p) || a.i - c.i).map((x) => x.p);
    }

    const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
    const feeRate = settings?.defaultPlatformFeeRate ?? 0;
    for (const pro of candidates) {
      const buffer = mode === 'home' ? pro.homeService?.travelBufferMin ?? 30 : 0;
      const surcharge = mode === 'home' ? pro.homeService.surchargeCLP : 0;
      const total = service.priceCLP + surcharge;
      const endsAt = startsAt + service.durationMin * MIN;
      /* SPEC-35 RN-03: "Pagar en línea" crea la cita esperando el pago (ocupa la hora 15 min). */
      const online = payMethod === 'online';
      const firstStatus = online ? 'pendiente_pago' : 'pendiente';
      const doc = {
        _id: new ObjectId(),
        businessId: b._id,
        professionalId: pro._id,
        customerUserId: user._id,
        customerSnapshot: { name: user.name, phoneE164: phone, email: user.email },
        serviceSnapshot: { serviceId: service._id, slug: service.slug, name: service.name, priceCLP: service.priceCLP, durationMin: service.durationMin },
        professionalSnapshot: { displayName: pro.displayName, phone: pro.phone },
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        location: { ...location, travelBufferMin: buffer },
        pricing: { priceCLP: service.priceCLP, surchargeCLP: surcharge, totalCLP: total, platformFeeRate: feeRate, platformFeeCLP: Math.round(total * feeRate) },
        payment: online ? { method: 'online', status: 'pendiente', holdStartedAt: new Date(now) } : { method: 'local', status: 'pendiente' },
        note: note || undefined,
        status: firstStatus,
        expiresAt: new Date(online ? now + PAYMENT_HOLD_MIN * MIN : confirmDeadline(b, startsAt, now)),
        history: [{ at: new Date(now), from: null, to: firstStatus, by: 'client', byUserId: user._id }],
        source: 'web',
        idempotencyKey,
      };
      try {
        const appt = await withTransaction(async (session, { transactional }) => {
          try {
            await SlotLock.insertMany(
              slotsFor(startsAt, service.durationMin, buffer).map((t) => ({ businessId: b._id, professionalId: pro._id, slotStart: new Date(t), appointmentId: doc._id, kind: 'main' })),
              { session, ordered: true }
            );
            const [created] = await Appointment.create([doc], { session });
            return created;
          } catch (err) {
            if (!transactional) await SlotLock.deleteMany({ appointmentId: doc._id });
            throw err;
          }
        }, logger);
        if (!user.phoneE164 || user.phoneE164 !== phone) await User.updateOne({ _id: user._id }, { phoneE164: phone });
        await CustomerProfile.updateOne({ businessId: b._id, userId: user._id }, { $inc: { 'counters.appointments': 1 } }, { upsert: true }).catch(() => {});
        /* En línea: los correos de "reserva recibida" salen cuando se aprueba el pago (RN-04). */
        if (online) return { appt, mailOk: true };
        const mail = await Promise.all([notify(b, appt, 'client', 'received'), notify(b, appt, 'barber', 'new')]);
        return { appt, mailOk: mail.every(Boolean) };
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        if (idempotencyKey) {
          const prev = await Appointment.findOne({ customerUserId: user._id, idempotencyKey });
          if (prev) return { appt: prev, replay: true };
        }
        /* Con "Sin preferencia" se prueba el siguiente libre. */
      }
    }
    throw new HttpError(409, 'slot_taken', 'Esa hora se acaba de ocupar. Elige otra.');
  }

  /* ─── Notificaciones (RN-17). No transaccionales: si fallan, la cita sigue. */
  async function notify(b, appt, to, kind, extra = {}) {
    try {
      const tz = b.timezone;
      const pro = await Professional.findById(appt.professionalId).lean();
      /* SPEC-33 RN-16: todo aviso al barbero también queda en la bandeja de su panel. */
      if (to === 'barber' && pro?.userId) {
        await PanelNotification.create({
          userId: pro.userId,
          professionalId: pro._id,
          appointmentId: appt._id,
          kind,
          title: BARBER_EVENT_TITLE[kind] || 'Novedad en tu agenda',
          body: `${appt.customerSnapshot?.name || 'Cliente'} · ${appt.serviceSnapshot?.name || ''} · ${formatLong(appt.startsAt.getTime(), tz)}`,
        }).catch((err) => logger.error('[agenda] bandeja:', err.message));
      }
      let email = null;
      if (to === 'client') {
        email = appt.customerSnapshot?.email || (appt.customerUserId ? (await User.findById(appt.customerUserId).lean())?.email : null);
      } else {
        email = pro?.email || (pro?.userId ? (await User.findById(pro.userId).lean())?.email : null);
      }
      if (!email) return false;
      const when = formatLong(appt.startsAt.getTime(), tz);
      const waUrl =
        to === 'client'
          ? waLink(pro?.phone || b.contact?.whatsapp, `Hola ${pro?.displayName || ''}, te escribo por mi cita del ${when}`)
          : waLink(appt.customerSnapshot?.phoneE164, `Hola ${appt.customerSnapshot?.name || ''}, te escribo por tu cita en WS Style del ${when}`);
      const mail = appointmentMail({
        kind,
        to,
        appt,
        when,
        proposalWhen: appt.proposal?.startsAt ? formatLong(appt.proposal.startsAt.getTime(), tz) : null,
        url: `${frontUrl}/wstyle/cita/?id=${appt._id}`,
        waUrl,
        ...extra,
      });
      const out = await mailer.send({ to: email, ...mail });
      await Notification.create({ businessId: b._id, appointmentId: appt._id, to: email, template: mail.template, status: out.status, error: out.error }).catch(() => {});
      return out.ok;
    } catch (err) {
      logger.error('[agenda] notificación falló:', err.message);
      return false;
    }
  }

  /* ─── Lectura y acceso (RN-16) */
  async function roleFor(user, appt) {
    if (!user) return null;
    if (appt.customerUserId && String(appt.customerUserId) === String(user._id)) return 'client';
    if (await Professional.exists({ _id: appt.professionalId, userId: user._id })) return 'barber';
    if (user.roles.includes('superadmin')) return 'admin';
    return null;
  }

  async function load(id, user, { inv = null } = {}) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para ver tu cita');
    const _id = oid(id);
    let appt = _id ? await Appointment.findById(_id) : null;
    if (!appt) throw notFound();
    /* SPEC-33 RN-12: quien abre el link de una invitación (con su token) y aún no tiene
       dueño queda asociado a la cita. Nunca el propio barbero. */
    if (inv && appt.status === 'invitacion_enviada' && !appt.customerUserId && appt.invite?.token && appt.invite.token === String(inv)) {
      const self = await Professional.exists({ _id: appt.professionalId, userId: user._id });
      if (!self) {
        await Appointment.updateOne(
          { _id: appt._id, customerUserId: null },
          { $set: { customerUserId: user._id, 'customerSnapshot.email': user.email, 'customerSnapshot.name': appt.customerSnapshot?.name || user.name } }
        );
        if (!user.roles.includes('client')) await User.updateOne({ _id: user._id }, { $addToSet: { roles: 'client' } });
        appt = await Appointment.findById(appt._id);
      }
    }
    const role = await roleFor(user, appt);
    /* Otro cliente → 404: no se revela que la cita existe. */
    if (!role) throw notFound();
    return { appt, role };
  }

  function actionsFor(appt, role, b, now) {
    const s = appt.status;
    const a = [];
    const cancellable = !FINAL.includes(s) && s !== 'en_curso';
    if (role === 'client') {
      /* SPEC-35 RN-05: mientras dure la retención, reintentar el pago o pasar a pagar en el local. */
      if (s === 'pendiente_pago' && appt.expiresAt?.getTime() > now && ['pendiente', 'rechazado'].includes(appt.payment?.status)) {
        const opts = paymentOptions(b);
        if (opts.online) a.push('pay');
        if (opts.local) a.push('pay_local');
      }
      if (cancellable && appt.startsAt.getTime() - now >= b.settings.cancelUntilMinutes * MIN) a.push('cancel');
      if (s === 'propuesta_cambio' && appt.proposal?.expiresAt?.getTime() > now) a.push('accept', 'counter');
      if (s === 'invitacion_enviada') a.push('confirm');
    } else if (role === 'barber' || role === 'admin') {
      if (s === 'pendiente') a.push('confirm', 'reject');
      if (s === 'pendiente' || s === 'confirmada') a.push('propose');
      if (s === 'invitacion_enviada') a.push('reschedule');
      if (s === 'confirmada' && now >= appt.startsAt.getTime() - START_WINDOW_MIN * MIN) a.push('start');
      if (s === 'en_curso') a.push('finish');
      if (s === 'confirmada' && now >= appt.startsAt.getTime() + START_WINDOW_MIN * MIN) a.push('no_show');
      if (cancellable) a.push('cancel');
    }
    return a;
  }

  async function serialize(appt, role, b, now) {
    const pro = await Professional.findById(appt.professionalId).lean();
    const tz = b.timezone;
    const p = appt.proposal?.startsAt ? appt.proposal : null;
    const out = {
      id: String(appt._id),
      status: appt.status,
      statusLabel: STATUS_LABEL[appt.status],
      service: { id: appt.serviceSnapshot.slug, name: appt.serviceSnapshot.name, durationMin: appt.serviceSnapshot.durationMin },
      professional: { id: String(appt.professionalId), name: appt.professionalSnapshot?.displayName || pro?.displayName || '' },
      customer: role === 'client' ? undefined : { name: appt.customerSnapshot?.name, phone: appt.customerSnapshot?.phoneE164 },
      startsAt: appt.startsAt.toISOString(),
      endsAt: appt.endsAt.toISOString(),
      when: formatLong(appt.startsAt.getTime(), tz),
      timezone: tz,
      location: { kind: appt.location?.kind || 'shop', address: appt.location?.kind === 'home' ? appt.location.address?.formatted : [b.address?.street, b.address?.city].filter(Boolean).join(', '), distanceKm: appt.location?.distanceKm },
      pricing: { priceCLP: appt.pricing.priceCLP, surchargeCLP: appt.pricing.surchargeCLP, totalCLP: appt.pricing.totalCLP },
      payment: paymentView(appt),
      note: appt.note || '',
      proposal: p ? { startsAt: p.startsAt.toISOString(), when: formatLong(p.startsAt.getTime(), tz), expiresAt: p.expiresAt?.toISOString() } : null,
      actions: actionsFor(appt, role, b, now),
      role,
      whatsapp:
        role === 'client'
          ? waLink(pro?.phone || b.contact?.whatsapp, `Hola ${pro?.displayName || ''}, te escribo por mi cita del ${formatLong(appt.startsAt.getTime(), tz)}`)
          : waLink(appt.customerSnapshot?.phoneE164, `Hola ${appt.customerSnapshot?.name || ''}, te escribo por tu cita en WS Style`),
      shopWhatsapp: waLink(b.contact?.whatsapp, 'Hola, te escribo por mi cita'),
      history: appt.history.map((h) => ({ at: h.at.toISOString(), from: h.from, to: h.to, by: h.by, reason: h.reason })),
    };
    if (role === 'barber' || role === 'admin') Object.assign(out, proExtras(appt, b));
    return out;
  }

  /* SPEC-35: el pago hacia afuera (sin campos internos como el bloqueo de reembolso). */
  function paymentView(appt) {
    const p = appt.payment || {};
    const out = { method: p.method || 'local', status: p.status || 'pendiente' };
    if (p.collectedAt) out.collectedAt = p.collectedAt.toISOString();
    if (out.method === 'online') {
      if (appt.status === 'pendiente_pago' && appt.expiresAt) out.holdUntil = appt.expiresAt.toISOString();
      if (p.paidAt) out.paidAt = p.paidAt.toISOString();
      if (p.refundedAt) out.refundedAt = p.refundedAt.toISOString();
    }
    return out;
  }

  /* SPEC-33 RN-14/RN-15: lo que el barbero necesita para atender (nunca el email del cliente). */
  function proExtras(appt, b) {
    const home = appt.location?.kind === 'home';
    const coords = appt.location?.point?.coordinates;
    const hasCoords = Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite);
    const destination = hasCoords ? `${coords[1]},${coords[0]}` : encodeURIComponent(appt.location?.address?.formatted || '');
    const phone = appt.customerSnapshot?.phoneE164;
    return {
      mapsUrl: home && (hasCoords || appt.location?.address?.formatted) ? `https://www.google.com/maps/dir/?api=1&destination=${destination}` : null,
      telUrl: phone ? `tel:${phone}` : null,
      startOpensAt: new Date(appt.startsAt.getTime() - START_WINDOW_MIN * MIN).toISOString(),
      noShowOpensAt: new Date(appt.startsAt.getTime() + START_WINDOW_MIN * MIN).toISOString(),
      source: appt.source,
      invite: appt.status === 'invitacion_enviada' && appt.invite?.token ? inviteLinks(appt, b) : null,
      expiresAt: appt.expiresAt ? appt.expiresAt.toISOString() : null,
    };
  }

  /* RN-12: "Hola <nombre>, te agendé <servicio> el <día> a las <hh:mm> en WS Style. Confírmala aquí: <link>" */
  function inviteLinks(appt, b) {
    const url = `${frontUrl}/wstyle/cita/?id=${appt._id}&inv=${appt.invite.token}`;
    const w = wallClock(appt.startsAt.getTime(), b.timezone);
    const day = new Intl.DateTimeFormat('es-CL', { timeZone: b.timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(appt.startsAt).replace(',', '');
    const text = `Hola ${appt.customerSnapshot?.name || ''}, te agendé ${appt.serviceSnapshot.name} el ${day} a las ${w.time} en ${b.name || 'WS Style'}. Confírmala aquí: ${url}`;
    return { url, text, whatsappUrl: waLink(appt.customerSnapshot?.phoneE164, text) };
  }

  async function view(id, user, opts = {}) {
    const b = await business();
    const { appt, role } = await load(id, user, opts);
    return serialize(appt, role, b, clock());
  }

  async function mine(user) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    const b = await business();
    const now = clock();
    const list = await Appointment.find({ businessId: b._id, customerUserId: user._id }).sort({ startsAt: -1 }).limit(100);
    const items = await Promise.all(list.map((a) => serialize(a, 'client', b, now)));
    const upcoming = items.filter((a) => Date.parse(a.endsAt) > now && !FINAL.includes(a.status)).reverse();
    const past = items.filter((a) => !upcoming.includes(a));
    return { upcoming, past };
  }

  /* ─── Transiciones (RN-10…RN-13). Todo cambio de estado + bloques va en una transacción. */
  async function lockMain(b, appt, startMs, session) {
    const locks = slotsFor(startMs, appt.serviceSnapshot.durationMin, appt.location?.travelBufferMin || 0).map((t) => ({
      businessId: b._id,
      professionalId: appt.professionalId,
      slotStart: new Date(t),
      appointmentId: appt._id,
      kind: 'main',
    }));
    await SlotLock.insertMany(locks, { session, ordered: true });
  }

  async function assertFree(b, appt, startMs, now) {
    const service = await Service.findById(appt.serviceSnapshot.serviceId).lean();
    const pros = (await professionals(b, { mode: appt.location?.kind === 'home' ? 'home' : 'shop' })).filter((p) => String(p._id) === String(appt.professionalId));
    const date = wallClock(startMs, b.timezone).date;
    const svc = { ...(service || {}), durationMin: appt.serviceSnapshot.durationMin };
    const [day] = await availabilityFor(b, { service: svc, pros, from: date, to: date, mode: appt.location?.kind === 'home' ? 'home' : 'shop', now, exclude: appt._id });
    if (!day?.slots.some((s) => Date.parse(s.startsAt) === startMs)) throw new HttpError(409, 'slot_unavailable', 'Esa hora ya no está disponible. Elige otra.');
  }

  /* Aplica `fn` a la cita dentro de una transacción y registra el historial. */
  async function mutate(b, apptId, fn) {
    try {
      return await withTransaction(async (session) => {
        const appt = await Appointment.findById(apptId).session(session);
        if (!appt) throw notFound();
        const from = appt.status;
        const entry = await fn(appt, session);
        appt.history.push({ at: new Date(clock()), from, to: appt.status, ...entry });
        await appt.save({ session });
        return appt;
      }, logger);
    } catch (err) {
      if (err?.name === 'VersionError') throw invalid('stale');
      if (isDuplicateKey(err)) throw new HttpError(409, 'slot_taken', 'Esa hora se acaba de ocupar. Elige otra.');
      throw err;
    }
  }

  const ACTOR_CAN = {
    client: ['cancel', 'accept', 'counter', 'confirm'],
    barber: ['confirm', 'reject', 'propose', 'start', 'finish', 'no_show', 'cancel'],
    admin: ['confirm', 'reject', 'propose', 'start', 'finish', 'no_show', 'cancel'],
  };

  async function act(id, user, action, payload = {}) {
    const b = await business();
    const { appt: current, role } = await load(id, user);
    return actAs(b, current, role, action, payload, user);
  }

  /* SPEC-33 RN-09: motivo de la lista; "Otro" exige texto. El cliente sigue con texto libre (SPEC-32). */
  function barberReason(payload) {
    const code = String(payload.reasonCode ?? '');
    const text = String(payload.reasonText ?? '').trim().slice(0, 300);
    if (!CANCEL_REASONS[code] || (code === 'otro' && !text)) {
      throw new HttpError(400, 'reason_required', 'Elige un motivo', { fields: { reason: code === 'otro' ? 'reason_text_required' : 'reason_required' } });
    }
    return text ? `${CANCEL_REASONS[code]}: ${text}` : CANCEL_REASONS[code];
  }

  /* Exportado para tests y para SPEC-33 (helper de barbero): `role` ya resuelto. */
  async function actAs(b, current, role, action, payload = {}, user = null) {
    const now = clock();
    if (!ACTOR_CAN[role]?.includes(action)) throw invalid('forbidden_action');
    if (FINAL.includes(current.status)) throw invalid('final_state');
    const by = role;
    const byUserId = user?._id;
    if (action === 'reject') {
      if (current.status !== 'pendiente') throw invalid('bad_state');
      action = 'cancel';
    }
    let reason = String(payload.reason ?? '').trim().slice(0, 300) || undefined;
    if (action === 'cancel' && role === 'barber') reason = barberReason(payload);
    const minLead = b.settings.minLeadMinutes * MIN;
    let after = [];

    if (action === 'confirm') {
      const ok = role === 'client' ? current.status === 'invitacion_enviada' : current.status === 'pendiente';
      if (!ok) throw invalid('bad_state');
      const appt = await mutate(b, current._id, (a) => {
        if (a.status !== current.status) throw invalid('stale');
        a.status = 'confirmada';
        a.expiresAt = undefined;
        return { by, byUserId };
      });
      after = [[appt, 'client', 'confirmed']];
      if (current.status === 'invitacion_enviada') after.push([appt, 'barber', 'invite_confirmed']);
      await Promise.all(after.map(([a, to, kind]) => notify(b, a, to, kind)));
      return serialize(appt, role, b, now);
    }

    if (action === 'propose') {
      if (!['pendiente', 'confirmada'].includes(current.status)) throw invalid('bad_state');
      const startMs = Date.parse(payload.startsAt);
      if (!Number.isFinite(startMs)) throw new HttpError(400, 'invalid_start', 'Hora inválida');
      await assertFree(b, current, startMs, now);
      const appt = await mutate(b, current._id, async (a, session) => {
        if (a.status !== current.status) throw invalid('stale');
        const own = new Set((await SlotLock.find({ appointmentId: a._id }).session(session).lean()).map((l) => l.slotStart.getTime()));
        const extra = slotsFor(startMs, a.serviceSnapshot.durationMin, a.location?.travelBufferMin || 0).filter((t) => !own.has(t));
        if (extra.length) {
          await SlotLock.insertMany(
            extra.map((t) => ({ businessId: b._id, professionalId: a.professionalId, slotStart: new Date(t), appointmentId: a._id, kind: 'proposal' })),
            { session, ordered: true }
          );
        }
        a.proposal = {
          startsAt: new Date(startMs),
          endsAt: new Date(startMs + a.serviceSnapshot.durationMin * MIN),
          by,
          fromStatus: a.status,
          expiresAt: new Date(Math.min(now + b.settings.confirmWithinMinutes * MIN, a.startsAt.getTime() - minLead)),
          createdAt: new Date(now),
        };
        a.status = 'propuesta_cambio';
        return { by, byUserId, reason };
      });
      await notify(b, appt, 'client', 'proposal');
      return serialize(appt, role, b, now);
    }

    if (action === 'accept') {
      if (current.status !== 'propuesta_cambio') throw invalid('bad_state');
      if (!(current.proposal?.expiresAt?.getTime() > now)) throw invalid('proposal_expired', 'La propuesta ya caducó. Recarga para ver el estado actual.');
      const appt = await mutate(b, current._id, async (a, session) => {
        if (a.status !== 'propuesta_cambio') throw invalid('stale');
        const start = a.proposal.startsAt.getTime();
        await SlotLock.deleteMany({ appointmentId: a._id }, { session });
        await lockMain(b, a, start, session);
        a.startsAt = a.proposal.startsAt;
        a.endsAt = a.proposal.endsAt;
        a.proposal = undefined;
        a.status = 'confirmada';
        a.expiresAt = undefined;
        return { by, byUserId };
      });
      await Promise.all([notify(b, appt, 'client', 'change_accepted'), notify(b, appt, 'barber', 'client_accepted')]);
      return serialize(appt, role, b, now);
    }

    if (action === 'counter') {
      if (current.status !== 'propuesta_cambio') throw invalid('bad_state');
      const startMs = Date.parse(payload.startsAt);
      if (!Number.isFinite(startMs)) throw new HttpError(400, 'invalid_start', 'Hora inválida');
      await assertFree(b, current, startMs, now);
      const appt = await mutate(b, current._id, async (a, session) => {
        if (a.status !== 'propuesta_cambio') throw invalid('stale');
        await SlotLock.deleteMany({ appointmentId: a._id }, { session });
        await lockMain(b, a, startMs, session);
        a.startsAt = new Date(startMs);
        a.endsAt = new Date(startMs + a.serviceSnapshot.durationMin * MIN);
        a.proposal = undefined;
        a.status = 'pendiente';
        a.expiresAt = new Date(Math.min(now + b.settings.confirmWithinMinutes * MIN, startMs - minLead));
        return { by, byUserId, reason };
      });
      await notify(b, appt, 'barber', 'client_countered');
      return serialize(appt, role, b, now);
    }

    if (action === 'cancel') {
      if (current.status === 'en_curso') throw invalid('bad_state');
      if (role === 'client' && current.startsAt.getTime() - now < b.settings.cancelUntilMinutes * MIN) {
        throw invalid('too_late', 'Ya no se puede cancelar en línea');
      }
      const appt = await mutate(b, current._id, async (a, session) => {
        if (a.status !== current.status) throw invalid('stale');
        await SlotLock.deleteMany({ appointmentId: a._id }, { session });
        a.status = 'cancelada';
        a.proposal = undefined;
        a.expiresAt = undefined;
        /* SPEC-35 RN-09: pagada en línea → queda marcada para reembolso. */
        markRefundDue(a);
        return { by, byUserId, reason };
      });
      const who = { client: 'el cliente', barber: appt.professionalSnapshot?.displayName || 'el barbero', admin: 'WS Style' }[role];
      const jobs = [notify(b, appt, 'client', 'cancelled', { cancelledBy: who, reason })];
      if (appt.payment?.status === 'reembolso_pendiente' && current.payment?.status === 'pagado') jobs.push(alertRefundDue(b, appt, `Cancelada por ${who}`));
      if (role === 'client') jobs.push(notify(b, appt, 'barber', 'client_cancelled', { reason }));
      if (role === 'admin') jobs.push(notify(b, appt, 'barber', 'admin_cancelled', { reason }));
      /* SPEC-34 RN-10: el super admin se entera de las cancelaciones del barbero. */
      if (role === 'barber' && adminInbox) {
        jobs.push(adminInbox.notify({
          kind: 'barber_cancelled',
          title: `${who} canceló una cita`,
          body: `${appt.customerSnapshot?.name || 'Cliente'} · ${appt.serviceSnapshot?.name || ''} · ${formatLong(appt.startsAt.getTime(), b.timezone)}${reason ? ` · Motivo: ${reason}` : ''}`,
          appointmentId: appt._id,
          professionalId: appt.professionalId,
          path: 'citas/',
        }));
      }
      await Promise.all(jobs);
      return serialize(appt, role, b, now);
    }

    if (action === 'start' || action === 'finish' || action === 'no_show') {
      const need = action === 'finish' ? 'en_curso' : 'confirmada';
      if (current.status !== need) throw invalid('bad_state');
      if (action === 'no_show' && now < current.startsAt.getTime() + START_WINDOW_MIN * MIN) throw invalid('too_early', 'Aún no pasa la hora de inicio + 15 min');
      if (action === 'start' && now < current.startsAt.getTime() - START_WINDOW_MIN * MIN) throw invalid('too_early', 'Puedes iniciar desde 15 minutos antes de la hora');
      /* SPEC-33 RN-10: al terminar una cita con pago en el local se registra si se cobró. */
      const localPay = (current.payment?.method || 'local') === 'local';
      if (action === 'finish' && role === 'barber' && localPay && typeof payload.collected !== 'boolean') {
        throw new HttpError(400, 'collected_required', '¿Cobraste la cita?', { fields: { collected: 'required' } });
      }
      const to = { start: 'en_curso', finish: 'terminada', no_show: 'no_asistio' }[action];
      const appt = await mutate(b, current._id, (a) => {
        if (a.status !== need) throw invalid('stale');
        a.status = to;
        if (action === 'finish' && localPay && typeof payload.collected === 'boolean') {
          a.payment.status = payload.collected ? 'cobrado' : 'pago_pendiente';
          if (payload.collected) a.payment.collectedAt = new Date(now);
        }
        return { by, byUserId, reason: reason ?? (action === 'finish' && typeof payload.collected === 'boolean' ? (payload.collected ? 'Cobrado' : 'Sin cobrar') : undefined) };
      });
      if (to === 'terminada') await notify(b, appt, 'client', 'finished');
      if (to === 'no_asistio') await notify(b, appt, 'client', 'no_show');
      if (to === 'no_asistio' && appt.customerUserId) {
        await CustomerProfile.updateOne({ businessId: b._id, userId: appt.customerUserId }, { $inc: { 'counters.noShows': 1 } }, { upsert: true }).catch(() => {});
      }
      return serialize(appt, role, b, now);
    }
    throw invalid('unknown_action');
  }

  /* SPEC-35 RN-05: "Cambiar a pagar en el local" mientras la cita espera el pago (y no hay un
     pago en proceso). Pasa a `pendiente` como cualquier reserva y salen sus correos. */
  async function payLocal(id, user) {
    const b = await business();
    const { appt: current, role } = await load(id, user);
    const now = clock();
    if (role !== 'client') throw notFound();
    if (!paymentOptions(b).local) throw invalid('payment_unavailable', 'El pago en el local no está disponible.');
    const ok = (a) => a.status === 'pendiente_pago' && ['pendiente', 'rechazado'].includes(a.payment?.status) && a.expiresAt?.getTime() > now;
    if (!ok(current)) {
      if (current.payment?.status === 'en_proceso') throw invalid('payment_in_process', 'Tu pago está en proceso. Espera la respuesta de Mercado Pago.');
      throw invalid('bad_state');
    }
    const appt = await mutate(b, current._id, (a) => {
      if (!ok(a)) throw invalid('stale');
      a.status = 'pendiente';
      a.payment.method = 'local';
      a.payment.status = 'pendiente';
      a.expiresAt = new Date(confirmDeadline(b, a.startsAt.getTime(), now));
      return { by: 'client', byUserId: user._id, reason: 'Cambió a pagar en el local' };
    });
    await Promise.all([notify(b, appt, 'client', 'received'), notify(b, appt, 'barber', 'new')]);
    return serialize(appt, role, b, now);
  }

  /* ─── Expiración (RN-11, RN-12). index.js la corre cada minuto; los tests la
     llaman con el reloj inyectado. */
  async function runExpirations() {
    const now = clock();
    const b = await business();
    let expired = 0;
    let lapsed = 0;
    const pend = await Appointment.find({ businessId: b._id, status: 'pendiente', expiresAt: { $lte: new Date(now) } });
    for (const p of pend) {
      try {
        const appt = await mutate(b, p._id, async (a, session) => {
          if (a.status !== 'pendiente') throw invalid('stale');
          await SlotLock.deleteMany({ appointmentId: a._id }, { session });
          a.status = 'expirada';
          markRefundDue(a);
          return { by: 'system', reason: 'Sin confirmación del barbero a tiempo' };
        });
        expired++;
        await notify(b, appt, 'client', 'expired');
        if (appt.payment?.status === 'reembolso_pendiente' && p.payment?.status === 'pagado') await alertRefundDue(b, appt, 'Expiró sin confirmación del barbero');
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error('[agenda] expirar:', err.message);
      }
    }
    /* SPEC-33 RN-12: invitaciones sin confirmar (24 h o 2 h antes del inicio). */
    const invs = await Appointment.find({ businessId: b._id, status: 'invitacion_enviada', expiresAt: { $lte: new Date(now) } });
    for (const p of invs) {
      try {
        const appt = await mutate(b, p._id, async (a, session) => {
          if (a.status !== 'invitacion_enviada') throw invalid('stale');
          await SlotLock.deleteMany({ appointmentId: a._id }, { session });
          a.status = 'expirada';
          return { by: 'system', reason: 'El cliente no confirmó la invitación a tiempo' };
        });
        expired++;
        await notify(b, appt, 'barber', 'invite_expired');
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error('[agenda] expirar invitación:', err.message);
      }
    }
    const props = await Appointment.find({ businessId: b._id, status: 'propuesta_cambio', 'proposal.expiresAt': { $lte: new Date(now) } });
    for (const p of props) {
      try {
        const appt = await mutate(b, p._id, async (a, session) => {
          if (a.status !== 'propuesta_cambio') throw invalid('stale');
          if (a.proposal?.fromStatus === 'confirmada') {
            await SlotLock.deleteMany({ appointmentId: a._id, kind: 'proposal' }, { session });
            a.status = 'confirmada';
          } else {
            await SlotLock.deleteMany({ appointmentId: a._id }, { session });
            a.status = 'expirada';
          }
          a.proposal = undefined;
          return { by: 'system', reason: 'La propuesta de cambio caducó sin respuesta' };
        });
        lapsed++;
        if (appt.status === 'expirada') await notify(b, appt, 'client', 'expired');
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error('[agenda] caducar propuesta:', err.message);
      }
    }
    return { expired, lapsed };
  }

  /* RN-26: al eliminar la cuenta se cancelan las futuras y se anonimizan las pasadas. */
  async function onAccountDeleted(user) {
    const b = await Business.findOne({ slug: businessSlug }).lean();
    const now = clock();
    const future = await Appointment.find({ customerUserId: user._id, status: { $nin: FINAL }, startsAt: { $gt: new Date(now) } });
    for (const a of future) {
      if (!b) break;
      await mutate(b, a._id, async (x, session) => {
        await SlotLock.deleteMany({ appointmentId: x._id }, { session });
        x.status = 'cancelada';
        x.proposal = undefined;
        if (markRefundDue(x)) alertRefundDue(b, x, 'El cliente eliminó su cuenta').catch(() => {});
        return { by: 'client', byUserId: user._id, reason: 'Cuenta eliminada' };
      }).catch((err) => logger.error('[agenda] cancelar por cuenta eliminada:', err.message));
    }
    await Appointment.updateMany({ customerUserId: user._id }, { $set: { 'customerSnapshot.name': 'Cliente eliminado', 'customerSnapshot.phoneE164': null, 'customerSnapshot.email': null } });
  }

  return {
    business,
    catalog,
    availability,
    quoteHome,
    create,
    view,
    mine,
    act,
    actAs,
    load,
    paymentOptions,
    payLocal,
    confirmDeadline,
    markRefundDue,
    alertRefundDue,
    runExpirations,
    onAccountDeleted,
    serialize,
    /* SPEC-33 (panel del barbero) */
    professionals,
    availabilityFor,
    findService,
    locate,
    notify,
    mutate,
    inviteLinks,
  };
}
