import { useEffect, useState } from 'react';
import { loadContent, type Content } from '../content';

// Contenido del sitio. Arranca con el contenido prerenderizado (el mismo con el que se generó el HTML, así la
// hidratación no difiere) y luego lee los JSON en runtime: el dueño edita precios/textos sin tocar código.
export function useContent(initial: Content | null) {
  const [content, setContent] = useState<Content | null>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    loadContent('./').then((c) => { if (alive) { setContent(c); setLoaded(true); } }, (e) => {
      console.error('No se pudo cargar el contenido; queda el contenido prerenderizado.', e);
      if (alive) setLoaded(true);
    });
    return () => { alive = false; };
  }, []);
  return { content, loaded };
}
