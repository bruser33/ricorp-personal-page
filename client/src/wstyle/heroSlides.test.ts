import { describe, expect, it } from 'vitest';
import { heroItems, nextIndex, normalizeSlides, prevIndex } from './heroSlides';
import site from '../../public/wstyle/content/site.json';
import type { SiteContent } from './content';

// SPEC-61: flechas del hero (lógica pura).
describe('navegación circular (AC-06)', () => {
  it('derecha avanza y desde la última vuelve a la primera', () => {
    expect(nextIndex(0, 4)).toBe(1);
    expect(nextIndex(3, 4)).toBe(0);
  });
  it('izquierda retrocede y desde la primera va a la última', () => {
    expect(prevIndex(2, 4)).toBe(1);
    expect(prevIndex(0, 4)).toBe(3);
  });
  it('con un solo elemento se queda en 0', () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
  });
});

describe('pantallas desde site.json', () => {
  it('descarta entradas sin src o alt y repetidas; srcSm y caption tienen valor por defecto', () => {
    const s = normalizeSlides({ hero: { slides: [
      { id: 'a', src: 'x.webp', alt: 'A' }, { id: 'b', src: '', alt: 'B' }, { id: 'c', src: 'c.webp' }, null as never,
      { id: 'a', src: 'y.webp', alt: 'otra A' }, { src: 'd.webp', srcSm: 'd-sm.webp', alt: 'D', caption: 'Dé' },
    ] } });
    expect(s).toEqual([
      { id: 'a', src: 'x.webp', srcSm: 'x.webp', alt: 'A', caption: 'A' },
      { id: 'slide-6', src: 'd.webp', srcSm: 'd-sm.webp', alt: 'D', caption: 'Dé' },
    ]);
  });
  it('sin hero.slides no hay pantallas extra (AC-11: solo la portada)', () => {
    expect(normalizeSlides({})).toEqual([]);
    expect(normalizeSlides({ hero: { slides: 'x' as never } })).toEqual([]);
    expect(heroItems([])).toHaveLength(1);
  });
  it('la portada (barbero) es siempre la primera y las rotas se saltan', () => {
    const s = normalizeSlides({ hero: { slides: [{ id: 'a', src: 'a', alt: 'A' }, { id: 'b', src: 'b', alt: 'B' }] } });
    const items = heroItems(s, new Set(['a']));
    expect(items.map((i) => i.id)).toEqual(['barbero', 'b']);
    expect(items[0].kind).toBe('portrait');
  });
  it('site.json trae las tres vistas del recorrido 3D (El local, El espejo, Tu trono)', () => {
    const s = normalizeSlides(site as SiteContent);
    expect(s.map((x) => x.caption)).toEqual(['El local', 'El espejo', 'Tu trono']);
    for (const x of s) {
      expect(x.src).toMatch(/^wstyle\/seq\/desktop-hd\/\d{4}\.webp$/);
      expect(x.srcSm).toMatch(/^wstyle\/seq\/mobile-hd\/\d{4}\.webp$/);
    }
  });
});
