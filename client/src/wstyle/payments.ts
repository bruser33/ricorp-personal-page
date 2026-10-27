// Pagos y respaldo tributario (SPEC-37), compartido por el panel del super admin y el del barbero.
// El server calcula todo (estados, respaldo, neto/IVA, cuadre); acá solo tipos, textos y validación local.
import { api, API_BASE, ApiError } from './agenda/api';

export type Backing = 'voucher_mp' | 'boleta_sii' | 'sin_respaldo';
export type PayStatus = 'aprobado' | 'pendiente' | 'rechazado' | 'reembolso_pendiente' | 'reembolsado' | 'contracargo' | 'por_cobrar';
export type LocalMethod = 'efectivo' | 'transferencia' | 'tarjeta';

export interface Emitter { configured: boolean; label: string; name: string | null; provider: string; providerLabel: string; declaredModel: string }

export interface PaymentRow {
  id: string;
  appointmentId: string;
  appointment: { startsAt: string; status: string };
  customer: { name: string; email?: string | null; phone?: string | null };
  professional: { id: string; name: string };
  service: { name: string };
  kind: 'online' | 'local';
  duplicate: boolean;
  date: string;
  localDate: string;
  method: string;
  methodLabel: string;
  amountCLP: number;
  lines: { kind: string; label: string; amountCLP: number }[];
  status: PayStatus;
  statusLabel: string;
  refundedAt: string | null;
  mp: { paymentId: string; status: string | null; paymentType: string | null; feeCLP?: number; netReceivedCLP?: number } | null;
  tax: { netCLP: number; ivaCLP: number; estimated: boolean };
  backing: Backing | null;
  backingLabel: string | null;
  boletaNumber: string | null;
  taxModel: string | null;
  canRegisterBoleta: boolean;
}

export interface PaymentTotals {
  count: number; approvedCount: number; approvedCLP: number; refundsCLP: number; netSalesCLP: number; mpFeesCLP: number; mpNetReceivedCLP: number;
  byBacking: Record<Backing, number>;
  unbacked: { count: number; totalCLP: number };
  porCobrar: { count: number; totalCLP: number };
}
export interface PaymentsList { from: string; to: string; timezone: string; items: PaymentRow[]; warning: string; emitter: Emitter; totals?: PaymentTotals }

export interface BackingBucket { count: number; issuedCLP: number; refundedCLP: number; netCLP: number }
export interface Difference { paymentId: string; appointmentId: string; date: string; amountCLP: number; reason: string; message: string }
export interface Rendicion {
  month: string; from: string; to: string; timezone: string;
  emitter: Emitter; estimated: boolean; warning: string;
  totals: { approvedCount: number; approvedCLP: number; refundsCount: number; refundsCLP: number; netSalesCLP: number; netCLP: number; ivaCLP: number; mpFeesCLP: number; mpNetReceivedCLP: number };
  byBacking: Record<Backing, BackingBucket>;
  cuadre: { approvedMinusRefundsCLP: number; backedCLP: number; ok: boolean; differences: Difference[] };
  unbacked: PaymentRow[];
  porCobrar: { count: number; totalCLP: number };
  tramos: { model: string; label: string; from: string; to: string; count: number; totalCLP: number }[];
  sales: PaymentRow[];
  refunds: PaymentRow[];
}

export interface PaymentFilters { from?: string; to?: string; professional?: string; method?: string; status?: string; backing?: string }

// Regla 5: la advertencia es fija (el server la manda; esta copia cubre una respuesta vieja).
export const TAX_WARNING = "El modelo voucher solo es válido si en el SII declaraste 'No emito boleta cuando recibo un pago electrónico'. Validar con contador.";

export const BACKING_LABEL: Record<Backing, string> = { voucher_mp: 'Voucher MP', boleta_sii: 'Boleta SII', sin_respaldo: 'Sin respaldo' };
export const BACKING_TONE: Record<Backing, 'ok' | 'wait' | 'warn'> = { voucher_mp: 'ok', boleta_sii: 'ok', sin_respaldo: 'warn' };
export const STATUS_TONE: Record<PayStatus, 'ok' | 'wait' | 'warn' | 'off'> = {
  aprobado: 'ok', pendiente: 'wait', rechazado: 'off', reembolso_pendiente: 'wait', reembolsado: 'off', contracargo: 'warn', por_cobrar: 'warn',
};
export const LOCAL_METHODS: [LocalMethod, string][] = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta (POS del local)']];
export const METHOD_FILTERS: [string, string][] = [['', 'Todos'], ['online', 'Mercado Pago'], ['local', 'En el local (todos)'], ...LOCAL_METHODS];
export const STATUS_FILTERS: [string, string][] = [
  ['', 'Todos'], ['aprobado', 'Aprobado'], ['pendiente', 'Pendiente'], ['rechazado', 'Rechazado'], ['reembolso_pendiente', 'Reembolso pendiente'],
  ['reembolsado', 'Reembolsado'], ['contracargo', 'Contracargo'], ['por_cobrar', 'Por cobrar'],
];

// Igual que el server (domain/tax.js): folio entero positivo; acepta "N° 1.234" o "#42". null = inválido.
export function parseBoleta(raw: string): string | null {
  const s = raw.trim().replace(/^(n\s*[°º.o]?|#)\s*/i, '').replace(/[.\s]/g, '');
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = String(Number(s));
  return n === '0' ? null : n;
}
// Vacío = válido (la boleta es opcional al cobrar).
export const boletaProblem = (raw: string) => (!raw.trim() || parseBoleta(raw) ? null : 'Escribe solo el número de folio de la boleta (p.ej. 1234).');

const qs = (q: object) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
const id = encodeURIComponent;
const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body });

export const payments = {
  adminList: (f: PaymentFilters) => api<PaymentsList>(`/api/admin/payments?${qs(f)}`),
  adminBoleta: (appointmentId: string, number: string) => post<{ payment: PaymentRow }>(`/api/admin/payments/${id(appointmentId)}/boleta`, { number }),
  rendicion: (month: string) => api<Rendicion>(`/api/admin/rendicion?${qs({ month })}`),
  proList: (f: PaymentFilters) => api<PaymentsList>(`/api/pro/payments?${qs(f)}`),
  proBoleta: (appointmentId: string, number: string) => post<{ payment: PaymentRow }>(`/api/pro/payments/${id(appointmentId)}/boleta`, { number }),
};

// CSV de la rendición: necesita la cookie de sesión → fetch con credenciales y un blob.
export async function downloadRendicionCsv(month: string) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin/rendicion.csv?${qs({ month })}`, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos conectar con la agenda');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'No pudimos exportar'), data);
  }
  return res.blob();
}
