// Cliente HTTP del programa de puntos (SPEC-57): /api/wstyle/points/… con la misma sesión (cookie httpOnly) de la
// agenda. El server valida sesión y rol en cada ruta; el front solo oculta botones.
import { api, API_BASE, ApiError } from '../agenda/api';

export type EntryType = 'ganado' | 'canjeado' | 'devuelto' | 'revertido' | 'ajuste';
export type RedemptionStatus = 'pendiente_retiro' | 'entregado' | 'anulado';

export interface PointsProduct { id: string; name: string; description: string; photo: string | null; costPoints: number; stock: number | null; soldOut: boolean }
export interface AdminProduct extends PointsProduct { active: boolean; order: number; redemptions: number; updatedAt: string | null }
export interface PointsEntry { id: string; type: EntryType; label: string; points: number; detail: string; reason: string | null; at: string; appointmentId: string | null; redemptionId: string | null }
export interface Redemption {
  id: string; code: string; status: RedemptionStatus; statusLabel: string;
  product: { id: string; name: string; costPoints: number; photo: string | null };
  createdAt: string; deliveredAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  customer?: { id: string; name: string; email: string | null; deleted: boolean };
}
export interface MyPoints { program: { enabled: boolean; pointsPer1000: number }; balance: number; entries: PointsEntry[]; redemptions: Redemption[]; products: PointsProduct[] }
export interface Ledger { customer: { id: string; name: string; email: string | null }; balance: number; entries: PointsEntry[]; redemptions: Redemption[] }
export interface PointsConfig { enabled: boolean; pointsPer1000: number; limits: { pointsPer1000: [number, number] } }
export interface CustomerRow { id: string; name: string; email: string | null; balance: number }

const P = '/api/wstyle/points';
const id = (s: string) => encodeURIComponent(s);
const send = <T,>(path: string, method: string, body: unknown = {}) => api<T>(path, { method, body });

/* Producto con foto opcional: multipart (la foto va por la misma tubería que las del barbero). */
async function upload<T>(path: string, method: 'POST' | 'PATCH', fields: Record<string, string>, photo: File | null): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (photo) fd.append('photo', photo);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, body: fd, credentials: 'include', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos conectar con la agenda');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Algo salió mal'), data);
  return data as T;
}

export const points = {
  program: () => api<{ enabled: boolean }>(`${P}/program`, { timeoutMs: 4000 }),
  products: () => api<{ items: PointsProduct[] }>(`${P}/products`),
  mine: () => api<MyPoints>(`${P}/me`),
  redeem: (productId: string, idempotencyKey: string) => send<{ replay: boolean; redemption: Redemption; balance: number }>(`${P}/redeem`, 'POST', { productId, idempotencyKey }),
  ledger: (userId: string) => api<Ledger>(`${P}/customers/${id(userId)}/ledger`),

  // Equipo en el local (barbero aprobado o admin)
  redemptions: (q: { q?: string; status?: string } = {}) => api<{ items: Redemption[]; query: string | null }>(`${P}/redemptions?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  deliver: (rid: string) => send<{ redemption: Redemption }>(`${P}/redemptions/${id(rid)}/deliver`, 'POST'),
  cancel: (rid: string, reason: string) => send<{ redemption: Redemption }>(`${P}/redemptions/${id(rid)}/cancel`, 'POST', { reason }),

  // Super admin
  config: () => api<PointsConfig>(`${P}/admin/config`),
  saveConfig: (body: Partial<Pick<PointsConfig, 'enabled' | 'pointsPer1000'>>) => send<PointsConfig>(`${P}/admin/config`, 'PUT', body),
  adminProducts: () => api<{ items: AdminProduct[] }>(`${P}/admin/products`),
  createProduct: (fields: Record<string, string>, photo: File | null) => upload<{ product: AdminProduct }>(`${P}/admin/products`, 'POST', fields, photo),
  updateProduct: (pid: string, fields: Record<string, string>, photo: File | null) => upload<{ product: AdminProduct }>(`${P}/admin/products/${id(pid)}`, 'PATCH', fields, photo),
  setActive: (pid: string, active: boolean) => send<{ product: AdminProduct }>(`${P}/admin/products/${id(pid)}`, 'PATCH', { active }),
  removeProduct: (pid: string) => api<{ result: 'deleted' | 'deactivated' }>(`${P}/admin/products/${id(pid)}`, { method: 'DELETE' }),
  reorder: (ids: string[]) => send<{ items: AdminProduct[] }>(`${P}/admin/products/order`, 'PUT', { ids }),
  customers: (q = '') => api<{ items: CustomerRow[] }>(`${P}/admin/customers?${new URLSearchParams({ q })}`),
  adjust: (userId: string, pts: number, reason: string) => send<{ balance: number }>(`${P}/admin/customers/${id(userId)}/adjust`, 'POST', { points: pts, reason }),
  revert: (appointmentId: string, reason: string) => send<{ changed: boolean; points: number; balance: number }>(`${P}/admin/appointments/${id(appointmentId)}/revert`, 'POST', { reason }),
};

export const photoSrc = (url: string | null) => (url && url.startsWith('/api/') ? API_BASE + url : url);
