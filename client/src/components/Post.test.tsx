import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PostCuerpo } from './Post';
import { hitosOrdenados, trayectoria } from '../data/trayectoria';

/* El HTML real del post (no solo la función que lo distribuye): si alguien
   vuelve a poner el reel al lado del tutorial, o lo deja de dibujar, esto falla. */
const hito = (id: string) => trayectoria.find((h) => h.id === id)!;

describe('PostCuerpo de W Style (SPEC-43)', () => {
  const html = renderToStaticMarkup(<PostCuerpo hito={hito('wstyle-2026')} />);

  it('tiene exactamente 2 videos: tutorial primero y reel en el lugar del teléfono', () => {
    const videos = html.match(/<video[\s>]/g) ?? [];
    expect(videos).toHaveLength(2);
    const tutorial = html.indexOf('post-video--tutorial');
    const reel = html.indexOf('post-reel');
    expect(tutorial).toBeGreaterThan(-1);
    expect(reel).toBeGreaterThan(tutorial);
    expect(html).toMatch(/class="[^"]*post-telefono[^"]*post-reel/);
  });

  it('el tutorial va justo después del primer párrafo', () => {
    const primerCierre = html.indexOf('</p>');
    const tutorial = html.indexOf('post-video--tutorial');
    expect(primerCierre).toBeGreaterThan(-1);
    expect(tutorial).toBeGreaterThan(primerCierre);
    expect(html.slice(primerCierre, tutorial)).not.toContain('<p');
  });

  it('no muestra el teléfono con el play cortado', () => {
    expect(html).not.toContain('wstyle-mockup-mobile');
  });

  it('los videos no se reproducen solos y no se descargan antes del play', () => {
    for (const tag of html.match(/<video[^>]*>/g) ?? []) {
      expect(tag).toContain('controls');
      expect(tag).toContain('preload="none"');
      expect(tag).not.toContain('autoplay');
    }
  });
});

describe('PostCuerpo de Haru (SPEC-48)', () => {
  const html = renderToStaticMarkup(<PostCuerpo hito={hito('haru')} />);

  it('el reel ocupa el lugar del teléfono y ya no hay galería', () => {
    const videos = html.match(/<video[\s>]/g) ?? [];
    expect(videos).toHaveLength(1);
    expect(html).toMatch(/class="[^"]*post-telefono[^"]*post-reel/);
    expect(html).toContain('videos/haru-promo.mp4');
    expect(html).not.toContain('galeria-slide');
    expect(html).not.toContain('post-video--tutorial');
    // con el reel, el 2.º mockup (haru-home) no se dibuja
    expect(html).not.toContain('haru-home');
  });

  it('el reel no se reproduce solo ni se descarga antes del play', () => {
    const tag = (html.match(/<video[^>]*>/g) ?? [])[0];
    expect(tag).toContain('controls');
    expect(tag).toContain('preload="none"');
    expect(tag).not.toContain('autoplay');
  });
});

describe('orden de la trayectoria (SPEC-47)', () => {
  it('el trabajo actual va entre W Style y Haru', () => {
    const ids = hitosOrdenados().map((h) => h.id);
    expect(ids.indexOf('wstyle-2026')).toBeLessThan(ids.indexOf('trabajo-actual-2025'));
    expect(ids.indexOf('trabajo-actual-2025')).toBeLessThan(ids.indexOf('haru'));
  });
});

describe('PostCuerpo del trabajo actual (SPEC-47)', () => {
  const html = renderToStaticMarkup(<PostCuerpo hito={hito('trabajo-actual-2025')} />);

  it('el video promocional va arriba, a todo el ancho, y no se reproduce solo', () => {
    const videos = html.match(/<video[^>]*>/g) ?? [];
    expect(videos).toHaveLength(1);
    expect(html).toContain('videos/video-promocional.mp4');
    expect(html).toContain('post-video--tutorial');
    expect(html).not.toContain('post-reel');
    expect(videos[0]).toContain('preload="none"');
    expect(videos[0]).not.toContain('autoplay');
  });
});
