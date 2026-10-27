import { describe, expect, it } from 'vitest';
import { distribucionPost, rotulo, rutaPublica, tituloPlano, tituloTarjeta, usaModoPost } from './post';
import type { HitoTrayectoria } from '../data/trayectoria';

const base: HitoTrayectoria = { id: 'x', fecha: '2024-03', titulo: 'Un hito\ncon salto' };

describe('usaModoPost (SPEC-39: el modal de Trayectoria abre como el del slider)', () => {
  it('un hito pelado (solo título/fecha/descripcion/enlace) abre como siempre', () => {
    expect(usaModoPost(base)).toBe(false);
    expect(usaModoPost({ ...base, descripcion: 'algo', enlace: 'https://a.b', imagen: 'x.png' })).toBe(false);
  });

  it('con parrafos usa el post (PostCuerpo)', () => {
    expect(usaModoPost({ ...base, parrafos: ['uno', 'dos'] })).toBe(true);
  });

  it('con mockups, destacado o videos usa el post', () => {
    expect(usaModoPost({ ...base, mockups: ['m.png'] })).toBe(true);
    expect(usaModoPost({ ...base, destacado: true })).toBe(true);
    expect(usaModoPost({ ...base, videos: { reel: { src: 'videos/r.mp4', titulo: 'Reel' } } })).toBe(true);
  });

  it('listas vacías o videos vacíos no cuentan', () => {
    expect(usaModoPost({ ...base, parrafos: [], mockups: [], videos: {} })).toBe(false);
    expect(usaModoPost({ ...base, destacado: false })).toBe(false);
  });

  it('el hito real de W Style abre en modo post y trae sus dos videos', async () => {
    const { trayectoria } = await import('../data/trayectoria');
    const ws = trayectoria.find((h) => h.id === 'wstyle-2026')!;
    expect(usaModoPost(ws)).toBe(true);
    expect(ws.videos?.tutorial?.src).toMatch(/^videos\/.+\.mp4$/);
    expect(ws.videos?.reel?.src).toMatch(/^videos\/.+\.mp4$/);
  });
});

describe('títulos y rutas compartidos por el slider y la Trayectoria', () => {
  it('tituloTarjeta prefiere el corto y si no aplana el \\n', () => {
    expect(tituloTarjeta(base)).toBe('Un hito con salto');
    expect(tituloTarjeta({ ...base, tituloTarjeta: 'Corto' })).toBe('Corto');
    expect(tituloPlano('a\nb')).toBe('a b');
  });

  it('rotulo suma la etiqueta solo si existe', () => {
    expect(rotulo(base)).toBe('Un hito con salto');
    expect(rotulo({ ...base, etiqueta: 'Web' })).toBe('Un hito con salto — Web');
  });

  it('rutaPublica antepone el base path solo a rutas relativas', () => {
    expect(rutaPublica('figma-frames/x.png')).toBe(import.meta.env.BASE_URL + 'figma-frames/x.png');
    expect(rutaPublica('/wstyle/a.png')).toBe('/wstyle/a.png');
    expect(rutaPublica('https://cdn.x/a.png')).toBe('https://cdn.x/a.png');
  });
});

/* Regresión (panel de verificación): los hitos de relleno no tienen contenido
   de post y tienen que seguir abriendo el detalle simple. */
describe('hitos de relleno', () => {
  it('siguen en el detalle simple', async () => {
    const { trayectoria } = await import('../data/trayectoria');
    const relleno = trayectoria.filter((h) => h.id.startsWith('relleno-'));
    expect(relleno.length).toBeGreaterThan(0);
    for (const h of relleno) expect(usaModoPost(h)).toBe(false);
  });
});

/* SPEC-43: arriba solo el tutorial (ancho completo) y el reel ocupa el lugar
   del teléfono; con reel, el 2.º mockup no se muestra. */
describe('distribucionPost (SPEC-43)', () => {
  const tutorial = { src: 'videos/t.mp4', titulo: 'Tutorial' };
  const reel = { src: 'videos/r.mp4', titulo: 'Reel' };

  it('tutorial arriba y reel en el lugar del teléfono, sin 2.º mockup', () => {
    const d = distribucionPost({ ...base, mockups: ['a.webp', 'b.webp'], videos: { tutorial, reel } });
    expect(d.tutorial).toBe(tutorial);
    expect(d.figura).toBe('a.webp');
    expect(d.telefono).toEqual({ tipo: 'reel', video: reel });
  });

  it('sin reel el 2.º mockup sigue siendo el teléfono', () => {
    const d = distribucionPost({ ...base, mockups: ['a.webp', 'b.webp'], videos: { tutorial } });
    expect(d.tutorial).toBe(tutorial);
    expect(d.telefono).toEqual({ tipo: 'imagen', src: 'b.webp' });
  });

  it('solo reel: no hay fila de arriba y el reel va flotando', () => {
    const d = distribucionPost({ ...base, mockups: ['a.webp'], videos: { reel } });
    expect(d.tutorial).toBeUndefined();
    expect(d.telefono).toEqual({ tipo: 'reel', video: reel });
  });

  it('sin videos ni mockups no hay nada', () => {
    expect(distribucionPost(base)).toEqual({ tutorial: undefined, figura: undefined, telefono: undefined });
  });

  it('W Style real: 2 videos, solo el mockup desktop y nunca el mobile', async () => {
    const { trayectoria } = await import('../data/trayectoria');
    const ws = trayectoria.find((h) => h.id === 'wstyle-2026')!;
    expect(ws.mockups).toEqual(['figma-frames/wstyle-mockup-desktop.webp']);
    const d = distribucionPost(ws);
    expect(d.tutorial?.src).toBe('videos/wstyle-tutorial.mp4');
    expect(d.telefono).toEqual({ tipo: 'reel', video: ws.videos!.reel });
    expect(JSON.stringify(d)).not.toContain('wstyle-mockup-mobile');
  });
});
