/* Desglose de cobros de una cita (SPEC-38, "como Uber"). Una sola fórmula para el server y el client
   (client/src/wstyle/agenda/pricing.ts es la copia exacta; los tests de ambos usan los mismos vectores):

     Servicio                                   priceCLP
     Domicilio                                  surchargeCLP              (si aplica)
     Tarifa de servicio                         platformFeeCLP + paymentFeeCLP   (una sola línea para el cliente)
       · administración de la plataforma        round(subtotal × X %)     subtotal = servicio + domicilio
       · costo de pagos                         ceil(base / (1 − t)) − base   base = subtotal + administración
                                                t = tasa MP × 1,19 si se cobra el IVA de la comisión
     Total                                      suma de las líneas

   La tarifa es la MISMA pague en el local o en línea (decisión del usuario): el total no cambia al
   cambiar la forma de pago. Las dos partes se guardan por separado para el admin y la rendición.

   - Cada línea se redondea UNA vez y el total es la suma (RN-07).
   - Los % se pasan a enteros antes de operar (administración en centésimas de punto, procesamiento en
     millonésimas) para que server y client den exactamente el mismo número.
   - El costo de pagos redondea hacia arriba: al negocio le queda al menos `base` después de la comisión.
   - La ganancia del barbero es servicio + domicilio (`barberCLP`): las comisiones las paga el cliente. */
import { PlatformSettings } from '../models/index.js';

export const VAT_RATE = 0.19;
/* Defaults de SPEC-38 (el admin los cambia en Configuración). */
export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
/* Mercado Pago Checkout Chile, dinero disponible al instante: 3,19 % + IVA. */
export const DEFAULT_PAYMENT_FEE_RATE = 0.0319;
export const DEFAULT_PAYMENT_FEE_VAT = true;
export const MAX_PAYMENT_FEE_PERCENT = 10;
/* Marca de la migración de defaults (RN-09). */
export const DEFAULTS_MIGRATION = 'spec38';

const int = (n) => Math.round(Number(n) || 0);
/* 10 % → 1000 (centésimas de punto); 3,19 % → 31900 (millonésimas). */
const toBp = (rate) => Math.max(0, Math.round((Number(rate) || 0) * 10_000));
const toPpm = (rate) => Math.max(0, Math.round((Number(rate) || 0) * 1_000_000));

/* Tasa efectiva del procesamiento en millonésimas (con IVA sobre la comisión si corresponde). */
export function effectivePaymentPpm(rate, vat) {
  const ppm = toPpm(rate);
  return vat ? Math.round((ppm * 119) / 100) : ppm; // × (1 + IVA 19 %)
}

/* Lo que hay que sumar a `base` para que, después de la comisión, quede `base`. */
export function grossUpFee(base, ppm) {
  if (!(ppm > 0) || !(base > 0)) return 0;
  if (ppm >= 1_000_000) throw new RangeError('tasa de procesamiento inválida');
  const den = 1_000_000 - ppm;
  /* ceil(base / (1 − t)) en enteros: (base·10⁶ + den − 1) div den. */
  const gross = Math.floor((base * 1_000_000 + den - 1) / den);
  return gross - base;
}

/**
 * Desglose completo. Tasas como fracción (0.1 = 10 %). `method` ('local' | 'online') solo se registra:
 * no cambia ningún monto. Devuelve el objeto que se congela en `Appointment.pricing`.
 */
export function quote({ priceCLP, surchargeCLP = 0, platformFeeRate = 0, method = 'local', paymentFeeRate = 0, paymentFeeVat = true }) {
  const price = int(priceCLP);
  const surcharge = int(surchargeCLP);
  const subtotal = price + surcharge;
  const platformBp = toBp(platformFeeRate);
  const platformFee = Math.round((subtotal * platformBp) / 10_000);
  const base = subtotal + platformFee;
  const paymentFee = grossUpFee(base, effectivePaymentPpm(paymentFeeRate, paymentFeeVat));
  return {
    priceCLP: price,
    surchargeCLP: surcharge,
    barberCLP: subtotal,
    platformFeeRate: platformBp / 10_000,
    platformFeeCLP: platformFee,
    paymentMethod: method === 'online' ? 'online' : 'local',
    paymentFeeRate: toPpm(paymentFeeRate) / 1_000_000,
    paymentFeeVat: Boolean(paymentFeeVat),
    paymentFeeCLP: paymentFee,
    serviceFeeCLP: platformFee + paymentFee,
    totalCLP: base + paymentFee,
    feesIncluded: true,
  };
}

/* Tasas vigentes (PlatformSettings). Sin documento → defaults de SPEC-38. */
export async function currentRates() {
  const s = await PlatformSettings.findOne({ key: 'default' }).lean();
  return ratesFrom(s);
}

export function ratesFrom(s) {
  return {
    platformFeeRate: s?.defaultPlatformFeeRate ?? DEFAULT_PLATFORM_FEE_RATE,
    paymentFeeRate: s?.paymentFeeRate ?? DEFAULT_PAYMENT_FEE_RATE,
    paymentFeeVat: s?.paymentFeeVat ?? DEFAULT_PAYMENT_FEE_VAT,
  };
}

/* Para el catálogo (el client calcula el resumen con la misma fórmula). */
export const ratesView = (r) => ({
  platformFeePercent: Math.round(r.platformFeeRate * 10_000) / 100,
  paymentFeePercent: Math.round(r.paymentFeeRate * 1_000_000) / 10_000,
  paymentFeeVat: Boolean(r.paymentFeeVat),
});

/* Cita creada antes de SPEC-38: total = servicio + domicilio y la comisión era interna. */
export const feesIncluded = (pricing) => Boolean(pricing?.feesIncluded);

/* Lo que se muestra de una cita (cliente, barbero, admin, correos). */
export function pricingView(p = {}) {
  const price = int(p.priceCLP);
  const surcharge = int(p.surchargeCLP);
  if (!feesIncluded(p)) {
    return { priceCLP: price, surchargeCLP: surcharge, barberCLP: price + surcharge, serviceFeeCLP: 0, platformFeeCLP: 0, platformFeePercent: 0, paymentFeeCLP: 0, paymentFeePercent: 0, paymentFeeVat: false, totalCLP: int(p.totalCLP ?? price + surcharge), feesIncluded: false };
  }
  return {
    priceCLP: price,
    surchargeCLP: surcharge,
    barberCLP: int(p.barberCLP ?? price + surcharge),
    platformFeeCLP: int(p.platformFeeCLP),
    platformFeePercent: Math.round((Number(p.platformFeeRate) || 0) * 10_000) / 100,
    paymentFeeCLP: int(p.paymentFeeCLP),
    paymentFeePercent: Math.round((Number(p.paymentFeeRate) || 0) * 1_000_000) / 10_000,
    paymentFeeVat: Boolean(p.paymentFeeVat),
    serviceFeeCLP: int(p.platformFeeCLP) + int(p.paymentFeeCLP),
    totalCLP: int(p.totalCLP),
    feesIncluded: true,
  };
}

/* Líneas del desglose. `split: false` (cliente, correos al cliente): una sola "Tarifa de servicio".
   `split: true` (admin, rendición, detalle de la venta): administración y costo de pagos por separado. */
export const SERVICE_FEE_LABEL = 'Tarifa de servicio';
export const SERVICE_FEE_HINT = (pct) => `administración ${fmtPct(pct)} % + costo de pagos`;
export function breakdownLines(p = {}, serviceName = 'Servicio', { split = false } = {}) {
  const v = pricingView(p);
  const lines = [{ kind: 'service', label: serviceName || 'Servicio', amountCLP: v.priceCLP }];
  if (v.surchargeCLP) lines.push({ kind: 'home_surcharge', label: 'Domicilio', amountCLP: v.surchargeCLP });
  if (split) {
    if (v.platformFeeCLP) lines.push({ kind: 'platform_fee', label: `Administración de la plataforma (${fmtPct(v.platformFeePercent)} %)`, amountCLP: v.platformFeeCLP });
    if (v.paymentFeeCLP) lines.push({ kind: 'payment_fee', label: 'Costo de pagos (Mercado Pago)', amountCLP: v.paymentFeeCLP });
  } else if (v.serviceFeeCLP) {
    lines.push({ kind: 'service_fee', label: SERVICE_FEE_LABEL, hint: SERVICE_FEE_HINT(v.platformFeePercent), amountCLP: v.serviceFeeCLP });
  }
  return { lines, totalCLP: v.totalCLP };
}

export const fmtPct = (n) => String(n).replace('.', ',');

/* RN-09: defaults de SPEC-38, idempotente. Crea el documento si falta; si existe y nunca pasó por
   esta migración, sube la administración 0 → 10 % (solo si sigue en 0) y completa los campos
   nuevos. Ya marcado no toca nada: un 0 % puesto después por el admin se respeta. */
export async function ensurePlatformDefaults({ now = Date.now() } = {}) {
  const at = new Date(now);
  const created = await PlatformSettings.updateOne(
    { key: 'default' },
    {
      $setOnInsert: {
        defaultPlatformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
        paymentFeeRate: DEFAULT_PAYMENT_FEE_RATE,
        paymentFeeVat: DEFAULT_PAYMENT_FEE_VAT,
        appliedDefaults: [DEFAULTS_MIGRATION],
        defaultsAppliedAt: at,
      },
    },
    { upsert: true }
  ).catch((err) => {
    /* Dos instancias arrancando a la vez: la otra ya lo creó. */
    if (err?.code === 11000) return { upsertedCount: 0 };
    throw err;
  });
  if (created.upsertedCount) return { created: true, migrated: false };
  const pending = { key: 'default', appliedDefaults: { $ne: DEFAULTS_MIGRATION } };
  await PlatformSettings.updateOne({ ...pending, defaultPlatformFeeRate: { $in: [0, null] } }, { $set: { defaultPlatformFeeRate: DEFAULT_PLATFORM_FEE_RATE } });
  await PlatformSettings.updateOne({ ...pending, paymentFeeRate: { $exists: false } }, { $set: { paymentFeeRate: DEFAULT_PAYMENT_FEE_RATE } });
  await PlatformSettings.updateOne({ ...pending, paymentFeeVat: { $exists: false } }, { $set: { paymentFeeVat: DEFAULT_PAYMENT_FEE_VAT } });
  const r = await PlatformSettings.updateOne(pending, { $addToSet: { appliedDefaults: DEFAULTS_MIGRATION }, $set: { defaultsAppliedAt: at } });
  return { created: false, migrated: r.modifiedCount > 0 };
}
