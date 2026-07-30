import { useState, useEffect } from 'react';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import { useReveal } from './hooks/useReveal';
import { useView } from './view';
import './App.css';

/* Scroll-driven morph of body::before "Blue Light" blob.
   Stops match Figma Smart Animate scale_factor deltas:
   Hero 1 → Projects 2.27 → News 5.7 → Contact 0.18.
   Skipped on browsers that support scroll-timeline (CSS handles it). */
function useBlobMorph(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const stops: { id: string; scale: number; y: number }[] = [
      { id: 'home', scale: 1.0, y: 0 },
      { id: 'about', scale: 2.27, y: 0 },
      { id: 'news', scale: 5.7, y: -1797 },
      { id: 'contact', scale: 0.18, y: -800 },
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
      document.body.style.setProperty('--blob-scale', scale.toFixed(3));
      document.body.style.setProperty('--blob-y', `${y.toFixed(1)}px`);
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
    // Arm only after the intro choreography has played out (~1.85s of transitions).
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 2000);

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

export default function App() {
  const [siteReady, setSiteReady] = useState(false);
  const { view, phase } = useView();
  const onHome = view === 'home';
  // Re-arm reveals on every view swap so each screen "builds" on entry.
  useReveal(siteReady, 0.12, view);
  // Blob morph + movie auto-advance only make sense on the scrollable home reel.
  useBlobMorph(siteReady && onHome);
  useAutoAdvanceToProjects(siteReady && onHome);

  return (
    <>
      <Splash onDone={() => setSiteReady(true)} />
      <div className={siteReady ? 'site-ready' : 'site-pre'} aria-hidden={!siteReady}>
        <Header />
        <main>
          {view === 'home' && (
            <>
              <Hero startAnim={siteReady} />
              <Projects />
            </>
          )}
          {view === 'timeline' && <News />}
          {view === 'contact' && <Contact />}
        </main>
        {view !== 'contact' && <Footer />}
      </div>

      {/* Always mounted so the opacity 0→1 cover actually animates on entry. */}
      <div className={`view-transition is-${phase}`} aria-hidden="true">
        <div className="view-transition-orb" />
      </div>
    </>
  );
}
