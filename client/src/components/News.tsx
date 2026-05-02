import { useEffect, useState } from 'react';
import './News.css';

type Item = {
  id: string;
  title: string;
  image: string;
  kicker?: string;
  featured?: boolean;
};

const fallback: Item[] = [
  {
    id: '1',
    kicker: 'Análisis:',
    title: 'AMD Radeon RX 7900 XTX',
    image: import.meta.env.BASE_URL + 'figma-frames/ricorp-d-frame-05.png',
    featured: true,
  },
  {
    id: '2',
    title: 'Nuevo aspirante al trono de la realidad virtual',
    image: import.meta.env.BASE_URL + 'figma-frames/ricorp-d-frame-11.png',
  },
  {
    id: '3',
    kicker: 'Análisis:',
    title: 'Suunto 9 Peak Pro',
    image: import.meta.env.BASE_URL + 'figma-frames/ricorp-animation-frame-02.png',
  },
];

export function News() {
  const [items, setItems] = useState<Item[]>(fallback);

  useEffect(() => {
    const url = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api/news';
    fetch(url)
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
        <h2 className="section-title">News</h2>
        <article className="news-feature">
          <img src={featured.image} alt="" />
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
                {it.kicker && <span className="card-kicker">{it.kicker} </span>}
                {it.title}
              </h4>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
