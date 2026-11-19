import type { KeyboardEvent } from 'react';
import './HeroNav.css';

interface Props { index: number; count: number; caption: string; onPrev: () => void; onNext: () => void; onArm: () => void }

// SPEC-61: flechas del inicio (una a cada lado, simétricas). Solo con más de una pantalla (RN-12). Son <button> con
// etiqueta; ←/→ funcionan solo con el foco en las flechas (no se capturan globalmente: Lenis y el resto de la página
// siguen igual). El primer hover/foco/toque "arma" la carga de las imágenes de las otras pantallas.
export default function HeroNav({ index, count, caption, onPrev, onNext, onArm }: Props) {
  if (count < 2) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
  };
  return (
    <div className="hero-nav" role="group" aria-roledescription="carrusel" aria-label="Pantallas del inicio"
      onKeyDown={onKey} onPointerEnter={onArm} onFocus={onArm} onTouchStart={onArm}>
      <button type="button" className="hero-nav__btn hero-nav__btn--prev" aria-label="Pantalla anterior" data-hero-nav="prev" onClick={onPrev}>
        <Chevron dir="left" />
      </button>
      <button type="button" className="hero-nav__btn hero-nav__btn--next" aria-label="Pantalla siguiente" data-hero-nav="next" onClick={onNext}>
        <Chevron dir="right" />
      </button>
      <p className="hero-nav__live" aria-live="polite" aria-atomic="true" data-hero-nav="status">{`Pantalla ${index + 1} de ${count}: ${caption}`}</p>
    </div>
  );
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg className="hero-nav__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <polyline points={dir === 'left' ? '15 4 7 12 15 20' : '9 4 17 12 9 20'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
