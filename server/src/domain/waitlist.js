/* Lista de espera de días llenos (SPEC-54). El cliente se anota en un día sin horas; cuando una
   cita libera su hora (agenda.hooks.released) se avisa a los 3 primeros compatibles con un link
   "Tomar esta hora". Avisar NO reserva (RN-04): el primero que crea la cita por el flujo normal
   se la queda (índice único de SlotLock). */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Appointment, BLOCKING, CustomerProfile, Notification, PanelNotification, Professional, Service, WaitlistEntry } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/db.js';
import { waLink, waitlistEndedMail, waitlistSlotMail } from '../lib/emails.js';
import { addDays, isDate, wallClock, zonedToUtc } from './time.js';

const MIN = 60 * 1000;
const { ObjectId } = mongoose.Types;

/* Reglas de negocio (RN-02, RN-03, RN-06, RN-07). */
export const WAITLIST = {
  maxActivePerCustomer: 3,
  maxPerDay: 30,
  maxNoShows: 2,
  notifyBatch: 3,
  renotifyAfterMin: 30,
  maxAutoNotices: 3,
  leadMin: 30,
  afternoonFrom: '14:00',
};

export const PREF_LABEL = { all: 'Todo el día', am: 'Mañana (antes de 14:00)', pm: 'Tarde (desde 14:00)' };
export const WAIT_STATUS_LABEL = { waiting: 'Esperando', notified: 'Te avisamos', booked: 'Tomaste la hora', ended: 'Terminó', removed: 'Saliste de la lista' };

const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const notFound = () => new HttpError(404, 'not_found', 'No encontramos esa entrada de la lista de espera');

/* "sábado 21 de noviembre" para una fecha de calendario. */
export function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d, 12))).replace(',', '');
}

/* RN-03: la hora entra en la preferencia horaria (hora de reloj local). */
export const fitsPref = (pref, label) => pref === 'am' ? label < WAITLIST.afternoonFrom : pref === 'pm' ? label >= WAITLIST.afternoonFrom : true;

export function createWaitlist({ agenda, pro: proDomain, admin: adminDomain, clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173', adminInbox = null }) {
  const today = (b) => wallClock(clock(), b.timezone).date;
  const linkFor = (token) => `${frontUrl}/wstyle/reservar/?espera=${encodeURIComponent(token)}`;

  /* Una entrada vigente: activa y de hoy en adelante (al cerrar el día "Terminó", aunque el barrido no haya pasado). */
  const isLive = (e, b) => e.active && e.date >= today(b);
  const statusOf = (e, b) => (e.active && e.date < today(b) ? 'ended' : e.status);

  async function names(b, entries) {
    const serviceIds = [...new Set(entries.map((e) => String(e.serviceId)))];
    const proIds = [...new Set(entries.filter((e) => e.professionalId).map((e) => String(e.professionalId)))];
    const [services, pros] = await Promise.all([
      Service.find({ _id: { $in: serviceIds } }, { slug: 1, name: 1 }).lean(),
      Professional.find({ _id: { $in: proIds } }, { displayName: 1 }).lean(),
    ]);
    return { svc: new Map(services.map((s) => [String(s._id), s])), pro: new Map(pros.map((p) => [String(p._id), p])) };
  }

  /* Vista del cliente (solo lo suyo; nunca su posición ni a los demás: RN-09, asunción 5). */
  function clientView(e, b, n) {
    const st = statusOf(e, b);
    const s = n.svc.get(String(e.serviceId));
    return {
      id: String(e._id),
      date: e.date,
      service: { id: s?.slug || '', name: s?.name || 'Servicio' },
      professional: { id: e.professionalId ? String(e.professionalId) : null, name: e.professionalId ? n.pro.get(String(e.professionalId))?.displayName || 'Barbero' : 'Cualquiera' },
      pref: e.pref,
      status: st,
      statusLabel: WAIT_STATUS_LABEL[st],
      createdAt: e.createdAt.toISOString(),
      notifiedAt: e.lastNotifiedAt ? e.lastNotifiedAt.toISOString() : null,
    };
  }

  /* Vista del barbero / admin: nombre, servicio y preferencia. El teléfono no sale (RN-09): solo el botón [Avisarle]. */
  function staffView(e, b, n) {
    const st = statusOf(e, b);
    return {
      id: String(e._id),
      name: e.customerSnapshot?.name || 'Cliente',
      service: n.svc.get(String(e.serviceId))?.name || 'Servicio',
      professional: e.professionalId ? n.pro.get(String(e.professionalId))?.displayName || 'Barbero' : 'Cualquiera',
      pref: e.pref,
      createdAt: e.createdAt.toISOString(),
      status: st,
      statusLabel: WAIT_STATUS_LABEL[st],
      notifiedAt: e.lastNotifiedAt ? e.lastNotifiedAt.toISOString() : null,
    };
  }

  function requireClient(user) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    if (!user.roles.includes('client')) throw new HttpError(403, 'not_client', 'Para anotarte necesitas el perfil de cliente en tu cuenta');
    return user;
  }

  /* Profesionales reservables para un servicio (sin el propio cliente si también es barbero). */
  async function prosFor(b, service, user, professionalId) {
    let pros = await agenda.professionals(b, { service, mode: 'shop' });
    if (user) pros = pros.filter((p) => String(p.userId || '') !== String(user._id));
    if (professionalId) pros = pros.filter((p) => String(p._id) === String(professionalId));
    return pros;
  }

  /* ─── Anotarse (Alcance 2, RN-01, RN-02, CB-10) */
  async function join(user, body = {}) {
    requireClient(user);
    const b = await agenda.business();
    if (!agenda.waitlistOn(b)) throw new HttpError(409, 'waitlist_off', 'La lista de espera no está activa.');
    if (!user.phoneE164) throw new HttpError(400, 'phone_required', 'Para anotarte necesitamos tu celular. Agrégalo en tu cuenta.', { fields: { phone: 'invalid_phone' } });
    const date = String(body.date ?? '');
    const pref = body.pref === undefined ? 'all' : body.pref;
    const fields = {};
    if (!isDate(date)) fields.date = 'invalid_date';
    if (!['all', 'am', 'pm'].includes(pref)) fields.pref = 'invalid';
    const service = await agenda.findService(b, String(body.serviceId ?? ''));
    if (!service) fields.serviceId = 'invalid_service';
    const wanted = body.professionalId && body.professionalId !== 'any' ? String(body.professionalId) : null;
    if (wanted && !oid(wanted)) fields.professionalId = 'invalid_professional';
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], 'Revisa los datos', { fields });
    const t = today(b);
    if (date < t || date > addDays(t, b.settings.horizonDays)) throw new HttpError(400, 'invalid_date', 'Ese día no está dentro de la agenda', { fields: { date: 'invalid_date' } });
    const pros = await prosFor(b, service, user, wanted);
    if (!pros.length) throw new HttpError(400, 'invalid_professional', 'Ese barbero no está disponible para este servicio', { fields: { professionalId: 'invalid_professional' } });

    const profile = await CustomerProfile.findOne({ businessId: b._id, userId: user._id }).lean();
    if ((profile?.counters?.noShows ?? 0) >= WAITLIST.maxNoShows) throw new HttpError(403, 'no_shows', 'Para anotarte en la lista de espera escríbenos por WhatsApp.');
    if (await WaitlistEntry.exists({ businessId: b._id, customerUserId: user._id, date, active: true })) throw new HttpError(409, 'already_on_list', 'Ya estás en la lista de espera de este día.');
    const mine = await WaitlistEntry.countDocuments({ businessId: b._id, customerUserId: user._id, active: true, date: { $gte: t } });
    if (mine >= WAITLIST.maxActivePerCustomer) throw new HttpError(409, 'too_many_entries', `Puedes estar en hasta ${WAITLIST.maxActivePerCustomer} listas de espera a la vez. Sal de una para anotarte en otra.`);
    const dayStart = new Date(zonedToUtc(date, '00:00', b.timezone));
    const dayEnd = new Date(zonedToUtc(addDays(date, 1), '00:00', b.timezone));
    if (await Appointment.exists({ businessId: b._id, customerUserId: user._id, status: { $in: BLOCKING }, startsAt: { $gte: dayStart, $lt: dayEnd } })) {
      throw new HttpError(409, 'has_appointment', 'Ya tienes una hora reservada ese día.');
    }
    if ((await WaitlistEntry.countDocuments({ businessId: b._id, date, active: true })) >= WAITLIST.maxPerDay) throw new HttpError(409, 'day_list_full', 'La lista de este día está completa.');

    /* CB-10: si mientras miraba la tarjeta se liberó una hora, se le ofrecen las horas en vez de anotarlo. */
    const [day] = await agenda.availabilityFor(b, { service, pros, from: date, to: date, mode: 'shop', now: clock() });
    if (day?.slots.length) throw new HttpError(409, 'slots_available', 'Se acaba de liberar una hora. Elígela y reserva.', { slots: day.slots });
    if (!day?.full) throw new HttpError(409, 'day_closed', 'Ese día no hay atención.');

    try {
      const e = await WaitlistEntry.create({
        businessId: b._id,
        customerUserId: user._id,
        customerSnapshot: { name: user.name, phoneE164: user.phoneE164, email: user.email },
        date,
        serviceId: service._id,
        professionalId: wanted ? oid(wanted) : null,
        pref,
        token: crypto.randomBytes(24).toString('base64url'),
      });
      return { entry: clientView(e, b, await names(b, [e])) };
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'already_on_list', 'Ya estás en la lista de espera de este día.');
      throw err;
    }
  }

  async function mine(user) {
    requireClient(user);
    const b = await agenda.business();
    const list = await WaitlistEntry.find({ businessId: b._id, customerUserId: user._id, status: { $ne: 'removed' }, date: { $gte: addDays(today(b), -7) } }).sort({ date: 1, createdAt: 1 }).limit(30).lean();
    const n = await names(b, list);
    return { entries: list.map((e) => clientView(e, b, n)) };
  }

  async function leave(user, id) {
    requireClient(user);
    const b = await agenda.business();
    const _id = oid(id);
    const e = _id ? await WaitlistEntry.findOne({ _id, businessId: b._id, customerUserId: user._id }) : null;
    if (!e) throw notFound();
    if (e.active) await WaitlistEntry.updateOne({ _id: e._id, active: true }, { $set: { status: 'removed', active: false, endedAt: new Date(clock()), endedReason: 'Salió de la lista' } });
    return { ok: true };
  }

  /* ─── Token "Tomar esta hora" (RN-05) */
  async function byToken(b, user, token) {
    requireClient(user);
    const e = token ? await WaitlistEntry.findOne({ token: String(token).slice(0, 100), businessId: b._id }) : null;
    if (!e) throw new HttpError(404, 'not_found', 'Este link no es válido.');
    if (String(e.customerUserId) !== String(user._id)) throw new HttpError(403, 'not_yours', 'Este aviso es para otra cuenta. Entra con la cuenta que se anotó en la lista.');
    if (!agenda.waitlistOn(b)) throw new HttpError(409, 'waitlist_off', 'La lista de espera no está activa.');
    if (!isLive(e, b)) throw new HttpError(410, 'expired', 'Este aviso ya venció. Si quieres, reserva otra hora.');
    return e;
  }

  /* Horas compatibles con la entrada: su servicio, su barbero (o cualquiera), su preferencia y 30 min de anticipación. */
  async function compatibleSlots(b, e, user) {
    const service = await Service.findOne({ _id: e.serviceId, businessId: b._id, active: true }).lean();
    if (!service) return { service: null, slots: [] };
    const pros = await prosFor(b, service, user, e.professionalId);
    const [day] = pros.length ? await agenda.availabilityFor(b, { service, pros, from: e.date, to: e.date, mode: 'shop', now: clock(), minLeadMin: WAITLIST.leadMin }) : [];
    return { service, pros, slots: (day?.slots || []).filter((s) => fitsPref(e.pref, s.label)) };
  }

  async function offer(user, token) {
    const b = await agenda.business();
    const e = await byToken(b, user, token);
    const { service, slots } = await compatibleSlots(b, e, user);
    if (!service) throw new HttpError(410, 'expired', 'Este aviso ya venció. Si quieres, reserva otra hora.');
    const n = await names(b, [e]);
    return {
      entry: clientView(e, b, n),
      service: { id: service.slug, name: service.name, durationMin: service.durationMin, priceCLP: service.priceCLP },
      professional: { id: e.professionalId ? String(e.professionalId) : 'any', name: e.professionalId ? n.pro.get(String(e.professionalId))?.displayName || 'Barbero' : 'Cualquiera' },
      slots,
      message: slots.length ? null : 'Alguien tomó esta hora antes. Sigues en la lista de espera.',
    };
  }

  /* Enganche de agenda.create (token en el POST de la cita). */
  agenda.hooks.waitlistBooking = async (b, user, token) => {
    const e = await byToken(b, user, token);
    /* AC-04: si otro la tomó antes, la entrada vuelve a "Esperando". */
    const lost = () => WaitlistEntry.updateOne({ _id: e._id, active: true }, { $set: { status: 'waiting' } }).catch(() => {});
    return { date: e.date, serviceId: e.serviceId, professionalId: e.professionalId, fits: (label) => fitsPref(e.pref, label), minLeadMin: WAITLIST.leadMin, lost };
  };

  /* Alcance 8 / CB-05: reservó ese día (por la lista o no) → "Tomaste la hora". */
  agenda.hooks.booked.push(async (b, user, appt) => {
    const date = wallClock(appt.startsAt.getTime(), b.timezone).date;
    await WaitlistEntry.updateMany({ businessId: b._id, customerUserId: user._id, date, active: true }, { $set: { status: 'booked', active: false, appointmentId: appt._id, endedAt: new Date(clock()) } });
  });

  /* ─── Liberación → aviso (Alcance 4, RN-03, RN-06, RN-07, RN-08) */
  async function onRelease(b, freed) {
    if (!agenda.waitlistOn(b)) return { notified: 0 };
    const now = clock();
    const start = new Date(freed.startsAt).getTime();
    const end = new Date(freed.endsAt).getTime();
    /* RN-06 / CB-02: solo horas que empiezan en ≥ 30 min. */
    if (start < now + WAITLIST.leadMin * MIN) return { notified: 0 };
    const date = wallClock(start, b.timezone).date;
    const pro = (await agenda.professionals(b, { mode: 'shop' })).find((p) => String(p._id) === String(freed.professionalId));
    if (!pro) return { notified: 0 };
    const entries = await WaitlistEntry.find({ businessId: b._id, date, active: true, $or: [{ professionalId: pro._id }, { professionalId: null }] }).sort({ createdAt: 1, _id: 1 });
    const bySvc = new Map();
    const chosen = [];
    for (const e of entries) {
      if (chosen.length >= WAITLIST.notifyBatch) break;
      if (!pro.serviceIds.includes(String(e.serviceId))) continue;
      if (String(e.customerUserId) === String(pro.userId || '')) continue;
      if (e.autoNotices >= WAITLIST.maxAutoNotices) continue;
      if (e.lastNotifiedAt && now - e.lastNotifiedAt.getTime() < WAITLIST.renotifyAfterMin * MIN) continue;
      const key = String(e.serviceId);
      if (!bySvc.has(key)) {
        const service = await Service.findOne({ _id: e.serviceId, businessId: b._id, active: true }).lean();
        const [day] = service ? await agenda.availabilityFor(b, { service, pros: [pro], from: date, to: date, mode: 'shop', now, minLeadMin: WAITLIST.leadMin }) : [];
        const dur = (service?.durationMin || 0) * MIN;
        /* CB-01 / CB-03: solo horas reservables que usan el hueco liberado. */
        bySvc.set(key, { service, slots: (day?.slots || []).filter((s) => Date.parse(s.startsAt) < end && Date.parse(s.startsAt) + dur > start) });
      }
      const { service, slots } = bySvc.get(key);
      const slot = slots.find((s) => fitsPref(e.pref, s.label));
      if (service && slot) chosen.push({ e, service, slot });
    }
    if (!chosen.length) return { notified: 0 };

    const day = dayLabel(date);
    let sent = chosen.length;
    for (const { e, service, slot } of chosen) {
      const at = new Date(now);
      /* CB-07: aunque el correo falle, la entrada cuenta como avisada. */
      /* Atómico: si mientras tanto tomó la hora, salió de la lista u otra liberación ya la avisó (CB-04), se salta. */
      const upd = await WaitlistEntry.updateOne(
        { _id: e._id, active: true, autoNotices: { $lt: WAITLIST.maxAutoNotices }, $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: new Date(now - WAITLIST.renotifyAfterMin * MIN) } }] },
        { $set: { status: 'notified', lastNotifiedAt: at }, $inc: { autoNotices: 1 }, $push: { notices: { at, kind: 'auto', startsAt: new Date(slot.startsAt) } } }
      );
      if (!upd.modifiedCount) { sent--; continue; }
      const email = e.customerSnapshot?.email;
      const mail = waitlistSlotMail({ name: e.customerSnapshot?.name, day, service: service.name, barber: pro.displayName, time: slot.label, url: linkFor(e.token) });
      const out = email ? await mailer.send({ to: email, ...mail }) : { status: 'failed', error: 'no recipient' };
      await Notification.create({ businessId: b._id, to: email || '', channel: 'email', template: 'waitlist_slot', status: out.status, error: out.error }).catch(() => {});
      /* SPEC-53 (WhatsApp, opcional): si está activa, registra aquí su envío de `ws_lista_espera_cupo`. */
      for (const fn of agenda.hooks.waitlistWhatsapp || []) {
        await fn(b, { entry: e, url: linkFor(e.token), day, service: service.name, barber: pro.displayName, time: slot.label }).catch((err) => logger.error('[lista] whatsapp:', err.message));
      }
    }
    if (!sent) return { notified: 0 };
    const first = chosen.map((c) => c.slot.label).sort()[0];
    const n = sent;
    const title = `Se liberó ${first}: avisamos a ${n} ${n === 1 ? 'persona' : 'personas'} de la lista de espera`;
    if (pro.userId) await PanelNotification.create({ userId: pro.userId, professionalId: pro._id, kind: 'waitlist_notified', title, body: day }).catch(() => {});
    await adminInbox?.notify({ kind: 'waitlist_notified', title: `${pro.displayName} · ${title}`, body: day, professionalId: pro._id, path: 'citas/', email: false });
    logger.log(`[lista] ${date} ${first} ${pro.displayName}: avisadas ${n}`);
    return { notified: n };
  }
  agenda.hooks.released.push(onRelease);

  /* ─── Barrido (Alcance 8, CB-08): días cerrados → "Terminó"; barbero o servicio que ya no está → termina y se avisa. */
  async function sweep() {
    const b = await agenda.business();
    const t = today(b);
    const at = new Date(clock());
    const past = await WaitlistEntry.updateMany({ businessId: b._id, active: true, date: { $lt: t } }, { $set: { status: 'ended', active: false, endedAt: at, endedReason: 'Terminó el día' } });
    const live = await WaitlistEntry.find({ businessId: b._id, active: true, date: { $gte: t } }).lean();
    if (!live.length) return { ended: past.modifiedCount, gone: 0 };
    const pros = await agenda.professionals(b, { mode: 'shop' });
    let gone = 0;
    for (const e of live) {
      const ok = pros.some((p) => (!e.professionalId || String(p._id) === String(e.professionalId)) && p.serviceIds.includes(String(e.serviceId)));
      if (ok) continue;
      const r = await WaitlistEntry.updateOne({ _id: e._id, active: true }, { $set: { status: 'ended', active: false, endedAt: at, endedReason: 'El día ya no está disponible' } });
      if (!r.modifiedCount) continue;
      gone++;
      if (e.customerSnapshot?.email) {
        const out = await mailer.send({ to: e.customerSnapshot.email, ...waitlistEndedMail({ name: e.customerSnapshot.name, day: dayLabel(e.date), url: `${frontUrl}/wstyle/reservar/` }) });
        await Notification.create({ businessId: b._id, to: e.customerSnapshot.email, template: 'waitlist_ended', status: out.status, error: out.error }).catch(() => {});
      }
    }
    return { ended: past.modifiedCount, gone };
  }

  /* ─── Barbero y super admin (Alcance 6, AC-07, AC-10) */
  async function staffScope(user, asAdmin) {
    if (asAdmin) {
      adminDomain.requireAdmin(user);
      return { b: await agenda.business(), pro: null };
    }
    const { b, pro } = await proDomain.context(user, { operate: true });
    const self = (await agenda.professionals(b, { mode: 'shop' })).find((p) => String(p._id) === String(pro._id));
    return { b, pro, serviceIds: self?.serviceIds || [] };
  }

  /* Filtro: el barbero ve las que lo pidieron a él + las de "Cualquiera" de servicios que hace. */
  function scopeQuery(b, scope) {
    const q = { businessId: b._id };
    if (scope.pro) {
      q.$or = [{ professionalId: scope.pro._id }, { professionalId: null, serviceId: { $in: scope.serviceIds.map((id) => new ObjectId(id)) } }];
    }
    return q;
  }

  async function staffList(user, { from, to } = {}, asAdmin = false) {
    const scope = await staffScope(user, asAdmin);
    const { b } = scope;
    const t = today(b);
    if (!isDate(from)) from = t;
    if (!isDate(to)) to = addDays(from, 6);
    if (to < from || addDays(from, 42) < to) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
    const list = await WaitlistEntry.find({ ...scopeQuery(b, scope), active: true, date: { $gte: from < t ? t : from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean();
    const n = await names(b, list);
    const days = [];
    for (const e of list) {
      let d = days.at(-1);
      if (!d || d.date !== e.date) days.push((d = { date: e.date, count: 0, entries: [] }));
      d.count++;
      d.entries.push(staffView(e, b, n));
    }
    const out = { enabled: agenda.waitlistOn(b), days };
    if (asAdmin) out.summary = { next7: await WaitlistEntry.countDocuments({ businessId: b._id, active: true, date: { $gte: t, $lte: addDays(t, 6) } }) };
    return out;
  }

  async function staffEntry(user, id, asAdmin) {
    const scope = await staffScope(user, asAdmin);
    const _id = oid(id);
    const e = _id ? await WaitlistEntry.findOne({ ...scopeQuery(scope.b, scope), _id }) : null;
    if (!e || !isLive(e, scope.b)) throw notFound();
    return { ...scope, e };
  }

  /* [Avisarle]: wa.me con el link, registrado como aviso manual (asunción 8: no se notifica al cliente por otra vía). */
  async function staffNotify(user, id, asAdmin = false) {
    const { e } = await staffEntry(user, id, asAdmin);
    const first = (e.customerSnapshot?.name || '').split(' ')[0];
    const text = `Hola ${first}, te escribo de WS Style: estás en la lista de espera del ${dayLabel(e.date)}. Se liberó una hora; si la quieres, tómala aquí: ${linkFor(e.token)}`;
    const waUrl = waLink(e.customerSnapshot?.phoneE164, text);
    if (!waUrl) throw new HttpError(409, 'no_phone', 'Esta persona no tiene celular registrado.');
    /* Queda "Te avisamos · avisado hh:mm" en la hoja; no suma a los 3 avisos automáticos (RN-07). */
    const at = new Date(clock());
    await WaitlistEntry.updateOne({ _id: e._id }, { $set: { status: 'notified', lastNotifiedAt: at }, $push: { notices: { at, kind: 'manual', byUserId: user._id } } });
    return { waUrl };
  }

  async function staffRemove(user, id, asAdmin = false) {
    const { e } = await staffEntry(user, id, asAdmin);
    await WaitlistEntry.updateOne({ _id: e._id, active: true }, { $set: { status: 'removed', active: false, endedAt: new Date(clock()), endedReason: asAdmin ? 'Sacada por WS Style' : 'Sacada por el barbero' } });
    return { ok: true };
  }

  return { join, mine, leave, offer, onRelease, sweep, staffList, staffNotify, staffRemove };
}
