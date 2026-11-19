import { str, type SiteContent } from './content';

// SPEC-61: pantallas del hero que se recorren con las flechas. La 1 es siempre el barbero con el fuego (SPEC-49);
// las demás salen de site.json → hero.slides (tomas del recorrido 3D que ya existen). Entradas sin src o sin alt se
// descartan (el dueño puede editar el JSON a mano).
export interface HeroSlide { id: string; src: string; srcSm: string; alt: string; caption: string }
export type HeroItem = { kind: 'portrait'; id: 'barbero'; caption: string } | ({ kind: 'image' } & HeroSlide);

export function normalizeSlides(site: SiteContent): HeroSlide[] {
  const raw = site.hero?.slides;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HeroSlide[] = [];
  raw.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const src = str(s.src), alt = str(s.alt);
    if (!src || !alt) return;
    const id = str(s.id) ?? `slide-${i + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, src, srcSm: str(s.srcSm) ?? src, alt, caption: str(s.caption) ?? alt });
  });
  return out;
}

// Lista completa (portada + pantallas válidas), sin las que fallaron al cargar.
export function heroItems(slides: HeroSlide[], broken: ReadonlySet<string> = new Set()): HeroItem[] {
  return [{ kind: 'portrait', id: 'barbero', caption: 'Portada' }, ...slides.filter((s) => !broken.has(s.id)).map((s) => ({ kind: 'image' as const, ...s }))];
}

// Navegación circular (RN-06/07).
export const nextIndex = (i: number, n: number) => (n > 0 ? (i + 1) % n : 0);
export const prevIndex = (i: number, n: number) => (n > 0 ? (i - 1 + n) % n : 0);
