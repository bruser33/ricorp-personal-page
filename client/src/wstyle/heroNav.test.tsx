import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HeroNav from './components/HeroNav';
import HeroFire from './components/HeroFire';

// SPEC-61: flechas del inicio (marcado; sin DOM, como heroFire.test.tsx).
const noop = () => {};
const slides = [
  { id: 'local', src: 'wstyle/seq/desktop-hd/0026.webp', srcSm: 'wstyle/seq/mobile-hd/0026.webp', alt: 'El local', caption: 'El local' },
  { id: 'trono', src: 'wstyle/seq/desktop-hd/0100.webp', srcSm: 'wstyle/seq/mobile-hd/0100.webp', alt: 'Tu trono', caption: 'Tu trono' },
];

describe('flechas del inicio (SPEC-61)', () => {
  it('con una sola pantalla no hay flechas (AC-11)', () => {
    expect(renderToStaticMarkup(<HeroNav index={0} count={1} caption="Portada" onPrev={noop} onNext={noop} onArm={noop} />)).toBe('');
  });
  it('dos botones accesibles, grupo carrusel y estado anunciado (AC-03, AC-10)', () => {
    const html = renderToStaticMarkup(<HeroNav index={1} count={4} caption="El local" onPrev={noop} onNext={noop} onArm={noop} />);
    expect(html).toContain('aria-roledescription="carrusel"');
    expect(html).toMatch(/<button type="button" class="hero-nav__btn hero-nav__btn--prev" aria-label="Pantalla anterior"/);
    expect(html).toMatch(/<button type="button" class="hero-nav__btn hero-nav__btn--next" aria-label="Pantalla siguiente"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Pantalla 2 de 4: El local');
  });
  it('sin armar, el hero queda igual que antes: solo el barbero y el fuego (AC-08)', () => {
    const html = renderToStaticMarkup(<HeroFire name="WS Style" slides={slides} />);
    expect(html).toContain('class="hero-fx"');
    expect(html).not.toContain('hero-slide');
    expect(html).toContain('/wstyle/hero/barbero.webp 1100w');
  });
  it('armado: monta las tomas (celular/computador); el retrato no se funde hasta que la elegida cargue', () => {
    const html = renderToStaticMarkup(<HeroFire name="WS Style" slides={slides} armed active="trono" />);
    expect(html).toContain('class="hero-fx"');                // sin is-away: la toma aún no carga
    expect(html).not.toContain('is-active');
    expect(html).toContain('class="hero-slide" data-slide="trono"');
    expect(html).toContain('class="hero-slide" data-slide="local"');
    expect(html).toContain('srcSet="/wstyle/seq/mobile-hd/0100.webp"');
    expect(html).toContain('src="/wstyle/seq/desktop-hd/0100.webp"');
    expect(html).toMatch(/<canvas[^>]*class="hero-fire"/);   // el fuego sigue ahí
  });
});

// Handlers reales: HeroNav no usa hooks, así que se puede llamar como función y disparar los props de sus botones.
type El = ReactElement<{ children?: unknown; onClick?: () => void; onKeyDown?: (e: unknown) => void; 'data-hero-nav'?: string }>;
const find = (el: El, key: string): El | undefined => {
  if (el?.props?.['data-hero-nav'] === key) return el;
  for (const c of [el?.props?.children].flat()) { const f = c && typeof c === 'object' ? find(c as El, key) : undefined; if (f) return f; }
};
describe('flechas: qué hace cada una (AC-03, AC-04, AC-10)', () => {
  const setup = () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    const tree = HeroNav({ index: 0, count: 4, caption: 'Portada', onPrev, onNext, onArm: noop }) as El;
    return { tree, onPrev, onNext };
  };
  it('la derecha avanza y la izquierda retrocede', () => {
    const { tree, onPrev, onNext } = setup();
    find(tree, 'next')!.props.onClick!();
    expect(onNext).toHaveBeenCalledTimes(1); expect(onPrev).not.toHaveBeenCalled();
    find(tree, 'prev')!.props.onClick!();
    expect(onPrev).toHaveBeenCalledTimes(1); expect(onNext).toHaveBeenCalledTimes(1);
  });
  it('con foco en las flechas, ← retrocede y → avanza; otras teclas no hacen nada', () => {
    const { tree, onPrev, onNext } = setup();
    const key = (k: string) => { const e = { key: k, preventDefault: vi.fn() }; tree.props.onKeyDown!(e); return e; };
    expect(key('ArrowRight').preventDefault).toHaveBeenCalled(); expect(onNext).toHaveBeenCalledTimes(1);
    key('ArrowLeft'); expect(onPrev).toHaveBeenCalledTimes(1);
    expect(key('ArrowDown').preventDefault).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledTimes(1); expect(onPrev).toHaveBeenCalledTimes(1);
  });
});
