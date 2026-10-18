import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

/* Páginas del sitio. Cada una tiene su propia URL (ricorp.cl/contacto,
   ricorp.cl/trayectoria): se pueden compartir, recargar y el botón atrás las
   recorre. El cambio de página no recarga: se reemplaza el contenido de <main>.
   GitHub Pages sirve esas rutas porque el build copia index.html a
   dist/contacto/ y dist/trayectoria/ (scripts/paginas-spa.mjs). */
export type Pagina = 'inicio' | 'contacto' | 'trayectoria';

export const RUTAS: Record<Pagina, string> = {
  inicio: '/',
  contacto: '/contacto',
  trayectoria: '/trayectoria',
};

const EVENTO_RUTA = 'ricorp:ruta';

/* Links viejos (cuando contacto era una sección del home y la trayectoria una
   vista con #hash): siguen funcionando y la URL se normaliza a la ruta nueva. */
const HASHES_VIEJOS: Record<string, Pagina> = {
  '#home': 'inicio',
  '#about': 'inicio',
  '#contact': 'contacto',
  '#trayectoria': 'trayectoria',
  '#bitacora': 'trayectoria',
  '#news': 'trayectoria',
  '#noticias': 'trayectoria',
};

export function paginaDeUrl(): Pagina {
  const viejo = HASHES_VIEJOS[window.location.hash];
  if (viejo) return viejo;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === RUTAS.contacto) return 'contacto';
  if (path === RUTAS.trayectoria) return 'trayectoria';
  return 'inicio';
}

/* Normaliza al cargar, sin sumar entrada al historial: una URL vieja con hash
   pasa a su ruta nueva, y una ruta que no existe (la sirve 404.html) queda en
   "/" en vez de mostrar el inicio con una dirección basura. Corre una vez. */
if (typeof window !== 'undefined') {
  const viejo = HASHES_VIEJOS[window.location.hash];
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const conocida = (Object.values(RUTAS) as string[]).includes(path);
  if (viejo) window.history.replaceState(null, '', RUTAS[viejo]);
  else if (!conocida) window.history.replaceState(null, '', RUTAS.inicio);
}

export function navegar(pagina: Pagina) {
  if (paginaDeUrl() === pagina && !window.location.hash) {
    // Misma página: solo volver arriba (p.ej. "Inicio" estando en el home).
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.history.pushState(null, '', RUTAS[pagina]);
  window.dispatchEvent(new Event(EVENTO_RUTA));
}

/* onClick para los <a href> de navegación: deja pasar Cmd/Ctrl/Shift/clic
   medio (abrir en otra pestaña) y en el resto navega sin recargar. */
export function alNavegar(pagina: Pagina, despues?: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navegar(pagina);
    despues?.();
  };
}

/** Página actual; se actualiza con navegar() y con atrás/adelante. */
export function usePagina(): Pagina {
  const [pagina, setPagina] = useState<Pagina>(paginaDeUrl);
  useEffect(() => {
    const sync = () => setPagina(paginaDeUrl());
    window.addEventListener(EVENTO_RUTA, sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener(EVENTO_RUTA, sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return pagina;
}
