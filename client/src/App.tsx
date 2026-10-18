import { useState, useEffect, useRef } from 'react';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { useReveal } from './hooks/useReveal';
import { introTotalMs } from './intro';
import { glideToSection, isGliding, prefersReducedMotion } from './lib/glideTo';
import { usePagina } from './lib/rutas';
import './App.css';

/* Scroll-driven morph of body::before "Blue Light" blob.
   Stops match Figma Smart Animate scale_factor deltas:
   Hero 1 → Projects 2.27 → Contact. (La parada de News 5.7 se fue con la
   sección: desde SPEC-18 la trayectoria es una vista superpuesta, no scroll.)
   El array va en ORDEN DE DOCUMENTO (el barrido de abajo asume que cada parada
   está más abajo que la anterior); cada escala viaja con SU sección, no con la
   posición, así que reordenar secciones es reordenar este array y nada más.
   Una parada cuya sección no existe se ignora (así sacar una sección no rompe
   el orden del barrido).
   `edge: 'mid'` ancla la parada a la MITAD de la sección en vez de a su borde
   superior. Contacto lleva dos paradas iguales (borde y mitad) para que el
   blob se quede QUIETO detrás del título mientras la escena está en vista:
   con la sección enganchada, el pliegue (mitad del viewport) cae entre esas
   dos paradas.
   `bump` es el recorrido lateral del tramo que ENTRA a esa parada: el blob sale
   hacia la derecha y vuelve justo cuando aparece "Let's start a new .project"
   (ver el sin(πt) abajo; en el video ese cruce dura ~1.5 s).
   `anchor` reemplaza x/y fijos: la parada se calcula para que el CENTRO del
   blob caiga sobre el centro de ese elemento con la sección enganchada. Antes
   contacto iba con y=-800 y escala 0.18 — un círculo de 86px por encima del
   borde del viewport, o sea que el glow "noisy" del video no se veía.
   `opacity` queda como palanca por parada (hoy todas valen 1). */
type BlobStop = {
  id: string;
  edge?: 'top' | 'mid';
  scale: number;
  x?: number;
  y?: number;
  anchor?: string;
  opacity: number;
  bump?: number;
};

/* Posición de layout en el documento sumando offsetTop/Left: los rects
   mienten mientras corren las transiciones de entrada (translateY, scale). */
function docOffset(el: HTMLElement) {
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { top, left };
}

/* `pagina` re-arma el morph al cambiar de página: las paradas se buscan por id
   y cada página tiene otras secciones (en /contacto solo queda la de contacto,
   así que el glow se queda quieto detrás del título). */
function useBlobMorph(enabled: boolean, pagina: string) {
  useEffect(() => {
    if (!enabled) return;
    /* Ya no se cede a la scroll-timeline nativa en Chromium: sus keyframes se
       reparten sobre el scroll total y las secciones no miden lo mismo, así que
       la coreografía caía en la sección equivocada (ver la nota larga en
       index.css). Este camino lee el offsetTop real y acierta siempre. */
    /* Con movimiento reducido NO se sale de una: el apagado del blob sigue
       corriendo y lo único que se omite es la coreografía de transform (escala,
       viaje vertical y el bump lateral). Un fade de opacidad no es movimiento
       vestibular, y si acá se retornaba temprano el blob quedaba encendido
       adentro de Análisis — justo el fondo que el requerimiento pide limpio —
       porque nadie escribía --blob-opacity nunca. */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    /* Escala del glow en contacto: en el video el círculo mide ~40 % del ancho
       del viewport; la caja base de 480px con su gradiente da ~440px de
       diámetro visible, así que 1.3 lo deja en ~570px a 1440. */
    const contactGlow = { scale: 1.3, anchor: '.contact-headline', opacity: 1 };
    const stops: BlobStop[] = [
      { id: 'home', scale: 1.0, y: 0, opacity: 1 },
      { id: 'about', scale: 2.27, y: 0, opacity: 1 },
      { id: 'contact', ...contactGlow, bump: 620 },
      { id: 'contact', edge: 'mid', ...contactGlow },
      /* Página Trayectoria: como en el Figma, lo primero que se ve es el glow
         al centro, detrás de donde aparece la portada. */
      { id: 'trayectoria', scale: 1.6, anchor: '.news-featured__media', opacity: 1 },
    ];
    const grain = document.querySelector<HTMLElement>('.blob-grain');
    const header = () =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const fold = window.scrollY + window.innerHeight * 0.5;
      /* Centro base del blob en el viewport: .blob-grain comparte caja y
         posición con body::before (las dos leen --blob-cx/--blob-cy). */
      const baseCx = grain ? grain.offsetLeft + grain.offsetWidth / 2 : 0;
      const baseCy = grain ? grain.offsetTop + grain.offsetHeight / 2 : 0;
      const positions = stops.flatMap((s) => {
        const el = document.getElementById(s.id);
        if (!el) return [];
        let { x = 0, y = 0 } = s;
        if (s.anchor) {
          const target = el.querySelector<HTMLElement>(s.anchor);
          if (target && grain) {
            const snapped = el.offsetTop - header();
            const o = docOffset(target);
            x = o.left + target.offsetWidth / 2 - baseCx;
            y = o.top + target.offsetHeight / 2 - snapped - baseCy;
          }
        }
        const top = el.offsetTop + (s.edge === 'mid' ? el.offsetHeight / 2 : 0);
        return [{ ...s, x, y, top }];
      });
      if (!positions.length) return;
      let a = positions[0];
      let b = positions[0];
      for (let i = 0; i < positions.length - 1; i++) {
        if (fold >= positions[i].top && fold <= positions[i + 1].top) {
          a = positions[i];
          b = positions[i + 1];
          break;
        }
        if (fold > positions[i + 1].top) {
          a = b = positions[i + 1];
        }
      }
      const span = Math.max(1, b.top - a.top);
      const t = Math.min(1, Math.max(0, (fold - a.top) / span));
      const scale = a.scale + (b.scale - a.scale) * t;
      const y = a.y + (b.y - a.y) * t;
      /* Ida y vuelta lateral. sin(πt) y no una interpolación: vale 0 en los dos
         extremos del tramo y 1 en el medio, así que el círculo sale hacia la
         derecha y REGRESA exactamente al lugar de donde salió, sin saltos en los
         bordes del tramo ni estado que resetear. */
      const x = a.x + (b.x - a.x) * t + (b.bump && a !== b ? b.bump * Math.sin(Math.PI * t) : 0);
      /* La opacidad NO va lineal: con t³ el fade se concentra en el final del
         tramo, así que el blob acompaña la escena de contacto y recién se
         apaga justo antes de que entre Análisis. En los tramos donde las dos
         paradas tienen la misma opacidad la curva no cambia nada. */
      const fade = t * t * t;
      const opacity = a.opacity + (b.opacity - a.opacity) * fade;
      document.body.style.setProperty('--blob-opacity', opacity.toFixed(3));
      if (reduced) return;
      document.body.style.setProperty('--blob-scale', scale.toFixed(3));
      document.body.style.setProperty('--blob-y', `${y.toFixed(1)}px`);
      document.body.style.setProperty('--blob-x', `${x.toFixed(1)}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    tick();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [enabled, pagina]);
}

/* "Movie" auto-advance: once the hero intro has finished (title + face settled,
   "Software {development}" revealed), the FIRST interaction — a scroll in ANY
   direction, a key, or a click — glides the page down to the projects section
   ONE time, so the site plays like a film instead of waiting for the user to find
   the carousel. Fires once, only while still in the hero, and never with reduced
   motion. El viaje es el deslizamiento propio de glideToSection (SPEC-21): ~2.3 s
   con ease-out, el slider sube desde abajo como en el prototipo. */
function useAutoAdvanceToProjects(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (prefersReducedMotion()) return;

    let armed = false;
    let fired = false;
    // Arm only after the intro choreography has played out. Va SIEMPRE por
    // detrás del beat B (ver introTotalMs); si no, el primer scroll se lleva la
    // página a proyectos antes de que el subtítulo llegue a verse.
    // El +150 es un respiro para que el ojo registre el fin del intro antes de
    // que el primer gesto se lleve la página.
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, introTotalMs() + 150);

    const advance = (e: Event) => {
      // Si ya hay un deslizamiento en curso (p.ej. el link "about" del header),
      // no se dispara otro encima.
      if (!armed || fired || isGliding()) return;
      // Never hijack a click on an interactive control (nav links, language
      // toggle, buttons, carousel tabs) — the user's own action must win. A click
      // on empty hero space still triggers the "movie" advance, alongside
      // scroll/key gestures.
      if (e.type === 'click') {
        const el = e.target as Element | null;
        if (el?.closest?.('a, button, input, textarea, select, [role="tab"]')) return;
      }
      // Only auto-advance from the hero itself — if the user already scrolled
      // away, leave them be.
      if (window.scrollY > window.innerHeight * 0.5) {
        cleanup();
        return;
      }
      if (e.type === 'wheel' || e.type === 'touchmove' || e.type === 'keydown') {
        e.preventDefault();
      }
      fired = true;
      glideToSection('about');
      cleanup();
    };

    const onKey = (e: KeyboardEvent) => {
      const advanceKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End'];
      if (advanceKeys.includes(e.key)) advance(e);
    };

    const wheelOpts: AddEventListenerOptions = { passive: false };
    function cleanup() {
      window.clearTimeout(armTimer);
      window.removeEventListener('wheel', advance, wheelOpts);
      window.removeEventListener('touchmove', advance, wheelOpts);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', advance);
    }

    window.addEventListener('wheel', advance, wheelOpts);
    window.addEventListener('touchmove', advance, wheelOpts);
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', advance);

    return cleanup;
  }, [enabled]);
}

/* Snap direccional. El snap CSS es `proximity` y la rueda podía dejar la página
   a mitad de camino entre dos secciones (p.ej. scrollY 1220 con el slider en 820
   y contacto en 1640): se veía la parte vacía de las dos — "bajo y parece que no
   hay nada". Cuando el scroll TERMINA fuera de un punto de sección, se completa
   el recorrido hacia la siguiente en la dirección en que iba. No se usó
   `mandatory`: devuelve a la sección actual cualquier gesto corto y no se pudo
   verificar con una rueda real. Solo desktop (en mobile las secciones pueden ser
   más altas que la pantalla), sin movimiento reducido, solo en el inicio (App
   lo apaga en las otras páginas) y nunca encima de un deslizamiento en curso (glideTo). */
function useDirectionalSnap(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const desktop = window.matchMedia('(min-width: 721px)');
    let lastY = window.scrollY;
    let dir = 0;
    let timer = 0;
    let snapping = false;
    const points = () => {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return ['home', 'about', 'contact']
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el)
        .map((el) => Math.min(max, Math.max(0, el.offsetTop - pad)));
    };
    const settle = () => {
      if (snapping) {
        snapping = false;
        return;
      }
      if (!desktop.matches || prefersReducedMotion() || isGliding()) return;
      const y = window.scrollY;
      const ps = points();
      if (ps.some((p) => Math.abs(p - y) <= 2)) return;
      const target = dir >= 0 ? ps.find((p) => p > y) : [...ps].reverse().find((p) => p < y);
      if (target === undefined) return;
      snapping = true;
      window.scrollTo({ top: target, behavior: 'smooth' });
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (y !== lastY) dir = y > lastY ? 1 : -1;
      lastY = y;
      /* `scrollend` no está en todos los navegadores: un respiro de 160ms sin
         eventos de scroll cumple el mismo papel. */
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 160);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [enabled]);
}

/* El blob global vive en body::before, fuera del árbol de React, así que no
   alcanza con la clase del wrapper: marcamos el propio <body> para que arranque
   su fade del beat B (ver index.css). */
function useBodyLit(enabled: boolean) {
  useEffect(() => {
    document.body.classList.toggle('site-lit', enabled);
    return () => document.body.classList.remove('site-lit');
  }, [enabled]);
}

/* Al cambiar de página se arranca arriba (instant: html tiene scroll-behavior
   smooth y si no se vería un barrido). La primera carga no se toca. */
function useArribaAlCambiar(pagina: string) {
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pagina]);
}

export default function App() {
  const [siteReady, setSiteReady] = useState(false);
  const pagina = usePagina();
  const enInicio = pagina === 'inicio';
  useArribaAlCambiar(pagina);
  useBodyLit(siteReady);
  // Re-armar los reveals por página: los nodos de la página nueva nacen después.
  useReveal(siteReady, pagina);
  useBlobMorph(siteReady, pagina);
  // El auto-avance y el snap direccional son coreografía del home.
  useAutoAdvanceToProjects(siteReady && enInicio);
  useDirectionalSnap(siteReady && enInicio);

  return (
    <>
      <Splash onDone={() => setSiteReady(true)} />
      {/* Grano del blob global. Va acá, ANTES del wrapper de contenido, porque el
          orden del DOM es lo que lo mantiene por debajo de la página — ver la
          nota larga de .blob-grain en index.css, que explica por qué no puede
          ser un pseudo-elemento del body. */}
      <div className={`blob-grain ${siteReady ? 'is-lit' : ''}`} aria-hidden="true" />
      <div className={siteReady ? 'site-ready' : 'site-pre'} aria-hidden={!siteReady}>
        <Header introDone={siteReady} />
        {/* Una página por ruta (lib/rutas.ts): Inicio (hero + proyectos),
            Contacto y Trayectoria. Contacto y Trayectoria eran una sección del
            home y una vista con #hash; ahora tienen URL propia. `key` remonta
            <main> al cambiar, así cada página arranca con sus animaciones de
            entrada. Si se reordenan secciones del home, revisar las paradas de
            useBlobMorph (van en orden de documento) y el snap de index.css. */}
        <main key={pagina}>
          {enInicio && (
            <>
              <Hero startAnim={siteReady} />
              <Projects />
            </>
          )}
          {/* Contacto y Trayectoria se montan recién cuando terminó el splash:
              sus entradas (título, orbe, campo, portada) arrancan al montar, y en
              un link directo o una recarga correrían escondidas detrás de él. */}
          {pagina === 'contacto' && siteReady && <Contact />}
          {pagina === 'trayectoria' && siteReady && <News />}
        </main>
      </div>
    </>
  );
}
