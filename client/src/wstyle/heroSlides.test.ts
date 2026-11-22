import { describe, expect, it } from 'vitest';
import { heroItems, nextIndex, normalizeSlides, prevIndex, resolveIndex } from './heroSlides';
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
  it('la portada (barbero) es siempre la primera y su id no se puede reusar', () => {
    const s = normalizeSlides({ hero: { slides: [{ id: 'barbero', src: 'x', alt: 'X' }, { id: 'a', src: 'a', alt: 'A' }, { id: 'b', src: 'b', alt: 'B' }] } });
    const items = heroItems(s);
    expect(items.map((i) => i.id)).toEqual(['barbero', 'a', 'b']);
    expect(items[0].kind).toBe('portrait');
    expect(resolveIndex(items, 'b')).toBe(2);
  });
  it('si la imagen de la pantalla elegida falla (se quita), se vuelve a la portada; si fallan todas, no hay flechas', () => {
    const s = normalizeSlides({ hero: { slides: [{ id: 'a', src: 'a', alt: 'A' }, { id: 'b', src: 'b', alt: 'B' }] } });
    const sinA = heroItems(s.filter((x) => x.id !== 'a'));
    expect(resolveIndex(sinA, 'a')).toBe(0);
    expect(resolveIndex(sinA, 'b')).toBe(1);
    expect(heroItems([])).toHaveLength(1);
  });
  it('la portada publicada muestra solo el retrato', () => {
    expect(heroItems(normalizeSlides(site as SiteContent)).map(item => item.id)).toEqual(['barbero']);
  });
});
