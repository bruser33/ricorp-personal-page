// SPEC-56: utilidades del panel para la seña (probadas en deposit.test.ts).

// RUT chileno con dígito verificador (módulo 11). Mismo criterio que el server (domain/deposits.js).
export function isRut(raw: string): boolean {
  const s = raw.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(s)) return false;
  const body = s.slice(0, -1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return s.slice(-1) === (r === 11 ? '0' : r === 10 ? 'K' : String(r));
}

// Motivos del rechazo (las claves son las del server).
export const REJECT_REASONS: [string, string][] = [['monto', 'Monto distinto'], ['no_llego', 'No llegó a la cuenta'], ['ilegible', 'Comprobante ilegible'], ['otro', 'Otro']];
