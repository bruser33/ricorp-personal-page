// Funciones puras del sitio (sin DOM ni three.js): las usa main.js y las prueba scripts/verify.mjs en Node.
// Todas reciben datos que el dueño escribe a mano en site/content/*.json.

const digits = (s) => String(s ?? '').replace(/\D/g, '');

// Teléfono chileno → dígitos internacionales para tel:+… y wa.me/… ("56" + 9 dígitos), o null si no se reconoce.
// Acepta "9 1234 5678", "+56 9 1234 5678", "(2) 2123 4567", "56912345678", el prefijo troncal antiguo
// ("09 1234 5678", "(02) 2123 4567") y el internacional "0056…". El número nacional nunca empieza en 0 o 1.
// null ⇒ el CTA se oculta (y se avisa).
export function clPhone(s) {
  let d = digits(s);
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  const out = d.length === 11 && /^56[2-9]/.test(d) ? d : d.length === 9 && /^[2-9]/.test(d) ? '56' + d : null;
  if (!out && d) console.warn(`Teléfono no reconocido en site.json: "${s}" (se oculta el botón)`);
  return out;
}

// Precio CLP entero y no negativo: número, o string tal como lo escribe el dueño ("12000", "12.000",
// "$12.000", "$ 12.000 CLP"). Decimales, negativos u otros formatos → NaN (la tarjeta muestra "Consultar").
export function toCLP(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const t = v.replace(/\$|clp/gi, '').trim();
  return /^(\d+|\d{1,3}(\.\d{3})+)$/.test(t) ? Number(t.replace(/\./g, '')) : NaN;
}

// Duración en minutos: número entero ≥ 0, o string "40", "40 min", "40 minutos". Otra cosa → NaN (se omite).
export function toMinutes(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : NaN;
  const m = typeof v === 'string' && /^\s*(\d+)\s*(min(utos)?)?\s*$/i.exec(v);
  return m ? Number(m[1]) : NaN;
}
