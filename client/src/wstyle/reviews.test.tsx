import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildChapters, type SiteContent } from './content';
import { Reviews } from './components/Extras';
import { countLabel, formatAverage, hasVisibleReviews, mergeReviews, reviewDate, roundHalf, starsLabel, starsText, type PublicReview, type ReviewsPage } from './reviews';
import { sectionFromPath, SECTIONS } from './admin/util';
import site from '../../public/wstyle/content/site.json';

// SPEC-52: reseñas en la landing (sin DOM, como heroNav.test.tsx).
const review = (i: number, extra: Partial<PublicReview> = {}): PublicReview => ({
  id: `r${i}`, rating: 5 - (i % 2), comment: `Muy buena atención número ${i}.`, author: 'Pedro R.', service: 'Corte + barba', createdAt: '2026-11-18T15:00:00Z', ...extra,
});
const page = (items: PublicReview[], extra: Partial<ReviewsPage> = {}): ReviewsPage => ({ summary: { average: 4.5, count: 8 }, page: 1, pages: 2, hasMore: true, items, ...extra });

describe('formato (RN-07, RN-10)', () => {
  it('promedio con un decimal y coma; cantidad en singular y plural; estrellas al medio', () => {
    expect(formatAverage(4.333)).toBe('4,3');
    expect(formatAverage(5)).toBe('5,0');
    expect(countLabel(1)).toBe('1 reseña');
    expect(countLabel(8)).toBe('8 reseñas');
    expect(roundHalf(4.3)).toBe(4.5);
    expect(roundHalf(4.2)).toBe(4);
    expect(starsLabel(5)).toBe('5 de 5 estrellas');
    expect(starsLabel(4.5)).toBe('4,5 de 5 estrellas');
    expect(starsText(4)).toBe('★★★★☆');
  });
  it('fecha corta en Santiago: "18 nov 2026" (y la medianoche UTC cae el día anterior en Chile)', () => {
    expect(reviewDate('2026-11-18T15:00:00Z')).toBe('18 nov 2026');
    expect(reviewDate('2026-11-19T02:00:00Z')).toBe('18 nov 2026');
    expect(reviewDate('no-fecha')).toBe('');
  });
  it('"Ver más" suma sin repetir', () => {
    const m = mergeReviews(page([review(1), review(2)]), page([review(2), review(3)], { page: 2, hasMore: false }));
    expect(m.items.map((x) => x.id)).toEqual(['r1', 'r2', 'r3']);
    expect(m.hasMore).toBe(false);
    expect(m.page).toBe(2);
  });
});

describe('capítulos sin huecos (AC-09)', () => {
  const s = site as SiteContent;
  it('sin reseñas: no aparece "Lo que dicen" y la numeración es correlativa', () => {
    const ch = buildChapters(s, false);
    expect(ch.some((c) => c.id === 'resenas')).toBe(false);
    const nums = ch.filter((c) => c.num).map((c) => Number(c.num.slice(0, 2)));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
  it('con reseñas: "Lo que dicen" entre Barberos/Membresía y "Antes de venir", sin saltos', () => {
    const ch = buildChapters(s, true);
    const ids = ch.map((c) => c.id);
    expect(ids.indexOf('resenas')).toBe(ids.indexOf('politicas') - 1);
    const nums = ch.filter((c) => c.num).map((c) => Number(c.num.slice(0, 2)));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
    expect(ch.find((c) => c.id === 'resenas')?.num).toMatch(/^\d\d — Lo que dicen$/);
  });
  it('site.json ya no trae reseñas de ejemplo (AC-11)', () => {
    expect(JSON.stringify(site)).not.toMatch(/Cliente de ejemplo|reseña real de Google/);
    expect('reviews' in site).toBe(false);
  });
});

describe('capítulo "Lo que dicen" (AC-10, RN-11)', () => {
  it('sin datos, con 0 visibles o sin items → no renderiza nada', () => {
    expect(renderToStaticMarkup(<Reviews data={null} label="09 — Lo que dicen" />)).toBe('');
    expect(renderToStaticMarkup(<Reviews data={page([], { summary: { average: 0, count: 0 }, hasMore: false })} label="x" />)).toBe('');
    expect(hasVisibleReviews(page([], { summary: { average: 0, count: 0 } }))).toBe(false);
  });
  it('promedio, cantidad, 6 tarjetas con estrellas accesibles y "Ver más reseñas"', () => {
    const html = renderToStaticMarkup(<Reviews data={page([1, 2, 3, 4, 5, 6].map((i) => review(i)))} label="09 — Lo que dicen" onMore={() => {}} />);
    expect(html).toContain('id="resenas"');
    expect(html).toContain('4,5');
    expect(html).toContain('8 reseñas');
    expect(html.match(/<figure class="review"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="5 de 5 estrellas"');
    expect(html).toContain('aria-label="Promedio: 4,5 de 5 estrellas"');
    expect(html).toContain('Pedro R. · Corte + barba · 18 nov 2026');
    expect(html).toContain('Ver más reseñas');
  });
  it('sin más páginas no hay botón', () => {
    expect(renderToStaticMarkup(<Reviews data={page([review(1)], { hasMore: false, summary: { average: 5, count: 1 } })} label="x" onMore={() => {}} />)).not.toContain('Ver más reseñas');
  });
  it('el comentario es texto: <script> y enlaces no se interpretan (RN-05)', () => {
    const html = renderToStaticMarkup(<Reviews data={page([review(1, { comment: '<script>alert(1)</script> https://x.cl' })], { hasMore: false })} label="x" />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<a ');
  });
});

describe('panel → Reseñas', () => {
  it('sección propia con su carpeta', () => {
    expect(sectionFromPath('/wstyle/admin/resenas/')).toBe('resenas');
    expect(SECTIONS.find((s) => s.key === 'resenas')?.path).toBe('/wstyle/admin/resenas/');
  });
});
