/* SPEC-58 RN-03: origen de una reserva web (de qué canal llegó el cliente: cartel, instagram_bio, whatsapp…).
   Viene del `utm_source` del link del kit de difusión. Se pasa a minúsculas, solo admite [a-z0-9_-] y se recorta
   a 40 caracteres. Un valor inválido o ausente → "directo". Los orígenes desconocidos (p. ej. "tiktok" puesto a
   mano) se guardan tal cual. El mismo algoritmo vive en el front (client/src/wstyle/agenda/util.ts). */
export const DIRECT = 'directo';
export const ORIGIN_MAX = 40;
/* Estadísticas: reservas web creadas antes de SPEC-58 (sin el campo `origin`). */
export const NO_DATA = 'sin_dato';

export function normalizeOrigin(value) {
  if (typeof value !== 'string') return DIRECT;
  const s = value.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(s) ? s.slice(0, ORIGIN_MAX) : DIRECT;
}
