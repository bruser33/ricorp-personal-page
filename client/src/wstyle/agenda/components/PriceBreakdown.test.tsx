import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PriceBreakdown from './PriceBreakdown';
import { quote } from '../pricing';

// SPEC-38 "como Uber": el cliente ve UNA tarifa de servicio; el admin, sus dos partes.
const p = quote(12000, 0, { platformFeePercent: 10, paymentFeePercent: 3.19, paymentFeeVat: true });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ');

describe('PriceBreakdown', () => {
  it('cliente: Servicio $12.000 · Tarifa de servicio $1.721 (administración 10 % + costo de pagos) · Total $13.721', () => {
    const t = text(renderToStaticMarkup(<dl><PriceBreakdown pricing={p} serviceName="Corte" /></dl>));
    expect(t).toMatch(/Corte \$\s?12\.000/);
    expect(t).toMatch(/Tarifa de servicio administración 10 % \+ costo de pagos \$\s?1\.721/);
    expect(t).toMatch(/Total \$\s?13\.721/);
    expect(t).not.toMatch(/Mercado Pago|Administración de la plataforma/);
  });
  it('admin (split): las dos partes por separado', () => {
    const t = text(renderToStaticMarkup(<dl><PriceBreakdown pricing={p} split /></dl>));
    expect(t).toMatch(/Administración de la plataforma \(10 %\) \$\s?1\.200/);
    expect(t).toMatch(/Costo de pagos \(Mercado Pago 3,19 % \+ IVA\) \$\s?521/);
    expect(t).not.toContain('Tarifa de servicio');
  });
  it('cita antigua (sin feesIncluded): sin tarifa', () => {
    const t = text(renderToStaticMarkup(<dl><PriceBreakdown pricing={{ priceCLP: 12000, surchargeCLP: 0, totalCLP: 12000, platformFeeCLP: 1200 }} /></dl>));
    expect(t).not.toContain('Tarifa');
    expect(t).toMatch(/Total \$\s?12\.000/);
  });
});
