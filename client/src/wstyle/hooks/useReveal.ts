import { useEffect } from 'react';

// Entrada de texto: IntersectionObserver añade .in a cada .reveal (con retardo escalonado por sección).
// Con prefers-reduced-motion se muestran de inmediato.
export function useReveal(deps: unknown[]) {
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>('.reveal')];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) { items.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: .15 });
    for (const sec of document.querySelectorAll('main section')) sec.querySelectorAll<HTMLElement>('.reveal').forEach((e, i) => {
      e.style.setProperty('--d', `${Math.min(i, 6) * .08}s`);
      if (!e.classList.contains('in')) io.observe(e);
    });
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
