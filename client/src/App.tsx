import { useState, useEffect } from 'react';
import { Splash } from './components/Splash';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Projects } from './components/Projects';
import { News } from './components/News';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import { useReveal } from './hooks/useReveal';
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

export default function App() {
  const [siteReady, setSiteReady] = useState(false);
  useReveal(siteReady);
  useBlobMorph(siteReady);

  return (
    <>
      <Splash onDone={() => setSiteReady(true)} />
      <div className={siteReady ? 'site-ready' : 'site-pre'} aria-hidden={!siteReady}>
        <Header />
        <main>
          <Hero startAnim={siteReady} />
          <Projects />
          <News />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  );
}
