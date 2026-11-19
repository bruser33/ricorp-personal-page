/* Seña por transferencia bancaria (SPEC-56). El dueño la pide al reservar a todos, a los
   clientes nuevos o a los que ya faltaron una vez; el cliente transfiere y sube el comprobante
   antes del plazo; el super admin la confirma o la rechaza a mano (sin conciliación bancaria).

   Estados de la seña (Appointment.deposit.status):
     por_pagar → en_revision → confirmada → (por_devolver → devuelta)
              ↘ vencida        ↘ rechazada
     anulada = el cliente cambió a pagar en línea (CB-08).
   La cita nace `pendiente_sena` (ocupa la hora) y, al subir el comprobante, pasa a `pendiente`
   (flujo normal: la confirma el barbero). Sin comprobante a tiempo, `runDeposits` la deja
   `expirada` y libera la hora. */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Appointment, AuditLog, Business, CustomerProfile, DEPOSIT_OPEN, Notification, SlotLock, User } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isEmail, normEmail } from '../lib/validate.js';
import { depositMail } from '../lib/emails.js';
import { normalizeReceipt, receiptKey } from '../lib/receipts.js';
import { formatLong, wallClock } from './time.js';
import { currentRates, quote } from './pricing.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);

/* RN-03: sin O, I, 0 ni 1 (se confunden al dictar o copiar a mano). */
export const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEPOSIT_MINUTES = [15, 30, 60];
export const DEPOSIT_MIN_CLP = 1000;
/* RN-04: el plazo termina a más tardar 30 min antes de la cita, y tiene que dar al menos 10 min. */
export const DEADLINE_BEFORE_START_MIN = 30;
export const MIN_WINDOW_MIN = 10;
/* §10: los comprobantes se borran 12 meses después de la cita (los metadatos quedan). */
export const RECEIPT_RETENTION_DAYS = 365;
export const ACCOUNT_TYPES = { corriente: 'Cuenta corriente', vista: 'Cuenta vista', rut: 'Cuenta RUT', ahorro: 'Cuenta de ahorro' };
export const REJECT_REASONS = { monto: 'Monto distinto', no_llego: 'No llegó a la cuenta', ilegible: 'Comprobante ilegible', otro: 'Otro' };
export const DEPOSIT_LABEL = {
  por_pagar: 'Esperando seña',
  en_revision: 'Seña en revisión',
  confirmada: 'Seña confirmada',
  rechazada: 'Seña rechazada',
  vencida: 'Seña vencida',
  por_devolver: 'Seña por devolver',
  devuelta: 'Seña devuelta',
  anulada: 'Seña anulada',
};
const APPLIES_LABEL = { all: 'Todos los clientes', new: 'Solo clientes nuevos', no_show: 'Solo clientes con una inasistencia previa' };

export function makeReference(rand = crypto.randomBytes) {
  const bytes = rand(4);
  return 'WS-' + [...bytes].map((x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
}

/* RN-02: fijo, o % de servicio + domicilio (sin la tarifa de servicio) redondeado hacia arriba a
   $100; mínimo $1.000 y nunca más que el total de la cita. */
export function depositAmountCLP(cfg, pricing = {}) {
  const total = Math.round(Number(pricing.totalCLP) || 0);
  const base = Math.round(Number(pricing.priceCLP) || 0) + Math.round(Number(pricing.surchargeCLP) || 0);
  const raw = cfg.kind === 'percent' ? Math.ceil((base * Number(cfg.percent || 0)) / 100 / 100) * 100 : Math.round(Number(cfg.fixedCLP) || 0);
  return Math.min(Math.max(DEPOSIT_MIN_CLP, raw), total);
}

/* RN-04: expiresAt = min(ahora + plazo, inicio − 30 min). `tooSoon` si quedan menos de 10 min. */
export function depositDeadline(now, startsAt, minutes) {
  const deadline = Math.min(now + minutes * MIN, startsAt - DEADLINE_BEFORE_START_MIN * MIN);
  return { deadline, tooSoon: deadline - now < MIN_WINDOW_MIN * MIN };
}

/* RUT chileno con dígito verificador (módulo 11). Devuelve el RUT normalizado "12.345.678-5" o null. */
export function normalizeRut(raw) {
  const s = String(raw ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(s)) return null;
  const body = s.slice(0, -1);
  const dv = s.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  const expected = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  if (dv !== expected) return null;
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/* La configuración tal como la guarda Business.deposit (con defaults). */
export function depositConfig(b) {
  const d = b?.deposit || {};
  return {
    enabled: Boolean(d.enabled),
    kind: d.kind === 'percent' ? 'percent' : 'fixed',
    fixedCLP: Number(d.fixedCLP ?? 5000),
    percent: Number(d.percent ?? 30),
    appliesTo: ['all', 'new', 'no_show'].includes(d.appliesTo) ? d.appliesTo : 'new',
    minutes: DEPOSIT_MINUTES.includes(d.minutes) ? d.minutes : 30,
    bank: { holder: d.bank?.holder || '', rut: d.bank?.rut || '', bank: d.bank?.bank || '', accountType: d.bank?.accountType || '', accountNumber: d.bank?.accountNumber || '', email: d.bank?.email || '' },
  };
}

/* Lo que el catálogo puede decir en público: SIN datos bancarios (RN-08, AC-07). */
export const publicDepositConfig = (cfg) => ({ enabled: cfg.enabled, kind: cfg.kind, fixedCLP: cfg.fixedCLP, percent: cfg.percent, minutes: cfg.minutes, appliesTo: cfg.appliesTo });

export function bankComplete(bank = {}) {
  return Boolean(String(bank.holder || '').trim() && normalizeRut(bank.rut) && String(bank.bank || '').trim() && ACCOUNT_TYPES[bank.accountType] && String(bank.accountNumber || '').trim() && isEmail(normEmail(bank.email)));
}

export function bankView(bank = {}) {
  return {
    holder: bank.holder || '',
    rut: bank.rut || '',
    bank: bank.bank || '',
    accountType: bank.accountType || '',
    accountTypeLabel: ACCOUNT_TYPES[bank.accountType] || '',
    accountNumber: bank.accountNumber || '',
    email: bank.email || '',
  };
}

const last4 = (s) => String(s || '').replace(/\D/g, '').slice(-4);

/* ─── Regla de aplicación (RN-01). La usa la agenda al crear la cita, sin depender de este módulo. */
export function createDepositRule({ clock = Date.now } = {}) {
  /* ¿Este cliente debe dejar seña? (CB-11: la regla es excluyente, no acumulativa). */
  async function appliesTo(b, cfg, user) {
    if (cfg.appliesTo === 'all') return true;
    if (cfg.appliesTo === 'new') return !(await Appointment.exists({ businessId: b._id, customerUserId: user._id, status: 'terminada' }));
    const [profile, noShows] = await Promise.all([
      CustomerProfile.findOne({ businessId: b._id, userId: user._id }, { counters: 1 }).lean(),
      Appointment.countDocuments({ businessId: b._id, customerUserId: user._id, status: 'no_asistio' }),
    ]);
    return Math.max(profile?.counters?.noShows || 0, noShows) >= 1;
  }

  /* null = no se pide seña. Si se pide: config + plazo (o tooSoon). */
  async function check(b, user, { startsAt, now = clock() }) {
    const cfg = depositConfig(b);
    if (!cfg.enabled || !bankComplete(cfg.bank)) return null;
    if (!(await appliesTo(b, cfg, user))) return null;
    return { cfg, ...depositDeadline(now, startsAt, cfg.minutes) };
  }

  async function newReference(b) {
    for (let i = 0; i < 8; i++) {
      const ref = makeReference();
      if (!(await Appointment.exists({ businessId: b._id, 'deposit.reference': ref, 'deposit.status': { $in: DEPOSIT_OPEN } }))) return ref;
    }
    return makeReference();
  }

  /* Seña inicial que se congela en la cita (CB-07: cambiar la config no toca las existentes). */
  async function initial(b, rule, pricing) {
    return { amountCLP: depositAmountCLP(rule.cfg, pricing), reference: await newReference(b), status: 'por_pagar', deadlineAt: new Date(rule.deadline) };
  }

  return { check, appliesTo, initial, newReference };
}

/* ─── Vista de la seña en la cita, según quién mira. */
export function depositView(appt, role, b) {
  const d = appt.deposit;
  if (!d?.status) return null;
  const total = Math.round(Number(appt.pricing?.totalCLP) || 0);
  const paid = ['confirmada'].includes(d.status) ? d.amountCLP : 0;
  const out = {
    amountCLP: d.amountCLP,
    status: d.status,
    statusLabel: DEPOSIT_LABEL[d.status] || d.status,
    deadlineAt: d.deadlineAt ? d.deadlineAt.toISOString() : null,
    deadlineLabel: d.deadlineAt ? wallClock(d.deadlineAt.getTime(), b.timezone).time : null,
    /* Lo que queda por pagar en el local: con la seña confirmada se descuenta. */
    restCLP: Math.max(0, total - (paid || 0)),
    restIfPaidCLP: Math.max(0, total - d.amountCLP),
    hasReceipt: Boolean(d.receipt?.key || d.receipt?.uploadedAt),
  };
  if (role === 'client' || role === 'admin') {
    out.reference = d.reference;
    out.uploadedAt = d.receipt?.uploadedAt ? d.receipt.uploadedAt.toISOString() : null;
    out.receiptType = d.receipt?.contentType || null;
    out.rejectReason = d.rejectReason || null;
  }
  /* RN-08: los datos bancarios solo los ve el dueño de la cita mientras la seña está pendiente. */
  if (role === 'client' && DEPOSIT_OPEN.includes(d.status)) out.bank = bankView(depositConfig(b).bank);
  if (role === 'admin') {
    out.reviewedAt = d.reviewedAt ? d.reviewedAt.toISOString() : null;
    out.confirmedAt = d.confirmedAt ? d.confirmedAt.toISOString() : null;
    out.refundedAt = d.refundedAt ? d.refundedAt.toISOString() : null;
    out.receiptAvailable = Boolean(d.receipt?.key && !d.receipt?.purgedAt);
  }
  return out;
}

/* ─── Módulo completo (subida, revisión, vencimiento, configuración). */
export function createDeposits({ agenda, rule, store, clock = Date.now, logger = console, mailer, adminInbox = null, frontUrl = 'http://localhost:5173', onSlotReleased = null }) {
  const now = () => clock();
  const notFound = () => new HttpError(404, 'not_found', 'No encontramos esta cita');
  const stale = (message = 'Esta acción ya no es posible. Recarga para ver el estado actual.') => new HttpError(409, 'invalid_transition', message, { reason: 'stale' });

  async function audit(user, b, action, { entityId = null, summary = '', before = null, after = null } = {}) {
    try {
      await AuditLog.create({ businessId: b?._id, actorUserId: user._id, actorEmail: user.email, action, entity: action.startsWith('deposit.settings') ? 'settings' : 'appointment', entityId: entityId ? String(entityId) : null, summary, before, after, at: new Date(now()) });
    } catch (err) {
      logger.error('[seña] auditoría falló:', err.message);
    }
  }

  /* Correos de la seña al cliente (kind: requested | confirmed | rejected | expired). */
  async function mail(b, appt, kind, extra = {}) {
    try {
      const to = appt.customerSnapshot?.email || (appt.customerUserId ? (await User.findById(appt.customerUserId).lean())?.email : null);
      if (!to) return false;
      const cfg = depositConfig(b);
      const m = depositMail({
        kind,
        appt,
        when: formatLong(appt.startsAt.getTime(), b.timezone),
        deadline: appt.deposit?.deadlineAt ? wallClock(appt.deposit.deadlineAt.getTime(), b.timezone).time : '',
        bank: kind === 'requested' ? bankView(cfg.bank) : null,
        url: `${frontUrl}/wstyle/cita/?id=${appt._id}`,
        ...extra,
      });
      const out = await mailer.send({ to, ...m });
      await Notification.create({ businessId: b._id, appointmentId: appt._id, to, template: m.template, status: out.status, error: out.error }).catch(() => {});
      return out.ok;
    } catch (err) {
      logger.error('[seña] correo falló:', err.message);
      return false;
    }
  }

  const released = async (b, appt, why) => {
    try {
      await onSlotReleased?.({ business: b, appointment: appt, reason: why });
    } catch (err) {
      logger.error('[seña] lista de espera:', err.message);
    }
  };

  /* ─── Subir el comprobante (RN-05, RN-09, CB-01, CB-02, CB-04, CB-09). */
  async function upload(id, user, file) {
    const b = await agenda.business();
    const { appt: current, role } = await agenda.load(id, user);
    /* Solo el dueño de la cita sube: cualquier otro ve "no encontramos esta cita". */
    if (role !== 'client') throw notFound();
    const t = now();
    const d = current.deposit;
    if (!d?.status) throw new HttpError(409, 'no_deposit', 'Esta cita no pide seña.');
    const lateOrGone = () => new HttpError(409, 'deposit_expired', 'El plazo ya venció: liberamos la hora. Si ya transferiste, escríbenos por WhatsApp.');
    if (d.status === 'vencida' || current.status === 'expirada') throw lateOrGone();
    const awaiting = current.status === 'pendiente_sena' && d.status === 'por_pagar';
    const replacing = d.status === 'en_revision' && !['cancelada', 'expirada'].includes(current.status);
    if (awaiting && !(d.deadlineAt?.getTime() > t)) throw lateOrGone();
    if (!awaiting && !replacing) throw new HttpError(409, 'deposit_closed', 'Esta seña ya fue revisada. Si necesitas ayuda, escríbenos por WhatsApp.');
    if (!file?.buffer) throw new HttpError(400, 'file_required', 'Elige la captura, foto o PDF de la transferencia.');

    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    /* CB-04: el mismo archivo dos veces (doble clic) no crea otro comprobante. */
    if (d.receipt?.hash === hash && d.status === 'en_revision') return { appt: current, replay: true };

    let norm;
    try {
      norm = await normalizeReceipt(file.buffer);
    } catch (err) {
      throw new HttpError(400, err.code || 'invalid_file', err.message);
    }
    const key = receiptKey(t, norm.ext);
    try {
      await store.put(key, norm.body, norm.contentType);
    } catch (err) {
      logger.error('[seña] almacenamiento:', err.message);
      throw new HttpError(503, 'storage_failed', 'No pudimos guardar tu comprobante, intenta de nuevo. Tu hora sigue guardada hasta el plazo.');
    }
    const oldKey = d.receipt?.key;
    let appt;
    try {
      appt = await agenda.mutate(b, current._id, (a) => {
        const dd = a.deposit;
        if (dd.receipt?.hash === hash && dd.status === 'en_revision') return { by: 'client', byUserId: user._id, reason: 'Comprobante repetido' };
        const stillAwaiting = a.status === 'pendiente_sena' && dd.status === 'por_pagar' && dd.deadlineAt?.getTime() > t;
        const stillReplacing = dd.status === 'en_revision' && !['cancelada', 'expirada'].includes(a.status);
        if (!stillAwaiting && !stillReplacing) throw stale();
        dd.receipt = { key, contentType: norm.contentType, size: norm.body.length, hash, kind: norm.kind, uploadedAt: new Date(t) };
        dd.status = 'en_revision';
        if (stillAwaiting) {
          /* RN-05: con el comprobante subido la hora queda guardada; sigue el flujo normal. */
          a.status = 'pendiente';
          const start = a.startsAt.getTime();
          a.expiresAt = new Date(Math.max(agenda.confirmDeadline(b, start, t), Math.min(t + b.settings.confirmWithinMinutes * MIN, start)));
        }
        return { by: 'client', byUserId: user._id, reason: stillAwaiting ? `Subió el comprobante de la seña ${dd.reference}` : `Reemplazó el comprobante de la seña ${dd.reference}` };
      });
    } catch (err) {
      await store.del(key).catch(() => {});
      if (err instanceof HttpError && err.extra?.reason === 'stale') {
        const fresh = await Appointment.findById(current._id).lean();
        if (fresh?.deposit?.status === 'vencida' || fresh?.status === 'expirada') throw lateOrGone();
      }
      throw err;
    }
    if (oldKey && oldKey !== key) await store.del(oldKey).catch((err) => logger.error('[seña] borrar comprobante anterior:', err.message));
    if (awaiting) {
      await Promise.all([agenda.notify(b, appt, 'client', 'received'), agenda.notify(b, appt, 'barber', 'new')]);
    }
    await adminInbox?.notify({
      kind: 'deposit_review',
      title: `Seña por revisar: ${appt.customerSnapshot?.name || 'Cliente'} · $${Number(appt.deposit.amountCLP).toLocaleString('es-CL')}`,
      body: `Referencia ${appt.deposit.reference} · ${appt.serviceSnapshot?.name || ''} · ${formatLong(appt.startsAt.getTime(), b.timezone)}`,
      appointmentId: appt._id,
      professionalId: appt.professionalId,
      path: 'pagos/?vista=senas',
      email: awaiting,
    });
    return { appt, replay: false };
  }

  /* ─── Servir el comprobante (RN-09, AC-04): dueño de la cita o super admin. */
  async function receipt(id, user) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para ver el comprobante');
    const _id = oid(id);
    const appt = _id ? await Appointment.findById(_id).lean() : null;
    const owner = appt && appt.customerUserId && String(appt.customerUserId) === String(user._id);
    const admin = user.roles.includes('superadmin');
    if (!owner && !admin) throw new HttpError(403, 'forbidden', 'No puedes ver este comprobante');
    const r = appt?.deposit?.receipt;
    if (!r?.key || r.purgedAt) throw new HttpError(404, 'not_found', 'Este comprobante ya no está disponible');
    let body;
    try {
      body = await store.get(r.key);
    } catch (err) {
      logger.error('[seña] leer comprobante:', err.message);
      throw new HttpError(503, 'storage_failed', 'No pudimos abrir el comprobante. Intenta de nuevo.');
    }
    if (!body) throw new HttpError(404, 'not_found', 'Este comprobante ya no está disponible');
    const ext = r.contentType === 'application/pdf' ? 'pdf' : 'webp';
    return { body, contentType: r.contentType || 'application/octet-stream', filename: `comprobante-${appt.deposit.reference || 'sena'}.${ext}` };
  }

  /* CB-08: cambiar a "Pagar en línea" durante el plazo (sin comprobante subido). */
  async function payOnline(id, user, { online = false } = {}) {
    const b = await agenda.business();
    const { appt: current, role } = await agenda.load(id, user);
    if (role !== 'client') throw notFound();
    if (!online) throw new HttpError(409, 'payment_unavailable', 'El pago en línea no está disponible.');
    const t = now();
    const ok = (a) => a.status === 'pendiente_sena' && a.deposit?.status === 'por_pagar' && a.deposit.deadlineAt?.getTime() > t;
    if (!ok(current)) throw stale();
    const appt = await agenda.mutate(b, current._id, (a) => {
      if (!ok(a)) throw stale();
      a.status = 'pendiente_pago';
      a.deposit.status = 'anulada';
      a.payment.method = 'online';
      a.payment.status = 'pendiente';
      a.payment.holdStartedAt = new Date(t);
      a.pricing.paymentMethod = 'online';
      a.expiresAt = new Date(t + 15 * MIN);
      return { by: 'client', byUserId: user._id, reason: 'Cambió a pagar en línea (seña anulada)' };
    });
    return appt;
  }

  /* ─── Revisión del super admin (RN-06, AC-05, CB-05). */
  const ADMIN_LIST_LIMIT = 200;

  async function rowOf(a, b) {
    const cfg = depositConfig(b);
    return {
      appointmentId: String(a._id),
      customer: { name: a.customerSnapshot?.name || '', email: a.customerSnapshot?.email || null, phone: a.customerSnapshot?.phoneE164 || null },
      service: { name: a.serviceSnapshot?.name || '' },
      professional: { name: a.professionalSnapshot?.displayName || '' },
      startsAt: a.startsAt.toISOString(),
      when: formatLong(a.startsAt.getTime(), b.timezone),
      appointmentStatus: a.status,
      amountCLP: a.deposit.amountCLP,
      reference: a.deposit.reference,
      status: a.deposit.status,
      statusLabel: DEPOSIT_LABEL[a.deposit.status],
      uploadedAt: a.deposit.receipt?.uploadedAt ? a.deposit.receipt.uploadedAt.toISOString() : null,
      receiptType: a.deposit.receipt?.contentType || null,
      receiptAvailable: Boolean(a.deposit.receipt?.key && !a.deposit.receipt?.purgedAt),
      deadlineAt: a.deposit.deadlineAt ? a.deposit.deadlineAt.toISOString() : null,
      confirmedAt: a.deposit.confirmedAt ? a.deposit.confirmedAt.toISOString() : null,
      refundDueAt: a.deposit.refundDueAt ? a.deposit.refundDueAt.toISOString() : null,
      rejectReason: a.deposit.rejectReason || null,
      /* Lista de cotejo: "Monto $5.000 · Referencia WS-K7QM · A la cuenta …4321". */
      checklist: { amountCLP: a.deposit.amountCLP, reference: a.deposit.reference, accountLast4: last4(cfg.bank.accountNumber), bank: cfg.bank.bank },
      started: a.startsAt.getTime() <= now(),
    };
  }

  async function list(b, q = {}) {
    const view = ['review', 'refund', 'all'].includes(q.view) ? q.view : 'review';
    const status = view === 'review' ? ['en_revision'] : view === 'refund' ? ['por_devolver'] : null;
    const filter = { businessId: b._id, 'deposit.status': status ? { $in: status } : { $exists: true } };
    const items = await Appointment.find(filter).sort(view === 'review' ? { 'deposit.receipt.uploadedAt': 1 } : { startsAt: -1 }).limit(ADMIN_LIST_LIMIT).lean();
    return { view, items: await Promise.all(items.map((a) => rowOf(a, b))), counts: await counts(b) };
  }

  async function counts(b) {
    const [review, refund] = await Promise.all([
      Appointment.countDocuments({ businessId: b._id, 'deposit.status': 'en_revision' }),
      Appointment.countDocuments({ businessId: b._id, 'deposit.status': 'por_devolver' }),
    ]);
    return { review, refund };
  }

  async function loadForAdmin(b, id) {
    const _id = oid(id);
    const a = _id ? await Appointment.findOne({ _id, businessId: b._id }) : null;
    if (!a || !a.deposit?.status) throw new HttpError(404, 'not_found', 'No encontramos esta seña');
    return a;
  }

  /* ¿La cita se cayó por el local (barbero, admin o el sistema) y no por el cliente? */
  const droppedByShop = (a) => ['cancelada', 'expirada'].includes(a.status) && a.history?.length && a.history[a.history.length - 1].by !== 'client';

  async function confirm(user, b, id) {
    const current = await loadForAdmin(b, id);
    if (current.deposit.status !== 'en_revision') throw stale('Esta seña ya fue revisada. Recarga para ver el estado actual.');
    const t = now();
    const appt = await agenda.mutate(b, current._id, (a) => {
      if (a.deposit?.status !== 'en_revision') throw stale('Esta seña ya fue revisada. Recarga para ver el estado actual.');
      a.deposit.reviewedAt = new Date(t);
      a.deposit.reviewedByUserId = user._id;
      a.deposit.confirmedAt = new Date(t);
      /* RN-07: si la cita ya se cayó por el local, la seña se devuelve. */
      if (droppedByShop(a)) {
        a.deposit.status = 'por_devolver';
        a.deposit.refundDueAt = new Date(t);
      } else {
        a.deposit.status = 'confirmada';
      }
      return { by: 'admin', byUserId: user._id, reason: `Seña ${a.deposit.reference} confirmada` };
    });
    await mail(b, appt, 'confirmed');
    await audit(user, b, 'deposit.confirm', { entityId: appt._id, summary: `${appt.customerSnapshot?.name || 'Cliente'} · $${appt.deposit.amountCLP} · ${appt.deposit.reference}`, before: { deposit: 'en_revision' }, after: { deposit: appt.deposit.status } });
    return appt;
  }

  async function reject(user, b, id, body = {}) {
    const code = String(body.reasonCode ?? '');
    const text = String(body.reasonText ?? '').trim().slice(0, 300);
    if (!REJECT_REASONS[code] || (code === 'otro' && !text)) {
      throw new HttpError(400, 'reason_required', 'Elige el motivo del rechazo', { fields: { reason: code === 'otro' ? 'reason_text_required' : 'reason_required' } });
    }
    const reason = text ? `${REJECT_REASONS[code]}: ${text}` : REJECT_REASONS[code];
    const current = await loadForAdmin(b, id);
    const was = current.deposit.status;
    if (!['en_revision', 'confirmada'].includes(was)) throw stale('Esta seña ya no se puede rechazar. Recarga para ver el estado actual.');
    const t = now();
    let freed = false;
    const appt = await agenda.mutate(b, current._id, async (a, session) => {
      if (a.deposit?.status !== was) throw stale('Esta seña ya fue revisada. Recarga para ver el estado actual.');
      a.deposit.reviewedAt = new Date(t);
      a.deposit.reviewedByUserId = user._id;
      a.deposit.rejectReason = reason;
      /* §9: rechazar por error una seña ya confirmada → hay que devolverla. */
      if (was === 'confirmada') {
        a.deposit.status = 'por_devolver';
        a.deposit.refundDueAt = new Date(t);
      } else {
        a.deposit.status = 'rechazada';
      }
      /* RN-06 / asunción 5: rechazar cancela la cita (si sigue viva) y libera la hora. */
      if (!['cancelada', 'expirada', 'terminada', 'no_asistio'].includes(a.status)) {
        await SlotLock.deleteMany({ appointmentId: a._id }, { session });
        a.status = 'cancelada';
        a.proposal = undefined;
        a.expiresAt = undefined;
        agenda.markRefundDue(a);
        freed = true;
      }
      return { by: 'admin', byUserId: user._id, reason: `Seña rechazada: ${reason}` };
    });
    await mail(b, appt, 'rejected', { reason });
    if (freed) {
      await agenda.notify(b, appt, 'barber', 'admin_cancelled', { reason: `Seña rechazada: ${reason}` });
      await released(b, appt, 'deposit_rejected');
    }
    await audit(user, b, 'deposit.reject', { entityId: appt._id, summary: `${appt.customerSnapshot?.name || 'Cliente'} · $${appt.deposit.amountCLP} · ${appt.deposit.reference} — ${reason}`, before: { deposit: was, status: current.status }, after: { deposit: appt.deposit.status, status: appt.status } });
    return appt;
  }

  /* §9: Joe ya transfirió de vuelta a mano. */
  async function markRefunded(user, b, id) {
    const current = await loadForAdmin(b, id);
    if (current.deposit.status !== 'por_devolver') throw stale('Esta seña no está por devolver. Recarga para ver el estado actual.');
    const t = now();
    const appt = await agenda.mutate(b, current._id, (a) => {
      if (a.deposit?.status !== 'por_devolver') throw stale();
      a.deposit.status = 'devuelta';
      a.deposit.refundedAt = new Date(t);
      a.deposit.refundedByUserId = user._id;
      return { by: 'admin', byUserId: user._id, reason: `Seña ${a.deposit.reference} devuelta` };
    });
    await audit(user, b, 'deposit.refunded', { entityId: appt._id, summary: `${appt.customerSnapshot?.name || 'Cliente'} · $${appt.deposit.amountCLP} · ${appt.deposit.reference}`, before: { deposit: 'por_devolver' }, after: { deposit: 'devuelta' } });
    return appt;
  }

  /* ─── Vencimiento automático (§11, AC-02, CB-10) + retención de comprobantes (§10). */
  async function runDeposits() {
    const b = await agenda.business();
    const t = now();
    let expired = 0;
    const due = await Appointment.find({ businessId: b._id, status: 'pendiente_sena', 'deposit.status': 'por_pagar', expiresAt: { $lte: new Date(t) } }, { _id: 1 }).lean();
    for (const { _id } of due) {
      try {
        const appt = await agenda.mutate(b, _id, async (a, session) => {
          if (a.status !== 'pendiente_sena' || a.deposit?.status !== 'por_pagar' || !(a.expiresAt?.getTime() <= t)) throw stale();
          await SlotLock.deleteMany({ appointmentId: a._id }, { session });
          a.status = 'expirada';
          a.deposit.status = 'vencida';
          a.expiresAt = undefined;
          return { by: 'system', reason: 'No llegó el comprobante de la seña a tiempo' };
        });
        expired++;
        await mail(b, appt, 'expired');
        await released(b, appt, 'deposit_expired');
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error(`[seña] vencer ${_id}: ${err.message}`);
      }
    }
    const purged = await purgeOld(b, t);
    return { expired, purged };
  }

  async function purgeOld(b, t) {
    const old = await Appointment.find({ businessId: b._id, startsAt: { $lt: new Date(t - RECEIPT_RETENTION_DAYS * DAY) }, 'deposit.receipt.key': { $type: 'string' }, 'deposit.receipt.purgedAt': null }, { _id: 1, 'deposit.receipt.key': 1 }).limit(200).lean();
    let n = 0;
    for (const a of old) {
      try {
        await store.del(a.deposit.receipt.key);
        await Appointment.updateOne({ _id: a._id }, { $set: { 'deposit.receipt.purgedAt': new Date(t) } });
        n++;
      } catch (err) {
        logger.error(`[seña] retención ${a._id}: ${err.message}`);
      }
    }
    return n;
  }

  /* CB-12: cuenta eliminada → se borran sus comprobantes; los metadatos quedan (anonimizados por la agenda). */
  async function onAccountDeleted(user) {
    const list = await Appointment.find({ customerUserId: user._id, 'deposit.receipt.key': { $type: 'string' }, 'deposit.receipt.purgedAt': null }, { _id: 1, 'deposit.receipt.key': 1 }).lean();
    for (const a of list) {
      await store.del(a.deposit.receipt.key).catch((err) => logger.error('[seña] borrar comprobante:', err.message));
      await Appointment.updateOne({ _id: a._id }, { $set: { 'deposit.receipt.purgedAt': new Date(now()) } });
    }
  }

  /* ─── Preaviso antes de reservar: ¿esta hora con este servicio pide seña? */
  async function preview(user, input = {}) {
    if (!user) return { required: false };
    const b = await agenda.business();
    const startsAt = Date.parse(input.startsAt);
    if (!Number.isFinite(startsAt)) throw new HttpError(400, 'invalid_start', 'Hora inválida');
    const r = await rule.check(b, user, { startsAt, now: now() });
    if (!r) return { required: false };
    const service = await agenda.findService(b, input.serviceId);
    if (!service) throw new HttpError(400, 'invalid_service', 'Ese servicio no existe');
    let surcharge = 0;
    if (input.mode === 'home') {
      const pros = await agenda.professionals(b, { service, mode: 'home' });
      const p = pros.find((x) => String(x._id) === String(input.professionalId)) || pros[0];
      surcharge = p?.homeService?.surchargeCLP || 0;
    }
    const pricing = quote({ priceCLP: service.priceCLP, surchargeCLP: surcharge, method: 'local', ...(await currentRates()) });
    const amountCLP = depositAmountCLP(r.cfg, pricing);
    return { required: true, amountCLP, restCLP: Math.max(0, pricing.totalCLP - amountCLP), totalCLP: pricing.totalCLP, minutes: r.cfg.minutes, deadlineAt: new Date(r.deadline).toISOString(), tooSoon: r.tooSoon };
  }

  /* ─── Configuración (admin → Configuración → "Seña por transferencia"). */
  function storageInfo() {
    return { driver: store.driver, configured: Boolean(store.configured), production: Boolean(store.production), reason: store.configured ? null : store.reason || 'Almacenamiento de comprobantes no configurado' };
  }

  async function getSettings(b) {
    const cfg = depositConfig(b);
    return { ...cfg, bank: bankView(cfg.bank), bankComplete: bankComplete(cfg.bank), storage: storageInfo(), appliesToLabel: APPLIES_LABEL[cfg.appliesTo], options: { minutes: DEPOSIT_MINUTES, accountTypes: ACCOUNT_TYPES, appliesTo: APPLIES_LABEL } };
  }

  async function setSettings(user, b, body = {}) {
    const cur = depositConfig(b);
    const fields = {};
    const next = { ...cur, bank: { ...cur.bank } };
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') fields.enabled = 'invalid';
      else next.enabled = body.enabled;
    }
    if (body.kind !== undefined) {
      if (!['fixed', 'percent'].includes(body.kind)) fields.kind = 'invalid';
      else next.kind = body.kind;
    }
    if (body.fixedCLP !== undefined) {
      if (!Number.isInteger(body.fixedCLP) || body.fixedCLP < DEPOSIT_MIN_CLP || body.fixedCLP > 500_000) fields.fixedCLP = 'out_of_range';
      else next.fixedCLP = body.fixedCLP;
    }
    if (body.percent !== undefined) {
      if (!Number.isInteger(body.percent) || body.percent < 1 || body.percent > 100) fields.percent = 'out_of_range';
      else next.percent = body.percent;
    }
    if (body.appliesTo !== undefined) {
      if (!APPLIES_LABEL[body.appliesTo]) fields.appliesTo = 'invalid';
      else next.appliesTo = body.appliesTo;
    }
    if (body.minutes !== undefined) {
      if (!DEPOSIT_MINUTES.includes(body.minutes)) fields.minutes = 'invalid';
      else next.minutes = body.minutes;
    }
    if (body.bank !== undefined) {
      const k = body.bank || {};
      const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
      if (k.holder !== undefined) next.bank.holder = str(k.holder, 80);
      if (k.bank !== undefined) next.bank.bank = str(k.bank, 60);
      if (k.accountNumber !== undefined) {
        const n = str(k.accountNumber, 30);
        if (n && !/^[0-9-]{4,30}$/.test(n)) fields['bank.accountNumber'] = 'invalid';
        next.bank.accountNumber = n;
      }
      if (k.accountType !== undefined) {
        if (k.accountType && !ACCOUNT_TYPES[k.accountType]) fields['bank.accountType'] = 'invalid';
        next.bank.accountType = k.accountType || '';
      }
      if (k.rut !== undefined) {
        const r = str(k.rut, 20);
        const norm = r ? normalizeRut(r) : '';
        if (r && !norm) fields['bank.rut'] = 'invalid_rut';
        next.bank.rut = norm || '';
      }
      if (k.email !== undefined) {
        const e = normEmail(k.email);
        if (e && !isEmail(e)) fields['bank.email'] = 'invalid_email';
        next.bank.email = e;
      }
    }
    if (Object.keys(fields).length) {
      const msg = fields['bank.rut'] ? 'El RUT no es válido (revisa el dígito verificador)' : fields['bank.email'] ? 'El correo no es válido' : 'Revisa los valores';
      throw new HttpError(400, Object.values(fields)[0], msg, { fields });
    }
    if (next.enabled) {
      /* RN-10 / AC-08: sin almacenamiento real (S3 en producción) no se aceptan comprobantes. */
      if (!store.configured) throw new HttpError(422, 'storage_required', store.reason || 'Falta configurar el almacenamiento de comprobantes', { fields: { enabled: 'storage_required' } });
      if (!bankComplete(next.bank)) throw new HttpError(422, 'bank_incomplete', 'Completa los datos de la cuenta (titular, RUT, banco, tipo, N° y correo) antes de encender la seña', { fields: { enabled: 'bank_incomplete' } });
    }
    const set = {
      'deposit.enabled': next.enabled,
      'deposit.kind': next.kind,
      'deposit.fixedCLP': next.fixedCLP,
      'deposit.percent': next.percent,
      'deposit.appliesTo': next.appliesTo,
      'deposit.minutes': next.minutes,
      'deposit.bank': { ...next.bank, accountType: next.bank.accountType || undefined },
    };
    await Business.updateOne({ _id: b._id }, { $set: set });
    const fresh = await Business.findById(b._id).lean();
    /* Auditoría sin el N° de cuenta completo ni el RUT (solo si cambió). */
    const safe = (c) => ({ enabled: c.enabled, kind: c.kind, fixedCLP: c.fixedCLP, percent: c.percent, appliesTo: c.appliesTo, minutes: c.minutes, bank: { holder: c.bank.holder, bank: c.bank.bank, accountType: c.bank.accountType, account: c.bank.accountNumber ? `…${last4(c.bank.accountNumber)}` : '', rutSet: Boolean(c.bank.rut), email: c.bank.email } });
    await audit(user, b, 'deposit.settings', { summary: next.enabled ? 'Seña por transferencia encendida' : 'Seña por transferencia', before: safe(cur), after: safe(depositConfig(fresh)) });
    return getSettings(fresh);
  }

  /* Al crear la cita con seña: correo con instrucciones, referencia, datos y plazo. */
  async function onCreated(b, appt) {
    return mail(b, appt, 'requested');
  }

  return { upload, receipt, payOnline, list, counts, confirm, reject, markRefunded, runDeposits, purgeOld, onAccountDeleted, preview, getSettings, setSettings, onCreated, storageInfo, view: depositView };
}

