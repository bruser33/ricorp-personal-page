import { useEffect } from 'react';

// Movimiento (SPEC-15 AC-07): Lenis (scroll suave con inercia) + GSAP ScrollTrigger para revelar los titulares
// palabra por palabra por tramo y la tipografía cinética del hero. La secuencia/cámara leen scrollY, que Lenis
// anima: el frame sale del mismo progreso de scroll. Con prefers-reduced-motion no se carga nada de esto.
// Determinismo para tests: Lenis respeta los window.scrollTo externos (sincroniza su estado con el scroll nativo
// cuando no está animando), así barberia-3d/scripts/verify.mjs sigue saltando a las anclas de forma inmediata.
export function useMotion(active: boolean) {
  useEffect(() => {
    if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cleanup: (() => void) | null = null, cancelled = false;
    void Promise.all([import('lenis'), import('gsap'), import('gsap/ScrollTrigger')]).then(([{ default: Lenis }, { gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: .1, smoothWheel: true });
      const raf = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0);
      lenis.on('scroll', ScrollTrigger.update);
      const ctx = gsap.context(() => {
        for (const h of document.querySelectorAll<HTMLElement>('.kinetic')) {
          const words = h.querySelectorAll('.kinetic__word'), sec = h.closest('section');
          if (h.tagName === 'H1') {
            // Entrada del hero y salida cinética: al bajar, el titular se abre y sube.
            gsap.from(words, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: .06, delay: .15 });
            gsap.to(h, { letterSpacing: '.06em', yPercent: -18, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true } });
          } else {
            // Revelado por tramo: termina antes de que la sección llegue arriba (en el ancla queda completo).
            gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, ease: 'none', stagger: .08, scrollTrigger: { trigger: sec, start: 'top 88%', end: 'top 30%', scrub: .5 } });
          }
        }
      });
      cleanup = () => { ctx.revert(); gsap.ticker.remove(raf); lenis.destroy(); };
    });
    return () => { cancelled = true; cleanup?.(); };
  }, [active]);
}
