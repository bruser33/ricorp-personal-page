import { useState, useEffect } from 'react';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { useReveal } from './hooks/useReveal';
import './App.css';

/* Scroll-driven morph of body::before "Blue Light" blob.
   Stops match Figma Smart Animate scale_factor deltas:
   Hero 1 → Projects 2.27 → Contact 0.18 → News 5.7.
   El array va en ORDEN DE DOCUMENTO (el barrido de abajo asume que cada parada
   está más abajo que la anterior); cada escala viaja con SU sección, no con la
   posición, así que reordenar secciones es reordenar este array y nada más.
   `bump` es el recorrido lateral del tramo que ENTRA a esa parada: el blob se
   contrae a un solo círculo, se va hacia la derecha y vuelve al mismo lugar
   justo cuando aparece "Let's start a new .project" (ver el sin(πt) abajo).
   Skipped on browsers that support scroll-timeline (CSS handles it). */
function useBlobMorph(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    /* Ya no se cede a la scroll-timeline nativa en Chromium: sus keyframes se
       reparten sobre el scroll total y las secciones no miden lo mismo, así que
       la coreografía caía en la sección equivocada (ver la nota larga en
       index.css). Este camino lee el offsetTop real y acierta siempre. */
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const stops: { id: string; scale: number; y: number; bump?: number }[] = [
      { id: 'home', scale: 1.0, y: 0 },
      { id: 'about', scale: 2.27, y: 0 },
      { id: 'contact', scale: 0.18, y: -800, bump: 620 },
      { id: 'news', scale: 5.7, y: -1797 },
    ];
    let raf = 0;
    const tick = () => {
      raf = 0;
      const fold = window.scrollY + window.innerHeight * 0.5;
      const positions = stops.map((s) => ({
        ...s,
        top: document.getElementById(s.id)?.offsetTop ?? 0,
      }));
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
      const x = b.bump ? b.bump * Math.sin(Math.PI * t) : 0;
      document.body.style.setProperty('--blob-scale', scale.toFixed(3));
      document.body.style.setProperty('--blob-y', `${y.toFixed(1)}px`);
      document.body.style.setProperty('--blob-x', `${x.toFixed(1)}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);
}

/* Fin del intro del Home = beat B completo, leído de las custom properties que
   definen la coreografía en index.css (--intro-beat-b-delay + --intro-beat-b-dur),
   más un respiro para que el ojo lo registre. Se lee en runtime a propósito: si
   se duplicaran los números acá, retocar la coreografía en el CSS dejaría el
   auto-advance armándose en pleno intro sin que nada fallara.
   Las custom properties se serializan tal cual se escribieron (el navegador NO
   las normaliza), así que hay que interpretar la unidad a mano: "4850ms" y
   "4.85s" son ambos válidos, y un número pelado se toma como ms — leerlo como
   segundos daría 4.850.000ms y el auto-advance no se armaría nunca. */
const INTRO_MS_MAX = 30_000; // cota de sanidad: nada del intro dura medio minuto

function readMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  const ms = raw.endsWith('ms') || !raw.endsWith('s') ? n : n * 1000;
  return ms > INTRO_MS_MAX ? fallback : ms;
}

function introTotalMs(): number {
  return readMs('--intro-beat-b-delay', 4850) + readMs('--intro-beat-b-dur', 1000) + 150;
}

/* "Movie" auto-advance: once the hero intro has finished (title + face settled,
   "Software {development}" revealed), the FIRST interaction — a scroll in ANY
   direction, a key, or a click — glides the page down to the projects section
   ONE time, so the site plays like a film instead of waiting for the user to find
   the carousel. Fires once, only while still in the hero, and never with reduced
   motion. */
function useAutoAdvanceToProjects(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let armed = false;
    let fired = false;
    // Arm only after the intro choreography has played out. Va SIEMPRE por
    // detrás del beat B (ver introTotalMs); si no, el primer scroll se lleva la
    // página a proyectos antes de que el subtítulo llegue a verse.
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, introTotalMs());

    const advance = (e: Event) => {
      if (!armed || fired) return;
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
      document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

/* El blob global vive en body::before, fuera del árbol de React, así que no
   alcanza con la clase del wrapper: marcamos el propio <body> para que arranque
   su fade del beat B (ver index.css). */
function useBodyLit(enabled: boolean) {
  useEffect(() => {
    document.body.classList.toggle('site-lit', enabled);
    return () => document.body.classList.remove('site-lit');
  }, [enabled]);
}

export default function App() {
  const [siteReady, setSiteReady] = useState(false);
  useBodyLit(siteReady);
  useReveal(siteReady);
  useBlobMorph(siteReady);
  useAutoAdvanceToProjects(siteReady);

  return (
    <>
      <Splash onDone={() => setSiteReady(true)} />
      <div className={siteReady ? 'site-ready' : 'site-pre'} aria-hidden={!siteReady}>
        <Header introDone={siteReady} />
        <main>
          <Hero startAnim={siteReady} />
          <Projects />
          {/* Contact ANTES de News: el recorrido va proyectos → "Let's start a
              new .project" → "Análisis". Si se vuelve a mover, hay que reordenar
              también los stops de useBlobMorph (van en orden de documento) y los
              keyframes de blob-morph en index.css. */}
          <Contact />
          <News />
        </main>
      </div>
    </>
  );
}
