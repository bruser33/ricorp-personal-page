import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
} from 'react';
import { useLang } from '../i18n';
import { formatearFecha, hitosOrdenados } from '../data/trayectoria';
import type { HitoTrayectoria } from '../data/trayectoria';
import {
  CLASE_PANTALLA,
  EVENTO_NOTICIAS,
  HASH_NOTICIAS,
  enBitacora,
  entradaPropia,
  tomarFocoDeRetorno,
} from '../noticiasVista';
import { DetailModal } from './DetailModal';
import { Footline } from './Footline';
import './News.css';

/* Forma de los items que devuelve `GET /api/news`. La API es una fuente
   OPCIONAL: el contenido por defecto de esta sección vive en
   `src/data/trayectoria.ts`, que es el archivo que edita Pedro. Este tipo se
   conserva para poder seguir consumiendo la API si algún día se llena. */
type Item = {
  id: string;
  title: string;
  image: string;
  kicker?: string;
  date?: string;
};

const BASE = import.meta.env.BASE_URL;

/* En `trayectoria.ts` las imágenes se escriben relativas a `client/public`
   ('figma-frames/x.png') para que quien edita el archivo no tenga que saber nada
   del base path de GitHub Pages. El prefijo se agrega acá. */
function rutaImagen(imagen: string): string {
  if (/^(https?:)?\/\//.test(imagen) || imagen.startsWith('/')) return imagen;
  return BASE + imagen;
}

/* Adaptador API → hito. El kicker de la API ('Análisis:') se fusiona con el
   título porque el modelo de trayectoria no tiene ese campo. */
function itemAHito(it: Item): HitoTrayectoria {
  return {
    id: it.id,
    fecha: it.date ?? '',
    titulo: it.kicker ? `${it.kicker} ${it.title}` : it.title,
    imagen: it.image,
  };
}

/* Los títulos aceptan \n donde se quiere forzar el corte de línea. */
function TitleLines({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {line}
          {idx < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function onMediaError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  img.style.display = 'none';
  img.parentElement?.classList.add('media-fallback');
}

/* Bitácora como PANTALLA (antes una vista superpuesta con X, trampa de foco y
   scroll propio): con #bitacora en la URL el home se oculta (html.bitacora-activa,
   ver News.css), el header sigue arriba y la página usa el scroll normal de la
   ventana. Se entra desde el navbar (abrirNoticias) o con /#bitacora; se sale con
   "Volver al inicio", el logo, cualquier link del navbar o el botón atrás. `ready`
   = el splash terminó: un deep link no tapa la intro. */
export function News({ ready = true }: { ready?: boolean }) {
  const { lang, t } = useLang();
  const [hitos, setHitos] = useState<HitoTrayectoria[]>(() => hitosOrdenados());
  const [abierta, setAbierta] = useState(enBitacora);
  const [detalle, setDetalle] = useState<HitoTrayectoria | null>(null);
  const [origen, setOrigen] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const tituloRef = useRef<HTMLHeadingElement | null>(null);

  const visible = abierta && ready;

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL;
    if (!apiBase) return;
    fetch(apiBase + '/api/news')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Item[] | null) => {
        // La API llega ya ordenada por el server y sus fechas no son ISO, así
        // que NO se re-ordena acá: reordenar strings tipo '14 Dic 2022' las
        // barajaría alfabéticamente.
        if (Array.isArray(data) && data.length) setHitos(data.map(itemAHito));
      })
      .catch(() => {});
  }, []);

  /* La URL manda: abrir (evento propio, pushState no avisa), atrás/adelante
     (popstate) y un #news tipeado a mano (hashchange) se resuelven igual. Al
     cerrarse la vista se cierra también el detalle que hubiera quedado abierto. */
  useEffect(() => {
    const sync = () => {
      const enHash = enBitacora();
      /* Un #news/#noticias viejo tipeado a mano se normaliza sin sumar entrada. */
      if (enHash && window.location.hash !== HASH_NOTICIAS) {
        window.history.replaceState(window.history.state, '', HASH_NOTICIAS);
      }
      setAbierta(enHash);
      if (!enHash) setDetalle(null);
    };
    window.addEventListener(EVENTO_NOTICIAS, sync);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener(EVENTO_NOTICIAS, sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  /* "Volver al inicio" = volver a la entrada anterior del historial cuando la de
     #bitacora es nuestra (link del navbar o deep link reescrito): así el botón y
     "atrás" dejan el historial igual. Si alguien tipeó el hash a mano, se
     reemplaza la URL en vez de retroceder (la entrada de atrás podría no ser este
     sitio). */
  const cerrarVista = useCallback(() => {
    if (entradaPropia()) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setAbierta(false);
    setDetalle(null);
  }, []);

  const abrirDetalle = useCallback((hito: HitoTrayectoria, el: HTMLElement) => {
    setOrigen(el.getBoundingClientRect());
    setDetalle(hito);
  }, []);

  const cerrarDetalle = useCallback(() => {
    setDetalle(null);
    setOrigen(null);
  }, []);

  /* Entrar a la pantalla: se recuerda dónde estaba el home, la página arranca
     arriba y el foco va al título (un lector de pantalla anuncia la pantalla
     nueva). Al salir se vuelve a ese punto del home, salvo que la salida haya
     sido un link a una sección (#contact, #about): ahí manda el link. El salto
     va después del render en que el home vuelve a verse — con el home en
     display:none no hay offsets que medir. */
  useEffect(() => {
    if (!visible) return;
    const html = document.documentElement;
    const scrollHome = window.scrollY;
    html.classList.add(CLASE_PANTALLA);
    /* `instant`: html tiene scroll-behavior smooth y sin esto se vería un
       barrido por todo el home (con reveals y snap incluidos). */
    window.scrollTo({ top: 0, behavior: 'instant' });
    tituloRef.current?.focus({ preventScroll: true });
    return () => {
      html.classList.remove(CLASE_PANTALLA);
      const destino = window.location.hash.slice(1);
      const seccion = destino ? document.getElementById(destino) : null;
      if (seccion) seccion.scrollIntoView({ behavior: 'instant' });
      else window.scrollTo({ top: scrollHome, behavior: 'instant' });
      /* El blob del home (useBlobMorph) solo se recalcula con scroll: si la
         posición no cambió no llega ninguno y quedaría con los valores que midió
         mientras el home estaba oculto (todos los offsets en 0). */
      window.dispatchEvent(new Event('scroll'));
      const el = tomarFocoDeRetorno();
      if (el && el.isConnected) el.focus({ preventScroll: true });
    };
  }, [visible]);

  /* Escape cierra SOLO el detalle: la Bitácora es una pantalla, no una capa que
     se descarte con Escape. */
  useEffect(() => {
    if (!detalle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarDetalle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detalle, cerrarDetalle]);

  /* El observer global (useReveal) se arma UNA sola vez después del montaje, y
     esta pantalla nace después (al entrar) y renace en cada entrada, igual que
     cuando /api/news trae otra lista: sin esto los nodos quedarían en opacity
     0. Se arma acotado a la vista; agregar la clase dos veces es inofensivo. */
  useEffect(() => {
    if (!visible) return;
    const section = rootRef.current;
    if (!section) return;
    const pending = Array.from(
      section.querySelectorAll<HTMLElement>('.reveal, .reveal-fade, .reveal-scale')
    ).filter((el) => !el.classList.contains('visible'));
    if (!pending.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
    );
    pending.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [hitos, visible]);

  /* Props de una tarjeta clicable (portada o fila). Es un div con role=button y
     no un <button> porque adentro hay encabezados, que un botón no admite. */
  const tarjeta = (hito: HitoTrayectoria) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-haspopup': 'dialog' as const,
    'aria-label': hito.titulo.replace(/\n/g, ' '),
    onClick: (e: ReactMouseEvent<HTMLElement>) => abrirDetalle(hito, e.currentTarget),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirDetalle(hito, e.currentTarget);
      }
    },
  });

  if (!visible) return null;

  /* El hito más nuevo abre la vista a pantalla completa, pero solo si tiene
     imagen y queda cuerpo suficiente para la línea de tiempo: con dos hitos el
     destacado se comería la mitad del contenido. Todo por slicing, sin índices
     fijos, así el layout aguanta cualquier largo de `trayectoria.ts`. */
  const conPortada = hitos.length > 2 && !!hitos[0].imagen;
  const portada = conPortada ? hitos[0] : null;
  const linea = conPortada ? hitos.slice(1) : hitos;
  const esp = lang === 'esp';

  return (
    <>
      <div className="news-view" id="bitacora">
        <header className="news-view__head container">
          <a
            href="#home"
            className="news-view__back"
            onClick={(e) => {
              e.preventDefault();
              cerrarVista();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('bitacora.back')}
          </a>
          <h1 id="bitacora-titulo" className="news-view__title" ref={tituloRef} tabIndex={-1}>
            {t('bitacora.title')}
          </h1>
          <p className="news-view__sub">{t('bitacora.sub')}</p>
        </header>

        <section className="news" ref={rootRef} aria-labelledby="bitacora-titulo">
          {portada && (
            /* El track no es un wrapper decorativo: su padding inferior ES el
               recorrido del pin (position: sticky en .news-featured). Ver News.css. */
            <div className="news-featured-track">
              <article className="news-featured reveal-fade" {...tarjeta(portada)}>
                <div className="news-featured__media">
                  <img
                    src={rutaImagen(portada.imagen!)}
                    alt={portada.titulo.replace(/\n/g, ' ')}
                    onError={onMediaError}
                  />
                </div>
                <div className="news-featured__text">
                  {portada.fecha && (
                    <p className="news-featured__kicker">
                      {formatearFecha(portada.fecha, lang)}
                    </p>
                  )}
                  <h3 className="news-featured__title">
                    <TitleLines text={portada.titulo} />
                  </h3>
                </div>
              </article>
            </div>
          )}

          <div className="container">
            {linea.length > 0 && (
              <ol className="news-timeline">
                {linea.map((hito, i) => {
                  // Alternancia: par = contenido a la derecha del eje, impar a la
                  // izquierda. En mobile el CSS anula los dos lados (todo a la
                  // derecha de la línea).
                  const lado = i % 2 === 0 ? 'right' : 'left';
                  const fecha = formatearFecha(hito.fecha, lang);
                  const alt = hito.titulo.replace(/\n/g, ' ');
                  return (
                    <li
                      key={hito.id}
                      className={`news-row news-row--${lado} reveal reveal-delay-${(i % 3) + 1}`}
                    >
                      <div className="news-row__when">
                        {fecha && <time className="news-row__date">{fecha}</time>}
                      </div>
                      <div className="news-row__axis" aria-hidden="true">
                        <span className="news-row__dot" />
                      </div>
                      {/* La tarjeta es el contenido (foto + texto), no la fila
                          entera: el detalle crece desde ESTE rect. El enlace del
                          hito ya no va en el título (no puede haber un link
                          dentro de un botón): se muestra en el detalle. */}
                      <div className="news-row__content" {...tarjeta(hito)}>
                        {hito.imagen && (
                          <div className="news-row__media">
                            <img src={rutaImagen(hito.imagen)} alt={alt} onError={onMediaError} />
                          </div>
                        )}
                        <h4 className="news-row__title">
                          <TitleLines text={hito.titulo} />
                        </h4>
                        {hito.descripcion && (
                          <p className="news-row__desc">{hito.descripcion}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {/* Sin CTA "Ver todos" (apuntaba a sí mismo). */}
          </div>
        </section>
        {/* Ahora es una pantalla completa: lleva su pie como las demás. */}
        <Footline />
      </div>

      {detalle && (
        <DetailModal
          originRect={origen}
          title={detalle.titulo.replace(/\n/g, ' ')}
          image={detalle.imagen ? rutaImagen(detalle.imagen) : undefined}
          tag={detalle.fecha ? formatearFecha(detalle.fecha, lang) : undefined}
          closeLabel={esp ? 'Cerrar detalle' : 'Close detail'}
          onClose={cerrarDetalle}
          footer={
            detalle.enlace && (
              <p className="project-modal-text detail-modal-link">
                <a href={detalle.enlace} target="_blank" rel="noreferrer">
                  {esp ? 'Ver más' : 'Read more'} ↗
                </a>
              </p>
            )
          }
        >
          {detalle.descripcion && <p className="project-modal-text">{detalle.descripcion}</p>}
        </DetailModal>
      )}
    </>
  );
}
