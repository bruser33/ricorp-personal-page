/* Pagos y rendición mensual (SPEC-37). Un "pago" se deriva de la cita (SPEC-35 guarda el pago
   dentro de Appointment.payment): el pago de Mercado Pago de la cita, sus duplicados (CB-08 de
   SPEC-35) y el cobro en el local. No hay una colección aparte: los datos de pago se conservan
   con la cita (asunción 7: 6 años; las citas no se borran).

   Estados del pago (hacia el panel):
     aprobado · reembolso_pendiente · reembolsado · contracargo   → "aprobados" (suman a ventas)
     pendiente · rechazado                                         → no suman, sin respaldo
     por_cobrar                                                    → cita terminada sin cobrar en el local
   Respaldo (regla 3, uno por venta): voucher_mp · boleta_sii · sin_respaldo.

   Rendición del mes (America/Santiago):
   - Ventas: pagos aprobados cuya fecha de venta (pago o cobro) cae en el mes.
   - Reembolsos: reembolsos y contracargos cuya fecha cae en el mes (aunque la venta sea de
     otro mes), descontados del respaldo de su venta.
   - Cuadre (regla 7): aprobados − reembolsos = Σ por respaldo (voucher MP + boleta + sin respaldo),
     donde cada bolsa se arma desde el documento guardado en el pago (no desde su estado). Si no
     calza, o hay algo raro (respaldo sobre un pago no aprobado, boleta sobre un voucher, voucher en
     un cobro del local, reembolso de una venta con boleta → nota de crédito), se lista. */
import mongoose from 'mongoose';
import { Appointment, GiftCard } from '../models/index.js';
import { payableCLP } from './giftcards.js';
import { HttpError } from '../lib/errors.js';
import { csvDocument } from '../lib/csv.js';
import { emitterInfo, TAX_DOCUMENT_PROVIDERS } from '../lib/taxDocuments.js';
import { BACKING_LABEL, boletaClash, isBoletaClash, METHOD_LABEL, parseBoletaNumber, saleLines, TAX_WARNING, taxBreakdown } from './tax.js';
import { addDays, isDate, wallClock, zonedToUtc } from './time.js';
import { monthRange } from './stats.js';

const { ObjectId } = mongoose.Types;
const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);

export const COUNTED = new Set(['aprobado', 'reembolso_pendiente', 'reembolsado', 'contracargo']);
const REFUNDED = new Set(['reembolsado', 'contracargo']);
const ONLINE_STATUS = { pendiente: 'pendiente', en_proceso: 'pendiente', rechazado: 'rechazado', pagado: 'aprobado', reembolso_pendiente: 'reembolso_pendiente', reembolsado: 'reembolsado', contracargo: 'contracargo' };
export const PAY_STATUS_LABEL = { aprobado: 'Aprobado', pendiente: 'Pendiente', rechazado: 'Rechazado', reembolso_pendiente: 'Reembolso pendiente', reembolsado: 'Reembolsado', contracargo: 'Contracargo', por_cobrar: 'Por cobrar' };
const DIFF_MESSAGE = {
  respaldo_sin_pago_aprobado: 'Tiene un respaldo pero el pago no está aprobado.',
  voucher_en_pago_local: 'Cobro en el local marcado con voucher de Mercado Pago.',
  boleta_sobre_voucher: 'Pago con Mercado Pago y boleta propia en el modelo voucher: posible doble emisión (corregir con nota de crédito).',
  reembolso_con_boleta: 'Venta con boleta SII reembolsada: emite una nota de crédito (tipo 61) en el SII.',
};
const MODEL_LABEL = { ...Object.fromEntries(Object.values(TAX_DOCUMENT_PROVIDERS).map((p) => [p.id, p.declaredModel])), sin_dato: 'Sin dato' };

/* SPEC-60: la parte cubierta por gift card se resta en el detalle (las líneas suman lo cobrado). */
const withGiftLine = (lines, a) => (a.giftCard?.giftCardId && a.giftCard.amountCLP ? [...lines, { kind: 'gift_card', label: `Gift card ${a.giftCard.code || ''}`.trim(), amountCLP: -Math.round(Number(a.giftCard.amountCLP) || 0) }] : lines);
const sum = (list, f) => list.reduce((acc, x) => acc + (f(x) || 0), 0);

export function createBilling({ agenda, env = {}, clock = Date.now, logger = console, taxProvider }) {
  const provider = taxProvider || TAX_DOCUMENT_PROVIDERS.voucher;
  const emitter = () => emitterInfo(env, provider);
  const providerOf = (model) => TAX_DOCUMENT_PROVIDERS[model] || provider;

  /* ─── Filas de pago de una cita. `_doc`/`_refundAt`/`_fee` son internos (rendición). */
  function rowsOf(a, tz, role) {
    const p = a.payment || {};
    const iso = (d) => (d ? new Date(d).toISOString() : null);
    const local = (d) => (d ? wallClock(new Date(d).getTime(), tz).date : null);
    const base = {
      appointmentId: String(a._id),
      appointment: { startsAt: iso(a.startsAt), status: a.status },
      customer: role === 'admin' ? { name: a.customerSnapshot?.name || '', email: a.customerSnapshot?.email || null, phone: a.customerSnapshot?.phoneE164 || null } : { name: a.customerSnapshot?.name || '' },
      professional: { id: String(a.professionalId), name: a.professionalSnapshot?.displayName || '' },
      service: { name: a.serviceSnapshot?.name || '' },
    };
    const finish = (r, src, channel) => {
      const doc = src.taxDoc?.kind ? src.taxDoc : null;
      const counted = COUNTED.has(r.status);
      const model = src.taxModel || null;
      const backing = counted ? doc?.kind || 'sin_respaldo' : null;
      const accepts = providerOf(model).acceptsManual({ channel, amountCLP: r.amountCLP });
      const tb = taxBreakdown(r.amountCLP);
      return {
        ...base,
        ...r,
        localDate: local(r.date),
        methodLabel: METHOD_LABEL[r.method] || r.method,
        statusLabel: PAY_STATUS_LABEL[r.status] || r.status,
        tax: { netCLP: tb.netCLP, ivaCLP: tb.ivaCLP, estimated: !emitter().configured },
        backing,
        backingLabel: backing ? BACKING_LABEL[backing] : null,
        boletaNumber: doc?.kind === 'boleta_sii' ? doc.number : null,
        taxModel: model,
        canRegisterBoleta: r.status === 'aprobado' && !r.duplicate && doc?.kind !== 'voucher_mp' && accepts,
        _doc: doc,
        _channel: channel,
      };
    };
    const rows = [];
    const online = (src, duplicate) => {
      const status = duplicate
        ? src.status === 'reembolsado' ? 'reembolsado' : 'reembolso_pendiente'
        : p.method === 'online' ? ONLINE_STATUS[p.status] || 'pendiente' : 'rechazado';
      /* SPEC-60 regla 10: lo cubierto por gift card no es una venta nueva (ya se contó al vender la tarjeta). */
      const amount = duplicate ? Number(src.amountCLP) || 0 : payableCLP(a);
      const paidAt = src.paidAt || (COUNTED.has(status) ? a.updatedAt : null);
      const refundAt = status === 'reembolsado' ? src.refundedAt || a.updatedAt : status === 'contracargo' ? src.chargebackAt || a.updatedAt : null;
      const fee = COUNTED.has(status) ? Number(src.mpFeeCLP) || 0 : 0;
      const mp = { paymentId: String(src.mpPaymentId), status: duplicate ? 'approved' : p.mpStatus || null, paymentType: src.mpPaymentType || p.mpPaymentType || null };
      if (role === 'admin') Object.assign(mp, { feeCLP: fee, netReceivedCLP: COUNTED.has(status) ? Number(src.mpNetCLP ?? amount - fee) : 0 });
      rows.push(finish({
        id: `${a._id}:mp:${src.mpPaymentId}`,
        kind: 'online',
        duplicate,
        /* Un intento sin aprobar se fecha cuando empezó a pagar (retención de SPEC-35). */
        date: iso(COUNTED.has(status) ? paidAt : p.holdStartedAt || a.createdAt),
        method: 'mercadopago',
        amountCLP: amount,
        lines: duplicate ? [{ kind: 'service', label: `${a.serviceSnapshot?.name || 'Servicio'} (pago duplicado)`, amountCLP: amount }] : withGiftLine(saleLines(a.pricing, a.serviceSnapshot?.name), a),
        status,
        refundedAt: iso(refundAt),
        mp,
        _fee: fee,
        _net: COUNTED.has(status) ? Number(src.mpNetCLP ?? amount - fee) : 0,
      }, src, 'online'));
    };
    /* SPEC-56 §8: la seña confirmada es un movimiento propio ("Seña · transferencia"); se devuelve
       a mano si la cita se cae por el local (por_devolver → devuelta). Vencida, rechazada o sin
       confirmar no suma nada. El respaldo tributario va por la venta completa (asunción 7). */
    const d = a.deposit;
    const depStatus = { confirmada: 'aprobado', por_devolver: 'reembolso_pendiente', devuelta: 'reembolsado' }[d?.status];
    const depositPaid = depStatus ? Number(d.amountCLP) || 0 : 0;
    if (depStatus) {
      const r = finish({
        id: `${a._id}:sena`,
        kind: 'deposit',
        duplicate: false,
        date: iso(d.confirmedAt || d.reviewedAt || a.updatedAt),
        method: 'transferencia',
        amountCLP: depositPaid,
        lines: [{ kind: 'deposit', label: `Seña · ${a.serviceSnapshot?.name || 'Servicio'}`, amountCLP: depositPaid }],
        status: depStatus,
        refundedAt: depStatus === 'reembolsado' ? iso(d.refundedAt || a.updatedAt) : null,
        mp: null,
        reference: d.reference || null,
        _fee: 0,
        _net: 0,
        /* Asunción 7: la boleta va por la venta completa; cuando se registra, también respalda la seña. */
      }, p.taxDoc?.kind ? p : {}, 'local');
      rows.push({ ...r, methodLabel: 'Seña · transferencia', canRegisterBoleta: false, depositBacking: true });
    }
    if (p.mpPaymentId) online(p, false);
    for (const d of p.duplicates || []) if (d?.mpPaymentId) online(d, true);
    if ((p.method || 'local') === 'local') {
      const status = p.status === 'cobrado' ? 'aprobado' : ['pendiente', 'pago_pendiente'].includes(p.status || 'pendiente') && a.status === 'terminada' ? 'por_cobrar' : null;
      /* SPEC-60: cubierta entera por gift card → no hay cobro propio en la cita. */
      if (status && payableCLP(a) > 0) {
        /* SPEC-56: con seña confirmada, en el local se cobra solo el resto. */
        const localAmount = Number.isFinite(p.collectedCLP) && status === 'aprobado' ? p.collectedCLP : Math.max(0, payableCLP(a) - depositPaid);
        const localLines = withGiftLine(saleLines(a.pricing, a.serviceSnapshot?.name), a);
        const credited = payableCLP(a) - localAmount;
        if (credited > 0) localLines.push({ kind: 'deposit', label: 'Seña ya pagada por transferencia', amountCLP: -credited });
        rows.push(finish({
          id: `${a._id}:local`,
          kind: 'local',
          duplicate: false,
          date: iso(status === 'aprobado' ? p.collectedAt || a.updatedAt : a.startsAt),
          method: p.localMethod || 'local',
          amountCLP: localAmount,
          lines: localLines,
          status,
          refundedAt: null,
          mp: null,
          _fee: 0,
          _net: 0,
        }, p, 'local'));
      }
    }
    return rows.map((r) => ({ ...r, _refundAt: r.refundedAt ? local(r.refundedAt) : null }));
  }

  /* SPEC-60 regla 10: la venta de una gift card es el ingreso (en línea: valor + tarifa; en el local: lo cobrado). */
  function giftRowsOf(g, tz) {
    const p = g.payment || {};
    const iso = (d) => (d ? new Date(d).toISOString() : null);
    const local = (d) => (d ? wallClock(new Date(d).getTime(), tz).date : null);
    const online = g.origin === 'online';
    if (online ? !p.paidAt : !p.collectedAt) return [];
    const status = online ? (p.chargebackAt ? 'contracargo' : p.refundedAt ? 'reembolsado' : 'aprobado') : 'aprobado';
    const amount = online ? Number(p.amountCLP) || g.pricing?.totalCLP || 0 : Number(p.amountCLP) || g.amountCLP || 0;
    const date = online ? p.paidAt : p.collectedAt;
    const refundAt = p.chargebackAt || p.refundedAt || null;
    const doc = p.taxDoc?.kind ? p.taxDoc : null;
    const backing = doc?.kind || 'sin_respaldo';
    const tb = taxBreakdown(amount);
    const fee = online && COUNTED.has(status) ? Number(p.mpFeeCLP) || 0 : 0;
    const label = g.kind === 'servicio' ? `Gift card ${g.service?.name || 'servicio'} (${g.code})` : `Gift card ${g.code}`;
    const lines = online && g.pricing?.serviceFeeCLP ? [{ kind: 'service', label, amountCLP: g.pricing.priceCLP }, { kind: 'service_fee', label: 'Tarifa de servicio', amountCLP: g.pricing.serviceFeeCLP }] : [{ kind: 'service', label, amountCLP: amount }];
    return [{
      id: `gc:${g._id}`,
      appointmentId: null,
      giftCardId: String(g._id),
      appointment: null,
      customer: { name: g.from || '', email: g.buyerEmail || null, phone: null },
      professional: { id: null, name: '' },
      service: { name: label },
      kind: online ? 'online' : 'local',
      giftCard: true,
      duplicate: false,
      date: iso(date),
      method: online ? 'mercadopago' : p.localMethod || 'local',
      methodLabel: METHOD_LABEL[online ? 'mercadopago' : p.localMethod || 'local'] || p.localMethod,
      amountCLP: amount,
      lines,
      status,
      statusLabel: PAY_STATUS_LABEL[status] || status,
      refundedAt: iso(refundAt),
      mp: online ? { paymentId: String(p.mpPaymentId || ''), status: p.mpStatus || null, paymentType: null, feeCLP: fee, netReceivedCLP: COUNTED.has(status) ? Number(p.mpNetCLP ?? amount - fee) : 0 } : null,
      localDate: local(date),
      tax: { netCLP: tb.netCLP, ivaCLP: tb.ivaCLP, estimated: !emitter().configured },
      backing,
      backingLabel: BACKING_LABEL[backing],
      boletaNumber: doc?.kind === 'boleta_sii' ? doc.number : null,
      taxModel: p.taxModel || null,
      canRegisterBoleta: false,
      _doc: doc,
      _channel: online ? 'online' : 'local',
      _fee: fee,
      _net: online && COUNTED.has(status) ? Number(p.mpNetCLP ?? amount - fee) : 0,
      _refundAt: refundAt ? local(refundAt) : null,
    }];
  }

  async function loadGifts(b, { from, to }) {
    const tz = b.timezone;
    const range = { $gte: new Date(zonedToUtc(from, '00:00', tz)), $lt: new Date(zonedToUtc(addDays(to, 1), '00:00', tz)) };
    return GiftCard.find({ businessId: b._id, $or: [{ 'payment.paidAt': range }, { 'payment.collectedAt': range }, { 'payment.refundedAt': range }, { 'payment.chargebackAt': range }] }).limit(5000).lean();
  }

  const strip = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')));

  async function load(b, { from, to, professionalId = null, withRefunds = false }) {
    const tz = b.timezone;
    const range = { $gte: new Date(zonedToUtc(from, '00:00', tz)), $lt: new Date(zonedToUtc(addDays(to, 1), '00:00', tz)) };
    const when = ['payment.paidAt', 'payment.collectedAt', 'payment.duplicates.paidAt', 'payment.holdStartedAt', 'createdAt', 'startsAt', 'deposit.confirmedAt'];
    if (withRefunds) when.push('payment.refundedAt', 'payment.chargebackAt', 'payment.duplicates.refundedAt', 'deposit.refundedAt');
    const q = {
      businessId: b._id,
      $and: [
        { $or: when.map((k) => ({ [k]: range })) },
        { $or: [{ 'payment.mpPaymentId': { $type: 'string' } }, { 'payment.status': { $in: ['cobrado', 'pendiente', 'pago_pendiente'] }, 'payment.method': { $ne: 'online' } }, { 'deposit.status': { $in: ['confirmada', 'por_devolver', 'devuelta'] } }] },
      ],
    };
    if (professionalId) q.professionalId = professionalId;
    return Appointment.find(q).sort({ startsAt: 1 }).limit(5000).lean();
  }

  function parseDates(q, now, tz) {
    const def = monthRange(now, tz);
    const from = q.from ? String(q.from) : def.from;
    const to = q.to ? String(q.to) : q.from ? from : def.to;
    if (!isDate(from) || !isDate(to) || to < from || addDays(from, 366) < to) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
    return { from, to };
  }

  /* ─── Lista (admin: con totales; barbero: solo sus citas, sin totales ni comisiones). */
  async function list(b, q = {}, { role = 'admin', professionalId = null } = {}) {
    const { from, to } = parseDates(q, clock(), b.timezone);
    let pid = professionalId;
    if (role === 'admin' && q.professional) {
      pid = oid(q.professional);
      if (!pid) throw new HttpError(400, 'invalid_professional', 'Barbero inválido');
    }
    const appts = await load(b, { from, to, professionalId: pid });
    let rows = appts.flatMap((a) => rowsOf(a, b.timezone, role));
    if (role === 'admin' && !pid) rows = rows.concat((await loadGifts(b, { from, to })).flatMap((g) => giftRowsOf(g, b.timezone)));
    rows = rows.filter((r) => r.localDate >= from && r.localDate <= to);
    const method = String(q.method || '');
    if (method) rows = rows.filter((r) => (method === 'online' || method === 'mercadopago' ? r.kind === 'online' : method === 'local' ? r.kind === 'local' : method === 'sena' ? r.kind === 'deposit' : r.method === method));
    if (q.status) {
      const st = new Set(String(q.status).split(',').filter(Boolean));
      rows = rows.filter((r) => st.has(r.status));
    }
    if (q.backing) rows = rows.filter((r) => r.backing === String(q.backing));
    rows.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const out = { from, to, timezone: b.timezone, items: rows.map(strip), warning: TAX_WARNING, emitter: emitter() };
    if (role !== 'admin') return out;
    const sales = rows.filter((r) => COUNTED.has(r.status));
    const refunded = rows.filter((r) => REFUNDED.has(r.status));
    const live = sales.filter((r) => !REFUNDED.has(r.status));
    const unbacked = live.filter((r) => r.backing === 'sin_respaldo');
    const porCobrar = rows.filter((r) => r.status === 'por_cobrar');
    out.totals = {
      count: rows.length,
      approvedCount: sales.length,
      approvedCLP: sum(sales, (r) => r.amountCLP),
      refundsCLP: sum(refunded, (r) => r.amountCLP),
      netSalesCLP: sum(live, (r) => r.amountCLP),
      mpFeesCLP: sum(sales, (r) => r._fee),
      mpNetReceivedCLP: sum(sales, (r) => r._net),
      byBacking: Object.fromEntries(['voucher_mp', 'boleta_sii', 'sin_respaldo'].map((k) => [k, sum(live.filter((r) => r.backing === k), (r) => r.amountCLP)])),
      unbacked: { count: unbacked.length, totalCLP: sum(unbacked, (r) => r.amountCLP) },
      porCobrar: { count: porCobrar.length, totalCLP: sum(porCobrar, (r) => r.amountCLP) },
    };
    return out;
  }

  /* ─── Rendición mensual */
  function parseMonth(raw, now, tz) {
    const m = String(raw || '') || wallClock(now, tz).date.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new HttpError(400, 'invalid_month', 'Mes inválido (AAAA-MM)');
    const [y, mo] = m.split('-').map(Number);
    return { month: m, from: `${m}-01`, to: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) };
  }

  async function rendicion(b, q = {}) {
    const { month, from, to } = parseMonth(q.month, clock(), b.timezone);
    const appts = await load(b, { from, to, withRefunds: true });
    const rows = appts.flatMap((a) => rowsOf(a, b.timezone, 'admin')).concat((await loadGifts(b, { from, to })).flatMap((g) => giftRowsOf(g, b.timezone)));
    const inMonth = (d) => Boolean(d) && d >= from && d <= to;
    const sales = rows.filter((r) => COUNTED.has(r.status) && inMonth(r.localDate));
    const refunds = rows.filter((r) => REFUNDED.has(r.status) && inMonth(r._refundAt));
    /* Bolsas por respaldo desde el documento guardado (no desde el estado del pago). */
    const docRows = rows.filter((r) => r._doc && inMonth(r.localDate));
    const bucketOf = (r) => r._doc?.kind || 'sin_respaldo';
    const byBacking = {};
    for (const k of ['voucher_mp', 'boleta_sii', 'sin_respaldo']) {
      const issued = k === 'sin_respaldo' ? sales.filter((r) => !r._doc) : docRows.filter((r) => r._doc.kind === k);
      const ref = refunds.filter((r) => bucketOf(r) === k);
      const issuedCLP = sum(issued, (r) => r.amountCLP);
      const refundedCLP = sum(ref, (r) => r.amountCLP);
      byBacking[k] = { count: issued.length, issuedCLP, refundedCLP, netCLP: issuedCLP - refundedCLP };
    }
    const approvedCLP = sum(sales, (r) => r.amountCLP);
    const refundsCLP = sum(refunds, (r) => r.amountCLP);
    const tb = (list) => list.reduce((acc, r) => { const t = taxBreakdown(r.amountCLP); return { net: acc.net + t.netCLP, iva: acc.iva + t.ivaCLP }; }, { net: 0, iva: 0 });
    const ts = tb(sales);
    const tr = tb(refunds);
    const differences = [];
    const diff = (r, reason) => differences.push({ paymentId: r.id, appointmentId: r.appointmentId, date: r.localDate, amountCLP: r.amountCLP, reason, message: DIFF_MESSAGE[reason] });
    for (const r of docRows) if (!COUNTED.has(r.status)) diff(r, 'respaldo_sin_pago_aprobado');
    for (const r of sales) {
      if (r._channel === 'local' && r._doc?.kind === 'voucher_mp') diff(r, 'voucher_en_pago_local');
      if (r._channel === 'online' && r._doc?.kind === 'boleta_sii' && (r.taxModel || 'voucher') === 'voucher') diff(r, 'boleta_sobre_voucher');
    }
    for (const r of refunds) if (r._doc?.kind === 'boleta_sii') diff(r, 'reembolso_con_boleta');
    const backedCLP = byBacking.voucher_mp.netCLP + byBacking.boleta_sii.netCLP + byBacking.sin_respaldo.netCLP;
    /* Tramos: si el modelo de emisión cambió a mitad de mes, cada uno rige desde su primera venta. */
    const tramos = [];
    for (const r of [...sales].sort((x, y) => String(x.date).localeCompare(String(y.date)))) {
      const model = r.taxModel || 'sin_dato';
      let t = tramos.find((x) => x.model === model);
      if (!t) tramos.push((t = { model, label: MODEL_LABEL[model] || model, from: r.localDate, to: r.localDate, count: 0, totalCLP: 0 }));
      t.to = r.localDate > t.to ? r.localDate : t.to;
      t.count += 1;
      t.totalCLP += r.amountCLP;
    }
    const em = emitter();
    const unbacked = sales.filter((r) => !r._doc && !REFUNDED.has(r.status));
    const porCobrar = rows.filter((r) => r.status === 'por_cobrar' && inMonth(r.localDate));
    return {
      month,
      from,
      to,
      timezone: b.timezone,
      emitter: em,
      estimated: !em.configured,
      warning: TAX_WARNING,
      totals: {
        approvedCount: sales.length,
        approvedCLP,
        refundsCount: refunds.length,
        refundsCLP,
        netSalesCLP: approvedCLP - refundsCLP,
        netCLP: ts.net - tr.net,
        ivaCLP: ts.iva - tr.iva,
        mpFeesCLP: sum(sales, (r) => r._fee),
        mpNetReceivedCLP: sum(sales, (r) => r._net),
      },
      byBacking,
      cuadre: { approvedMinusRefundsCLP: approvedCLP - refundsCLP, backedCLP, ok: backedCLP === approvedCLP - refundsCLP && differences.length === 0, differences },
      unbacked: unbacked.map(strip),
      porCobrar: { count: porCobrar.length, totalCLP: sum(porCobrar, (r) => r.amountCLP) },
      tramos,
      sales: sales.map(strip),
      refunds: refunds.map(strip),
    };
  }

  const CSV_HEADER = ['Fecha', 'Tipo', 'ID pago MP', 'Cita', 'Cliente', 'Barbero', 'Servicio', 'Método', 'Respaldo', 'N° documento', 'Monto', 'Neto (est.)', 'IVA (est.)', 'Comisión MP', 'Neto recibido', 'Modelo'];

  async function rendicionCsv(b, q = {}) {
    const s = await rendicion(b, q);
    const line = (r, refund) => {
      const sign = refund ? -1 : 1;
      const t = taxBreakdown(r.amountCLP);
      return [
        refund ? r.refundedAt && wallClock(Date.parse(r.refundedAt), b.timezone).date : r.localDate,
        refund ? 'Reembolso' : 'Venta',
        r.mp?.paymentId || '',
        r.appointmentId || (r.giftCardId ? `gift card ${r.giftCardId}` : ""),
        r.customer?.name || '',
        r.professional?.name || '',
        r.service?.name || '',
        r.methodLabel,
        BACKING_LABEL[r.backing] || '',
        r.boletaNumber || (r.backing === 'voucher_mp' ? r.mp?.paymentId : '') || '',
        sign * r.amountCLP,
        sign * t.netCLP,
        sign * t.ivaCLP,
        refund ? '' : r.mp?.feeCLP ?? '',
        refund ? '' : r.mp?.netReceivedCLP ?? '',
        MODEL_LABEL[r.taxModel || 'sin_dato'] || r.taxModel,
      ];
    };
    const rows = [CSV_HEADER, ...s.sales.map((r) => line(r, false)), ...s.refunds.map((r) => line(r, true))];
    const est = s.estimated ? ' (estimado)' : '';
    rows.push(
      [],
      ['Resumen', s.month],
      ['Emisor', s.emitter.label],
      ['Ventas aprobadas', s.totals.approvedCLP],
      ['Reembolsos y contracargos', -s.totals.refundsCLP],
      ['Ventas netas', s.totals.netSalesCLP],
      [`Neto${est}`, s.totals.netCLP],
      [`IVA${est}`, s.totals.ivaCLP],
      ['Comisiones MP', s.totals.mpFeesCLP],
      ['Neto recibido MP', s.totals.mpNetReceivedCLP],
      ['Voucher MP', s.byBacking.voucher_mp.netCLP],
      ['Boleta SII', s.byBacking.boleta_sii.netCLP],
      ['Sin respaldo', s.byBacking.sin_respaldo.netCLP],
      ['Cuadre', s.cuadre.ok ? 'OK' : 'Con diferencias', s.cuadre.approvedMinusRefundsCLP, s.cuadre.backedCLP],
      ...s.cuadre.differences.map((d) => ['Diferencia', d.date, d.appointmentId, d.amountCLP, d.message]),
      ['Advertencia', s.warning],
    );
    return { month: s.month, csv: csvDocument(rows) };
  }

  /* ─── Registrar (o corregir) el N° de la boleta emitida en el SII. */
  async function registerBoleta(b, id, raw, { professionalId = null, by = 'admin', user = null } = {}) {
    const number = parseBoletaNumber(raw);
    if (!number) throw new HttpError(400, 'invalid_boleta', 'El N° de boleta tiene que ser un número (el folio que te dio el SII).', { fields: { number: 'invalid_boleta' } });
    const _id = oid(id);
    const current = _id ? await Appointment.findOne({ _id, businessId: b._id, ...(professionalId ? { professionalId } : {}) }).lean() : null;
    if (!current) throw new HttpError(404, 'not_found', 'No encontramos este pago');
    const check = (a) => {
      const p = a.payment || {};
      const channel = p.method === 'online' ? 'online' : 'local';
      const approved = channel === 'online' ? p.status === 'pagado' : p.status === 'cobrado';
      if (!approved) throw new HttpError(409, 'not_approved', channel === 'online' ? 'Este pago en línea no está aprobado (o ya se reembolsó): no lleva boleta.' : 'Marca la cita como cobrada antes de registrar su boleta.');
      /* Regla 3 (AC-04): una venta, un respaldo. */
      if (p.taxDoc?.kind === 'voucher_mp' || !providerOf(p.taxModel).acceptsManual({ channel, amountCLP: a.pricing?.totalCLP })) {
        throw new HttpError(409, 'already_backed', 'Este pago ya está respaldado por el voucher de Mercado Pago. Emitir además una boleta sería doble emisión.');
      }
      return p;
    };
    const before = check(current).taxDoc?.number || null;
    if (await Appointment.exists({ _id: { $ne: current._id }, businessId: b._id, 'payment.taxDoc.kind': 'boleta_sii', 'payment.taxDoc.number': number })) throw boletaClash();
    let appt;
    try {
      appt = await agenda.mutate(b, current._id, (a) => {
        check(a);
        a.payment.taxDoc = { kind: 'boleta_sii', number, provider: a.payment.taxModel || provider.id, at: new Date(clock()), byUserId: user?._id };
        if (!a.payment.taxModel) a.payment.taxModel = provider.id;
        return { by, byUserId: user?._id, reason: before ? `Boleta SII corregida: N° ${before} → ${number}` : `Boleta SII N° ${number} registrada` };
      });
    } catch (err) {
      if (isBoletaClash(err)) throw boletaClash();
      throw err;
    }
    const row = rowsOf(appt.toObject(), b.timezone, by === 'admin' ? 'admin' : 'barber').find((r) => r.status === 'aprobado' && !r.duplicate);
    return { appt, before, payment: row ? strip(row) : null };
  }

  return { emitter, list, rendicion, rendicionCsv, registerBoleta, provider };
}
