/* Deslizamiento "de película" hacia una sección (SPEC-21).

   El prototipo de Figma pasa del hero a Proyectos con UN solo deslizamiento
   continuo de ~2.3 s: el hero y el slider suben juntos y el slider asoma por el
   borde inferior. `scrollIntoView({behavior:'smooth'})` no sirve para eso: dura
   ~0.6 s con la curva del navegador y además pelea con el scroll-snap del html.

   Curva: easeOutQuad, 2300 ms. Ajustada contra la tabla medida del video
   (borde superior de la card activa cada 0.2 s): rms 4.9 px sobre 618 px de
   alto, error máximo 8 px. Las curvas "más fuertes" (easeOutCubic,
   cubic-bezier(.25,.6,.3,1)) dan rms > 40 px: el video frena más parejo. */

export const GLIDE_MS = 2300;

/* Momento en que los dots del slider empiezan a aparecer. En el video el
   deslizamiento arranca a los 9.43 s y los dots asoman entre 10.5 y 11.0 s
   (≈1.1–1.6 s adentro); el fade de 500 ms vive en Projects.css. */
const DOTS_FADE_AT_MS = 1100;
const DOTS_HIDDEN_CLASS = 'glide-dots-hidden';

const SCROLL_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End'];

const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);

let gliding = false;
let cancelCurrent: (() => void) | null = null;

export function isGliding() {
  return gliding;
}

/* Corta el deslizamiento en curso y devuelve snap/smooth al CSS. Lo usan los
   otros links del header: si no, el deslizamiento pisa su destino y la página
   termina en Proyectos con el hash equivocado. */
export function cancelGlide() {
  cancelCurrent?.();
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* Dónde deja la sección el propio navegador al anclar: su top de layout menos
   el scroll-padding-top del html (el header fijo). offsetTop y no rect: los
   reveals y transforms de la página mienten en el rect. */
function sectionTop(el: HTMLElement) {
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    top += n.offsetTop;
  }
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(max, top - pad));
}

/* Desliza hasta la sección `id`. Devuelve false si no arrancó (ya hay un
   deslizamiento en curso o la sección no existe). Con movimiento reducido salta
   directo, sin animación. */
export function glideToSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el || gliding) return false;

  if (prefersReducedMotion()) {
    window.scrollTo({ top: sectionTop(el), behavior: 'instant' });
    return true;
  }

  gliding = true;
  const html = document.documentElement;
  // Snap y smooth del html pelean con un scroll escrito frame a frame: se
  // suspenden inline y se devuelven al CSS (cadena vacía) al terminar.
  html.style.scrollSnapType = 'none';
  html.style.scrollBehavior = 'auto';
  html.classList.add(DOTS_HIDDEN_CLASS);

  // Wheel/touch/teclas extra no cortan ni duplican el deslizamiento.
  const block = (e: Event) => {
    if (e.type === 'keydown' && !SCROLL_KEYS.includes((e as KeyboardEvent).key)) return;
    e.preventDefault();
  };
  const opts: AddEventListenerOptions = { passive: false, capture: true };
  window.addEventListener('wheel', block, opts);
  window.addEventListener('touchmove', block, opts);
  window.addEventListener('keydown', block, opts);

  const from = window.scrollY;
  const start = performance.now();
  const dotsTimer = window.setTimeout(() => html.classList.remove(DOTS_HIDDEN_CLASS), DOTS_FADE_AT_MS);

  let cancelled = false;
  const finish = () => {
    window.clearTimeout(dotsTimer);
    html.classList.remove(DOTS_HIDDEN_CLASS);
    html.style.scrollSnapType = '';
    html.style.scrollBehavior = '';
    window.removeEventListener('wheel', block, opts);
    window.removeEventListener('touchmove', block, opts);
    window.removeEventListener('keydown', block, opts);
    gliding = false;
    cancelCurrent = null;
  };
  cancelCurrent = () => {
    cancelled = true;
    finish();
  };

  const frame = (now: number) => {
    if (cancelled) return;
    const p = Math.min(1, Math.max(0, (now - start) / GLIDE_MS));
    // El destino se relee cada frame: si una imagen termina de cargar y mueve
    // el layout, el deslizamiento igual aterriza en la sección.
    const to = sectionTop(el);
    window.scrollTo(0, from + (to - from) * easeOutQuad(p));
    if (p < 1) {
      requestAnimationFrame(frame);
      return;
    }
    finish();
  };
  requestAnimationFrame(frame);
  return true;
}
