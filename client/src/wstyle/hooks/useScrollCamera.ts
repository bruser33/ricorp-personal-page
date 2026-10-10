import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Experience, type Mode, type Renderer3D } from '../experience';
import type { Content } from '../content';

interface Options {
  seqCanvas: RefObject<HTMLCanvasElement | null>;
  main: RefObject<HTMLElement | null>;
  progressBar: RefObject<HTMLSpanElement | null>;
  content: Content | null;
  contentLoaded: boolean;
}

// Recorrido ligado al scroll: crea el motor (cámara + secuencia/3D + window.__site) al montar y lo libera al
// desmontar. El estado de React solo cambia en eventos discretos (modo, progreso de carga, sección activa,
// nav con fondo); la barra de progreso se actualiza por ref para no re-renderizar en cada scroll.
export function useScrollCamera({ seqCanvas, main, progressBar, content, contentLoaded }: Options) {
  const exp = useRef<Experience | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const force3d = new URLSearchParams(location.search).get('mode') === '3d';
    const e = new Experience({
      seqCanvas: seqCanvas.current!, main: main.current!,
      sections: [...main.current!.querySelectorAll<HTMLElement>('section[data-shot]')],
      reduced, force3d,
      onProgress: setProgress, onMode: setMode, onReady: () => setReady(true), onActive: setActive,
      onScroll: (y, max) => {
        if (progressBar.current) progressBar.current.style.transform = `scaleX(${Math.min(1, y / max)})`;
        setScrolled(y > 24);
      },
    });
    exp.current = e;
    return () => { e.dispose(); exp.current = null; };
  }, [seqCanvas, main, progressBar]);

  // El motor marca "listo" cuando el contenido runtime ya está aplicado (alturas y anclas finales).
  useEffect(() => { if (contentLoaded) exp.current?.setContent(content); }, [content, contentLoaded]);

  const setRenderer3D = useCallback((r: Renderer3D | null) => exp.current?.setRenderer3D(r), []);
  return { mode, progress, ready, active, scrolled, setRenderer3D };
}
