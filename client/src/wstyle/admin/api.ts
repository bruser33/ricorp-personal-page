import type { PricingView } from '../agenda/pricing';
// Cliente HTTP del panel del super admin (SPEC-34): /api/admin/… con la misma sesión (cookie httpOnly) de la agenda.
// El server valida la sesión y el rol en cada ruta; el front solo oculta botones.
import { api, API_BASE, ApiError, type Appointment, type User } from '../agenda/api';
import type { AgendaDay, CustomerHit, ProService, TimeOff, TimeOffInput } from '../pro/api';

export type MembershipStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type Decision = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'reopen';

export interface AdminAppointment extends Omit<Appointment, 'customer' | 'pricing'> {
  customer: { name: string; phone: string | null; email: string | null };
  // SPEC-38: desglose + tasa congelada; internalFeeCLP = comisión interna (no cobrada) de citas anteriores a SPEC-38.
  pricing: PricingView & { platformFeeRate: number; internalFeeCLP?: number };
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
  // SPEC-55: inasistencias anteriores del cliente y si aún se puede corregir un "no vino" (48 h).
  noShows?: number;
  canRevertNoShow?: boolean;
}

// SPEC-55: agenda de un día con una columna por barbero aprobado.
export interface AdminAgenda {
  date: string; now: string; today: string; timezone: string;
  barbers: { id: string; name: string; services: ProService[]; timeOffs: TimeOff[]; day: AgendaDay }[];
}

export interface Alert { kind: string; professionalId: string; name: string; count: number; message: string }
export interface Overview {
  today: string;
  cards: { pendingBarbers: number; today: number; pendingConfirm: number; refundsPending: number; monthRevenueCLP: number; reviewsLast7d?: number };
  alerts: Alert[];
  unread: number;
  user: User;
}
// SPEC-52: reseña vista por el super admin (incluye ocultas, el cliente y el motivo interno).
export interface AdminReview {
  id: string; rating: number; comment: string; author: string; service: string; professional: string; createdAt: string; appointmentId: string;
  status: 'visible' | 'hidden';
  customer: { name: string; email: string | null };
  hidden: { at: string | null; by: 'admin' | 'account_deleted'; reason: string } | null;
}
export interface AdminReviewList { page: number; pages: number; total: number; counts: { visible: number; hidden: number }; items: AdminReview[] }

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
  // SPEC-51: _id de su categoría (null = dato anterior a la migración → "Barbería").
  categoryId: string | null;
}
export interface ServiceInput { name?: string; description?: string; priceCLP?: number; durationMin?: number; homeServiceAllowed?: boolean; active?: boolean; archived?: boolean; updatedAt?: string; categoryId?: string }
// SPEC-51: categoría de la carta. `services` = cuántos servicios no archivados tiene (con alguno no se puede borrar).
export interface AdminCategory { _id: string; id: string; name: string; note: string; order: number; services: number; updatedAt: string }
export interface ExportCategory { id: string; name: string; note: string }
export interface ExportService { id: string; name: string; description: string; priceCLP: number; durationMin: number; category?: string; homeServiceAllowed?: boolean }

export interface Range { opens: string; closes: string }
export interface WeekDay { weekday: number; ranges: Range[] }
export interface Closure { id: string; date: string; reason: string; groupId: string | null }
export interface Schedule { timezone: string; week: WeekDay[]; closures: Closure[] }
export interface SiteHoursRow { days: string; dayCodes: string; opens: string | null; closes: string | null }
export interface ExportContent { categories?: ExportCategory[]; services: ExportService[]; hours: SiteHoursRow[] }

export interface Stats {
  from: string; to: string; timezone: string; total: number;
  byStatus: Record<string, number>;
  revenue: { totalCLP: number; onlineCLP: number; localCLP: number; pendingCLP: number };
  finished: number; averageTicketCLP: number;
  topServices: { id: string; name: string; count: number; revenueCLP: number }[];
  barbers: BarberStats[];
  homePct: number; platformFeeCLP: number;
  // SPEC-38 RN-19: costo de pagos cobrado y parte de los barberos (servicio + domicilio).
  paymentFeeCLP?: number; barbersCLP?: number;
  days: { date: string; appointments: number; revenueCLP: number }[];
  // SPEC-58: reservas web por origen (utm_source normalizado; "directo" sin UTM). Solo en el panel del admin.
  byOrigin?: { origin: string; created: number; finished: number }[];
}

export type RuleKey = 'minLeadMinutes' | 'horizonDays' | 'cancelUntilMinutes' | 'confirmWithinMinutes' | 'inviteTtlHours' | 'maxActivePerCustomer';
export interface Settings {
  payments: { online: boolean; local: boolean };
  mercadoPago: { configured: boolean; mode: 'sandbox' | 'production' | null; ready: boolean };
  platformFeePercent: number;
  // SPEC-38: comisión de Mercado Pago que se traslada al cliente en la tarifa de servicio (+ IVA si corresponde).
  paymentFeePercent: number;
  paymentFeeVat: boolean;
  rules: Record<RuleKey, number>;
  // SPEC-60: venta de gift cards en línea y vigencia por defecto (meses).
  giftCards?: { onlineEnabled: boolean; validityMonths: number };
  limits: { rules: Record<RuleKey, [number, number]>; platformFeePercent: [number, number]; paymentFeePercent: [number, number] };
}
// SPEC-60
export interface GiftCardRow {
  id: string; code: string; from: string; to: string; kind: 'monto' | 'servicio'; service: { id: string; name: string } | null;
  amountCLP: number; balanceCLP: number; expiresAt: string | null; status: string; statusLabel: string; origin: 'online' | 'local';
  localMethod: string | null; blocked: boolean; discarded: boolean; createdAt: string;
}
export interface GiftCardList { counters: Record<string, number>; items: GiftCardRow[]; settings: { onlineEnabled: boolean; validityMonths: number }; online: boolean }
export interface GiftCardDetail extends GiftCardRow {
  message: string; buyerEmail: string | null; voidReason: string | null; unusableReason: string | null; token: string; url: string;
  pricing: { totalCLP: number; priceCLP: number; serviceFeeCLP: number } | null;
  payment: { mpPaymentId: string | null; paidAt: string | null; collectedAt: string | null; localMethod: string | null; refundedAt: string | null };
  activatedAt: string | null; mailedAt: string | null;
  movements: { kind: string; amountCLP: number; appointmentId: string | null; by: string | null; reason: string | null; at: string }[];
  appointments: { id: string; startsAt: string; status: string; customer: string; service: string; amountCLP: number; giftStatus: string | null }[];
}
export interface GiftIssueInput { kind: 'monto' | 'servicio'; amountCLP?: number; serviceId?: string; from: string; to: string; message: string; email?: string; localMethod: string }

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
  revertNoShow: (aid: string, reason: string) => send<AdminAppointment>(`/api/admin/appointments/${id(aid)}/revert-no-show`, 'POST', { reason }),
  agenda: (date: string) => api<AdminAgenda>(`/api/admin/agenda?${qs({ date })}`),
  customers: (q: string) => api<{ items: CustomerHit[] }>(`/api/admin/customers?${qs({ q })}`),
  barberSlots: (pid: string, q: { service?: string; date: string }) => api<{ date: string; slots: { startsAt: string; label: string }[] }>(`/api/admin/barbers/${id(pid)}/slots?${qs(q)}`),
  addBarberTimeOff: (pid: string, body: TimeOffInput) => send<{ timeOff: TimeOff }>(`/api/admin/barbers/${id(pid)}/time-off`, 'POST', body),
  removeBarberTimeOff: (pid: string, oid: string) => api<{ ok: boolean }>(`/api/admin/barbers/${id(pid)}/time-off/${id(oid)}`, { method: 'DELETE' }),

  services: () => api<{ items: AdminService[]; categories: AdminCategory[] }>('/api/admin/services'),
  createCategory: (body: { name: string; note?: string }) => send<{ category: AdminCategory }>('/api/admin/service-categories', 'POST', body),
  updateCategory: (cid: string, body: { name?: string; note?: string }) => send<{ category: AdminCategory }>(`/api/admin/service-categories/${id(cid)}`, 'PATCH', body),
  reorderCategories: (ids: string[]) => send<{ items: AdminCategory[] }>('/api/admin/service-categories/order', 'PUT', { ids }),
  removeCategory: (cid: string) => api<{ result: 'deleted' }>(`/api/admin/service-categories/${id(cid)}`, { method: 'DELETE' }),
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
  saveSettings: (body: Partial<Pick<Settings, 'payments' | 'platformFeePercent' | 'paymentFeePercent' | 'paymentFeeVat'>> & { rules?: Partial<Record<RuleKey, number>>; giftCards?: Partial<{ onlineEnabled: boolean; validityMonths: number }> }) => send<Settings>('/api/admin/settings', 'PUT', body),
  // SPEC-60: gift cards.
  giftCards: (q: { q?: string; status?: string }) => api<GiftCardList>(`/api/admin/gift-cards?${qs(q)}`),
  giftCard: (gid: string) => api<GiftCardDetail>(`/api/admin/gift-cards/${id(gid)}`),
  issueGiftCard: (body: GiftIssueInput) => send<GiftCardDetail>('/api/admin/gift-cards', 'POST', body),
  voidGiftCard: (gid: string, reason: string) => send<GiftCardDetail>(`/api/admin/gift-cards/${id(gid)}/void`, 'POST', { reason }),
  extendGiftCard: (gid: string, months: number) => send<GiftCardDetail>(`/api/admin/gift-cards/${id(gid)}/extend`, 'POST', { months }),
  resendGiftCard: (gid: string, email?: string) => send<{ ok: boolean; to: string }>(`/api/admin/gift-cards/${id(gid)}/resend`, 'POST', { email }),
  // SPEC-52: reseñas (filtros: visibles/ocultas, estrellas, búsqueda por cliente o texto), ocultar y mostrar.
  reviews: (q: { status?: string; rating?: string; q?: string; page?: number }) => api<AdminReviewList>(`/api/admin/reviews?${qs({ status: q.status ?? '', rating: q.rating ?? '', q: q.q ?? '', page: String(q.page ?? 1) })}`),
  hideReview: (rid: string, reason = '') => send<{ ok: boolean; status: string }>(`/api/admin/reviews/${id(rid)}/hide`, 'POST', { reason }),
  showReview: (rid: string) => send<{ ok: boolean; status: string }>(`/api/admin/reviews/${id(rid)}/show`, 'POST'),
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
