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
  for (const h of trayectoria) {
    for (const ruta of rutasDe(h)) {
      it(`${h.id}: existe ${ruta}`, () => {
        expect(existsSync(resolve(PUBLIC, ruta))).toBe(true);
      });
    }
  }

  it('SPEC-42: los 4 hitos llevan banner propio y 2 mockups', () => {
    for (const id of ['workana-freelancer', 'youtube-proyectos-informaticos', 'tuapp-2014-smartcorp', 'tuapp-2013-r2d2']) {
      const h = trayectoria.find((x) => x.id === id)!;
      expect(h.imagen).toBe(`figma-frames/${id}-banner.webp`);
      expect(h.mockups).toHaveLength(2);
      expect(statSync(resolve(PUBLIC, h.imagen!)).size).toBeLessThanOrEqual(500 * KB);
    }
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
