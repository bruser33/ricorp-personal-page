import { describe, expect, it } from 'vitest';
import { effectivePaymentPpm, giftCoverage, grossUpFee, quote, withGiftCard } from './pricing';

const R = { platformFeePercent: 10, paymentFeePercent: 3.19, paymentFeeVat: true };
// Mismos vectores que server/test/pricing.test.js.
const VECTORS: [number, number, typeof R, { platformFeeCLP: number; paymentFeeCLP: number; serviceFeeCLP: number; totalCLP: number; barberCLP: number }][] = [
  [12000, 0, R, { platformFeeCLP: 1200, paymentFeeCLP: 521, serviceFeeCLP: 1721, totalCLP: 13721, barberCLP: 12000 }],
  [12000, 3000, R, { platformFeeCLP: 1500, paymentFeeCLP: 652, serviceFeeCLP: 2152, totalCLP: 17152, barberCLP: 15000 }],
  [18000, 0, R, { platformFeeCLP: 1800, paymentFeeCLP: 782, serviceFeeCLP: 2582, totalCLP: 20582, barberCLP: 18000 }],
  [12000, 0, { ...R, paymentFeeVat: false }, { platformFeeCLP: 1200, paymentFeeCLP: 435, serviceFeeCLP: 1635, totalCLP: 13635, barberCLP: 12000 }],
  [12345, 0, { ...R, paymentFeePercent: 0 }, { platformFeeCLP: 1235, paymentFeeCLP: 0, serviceFeeCLP: 1235, totalCLP: 13580, barberCLP: 12345 }],
  [12000, 0, { platformFeePercent: 0, paymentFeePercent: 0, paymentFeeVat: true }, { platformFeeCLP: 0, paymentFeeCLP: 0, serviceFeeCLP: 0, totalCLP: 12000, barberCLP: 12000 }],
];

describe('desglose SPEC-38 (igual que el server)', () => {
  it.each(VECTORS)('%i + %i', (price, surcharge, rates, out) => {
    const q = quote(price, surcharge, rates);
    expect(q).toMatchObject(out);
    expect(q.totalCLP).toBe(q.priceCLP + q.surchargeCLP + q.platformFeeCLP + q.paymentFeeCLP);
  });
  it('ejemplo de la spec: 3,19 % + IVA = 3,7961 % → $521', () => {
    expect(effectivePaymentPpm(3.19, true)).toBe(37961);
    expect(grossUpFee(13200, 37961)).toBe(521);
  });
});

// SPEC-60 RN-04: misma regla de cobertura que server/src/domain/giftcards.js (coverage).
describe('gift card (SPEC-60)', () => {
  const corteHome = quote(12000, 3000, R); // total 17.152
  it('monto: descuenta del total hasta el saldo', () => {
    expect(giftCoverage({ kind: 'monto', amountCLP: 20000, balanceCLP: 20000, service: null }, corteHome, 'corte', R)).toBe(17152);
    expect(giftCoverage({ kind: 'monto', amountCLP: 20000, balanceCLP: 3000, service: null }, corteHome, 'corte', R)).toBe(3000);
  });
  it('servicio intacta en ese servicio: servicio + su tarifa, sin domicilio', () => {
    const card = { kind: 'servicio' as const, amountCLP: 12000, balanceCLP: 12000, service: { id: 'corte', name: 'Corte' } };
    expect(giftCoverage(card, corteHome, 'corte', R)).toBe(13721);
    // En otro servicio actúa como monto por el precio congelado.
    expect(giftCoverage(card, quote(18000, 0, R), 'corte-barba', R)).toBe(12000);
  });
  it('withGiftCard: total a pagar = total − gift card', () => {
    expect(withGiftCard(quote(12000, 0, R), 5000)).toMatchObject({ giftCardCLP: 5000, dueCLP: 8721 });
  });
});
