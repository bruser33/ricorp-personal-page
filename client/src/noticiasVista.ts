/* Estado de la pantalla Bitácora (antes "noticias", una vista superpuesta).
   La fuente de verdad es la URL: la pantalla está activa mientras
   `location.hash === '#trayectoria'`. Así el deep link, el botón atrás y el link del
   navbar hablan el mismo idioma sin estado global de React.

   Vive en un módulo aparte (y no en News.tsx) porque el Header también lo usa y
   react-refresh pide que los archivos de componentes solo exporten componentes. */

export const HASH_NOTICIAS = '#trayectoria';

/* Hashes viejos (la sección se llamó "news"/"noticias"): un link guardado o
   compartido con ellos sigue abriendo la Bitácora, y la URL se normaliza. */
const HASHES_ANTIGUOS = ['#bitacora', '#news', '#noticias'];

/* Clase en <html> mientras la Bitácora es la pantalla activa: el CSS oculta el
   home y App/Projects dejan de reaccionar a gestos del home. */
export const CLASE_PANTALLA = 'bitacora-activa';

/** ¿La URL apunta a la Bitácora (hash actual o uno de los viejos)? */
export function enBitacora(): boolean {
  const h = window.location.hash;
  return h === HASH_NOTICIAS || HASHES_ANTIGUOS.includes(h);
}

/* Evento propio: `history.pushState` NO dispara popstate ni hashchange, así que
   la vista se entera de la apertura por acá. */
export const EVENTO_NOTICIAS = 'ricorp:noticias';

/* Marca de las entradas del historial que empujó la propia vista. Cerrar con
   history.back() solo es seguro si la entrada anterior es la página sin #news;
   si la entrada no la empujamos nosotros (alguien tipeó #news a mano), cerrar
   reemplaza la URL en vez de retroceder, para no sacar al visitante del sitio. */
export const MARCA_ESTADO = 'ricorpNoticias';

let focoDeRetorno: HTMLElement | null = null;

/** Abre la vista. `origen` recibe el foco al cerrar (a11y). */
export function abrirNoticias(origen?: HTMLElement | null) {
  focoDeRetorno = origen ?? null;
  if (window.location.hash !== HASH_NOTICIAS) {
    window.history.pushState({ [MARCA_ESTADO]: true }, '', HASH_NOTICIAS);
  }
  window.dispatchEvent(new Event(EVENTO_NOTICIAS));
}

/** Entrega (y olvida) el elemento que tiene que recuperar el foco al cerrar. */
export function tomarFocoDeRetorno(): HTMLElement | null {
  const el = focoDeRetorno;
  focoDeRetorno = null;
  return el;
}

/** ¿La entrada actual del historial la empujó la vista? */
export function entradaPropia(): boolean {
  const st = window.history.state as Record<string, unknown> | null;
  return !!st?.[MARCA_ESTADO];
}

/* Deep link (`/#trayectoria`, o un `/#bitacora`/`/#news` viejo, cargado directo): la entrada actual es la ÚNICA del sitio,
   así que "atrás" sacaría al visitante en vez de cerrar la vista. Se reescribe
   el historial a [página sin hash] → [#news marcada] para que atrás la cierre.
   Corre una sola vez, al cargar el módulo (fuera de React: StrictMode monta los
   efectos dos veces y duplicaría la entrada). Si la entrada ya está marcada
   (recarga), la de atrás ya es la página sin hash y no hay nada que hacer. */
if (typeof window !== 'undefined' && enBitacora() && !entradaPropia()) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', base);
  window.history.pushState({ [MARCA_ESTADO]: true }, '', base + HASH_NOTICIAS);
}
