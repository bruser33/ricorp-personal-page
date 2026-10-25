import { describe, expect, it } from 'vitest';
import { mergeCatalog, type Content, type LandingCatalog } from './content';

// SPEC-34 RN-06 / AC-07: la carta y el horario de la BD reemplazan a los del JSON; sin API se queda el JSON.
const content: Content = {
  site: {
    name: 'WS Style',
    contact: { phone: '+56 9 0000 0000', whatsapp: '+56 9 0000 0000', whatsappText: 'Hola', address: { street: 'Calle Falsa 123' } },
    hours: [{ days: 'Lunes a viernes', dayCodes: 'Mo-Fr', opens: '10:00', closes: '20:00' }],
    marquee: ['Corte'],
  },
  services: [{ id: 'corte', name: 'Corte', description: 'Clásico', priceCLP: 12000, durationMin: 40 }],
  config: {},
};
const catalog: LandingCatalog = {
  services: [
    { id: 'corte', name: 'Corte', description: 'Clásico', priceCLP: 15000, durationMin: 40 },
    { id: 'corte-nino', name: 'Corte niño', priceCLP: 9000, durationMin: 30 },
  ],
  business: {
    hoursRows: [
      { days: 'Lunes a viernes', dayCodes: 'Mo-Fr', opens: '11:00', closes: '19:00' },
      { days: 'Domingo', dayCodes: 'Su', opens: null, closes: null },
    ],
    contact: { phone: '+56 9 1111 2222', whatsapp: null },
  },
};

describe('mergeCatalog', () => {
  it('reemplaza la carta y el horario con lo de la BD', () => {
    const out = mergeCatalog(content, catalog);
    expect(out.services.map((s) => [s.id, s.priceCLP])).toEqual([['corte', 15000], ['corte-nino', 9000]]);
    expect(out.services[1].description).toBe('');
    expect(out.site.hours).toEqual(catalog.business.hoursRows);
  });
  it('del contacto solo toma teléfono/WhatsApp no vacíos; textos y dirección siguen del JSON', () => {
    const out = mergeCatalog(content, catalog);
    expect(out.site.contact?.phone).toBe('+56 9 1111 2222');
    expect(out.site.contact?.whatsapp).toBe('+56 9 0000 0000');
    expect(out.site.contact?.whatsappText).toBe('Hola');
    expect(out.site.contact?.address?.street).toBe('Calle Falsa 123');
    expect(out.site.marquee).toEqual(['Corte']);
  });
  it('sin catálogo (API caída o lenta) devuelve el contenido del JSON tal cual', () => {
    expect(mergeCatalog(content, null)).toBe(content);
  });
  it('si la BD no trae horario, queda el del JSON', () => {
    const out = mergeCatalog(content, { ...catalog, business: {} });
    expect(out.site.hours).toEqual(content.site.hours);
  });
  it('no muta el contenido original', () => {
    const before = JSON.stringify(content);
    mergeCatalog(content, catalog);
    expect(JSON.stringify(content)).toBe(before);
  });
});
