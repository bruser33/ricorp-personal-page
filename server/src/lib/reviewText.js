/* Reseñas de WS Style (SPEC-52): reglas puras de texto (probadas en test/reviewText.test.js).
   El server es la autoridad: el front solo avisa con el contador. */
import { HttpError } from './errors.js';

export const COMMENT_MIN = 10;
export const COMMENT_MAX = 300;

/* Caracteres invisibles o de control que no aportan nada a una reseña (se conservan \n y \t para normalizar). */
const CONTROL_RANGES = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const hex = (n) => '\\u' + n.toString(16).padStart(4, '0');
const CONTROL = new RegExp('[' + CONTROL_RANGES.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join('') + ']', 'g');

/* RN-05: texto plano. Primero se borran los bloques <script>/<style> CON su contenido (CB-04), después cualquier
   etiqueta o comentario HTML, los caracteres de control; los espacios se colapsan (máximo un salto de línea
   seguido) y se recortan los bordes. El resultado se muestra SIEMPRE como texto (nunca como HTML). */
export function sanitizeComment(input) {
  let t = String(input ?? '');
  t = t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  t = t.replace(/<(script|style)\b[^>]*>[\s\S]*$/gi, ' ');
  t = t.replace(/<!--[\s\S]*?(-->|$)/g, ' ');
  t = t.replace(/<\/?[a-z!?][^>]*(>|$)/gi, ' ');
  t = t.replace(/\r\n?/g, '\n').replace(CONTROL, '');
  t = t.replace(/[^\S\n]+/g, ' ');
  t = t.replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
  return t.trim();
}

/* Largo en caracteres visibles (code points: un emoji o una tilde cuentan 1). */
export const charCount = (s) => [...String(s ?? '')].length;

/* RN-06: "Pedro Rico Díaz" → "Pedro D."; "Pedro" → "Pedro"; sin nombre → "Cliente de WS Style". */
export function displayName(name) {
  const words = String(name ?? '').replace(/[^\p{L}\p{M}\s'’-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'Cliente de WS Style';
  const first = words[0];
  if (words.length === 1) return first;
  const initial = [...words[words.length - 1]][0].toLocaleUpperCase('es-CL');
  return `${first} ${initial}.`;
}

/* RN-04: estrellas entero 1–5 (un "5" de texto no vale: CB-06) y comentario obligatorio de 10 a 300 caracteres
   DESPUÉS de sanitizar. Cualquier otro campo del body se ignora. */
export function validateReviewBody(body = {}) {
  const fields = {};
  const rating = body.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = 'invalid_rating';
  const comment = typeof body.comment === 'string' ? sanitizeComment(body.comment) : '';
  const n = charCount(comment);
  if (n < COMMENT_MIN) fields.comment = 'comment_too_short';
  else if (n > COMMENT_MAX) fields.comment = 'comment_too_long';
  if (Object.keys(fields).length) {
    const message = fields.rating
      ? 'Elige de 1 a 5 estrellas.'
      : fields.comment === 'comment_too_long'
        ? `El comentario puede tener hasta ${COMMENT_MAX} caracteres.`
        : `Cuéntanos un poco más (mínimo ${COMMENT_MIN} caracteres).`;
    throw new HttpError(400, Object.values(fields)[0], message, { fields });
  }
  return { rating, comment };
}

export const starsText = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);
