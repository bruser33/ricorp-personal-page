// Cliente HTTP del panel del super admin (SPEC-34): /api/admin/… con la misma sesión (cookie httpOnly) de la agenda.
// El server valida la sesión y el rol en cada ruta; el front solo oculta botones.
import { api, API_BASE, ApiError, type Appointment, type User } from '../agenda/api';

export type MembershipStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type Decision = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'reopen';

export interface AdminAppointment extends Omit<Appointment, 'customer' | 'pricing'> {
  customer: { name: string; phone: string | null; email: string | null };
  pricing: { priceCLP: number; surchargeCLP: number; totalCLP: number; platformFeeCLP: number; platformFeeRate: number };
  // SPEC-35: en línea trae el id del pago en Mercado Pago, el error del último reembolso y los pagos duplicados (CB-08).
  payment: {
    method: string; status: string; holdUntil?: string; mpPaymentId?: string | null; refundError?: string | null; refundInFlight?: boolean;
    localMethod?: string; backing?: { kind: 'voucher_mp' | 'boleta_sii'; label: string; number: string | null };
    duplicates?: { mpPaymentId: string; amountCLP: number; status: string; refundError: string | null }[];
  };
  canRefund?: boolean;
  history: { at: string; from: string | null; to: string; by: string; reason?: string }[];
  source: string;
  canReassign: boolean;
  canCollect: boolean;
}

export interface Alert { kind: string; professionalId: string; name: string; count: number; message: string }
export interface Overview {
  today: string;
  cards: { pendingBarbers: number; today: number; pendingConfirm: number; refundsPending: number; monthRevenueCLP: number };
  alerts: Alert[];
  unread: number;
  user: User;
}
export interface AdminNotification { id: string; kind: string; title: string; body: string; appointmentId: string | null; professionalId: string | null; createdAt: string; read: boolean }

export interface BarberRow { id: string; name: string; email: string | null; phone: string | null; photo: string | null; status: MembershipStatus; reason: string | null; submittedAt: string | null; createdAt: string | null }
export interface BarberStats { id: string; name: string; appointments: number; finished: number; revenueCLP: number; cancellations: number; noShows: number; bookedMin: number; availableMin: number; occupancyPct: number }
export interface BarberDetail {
  professional: {
    id: string; displayName: string; phone: string | null; bio: string; email: string | null; termsAcceptedAt: string | null;
    photos: { id: string; url: string }[];
    homeService: { enabled: boolean; surchargeCLP: number; radiusKm: number; travelBufferMin: number };
  };
  membership: { status: MembershipStatus; reason: string | null; submittedAt: string | null; decidedAt: string | null };
  services: { id: string; name: string; priceCLP: number; durationMin: number; active: boolean; selected: boolean }[];
  rules: { weekday: number; start: string; end: string }[];
  futureAppointments: AdminAppointment[];
  metrics: { appointments: number; finished: number; cancelled: number; noShows: number; revenueCLP: number; month: BarberStats | null };
  self: boolean;
}

export interface AdminService {
  _id: string; id: string; name: string; description: string; priceCLP: number; durationMin: number;
  homeServiceAllowed: boolean; active: boolean; archived: boolean; order: number; appointments: number; updatedAt: string;
}
export interface ServiceInput { name?: string; description?: string; priceCLP?: number; durationMin?: number; homeServiceAllowed?: boolean; active?: boolean; archived?: boolean; updatedAt?: string }

export interface Range { opens: string; closes: string }
export interface WeekDay { weekday: number; ranges: Range[] }
export interface Closure { id: string; date: string; reason: string; groupId: string | null }
export interface Schedule { timezone: string; week: WeekDay[]; closures: Closure[] }
export interface SiteHoursRow { days: string; dayCodes: string; opens: string | null; closes: string | null }
export interface ExportContent { services: { id: string; name: string; description: string; priceCLP: number; durationMin: number }[]; hours: SiteHoursRow[] }

export interface Stats {
  from: string; to: string; timezone: string; total: number;
  byStatus: Record<string, number>;
  revenue: { totalCLP: number; onlineCLP: number; localCLP: number; pendingCLP: number };
  finished: number; averageTicketCLP: number;
  topServices: { id: string; name: string; count: number; revenueCLP: number }[];
  barbers: BarberStats[];
  homePct: number; platformFeeCLP: number;
  days: { date: string; appointments: number; revenueCLP: number }[];
}

export type RuleKey = 'minLeadMinutes' | 'horizonDays' | 'cancelUntilMinutes' | 'confirmWithinMinutes' | 'inviteTtlHours' | 'maxActivePerCustomer';
export interface Settings {
  payments: { online: boolean; local: boolean };
  mercadoPago: { configured: boolean; mode: 'sandbox' | 'production' | null; ready: boolean };
  platformFeePercent: number;
  rules: Record<RuleKey, number>;
  limits: { rules: Record<RuleKey, [number, number]>; platformFeePercent: [number, number] };
}
export interface AuditItem { id: string; at: string; actor: string; action: string; entity: string | null; entityId: string | null; summary: string; before: unknown; after: unknown }

export interface ApptFilters { from?: string; to?: string; professional?: string; status?: string; paymentMethod?: string; paymentStatus?: string; mode?: string; q?: string }
const qs = (q: object) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
const send = <T,>(path: string, method: string, body: unknown = {}) => api<T>(path, { method, body });
const id = encodeURIComponent;

export const admin = {
  status: () => api<{ configured: boolean }>('/api/admin/status'),
  overview: () => api<Overview>('/api/admin/overview'),
  notifications: () => api<{ unread: number; items: AdminNotification[] }>('/api/admin/notifications'),
  markRead: () => send<{ ok: boolean }>('/api/admin/notifications/read', 'POST'),
  changePassword: (current: string, password: string) => send<{ ok: boolean }>('/api/admin/me/password', 'POST', { current, password }),

  barbers: (status: string, q = '') => api<{ items: BarberRow[]; counts: Record<MembershipStatus, number> }>(`/api/admin/barbers?${qs({ status, q })}`),
  barber: (pid: string) => api<BarberDetail>(`/api/admin/barbers/${id(pid)}`),
  decide: (pid: string, action: Decision, reason = '') => send<{ membership: { status: MembershipStatus; reason: string | null }; futureAppointments: AdminAppointment[] }>(`/api/admin/barbers/${id(pid)}/${action}`, 'POST', { reason }),

  appointments: (f: ApptFilters) => api<{ items: AdminAppointment[]; truncated: boolean }>(`/api/admin/appointments?${qs(f)}`),
  csvUrl: (f: ApptFilters) => `${API_BASE}/api/admin/appointments.csv?${qs(f)}`,
  appointment: (aid: string) => api<AdminAppointment>(`/api/admin/appointments/${id(aid)}`),
  act: (aid: string, action: string, body: Record<string, unknown> = {}) => send<AdminAppointment>(`/api/admin/appointments/${id(aid)}/${action === 'no_show' ? 'no-show' : action}`, 'POST', body),
  // SPEC-37: con la forma de pago y, si ya se emitió, el N° de boleta SII.
  collect: (aid: string, body: { method?: string; boletaNumber?: string } = {}) => send<AdminAppointment>(`/api/admin/appointments/${id(aid)}/collect`, 'POST', body),
  // SPEC-35 RN-09: reembolso total en Mercado Pago (paymentId = un pago duplicado; sin él, el pago de la cita).
  refund: (aid: string, paymentId?: string) => send<AdminAppointment>(`/api/admin/appointments/${id(aid)}/refund`, 'POST', paymentId ? { paymentId } : {}),
  reassignOptions: (aid: string) => api<{ options: { id: string; name: string }[] }>(`/api/admin/appointments/${id(aid)}/reassign-options`),
  reassign: (aid: string, professionalId: string) => send<AdminAppointment>(`/api/admin/appointments/${id(aid)}/reassign`, 'POST', { professionalId }),
  createAppointment: (body: Record<string, unknown>) => send<AdminAppointment>('/api/admin/appointments', 'POST', body),

  services: () => api<{ items: AdminService[] }>('/api/admin/services'),
  createService: (body: ServiceInput) => send<{ service: AdminService }>('/api/admin/services', 'POST', body),
  updateService: (sid: string, body: ServiceInput) => send<{ service: AdminService; unbookableBarbers: string[] }>(`/api/admin/services/${id(sid)}`, 'PATCH', body),
  removeService: (sid: string) => api<{ result: 'archived' | 'deleted'; unbookableBarbers: string[] }>(`/api/admin/services/${id(sid)}`, { method: 'DELETE' }),
  exportContent: () => api<ExportContent>('/api/admin/export'),

  schedule: () => api<Schedule>('/api/admin/schedule'),
  setHours: (week: WeekDay[]) => send<Schedule>('/api/admin/schedule/hours', 'PUT', { week }),
  addClosure: (body: { fromDate: string; toDate: string; reason: string }) => send<Schedule>('/api/admin/schedule/closures', 'POST', body),
  removeClosure: (cid: string) => api<Schedule>(`/api/admin/schedule/closures/${id(cid)}`, { method: 'DELETE' }),

  stats: (from: string, to: string) => api<Stats>(`/api/admin/stats?${qs({ from, to })}`),
  settings: () => api<Settings>('/api/admin/settings'),
  saveSettings: (body: Partial<Pick<Settings, 'payments' | 'platformFeePercent'>> & { rules?: Partial<Record<RuleKey, number>> }) => send<Settings>('/api/admin/settings', 'PUT', body),
  audit: (page = 1, action = '') => api<{ page: number; pages: number; total: number; items: AuditItem[] }>(`/api/admin/audit?${qs({ page: String(page), action })}`),
};

/* CSV: la descarga necesita la cookie de sesión → fetch con credenciales y un blob (un <a href> cross-origin no la manda en Safari). */
export async function downloadCsv(f: ApptFilters) {
  let res: Response;
  try {
    res = await fetch(admin.csvUrl(f), { credentials: 'include', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos conectar con la agenda');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'No pudimos exportar'), data);
  }
  return res.blob();
}
