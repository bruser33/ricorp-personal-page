/* Reglas tributarias de la fase 1 (SPEC-37), sin BD: montos, IVA, respaldo de cada venta y
   validación del N° de boleta. La lista de pagos y la rendición viven en billing.js; qué
   respaldo emite cada modelo (voucher / manual) en lib/taxDocuments.js.

   Investigación y supuestos (validar con un contador antes de producción):
   - Los precios de la carta INCLUYEN IVA (19 %): neto = round(total / 1,19), IVA = total − neto.
   - El recargo por domicilio suma al monto afecto y va en una línea aparte del detalle.
   - Cada venta aprobada tiene UN solo respaldo: voucher de Mercado Pago (Res. SII 176/2020,
     modelo "No emito boleta cuando recibo un pago electrónico") o boleta SII emitida a mano. */
import { HttpError } from '../lib/errors.js';
import { breakdownLines, feesIncluded } from './pricing.js';

export const IVA_RATE = 0.19;

export const TAX_WARNING = "El modelo voucher solo es válido si en el SII declaraste 'No emito boleta cuando recibo un pago electrónico'. Validar con contador.";

export function taxBreakdown(totalCLP) {
  const total = Math.round(Number(totalCLP) || 0);
  const net = Math.round(total / (1 + IVA_RATE));
  return { totalCLP: total, netCLP: net, ivaCLP: total - net };
}

/* Detalle de la venta: el servicio y, si hay, el recargo por domicilio en su propia línea. */
export function saleLines(pricing = {}, serviceName = 'Servicio') {
  /* SPEC-38: con la tarifa de servicio incluida, la venta (por el total) se detalla en servicio, domicilio,
     administración de la plataforma y costo de pagos. Las cuatro suman el total. */
  if (feesIncluded(pricing)) {
    return breakdownLines(pricing, serviceName, { split: true }).lines.map((l) => (l.kind === 'home_surcharge' ? { ...l, label: 'Recargo por domicilio' } : l));
  }
  const surcharge = Math.round(Number(pricing.surchargeCLP) || 0);
  const total = Math.round(Number(pricing.totalCLP ?? (Number(pricing.priceCLP) || 0) + surcharge));
  const lines = [{ kind: 'service', label: serviceName || 'Servicio', amountCLP: total - surcharge }];
  if (surcharge) lines.push({ kind: 'home_surcharge', label: 'Recargo por domicilio', amountCLP: surcharge });
  return lines;
}

/* Formas de cobro en el local (flujo 2 de la spec). */
export const LOCAL_METHODS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta (POS del local)' };
export const METHOD_LABEL = { mercadopago: 'Mercado Pago', local: 'En el local', ...LOCAL_METHODS };

export const BACKING_LABEL = { voucher_mp: 'Voucher MP', boleta_sii: 'Boleta SII', sin_respaldo: 'Sin respaldo' };

/* Folio de la boleta: entero positivo (acepta "N° 1.234", "#42"). null = inválido. */
export function parseBoletaNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/^(n\s*[°º.o]?|#)\s*/i, '').replace(/[.\s]/g, '');
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = String(Number(s));
  return n === '0' ? null : n;
}

const fieldError = (fields, message) => new HttpError(400, Object.values(fields)[0], message, { fields });

/* Lo que llega al marcar "cobrada" una cita en el local: método (opcional por compatibilidad;
   la UI siempre lo manda) y N° de boleta (opcional mientras no haya RUT). */
export function parseCollectInput(body = {}, { methodKey = 'method' } = {}) {
  const fields = {};
  const rawMethod = body[methodKey];
  let method = null;
  if (rawMethod !== undefined && rawMethod !== null && rawMethod !== '') {
    if (!Object.hasOwn(LOCAL_METHODS, String(rawMethod))) fields[methodKey] = 'invalid_method';
    else method = String(rawMethod);
  }
  let number = null;
  const rawNumber = body.boletaNumber;
  if (rawNumber !== undefined && rawNumber !== null && String(rawNumber).trim() !== '') {
    number = parseBoletaNumber(rawNumber);
    if (!number) fields.boletaNumber = 'invalid_boleta';
  }
  if (Object.keys(fields).length) {
    throw fieldError(fields, fields.boletaNumber ? 'El N° de boleta tiene que ser un número (el folio que te dio el SII).' : 'Elige cómo se pagó: efectivo, transferencia o tarjeta.');
  }
  return { method, number };
}

/* Marca el pago en el local como cobrado (dentro de la mutación de la cita). */
export function applyLocalCollection(a, { method, number, provider, now }) {
  a.payment.status = 'cobrado';
  a.payment.collectedAt = new Date(now);
  if (method) a.payment.localMethod = method;
  a.payment.taxModel = provider.id;
  const auto = provider.automaticFor({ channel: 'local', amountCLP: a.pricing?.totalCLP ?? 0, at: new Date(now) });
  if (auto) a.payment.taxDoc = auto;
  else if (number) a.payment.taxDoc = { kind: 'boleta_sii', number, provider: provider.id, at: new Date(now) };
}

/* El índice único de boletas (models) choca → 409 con mensaje propio. */
export const isBoletaClash = (err) => (err?.code === 11000 || /E11000/.test(String(err?.message || ''))) && /boleta_unica|taxDoc\.number/.test(String(err?.message || '') + JSON.stringify(err?.keyPattern || {}));
export const boletaClash = () => new HttpError(409, 'boleta_duplicada', 'Ese N° de boleta ya está registrado en otro pago. Revisa el folio.');
