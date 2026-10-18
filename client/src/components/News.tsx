import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
} from 'react';
import { useLang } from '../i18n';
import { formatearFecha, hitosOrdenados } from '../data/trayectoria';
import type { HitoTrayectoria } from '../data/trayectoria';
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

/* Trayectoria como PÁGINA propia (ricorp.cl/trayectoria, ver lib/rutas.ts).
   Antes era una pantalla que tapaba el home con un #hash y un "Volver al
   inicio"; ahora se entra y se sale por el navbar o el botón atrás, como con
   cualquier página. Los reveals los arma useReveal de App (re-armado por
   página) y este componente los vuelve a armar si /api/news trae otra lista. */
export function News() {
  const { lang, t } = useLang();
  const [hitos, setHitos] = useState<HitoTrayectoria[]>(() => hitosOrdenados());
  const [detalle, setDetalle] = useState<HitoTrayectoria | null>(null);
  const [origen, setOrigen] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

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

  const abrirDetalle = useCallback((hito: HitoTrayectoria, el: HTMLElement) => {
    setOrigen(el.getBoundingClientRect());
    setDetalle(hito);
  }, []);

  const cerrarDetalle = useCallback(() => {
    setDetalle(null);
    setOrigen(null);
  }, []);

  /* Si /api/news reemplaza la lista, los nodos nuevos nacen después del
     armado de useReveal y quedarían en opacity 0: se re-arma acotado a la
     sección. Agregar la clase dos veces es inofensivo. */
  useEffect(() => {
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
  }, [hitos]);

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

  /* El hito más nuevo abre la página a sangre, pero solo si tiene
     imagen y queda cuerpo suficiente para la línea de tiempo: con dos hitos el
     destacado se comería la mitad del contenido. Todo por slicing, sin índices
     fijos, así el layout aguanta cualquier largo de `trayectoria.ts`. */
  const conPortada = hitos.length > 2 && !!hitos[0].imagen;
  const portada = conPortada ? hitos[0] : null;
  const linea = conPortada ? hitos.slice(1) : hitos;
  const esp = lang === 'esp';

  return (
    <>
      {/* Página Trayectoria con la distribución del Figma (video 2026-10-18,
          30–43 s): sin encabezado de página; arriba la portada a sangre con su
          título montado sobre el borde, y abajo una grilla de tarjetas que
          aparecen de a una. El h1 queda para lectores de pantalla. */}
      <div className="news-view" id="trayectoria">
        <h1 id="bitacora-titulo" className="sr-only">
          {t('bitacora.title')}
        </h1>

        <section className="news" ref={rootRef} aria-labelledby="bitacora-titulo">
          {portada && (
            <article className="news-featured" {...tarjeta(portada)}>
              <div className="news-featured__media">
                <img
                  src={rutaImagen(portada.imagen!)}
                  alt={portada.titulo.replace(/\n/g, ' ')}
                  fetchPriority="high"
                  onError={onMediaError}
                />
              </div>
              <div className="news-featured__text">
                {portada.fecha && (
                  <p className="news-featured__kicker">{formatearFecha(portada.fecha, lang)}</p>
                )}
                <h2 className="news-featured__title">
                  <TitleLines text={portada.titulo} />
                </h2>
              </div>
            </article>
          )}

          {linea.length > 0 && (
            <ol className="news-grid container">
              {linea.map((hito, i) => {
                const fecha = formatearFecha(hito.fecha, lang);
                const alt = hito.titulo.replace(/\n/g, ' ');
                return (
                  <li
                    key={hito.id}
                    className="news-card-item reveal"
                    /* Escalonado: la primera fila entra de a una después de la
                       portada (como en el Figma); las de más abajo, al
                       scrollear, solo con el corrimiento por columna. */
                    style={{ ['--orden' as string]: i < 3 ? i : i % 3, ['--base' as string]: i < 3 ? '1' : '0' }}
                  >
                    <article className="news-card" {...tarjeta(hito)}>
                      <div className={`news-card__media${hito.imagen ? '' : ' news-card__media--texto'}`}>
                        {hito.imagen ? (
                          <img
                            src={rutaImagen(hito.imagen)}
                            alt={alt}
                            loading="lazy"
                            decoding="async"
                            onError={onMediaError}
                          />
                        ) : (
                          <span aria-hidden="true">{alt}</span>
                        )}
                      </div>
                      {fecha && <time className="news-card__date">{fecha}</time>}
                      <h3 className="news-card__title">
                        <TitleLines text={hito.titulo} />
                      </h3>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
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
