/* Pago en línea de la cita con Mercado Pago Checkout Pro (SPEC-35).

   - La preferencia se arma en el server con el total de la cita (RN-02); el client solo
     recibe el `init_point` y redirige.
   - El estado del pago SOLO cambia con lo que responde el API de Mercado Pago (RN-07): el
     webhook trae un id, no un estado; los `?pago=` de la vuelta no se creen.
   - Idempotencia: PaymentEvent con índice único (pago, estado) + transiciones monótonas
     (nunca se vuelve de "pagado" a uno de antes).
   - Tres caminos llegan a `applyPayment`: el webhook, la conciliación periódica y la
     página de la cita (si el webhook se perdió o Render estaba dormido). */
import mongoose from 'mongoose';
import { Appointment, FINAL, PaymentEvent, SlotLock } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey, withTransaction } from '../lib/db.js';
import { createMercadoPagoClient, mpMode, verifySignature } from '../lib/mercadopago.js';
import { slotsFor } from './availability.js';
import { formatLong, wallClock } from './time.js';
import { PAY_OPEN, PAYMENT_HOLD_MIN } from './agenda.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const { ObjectId } = mongoose.Types;

export const WEBHOOK_PATH = '/api/payments/mp/webhook';
/* RN-06: si el pago queda "en proceso" la retención se extiende hasta 2 h desde que empezó. */
export const IN_PROCESS_HOLD_MIN = 120;
/* Medios diferidos (efectivo en puntos de pago, cajeros, transferencias offline). */
export const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm', 'bank_transfer'];
/* Estados del pago una vez aprobado (monótonos). */
const PAY_CLOSED = ['pagado', 'reembolso_pendiente', 'reembolsado', 'contracargo'];
const VIEW_SYNC_MS = 5000;

const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const isHttps = (u) => /^https:\/\//i.test(String(u || ''));

export function createPayments({ agenda, env = {}, clock = Date.now, logger = console, adminInbox = null, frontUrl = 'http://localhost:5173', fetchImpl = fetch }) {
  const token = String(env.MP_ACCESS_TOKEN || '');
  const secret = String(env.MP_WEBHOOK_SECRET || '');
  const mp = createMercadoPagoClient({ accessToken: token, fetchImpl, baseUrl: env.MP_API_BASE || undefined });
  const ready = Boolean(token);
  const site = String(env.PUBLIC_SITE_URL || frontUrl).replace(/\/$/, '');
  const apiPublic = String(env.API_PUBLIC_URL || '').replace(/\/$/, '');
  const notificationUrl = String(env.MP_NOTIFICATION_URL || (apiPublic ? apiPublic + WEBHOOK_PATH : ''));
  const lastViewSync = new Map();
  if (ready && !secret) logger.warn?.('[mp] MP_WEBHOOK_SECRET vacío: los webhooks se rechazan (401); la conciliación sigue cubriendo los pagos');

  const info = () => ({ configured: ready, mode: mpMode(token), ready });

  async function alert(kind, title, body, appt = null) {
    await adminInbox?.notify({ kind, title, body, appointmentId: appt?._id ?? null, professionalId: appt?.professionalId ?? null, path: 'citas/' });
  }

  /* ─── Crear la preferencia (POST /api/wstyle/appointments/:id/checkout) */
  async function checkout(id, user) {
    if (!ready) throw new HttpError(503, 'payments_not_configured', 'El pago en línea no está disponible. Puedes pagar en el local.');
    const b = await agenda.business();
    const { appt, role } = await agenda.load(id, user);
    /* Solo el dueño de la cita paga; para cualquier otro la cita "no existe". */
    if (role !== 'client') throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    const now = clock();
    if (appt.payment?.method === 'online' && PAY_CLOSED.includes(appt.payment?.status)) throw new HttpError(409, 'already_paid', 'Esta cita ya está pagada.');
    if (appt.status !== 'pendiente_pago') throw new HttpError(409, 'invalid_transition', 'Esta cita ya no espera un pago. Recarga para ver el estado actual.', { reason: 'bad_state' });
    if (appt.payment?.status === 'en_proceso') throw new HttpError(409, 'payment_in_process', 'Tu pago está en proceso. Espera la respuesta de Mercado Pago.');
    if (!(appt.expiresAt?.getTime() > now)) throw new HttpError(409, 'hold_expired', 'Se acabó el tiempo para pagar esta reserva. Reserva de nuevo.');
    if (!agenda.paymentOptions(b).online) throw new HttpError(409, 'payment_unavailable', 'El pago en línea no está disponible. Puedes pagar en el local.');

    const bumped = await Appointment.findOneAndUpdate({ _id: appt._id }, { $inc: { 'payment.attempts': 1 } }, { new: true, projection: { 'payment.attempts': 1 } });
    const attempt = bumped?.payment?.attempts ?? 1;
    const w = wallClock(appt.startsAt.getTime(), b.timezone);
    const back = (r) => `${site}/wstyle/cita/?id=${appt._id}&pago=${r}`;
    const preference = {
      items: [{
        id: appt.serviceSnapshot?.slug || 'servicio',
        title: `${appt.serviceSnapshot?.name || 'Servicio'} · WS Style · ${w.date.split('-').reverse().join('-')} ${w.time}`,
        quantity: 1,
        unit_price: appt.pricing.totalCLP,
        currency_id: 'CLP',
      }],
      payer: { email: appt.customerSnapshot?.email || user.email },
      external_reference: String(appt._id),
      back_urls: { success: back('approved'), failure: back('failure'), pending: back('pending') },
      expires: true,
      expiration_date_from: new Date(now).toISOString(),
      expiration_date_to: appt.expiresAt.toISOString(),
      payment_methods: { excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((x) => ({ id: x })), installments: 1 },
      statement_descriptor: 'WSSTYLE',
      metadata: { appointment_id: String(appt._id) },
    };
    /* Mercado Pago exige URLs públicas: con el front en http://localhost no acepta `auto_return`
       y no puede llamar a un webhook en localhost (en local se usa un túnel → MP_NOTIFICATION_URL;
       sin túnel, la conciliación y la página de la cita traen el resultado igual). */
    if (isHttps(site)) preference.auto_return = 'approved';
    if (isHttps(notificationUrl)) preference.notification_url = notificationUrl;

    try {
      const pref = await mp.createPreference(preference, { idempotencyKey: `wsstyle-${appt._id}-${attempt}` });
      await Appointment.updateOne({ _id: appt._id }, { $set: { 'payment.preferenceId': String(pref.id || '') }, $unset: { 'payment.lastError': 1 } });
      logger.log(`[mp] preferencia ${pref.id} · cita ${appt._id} · intento ${attempt}`);
      return { initPoint: pref.init_point, preferenceId: String(pref.id || ''), holdUntil: appt.expiresAt.toISOString() };
    } catch (err) {
      logger.error(`[mp] preferencia falló · cita ${appt._id}: ${err.status ?? ''} ${err.message}`);
      await Appointment.updateOne({ _id: appt._id }, { $set: { 'payment.lastError': String(err.message).slice(0, 200) } });
      throw new HttpError(502, 'payment_provider_error', 'No pudimos abrir Mercado Pago. Reintenta o elige pagar en el local.');
    }
  }

  /* ─── Transacción sobre la cita que puede no cambiar nada (null = no-op). */
  async function txn(apptId, fn) {
    for (let i = 0; ; i++) {
      try {
        return await withTransaction(async (session) => {
          const a = await Appointment.findById(apptId).session(session);
          if (!a) return null;
          const from = a.status;
          const r = await fn(a, session);
          if (!r) return null;
          a.history.push({ at: new Date(clock()), from, to: a.status, by: r.by || 'system', byUserId: r.byUserId, reason: r.reason });
          await a.save({ session });
          return { ...r, appt: a };
        }, logger);
      } catch (err) {
        if (err?.name === 'VersionError' && i < 3) continue;
        throw err;
      }
    }
  }

  /* RN-08: solo se reactiva una cita que canceló el sistema por falta de pago y cuya hora sigue
     en el futuro. Si la canceló alguien (cliente, barbero, admin) el dinero se devuelve. */
  const cancelledForPayment = (a) => a.status === 'cancelada' && a.history.at(-1)?.by === 'system' && /pago no completado/i.test(a.history.at(-1)?.reason || '');

  /* ─── Aplica un pago obtenido del API de Mercado Pago (RN-07). */
  async function applyPayment(p, via) {
    const mpId = String(p?.id ?? '');
    const status = String(p?.status ?? '');
    if (!mpId || !status) return 'invalid';
    const b = await agenda.business();
    const _id = oid(p.external_reference);
    const appt = _id ? await Appointment.findOne({ _id, businessId: b._id }).lean() : null;
    const amountOk = appt && p.currency_id === 'CLP' && Math.round(Number(p.transaction_amount)) === appt.pricing?.totalCLP;

    /* Idempotencia: el primero que inserta el evento lo procesa; los demás son repeticiones. */
    let event;
    try {
      event = await PaymentEvent.create({ businessId: b._id, appointmentId: appt?._id, mpPaymentId: mpId, status, amount: Number(p.transaction_amount) || 0, currency: p.currency_id, via });
    } catch (err) {
      if (isDuplicateKey(err)) return 'duplicate';
      throw err;
    }

    try {
      const outcome = await applyEvent({ b, appt, p, mpId, status, amountOk });
      await PaymentEvent.updateOne({ _id: event._id }, { outcome });
      return outcome;
    } catch (err) {
      /* Sin aplicar → se borra el evento para que el reintento (de Mercado Pago o la conciliación) lo procese. */
      await PaymentEvent.deleteOne({ _id: event._id }).catch(() => {});
      throw err;
    }
  }

  async function applyEvent({ b, appt, p, mpId, status, amountOk }) {
    const now = clock();
    if (!appt) {
      if (status === 'approved') await alert('payment_orphan', `Pago sin cita en Mercado Pago (${money(p.transaction_amount)})`, `El pago ${mpId} no corresponde a ninguna cita. Revísalo en Mercado Pago y reembólsalo desde allá si corresponde.`);
      return 'orphan';
    }
    if (!amountOk) {
      /* CB-07: monto o moneda distintos → nunca se marca pagado. */
      if (status === 'approved') {
        await alert('payment_mismatch', `Pago con monto distinto: ${money(p.transaction_amount)} ${p.currency_id || ''} (cita ${money(appt.pricing?.totalCLP)})`, `${appt.customerSnapshot?.name || 'Cliente'} · ${formatLong(appt.startsAt.getTime(), b.timezone)} · pago ${mpId}. No se marcó como pagada.`, appt);
      }
      return 'mismatch';
    }

    if (status === 'approved') return approve({ b, appt, mpId, now });

    if (['pending', 'in_process', 'authorized'].includes(status)) {
      const r = await txn(appt._id, (a) => {
        const pay = a.payment;
        if (!PAY_OPEN.includes(pay.status) || a.status !== 'pendiente_pago') return null;
        if (pay.status === 'en_proceso' && pay.mpPaymentId === mpId) return null;
        pay.status = 'en_proceso';
        pay.mpPaymentId = mpId;
        pay.mpStatus = status;
        const start = (pay.holdStartedAt || a.createdAt || new Date(now)).getTime();
        a.expiresAt = new Date(Math.max(a.expiresAt?.getTime() || 0, start + IN_PROCESS_HOLD_MIN * MIN));
        return { reason: 'Pago en proceso en Mercado Pago' };
      });
      return r ? 'in_process' : 'ignored';
    }

    if (['rejected', 'cancelled'].includes(status)) {
      const r = await txn(appt._id, (a) => {
        const pay = a.payment;
        if (!PAY_OPEN.includes(pay.status) || a.status !== 'pendiente_pago') return null;
        /* Un rechazo atrasado de otro intento no pisa un pago que sigue en proceso. */
        if (pay.status === 'en_proceso' && pay.mpPaymentId && pay.mpPaymentId !== mpId) return null;
        if (pay.status === 'rechazado' && pay.mpPaymentId === mpId) return null;
        pay.status = 'rechazado';
        pay.mpPaymentId = mpId;
        pay.mpStatus = status;
        /* RN-05: reintentar usa el vencimiento original. */
        const start = (pay.holdStartedAt || a.createdAt || new Date(now)).getTime();
        a.expiresAt = new Date(start + PAYMENT_HOLD_MIN * MIN);
        return { reason: status === 'rejected' ? 'Pago rechazado en Mercado Pago' : 'Pago cancelado en Mercado Pago' };
      });
      return r ? 'rejected' : 'ignored';
    }

    if (status === 'refunded') {
      let inFlight = false;
      const r = await txn(appt._id, (a) => {
        const pay = a.payment;
        const dup = pay.duplicates?.find((d) => d.mpPaymentId === mpId);
        if (dup) {
          if (dup.status === 'reembolsado') return null;
          inFlight = Boolean(dup.refundInFlight);
          dup.status = 'reembolsado';
          dup.refundedAt = new Date(now);
          return { reason: `Pago duplicado ${mpId} reembolsado` };
        }
        if (pay.mpPaymentId !== mpId || pay.status === 'reembolsado') return null;
        inFlight = Boolean(pay.refundInFlight);
        pay.status = 'reembolsado';
        pay.mpStatus = status;
        pay.refundedAt = new Date(now);
        pay.refundError = undefined;
        return { reason: 'Reembolso total en Mercado Pago' };
      });
      /* Si el reembolso lo pidió el panel, el correo lo manda el panel (uno solo). */
      if (r && !inFlight) {
        await agenda.notify(b, r.appt, 'client', 'refunded');
        if (!FINAL.includes(r.appt.status)) await alert('payment_refunded_outside', 'Reembolso hecho desde Mercado Pago', `La cita de ${r.appt.customerSnapshot?.name || 'Cliente'} (${formatLong(r.appt.startsAt.getTime(), b.timezone)}) sigue activa pero su pago fue reembolsado.`, r.appt);
      }
      return r ? 'refunded' : 'ignored';
    }

    if (status === 'charged_back') {
      /* RN-10: alerta; la cita no cambia de estado. */
      const r = await txn(appt._id, (a) => {
        if (a.payment.mpPaymentId !== mpId || a.payment.status === 'contracargo') return null;
        a.payment.status = 'contracargo';
        a.payment.mpStatus = status;
        return { reason: 'Contracargo en Mercado Pago' };
      });
      await alert('payment_chargeback', `Contracargo de ${money(p.transaction_amount)}`, `${appt.customerSnapshot?.name || 'Cliente'} desconoció el pago ${mpId} (${formatLong(appt.startsAt.getTime(), b.timezone)}). Revísalo en Mercado Pago.`, appt);
      return r ? 'charged_back' : 'alerted';
    }

    if (status === 'in_mediation') {
      await alert('payment_dispute', 'Pago en disputa en Mercado Pago', `Pago ${mpId} · ${appt.customerSnapshot?.name || 'Cliente'}. Revisa el reclamo en Mercado Pago.`, appt);
      return 'alerted';
    }
    return 'ignored';
  }

  /* RN-04 / RN-08 / CB-08 */
  async function approve({ b, appt, mpId, now }) {
    const paid = (a, reason) => {
      a.payment.method = 'online';
      a.payment.status = 'pagado';
      a.payment.mpPaymentId = mpId;
      a.payment.mpStatus = 'approved';
      a.payment.paidAt = new Date(now);
      a.payment.lastError = undefined;
      return { reason };
    };
    let r;
    try {
      r = await txn(appt._id, async (a, session) => {
        const pay = a.payment;
        if (PAY_CLOSED.includes(pay.status) && pay.method === 'online') {
          if (pay.mpPaymentId === mpId || pay.duplicates?.some((d) => d.mpPaymentId === mpId)) return null;
          /* CB-08: la cita ya estaba pagada → este segundo pago se devuelve. */
          pay.duplicates = [...(pay.duplicates || []), { mpPaymentId: mpId, amountCLP: a.pricing.totalCLP, status: 'reembolso_pendiente' }];
          return { reason: `Pago duplicado ${mpId}: queda para reembolso`, kind: 'duplicate' };
        }
        if (a.status === 'pendiente_pago') {
          a.status = 'pendiente';
          a.expiresAt = new Date(agenda.confirmDeadline(b, a.startsAt.getTime(), now));
          return { ...paid(a, 'Pago aprobado en Mercado Pago'), kind: 'paid' };
        }
        if (a.status === 'cancelada' || a.status === 'expirada') {
          if (cancelledForPayment(a) && a.startsAt.getTime() > now) {
            /* RN-08: pago tardío con la hora libre → la cita vuelve. Si la hora ya es de otro,
               el índice único de SlotLock lo detecta y se aborta la transacción. */
            await SlotLock.insertMany(
              slotsFor(a.startsAt.getTime(), a.serviceSnapshot.durationMin, a.location?.travelBufferMin || 0).map((t) => ({ businessId: b._id, professionalId: a.professionalId, slotStart: new Date(t), appointmentId: a._id, kind: 'main' })),
              { session, ordered: true }
            );
            a.status = 'pendiente';
            a.expiresAt = new Date(agenda.confirmDeadline(b, a.startsAt.getTime(), now));
            return { ...paid(a, 'Pago aprobado después del plazo: la hora seguía libre'), kind: 'paid' };
          }
          paid(a);
          a.payment.status = 'reembolso_pendiente';
          return { reason: 'Pago aprobado con la cita ya cancelada: queda para reembolso', kind: 'late' };
        }
        /* Cita activa (p.ej. pasó a pagar en el local y llegó un pago de un intento anterior). */
        return { ...paid(a, 'Pago en línea aprobado'), kind: 'paid_active' };
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      r = await txn(appt._id, (a) => {
        if (PAY_CLOSED.includes(a.payment.status)) return null;
        paid(a);
        a.payment.status = 'reembolso_pendiente';
        return { reason: 'Pago aprobado tarde y la hora ya la tomó otro: queda para reembolso', kind: 'late' };
      });
    }
    if (!r) return 'ignored';
    const a = r.appt;
    const who = `${a.customerSnapshot?.name || 'Cliente'} · ${a.serviceSnapshot?.name || ''} · ${formatLong(a.startsAt.getTime(), b.timezone)}`;
    if (r.kind === 'paid') await Promise.all([agenda.notify(b, a, 'client', 'received'), agenda.notify(b, a, 'barber', 'new')]);
    if (r.kind === 'late') await alert('payment_late', `Pago tardío por reembolsar: ${money(a.pricing?.totalCLP)}`, `${who}. El pago llegó con la cita ya cancelada y la hora ocupada. Reembólsalo desde la ficha de la cita.`, a);
    if (r.kind === 'duplicate') await alert('payment_duplicate', `Pago duplicado por reembolsar: ${money(a.pricing?.totalCLP)}`, `${who}. La cita se pagó dos veces (pago ${mpId}). Reembolsa el segundo desde la ficha de la cita.`, a);
    return r.kind;
  }

  /* ─── Webhook (POST /api/payments/mp/webhook). Devuelve [status, body]. */
  async function webhook(req) {
    const dataId = req.query?.['data.id'] !== undefined ? String(req.query['data.id']) : '';
    const type = String(req.query?.type ?? req.body?.type ?? '');
    const v = verifySignature({ secret, header: req.get('x-signature'), requestId: req.get('x-request-id'), dataId, now: clock() });
    if (!v.ok) {
      /* CB-02: sin datos sensibles en el log (ni la firma ni la clave). */
      logger.warn?.(`[mp] webhook rechazado: firma inválida (${v.reason})`);
      return [401, { ok: false, error: 'invalid_signature' }];
    }
    if (type !== 'payment' || !dataId) return [200, { ok: true, ignored: true }];
    let p;
    try {
      p = await mp.getPayment(dataId);
    } catch (err) {
      if (err.status === 404) {
        logger.warn?.(`[mp] webhook: el pago ${dataId} no existe en Mercado Pago`);
        return [200, { ok: true, ignored: true }];
      }
      logger.error(`[mp] webhook: no se pudo consultar el pago ${dataId}: ${err.message}`);
      return [503, { ok: false, error: 'provider_unavailable' }];
    }
    const outcome = await applyPayment(p, 'webhook');
    logger.log(`[mp] webhook pago ${dataId} ${p.status} → ${outcome} (cita ${p.external_reference || '—'})`);
    return [200, { ok: true }];
  }

  /* ─── Conciliación (CB-03): pagos cuyo webhook no llegó. */
  async function reconcileOne(apptId, via) {
    const results = await mp.searchPayments(String(apptId));
    results.sort((x, y) => Date.parse(x.date_last_updated || x.date_created || 0) - Date.parse(y.date_last_updated || y.date_created || 0));
    let applied = 0;
    for (const p of results) {
      try {
        const out = await applyPayment(p, via);
        if (!['duplicate', 'ignored'].includes(out)) applied++;
      } catch (err) {
        logger.error(`[mp] conciliación: pago ${p?.id}: ${err.message}`);
      }
    }
    return applied;
  }

  async function reconcile() {
    if (!ready) return { checked: 0, applied: 0 };
    const b = await agenda.business();
    const since = new Date(clock() - 48 * HOUR);
    const list = await Appointment.find(
      {
        businessId: b._id,
        'payment.method': 'online',
        $or: [
          { status: 'pendiente_pago' },
          { 'payment.status': 'en_proceso' },
          { status: 'cancelada', 'payment.status': { $in: PAY_OPEN }, 'payment.holdStartedAt': { $gte: since } },
        ],
      },
      { _id: 1 }
    ).limit(200).lean();
    let applied = 0;
    for (const a of list) {
      try {
        applied += await reconcileOne(a._id, 'reconcile');
      } catch (err) {
        logger.error(`[mp] conciliación: cita ${a._id}: ${err.message}`);
      }
    }
    if (applied) logger.log(`[mp] conciliación: ${applied} pago(s) aplicados de ${list.length} cita(s)`);
    return { checked: list.length, applied };
  }

  /* La página de la cita consulta al server, que consulta a Mercado Pago si el pago sigue abierto. */
  async function syncForView(id, user) {
    if (!ready || !user) return;
    const _id = oid(id);
    if (!_id) return;
    const a = await Appointment.findById(_id, { status: 1, payment: 1, customerUserId: 1 }).lean();
    if (!a || String(a.customerUserId) !== String(user._id) || a.payment?.method !== 'online') return;
    if (a.status !== 'pendiente_pago' && a.payment?.status !== 'en_proceso') return;
    const now = clock();
    if (now - (lastViewSync.get(String(_id)) ?? -Infinity) < VIEW_SYNC_MS) return;
    lastViewSync.set(String(_id), now);
    if (lastViewSync.size > 1000) lastViewSync.delete(lastViewSync.keys().next().value);
    try {
      await reconcileOne(_id, 'view');
    } catch (err) {
      logger.error(`[mp] consulta desde la cita ${_id}: ${err.message}`);
    }
  }

  /* ─── Retención (RN-03 / CB-04): sin pago aprobado al vencer, la cita se cancela y la hora se libera. */
  async function runHolds() {
    const b = await agenda.business();
    const now = clock();
    const due = await Appointment.find({ businessId: b._id, status: 'pendiente_pago', expiresAt: { $lte: new Date(now) } }, { _id: 1 }).lean();
    let cancelled = 0;
    for (const { _id } of due) {
      try {
        /* Último intento de traer un pago antes de soltar la hora. */
        if (ready) await reconcileOne(_id, 'reconcile').catch((err) => logger.error(`[mp] retención: ${err.message}`));
        const r = await txn(_id, async (a, session) => {
          if (a.status !== 'pendiente_pago' || !(a.expiresAt?.getTime() <= now)) return null;
          await SlotLock.deleteMany({ appointmentId: a._id }, { session });
          a.status = 'cancelada';
          a.expiresAt = undefined;
          return { by: 'system', reason: 'Pago no completado a tiempo' };
        });
        if (r) {
          cancelled++;
          await agenda.notify(b, r.appt, 'client', 'payment_incomplete');
        }
      } catch (err) {
        logger.error(`[mp] retención: cita ${_id}: ${err.message}`);
      }
    }
    return { cancelled };
  }

  /* ─── Reembolso total desde el panel (RN-09, AC-10). `paymentId` = un duplicado (CB-08). */
  async function refund(user, id, { paymentId } = {}) {
    if (!ready) throw new HttpError(503, 'payments_not_configured', 'Mercado Pago no está configurado');
    const b = await agenda.business();
    const _id = oid(id);
    const current = _id ? await Appointment.findOne({ _id, businessId: b._id }).lean() : null;
    if (!current) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    const pid = paymentId ? String(paymentId) : current.payment?.mpPaymentId;
    const isDup = Boolean(paymentId) && String(paymentId) !== current.payment?.mpPaymentId;
    const nope = () => new HttpError(409, 'refund_unavailable', 'Este pago no tiene un reembolso pendiente (o ya se está procesando). Recarga para ver el estado actual.');
    if (!pid) throw nope();
    /* Doble clic: solo quien "toma" el reembolso llama a Mercado Pago. */
    const claim = isDup
      ? await Appointment.updateOne({ _id, 'payment.duplicates': { $elemMatch: { mpPaymentId: pid, status: 'reembolso_pendiente', refundInFlight: { $ne: true } } } }, { $set: { 'payment.duplicates.$.refundInFlight': true } })
      : await Appointment.updateOne({ _id, 'payment.mpPaymentId': pid, 'payment.status': 'reembolso_pendiente', 'payment.refundInFlight': { $ne: true } }, { $set: { 'payment.refundInFlight': true } });
    if (!claim.modifiedCount) throw nope();

    const release = (extra = {}) =>
      isDup
        ? Appointment.updateOne({ _id, 'payment.duplicates.mpPaymentId': pid }, { $set: { 'payment.duplicates.$.refundInFlight': false, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`payment.duplicates.$.${k}`, v])) } })
        : Appointment.updateOne({ _id }, { $set: { 'payment.refundInFlight': false, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`payment.${k}`, v])) } });

    try {
      await mp.refund(pid, { idempotencyKey: `wsstyle-refund-${pid}` });
    } catch (err) {
      /* CB-11: queda pendiente con el error visible; se puede reintentar. */
      const msg = String(err.message || 'error').slice(0, 200);
      await release({ refundError: msg });
      logger.error(`[mp] reembolso falló · pago ${pid}: ${msg}`);
      throw new HttpError(502, 'refund_failed', `Mercado Pago no pudo hacer el reembolso: ${msg}`, { refundError: msg });
    }
    const r = await txn(_id, (a) => {
      if (isDup) {
        const d = a.payment.duplicates?.find((x) => x.mpPaymentId === pid);
        if (!d) return null;
        d.status = 'reembolsado';
        d.refundedAt = d.refundedAt || new Date(clock());
        d.refundInFlight = false;
        d.refundError = undefined;
        return { by: 'admin', byUserId: user._id, reason: `Reembolso total del pago duplicado ${pid}` };
      }
      a.payment.status = 'reembolsado';
      a.payment.refundedAt = a.payment.refundedAt || new Date(clock());
      a.payment.refundInFlight = false;
      a.payment.refundError = undefined;
      return { by: 'admin', byUserId: user._id, reason: 'Reembolso total en Mercado Pago' };
    });
    const appt = r?.appt || (await Appointment.findById(_id));
    logger.log(`[mp] reembolso total · pago ${pid} · cita ${_id}`);
    await agenda.notify(b, appt, 'client', 'refunded');
    return { appt, paymentId: pid, duplicate: isDup };
  }

  return { info, ready, checkout, webhook, applyPayment, reconcile, syncForView, runHolds, refund };
}
