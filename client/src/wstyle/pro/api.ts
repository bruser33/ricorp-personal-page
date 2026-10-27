// Cliente HTTP del panel del barbero (SPEC-33): /api/pro/… con la misma sesión (cookie httpOnly) de la agenda.
import { api, API_BASE, ApiError, type Appointment, type User } from '../agenda/api';

export interface ProPhoto { id: string; url: string }
export interface HomeService { enabled: boolean; surchargeCLP: number; radiusKm: number; travelBufferMin: number }
export interface Rule { weekday: number; start: string; end: string }
export interface TimeOff { id: string; startsAt: string; endsAt: string; reason: string }
export interface ProService { id: string; name: string; priceCLP: number; durationMin: number; homeServiceAllowed: boolean; selected?: boolean }
export type MembershipStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export interface ProMe {
  user: User;
  needsCompletion: boolean;
  emailCheckPending: boolean;
  professional: { id: string; displayName: string; phone: string | null; bio: string; photos: ProPhoto[]; homeService: HomeService };
  membership: { status: MembershipStatus; reason: string | null; submittedAt: string | null };
  business: { name: string; timezone: string; hours: { weekday: number; opens: string | null; closes: string | null }[] };
  services: ProService[];
  rules: Rule[];
  timeOffs: TimeOff[];
  platformFeeRate: number;
  unread: number;
}

export type ProAction = 'confirm' | 'reject' | 'propose' | 'reschedule' | 'cancel' | 'start' | 'finish' | 'no_show';
export interface ProAppointment extends Omit<Appointment, 'actions' | 'customer'> {
  actions: string[];
  customer: { name: string; phone: string | null };
  payment: { method: string; status: string };
  mapsUrl: string | null;
  telUrl: string | null;
  startOpensAt: string;
  noShowOpensAt: string;
  source: string;
  invite: { url: string; text: string; whatsappUrl: string | null } | null;
  expiresAt: string | null;
}
export interface AgendaDay { date: string; shop: { opens: string; closes: string } | null; windows: { startsAt: string; endsAt: string }[]; appointments: ProAppointment[] }
export interface AgendaRange {
  timezone: string; now: string; today: string;
  professional: { id: string; name: string; homeService: HomeService };
  services: ProService[];
  timeOffs: TimeOff[];
  days: AgendaDay[];
}
export interface Invitation { appointment: ProAppointment; whatsappUrl: string | null; inviteUrl: string; message: string }
export interface PanelNotification { id: string; kind: string; title: string; body: string; appointmentId: string | null; createdAt: string; read: boolean }

const json = <T,>(path: string, method: string, body: unknown = {}) => api<T>(path, { method, body });

/* Las fotos vienen como ruta de la API (/api/wstyle/photos/<id>): se le antepone la base. */
export const assetUrl = (u: string | null) => (u && u.startsWith('/api/') ? API_BASE + u : u);

export const pro = {
  me: () => api<ProMe>('/api/pro/me'),
  register: (body: { email: string; name?: string; phone?: string; password: string; acceptTerms: boolean }) =>
    json<{ user: User; existing: boolean }>('/api/pro/register', 'POST', body),
  join: (body: { phone?: string; name?: string; acceptTerms: boolean }) => json<{ user: User }>('/api/pro/join', 'POST', body),
  fbRegister: (body: { token: string; email: string; phone: string; name: string; acceptTerms: boolean }) =>
    json<{ user?: User; pending?: string }>('/api/pro/facebook/register', 'POST', body),
  facebookStartUrl: (returnTo = '/wstyle/pro/registro/') => `${API_BASE}/api/auth/facebook/start?as=barber&r=${encodeURIComponent(returnTo)}`,
  updateProfile: (body: { displayName?: string; phone?: string; bio?: string }) => json<{ professional: ProMe['professional'] }>('/api/pro/profile', 'PATCH', body),
  setServices: (serviceIds: string[]) => json<{ serviceIds: string[] }>('/api/pro/services', 'PUT', { serviceIds }),
  setAvailability: (rules: Rule[]) => json<{ rules: Rule[]; adjustments: string[] }>('/api/pro/availability', 'PUT', { rules }),
  setHomeService: (body: Partial<HomeService>) => json<{ homeService: HomeService }>('/api/pro/home-service', 'PUT', body),
  addTimeOff: (body: { fromDate: string; fromTime?: string; toDate: string; toTime?: string; reason: string }) => json<{ timeOff: TimeOff }>('/api/pro/time-off', 'POST', body),
  removeTimeOff: (id: string) => api<{ ok: boolean }>(`/api/pro/time-off/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  removePhoto: (id: string) => api<{ photos: ProPhoto[] }>(`/api/pro/photos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mainPhoto: (id: string) => json<{ photos: ProPhoto[] }>(`/api/pro/photos/${encodeURIComponent(id)}/main`, 'POST'),
  submit: () => json<ProMe>('/api/pro/submit', 'POST'),
  agenda: (from: string, to: string) => api<AgendaRange>(`/api/pro/agenda?from=${from}&to=${to}`),
  slots: (q: { service?: string; date: string; mode?: string; appointment?: string }) =>
    api<{ date: string; slots: { startsAt: string; label: string }[] }>('/api/pro/slots?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])),
  get: (id: string) => api<ProAppointment>(`/api/pro/appointments/${encodeURIComponent(id)}`),
  act: (id: string, action: ProAction, body: Record<string, unknown> = {}) =>
    json<ProAppointment & Partial<Invitation>>(`/api/pro/appointments/${encodeURIComponent(id)}/${action === 'no_show' ? 'no-show' : action}`, 'POST', body),
  invite: (body: Record<string, unknown>) => json<Invitation>('/api/pro/invitations', 'POST', body),
  notifications: () => api<{ unread: number; items: PanelNotification[] }>('/api/pro/notifications'),
  markRead: () => json<{ ok: boolean }>('/api/pro/notifications/read', 'POST'),
};

/* Subida de fotos (multipart): fetch directo, con el mismo formato de error que api(). */
export async function uploadPhotos(files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append('photos', f, f.name);
  let res: Response;
  try {
    res = await fetch(API_BASE + '/api/pro/photos', { method: 'POST', body: fd, credentials: 'include', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos conectar con la agenda');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'No pudimos subir las fotos'), data);
  return data as { photos: ProPhoto[] };
}
