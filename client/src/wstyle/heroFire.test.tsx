import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HeroFire from './components/HeroFire';
import Embers from './components/Embers';
import { createFire, heroFadeEnd, heroOut } from './fx/fire';
import { createEmbers, emberDensity } from './fx/embers';

// SPEC-49: el dueño en el hero con fuego detrás y brasas que persisten en el recorrido.
// Sin DOM (entorno node): el marcado se prueba con renderToStaticMarkup y los bucles con un canvas falso.

// Contexto falso: cualquier método es un no-op que devuelve true (shaders/programa "compilan"); cuenta las llamadas.
function fakeContext() {
  const calls: Record<string, number> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (t[k] = (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return true; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    },
  });
  return { ctx, calls };
}
function fakeCanvas(ctx: unknown) {
  return { width: 0, height: 0, getContext: () => ctx, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
}
const mockReduced = (reduced: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q.includes('reduce'), media: q }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('hero con fuego (SPEC-49)', () => {
  it('renderiza el retrato (srcset liviano/grande) y la capa del fuego', () => {
    const html = renderToStaticMarkup(<HeroFire name="WS Style" />);
    expect(html).toContain('class="hero-fx"');
    expect(html).toMatch(/<canvas[^>]*class="hero-fire"/);
    expect(html).toMatch(/<img[^>]*class="hero-portrait__img"/);
    expect(html).toContain('/wstyle/hero/barbero-sm.webp 640w');
    expect(html).toContain('/wstyle/hero/barbero.webp 1100w');
    expect(html).toContain('alt="El barbero de WS Style"');
  });
  it('renderiza la capa de brasas a pantalla completa, decorativa', () => {
    const html = renderToStaticMarkup(<Embers />);
    expect(html).toMatch(/<canvas[^>]*class="embers"/);
    expect(html).toContain('aria-hidden="true"');
  });
  it('el retrato se funde en el primer ~15 % del documento (o antes de "El local")', () => {
    expect(heroFadeEnd(900, 12000)).toBeCloseTo(810);     // El local llega antes que el 15 %
    expect(heroFadeEnd(5000, 10000)).toBe(1500);          // 15 % del scroll total
    expect(heroOut(0, 810)).toBe(0);
    expect(heroOut(405, 810)).toBeCloseTo(.5);
    expect(heroOut(900, 810)).toBe(1);
  });
  it('densidad de brasas: plena en el hero, mayor en "Tu trono" que en "El oficio", nunca 0', () => {
    expect(emberDensity('hero')).toBe(1);
    expect(emberDensity('trono')).toBeGreaterThan(emberDensity('linea'));
    for (const id of ['reyes', 'linea', 'afilado', 'servicios', 'membresia', 'llega', null]) expect(emberDensity(id)).toBeGreaterThan(0);
  });
});

describe('movimiento reducido (AC-05)', () => {
  it('con reduced-motion el fuego pinta un solo frame y no pide requestAnimationFrame', () => {
    mockReduced(true);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { ctx, calls } = fakeContext();
    const fire = createFire(fakeCanvas(ctx));
    expect(fire.mode).toBe('gl');
    fire.resize(1440, 900); fire.start();
    expect(calls.drawArrays).toBe(1);
    expect(raf).not.toHaveBeenCalled();
    fire.dispose();
  });
  it('con reduced-motion las brasas no arrancan', () => {
    mockReduced(true);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { ctx } = fakeContext();
    const embers = createEmbers(fakeCanvas(ctx), { max: 160 });
    embers.resize(1440, 900); embers.start();
    expect(raf).not.toHaveBeenCalled();
    expect(embers.running).toBe(false);
  });
  it('sin reduced-motion ambos bucles arrancan', () => {
    mockReduced(false);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const fire = createFire(fakeCanvas(fakeContext().ctx));
    fire.resize(1440, 900); fire.start();
    const embers = createEmbers(fakeCanvas(fakeContext().ctx), { max: 160 });
    embers.resize(1440, 900); embers.start();
    expect(raf).toHaveBeenCalledTimes(2);
    expect(fire.running && embers.running).toBe(true);
  });
  it('sin WebGL el fuego queda en modo estático (degradado CSS)', () => {
    mockReduced(false);
    const fire = createFire(fakeCanvas(null));
    expect(fire.mode).toBe('static');
    fire.start();
    expect(fire.running).toBe(false);
  });
});
