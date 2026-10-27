/// <reference types="node" />
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { trayectoria } from './trayectoria';

/* SPEC-39/40/42: toda ruta de `trayectoria.ts` tiene que existir en
   client/public (un typo deja una tarjeta en negro sin que tsc lo note), y los
   pesos se acotan porque todo esto se publica en GitHub Pages. */
const PUBLIC = resolve(__dirname, '../../public');
const SRC = resolve(__dirname, '..');
const KB = 1024;
const MB = 1024 * KB;

const rutasDe = (h: (typeof trayectoria)[number]) =>
  [
    h.imagen,
    ...(h.mockups ?? []),
    ...(h.galeria ?? []).map((f) => f.src),
    h.videos?.tutorial?.src,
    h.videos?.tutorial?.poster,
    h.videos?.reel?.src,
    h.videos?.reel?.poster,
  ].filter((r): r is string => !!r && !/^(https?:)?\/\//.test(r));

describe('assets de la trayectoria', () => {
  it('SPEC-47: el trabajo actual trae su video promocional (≤ 15 MB)', () => {
    const t = trayectoria.find((x) => x.id === 'trabajo-actual-2025')!;
    expect(t.videos?.tutorial?.src).toBe('videos/video-promocional.mp4');
    expect(t.videos?.tutorial?.poster).toBe('videos/video-promocional.webp');
    expect(statSync(resolve(PUBLIC, t.videos!.tutorial!.src)).size).toBeLessThanOrEqual(15 * MB);
  });


  for (const h of trayectoria) {
    for (const ruta of rutasDe(h)) {
      it(`${h.id}: existe ${ruta}`, () => {
        expect(existsSync(resolve(PUBLIC, ruta))).toBe(true);
      });
    }
  }

  it('SPEC-42: los hitos llevan banner propio y 2 mockups', () => {
    for (const id of ['youtube-proyectos-informaticos', 'tuapp-2014-smartcorp', 'tuapp-2013-r2d2']) {
      const h = trayectoria.find((x) => x.id === id)!;
      expect(h.imagen).toBe(`figma-frames/${id}-banner.webp`);
      expect(h.mockups).toHaveLength(2);
      expect(statSync(resolve(PUBLIC, h.imagen!)).size).toBeLessThanOrEqual(500 * KB);
    }
  });

  /* SPEC-47 AC2: cada publicación usa imágenes propias. Ninguna ruta de
     `imagen`, `mockups`, `galeria` o póster de video se repite entre DOS hitos
     distintos (dentro de un mismo hito tampoco tiene sentido repetirla). */
  it('SPEC-47: ninguna imagen se repite entre hitos', () => {
    const duenos = new Map<string, string[]>();
    for (const h of trayectoria) {
      const imagenes = new Set(
        [
          h.imagen,
          ...(h.mockups ?? []),
          ...(h.galeria ?? []).map((f) => f.src),
          h.videos?.tutorial?.poster,
          h.videos?.reel?.poster,
        ].filter((r): r is string => !!r),
      );
      for (const ruta of imagenes) duenos.set(ruta, [...(duenos.get(ruta) ?? []), h.id]);
    }
    const repetidas = [...duenos].filter(([, ids]) => ids.length > 1).map(([ruta, ids]) => `${ruta} ← ${ids.join(', ')}`);
    expect(repetidas).toEqual([]);
  });

  it('SPEC-45: Workana lleva la credencial nueva (no los archivos de SPEC-42)', () => {
    const h = trayectoria.find((x) => x.id === 'workana-freelancer')!;
    expect(h.imagen).toBe('figma-frames/workana-credencial-banner.webp');
    expect(h.mockups).toEqual([
      'figma-frames/workana-credencial-ficha.webp',
      'figma-frames/workana-credencial-devskiller.webp',
    ]);
    for (const r of [h.imagen!, ...h.mockups!]) {
      expect(r).not.toMatch(/workana-freelancer-/);
      expect(statSync(resolve(PUBLIC, r)).size).toBeLessThanOrEqual(500 * KB);
    }
  });

  /* SPEC-48: el reel promocional reemplazó a la galería de SPEC-45. */
  it('SPEC-48: Haru trae su reel (MP4 ≤ 10 MB + póster) y ya no la galería', () => {
    const haru = trayectoria.find((x) => x.id === 'haru')!;
    expect(haru.galeria).toBeUndefined();
    expect(haru.videos?.tutorial).toBeUndefined();
    const reel = haru.videos?.reel;
    expect(reel).toEqual({ src: 'videos/haru-promo.mp4', poster: 'videos/haru-promo.webp', titulo: 'Reel de Haru' });
    expect(statSync(resolve(PUBLIC, reel!.src)).size).toBeLessThanOrEqual(10 * MB);
    expect(statSync(resolve(PUBLIC, reel!.poster!)).size).toBeLessThanOrEqual(250 * KB);
    // Las pantallas de la galería se borraron: no queda la carpeta huérfana.
    expect(existsSync(resolve(PUBLIC, 'figma-frames/haru'))).toBe(false);
  });

  it('SPEC-45: ninguna imagen se repite entre publicaciones', () => {
    const vistas = new Map<string, string>();
    const repetidas: string[] = [];
    for (const h of trayectoria) {
      for (const r of new Set([...(h.mockups ?? []), ...(h.galeria ?? []).map((f) => f.src)])) {
        const otro = vistas.get(r);
        if (otro) repetidas.push(`${r} (${otro} y ${h.id})`);
        else vistas.set(r, h.id);
      }
    }
    expect(repetidas).toEqual([]);
  });

  it('SPEC-40: Haru usa su banner HD (≤ 600 KB)', () => {
    const haru = trayectoria.find((x) => x.id === 'haru')!;
    expect(haru.imagen).toBe('figma-frames/haru-banner-hd.webp');
    expect(statSync(resolve(PUBLIC, haru.imagen!)).size).toBeLessThanOrEqual(600 * KB);
  });

  it('SPEC-39: W Style trae tutorial y reel, cada MP4 ≤ 15 MB', () => {
    const ws = trayectoria.find((x) => x.id === 'wstyle-2026')!;
    for (const v of [ws.videos?.tutorial, ws.videos?.reel]) {
      expect(v).toBeDefined();
      expect(statSync(resolve(PUBLIC, v!.src)).size).toBeLessThanOrEqual(15 * MB);
    }
  });
});

/* SPEC-39 AC1: el slider y la Trayectoria tienen que montar el MISMO modal.
   No hay Testing Library en el repo, así que se comprueba el cableado en el
   fuente: si alguien vuelve a armar un DetailModal a mano para los posts, falla. */
describe('cableado del post', () => {
  const news = readFileSync(resolve(SRC, 'components/News.tsx'), 'utf8');
  const projects = readFileSync(resolve(SRC, 'components/Projects.tsx'), 'utf8');

  it('News abre PostModal cuando usaModoPost', () => {
    expect(news).toMatch(/usaModoPost\(detalle\)\s*&&\s*\(\s*<PostModal/);
    // Y el detalle simple queda para el resto: nunca los dos modales a la vez.
    expect(news).toMatch(/!usaModoPost\(detalle\)\s*&&\s*\(\s*<DetailModal/);
  });

  it('Projects abre PostModal y no arma un DetailModal propio', () => {
    expect(projects).toMatch(/<PostModal/);
    expect(projects).not.toMatch(/<DetailModal/);
  });
});
