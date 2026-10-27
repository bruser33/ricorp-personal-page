/* Celdas CSV para planillas (Excel/Sheets): comillas cuando hace falta y anti-inyección de
   fórmulas (=, +, -, @ al inicio). Un número puro (monto, reembolso negativo, un celular
   "+569…") no es fórmula peligrosa y se deja tal cual. */
export const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/* BOM: Excel abre el UTF-8 con tildes bien. */
export const csvDocument = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
