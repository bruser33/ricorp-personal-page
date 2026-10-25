/* Barbero de WS Style (SPEC-33): registro, perfil, disponibilidad, domicilio, fotos y
   su panel de trabajo (agenda, acciones sobre citas, invitaciones, notificaciones).
   Usa el modelo y la máquina de estados de SPEC-32 (domain/agenda.js); la aprobación
   la decide el super admin (SPEC-34) con setMembershipStatus. */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  Appointment,
  AvailabilityRule,
  BLOCKING,
  Membership,
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
import { cleanName, clMobile, MAX_NOTE } from '../lib/validate.js';
import { publicUser } from '../lib/session.js';
import {
  proApprovedMail,
  proNewForAdminMail,
  proReceivedMail,
  proRejectedMail,
  proSubmittedForAdminMail,
  proSuspendedMail,
} from '../lib/emails.js';
import { deletePhoto, MAX_PHOTOS, storePhoto } from '../lib/photos.js';
import { photoUrl } from './agenda.js';
import { slotsFor } from './availability.js';
import { addDays, isDate, isoWeekday, isTime, wallClock, zonedToUtc } from './time.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const { ObjectId } = mongoose.Types;

/* RN-06 / asunción 11. */
export const HOME_LIMITS = { surchargeCLP: [0, 50_000], radiusKm: [1, 30], travelBufferMin: [0, 90] };
export const INVITE_TTL_H = 24;
export const INVITE_CUTOFF_H = 2;

const WEEKDAY_PLURAL = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábados', 7: 'domingos' };
const NAME_MIN = 2;
const NAME_MAX = 60;

const fieldError = (fields, message = 'Revisa los datos') => new HttpError(400, Object.values(fields)[0], message, { fields });
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function validName(raw) {
  const name = cleanName(raw);
  return name.length >= NAME_MIN && name.length <= NAME_MAX ? name : null;
}

/* RN-05: une rangos que se tocan/solapan y los recorta al horario del local. */
export function clipRules(rules, hours) {
  const adjustments = [];
  const out = [];
  const byDay = new Map();
  for (const r of rules) {
    if (!byDay.has(r.weekday)) byDay.set(r.weekday, []);
    byDay.get(r.weekday).push([toMin(r.start), r.end === '24:00' ? 1440 : toMin(r.end)]);
  }
  for (const [wd, ranges] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const shop = (hours || []).find((h) => h.weekday === wd);
    if (!shop?.opens || !shop?.closes) {
      adjustments.push(`WS Style no abre los ${WEEKDAY_PLURAL[wd]}; quitamos ese día.`);
      continue;
    }
    const o = toMin(shop.opens);
    const c = shop.closes === '24:00' ? 1440 : toMin(shop.closes);
    let clipped = false;
    const kept = [];
    for (const [s, e] of ranges) {
      const cs = Math.max(s, o);
      const ce = Math.min(e, c);
      if (cs !== s || ce !== e) clipped = true;
      if (cs < ce) kept.push([cs, ce]);
    }
    if (clipped) adjustments.push(`WS Style abre de ${shop.opens} a ${shop.closes} los ${WEEKDAY_PLURAL[wd]}; ajustamos tu horario.`);
    kept.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of kept) {
      const last = merged.at(-1);
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    for (const [s, e] of merged) out.push({ weekday: wd, start: toTime(s), end: e === 1440 ? '24:00' : toTime(e) });
  }
  return { rules: out, adjustments };
}

export function createPro({ agenda, clock = Date.now, mailer, logger = console, frontUrl = 'http://localhost:5173', env = {} }) {
  const panelUrl = `${frontUrl}/wstyle/pro/`;

  async function adminEmails() {
    const set = new Set();
    for (const e of String(env.SUPERADMIN_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) set.add(e);
    for (const u of await User.find({ roles: 'superadmin', status: 'active' }, { email: 1 }).lean()) if (u.email) set.add(u.email);
    return [...set];
  }

  async function send(to, mail) {
    if (!to) return false;
    const out = await mailer.send({ to, ...mail });
    if (!out.ok) logger.error('[pro] no se pudo enviar', mail.template, 'a', to);
    return out.ok;
  }

  async function inbox(pro, kind, title, body = '') {
    if (!pro?.userId) return;
    await PanelNotification.create({ userId: pro.userId, professionalId: pro._id, kind, title, body }).catch((err) => logger.error('[pro] bandeja:', err.message));
  }

  /* ─── Registro (RN-01, RN-02) */

  /* Crea/completa el perfil de barbero de una cuenta: rol, Professional y Membership
     pendiente. Con `acceptTerms` la primera vez se avisa al barbero y al super admin. */
  async function ensureBarber(user, { phone = null, name = null, acceptTerms = false } = {}) {
    const b = await agenda.business();
    if (!user.roles.includes('barber')) user.roles.push('barber');
    if (phone) user.phoneE164 = phone;
    if (name && !user.name) user.name = name;
    await user.save();
    let pro = await Professional.findOne({ userId: user._id });
    if (!pro) {
      pro = await Professional.create({
        userId: user._id,
        displayName: name || user.name || (user.email || 'Barbero').split('@')[0],
        phone: user.phoneE164 || undefined,
        email: user.email || undefined,
        categories: ['barberia'],
        bio: '',
        photos: [],
      });
    } else {
      if (phone) pro.phone = phone;
      if (name) pro.displayName = name;
      if (user.email && !pro.email) pro.email = user.email;
    }
    const first = acceptTerms && !pro.termsAcceptedAt;
    if (first) pro.termsAcceptedAt = new Date(clock());
    await pro.save();
    const last = await Membership.findOne({ businessId: b._id }).sort({ order: -1 }).lean();
    await Membership.updateOne(
      { businessId: b._id, professionalId: pro._id },
      { $setOnInsert: { status: 'pending', role: 'member', order: (last?.order ?? 0) + 1 } },
      { upsert: true }
    );
    if (first) {
      await send(user.email, proReceivedMail({ name: pro.displayName, url: panelUrl }));
      for (const to of await adminEmails()) await send(to, proNewForAdminMail({ name: pro.displayName, email: user.email, phone: user.phoneE164, url: `${frontUrl}/wstyle/admin/` }));
    }
    return pro;
  }

  function needsCompletion(user, pro) {
    return !pro?.termsAcceptedAt || !user.phoneE164;
  }

  /* ─── Acceso (RN-03, CB-01, CB-02). `operate` = agenda, invitar, acciones sobre citas. */
  async function context(user, { operate = false, edit = false } = {}) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    const b = await agenda.business();
    const pro = user.roles.includes('barber') ? await Professional.findOne({ userId: user._id }) : null;
    const m = pro ? await Membership.findOne({ businessId: b._id, professionalId: pro._id }) : null;
    if (!pro || !m) throw new HttpError(403, 'not_barber', 'Esta cuenta no tiene perfil de barbero');
    const suspended = m.status === 'suspended' || pro.status === 'suspended';
    if (operate && (suspended || m.status !== 'approved')) {
      if (suspended) throw new HttpError(403, 'suspended', 'Tu perfil está suspendido. Escríbenos si crees que es un error.');
      throw new HttpError(403, 'not_approved', 'Tu perfil está en revisión. Te avisaremos por correo cuando WS Style lo apruebe.', { membership: m.status });
    }
    if (edit && (suspended || !['pending', 'approved'].includes(m.status))) {
      throw new HttpError(403, suspended ? 'suspended' : 'not_approved', 'Tu perfil no está habilitado para hacer cambios.', { membership: m.status });
    }
    return { b, pro, m };
  }

  /* ─── Lectura del perfil */
  async function me(user) {
    const { b, pro, m } = await context(user);
    const [services, links, rules, offs, unread, settings] = await Promise.all([
      Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean(),
      ProfessionalService.find({ businessId: b._id, professionalId: pro._id }).lean(),
      AvailabilityRule.find({ businessId: b._id, professionalId: pro._id }).sort({ weekday: 1, start: 1 }).lean(),
      TimeOff.find({ businessId: b._id, professionalId: pro._id, endsAt: { $gt: new Date(clock()) } }).sort({ startsAt: 1 }).lean(),
      PanelNotification.countDocuments({ userId: user._id, readAt: null }),
      PlatformSettings.findOne({ key: 'default' }).lean(),
    ]);
    const mine = new Set(links.map((l) => String(l.serviceId)));
    return {
      user: publicUser(user),
      needsCompletion: needsCompletion(user, pro),
      emailCheckPending: Boolean(pro.emailCheckRequired && !user.emailVerified),
      professional: serializePro(pro),
      membership: { status: m.status, reason: m.reason || null, submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null },
      business: { name: b.name, timezone: b.timezone, hours: b.hours, address: b.address },
      services: services.map((s) => ({ id: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin, homeServiceAllowed: s.homeServiceAllowed !== false, selected: mine.has(String(s._id)) })),
      rules: rules.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end })),
      timeOffs: offs.map(serializeOff),
      platformFeeRate: settings?.defaultPlatformFeeRate ?? 0,
      unread,
    };
  }

  function serializePro(pro) {
    return {
      id: String(pro._id),
      displayName: pro.displayName,
      phone: pro.phone || null,
      bio: pro.bio || '',
      categories: pro.categories,
      photos: (pro.photos || []).map((id) => ({ id: String(id), url: photoUrl(id) })),
      homeService: {
        enabled: Boolean(pro.homeService?.enabled),
        surchargeCLP: pro.homeService?.surchargeCLP ?? 0,
        radiusKm: pro.homeService?.radiusKm ?? 0,
        travelBufferMin: pro.homeService?.travelBufferMin ?? 30,
      },
    };
  }

  const serializeOff = (o) => ({ id: String(o._id), startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString(), reason: o.reason || '' });

  /* ─── Perfil */
  async function updateProfile(user, body) {
    const { pro } = await context(user, { edit: true });
    const fields = {};
    if (body.displayName !== undefined) {
      const n = validName(body.displayName);
      if (!n) fields.displayName = 'invalid_name';
      else pro.displayName = n;
    }
    if (body.phone !== undefined) {
      const p = clMobile(body.phone);
      if (!p) fields.phone = 'invalid_phone';
      else pro.phone = p;
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio ?? '').trim();
      if (bio.length > MAX_NOTE) fields.bio = 'too_long';
      else pro.bio = bio;
    }
    if (Object.keys(fields).length) throw fieldError(fields);
    await pro.save();
    return serializePro(pro);
  }

  async function setServices(user, body) {
    const { b, pro } = await context(user, { edit: true });
    const ids = Array.isArray(body.serviceIds) ? [...new Set(body.serviceIds.map(String))] : [];
    if (!ids.length) throw fieldError({ serviceIds: 'required' }, 'Elige al menos un servicio');
    const services = await Service.find({ businessId: b._id, active: true, slug: { $in: ids } }).lean();
    if (services.length !== ids.length) throw fieldError({ serviceIds: 'invalid_service' }, 'Elige servicios de la carta');
    /* CB-12: quitar un servicio no toca las citas ya tomadas (llevan su snapshot). */
    await ProfessionalService.deleteMany({ businessId: b._id, professionalId: pro._id, serviceId: { $nin: services.map((s) => s._id) } });
    for (const s of services) await ProfessionalService.updateOne({ businessId: b._id, professionalId: pro._id, serviceId: s._id }, {}, { upsert: true });
    return { serviceIds: services.map((s) => s.slug) };
  }

  async function setAvailability(user, body) {
    const { b, pro } = await context(user, { edit: true });
    const raw = Array.isArray(body.rules) ? body.rules : null;
    if (!raw || raw.length > 50) throw fieldError({ rules: 'invalid_rules' });
    const rules = [];
    for (const r of raw) {
      const weekday = Number(r?.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !isTime(r?.start) || !isTime(r?.end) || r.start === '24:00') throw fieldError({ rules: 'invalid_range' }, 'Revisa los horarios');
      if (toMin(r.start) >= (r.end === '24:00' ? 1440 : toMin(r.end))) throw fieldError({ rules: 'invalid_range' }, 'La hora de término tiene que ser posterior a la de inicio');
      rules.push({ weekday, start: r.start, end: r.end });
    }
    const out = clipRules(rules, b.hours);
    await withTransaction(async (session) => {
      await AvailabilityRule.deleteMany({ businessId: b._id, professionalId: pro._id }, { session });
      if (out.rules.length) await AvailabilityRule.insertMany(out.rules.map((r) => ({ ...r, businessId: b._id, professionalId: pro._id })), { session });
    }, logger);
    return out;
  }

  async function setHomeService(user, body) {
    const { pro } = await context(user, { edit: true });
    const cur = pro.homeService || {};
    const next = {
      enabled: body.enabled === undefined ? Boolean(cur.enabled) : body.enabled,
      surchargeCLP: body.surchargeCLP === undefined ? cur.surchargeCLP ?? 0 : body.surchargeCLP,
      radiusKm: body.radiusKm === undefined ? cur.radiusKm ?? 0 : body.radiusKm,
      travelBufferMin: body.travelBufferMin === undefined ? cur.travelBufferMin ?? 30 : body.travelBufferMin,
    };
    const fields = {};
    if (typeof next.enabled !== 'boolean') fields.enabled = 'invalid';
    for (const [k, [lo, hi]] of Object.entries(HOME_LIMITS)) {
      const v = Number(next[k]);
      const provided = body[k] !== undefined;
      /* Apagado: solo se validan los valores que se mandan (se conservan para cuando lo vuelva a encender). */
      if ((next.enabled || provided) && (!Number.isFinite(v) || v < lo || v > hi || (k !== 'radiusKm' && !Number.isInteger(v)))) fields[k] = 'out_of_range';
      else next[k] = Number.isFinite(v) ? v : 0;
    }
    if (Object.keys(fields).length) throw fieldError(fields);
    pro.homeService = next;
    await pro.save();
    return { homeService: serializePro(pro).homeService };
  }

  /* ─── Ausencias (RN-05, CB-04) */
  async function addTimeOff(user, body) {
    const { b, pro } = await context(user, { edit: true });
    const fromDate = String(body.fromDate ?? '');
    const toDate = String(body.toDate ?? fromDate);
    const fromTime = String(body.fromTime || '00:00');
    const toTime = String(body.toTime || '24:00');
    const fields = {};
    if (!isDate(fromDate)) fields.fromDate = 'invalid_date';
    if (!isDate(toDate)) fields.toDate = 'invalid_date';
    if (!isTime(fromTime) || fromTime === '24:00') fields.fromTime = 'invalid_time';
    if (!isTime(toTime)) fields.toTime = 'invalid_time';
    if (Object.keys(fields).length) throw fieldError(fields);
    const startsAt = zonedToUtc(fromDate, fromTime, b.timezone);
    const endsAt = zonedToUtc(toDate, toTime, b.timezone);
    if (endsAt <= startsAt) throw fieldError({ toDate: 'before_start' }, 'El término tiene que ser posterior al inicio');
    if (endsAt <= clock()) throw fieldError({ toDate: 'past' }, 'Esa ausencia ya pasó');
    if (endsAt - startsAt > 120 * 24 * HOUR) throw fieldError({ toDate: 'too_long' }, 'Máximo 120 días');
    const reason = String(body.reason ?? '').trim().slice(0, 80);
    const clash = await Appointment.find({ businessId: b._id, professionalId: pro._id, status: { $in: BLOCKING }, startsAt: { $lt: new Date(endsAt) }, endsAt: { $gt: new Date(startsAt) } }).sort({ startsAt: 1 });
    if (clash.length) {
      const now = clock();
      const appointments = await Promise.all(clash.map((a) => agenda.serialize(a, 'barber', b, now)));
      throw new HttpError(409, 'time_off_conflict', `Tienes ${clash.length} ${clash.length === 1 ? 'cita' : 'citas'} en esas fechas. Muévelas o cancélalas antes de guardar la ausencia.`, { appointments });
    }
    const off = await TimeOff.create({ businessId: b._id, professionalId: pro._id, startsAt: new Date(startsAt), endsAt: new Date(endsAt), reason });
    return { timeOff: serializeOff(off) };
  }

  async function removeTimeOff(user, id) {
    const { b, pro } = await context(user, { edit: true });
    const _id = oid(id);
    const r = _id ? await TimeOff.deleteOne({ _id, businessId: b._id, professionalId: pro._id }) : { deletedCount: 0 };
    if (!r.deletedCount) throw new HttpError(404, 'not_found', 'No encontramos esa ausencia');
    return { ok: true };
  }

  /* ─── Fotos (RN-17, CB-10) */
  async function addPhotos(user, files) {
    const { pro } = await context(user, { edit: true });
    if (!files.length) throw fieldError({ photos: 'required' }, 'Elige al menos una foto');
    if ((pro.photos?.length || 0) + files.length > MAX_PHOTOS) {
      throw new HttpError(400, 'too_many_photos', `Puedes subir hasta ${MAX_PHOTOS} fotos.`, { max: MAX_PHOTOS });
    }
    const ids = [];
    try {
      for (const f of files) ids.push(await storePhoto(f.buffer, { professionalId: String(pro._id) }));
    } catch (err) {
      for (const id of ids) await deletePhoto(id);
      if (err.code === 'invalid_image') {
        const f = files[ids.length];
        throw new HttpError(400, 'invalid_image', `"${f?.originalname || 'El archivo'}" no es una imagen JPG, PNG o WebP válida.`, { filename: f?.originalname });
      }
      throw err;
    }
    pro.photos = [...(pro.photos || []), ...ids];
    await pro.save();
    return { photos: serializePro(pro).photos };
  }

  async function removePhoto(user, id) {
    const { pro } = await context(user, { edit: true });
    if (!(pro.photos || []).includes(String(id))) throw new HttpError(404, 'not_found', 'No encontramos esa foto');
    pro.photos = pro.photos.filter((p) => p !== String(id));
    await pro.save();
    await deletePhoto(id);
    return { photos: serializePro(pro).photos };
  }

  async function mainPhoto(user, id) {
    const { pro } = await context(user, { edit: true });
    if (!(pro.photos || []).includes(String(id))) throw new HttpError(404, 'not_found', 'No encontramos esa foto');
    pro.photos = [String(id), ...pro.photos.filter((p) => p !== String(id))];
    await pro.save();
    return { photos: serializePro(pro).photos };
  }

  /* ─── Enviar a revisión (paso 5 del registro) */
  async function submit(user) {
    const { b, pro, m } = await context(user, { edit: true });
    if (needsCompletion(user, pro)) throw new HttpError(409, 'incomplete', 'Falta tu celular y aceptar los términos');
    if (pro.emailCheckRequired && !user.emailVerified) throw new HttpError(409, 'email_unverified', 'Confirma tu correo con el link que te enviamos antes de enviar tu perfil a revisión.');
    const [svc, rules] = await Promise.all([
      ProfessionalService.countDocuments({ businessId: b._id, professionalId: pro._id }),
      AvailabilityRule.countDocuments({ businessId: b._id, professionalId: pro._id }),
    ]);
    if (!svc) throw new HttpError(409, 'needs_services', 'Elige al menos un servicio');
    if (!rules) throw new HttpError(409, 'needs_availability', 'Indica cuándo trabajas');
    if (!m.submittedAt) {
      m.submittedAt = new Date(clock());
      await m.save();
      if (m.status === 'pending') for (const to of await adminEmails()) await send(to, proSubmittedForAdminMail({ name: pro.displayName, url: `${frontUrl}/wstyle/admin/` }));
    }
    return me(user);
  }

  /* ─── Aprobación (SPEC-34 la expone al super admin; acá vive la regla y sus avisos). */
  async function setMembershipStatus(professionalId, status, reason = '') {
    const b = await agenda.business();
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) throw new HttpError(400, 'invalid_status', 'Estado inválido');
    const m = await Membership.findOneAndUpdate(
      { businessId: b._id, professionalId },
      { status, reason: String(reason || '').trim() || undefined, decidedAt: new Date(clock()) },
      { new: true }
    );
    if (!m) throw new HttpError(404, 'not_found', 'No encontramos ese barbero');
    const pro = await Professional.findById(professionalId);
    const user = pro?.userId ? await User.findById(pro.userId).lean() : null;
    const email = user?.email || pro?.email;
    if (status === 'approved') {
      await send(email, proApprovedMail({ name: pro.displayName, url: panelUrl }));
      await inbox(pro, 'account_approved', '¡Tu perfil fue aprobado!', 'Ya apareces en la reserva en línea.');
    } else if (status === 'rejected') {
      await send(email, proRejectedMail({ name: pro.displayName, reason, url: panelUrl }));
      await inbox(pro, 'account_rejected', 'Tu perfil no fue aprobado', reason || '');
    } else if (status === 'suspended') {
      await send(email, proSuspendedMail({ name: pro.displayName, reason, url: panelUrl }));
      await inbox(pro, 'account_suspended', 'Tu perfil fue suspendido', reason || '');
    }
    return m;
  }

  /* ─── Agenda (flujo principal) */
  async function agendaRange(user, { from, to }) {
    const { b, pro } = await context(user, { operate: true });
    const now = clock();
    const today = wallClock(now, b.timezone).date;
    if (!isDate(from)) from = today;
    if (!isDate(to)) to = from;
    if (to < from || addDays(from, 42) < to) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
    const rangeStart = new Date(zonedToUtc(from, '00:00', b.timezone));
    const rangeEnd = new Date(zonedToUtc(addDays(to, 1), '00:00', b.timezone));
    const [appts, rules, offs, links, services] = await Promise.all([
      Appointment.find({ businessId: b._id, professionalId: pro._id, startsAt: { $gte: rangeStart, $lt: rangeEnd } }).sort({ startsAt: 1 }),
      AvailabilityRule.find({ businessId: b._id, professionalId: pro._id }).lean(),
      TimeOff.find({ businessId: b._id, professionalId: pro._id, startsAt: { $lt: rangeEnd }, endsAt: { $gt: rangeStart } }).lean(),
      ProfessionalService.find({ businessId: b._id, professionalId: pro._id }).lean(),
      Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean(),
    ]);
    const serialized = await Promise.all(appts.map((a) => agenda.serialize(a, 'barber', b, now)));
    const closures = (b.closures || []).map((c) => c.date);
    const days = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const wd = isoWeekday(date);
      const shop = (b.hours || []).find((h) => h.weekday === wd);
      const open = shop?.opens && shop?.closes && !closures.includes(date);
      /* Ventanas de trabajo = sus reglas ∩ horario del local − ausencias (en ISO). */
      let windows = [];
      if (open) {
        const so = zonedToUtc(date, shop.opens, b.timezone);
        const sc = zonedToUtc(date, shop.closes, b.timezone);
        windows = rules
          .filter((r) => r.weekday === wd)
          .map((r) => [Math.max(so, zonedToUtc(date, r.start, b.timezone)), Math.min(sc, zonedToUtc(date, r.end, b.timezone))])
          .filter(([s, e]) => s < e);
        for (const o of offs) {
          const cut = [o.startsAt.getTime(), o.endsAt.getTime()];
          windows = windows.flatMap(([s, e]) => (cut[1] <= s || cut[0] >= e ? [[s, e]] : [...(cut[0] > s ? [[s, cut[0]]] : []), ...(cut[1] < e ? [[cut[1], e]] : [])]));
        }
      }
      const dayStart = zonedToUtc(date, '00:00', b.timezone);
      const dayEnd = zonedToUtc(addDays(date, 1), '00:00', b.timezone);
      days.push({
        date,
        shop: open ? { opens: shop.opens, closes: shop.closes } : null,
        windows: windows.sort((x, y) => x[0] - y[0]).map(([s, e]) => ({ startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString() })),
        appointments: serialized.filter((a) => Date.parse(a.startsAt) >= dayStart && Date.parse(a.startsAt) < dayEnd),
      });
    }
    const mine = new Set(links.map((l) => String(l.serviceId)));
    return {
      timezone: b.timezone,
      now: new Date(now).toISOString(),
      today,
      professional: { id: String(pro._id), name: pro.displayName, homeService: serializePro(pro).homeService },
      services: services.filter((s) => mine.has(String(s._id))).map((s) => ({ id: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin, homeServiceAllowed: s.homeServiceAllowed !== false })),
      timeOffs: offs.map(serializeOff),
      days,
    };
  }

  /* Horas libres del propio barbero (invitar, agendar en un hueco, mover). */
  async function slots(user, { service: serviceId, date, mode = 'shop', appointment = null }) {
    const { b, pro } = await context(user, { operate: true });
    if (!isDate(date)) throw new HttpError(400, 'invalid_range', 'Fecha inválida');
    let exclude = null;
    let svc = await agenda.findService(b, serviceId);
    if (appointment) {
      const a = await own(pro, appointment);
      exclude = a._id;
      mode = a.location?.kind === 'home' ? 'home' : 'shop';
      svc = { ...(svc || (await Service.findById(a.serviceSnapshot.serviceId).lean()) || {}), _id: a.serviceSnapshot.serviceId, durationMin: a.serviceSnapshot.durationMin };
    }
    if (!svc) throw new HttpError(400, 'invalid_service', 'Ese servicio no existe');
    const pros = (await agenda.professionals(b, { service: appointment ? null : svc, mode: mode === 'home' ? 'home' : 'shop' })).filter((p) => String(p._id) === String(pro._id));
    /* Mover = propuesta al cliente: rige la anticipación mínima del local (SPEC-32). Invitar: desde ya. */
    const minLeadMin = appointment ? b.settings.minLeadMinutes : 0;
    const [day] = await agenda.availabilityFor(b, { service: svc, pros, from: date, to: date, mode: mode === 'home' ? 'home' : 'shop', now: clock(), exclude, minLeadMin });
    return { timezone: b.timezone, date, slots: (day?.slots || []).map((s) => ({ startsAt: s.startsAt, label: s.label })) };
  }

  async function own(pro, id) {
    const _id = oid(id);
    const appt = _id ? await Appointment.findOne({ _id, professionalId: pro._id }) : null;
    /* CB-14: la de otro barbero → 404 (no se revela que existe). */
    if (!appt) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    return appt;
  }

  async function viewAppointment(user, id) {
    const { b, pro } = await context(user, { operate: true });
    return agenda.serialize(await own(pro, id), 'barber', b, clock());
  }

  async function act(user, id, action, payload = {}) {
    const { b, pro } = await context(user, { operate: true });
    const appt = await own(pro, id);
    if (action === 'reschedule') return reschedule(b, pro, appt, payload, user);
    return agenda.actAs(b, appt, 'barber', action, payload, user);
  }

  /* ─── Invitar cita (RN-12, RN-13, CB-07, CB-08) */
  function inviteExpiry(now, startMs) {
    const cutoff = startMs - INVITE_CUTOFF_H * HOUR;
    const exp = Math.min(now + INVITE_TTL_H * HOUR, cutoff);
    return new Date(exp > now ? exp : startMs);
  }

  async function invite(user, body) {
    const { b, pro } = await context(user, { operate: true });
    const now = clock();
    const fields = {};
    const phone = clMobile(body.phone);
    if (!phone) fields.phone = 'invalid_phone';
    const name = validName(body.name);
    if (!name) fields.name = 'required';
    const service = await agenda.findService(b, body.serviceId);
    if (!service) fields.serviceId = 'invalid_service';
    const startMs = Date.parse(body.startsAt);
    if (!Number.isFinite(startMs)) fields.startsAt = 'invalid_start';
    else if (startMs <= now) fields.startsAt = 'past';
    const mode = body.mode === 'home' ? 'home' : 'shop';
    const note = String(body.note ?? '').trim();
    if (note.length > MAX_NOTE) fields.note = 'too_long';
    if (phone && phone === (pro.phone || user.phoneE164)) fields.phone = 'self_invite';
    if (Object.keys(fields).length) throw fieldError(fields);

    let pros = (await agenda.professionals(b, { service, mode })).filter((p) => String(p._id) === String(pro._id));
    if (!pros.length) {
      if (mode === 'home') throw new HttpError(422, 'no_home_service', 'Activa "Hago domicilio" en tu perfil para invitar a domicilio');
      throw fieldError({ serviceId: 'invalid_service' }, 'No ofreces ese servicio');
    }
    let location = { kind: 'shop', travelBufferMin: 0 };
    if (mode === 'home') {
      const loc = await agenda.locate(b, body.address);
      if (loc.distanceKm > pro.homeService.radiusKm) {
        throw new HttpError(422, 'out_of_range', `Esta dirección está a ${loc.distanceKm.toLocaleString('es-CL')} km y tu radio es de ${pro.homeService.radiusKm} km.`, { distanceKm: loc.distanceKm });
      }
      location = { kind: 'home', address: { street: loc.street, commune: loc.commune, details: loc.details, formatted: loc.formatted }, point: loc.point, distanceKm: loc.distanceKm, travelBufferMin: pro.homeService?.travelBufferMin ?? 30 };
    }
    const date = wallClock(startMs, b.timezone).date;
    const [day] = await agenda.availabilityFor(b, { service, pros, from: date, to: date, mode, now, minLeadMin: 0 });
    if (!day?.slots.some((s) => Date.parse(s.startsAt) === startMs)) throw new HttpError(409, 'slot_unavailable', 'Esa hora ya no está libre. Elige otra.');

    const customer = await User.findOne({ phoneE164: phone, status: 'active', roles: 'client', _id: { $ne: user._id } }).lean();
    const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
    const feeRate = settings?.defaultPlatformFeeRate ?? 0;
    const surcharge = mode === 'home' ? pro.homeService.surchargeCLP : 0;
    const total = service.priceCLP + surcharge;
    const doc = {
      _id: new ObjectId(),
      businessId: b._id,
      professionalId: pro._id,
      customerUserId: customer?._id ?? null,
      customerSnapshot: { name, phoneE164: phone, email: customer?.email },
      serviceSnapshot: { serviceId: service._id, slug: service.slug, name: service.name, priceCLP: service.priceCLP, durationMin: service.durationMin },
      professionalSnapshot: { displayName: pro.displayName, phone: pro.phone },
      startsAt: new Date(startMs),
      endsAt: new Date(startMs + service.durationMin * MIN),
      location,
      pricing: { priceCLP: service.priceCLP, surchargeCLP: surcharge, totalCLP: total, platformFeeRate: feeRate, platformFeeCLP: Math.round(total * feeRate) },
      /* RN-12: forma de pago por defecto, en el local (efectivo). */
      payment: { method: 'local', status: 'pendiente' },
      note: note || undefined,
      status: 'invitacion_enviada',
      expiresAt: inviteExpiry(now, startMs),
      invite: { token: crypto.randomBytes(18).toString('base64url'), sentAt: new Date(now) },
      history: [{ at: new Date(now), from: null, to: 'invitacion_enviada', by: 'barber', byUserId: user._id }],
      source: 'pro_invite',
    };
    let appt;
    try {
      appt = await withTransaction(async (session, { transactional }) => {
        try {
          await SlotLock.insertMany(
            slotsFor(startMs, service.durationMin, location.travelBufferMin).map((t) => ({ businessId: b._id, professionalId: pro._id, slotStart: new Date(t), appointmentId: doc._id, kind: 'main' })),
            { session, ordered: true }
          );
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
    if (customer) await agenda.notify(b, appt, 'client', 'invited');
    return invitationResponse(b, appt, now);
  }

  async function invitationResponse(b, appt, now) {
    const links = agenda.inviteLinks(appt, b);
    return { appointment: await agenda.serialize(appt, 'barber', b, now), whatsappUrl: links.whatsappUrl, inviteUrl: links.url, message: links.text };
  }

  /* RN-08: una invitación aún no aceptada se reprograma sin propuesta (se reenvía el link). */
  async function reschedule(b, pro, current, payload, user) {
    if (current.status !== 'invitacion_enviada') throw new HttpError(409, 'invalid_transition', 'Solo se reprograma directo una invitación aún no confirmada', { reason: 'bad_state' });
    const now = clock();
    const startMs = Date.parse(payload.startsAt);
    if (!Number.isFinite(startMs) || startMs <= now) throw fieldError({ startsAt: Number.isFinite(startMs) ? 'past' : 'invalid_start' });
    const service = { _id: current.serviceSnapshot.serviceId, durationMin: current.serviceSnapshot.durationMin };
    const mode = current.location?.kind === 'home' ? 'home' : 'shop';
    const pros = (await agenda.professionals(b, { mode })).filter((p) => String(p._id) === String(pro._id));
    const date = wallClock(startMs, b.timezone).date;
    const [day] = await agenda.availabilityFor(b, { service, pros, from: date, to: date, mode, now, exclude: current._id, minLeadMin: 0 });
    if (!day?.slots.some((s) => Date.parse(s.startsAt) === startMs)) throw new HttpError(409, 'slot_unavailable', 'Esa hora ya no está libre. Elige otra.');
    const appt = await agenda.mutate(b, current._id, async (a, session) => {
      if (a.status !== 'invitacion_enviada') throw new HttpError(409, 'invalid_transition', 'Recarga para ver el estado actual', { reason: 'stale' });
      await SlotLock.deleteMany({ appointmentId: a._id }, { session });
      await SlotLock.insertMany(
        slotsFor(startMs, a.serviceSnapshot.durationMin, a.location?.travelBufferMin || 0).map((t) => ({ businessId: b._id, professionalId: a.professionalId, slotStart: new Date(t), appointmentId: a._id, kind: 'main' })),
        { session, ordered: true }
      );
      a.startsAt = new Date(startMs);
      a.endsAt = new Date(startMs + a.serviceSnapshot.durationMin * MIN);
      a.expiresAt = inviteExpiry(now, startMs);
      a.invite.sentAt = new Date(now);
      return { by: 'barber', byUserId: user._id, reason: 'Invitación reprogramada' };
    });
    if (appt.customerUserId) await agenda.notify(b, appt, 'client', 'invited');
    return invitationResponse(b, appt, now);
  }

  /* ─── Notificaciones del panel (RN-16) */
  async function notifications(user) {
    await context(user);
    const [items, unread] = await Promise.all([
      PanelNotification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      PanelNotification.countDocuments({ userId: user._id, readAt: null }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body || '', appointmentId: n.appointmentId ? String(n.appointmentId) : null, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })),
    };
  }

  async function markRead(user, ids) {
    await context(user);
    const q = { userId: user._id, readAt: null };
    if (Array.isArray(ids) && ids.length) q._id = { $in: ids.map(oid).filter(Boolean) };
    await PanelNotification.updateMany(q, { readAt: new Date(clock()) });
    return { ok: true };
  }

  return {
    ensureBarber,
    needsCompletion,
    context,
    me,
    updateProfile,
    setServices,
    setAvailability,
    setHomeService,
    addTimeOff,
    removeTimeOff,
    addPhotos,
    removePhoto,
    mainPhoto,
    submit,
    setMembershipStatus,
    agendaRange,
    slots,
    viewAppointment,
    act,
    invite,
    notifications,
    markRead,
  };
}
