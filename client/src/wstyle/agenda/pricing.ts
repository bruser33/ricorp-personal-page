// Desglose de cobros (SPEC-38, "como Uber"): copia exacta de server/src/domain/pricing.js (el server recalcula y
// manda; esto es para mostrar el resumen mientras se reserva). Mismos vectores en pricing.test.ts y en
// server/test/pricing.test.js.
//   Servicio + Domicilio + Tarifa de servicio (administración X % + costo de pagos) = Total
// La tarifa es la MISMA pagando en el local o en línea: el total no cambia al cambiar la forma de pago.

export interface Rates { platformFeePercent: number; paymentFeePercent: number; paymentFeeVat: boolean }

// Lo que el server manda de una cita (pricingView). Citas antiguas: feesIncluded false, sin tarifa.
export interface PricingView {
  priceCLP: number; surchargeCLP: number; totalCLP: number;
  barberCLP?: number; serviceFeeCLP?: number; platformFeeCLP?: number; platformFeePercent?: number;
  paymentFeeCLP?: number; paymentFeePercent?: number; paymentFeeVat?: boolean; feesIncluded?: boolean;
  // SPEC-60: parte cubierta por gift card y lo que queda por pagar (total − gift card).
  giftCardCLP?: number; dueCLP?: number;
}

export const NO_FEES: Rates = { platformFeePercent: 0, paymentFeePercent: 0, paymentFeeVat: true };

export function grossUpFee(base: number, ppm: number): number {
  if (!(ppm > 0) || !(base > 0) || ppm >= 1_000_000) return 0;
  const den = 1_000_000 - ppm;
  return Math.floor((base * 1_000_000 + den - 1) / den) - base;
}

export const effectivePaymentPpm = (percent: number, vat: boolean) => {
  const ppm = Math.max(0, Math.round((Number(percent) || 0) * 10_000));
  return vat ? Math.round((ppm * 119) / 100) : ppm;
};

export type FullPricing = Required<Omit<PricingView, 'giftCardCLP' | 'dueCLP'>>;
export function quote(priceCLP: number, surchargeCLP: number, rates: Rates): FullPricing {
  const price = Math.round(priceCLP || 0);
  const surcharge = Math.round(surchargeCLP || 0);
  const subtotal = price + surcharge;
  const bp = Math.max(0, Math.round((Number(rates.platformFeePercent) || 0) * 100));
  const platformFee = Math.round((subtotal * bp) / 10_000);
  const base = subtotal + platformFee;
  const paymentFee = grossUpFee(base, effectivePaymentPpm(rates.paymentFeePercent, rates.paymentFeeVat));
  return {
    priceCLP: price, surchargeCLP: surcharge, barberCLP: subtotal, platformFeeCLP: platformFee, platformFeePercent: bp / 100,
    paymentFeeCLP: paymentFee, paymentFeePercent: rates.paymentFeePercent, paymentFeeVat: rates.paymentFeeVat,
    serviceFeeCLP: platformFee + paymentFee, totalCLP: base + paymentFee, feesIncluded: true,
  };
}

export const pct = (n: number) => String(n).replace('.', ',');
export const SERVICE_FEE_LABEL = 'Tarifa de servicio';
export const serviceFeeHint = (platformFeePercent: number) => `administración ${pct(platformFeePercent)} % + costo de pagos`;

// SPEC-60 RN-04: cuánto cubre una gift card en la reserva (copia de `coverage` en server/src/domain/giftcards.js).
//   Monto → descuenta del total (servicio + domicilio + tarifa), hasta el saldo.
//   Servicio intacta usada en ESE servicio → cubre servicio + su tarifa (sin domicilio).
//   Servicio en otro servicio (o ya usada en parte) → actúa como monto por su saldo.
export interface GiftCardInfo {
  code: string; kind: 'monto' | 'servicio'; from: string; amountCLP: number; balanceCLP: number;
  service: { id: string; name: string } | null; expiresAt: string;
}
export function giftCoverage(card: Pick<GiftCardInfo, 'kind' | 'amountCLP' | 'balanceCLP' | 'service'>, pricing: PricingView, serviceId: string | undefined, rates: Rates): number {
  const total = Math.max(0, Math.round(pricing.totalCLP || 0));
  const balance = Math.max(0, Math.round(card.balanceCLP || 0));
  if (card.kind === 'servicio' && card.service && card.service.id === serviceId && balance === card.amountCLP) {
    return Math.min(total, quote(pricing.priceCLP, 0, rates).totalCLP);
  }
  return Math.min(balance, total);
}

// Desglose con la gift card aplicada: agrega la línea "Gift card −$X" y "Total a pagar".
export function withGiftCard<T extends PricingView>(pricing: T, giftCLP: number): T & { giftCardCLP?: number; dueCLP?: number } {
  if (!(giftCLP > 0)) return pricing;
  return { ...pricing, giftCardCLP: giftCLP, dueCLP: Math.max(0, pricing.totalCLP - giftCLP) };
}
