import { useEffect, useState } from 'react';
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

export function News() {
  const [items, setItems] = useState<Item[]>(fallback);

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

  return (
    <section id="news" className="news">
      <div className="container">
        <ol className="news-timeline">
          {items.map((it, i) => {
            const side = i % 2 === 0 ? 'right' : 'left';
            return (
              <li
                key={it.id}
                className={`news-row news-row--${side} reveal reveal-delay-${Math.min(i + 1, 5)}`}
              >
                <div className="news-row__text">
                  {it.kicker && <p className="news-row__kicker">{it.kicker}</p>}
                  <h4 className="news-row__title">
                    {it.title.split('\n').map((line, idx, arr) => (
                      <span key={idx}>
                        {line}
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))}
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
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = 'none';
                      img.parentElement?.classList.add('media-fallback');
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="news-cta-wrap reveal reveal-fade">
          <span className="news-axis-arrow" aria-hidden="true">▼</span>
          <a href="#news" className="news-cta">Ver todos</a>
        </div>
      </div>
    </section>
  );
}
