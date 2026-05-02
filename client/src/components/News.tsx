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

  return (
    <section id="news" className="news">
      <div className="container">
        <article className="news-feature" aria-label={`${featured.kicker ?? ''} ${featured.title}`}>
          <img src={featured.image} alt={featured.title} />
        </article>
      </div>
    </section>
  );
}
