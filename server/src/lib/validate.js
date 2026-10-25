/* Validaciones compartidas por cuentas y reservas. El client tiene las mismas
   (client/src/wstyle/agenda/validation.ts) pero el server es la autoridad. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NOTE = 300;

export const normEmail = (s) => String(s ?? '').trim().toLowerCase();
export const isEmail = (s) => EMAIL_RE.test(s) && s.length <= 254;

/* Celular chileno → E.164 (+569XXXXXXXX) o null. Acepta "+56 9 1234 5678",
   "9 1234 5678", "56912345678", "0056 9…". */
export function clMobile(s) {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('569')) return '+' + d;
  if (d.length === 9 && d.startsWith('9')) return '+56' + d;
  return null;
}

/* RN-20: mínimo 8, al menos una letra y un número, distinta del email. */
export function passwordProblem(password, email = '') {
  const p = String(password ?? '');
  if (p.length < 8 || p.length > 200) return 'weak_password';
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return 'weak_password';
  if (email && p.trim().toLowerCase() === String(email).trim().toLowerCase()) return 'weak_password';
  return null;
}

export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
