import { useEffect } from 'react';

// Movimiento (SPEC-15 AC-07, PR #9 D3/D11):
// - Lenis: scroll suave con inercia, SIN snap a secciones (cada golpe de rueda avanza libre).
// - Titulares: revelado por TIEMPO, una sola vez, al entrar en vista (~700 ms escalonado por palabra, estilo Obys).
//   Nunca quedan a medio revelar porque no dependen de la posición del scroll. El estado inicial oculto lo pone el
//   CSS solo con <html class="motion"> (script del <head>, nunca con prefers-reduced-motion).
// - GSAP ScrollTrigger: salida cinética del titular del hero (se abre y sube al bajar).
// La secuencia/cámara leen scrollY, que Lenis anima. Lenis respeta los window.scrollTo externos, así que
// barberia-3d/scripts/verify.mjs puede saltar a las anclas de forma inmediata.
// content: al cambiar (p. ej. secciones que aparecen tras leer el JSON) se vuelven a observar los titulares nuevos.
export function useMotion(active: boolean, content?: unknown) {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      html.classList.remove('motion');
      return;
    }
    if (!active) return;
    // Revelado por tiempo al entrar en vista
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: .1 });
    document.querySelectorAll('.kinetic:not(.is-in)').forEach((h) => {
      h.querySelectorAll<HTMLElement>('.kinetic__word').forEach((w, i) => w.style.setProperty('--wd', `${i * 45}ms`));
      io.observe(h);
    });
    let cleanup: (() => void) | null = null, cancelled = false;
    void Promise.all([import('lenis'), import('gsap'), import('gsap/ScrollTrigger')]).then(([{ default: Lenis }, { gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: .1, smoothWheel: true, wheelMultiplier: .9 });
      const raf = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0);
      lenis.on('scroll', ScrollTrigger.update);
      const ctx = gsap.context(() => {
        const h1 = document.querySelector('#hero h1');
        if (h1) gsap.to(h1, { letterSpacing: '.05em', yPercent: -16, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
      });
      cleanup = () => { ctx.revert(); gsap.ticker.remove(raf); lenis.destroy(); };
    });
    return () => { cancelled = true; io.disconnect(); cleanup?.(); };
  }, [active, content]);
}
