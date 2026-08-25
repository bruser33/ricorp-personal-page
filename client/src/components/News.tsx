import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useLang } from '../i18n';
import { Footline } from './Footline';
import { formatearFecha, hitosOrdenados } from '../data/trayectoria';
import type { HitoTrayectoria } from '../data/trayectoria';
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

export function News() {
  const { t, lang } = useLang();
  const [hitos, setHitos] = useState<HitoTrayectoria[]>(() => hitosOrdenados());
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

  /* El observer global (useReveal) se arma UNA sola vez después del montaje: los
     nodos que nacen más tarde —cuando /api/news trae otra lista— nunca
     recibirían .visible y quedarían en opacity 0. Acá se re-arma acotado a esta
     sección; agregar la clase dos veces es inofensivo. */
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

  /* El hito más nuevo abre la sección a pantalla completa, pero solo si tiene
     imagen y queda cuerpo suficiente para la línea de tiempo: con dos hitos el
     destacado se comería la mitad del contenido. Todo por slicing, sin índices
     fijos, así el layout aguanta cualquier largo de `trayectoria.ts`. */
  const conPortada = hitos.length > 2 && !!hitos[0].imagen;
  const portada = conPortada ? hitos[0] : null;
  const linea = conPortada ? hitos.slice(1) : hitos;

  return (
    <section id="news" className="news" ref={rootRef}>
      {portada && (
        /* El track no es un wrapper decorativo: su padding inferior ES el
           recorrido del pin (position: sticky en .news-featured). Ver News.css. */
        <div className="news-featured-track">
          <article className="news-featured reveal-fade">
            <div className="news-featured__media">
              <img
                src={rutaImagen(portada.imagen!)}
                alt={portada.titulo.replace(/\n/g, ' ')}
                onError={onMediaError}
              />
            </div>
            <div className="news-featured__text">
              {portada.fecha && (
                <p className="news-featured__kicker">{formatearFecha(portada.fecha, lang)}</p>
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
              const titulo = hito.enlace ? (
                <a className="news-row__link" href={hito.enlace} target="_blank" rel="noreferrer">
                  <TitleLines text={hito.titulo} />
                </a>
              ) : (
                <TitleLines text={hito.titulo} />
              );
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
                  <div className="news-row__content">
                    {hito.imagen && (
                      <div className="news-row__media">
                        <img src={rutaImagen(hito.imagen)} alt={alt} onError={onMediaError} />
                      </div>
                    )}
                    <h4 className="news-row__title">{titulo}</h4>
                    {hito.descripcion && (
                      <p className="news-row__desc">{hito.descripcion}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="news-cta-wrap reveal reveal-fade">
          <span className="news-axis-arrow" aria-hidden="true">▼</span>
          <a href="#news" className="news-cta">{t('news.cta')}</a>
        </div>
      </div>
      {/* News quedó como ÚLTIMA sección del documento, así que carga el
          footline: si no, la página termina en el botón "See all" y un vacío, y
          el pie (privacy / © / Santiago) queda a mitad de página dentro de
          Contact. */}
      <Footline />
    </section>
  );
}
