// Reseñas de clientes (SPEC-52): lo que muestra la landing sale de GET /api/wstyle/reviews (la BD), nunca de site.json.
// Funciones puras probadas en reviews.test.tsx. Sin reseñas visibles, o si la API falla o tarda más de 4 s, el capítulo
// "Lo que dicen" no se muestra (RN-11, CB-07): sin relleno ni error visible.

export const REVIEWS_TIMEOUT_MS = 4000;
export const COMMENT_MIN = 10;
export const COMMENT_MAX = 300;
const TZ = 'America/Santiago';

export interface PublicReview { id: string; rating: number; comment: string; author: string; service: string; createdAt: string }
export interface ReviewsPage { summary: { average: number; count: number }; page: number; pages: number; hasMore: boolean; items: PublicReview[] }

const isPage = (d: unknown): d is ReviewsPage => {
  const x = d as ReviewsPage | null;
  return !!x && typeof x === 'object' && !!x.summary && typeof x.summary.count === 'number' && Array.isArray(x.items);
};

// GET /api/wstyle/reviews?page=N con tope de tiempo. null = no mostrar nada (API caída, dormida, lenta o sin negocio).
export async function loadReviews(apiBase: string, page = 1, timeoutMs = REVIEWS_TIMEOUT_MS): Promise<ReviewsPage | null> {
  try {
    const r = await fetch(`${apiBase}/api/wstyle/reviews?page=${page}`, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    if (!r.ok) return null;
    const data: unknown = await r.json();
    return isPage(data) ? data : null;
  } catch {
    return null;
  }
}

// "Ver más reseñas": suma la página siguiente sin repetir (si entró una reseña nueva entre medio, no se duplica).
export function mergeReviews(cur: ReviewsPage, next: ReviewsPage): ReviewsPage {
  const seen = new Set(cur.items.map((x) => x.id));
  return { ...next, items: [...cur.items, ...next.items.filter((x) => !seen.has(x.id))] };
}

// ¿Se publica el capítulo? Solo con al menos una reseña visible (RN-11, CB-08).
export const hasVisibleReviews = (d: ReviewsPage | null | undefined): d is ReviewsPage => !!d && d.summary.count > 0 && d.items.length > 0;

// RN-10: "4,8" (un decimal, coma decimal); "1 reseña" / "N reseñas"; estrellas redondeadas al medio.
export const formatAverage = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
export const countLabel = (n: number) => (n === 1 ? '1 reseña' : `${n.toLocaleString('es-CL')} reseñas`);
export const roundHalf = (n: number) => Math.max(0, Math.min(5, Math.round(n * 2) / 2));
export const starsLabel = (n: number) => `${String(n).replace('.', ',')} de 5 estrellas`;
export const starsText = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));

// RN-07: fecha corta local en Santiago ("18 nov 2026"), sin puntos de abreviatura.
export function reviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month').replace('.', '').toLowerCase()} ${get('year')}`;
}

// Contador del formulario: largo en caracteres visibles (como el server).
export const charCount = (s: string) => [...s].length;
