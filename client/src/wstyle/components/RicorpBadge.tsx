import { useEffect, useRef, useState } from 'react';
import './RicorpBadge.css';

// Lo que el badge no puede tapar (SPEC-25): texto de main y paneles sólidos de contenido. La sección "Llega" entera
// cuenta como obstáculo porque ahí la firma es el crédito del footer (nunca dos créditos a la vez).
const OBSTACLES = 'main :is(h1, h2, h3, p, li, address, a.btn, .info, .member, .cards, .policies, #servicios .panel__inner, #llega)';
// Holgura alrededor del badge: no basta con no tocar el texto, tiene que respirar.
const GAP = 8;

// Marca de agua "Powered by RICORP ricorp.cl" (SPEC-11/25): fija abajo a la izquierda. Se desvanece (y sale del
// orden de foco) mientras solaparía texto o un panel sólido; con el menú móvil abierto tampoco aparece (CSS).
// watch: cambia cuando cambia el contenido (re-mide con el DOM nuevo).
export default function RicorpBadge({ watch }: { watch?: unknown }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const badge = ref.current;
    if (!badge) return;
    let raf = 0, settle = 0;
    const update = () => {
      raf = 0;
      // El badge es fixed: su rect no depende del scroll ni de su propia opacidad.
      const b = badge.getBoundingClientRect();
      const l = b.left - GAP, r = b.right + GAP, t = b.top - GAP, btm = b.bottom + GAP;
      const covered = [...document.querySelectorAll<HTMLElement>(OBSTACLES)].some((el) => {
        const e = el.getBoundingClientRect();
        return e.width > 0 && e.height > 0 && e.left < r && e.right > l && e.top < btm && e.bottom > t;
      });
      setHidden(covered);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
      // Los reveals siguen moviendo el texto después del último scroll: una pasada más cuando se asientan.
      clearTimeout(settle); settle = window.setTimeout(update, 450);
    };
    update();
    addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', schedule);
    document.addEventListener('transitionend', schedule); document.addEventListener('animationend', schedule);
    return () => {
      removeEventListener('scroll', schedule); removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', schedule); document.removeEventListener('animationend', schedule);
      cancelAnimationFrame(raf); clearTimeout(settle);
    };
  }, [watch]);
  return (
    <a ref={ref} className={`ricorp-badge${hidden ? ' is-hidden' : ''}`} href="https://ricorp.cl" target="_blank" rel="noopener"
      aria-label="Sitio desarrollado por Ricorp" aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}>
      <span>Powered by</span><img src="/wstyle/brand/ricorp-logo.svg" alt="" width={105} height={24} /><span className="ricorp-badge__domain">ricorp.cl</span>
    </a>
  );
}
