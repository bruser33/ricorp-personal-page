import { useEffect, useState } from 'react';
import { API_BASE } from '../agenda/api';
import { loadCatalog, loadContent, mergeCatalog, type Content } from '../content';

// Contenido del sitio. Arranca con el contenido prerenderizado (el mismo con el que se generó el HTML, así la
// hidratación no difiere) y luego lee los JSON en runtime. Desde SPEC-34 la carta y el horario mandan desde la BD:
// en paralelo se pide GET /api/wstyle/catalog (tope 4 s) y, si responde, reemplaza servicios/horario. Si la API falla
// o tarda, queda el JSON (fallback) sin ningún error visible (CB-07).
export function useContent(initial: Content | null) {
  const [content, setContent] = useState<Content | null>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const catalog = loadCatalog(API_BASE);
    loadContent('./')
      .then((c) => c, (e) => {
        console.error('No se pudo cargar el contenido; queda el contenido prerenderizado.', e);
        return null;
      })
      .then(async (c) => {
        if (!alive) return;
        if (c) setContent(c);
        setLoaded(true);
        const k = await catalog;
        if (alive && k) setContent((cur) => (cur ? mergeCatalog(cur, k) : cur));
      });
    return () => { alive = false; };
  }, []);
  return { content, loaded };
}
