/* Gift cards de WS Style (SPEC-60).

   - Código `WS-XXXX-XXXX` (RN-02): 8 caracteres de un alfabeto sin ambiguos, aleatorio criptográfico,
     índice único. La búsqueda no distingue mayúsculas ni guiones. La página pública de la tarjeta usa
     un `token` distinto (24 bytes aleatorios): tener el código no da acceso a la página.
   - Saldo (RN-05): se descuenta con un update atómico condicional (`activa`, no vencida, saldo ≥ lo
     aplicado) dentro de la transacción que crea la cita. Dos reservas simultáneas → una OK y la otra 409.
   - Devolución (RN-06): si la cita se cancela/expira o su pago se reembolsa, lo descontado vuelve a la
     tarjeta, una sola vez por cita (claim atómico sobre `Appointment.giftCard.status`).
   - Compra en línea (RN-08): Mercado Pago con `external_reference = gc:<id>`; payments.js enruta por el
     prefijo. Solo `approved` con el monto exacto activa la tarjeta (misma regla que SPEC-35 RN-07). */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Appointment, AuditLog, Business, GiftCard, PaymentEvent, Service } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { isDuplicateKey, withTransaction } from '../lib/db.js';
import { isEmail, normEmail } from '../lib/validate.js';
import { createMercadoPagoClient } from '../lib/mercadopago.js';
import { giftCardMail } from '../lib/emails.js';
import { TAX_DOCUMENT_PROVIDERS } from '../lib/taxDocuments.js';
import { LOCAL_METHODS } from './tax.js';
import { mpFees } from './payments.js';
import { currentRates, quote } from './pricing.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const isHttps = (u) => /^https:\/\//i.test(String(u || ''));

/* Sin I, O, 0 ni 1 (se confunden al dictar o leer). 32 símbolos → 5 bits por carácter. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MIN_AMOUNT = 5000;
export const MAX_AMOUNT = 200000;
export const QUICK_AMOUNTS = [10000, 20000, 30000, 50000];
export const MAX_NAME = 40;
export const MAX_MESSAGE = 140;
export const DEFAULT_VALIDITY_MONTHS = 12;
export const PENDING_TTL_HOURS = 24;
export const GC_PREFIX = 'gc:';
export const INVALID_CODE_MESSAGE = 'Código no válido';
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm', 'bank_transfer'];
const VIEW_SYNC_MS = 5000;

export const STATUS_LABEL = { pendiente_pago: 'Por pagar', activa: 'Activa', usada: 'Usada', vencida: 'Vencida', anulada: 'Anulada' };

export function generateCode() {
  const bytes = crypto.randomBytes(8);
  const c = [...bytes].map((b) => CODE_ALPHABET[b & 31]).join('');
  return `WS-${c.slice(0, 4)}-${c.slice(4)}`;
}

/* CB-03: "ws7kq4m9tp", "WS-7KQ4-M9TP", "7kq4 m9tp" → "WS-7KQ4-M9TP". null si no tiene la forma. */
export function normalizeCode(raw) {
  let s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 10 && s.startsWith('WS')) s = s.slice(2);
  if (s.length !== 8 || ![...s].every((ch) => CODE_ALPHABET.includes(ch))) return null;
  return `WS-${s.slice(0, 4)}-${s.slice(4)}`;
}

/* CB-10 / RN-10: texto plano. Se sacan etiquetas HTML y caracteres de control; nunca se renderiza como HTML. */
export function plainText(raw) {
  return String(raw ?? '')
    .replace(/<[^>]*>?/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/* Estado que ve la gente: una `activa` cuyo vencimiento ya pasó es `vencida` aunque la tarea
   periódica aún no la haya marcado. */
export function effectiveStatus(card, now) {
  if (card.status === 'activa' && card.expiresAt && card.expiresAt.getTime() <= now) return 'vencida';
  return card.status;
}

/* RN-04: cuánto cubre la tarjeta en una cita.
   - Monto: descuenta del total (servicio + domicilio + tarifa de servicio), hasta el saldo.
   - Servicio intacta usada en ESE servicio: cubre servicio + su tarifa (sin domicilio) y consume la tarjeta.
   - Servicio en otro servicio (o ya usada en parte): actúa como monto por su saldo.
   `amountCLP` = descuento sobre la cita; `debitCLP` = lo que sale del saldo. Misma fórmula en el client. */
export function coverage(card, pricing, serviceId) {
  const total = Math.max(0, Math.round(Number(pricing?.totalCLP) || 0));
  const balance = Math.max(0, Math.round(Number(card?.balanceCLP) || 0));
  if (card?.kind === 'servicio' && card.service?.serviceId && String(card.service.serviceId) === String(serviceId) && balance === card.amountCLP) {
    const noHome = quote({ priceCLP: pricing.priceCLP, surchargeCLP: 0, platformFeeRate: pricing.platformFeeRate, paymentFeeRate: pricing.paymentFeeRate, paymentFeeVat: pricing.paymentFeeVat }).totalCLP;
    return { amountCLP: Math.min(total, noHome), debitCLP: balance, mode: 'servicio' };
  }
  const amount = Math.min(balance, total);
  return { amountCLP: amount, debitCLP: amount, mode: 'monto' };
}

/* Lo que queda por pagar de una cita (SPEC-60 RN-07): total − lo que cubrió la gift card. */
export function payableCLP(appt) {
  const total = Math.round(Number(appt?.pricing?.totalCLP) || 0);
  const gift = appt?.giftCard?.giftCardId ? Math.round(Number(appt.giftCard.amountCLP) || 0) : 0;
  return Math.max(0, total - gift);
}

const insufficient = () => new HttpError(409, 'giftcard_insufficient', 'Esta gift card ya no tiene saldo suficiente');
const invalidCode = () => new HttpError(404, 'giftcard_invalid', INVALID_CODE_MESSAGE);

/* Limitador por usuario + IP (RN-12). En memoria, como los demás (una instancia en Render free). */
export function createKeyedLimiter({ max, windowMs }, clock = Date.now) {
  const hits = new Map();
  function hit(key) {
    const now = clock();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return Math.ceil((windowMs - (now - recent[0])) / 1000);
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return 0;
  }
  return { hit, reset: () => hits.clear() };
}
export const CHECK_LIMIT = { max: 10, windowMs: 10 * MIN };

export function createGiftCards({ env = {}, clock = Date.now, logger = console, mailer = null, adminInbox = null, frontUrl = 'http://localhost:5173', fetchImpl = fetch, businessSlug = 'ws-style', taxProvider = TAX_DOCUMENT_PROVIDERS.voucher }) {
  const token = String(env.MP_ACCESS_TOKEN || '');
  const mp = createMercadoPagoClient({ accessToken: token, fetchImpl, baseUrl: env.MP_API_BASE || undefined });
  const ready = Boolean(token);
  const site = String(env.PUBLIC_SITE_URL || frontUrl).replace(/\/$/, '');
  const apiPublic = String(env.API_PUBLIC_URL || '').replace(/\/$/, '');
  const notificationUrl = String(env.MP_NOTIFICATION_URL || (apiPublic ? apiPublic + '/api/payments/mp/webhook' : ''));
  const lastViewSync = new Map();

  async function business() {
    const b = await Business.findOne({ slug: businessSlug }).lean();
    if (!b) throw new HttpError(503, 'agenda_unavailable', 'La agenda aún no está configurada');
    return b;
  }

  const settingsOf = (b) => ({ onlineEnabled: Boolean(b?.giftCards?.onlineEnabled), validityMonths: b?.giftCards?.validityMonths ?? DEFAULT_VALIDITY_MONTHS });
  /* Lo que ve la landing y la página /wstyle/regalar/ (AC-10). */
  const publicInfo = (b) => ({ online: settingsOf(b).onlineEnabled && ready, quickAmounts: QUICK_AMOUNTS, minCLP: MIN_AMOUNT, maxCLP: MAX_AMOUNT, maxMessage: MAX_MESSAGE });
  const cardUrl = (card) => `${site}/wstyle/regalo/?t=${card.token}`;

  async function alert(kind, title, body, card = null) {
    await adminInbox?.notify({ kind, title, body, path: card ? `gift-cards/?id=${card._id}` : 'gift-cards/' });
  }

  async function audit(user, b, action, card, summary, before = null, after = null) {
    try {
      await AuditLog.create({ businessId: b?._id, actorUserId: user._id, actorEmail: user.email, action, entity: 'giftcard', entityId: String(card._id), summary, before, after, at: new Date(clock()) });
    } catch (err) {
      logger.error('[giftcards] auditoría falló:', err.message);
    }
  }

  /* ─── Validación del formulario (RN-10). Saldo, estado, código y vencimiento nunca vienen del body. */
  async function parseInput(b, body = {}, { admin = false } = {}) {
    const fields = {};
    const kind = body.kind === 'servicio' ? 'servicio' : body.kind === 'monto' ? 'monto' : null;
    if (!kind) fields.kind = 'invalid_kind';
    let amountCLP = 0;
    let service = null;
    if (kind === 'monto') {
      const n = Number(body.amountCLP);
      if (!Number.isInteger(n) || n < MIN_AMOUNT || n > MAX_AMOUNT) fields.amountCLP = 'out_of_range';
      else amountCLP = n;
    } else if (kind === 'servicio') {
      const id = oid(body.serviceId);
      const s = await Service.findOne({ businessId: b._id, active: true, ...(id ? { _id: id } : { slug: String(body.serviceId ?? '') }) }).lean();
      if (!s) fields.serviceId = 'invalid_service';
      else {
        service = { serviceId: s._id, slug: s.slug, name: s.name, priceCLP: s.priceCLP };
        amountCLP = s.priceCLP;
      }
    }
    const from = plainText(body.from).replace(/\s+/g, ' ');
    const to = plainText(body.to).replace(/\s+/g, ' ');
    const message = plainText(body.message);
    if (!from || from.length > MAX_NAME) fields.from = from ? 'too_long' : 'required';
    if (!to || to.length > MAX_NAME) fields.to = to ? 'too_long' : 'required';
    if (message.length > MAX_MESSAGE) fields.message = 'too_long';
    const email = normEmail(body.email);
    if (admin ? email && !isEmail(email) : !isEmail(email)) fields.email = 'invalid_email';
    let localMethod;
    if (admin) {
      localMethod = String(body.localMethod ?? '');
      if (!Object.hasOwn(LOCAL_METHODS, localMethod)) fields.localMethod = 'required';
    }
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], 'Revisa los datos de la gift card', { fields });
    return { kind, amountCLP, service, from, to, message, email: email || undefined, localMethod };
  }

  /* Crea la tarjeta con un código y un token nuevos (reintenta si el aleatorio choca). */
  async function insertCard(doc) {
    for (let i = 0; ; i++) {
      try {
        const [card] = await GiftCard.create([{ ...doc, code: generateCode(), token: crypto.randomBytes(24).toString('base64url') }]);
        return card;
      } catch (err) {
        if (isDuplicateKey(err) && i < 5) continue;
        throw err;
      }
    }
  }

  /* ─── Compra en línea (POST /api/wstyle/gift-cards) */
  async function purchase(user, body) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para comprar una gift card');
    const b = await business();
    if (!publicInfo(b).online) throw new HttpError(409, 'giftcards_offline', 'Por ahora las gift cards se venden en el local');
    const input = await parseInput(b, body);
    const now = clock();
    /* RN-01: valor + tarifa de servicio (misma quote de SPEC-38, sin domicilio). */
    const rates = await currentRates();
    const q = quote({ priceCLP: input.amountCLP, surchargeCLP: 0, method: 'online', ...rates });
    const card = await insertCard({
      businessId: b._id,
      kind: input.kind,
      service: input.service || undefined,
      amountCLP: input.amountCLP,
      balanceCLP: input.amountCLP,
      from: input.from,
      to: input.to,
      message: input.message,
      buyerEmail: input.email,
      buyerUserId: user._id,
      status: 'pendiente_pago',
      origin: 'online',
      validityMonths: settingsOf(b).validityMonths,
      pricing: { priceCLP: q.priceCLP, platformFeeCLP: q.platformFeeCLP, paymentFeeCLP: q.paymentFeeCLP, serviceFeeCLP: q.serviceFeeCLP, totalCLP: q.totalCLP, platformFeeRate: q.platformFeeRate, paymentFeeRate: q.paymentFeeRate, paymentFeeVat: q.paymentFeeVat },
      movements: [{ kind: 'emision', amountCLP: input.amountCLP, balanceCLP: input.amountCLP, by: 'client', byUserId: user._id, at: new Date(now), reason: 'Compra en línea (esperando el pago)' }],
      createdByUserId: user._id,
    });
    const pref = await checkout(card, user, now);
    return { id: String(card._id), ...pref, pricing: card.pricing };
  }

  async function checkout(card, user, now = clock()) {
    const bumped = await GiftCard.findOneAndUpdate({ _id: card._id }, { $inc: { 'payment.attempts': 1 } }, { new: true, projection: { 'payment.attempts': 1 } });
    const attempt = bumped?.payment?.attempts ?? 1;
    const back = (r) => `${site}/wstyle/regalar/?gc=${card._id}&pago=${r}`;
    const title = card.kind === 'servicio' ? `Gift card ${card.service?.name || 'servicio'} · WS Style` : `Gift card ${money(card.amountCLP)} · WS Style`;
    const preference = {
      items: [{ id: `giftcard-${card.kind}`, title, quantity: 1, unit_price: card.pricing.totalCLP, currency_id: 'CLP' }],
      payer: { email: card.buyerEmail || user?.email },
      external_reference: GC_PREFIX + String(card._id),
      back_urls: { success: back('approved'), failure: back('failure'), pending: back('pending') },
      expires: true,
      expiration_date_from: new Date(now).toISOString(),
      expiration_date_to: new Date(card.createdAt.getTime() + PENDING_TTL_HOURS * HOUR).toISOString(),
      payment_methods: { excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((x) => ({ id: x })), installments: 1 },
      statement_descriptor: 'WSSTYLE',
      metadata: { gift_card_id: String(card._id) },
    };
    if (isHttps(site)) preference.auto_return = 'approved';
    if (isHttps(notificationUrl)) preference.notification_url = notificationUrl;
    try {
      const pref = await mp.createPreference(preference, { idempotencyKey: `wsstyle-gc-${card._id}-${attempt}` });
      await GiftCard.updateOne({ _id: card._id }, { $set: { 'payment.preferenceId': String(pref.id || '') } });
      logger.log(`[mp] preferencia ${pref.id} · gift card ${card._id}`);
      return { initPoint: pref.init_point, preferenceId: String(pref.id || '') };
    } catch (err) {
      logger.error(`[mp] preferencia de gift card falló · ${card._id}: ${err.status ?? ''} ${err.message}`);
      throw new HttpError(502, 'payment_provider_error', 'No pudimos abrir Mercado Pago. Reintenta en unos minutos.');
    }
  }

  /* Reintentar el pago de una compra que sigue por pagar (solo quien la compró). */
  async function retry(user, id) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    const card = await ownCard(user, id);
    if (card.status !== 'pendiente_pago' || card.discardedAt) throw new HttpError(409, 'invalid_state', 'Esta gift card ya no espera un pago');
    if (!ready) throw new HttpError(503, 'payments_not_configured', 'El pago en línea no está disponible');
    return checkout(card, user);
  }

  async function ownCard(user, id) {
    const _id = oid(id);
    const card = _id ? await GiftCard.findById(_id) : null;
    if (!card || String(card.buyerUserId) !== String(user._id)) throw new HttpError(404, 'not_found', 'No encontramos esta gift card');
    return card;
  }

  /* Vuelta de Mercado Pago: el estado se consulta al API (nunca se cree el ?pago=). */
  async function purchaseStatus(user, id) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    let card = await ownCard(user, id);
    if (card.status === 'pendiente_pago' && ready) {
      const now = clock();
      if (now - (lastViewSync.get(String(card._id)) ?? -Infinity) >= VIEW_SYNC_MS) {
        lastViewSync.set(String(card._id), now);
        if (lastViewSync.size > 1000) lastViewSync.delete(lastViewSync.keys().next().value);
        await reconcileOne(card._id, 'view').catch((err) => logger.error(`[mp] gift card ${card._id}: ${err.message}`));
        card = await GiftCard.findById(card._id);
      }
    }
    const st = effectiveStatus(card, clock());
    return { id: String(card._id), status: st, statusLabel: STATUS_LABEL[st], url: st === 'pendiente_pago' ? null : cardUrl(card), token: st === 'pendiente_pago' ? null : card.token, discarded: Boolean(card.discardedAt) };
  }

  /* ─── Página pública de la tarjeta (enlace secreto). */
  function cardView(card, now) {
    const st = effectiveStatus(card, now);
    return {
      code: card.code,
      kind: card.kind,
      amountCLP: card.amountCLP,
      balanceCLP: card.balanceCLP,
      service: card.service?.name ? { name: card.service.name } : null,
      from: card.from || '',
      to: card.to || '',
      message: card.message || '',
      expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null,
      status: st,
      statusLabel: STATUS_LABEL[st],
      url: cardUrl(card),
    };
  }

  async function publicCard(t) {
    const tk = String(t ?? '');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(tk)) throw new HttpError(404, 'not_found', 'No encontramos esta gift card');
    const card = await GiftCard.findOne({ token: tk }).lean();
    if (!card || card.status === 'pendiente_pago') throw new HttpError(404, 'not_found', 'No encontramos esta gift card');
    return cardView(card, clock());
  }

  /* ─── Canje: validar el código (RN-12: misma respuesta ante inexistente, vencida, anulada o por pagar). */
  async function findUsable(b, raw, now = clock()) {
    const code = normalizeCode(raw);
    if (!code) return null;
    return GiftCard.findOne({ businessId: b._id, code, status: 'activa', blocked: { $ne: true }, balanceCLP: { $gt: 0 }, expiresAt: { $gt: new Date(now) } }).lean();
  }

  async function check(user, raw) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para usar una gift card');
    const b = await business();
    const card = await findUsable(b, raw);
    if (!card) throw invalidCode();
    return {
      code: card.code,
      kind: card.kind,
      from: card.from || '',
      amountCLP: card.amountCLP,
      balanceCLP: card.balanceCLP,
      service: card.service?.slug ? { id: card.service.slug, name: card.service.name } : null,
      expiresAt: card.expiresAt.toISOString(),
    };
  }

  /* Dentro de la transacción de la cita: valida y descuenta el saldo. Lanza 409 si ya no alcanza. */
  async function reserve(session, { b, code, pricing, serviceId, apptId, user, now }) {
    const card = await findUsable(b, code, now);
    if (!card) throw new HttpError(409, 'giftcard_invalid', INVALID_CODE_MESSAGE);
    const cov = coverage(card, pricing, serviceId);
    if (!(cov.amountCLP > 0)) throw new HttpError(409, 'giftcard_invalid', INVALID_CODE_MESSAGE);
    const ok = await debit(session, card, cov.debitCLP, apptId, now, { by: 'client', byUserId: user?._id });
    if (!ok) throw insufficient();
    return { giftCardId: card._id, code: card.code, from: card.from || '', kind: cov.mode, amountCLP: cov.amountCLP, debitCLP: cov.debitCLP, status: 'reservada', appliedAt: new Date(now) };
  }

  async function debit(session, card, amount, apptId, now, { by = 'client', byUserId } = {}) {
    const upd = await GiftCard.findOneAndUpdate(
      { _id: card._id, status: 'activa', blocked: { $ne: true }, expiresAt: { $gt: new Date(now) }, balanceCLP: { $gte: amount } },
      { $inc: { balanceCLP: -amount }, $push: { movements: { kind: 'canje', amountCLP: -amount, appointmentId: apptId, by, byUserId, at: new Date(now) } } },
      { session, new: true }
    );
    if (!upd) return false;
    if (upd.balanceCLP === 0) await GiftCard.updateOne({ _id: card._id, status: 'activa', balanceCLP: 0 }, { $set: { status: 'usada' } }, { session });
    return true;
  }

  /* Compensación sin transacciones (Mongo standalone): devuelve lo descontado si la cita no se creó. */
  async function undoReserve(applied, apptId) {
    await GiftCard.updateOne({ _id: applied.giftCardId }, { $inc: { balanceCLP: applied.debitCLP }, $pull: { movements: { kind: 'canje', appointmentId: apptId } } });
    await GiftCard.updateOne({ _id: applied.giftCardId, status: 'usada', balanceCLP: { $gt: 0 } }, { $set: { status: 'activa' } });
  }

  /* RN-08 de SPEC-35: un pago tardío reactiva una cita cancelada por falta de pago. Si su gift card ya
     se había devuelto, se intenta volver a aplicar (dentro de la misma transacción). */
  async function reapply(session, a, now) {
    const g = a.giftCard;
    if (!g?.giftCardId || g.status !== 'revertida') return true;
    const card = await GiftCard.findById(g.giftCardId).session(session).lean();
    const ok = card && (await debit(session, card, g.debitCLP, a._id, now, { by: 'system' }));
    if (!ok) return false;
    g.status = 'confirmada';
    g.revertedAt = undefined;
    g.confirmedAt = new Date(now);
    return true;
  }

  /* RN-06: devuelve lo aplicado (idempotente por cita). */
  async function revert(apptId, reason = '') {
    const now = clock();
    return withTransaction(async (session) => {
      const a = await Appointment.findOneAndUpdate(
        { _id: apptId, 'giftCard.giftCardId': { $exists: true }, 'giftCard.status': { $in: ['reservada', 'confirmada'] } },
        { $set: { 'giftCard.status': 'revertida', 'giftCard.revertedAt': new Date(now) } },
        { new: true, session }
      ).lean();
      if (!a) return false;
      const amount = Math.round(Number(a.giftCard.debitCLP) || 0);
      const g = await GiftCard.findOneAndUpdate(
        { _id: a.giftCard.giftCardId },
        { $inc: { balanceCLP: amount }, $push: { movements: { kind: 'reversion', amountCLP: amount, appointmentId: a._id, by: 'system', reason: reason || undefined, at: new Date(now) } } },
        { new: true, session }
      );
      if (g && g.balanceCLP > 0 && ['usada', 'activa'].includes(g.status)) {
        /* Asunción 5: si ya venció, el saldo vuelve pero la tarjeta queda vencida (el admin puede extenderla). */
        const next = g.expiresAt && g.expiresAt.getTime() > now ? 'activa' : 'vencida';
        if (next !== g.status) await GiftCard.updateOne({ _id: g._id }, { $set: { status: next } }, { session });
      }
      return true;
    }, logger);
  }

  /* Revisa una cita después de un cambio: si se cayó (cancelada/expirada) o su pago se reembolsó,
     devuelve la gift card. Nunca rompe el flujo que la llama. */
  async function afterChange(appt) {
    try {
      const g = appt?.giftCard;
      if (!g?.giftCardId || !['reservada', 'confirmada'].includes(g.status)) return false;
      const fallen = ['cancelada', 'expirada'].includes(appt.status);
      const refunded = ['reembolsado'].includes(appt.payment?.status);
      if (!fallen && !refunded) return false;
      return await revert(appt._id, fallen ? `Cita ${appt.status}` : 'Pago reembolsado');
    } catch (err) {
      logger.error(`[giftcards] devolución · cita ${appt?._id}: ${err.message}`);
      return false;
    }
  }

  /* ─── Pagos de Mercado Pago de una compra (payments.applyPayment enruta acá por el prefijo gc:). */
  async function applyPayment(p, via) {
    const mpId = String(p?.id ?? '');
    const status = String(p?.status ?? '');
    if (!mpId || !status) return 'invalid';
    const ref = String(p.external_reference || '');
    const _id = oid(ref.slice(GC_PREFIX.length));
    const card = _id ? await GiftCard.findById(_id).lean() : null;
    const amountOk = card && p.currency_id === 'CLP' && Math.round(Number(p.transaction_amount)) === card.pricing?.totalCLP;
    let event;
    try {
      event = await PaymentEvent.create({ businessId: card?.businessId, giftCardId: card?._id, mpPaymentId: mpId, status, amount: Number(p.transaction_amount) || 0, currency: p.currency_id, via });
    } catch (err) {
      if (isDuplicateKey(err)) return 'duplicate';
      throw err;
    }
    try {
      const outcome = await applyEvent({ card, p, mpId, status, amountOk });
      await PaymentEvent.updateOne({ _id: event._id }, { outcome });
      return outcome;
    } catch (err) {
      await PaymentEvent.deleteOne({ _id: event._id }).catch(() => {});
      throw err;
    }
  }

  async function applyEvent({ card, p, mpId, status, amountOk }) {
    const now = clock();
    if (!card) {
      if (status === 'approved') await alert('payment_orphan', `Pago de gift card sin tarjeta (${money(p.transaction_amount)})`, `El pago ${mpId} no corresponde a ninguna gift card. Revísalo en Mercado Pago.`);
      return 'orphan';
    }
    if (!amountOk) {
      /* CB-08: monto distinto → nunca se activa. */
      if (status === 'approved') await alert('payment_mismatch', `Pago de gift card con monto distinto: ${money(p.transaction_amount)} ${p.currency_id || ''} (esperado ${money(card.pricing?.totalCLP)})`, `Gift card ${card.code} · pago ${mpId}. No se activó.`, card);
      return 'mismatch';
    }
    if (status === 'approved') {
      const fees = mpFees(p);
      const b = await Business.findById(card.businessId).lean();
      const months = card.validityMonths || settingsOf(b).validityMonths;
      const taxDoc = taxProvider.automaticFor({ channel: 'online', mpPaymentId: mpId, amountCLP: Math.round(Number(p.transaction_amount) || 0), at: new Date(now) });
      const upd = await GiftCard.findOneAndUpdate(
        { _id: card._id, status: 'pendiente_pago' },
        {
          $set: {
            status: 'activa',
            activatedAt: new Date(now),
            expiresAt: addMonths(now, months),
            'payment.mpPaymentId': mpId,
            'payment.mpStatus': 'approved',
            'payment.paidAt': new Date(now),
            'payment.amountCLP': Math.round(Number(p.transaction_amount) || 0),
            'payment.mpFeeCLP': fees.feeCLP,
            'payment.mpNetCLP': fees.netCLP,
            'payment.taxModel': taxProvider.id,
            ...(taxDoc ? { 'payment.taxDoc': taxDoc } : {}),
          },
          $unset: { discardedAt: 1 },
          $push: { movements: { kind: 'activacion', amountCLP: card.amountCLP, balanceCLP: card.balanceCLP, by: 'system', reason: `Pago aprobado en Mercado Pago (${mpId})`, at: new Date(now) } },
        },
        { new: true }
      );
      if (!upd) {
        if (card.payment?.mpPaymentId === mpId) return 'ignored';
        await alert('payment_duplicate', `Gift card pagada dos veces: ${money(p.transaction_amount)}`, `Gift card ${card.code} ya estaba pagada (pago ${card.payment?.mpPaymentId || '—'}). Reembolsa el pago ${mpId} desde Mercado Pago.`, card);
        return 'duplicate';
      }
      await sendCard(upd, upd.buyerEmail);
      return 'activated';
    }
    if (status === 'refunded') {
      if (card.payment?.mpPaymentId !== mpId || card.payment?.refundedAt) return 'ignored';
      const untouched = card.balanceCLP === card.amountCLP && !card.movements?.some((m) => m.kind === 'canje');
      if (untouched && card.status !== 'anulada') {
        await GiftCard.updateOne({ _id: card._id }, { $set: { status: 'anulada', voidReason: 'Compra reembolsada en Mercado Pago', 'payment.refundedAt': new Date(now), 'payment.mpStatus': 'refunded' }, $push: { movements: { kind: 'reembolso', amountCLP: 0, by: 'system', reason: 'Compra reembolsada en Mercado Pago', at: new Date(now) } } });
        return 'refunded';
      }
      /* RN-08: ya se usó → se bloquea y se avisa. */
      await GiftCard.updateOne({ _id: card._id }, { $set: { blocked: true, 'payment.refundedAt': new Date(now), 'payment.mpStatus': 'refunded' }, $push: { movements: { kind: 'reembolso', amountCLP: 0, by: 'system', reason: 'Compra reembolsada después de usarse: bloqueada', at: new Date(now) } } });
      await alert('giftcard_refunded_used', `Gift card ${card.code} reembolsada después de usarse`, `La compra (${money(card.pricing?.totalCLP)}) se reembolsó en Mercado Pago, pero la tarjeta ya se había usado. Quedó bloqueada. Revisa las citas donde se usó.`, card);
      return 'refunded_blocked';
    }
    if (status === 'charged_back') {
      if (card.payment?.mpPaymentId !== mpId || card.payment?.chargebackAt) return 'ignored';
      await GiftCard.updateOne({ _id: card._id }, { $set: { blocked: true, 'payment.chargebackAt': new Date(now), 'payment.mpStatus': 'charged_back' } });
      await alert('payment_chargeback', `Contracargo de una gift card (${money(p.transaction_amount)})`, `Gift card ${card.code}: el comprador desconoció el pago ${mpId}. La tarjeta quedó bloqueada.`, card);
      return 'charged_back';
    }
    if (status === 'in_mediation') {
      await alert('payment_dispute', 'Pago de gift card en disputa', `Gift card ${card.code} · pago ${mpId}. Revisa el reclamo en Mercado Pago.`, card);
      return 'alerted';
    }
    return 'ignored';
  }

  async function reconcileOne(id, via) {
    const results = await mp.searchPayments(GC_PREFIX + String(id));
    results.sort((x, y) => Date.parse(x.date_last_updated || x.date_created || 0) - Date.parse(y.date_last_updated || y.date_created || 0));
    let applied = 0;
    for (const p of results) {
      try {
        const out = await applyPayment(p, via);
        if (!['duplicate', 'ignored'].includes(out)) applied++;
      } catch (err) {
        logger.error(`[mp] conciliación gift card: pago ${p?.id}: ${err.message}`);
      }
    }
    return applied;
  }

  async function reconcile() {
    if (!ready) return { checked: 0, applied: 0 };
    const since = new Date(clock() - 48 * HOUR);
    const list = await GiftCard.find({ status: 'pendiente_pago', createdAt: { $gte: since } }, { _id: 1 }).limit(200).lean();
    let applied = 0;
    for (const c of list) applied += await reconcileOne(c._id, 'reconcile').catch(() => 0);
    return { checked: list.length, applied };
  }

  /* ─── Tarea periódica: vencidas (RN-03) y compras sin pagar de más de 24 h (RN-08). */
  async function runTasks() {
    const now = new Date(clock());
    const expired = await GiftCard.updateMany({ status: 'activa', expiresAt: { $lte: now } }, { $set: { status: 'vencida' } });
    const discarded = await GiftCard.updateMany({ status: 'pendiente_pago', discardedAt: { $exists: false }, createdAt: { $lte: new Date(now.getTime() - PENDING_TTL_HOURS * HOUR) } }, { $set: { discardedAt: now } });
    /* RN-06: si la devolución falló después de caerse la cita (o el proceso se reinició), se completa acá. */
    const stuck = await Appointment.find({ 'giftCard.status': { $in: ['reservada', 'confirmada'] }, $or: [{ status: { $in: ['cancelada', 'expirada'] } }, { 'payment.status': 'reembolsado' }] }, { _id: 1, status: 1, payment: 1, giftCard: 1 }).limit(200).lean();
    let recovered = 0;
    for (const a of stuck) if (await afterChange(a)) recovered++;
    return { expired: expired.modifiedCount, discarded: discarded.modifiedCount, recovered };
  }

  async function sendCard(card, to) {
    if (!mailer || !to) return false;
    const mail = giftCardMail({ card, url: cardUrl(card) });
    const out = await mailer.send({ to, ...mail });
    if (out.ok) await GiftCard.updateOne({ _id: card._id }, { $set: { mailedAt: new Date(clock()) } });
    return out.ok;
  }

  /* ─── Panel del super admin (la autorización la hace el router). */
  function adminRow(card, now) {
    const st = effectiveStatus(card, now);
    return {
      id: String(card._id),
      code: card.code,
      from: card.from || '',
      to: card.to || '',
      kind: card.kind,
      service: card.service?.name ? { id: card.service.slug, name: card.service.name } : null,
      amountCLP: card.amountCLP,
      balanceCLP: card.balanceCLP,
      expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null,
      status: st,
      statusLabel: STATUS_LABEL[st],
      origin: card.origin,
      localMethod: card.payment?.localMethod || null,
      blocked: Boolean(card.blocked),
      discarded: Boolean(card.discardedAt),
      createdAt: card.createdAt.toISOString(),
    };
  }

  async function list(q = {}) {
    const b = await business();
    const now = clock();
    const all = await GiftCard.find({ businessId: b._id }).sort({ createdAt: -1 }).limit(3000).lean();
    const rows = all.map((c) => adminRow(c, now));
    const live = rows.filter((r) => !(r.status === 'pendiente_pago' && r.discarded));
    const counters = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, live.filter((r) => r.status === k).length]));
    let items = live;
    const st = String(q.status || '');
    if (st && STATUS_LABEL[st]) items = items.filter((r) => r.status === st);
    const term = String(q.q || '').trim().toLowerCase();
    if (term) {
      const code = normalizeCode(term);
      const bare = term.replace(/[^a-z0-9]/g, '');
      items = items.filter((r) => (code && r.code === code) || (bare.length >= 3 && r.code.toLowerCase().replace(/-/g, '').includes(bare)) || r.from.toLowerCase().includes(term) || r.to.toLowerCase().includes(term));
    }
    return { counters, items: items.slice(0, 500), settings: settingsOf(b), online: publicInfo(b).online };
  }

  async function loadCard(id) {
    const _id = oid(id);
    const card = _id ? await GiftCard.findById(_id) : null;
    if (!card) throw new HttpError(404, 'not_found', 'No encontramos esta gift card');
    return card;
  }

  async function detail(id) {
    const card = await loadCard(id);
    const now = clock();
    const apptIds = [...new Set(card.movements.filter((m) => m.appointmentId).map((m) => String(m.appointmentId)))].map((x) => new ObjectId(x));
    const appts = await Appointment.find({ _id: { $in: apptIds } }, { startsAt: 1, status: 1, customerSnapshot: 1, serviceSnapshot: 1, giftCard: 1, pricing: 1 }).lean();
    /* CB-04: el admin ve el motivo real de por qué un código no se puede usar. */
    const reason = card.blocked ? 'Bloqueada: la compra se reembolsó o tuvo contracargo' : card.status === 'anulada' ? `Anulada: ${card.voidReason || ''}` : effectiveStatus(card, now) === 'vencida' ? 'Vencida' : card.status === 'pendiente_pago' ? (card.discardedAt ? 'Compra sin pagar (descartada)' : 'Esperando el pago') : card.balanceCLP === 0 ? 'Sin saldo' : null;
    return {
      ...adminRow(card, now),
      message: card.message || '',
      buyerEmail: card.buyerEmail || null,
      voidReason: card.voidReason || null,
      unusableReason: reason,
      token: card.token,
      url: cardUrl(card),
      pricing: card.pricing?.totalCLP ? card.pricing : null,
      payment: { mpPaymentId: card.payment?.mpPaymentId || null, paidAt: card.payment?.paidAt?.toISOString() || null, collectedAt: card.payment?.collectedAt?.toISOString() || null, localMethod: card.payment?.localMethod || null, refundedAt: card.payment?.refundedAt?.toISOString() || null },
      activatedAt: card.activatedAt ? card.activatedAt.toISOString() : null,
      mailedAt: card.mailedAt ? card.mailedAt.toISOString() : null,
      movements: card.movements.map((m) => ({ kind: m.kind, amountCLP: m.amountCLP, appointmentId: m.appointmentId ? String(m.appointmentId) : null, by: m.by || null, reason: m.reason || null, at: m.at.toISOString() })),
      appointments: appts.map((a) => ({ id: String(a._id), startsAt: a.startsAt.toISOString(), status: a.status, customer: a.customerSnapshot?.name || '', service: a.serviceSnapshot?.name || '', amountCLP: a.giftCard?.amountCLP || 0, giftStatus: a.giftCard?.status || null })),
    };
  }

  /* Emisión manual (venta en el local): nace activa y queda en la rendición. */
  async function issue(user, body = {}) {
    const b = await business();
    const input = await parseInput(b, body, { admin: true });
    const now = clock();
    const months = settingsOf(b).validityMonths;
    const card = await insertCard({
      businessId: b._id,
      kind: input.kind,
      service: input.service || undefined,
      amountCLP: input.amountCLP,
      balanceCLP: input.amountCLP,
      from: input.from,
      to: input.to,
      message: input.message,
      buyerEmail: input.email,
      status: 'activa',
      origin: 'local',
      validityMonths: months,
      activatedAt: new Date(now),
      expiresAt: addMonths(now, months),
      payment: { localMethod: input.localMethod, collectedAt: new Date(now), amountCLP: input.amountCLP, taxModel: taxProvider.id },
      movements: [{ kind: 'emision', amountCLP: input.amountCLP, balanceCLP: input.amountCLP, by: 'admin', byUserId: user._id, reason: `Venta en el local (${LOCAL_METHODS[input.localMethod]})`, at: new Date(now) }],
      createdByUserId: user._id,
    });
    await audit(user, b, 'giftcard.issue', card, `${card.code} · ${money(card.amountCLP)} · ${LOCAL_METHODS[input.localMethod]}`, null, { status: 'activa', amountCLP: card.amountCLP });
    if (input.email) await sendCard(card, input.email);
    return detail(card._id);
  }

  async function voidCard(user, id, body = {}) {
    const reason = plainText(body.reason).slice(0, 300);
    if (!reason) throw new HttpError(400, 'reason_required', 'Escribe el motivo de la anulación', { fields: { reason: 'required' } });
    const b = await business();
    const card = await loadCard(id);
    if (card.status === 'anulada') throw new HttpError(409, 'invalid_state', 'Esta gift card ya está anulada');
    const now = clock();
    const before = { status: effectiveStatus(card, now), balanceCLP: card.balanceCLP };
    const r = await GiftCard.updateOne({ _id: card._id, status: card.status }, { $set: { status: 'anulada', voidReason: reason }, $push: { movements: { kind: 'anulacion', amountCLP: 0, by: 'admin', byUserId: user._id, reason, at: new Date(now) } } });
    if (!r.modifiedCount) throw new HttpError(409, 'stale', 'La gift card cambió. Recarga para ver el estado actual.');
    await audit(user, b, 'giftcard.void', card, `${card.code} — ${reason}`, before, { status: 'anulada' });
    return detail(card._id);
  }

  async function extend(user, id, body = {}) {
    const months = Number(body.months);
    if (!Number.isInteger(months) || months < 1 || months > 24) throw new HttpError(400, 'out_of_range', 'Elige entre 1 y 24 meses', { fields: { months: 'out_of_range' } });
    const b = await business();
    const card = await loadCard(id);
    if (!['activa', 'vencida', 'usada'].includes(card.status)) throw new HttpError(409, 'invalid_state', 'Esta gift card no se puede extender');
    const now = clock();
    const base = Math.max(card.expiresAt?.getTime() || now, now);
    const expiresAt = addMonths(base, months);
    const status = card.balanceCLP > 0 ? 'activa' : 'usada';
    const before = { status: effectiveStatus(card, now), expiresAt: card.expiresAt?.toISOString() || null };
    await GiftCard.updateOne({ _id: card._id }, { $set: { expiresAt, status }, $push: { movements: { kind: 'extension', amountCLP: 0, by: 'admin', byUserId: user._id, reason: `+${months} meses (hasta ${expiresAt.toISOString().slice(0, 10)})`, at: new Date(now) } } });
    await audit(user, b, 'giftcard.extend', card, `${card.code} · +${months} meses`, before, { status, expiresAt: expiresAt.toISOString() });
    return detail(card._id);
  }

  async function resend(user, id, body = {}) {
    const b = await business();
    const card = await loadCard(id);
    if (card.status === 'pendiente_pago') throw new HttpError(409, 'invalid_state', 'Esta gift card aún no está pagada');
    const to = normEmail(body.email) || card.buyerEmail;
    if (!to || !isEmail(to)) throw new HttpError(400, 'invalid_email', 'Escribe un correo válido', { fields: { email: 'invalid_email' } });
    const ok = await sendCard(card, to);
    await audit(user, b, 'giftcard.resend', card, `${card.code} → ${to}`);
    return { ok, to };
  }

  /* Ajustes (sección Gift cards de Configuración). */
  async function setSettings(b, body = {}) {
    const fields = {};
    const set = {};
    if (body.onlineEnabled !== undefined) {
      if (typeof body.onlineEnabled !== 'boolean') fields['giftCards.onlineEnabled'] = 'invalid';
      else set['giftCards.onlineEnabled'] = body.onlineEnabled;
    }
    if (body.validityMonths !== undefined) {
      const v = body.validityMonths;
      if (!Number.isInteger(v) || v < 1 || v > 36) fields['giftCards.validityMonths'] = 'out_of_range';
      else set['giftCards.validityMonths'] = v;
    }
    const extra = Object.keys(body).filter((k) => !['onlineEnabled', 'validityMonths'].includes(k));
    if (extra.length) fields.giftCards = 'not_allowed';
    return { fields, set };
  }

  return {
    ready,
    settingsOf,
    publicInfo,
    purchase,
    retry,
    purchaseStatus,
    publicCard,
    check,
    findUsable,
    reserve,
    undoReserve,
    reapply,
    revert,
    afterChange,
    applyPayment,
    reconcile,
    runTasks,
    list,
    detail,
    issue,
    voidCard,
    extend,
    resend,
    setSettings,
    business,
  };
}
