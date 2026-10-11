import { useEffect } from 'react';

// Paneles sólidos sobre la película: cuando un panel (.panel--sheet) ocupa la mitad de la pantalla o más, la
// película queda detrás atenuada al 35 % (<html class="film-dim">). Así nunca hay un "corte a negro".
// Cuenta desde donde arranca el contenido (padding-top): arriba va el degradado que funde la película con el panel.
export function useFilmDim(deps: unknown[]) {
  useEffect(() => {
    const html = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = innerHeight;
      const covered = [...document.querySelectorAll<HTMLElement>('.panel--sheet')].some((s) => {
        const r = s.getBoundingClientRect(), top = r.top + (parseFloat(getComputedStyle(s).paddingTop) || 0);
        return Math.min(h, r.bottom) - Math.max(0, top) >= h * .5;
      });
      html.classList.toggle('film-dim', covered);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(raf); html.classList.remove('film-dim'); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
