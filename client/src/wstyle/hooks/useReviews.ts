import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../agenda/api';
import { loadReviews, mergeReviews, type ReviewsPage } from '../reviews';

// Reseñas de la landing (SPEC-52). Arranca en null (igual que el HTML prerenderizado, que no trae reseñas: la
// hidratación no difiere) y se piden solo en el navegador. "Ver más" trae la página siguiente.
export function useReviews() {
  const [data, setData] = useState<ReviewsPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    loadReviews(API_BASE).then((d) => { if (alive && d) setData(d); });
    return () => { alive = false; };
  }, []);
  const more = useCallback(async () => {
    if (!data?.hasMore || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    const next = await loadReviews(API_BASE, data.page + 1, 15_000);
    busy.current = false;
    setLoadingMore(false);
    if (next) setData((cur) => (cur ? mergeReviews(cur, next) : next));
  }, [data]);
  return { data, more, loadingMore };
}
