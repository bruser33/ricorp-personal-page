import { describe, expect, it } from 'vitest';
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
  it('armado y en otra pantalla: monta las tomas (celular/computador), marca la activa y funde el retrato', () => {
    const html = renderToStaticMarkup(<HeroFire name="WS Style" slides={slides} armed active="trono" />);
    expect(html).toContain('class="hero-fx is-away"');
    expect(html).toContain('class="hero-slide is-active" data-slide="trono"');
    expect(html).toContain('class="hero-slide" data-slide="local"');
    expect(html).toContain('srcSet="/wstyle/seq/mobile-hd/0100.webp"');
    expect(html).toContain('src="/wstyle/seq/desktop-hd/0100.webp" alt="Tu trono"');
    expect(html).toMatch(/<canvas[^>]*class="hero-fire"/);   // el fuego sigue ahí
  });
});
