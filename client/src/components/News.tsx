import { useEffect, useState } from 'react';
import './News.css';

type Item = {
  id: string;
  title: string;
  image: string;
  kicker?: string;
  featured?: boolean;
  date?: string;
};

const base = import.meta.env.BASE_URL + 'figma-frames/';
const fallback: Item[] = [
  {
    id: '1',
    kicker: 'Análisis:',
    title: 'AMD Radeon RX 7900 XTX',
    image: base + 'news-featured.png',
    featured: true,
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

  const featured = items.find((i) => i.featured) ?? items[0];
  const rest = items.filter((i) => i.id !== featured.id);

  return (
    <section id="news" className="news">
      <div className="container">
        <article className="news-feature reveal-scale">
          <img
            src={featured.image}
            alt={featured.title.replace(/\n/g, ' ')}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              img.parentElement?.classList.add('media-fallback');
            }}
          />
          <div className="news-feature-overlay">
            {featured.kicker && <span className="kicker">{featured.kicker}</span>}
            <h3>{featured.title}</h3>
          </div>
        </article>
        <div className="news-grid">
          {rest.map((it, i) => (
            <article
              key={it.id}
              className={`news-card reveal reveal-delay-${Math.min(i + 1, 5)}`}
            >
              <div className="news-card-media">
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
              {it.date && <p className="card-date">{it.date}</p>}
              {it.kicker && <p className="card-kicker">{it.kicker}</p>}
              <h4>
                {it.title.split('\n').map((line, idx, arr) => (
                  <span key={idx}>
                    {line}
                    {idx < arr.length - 1 && <br />}
                  </span>
                ))}
              </h4>
            </article>
          ))}
        </div>
        <div className="news-cta-wrap">
          <a href="#news" className="news-cta">Ver todos</a>
        </div>
      </div>
    </section>
  );
}
