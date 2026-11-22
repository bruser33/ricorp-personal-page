/* Avisos al cliente por WhatsApp (SPEC-53): confirmación y recordatorio de cada cita.

   - Canal OPCIONAL (RN-01): se suma al correo, nunca lo reemplaza. Nada de lo que pase acá
     rompe una reserva: los errores se loguean y la cita sigue.
   - Opt-in explícito (RN-02) guardado en User.whatsappOptIn.
   - Cola en OutboundMessage + despachador que corre en el intervalo de 60 s de index.js.
   - Sin credenciales de Meta (o WHATSAPP_DRY_RUN=1) todo funciona igual, pero el envío queda
     "Simulado" y no sale nada hacia Meta.
   Los tests inyectan el reloj y el `fetch` de Meta; la BD siempre es real. */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Appointment, Business, FINAL, OutboundMessage, User, WaInbound } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/db.js';
import { clMobile } from '../lib/validate.js';
import { sha256 } from '../lib/session.js';
import { classify, maskPhone, TEMPLATES } from '../lib/whatsapp.js';
import { addDays, wallClock, zonedToUtc } from './time.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Anticipación del recordatorio (chips de Configuración). */
export const REMINDER_OPTIONS = [
  ['2h', '2 horas antes'],
  ['4h', '4 horas antes'],
  ['1d', 'El día anterior'],
  ['2d', 'Dos días antes'],
  ['off', 'No mandar'],
];
export const MESSAGE_STATUS_LABEL = {
  por_salir: 'Por salir',
  enviando: 'Enviando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  fallido: 'No salió',
  frenado: 'Frenado',
  no_aplica: 'Ya no aplica',
  simulado: 'Simulado',
};
export const KIND_LABEL = { confirmation: 'CONFIRMACIÓN', reminder: 'RECORDATORIO' };

/* Reintentos de errores transitorios (red, 5xx, 429): 3 reintentos, a 1, 5 y 15 min. */
export const RETRY_DELAYS_MIN = [1, 5, 15];
export const LEASE_MIN = 2;
export const BATCH = 20;
/* Un recordatorio atrasado (Render dormido) sale solo si faltan ≥ 60 min para la cita. */
export const LATE_LIMIT_MIN = 60;
/* RN-04: no se programa un recordatorio a menos de 30 min de la confirmación. */
export const MIN_GAP_MIN = 30;
/* CB-08: con credenciales inválidas los mensajes esperan y se reintentan cada 5 min. */
export const AUTH_RETRY_MIN = 5;
/* Palabras para darse de baja (sin importar mayúsculas ni tildes). */
export const OPT_OUT_WORDS = ['BAJA', 'STOP', 'NO'];

const STOP_REASON = {
  cancelada: 'La cita se canceló',
  expirada: 'La cita expiró',
  no_asistio: 'El cliente no asistió',
  terminada: 'La cita ya terminó',
  en_curso: 'La cita ya empezó',
};
const CONFIG_REASONS = ['Recordatorios desactivados', 'Con la nueva anticipación ya no alcanza'];

export const optedIn = (u) => Boolean(u && u.status !== 'deleted' && u.whatsappOptIn?.accepted === true && clMobile(u.phoneE164));

/* Momento "ideal" del recordatorio según la anticipación (RN-04). */
export function reminderPlan(startsMs, option, tz) {
  if (option === '2h') return startsMs - 2 * HOUR;
  if (option === '4h') return startsMs - 4 * HOUR;
  const date = wallClock(startsMs, tz).date;
  if (option === '1d') return zonedToUtc(addDays(date, -1), '18:00', tz);
  if (option === '2d') return zonedToUtc(addDays(date, -2), '18:00', tz);
  return null;
}

/* RN-04 + horario de silencio (22:00–08:00, hora local): lo que cae ahí se adelanta a las 21:00
   o se atrasa a las 08:00, lo que quede más cerca sin pasar de la cita − 60 min. null = no se
   programa (ya pasó, queda a menos de 30 min de ahora o no alcanza). */
export function reminderSendAt({ startsMs, option, now, tz }) {
  const planned = reminderPlan(startsMs, option, tz);
  if (planned == null) return null;
  const earliest = now + MIN_GAP_MIN * MIN;
  const latest = startsMs - LATE_LIMIT_MIN * MIN;
  const ok = (t) => t >= earliest && t <= latest;
  const w = wallClock(planned, tz);
  const m = w.hour * 60 + w.minute;
  const quiet = m >= 22 * 60 || m < 8 * 60;
  if (!quiet) return ok(planned) ? planned : null;
  const nightOf = m >= 22 * 60 ? w.date : addDays(w.date, -1);
  const before = zonedToUtc(nightOf, '21:00', tz);
  const after = zonedToUtc(addDays(nightOf, 1), '08:00', tz);
  const [best] = [before, after].filter(ok).sort((a, b) => Math.abs(a - planned) - Math.abs(b - planned) || a - b);
  return best ?? null;
}

/* Variables de las plantillas: {{1}} nombre de pila, {{2}} servicio, {{3}} barbero, {{4}} fecha, {{5}} hora.
   RN-07: nunca el email, el precio ni datos de pago. */
export function templateParams(appt, tz, userName = '') {
  const first = String(appt.customerSnapshot?.name || userName || '').trim().split(/\s+/)[0] || 'cliente';
  const date = new Intl.DateTimeFormat('es-CL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(appt.startsAt).replace(',', '');
  return [first, appt.serviceSnapshot?.name || 'tu servicio', appt.professionalSnapshot?.displayName || 'tu barbero', date, wallClock(appt.startsAt.getTime(), tz).time];
}

/* Texto final, tal como lo verá el cliente (cuerpo + botón + pie). */
export function renderMessage(kind, p, { link, shopWhatsapp }) {
  const body =
    kind === 'confirmation'
      ? `Hola ${p[0]}, tu hora en WS Style quedó confirmada: ${p[1]} con ${p[2]}, el ${p[3]} a las ${p[4]}. Si no puedes venir, avísanos desde el link para dárselo a otra persona.`
      : `Hola ${p[0]}, te recordamos tu hora en WS Style: ${p[1]} con ${p[2]}, ${p[3]} a las ${p[4]}. ¿No alcanzas a llegar? Cancela desde el link y liberamos la hora.`;
  const foot = `Este número solo envía avisos. Para hablar con nosotros escribe al ${shopWhatsapp || 'WhatsApp del local'}`;
  return `${body}\n\n[Ver o cancelar mi cita] ${link}\n\n${foot}`;
}

const normWord = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();

export function createMessaging({ clock = Date.now, logger = console, whatsapp, adminInbox = null, frontUrl = 'http://localhost:5173', businessSlug = 'ws-style', env = {} }) {
  const wa = whatsapp;
  const shopLink = (b) => (b?.contact?.whatsapp ? `wa.me/${String(b.contact.whatsapp).replace(/\D/g, '')}` : null);
  const settingsOf = (b) => ({ confirmEnabled: b?.whatsapp?.confirmEnabled !== false, reminder: b?.whatsapp?.reminder || '1d' });

  async function business() {
    return Business.findOne({ slug: businessSlug }).lean();
  }

  async function insertOnce(doc) {
    try {
      return await OutboundMessage.create(doc);
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  /* ─── Programación (hooks de la máquina de estados). `prev` = { status, startsAt } antes del cambio
     (null si la cita recién se creó). Nunca lanza. */
  async function onAppointmentChanged(appt, prev = null) {
    try {
      const b = await business();
      if (!b || String(appt.businessId) !== String(b._id)) return;
      const now = clock();
      if (appt.status === 'confirmada') {
        /* Se movió antes de que saliera la confirmación: la confirmación sigue, con la hora nueva. */
        await OutboundMessage.updateMany(
          { appointmentId: appt._id, kind: 'confirmation', status: 'por_salir', apptStartsAt: { $ne: appt.startsAt } },
          { $set: { apptStartsAt: appt.startsAt } }
        );
        /* Se movió (propuesta aceptada, reprogramación): el recordatorio de la hora vieja ya no aplica. */
        await OutboundMessage.updateMany(
          { appointmentId: appt._id, kind: 'reminder', status: 'por_salir', apptStartsAt: { $ne: appt.startsAt } },
          { $set: { status: 'no_aplica', reason: 'La cita cambió de hora' }, $unset: { leaseUntil: 1 } }
        );
        if (appt.startsAt.getTime() <= now || !appt.customerUserId) return;
        const user = await User.findById(appt.customerUserId).lean();
        if (!optedIn(user)) return;
        const cfg = settingsOf(b);
        const base = { businessId: b._id, appointmentId: appt._id, userId: user._id, apptStartsAt: appt.startsAt, phoneE164: user.phoneE164 };
        /* RN-03 / asunción 6: la confirmación sale solo la PRIMERA vez que la cita llega a confirmada. */
        const firstTime = (appt.history || []).filter((h) => h.to === 'confirmada').length <= 1 && prev?.status !== 'confirmada';
        if (cfg.confirmEnabled && firstTime && !(await OutboundMessage.exists({ appointmentId: appt._id, kind: 'confirmation' }))) {
          await insertOnce({ ...base, kind: 'confirmation', template: TEMPLATES.confirmation, sendAt: new Date(now) });
        }
        const at = reminderSendAt({ startsMs: appt.startsAt.getTime(), option: cfg.reminder, now, tz: b.timezone });
        const existing = await OutboundMessage.findOne({ appointmentId: appt._id, kind: 'reminder', apptStartsAt: appt.startsAt }).lean();
        if (!existing) {
          if (at != null) await insertOnce({ ...base, kind: 'reminder', template: TEMPLATES.reminder, sendAt: new Date(at) });
        } else if (existing.status === 'no_aplica' && at != null) {
          /* Volvió a la misma hora (propuesta caducada, ida y vuelta): el recordatorio revive. "Frenado" por Joe no. */
          await OutboundMessage.updateOne({ _id: existing._id, status: 'no_aplica' }, { $set: { status: 'por_salir', sendAt: new Date(at), userId: user._id, phoneE164: user.phoneE164 }, $unset: { reason: 1 } });
        }
        return;
      }
      if (FINAL.includes(appt.status) || appt.status === 'en_curso') {
        await OutboundMessage.updateMany(
          { appointmentId: appt._id, status: 'por_salir' },
          { $set: { status: 'no_aplica', reason: STOP_REASON[appt.status] || 'La cita cambió' }, $unset: { leaseUntil: 1 } }
        );
      }
      /* propuesta_cambio: el recordatorio espera; el despachador revisa la cita antes de enviar (RN-05). */
    } catch (err) {
      logger.error('[wa] programar:', err.message);
    }
  }

  /* ─── Opt-in (RN-02) */
  async function stopPendingFor(userId, reason = 'El cliente se dio de baja') {
    if (!userId) return 0;
    const r = await OutboundMessage.updateMany({ userId, status: 'por_salir' }, { $set: { status: 'no_aplica', reason }, $unset: { leaseUntil: 1 } });
    return r.modifiedCount ?? 0;
  }

  async function setOptIn(userId, accepted, { phone = null, source = 'reserva' } = {}) {
    const user = await User.findById(userId);
    if (!user) return null;
    const p = phone || user.phoneE164 || null;
    user.whatsappOptIn = { accepted: Boolean(accepted), at: new Date(clock()), phoneE164: p, source };
    await user.save();
    if (!accepted) await stopPendingFor(user._id);
    return user;
  }

  /* ─── Despachador (corre cada 60 s). */
  async function runDispatch() {
    const now = clock();
    const out = { sent: 0, simulated: 0, retried: 0, failed: 0, skipped: 0, auth: 0 };
    /* Lease vencido: el proceso murió a mitad de un envío → vuelve a la cola. */
    await OutboundMessage.updateMany({ status: 'enviando', leaseUntil: { $lt: new Date(now) } }, { $set: { status: 'por_salir' }, $unset: { leaseUntil: 1 } });
    const b = await business();
    if (!b) return out;
    for (let i = 0; i < BATCH; i++) {
      /* Claim atómico (CB-10): un mensaje lo toma un solo despachador. */
      const msg = await OutboundMessage.findOneAndUpdate(
        { businessId: b._id, status: 'por_salir', sendAt: { $lte: new Date(now) } },
        { $set: { status: 'enviando', leaseUntil: new Date(now + LEASE_MIN * MIN) } },
        { sort: { sendAt: 1 }, new: true }
      );
      if (!msg) break;
      let r;
      try {
        r = await deliver(b, msg, now);
      } catch (err) {
        logger.error('[wa] despachar:', err.message);
        await OutboundMessage.updateOne({ _id: msg._id, status: 'enviando' }, { $set: { status: 'por_salir', sendAt: new Date(now + MIN) }, $unset: { leaseUntil: 1 } });
        r = 'retried';
      }
      out[r]++;
      /* CB-08: con el token inválido no tiene sentido seguir esta vuelta. */
      if (r === 'auth') break;
    }
    return out;
  }

  const finish = (msg, set, unset = {}) =>
    OutboundMessage.updateOne({ _id: msg._id, status: 'enviando' }, { $set: set, $unset: { leaseUntil: 1, ...unset } });

  async function deliver(b, msg, now) {
    const appt = await Appointment.findById(msg.appointmentId).lean();
    /* RN-05: la cita se relee antes de enviar. */
    if (!appt || appt.status !== 'confirmada' || appt.startsAt.getTime() !== msg.apptStartsAt.getTime()) {
      await finish(msg, { status: 'no_aplica', reason: !appt ? 'La cita ya no existe' : appt.status !== 'confirmada' ? STOP_REASON[appt.status] || 'La cita ya no está confirmada' : 'La cita cambió de hora' });
      return 'skipped';
    }
    const left = appt.startsAt.getTime() - now;
    if ((msg.kind === 'reminder' && left < LATE_LIMIT_MIN * MIN) || left <= 0) {
      await finish(msg, { status: 'no_aplica', reason: 'Llegó tarde' });
      return 'skipped';
    }
    /* Horario de silencio también al ENVIAR (servidor que despertó de noche, reintentos): el recordatorio
       espera hasta las 08:00 si aún alcanza (cita − 60 min); si no, llegó tarde. */
    if (msg.kind === 'reminder') {
      const w = wallClock(now, b.timezone);
      const m = w.hour * 60 + w.minute;
      if (m >= 22 * 60 || m < 8 * 60) {
        const morning = zonedToUtc(m >= 22 * 60 ? addDays(w.date, 1) : w.date, '08:00', b.timezone);
        if (morning <= appt.startsAt.getTime() - LATE_LIMIT_MIN * MIN) await finish(msg, { status: 'por_salir', sendAt: new Date(morning) });
        else await finish(msg, { status: 'no_aplica', reason: 'Llegó tarde' });
        return 'skipped';
      }
    }
    const user = await User.findById(msg.userId || appt.customerUserId).lean();
    if (!optedIn(user)) {
      await finish(msg, { status: 'no_aplica', reason: user?.status === 'deleted' ? 'Cuenta eliminada' : !clMobile(user?.phoneE164) ? 'Sin celular válido' : 'El cliente se dio de baja' });
      return 'skipped';
    }
    const phone = clMobile(user.phoneE164);
    const params = templateParams(appt, b.timezone, user.name);
    const token = crypto.randomBytes(24).toString('base64url');
    const suffix = `id=${appt._id}&t=${token}`;
    const fullLink = `${frontUrl}/wstyle/cita/?${suffix}`;
    const shown = wa.live ? `${frontUrl}/wstyle/cita/?id=${appt._id}&t=…` : fullLink;
    const renderedText = renderMessage(msg.kind, params, { link: shown, shopWhatsapp: shopLink(b) });
    const addToken = () => Appointment.updateOne({ _id: appt._id }, { $push: { guestTokens: { hash: sha256(token), at: new Date(now) } } });

    if (!wa.live) {
      await addToken();
      await finish(msg, { status: 'simulado', params, renderedText, phoneE164: phone, sentAt: new Date(now) });
      logger.log(`[wa] dry-run → ${maskPhone(phone)} · ${msg.template}`);
      return 'simulated';
    }
    let r;
    try {
      r = await wa.sendTemplate({ to: phone, template: msg.template, params, buttonSuffix: suffix });
    } catch (err) {
      return failed(b, msg, err, { params, renderedText, phone, now });
    }
    /* Ya salió: desde acá un error de la BD no puede marcarlo "No salió" (se reintenta guardar el token). */
    await addToken().catch(() => addToken());
    await finish(msg, { status: 'enviado', waMessageId: r.id, params, renderedText, phoneE164: phone, sentAt: new Date(now), attempts: msg.attempts + 1 }, { lastError: 1, errorKind: 1, errorCode: 1 });
      if (b.whatsapp?.authFailedAt) await Business.updateOne({ _id: b._id }, { $unset: { 'whatsapp.authFailedAt': 1 } });
    logger.log(`[wa] enviado → ${maskPhone(phone)} · ${msg.template}`);
    return 'sent';
  }

  async function failed(b, msg, err, { params, renderedText, phone, now }) {
    {
      const e = err?.kind ? err : classify(0, {});
      const attempts = msg.attempts + 1;
      const common = { params, renderedText, phoneE164: phone, attempts, lastError: e.message, errorKind: e.kind, ...(e.code != null && Number.isFinite(e.code) ? { errorCode: e.code } : {}) };
      logger.error(`[wa] ${msg.template} → ${maskPhone(phone)}: ${e.message}`);
      if (e.kind === 'auth') {
        await finish(msg, { ...common, status: 'por_salir', sendAt: new Date(now + AUTH_RETRY_MIN * MIN) });
        await Business.updateOne({ _id: b._id }, { $set: { 'whatsapp.authFailedAt': new Date(now) } });
        return 'auth';
      }
      if (e.kind === 'transient' && attempts <= RETRY_DELAYS_MIN.length) {
        await finish(msg, { ...common, status: 'por_salir', sendAt: new Date(now + RETRY_DELAYS_MIN[attempts - 1] * MIN) });
        return 'retried';
      }
      await finish(msg, { ...common, status: 'fallido', failedAt: new Date(now) });
      if (e.kind === 'template') await alertTemplate(b, msg.template);
      return 'failed';
    }
  }

  /* CB-07: aviso ÚNICO por plantilla no aprobada (no uno por cita). */
  async function alertTemplate(b, template) {
    const r = await Business.updateOne({ _id: b._id, 'whatsapp.templateAlerts': { $ne: template } }, { $addToSet: { 'whatsapp.templateAlerts': template } });
    if (!r.modifiedCount) return;
    await adminInbox?.notify({
      kind: 'whatsapp_template',
      title: `WhatsApp: la plantilla ${template} no está aprobada`,
      body: 'Meta rechazó el envío porque la plantilla está pausada, rechazada o no existe. Revísala en el WhatsApp Manager de Meta; mientras tanto esos avisos no salen (el correo sigue igual).',
      path: 'mensajes/',
    });
  }

  /* ─── Webhook de Meta */
  function webhookVerify(q = {}) {
    if (q['hub.mode'] === 'subscribe' && wa.validVerifyToken(String(q['hub.verify_token'] ?? ''))) return [200, String(q['hub.challenge'] ?? '')];
    return [403, { ok: false, error: 'forbidden' }];
  }

  async function webhookReceive(raw, signature, body) {
    if (!wa.validSignature(raw, signature)) return [401, { ok: false, error: 'invalid_signature' }];
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const v = change?.value || {};
        for (const s of v.statuses || []) await applyStatus(s).catch((err) => logger.error('[wa] estado:', err.message));
        for (const m of v.messages || []) await inbound(m, v.contacts || []).catch((err) => logger.error('[wa] entrante:', err.message));
      }
    }
    return [200, { ok: true }];
  }

  /* CB-09: idempotente y monótono (nunca retrocede de Leído a Entregado). */
  async function applyStatus(s) {
    const id = String(s?.id || '');
    if (!id) return;
    const at = new Date(Number(s.timestamp) > 0 ? Number(s.timestamp) * 1000 : clock());
    if (s.status === 'delivered') {
      await OutboundMessage.updateOne({ waMessageId: id, status: 'enviado' }, { $set: { status: 'entregado', deliveredAt: at } });
    } else if (s.status === 'read') {
      await OutboundMessage.updateOne({ waMessageId: id, status: { $in: ['enviado', 'entregado'] } }, { $set: { status: 'leido', readAt: at } });
      await OutboundMessage.updateOne({ waMessageId: id, deliveredAt: null }, { $set: { deliveredAt: at } });
    } else if (s.status === 'failed') {
      const e = classify(0, s.errors?.[0] || {});
      await OutboundMessage.updateOne({ waMessageId: id, status: 'enviado' }, { $set: { status: 'fallido', failedAt: at, lastError: e.message, errorKind: e.kind === 'transient' ? 'transient' : 'permanent', ...(Number.isFinite(e.code) ? { errorCode: e.code } : {}) } });
    }
  }

  async function inbound(m, contacts) {
    const id = String(m?.id || '');
    if (!id) return;
    try {
      await WaInbound.create({ waMessageId: id, from: String(m.from || '') });
    } catch (err) {
      if (isDuplicateKey(err)) return;
      throw err;
    }
    const phone = clMobile(m.from) || (m.from ? `+${String(m.from).replace(/\D/g, '')}` : null);
    if (!phone) return;
    const text = String(m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? '').trim();
    const users = await User.find({ phoneE164: phone, status: 'active' });
    const b = await business();
    if (OPT_OUT_WORDS.includes(normWord(text))) {
      for (const u of users) await setOptIn(u._id, false, { phone, source: 'whatsapp' });
      await WaInbound.updateOne({ waMessageId: id }, { $set: { kind: 'opt_out' } });
      await reply(phone, 'Listo, no te enviaremos más avisos por WhatsApp. Si quieres volver a recibirlos, actívalos en tu cuenta de WS Style.');
      return;
    }
    const name = users[0]?.name || contacts.find((c) => c?.wa_id === m.from)?.profile?.name || maskPhone(phone);
    await adminInbox?.notify({
      kind: 'whatsapp_reply',
      title: `${name} respondió por WhatsApp`,
      body: (text || `(${m.type || 'mensaje'} sin texto)`).slice(0, 300),
      path: 'mensajes/',
      email: false,
    });
    /* Ventana de 24 h abierta por el cliente: la respuesta de texto es gratis. */
    const shop = shopLink(b);
    await reply(phone, `Este número solo envía avisos. Escríbenos al ${shop ? `https://${shop}` : 'WhatsApp del local'}`);
  }

  async function reply(phone, text) {
    if (!wa.live) {
      logger.log(`[wa] dry-run respuesta → ${maskPhone(phone)}`);
      return;
    }
    try {
      await wa.sendText({ to: phone, text });
    } catch (err) {
      logger.error(`[wa] respuesta automática → ${maskPhone(phone)}: ${err.message}`);
    }
  }

  /* ─── Panel del super admin (la autorización y la auditoría las pone domain/admin.js). */
  function channelView(b) {
    const s = wa.status;
    const display = String(env.WHATSAPP_DISPLAY_NUMBER || '').trim();
    if (s.mode === 'live' && b?.whatsapp?.authFailedAt) return { mode: 'auth_failed', label: 'Credenciales inválidas: Meta rechazó el token. Hay que generar uno nuevo y cargarlo en el servidor.', missing: [], webhookMissing: s.webhookMissing };
    if (s.mode === 'live') return { mode: 'live', label: `Conectado${display ? ` · número ${display}` : ''}`, missing: [], webhookMissing: s.webhookMissing };
    if (s.mode === 'incomplete') return { mode: 'incomplete', label: `Credenciales incompletas: falta ${s.missing.join(' y ')}`, missing: s.missing, webhookMissing: s.webhookMissing };
    return { mode: 'dry-run', label: s.forced ? 'Modo simulación (WHATSAPP_DRY_RUN=1): no sale nada hacia Meta' : 'Modo simulación (sin credenciales): no sale nada hacia Meta', missing: s.missing, webhookMissing: s.webhookMissing };
  }

  function sampleTexts(b) {
    const appt = { customerSnapshot: { name: 'Pedro' }, serviceSnapshot: { name: 'Corte + barba' }, professionalSnapshot: { displayName: 'Joe' }, startsAt: new Date(zonedToUtc(addDays(wallClock(clock(), b.timezone).date, 2), '16:30', b.timezone)) };
    const p = templateParams(appt, b.timezone);
    const link = `${frontUrl}/wstyle/cita/?id=…`;
    return { confirmation: renderMessage('confirmation', p, { link, shopWhatsapp: shopLink(b) }), reminder: renderMessage('reminder', p, { link, shopWhatsapp: shopLink(b) }) };
  }

  async function monthSent(b) {
    const w = wallClock(clock(), b.timezone);
    const from = new Date(zonedToUtc(`${w.date.slice(0, 7)}-01`, '00:00', b.timezone));
    return OutboundMessage.countDocuments({ businessId: b._id, sentAt: { $gte: from }, status: { $in: ['enviado', 'entregado', 'leido'] } });
  }

  async function config(b) {
    const cfg = settingsOf(b);
    return {
      channel: channelView(b),
      confirmEnabled: cfg.confirmEnabled,
      reminder: cfg.reminder,
      options: REMINDER_OPTIONS.map(([id, label]) => ({ id, label })),
      preview: sampleTexts(b),
      monthSent: await monthSent(b),
    };
  }

  /* Cambia la configuración. Cambiar la anticipación re-programa los recordatorios de citas futuras. */
  async function setConfig(b, body = {}) {
    const unknown = Object.keys(body).filter((k) => !['confirmEnabled', 'reminder'].includes(k));
    if (unknown.length) throw new HttpError(400, 'unknown_field', `No se puede configurar "${unknown[0]}" desde el panel. Las credenciales de WhatsApp van en el servidor.`, { fields: Object.fromEntries(unknown.map((k) => [k, 'not_allowed'])) });
    const fields = {};
    const set = {};
    if (body.confirmEnabled !== undefined) {
      if (typeof body.confirmEnabled !== 'boolean') fields.confirmEnabled = 'invalid';
      else set['whatsapp.confirmEnabled'] = body.confirmEnabled;
    }
    if (body.reminder !== undefined) {
      if (!REMINDER_OPTIONS.some(([k]) => k === body.reminder)) fields.reminder = 'invalid';
      else set['whatsapp.reminder'] = body.reminder;
    }
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], 'Revisa los valores', { fields });
    const before = settingsOf(b);
    if (Object.keys(set).length) await Business.updateOne({ _id: b._id }, { $set: set });
    const fresh = await Business.findById(b._id).lean();
    const after = settingsOf(fresh);
    let rescheduled = 0;
    if (after.reminder !== before.reminder) rescheduled = await rescheduleReminders(fresh);
    return { before, after, rescheduled };
  }

  async function rescheduleReminders(b) {
    const now = clock();
    const option = settingsOf(b).reminder;
    let changed = 0;
    const appts = await Appointment.find({ businessId: b._id, status: 'confirmada', startsAt: { $gt: new Date(now) } }, { startsAt: 1, customerUserId: 1 }).lean();
    for (const a of appts) {
      const at = reminderSendAt({ startsMs: a.startsAt.getTime(), option, now, tz: b.timezone });
      const current = await OutboundMessage.findOne({ appointmentId: a._id, kind: 'reminder', apptStartsAt: a.startsAt });
      if (current) {
        const revivable = current.status === 'no_aplica' && CONFIG_REASONS.includes(current.reason);
        if (current.status !== 'por_salir' && !revivable) continue;
        if (at == null) {
          if (current.status === 'por_salir') {
            const r = await OutboundMessage.updateOne({ _id: current._id, status: 'por_salir' }, { $set: { status: 'no_aplica', reason: option === 'off' ? CONFIG_REASONS[0] : CONFIG_REASONS[1] } });
            changed += r.modifiedCount;
          }
          continue;
        }
        const r = await OutboundMessage.updateOne({ _id: current._id, status: current.status }, { $set: { status: 'por_salir', sendAt: new Date(at) }, $unset: { reason: 1 } });
        changed += r.modifiedCount;
        continue;
      }
      if (at == null || !a.customerUserId) continue;
      const user = await User.findById(a.customerUserId).lean();
      if (!optedIn(user)) continue;
      const doc = await insertOnce({ businessId: b._id, appointmentId: a._id, userId: user._id, kind: 'reminder', template: TEMPLATES.reminder, apptStartsAt: a.startsAt, phoneE164: user.phoneE164, sendAt: new Date(at) });
      if (doc) changed++;
    }
    return changed;
  }

  async function serializeMessage(m, appt, { detail = false, b = null } = {}) {
    const now = clock();
    const out = {
      id: String(m._id),
      kind: m.kind,
      kindLabel: KIND_LABEL[m.kind],
      status: m.status,
      statusLabel: MESSAGE_STATUS_LABEL[m.status],
      appointmentId: String(m.appointmentId),
      customer: appt?.customerSnapshot?.name || 'Cliente',
      phone: maskPhone(m.phoneE164),
      service: appt?.serviceSnapshot?.name || '',
      professional: appt?.professionalSnapshot?.displayName || '',
      apptStartsAt: m.apptStartsAt.toISOString(),
      sendAt: m.sendAt.toISOString(),
      sentAt: m.sentAt ? m.sentAt.toISOString() : null,
      deliveredAt: m.deliveredAt ? m.deliveredAt.toISOString() : null,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      attempts: m.attempts || 0,
      error: m.status === 'fallido' || (m.status === 'por_salir' && m.lastError) ? m.lastError || null : null,
      reason: m.reason || null,
      canStop: m.status === 'por_salir',
      canRetry: m.status === 'fallido' && m.errorKind === 'transient' && m.apptStartsAt.getTime() > now,
    };
    if (detail) {
      let text = m.renderedText;
      if (!text && appt && b) text = renderMessage(m.kind, templateParams(appt, b.timezone), { link: `${frontUrl}/wstyle/cita/?id=${appt._id}&t=…`, shopWhatsapp: shopLink(b) });
      out.text = text || '';
      out.template = m.template;
      out.preview = !m.renderedText;
    }
    return out;
  }

  /* KPIs + lista "Uno por uno" (filtros por estado y tipo; búsqueda por cliente o teléfono). */
  async function list(b, q = {}) {
    const now = clock();
    const week = new Date(now - 7 * DAY);
    const filter = { businessId: b._id };
    const status = String(q.status || '');
    if (status && MESSAGE_STATUS_LABEL[status]) filter.status = status;
    const kind = String(q.kind || '');
    if (kind === 'confirmation' || kind === 'reminder') filter.kind = kind;
    const term = String(q.q || '').trim().slice(0, 60);
    if (term) {
      const digits = term.replace(/\D/g, '');
      const or = [{ 'customerSnapshot.name': new RegExp(escapeRe(term), 'i') }];
      if (digits.length >= 3) or.push({ 'customerSnapshot.phoneE164': new RegExp(escapeRe(digits)) });
      const ids = await Appointment.distinct('_id', { businessId: b._id, $or: or });
      filter.$or = [{ appointmentId: { $in: ids } }, ...(digits.length >= 3 ? [{ phoneE164: new RegExp(escapeRe(digits)) }] : [])];
    }
    const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
    const per = 50;
    const [items, total, pending, delivered, failed, next, sentThisMonth] = await Promise.all([
      OutboundMessage.find(filter).sort({ sendAt: -1, _id: -1 }).skip((page - 1) * per).limit(per).lean(),
      OutboundMessage.countDocuments(filter),
      OutboundMessage.countDocuments({ businessId: b._id, status: 'por_salir' }),
      OutboundMessage.countDocuments({ businessId: b._id, status: { $in: ['entregado', 'leido'] }, sentAt: { $gte: week } }),
      OutboundMessage.countDocuments({ businessId: b._id, status: 'fallido', updatedAt: { $gte: week } }),
      OutboundMessage.findOne({ businessId: b._id, status: 'por_salir' }).sort({ sendAt: 1 }).lean(),
      monthSent(b),
    ]);
    const appts = new Map((await Appointment.find({ _id: { $in: items.map((m) => m.appointmentId) } }, { customerSnapshot: 1, serviceSnapshot: 1, professionalSnapshot: 1, startsAt: 1 }).lean()).map((a) => [String(a._id), a]));
    return {
      kpis: { pending, delivered7d: delivered, failed7d: failed, nextSendAt: next ? next.sendAt.toISOString() : null, monthSent: sentThisMonth },
      channel: channelView(b),
      page,
      pages: Math.max(1, Math.ceil(total / per)),
      total,
      items: await Promise.all(items.map((m) => serializeMessage(m, appts.get(String(m.appointmentId))))),
    };
  }

  async function loadMessage(b, id) {
    const _id = oid(id);
    const m = _id ? await OutboundMessage.findOne({ _id, businessId: b._id }).lean() : null;
    if (!m) throw new HttpError(404, 'not_found', 'No encontramos ese mensaje');
    return m;
  }

  async function detail(b, id) {
    const m = await loadMessage(b, id);
    const appt = await Appointment.findById(m.appointmentId).lean();
    return serializeMessage(m, appt, { detail: true, b });
  }

  /* [No mandarlo] (CB-11): gana el primero; si el despachador ya lo tomó → 409. */
  async function stop(b, id, actor) {
    const m = await loadMessage(b, id);
    const r = await OutboundMessage.findOneAndUpdate({ _id: m._id, status: 'por_salir' }, { $set: { status: 'frenado', stoppedBy: actor, reason: 'Frenado desde el panel' } }, { new: true }).lean();
    if (!r) {
      const cur = await OutboundMessage.findById(m._id).lean();
      if (cur?.status === 'enviando') throw new HttpError(409, 'already_sending', 'Ya está saliendo');
      throw new HttpError(409, 'invalid_transition', 'Este mensaje ya no está por salir. Recarga para ver el estado actual.');
    }
    const appt = await Appointment.findById(r.appointmentId).lean();
    return { message: await serializeMessage(r, appt, { detail: true, b }), appt };
  }

  /* [Reintentar]: solo "No salió" por un error transitorio y con la cita aún futura. */
  async function retry(b, id) {
    const m = await loadMessage(b, id);
    const now = clock();
    const r = await OutboundMessage.findOneAndUpdate(
      { _id: m._id, status: 'fallido', errorKind: 'transient', apptStartsAt: { $gt: new Date(now) } },
      { $set: { status: 'por_salir', sendAt: new Date(now), attempts: 0 }, $unset: { lastError: 1, failedAt: 1, errorKind: 1, errorCode: 1 } },
      { new: true }
    ).lean();
    if (!r) throw new HttpError(409, 'invalid_transition', 'Este mensaje no se puede reintentar.');
    const appt = await Appointment.findById(r.appointmentId).lean();
    return { message: await serializeMessage(r, appt, { detail: true, b }), appt };
  }

  /* ─── Link "Ver o cancelar mi cita" sin sesión: el token sirve hasta el fin de la cita. */
  function validGuestToken(appt, t, now = clock()) {
    if (!t || typeof t !== 'string' || t.length > 100) return false;
    if (!(appt.endsAt?.getTime() > now)) return false;
    const h = sha256(t);
    return (appt.guestTokens || []).some((g) => g.hash === h);
  }

  return {
    live: wa.live,
    onAppointmentChanged,
    setOptIn,
    stopPendingFor,
    runDispatch,
    webhookVerify,
    webhookReceive,
    config,
    setConfig,
    list,
    detail,
    stop,
    retry,
    validGuestToken,
  };
}
