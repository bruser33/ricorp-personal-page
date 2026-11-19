import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { heroItems, nextIndex, normalizeSlides, prevIndex, resolveIndex } from './heroSlides';
import site from '../../public/wstyle/content/site.json';
import manifest from '../../public/wstyle/seq/manifest.json';
import { SHOT_IDS } from './content';
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
  it('site.json trae las tres vistas del recorrido 3D: los fotogramas ancla de El local, El espejo y Tu trono (P1 = A)', () => {
    const s = normalizeSlides(site as SiteContent);
    expect(s.map((x) => x.caption)).toEqual(['El local', 'El espejo', 'Tu trono']);
    const anchors = manifest.formats.desktop.anchorFrames;
    expect(manifest.formats.mobile.anchorFrames).toEqual(anchors);
    const frame = (id: string) => String(anchors[SHOT_IDS.indexOf(id as never)]).padStart(4, '0');
    const want = ['reyes', 'afilado', 'trono'].map(frame);
    expect(want).toEqual(['0026', '0076', '0100']);
    s.forEach((x, i) => {
      expect(x.src).toBe(`wstyle/seq/desktop-hd/${want[i]}.webp`);
      expect(x.srcSm).toBe(`wstyle/seq/mobile-hd/${want[i]}.webp`);
      for (const f of [x.src, x.srcSm]) expect(existsSync(fileURLToPath(new URL(`../../public/${f}`, import.meta.url)))).toBe(true);
    });
  });
});
