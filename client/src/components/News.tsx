import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useLang } from '../i18n';
import { Footline } from './Footline';
import './News.css';

type Item = {
  id: string;
  title: string;
  image: string;
  kicker?: string;
  date?: string;
};

const base = import.meta.env.BASE_URL + 'figma-frames/';
const fallback: Item[] = [
  {
    id: '1',
    kicker: 'Análisis:',
    title: 'AMD Radeon RX 7900 XTX',
    image: base + 'news-featured.png',
    date: '14 Dic 2022',
  },
  {
    id: '2',
    kicker: 'Análisis:',
    title: 'Suunto 9 Peak Pro',
    image: base + 'news-1.png',
    date: '2 Dic 2022',
  },
  {
    id: '3',
    kicker: 'Análisis:',
    title: 'iPhone 14 vs 14 Plus\nvs 14 Pro vs 14 Pro Max',
    image: base + 'news-2.png',
    date: '24 Nov 2022',
  },
  {
    id: '4',
    title: 'Nuevo aspirante al trono\nde la realidad virtual',
    image: base + 'news-3.png',
    date: '15 Nov 2022',
  },
  {
    id: '5',
    kicker: 'Análisis:',
    title: 'AirPods Pro de 2ª Generación',
    image: base + 'news-4.png',
    date: '8 Nov 2022',
  },
  {
    id: '6',
    kicker: 'Análisis:',
    title: 'Proscenic WashVac F20',
    image: base + 'news-5.png',
    date: '1 Nov 2022',
  },
];

/* Cuántos cuadrados acompañan al destacado en desktop. La timeline arranca
   recién DESPUÉS de ese bloque, así que todo se deriva por slicing: si la API
   devuelve 4 items la timeline simplemente no se monta, y si devuelve 12 los
   sobrantes caen todos en la timeline. Sin índices fijos. */
const DESKTOP_CARDS = 3;

const KICKER_ES = 'Análisis:';

/* El destacado, la grilla y la timeline son estructuras DISTINTAS y en mobile la
   timeline no existe (R14), así que el breakpoint se resuelve en JS y no con
   display:none sobre markup duplicado. El valor inicial sale de matchMedia, no
   de un efecto: montar la timeline y tirarla en el primer frame haría parpadear
   la sección en cada carga mobile. */
function useIsMobile(query = '(max-width: 720px)') {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return isMobile;
}

/* Los títulos traen \n donde el diseño fuerza el corte de línea. */
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
  const { t } = useLang();
  const [items, setItems] = useState<Item[]>(fallback);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL;
    if (!apiBase) return;
    fetch(apiBase + '/api/news')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length) setItems(data);
      })
      .catch(() => {});
  }, []);

  /* El observer global (useReveal) se arma UNA sola vez después del montaje: los
     nodos que nacen más tarde —cuando /api/news trae otra lista, o cuando un
     resize cruza el breakpoint y cambia la estructura— nunca recibirían
     .visible y quedarían en opacity 0. Acá se re-arma acotado a esta sección;
     agregar la clase dos veces es inofensivo. */
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
  }, [items, isMobile]);

  const label = (kicker: string) => (kicker === KICKER_ES ? t('news.analysis') : kicker);

  const featured = items.length ? items[0] : null;
  const rest = items.slice(1);
  // Mobile: TODO el resto va como cuadraditos de 2 por fila, sin timeline.
  const cards = isMobile ? rest : rest.slice(0, DESKTOP_CARDS);
  const timeline = isMobile ? [] : rest.slice(DESKTOP_CARDS);

  return (
    <section id="news" className="news" ref={rootRef}>
      {featured && (
        /* El track no es un wrapper decorativo: su padding inferior ES el
           recorrido del pin (position: sticky en .news-featured). Ver News.css. */
        <div className="news-featured-track">
          <article className="news-featured reveal-fade">
            <div className="news-featured__media">
              <img
                src={featured.image}
                alt={featured.title.replace(/\n/g, ' ')}
                onError={onMediaError}
              />
            </div>
            <div className="news-featured__text">
              {featured.kicker && (
                <p className="news-featured__kicker">{label(featured.kicker)}</p>
              )}
              <h3 className="news-featured__title">
                <TitleLines text={featured.title} />
              </h3>
            </div>
          </article>
        </div>
      )}

      <div className="container">
        {cards.length > 0 && (
          <ul className="news-cards">
            {cards.map((it, i) => (
              <li
                key={it.id}
                className={`news-card reveal reveal-delay-${Math.min(i + 1, 5)}`}
              >
                <div className="news-card__media">
                  <img
                    src={it.image}
                    alt={it.title.replace(/\n/g, ' ')}
                    onError={onMediaError}
                  />
                </div>
                <div className="news-card__text">
                  {it.kicker && <p className="news-card__kicker">{label(it.kicker)}</p>}
                  <h4 className="news-card__title">
                    <TitleLines text={it.title} />
                  </h4>
                  {/* En mobile la timeline no se monta, y era la única que
                      mostraba la fecha: sin esto los cuadraditos perdían el dato
                      por completo. */}
                  {it.date && <span className="news-card__date">{it.date}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {timeline.length > 0 && (
          <ol className="news-timeline">
            {timeline.map((it, i) => {
              const side = i % 2 === 0 ? 'right' : 'left';
              return (
                <li
                  key={it.id}
                  className={`news-row news-row--${side} reveal reveal-delay-${Math.min(i + 1, 5)}`}
                >
                  <div className="news-row__text">
                    {it.kicker && <p className="news-row__kicker">{label(it.kicker)}</p>}
                    <h4 className="news-row__title">
                      <TitleLines text={it.title} />
                    </h4>
                  </div>
                  <div className="news-row__axis" aria-hidden="true">
                    <span className="news-row__dot" />
                    {it.date && <span className="news-row__date">{it.date}</span>}
                  </div>
                  <div className="news-row__media">
                    <img
                      src={it.image}
                      alt={it.title.replace(/\n/g, ' ')}
                      onError={onMediaError}
                    />
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
