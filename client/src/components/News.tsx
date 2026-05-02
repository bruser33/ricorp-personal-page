import { useEffect, useState } from 'react';
import './News.css';

type Item = {
  id: string;
  title: string;
  image: string;
  kicker?: string;
  featured?: boolean;
};

const base = import.meta.env.BASE_URL + 'figma-frames/';
const fallback: Item[] = [
  {
    id: '1',
    kicker: 'Análisis:',
    title: 'AMD Radeon RX 7900 XTX',
    image: base + 'news-featured.png',
    featured: true,
  },
  {
    id: '2',
    kicker: 'Análisis:',
    title: 'Suunto 9 Peak Pro',
    image: base + 'news-1.png',
  },
  {
    id: '3',
    kicker: 'Análisis:',
    title: 'iPhone 14 vs 14 Plus\nvs 14 Pro vs 14 Pro Max',
    image: base + 'news-2.png',
  },
  {
    id: '4',
    title: 'Nuevo aspirante al trono\nde la realidad virtual',
    image: base + 'news-3.png',
  },
  {
    id: '5',
    kicker: 'Análisis:',
    title: 'AirPods Pro de 2ª Generación',
    image: base + 'news-4.png',
  },
  {
    id: '6',
    kicker: 'Análisis:',
    title: 'Proscenic WashVac F20',
    image: base + 'news-5.png',
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
        <article className="news-feature">
          <img src={featured.image} alt={featured.title} />
          <div className="news-feature-overlay">
            {featured.kicker && <span className="kicker">{featured.kicker}</span>}
            <h3>{featured.title}</h3>
          </div>
        </article>
        <div className="news-grid">
          {rest.map((it) => (
            <article key={it.id} className="news-card">
              <div className="news-card-media">
                <img src={it.image} alt="" />
              </div>
              <h4>
                {it.kicker && <span className="card-kicker">{it.kicker}</span>}
                {it.kicker && <br />}
                {it.title.split('\n').map((line, i, arr) => (
                  <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
              </h4>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
