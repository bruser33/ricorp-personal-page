import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

/* Three top-level screens ("pantallas"): the home reel (hero + IT projects),
   the timeline, and contact. Navigation between them plays a cinematic
   fade-to-black → rebuild transition — the "movie" effect from the design
   video. Deep-linkable via the URL hash (#/, #/timeline, #/contact). */
export type View = 'home' | 'timeline' | 'contact';

/* Overlay phase: 'in' covers the screen to black, 'out' rebuilds the next view. */
export type Phase = 'idle' | 'in' | 'out';

type NavOptions = { scrollTo?: string };

type Ctx = {
  view: View;
  phase: Phase;
  navigate: (target: View, opts?: NavOptions) => void;
};

const ViewContext = createContext<Ctx | null>(null);

const HASH_TO_VIEW: Record<string, View> = {
  '': 'home',
  '#/': 'home',
  '#/home': 'home',
  '#/timeline': 'timeline',
  '#/contact': 'contact',
};
const VIEW_TO_HASH: Record<View, string> = {
  home: '#/',
  timeline: '#/timeline',
  contact: '#/contact',
};

// Must match the overlay opacity transitions in App.css.
const COVER_MS = 480;
const HOLD_MS = 700;

function readHashView(): View {
  if (typeof window === 'undefined') return 'home';
  return HASH_TO_VIEW[window.location.hash] ?? 'home';
}

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(readHashView);
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<number[]>([]);
  const pendingScroll = useRef<string | null>(null);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const applyScroll = useCallback(() => {
    const anchor = pendingScroll.current;
    pendingScroll.current = null;
    if (anchor) {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const swap = useCallback(
    (target: View) => {
      setView(target);
      // Position the fresh view before it's revealed (next two frames = painted).
      requestAnimationFrame(() => requestAnimationFrame(applyScroll));
    },
    [applyScroll]
  );

  const navigate = useCallback(
    (target: View, opts?: NavOptions) => {
      pendingScroll.current = opts?.scrollTo ?? null;
      if (window.location.hash !== VIEW_TO_HASH[target]) {
        history.replaceState(null, '', VIEW_TO_HASH[target]);
      }
      // Same view → just honor the scroll intent (e.g. "Proyectos TI" from home).
      if (target === view) {
        applyScroll();
        return;
      }
      if (prefersReduced()) {
        swap(target);
        return;
      }
      clearTimers();
      setPhase('in'); // cover to black
      timers.current.push(
        window.setTimeout(() => {
          swap(target);
          setPhase('out'); // rebuild the new view
        }, COVER_MS)
      );
      timers.current.push(
        window.setTimeout(() => setPhase('idle'), COVER_MS + HOLD_MS)
      );
    },
    [view, applyScroll, swap]
  );

  // Expose the current view to CSS (per-view background theming).
  useEffect(() => {
    document.body.dataset.view = view;
  }, [view]);

  // Browser back/forward through the hash.
  useEffect(() => {
    const onHash = () => {
      const target = readHashView();
      setView((cur) => (cur === target ? cur : target));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => () => clearTimers(), []);

  return (
    <ViewContext.Provider value={{ view, phase, navigate }}>
      {children}
    </ViewContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used within ViewProvider');
  return ctx;
}
