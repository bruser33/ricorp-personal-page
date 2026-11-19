import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Services from './components/Services';
import { normalizeServicesJson } from './content';

// SPEC-51 AC-08 (lado componente): "La carta" agrupada por categoría con la carta del JSON de respaldo.
const { services, categories } = normalizeServicesJson(JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/wstyle/content/services.json'), 'utf8')));
const html = (list = services, cats: typeof categories | undefined = categories) => renderToStaticMarkup(<Services services={list} categories={cats} />);
// Bloques <section data-category="…">…</section> en orden.
const groups = (h: string) => [...h.matchAll(/<section[^>]*data-category="([^"]+)"[^>]*>(.*?)<\/section>/g)].map((m) => ({ id: m[1], body: m[2] }));
const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/\s/g, ' ');
const field = (body: string, f: string) => text(body.match(new RegExp(`data-svc="${f}"[^>]*>(.*?)</`))?.[1] ?? '');
const service = (h: string, id: string) => h.match(new RegExp(`<article[^>]*data-service="${id}"[^>]*>(.*?)</article>`))?.[1] ?? '';

describe('SPEC-51 carta agrupada', () => {
  it('4 grupos en orden, la nota una sola vez bajo Decoloración y los 14 servicios', () => {
    const g = groups(html());
    expect(g.map((x) => text(x.body.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] ?? ''))).toEqual(['Barbería', 'Decoloración capilar', 'Ondulación permanente', 'Tratamientos capilares']);
    expect(g.map((x) => (x.body.match(/data-category-note/g) ?? []).length)).toEqual([0, 1, 0, 0]);
    expect(text(g[1].body)).toContain('Cada servicio incluye una evaluación previa del cabello.');
    expect(g.map((x) => (x.body.match(/<article/g) ?? []).length)).toEqual([5, 7, 1, 1]);
  });
  it('cada servicio con su precio CLP y su duración (importes de la tabla)', () => {
    const h = html();
    const row = (id: string) => { const b = service(h, id); return [field(b, 'name'), field(b, 'price'), field(b, 'duration')]; };
    expect(row('decoloracion-global')).toEqual(['Global', '$50.000', '150 min']);
    expect(row('decoloracion-platinado')).toEqual(['Rubio platinado, beige y ceniza', '$50.000', '180 min']);
    expect(row('decoloracion-diseno')).toEqual(['Diseños de color personalizados', '$70.000', '180 min']);
    expect(row('ondulacion-permanente')).toEqual(['Ondulación permanente', '$45.000', '120 min']);
    expect(row('tratamientos-capilares')).toEqual(['Tratamientos capilares', '$15.000', '45 min']);
    expect(row('corte')).toEqual(['Corte', '$12.000', '40 min']);
  });
  it('sin categorías (API antigua) todo cae en Barbería', () => {
    const g = groups(html(services.map((s) => ({ ...s, category: undefined })), undefined));
    expect(g.map((x) => x.id)).toEqual(['barberia']);
    expect((g[0].body.match(/<article/g) ?? []).length).toBe(14);
  });
});
