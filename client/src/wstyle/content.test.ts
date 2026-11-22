import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupByCategory, mergeCatalog, normalizeServicesJson, type Content, type LandingCatalog } from './content';

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

// SPEC-51 AC-06: services.json con las 4 categorías y los 14 servicios (importes CLP de la tabla aprobada).
const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/wstyle/content/services.json'), 'utf8'));
const json = normalizeServicesJson(raw);
const TABLE: [string, string, number, number, string][] = [
  ['decoloracion-global', 'Global', 50000, 150, 'decoloracion'],
  ['decoloracion-bloque', 'Bloque de color', 25000, 90, 'decoloracion'],
  ['decoloracion-superior', 'Superior', 40000, 120, 'decoloracion'],
  ['decoloracion-mechas-puntas', 'Mechas y puntas', 45000, 150, 'decoloracion'],
  ['decoloracion-platinado', 'Rubio platinado, beige y ceniza', 50000, 180, 'decoloracion'],
  ['decoloracion-matizacion', 'Matización y tonos fantasía', 30000, 60, 'decoloracion'],
  ['decoloracion-diseno', 'Diseños de color personalizados', 70000, 180, 'decoloracion'],
  ['ondulacion-permanente', 'Ondulación permanente', 45000, 120, 'ondulacion'],
  ['tratamientos-capilares', 'Tratamientos capilares', 15000, 45, 'tratamientos'],
];

describe('SPEC-51 services.json (fallback)', () => {
  it('tiene las 4 categorías en orden, la nota de decoloración y los 14 servicios', () => {
    expect(json.categories.map((c) => c.name)).toEqual(['Barbería', 'Decoloración capilar', 'Ondulación permanente', 'Tratamientos capilares']);
    expect(json.categories[1].note).toBe('Cada servicio incluye una evaluación previa del cabello.');
    expect(json.services).toHaveLength(14);
    expect(json.services.filter((s) => s.category === 'barberia').map((s) => [s.id, s.priceCLP, s.durationMin])).toEqual([
      ['corte', 10000, 40], ['corte-barba', 12000, 60], ['barba', 8000, 25], ['lavado-masaje', 7000, 20], ['limpieza-facial', 15000, 35],
    ]);
    expect(json.services.filter((s) => s.category !== 'barberia').map((s) => [s.id, s.name, s.priceCLP, s.durationMin, s.category])).toEqual(TABLE);
    // Todas caben en bloques de 15 min y en el máximo de 240.
    for (const s of json.services) expect(Number(s.durationMin) <= 240).toBe(true);
  });
  it('acepta el formato antiguo (array) y basura sin romper', () => {
    expect(normalizeServicesJson([{ id: 'corte' }])).toEqual({ services: [{ id: 'corte' }], categories: [] });
    expect(normalizeServicesJson(null)).toEqual({ services: [], categories: [] });
  });
});

describe('SPEC-51 mergeCatalog con categorías', () => {
  const withCats: Content = { ...content, categories: json.categories, services: json.services };
  it('conserva la categoría de cada servicio y las categorías que vienen de la API', () => {
    const out = mergeCatalog(withCats, {
      ...catalog,
      categories: [{ id: 'barberia', name: 'Barbería', note: '' }, { id: 'decoloracion', name: 'Coloración', note: 'Nota nueva' }],
      services: [{ id: 'decoloracion-global', name: 'Global', priceCLP: 50000, durationMin: 165, category: 'decoloracion' }, { id: 'corte', name: 'Corte', priceCLP: 12000, durationMin: 40, category: 'barberia' }],
    });
    expect(out.services.map((s) => [s.id, s.category, s.durationMin])).toEqual([['decoloracion-global', 'decoloracion', 165], ['corte', 'barberia', 40]]);
    expect(out.categories?.[1]).toEqual({ id: 'decoloracion', name: 'Coloración', note: 'Nota nueva' });
  });
  it('conserva contacto y horario publicados si la API aún identifica el local anterior', () => {
    const stale = { ...catalog.business, contact: { phone: 'anterior', address: { street: 'Otra dirección' } } };
    const result = mergeCatalog(content, { ...catalog, business: stale });
    expect(result.site.contact).toEqual(content.site.contact);
    expect(result.site.hours).toEqual(content.site.hours);
  });
  it('una API antigua conserva los 14 servicios publicados y actualiza el horario', () => {
    const out = mergeCatalog(withCats, catalog);
    expect(out.categories).toBe(json.categories);
    expect(out.services).toEqual(json.services);
    expect(groupByCategory(out.services, out.categories).map((g) => g.items.length)).toEqual([5, 7, 1, 1]);
    expect(out.site.hours).toEqual(catalog.business.hoursRows);
  });
});

describe('SPEC-51 groupByCategory (RN-01/02/03)', () => {
  it('agrupa en el orden de las categorías, con la nota una vez y sin grupos vacíos', () => {
    const g = groupByCategory(json.services, json.categories);
    expect(g.map((x) => [x.name, x.items.length])).toEqual([['Barbería', 5], ['Decoloración capilar', 7], ['Ondulación permanente', 1], ['Tratamientos capilares', 1]]);
    expect(g[1].note).toBe('Cada servicio incluye una evaluación previa del cabello.');
    expect(g[0].note).toBe('');
    // El orden dentro del grupo es el de llegada (el `order` de la BD).
    expect(g[1].items.map((s) => s.id)).toEqual(TABLE.filter((t) => t[4] === 'decoloracion').map((t) => t[0]));
    const sinTratamientos = groupByCategory(json.services.filter((s) => s.category !== 'tratamientos'), json.categories);
    expect(sinTratamientos.map((x) => x.id)).toEqual(['barberia', 'decoloracion', 'ondulacion']);
  });
  it('sin categoría o con una desconocida → Barbería, aunque no venga en la lista', () => {
    const g = groupByCategory<{ id: string; category?: string }>([{ id: 'a' }, { id: 'b', category: 'no-existe' }, { id: 'c', category: 'x' }], [{ id: 'x', name: 'Equis' }]);
    expect(g.map((x) => [x.id, x.name, x.items.map((s) => s.id)])).toEqual([['barberia', 'Barbería', ['a', 'b']], ['x', 'Equis', ['c']]]);
    expect(groupByCategory<{ id: string; category?: string }>([{ id: 'a' }], undefined)).toEqual([{ id: 'barberia', name: 'Barbería', note: '', items: [{ id: 'a' }] }]);
  });
});
