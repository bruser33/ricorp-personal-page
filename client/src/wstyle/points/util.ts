// Funciones puras del programa de puntos (SPEC-57), probadas en util.test.ts.

const nf = new Intl.NumberFormat('es-CL');

/* "1 punto", "130 puntos", "-10 puntos". */
export const ptsLabel = (n: number) => `${nf.format(n)} ${Math.abs(n) === 1 ? 'punto' : 'puntos'}`;
/* "+15", "−120" (signo tipográfico para los movimientos del historial). */
export const signed = (n: number) => (n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(Math.abs(n))}` : '0');
/* Tarjeta del producto: "120 PTS". */
export const costLabel = (n: number) => `${nf.format(n)} PTS`;

export type RedeemState = { kind: 'ok' } | { kind: 'short'; missing: number; label: string } | { kind: 'sold_out'; label: string } | { kind: 'negative'; label: string };

/* Estado del botón [Canjear] según saldo y stock (RN-04, RN-05). */
export function redeemState(balance: number, product: { costPoints: number; soldOut: boolean }): RedeemState {
  if (product.soldOut) return { kind: 'sold_out', label: 'Agotado' };
  if (balance < 0) return { kind: 'negative', label: 'Saldo negativo' };
  if (balance < product.costPoints) {
    const missing = product.costPoints - balance;
    return { kind: 'short', missing, label: `Te faltan ${nf.format(missing)}` };
  }
  return { kind: 'ok' };
}

/* Igual que el server: "ws 7kq4m9", "7KQ4M9" → "WS-7KQ4M9"; otra cosa → null. */
export const CODE_RE = /^WS-[A-HJ-KM-NP-Z2-9]{6}$/;
export function normalizeCode(q: string): string | null {
  let s = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 8 && s.startsWith('WS')) s = s.slice(2);
  const code = `WS-${s}`;
  return CODE_RE.test(code) ? code : null;
}

/* Clave de idempotencia por confirmación (CB-04: doble clic o dos envíos → un solo canje). */
export function newKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const dateFmt = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' });
/* "18 nov 2026" */
export const shortDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)).replace(/\./g, '') : '');

/* Línea de estado de un canje para el cliente. */
export function redemptionLine(r: { status: string; deliveredAt: string | null; cancelledAt: string | null; cancelReason: string | null }) {
  if (r.status === 'entregado') return `Entregado el ${shortDate(r.deliveredAt)}`;
  if (r.status === 'anulado') return `Anulado el ${shortDate(r.cancelledAt)}${r.cancelReason ? ` · ${r.cancelReason}` : ''}. Te devolvimos los puntos.`;
  return 'Por retirar en el local';
}

/* Validaciones del formulario de producto (mismos límites que el server, RN-09). null = válido. */
export function costProblem(v: string): string | null {
  if (!/^\d+$/.test(v.trim())) return 'Ingresa un número entero de puntos.';
  const n = Number(v);
  return n >= 1 && n <= 100_000 ? null : 'Entre 1 y 100.000 puntos.';
}
export function stockProblem(v: string): string | null {
  if (!v.trim()) return null;
  if (!/^\d+$/.test(v.trim())) return 'Deja vacío (sin límite) o ingresa un entero.';
  return Number(v) <= 100_000 ? null : 'Máximo 100.000.';
}
export function adjustProblems(pointsText: string, reason: string): { points?: string; reason?: string } {
  const out: { points?: string; reason?: string } = {};
  if (!/^-?\d+$/.test(pointsText.trim()) || Number(pointsText) === 0) out.points = 'Un entero distinto de 0 (negativo para restar).';
  else if (Math.abs(Number(pointsText)) > 100_000) out.points = 'Máximo 100.000.';
  const r = reason.trim();
  if (r.length < 5 || r.length > 200) out.reason = 'Escribe el motivo (5 a 200 caracteres).';
  return out;
}
