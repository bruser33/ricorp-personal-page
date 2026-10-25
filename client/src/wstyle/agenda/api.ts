// Cliente HTTP de la agenda (SPEC-32). Misma base que Contacto (VITE_API_URL). La sesión viaja en una cookie
// httpOnly: front y API tienen que estar en el MISMO host (localhost ↔ localhost; 127.0.0.1 es otro sitio y la
// cookie no viaja). Todo error vuelve como ApiError con el código estable del server.

export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  data: Record<string, unknown>;
  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = (data.fields as Record<string, string>) ?? {};
    this.data = data;
  }
}

/* status 0 = no hubo respuesta (red caída, API dormida o apagada). */
export const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0;

export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 30_000 } = init;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos conectar con la agenda');
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* sin JSON */
  }
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Algo salió mal'), data);
  return data as T;
}

/* CB-15: Render free "duerme" la API; el primer pedido puede tardar. Reintenta hasta `windowMs` (30 s) mientras no
   haya respuesta, avisando con onWaking para mostrar "Despertando la agenda…". Un error con respuesta no se reintenta. */
export async function wakeAndGet<T>(path: string, { windowMs = 30_000, onWaking }: { windowMs?: number; onWaking?: () => void } = {}): Promise<T> {
  const started = Date.now();
  const slow = setTimeout(() => onWaking?.(), 2500);
  try {
    for (;;) {
      try {
        return await api<T>(path, { timeoutMs: Math.max(1000, windowMs - (Date.now() - started)) });
      } catch (e) {
        if (!isNetwork(e) || Date.now() - started >= windowMs - 1000) throw e;
        onWaking?.();
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  } finally {
    clearTimeout(slow);
  }
}

// ─── Tipos de la API
export interface User { id: string; name: string; email: string | null; emailVerified: boolean; phone: string | null; roles: string[]; providers: string[] }
export interface CatalogService { id: string; name: string; description: string; priceCLP: number; durationMin: number; homeServiceAllowed: boolean }
export interface CatalogPro { id: string; name: string; specialty: string; photo: string | null; homeService: { surchargeCLP: number; radiusKm: number } | null; serviceIds: string[] }
export interface Catalog {
  business: {
    name: string; timezone: string; address?: { street?: string; city?: string }; whatsapp: string | null; policies: { title: string; text: string }[];
    settings: { minLeadMinutes: number; horizonDays: number; cancelUntilMinutes: number };
    // SPEC-34: horario en el formato de site.json, contacto y formas de pago habilitadas por el admin.
    hoursRows?: { days: string; dayCodes: string; opens: string | null; closes: string | null }[];
    contact?: { whatsapp: string | null; phone: string | null; address?: { street?: string; city?: string; region?: string } };
    payments?: { online: boolean; local: boolean };
  };
  services: CatalogService[];
  professionals: CatalogPro[];
}
export interface Slot { startsAt: string; label: string; professionalIds: string[] }
export interface Availability { timezone: string; days: { date: string; slots: Slot[] }[] }
export interface Quote { distanceKm: number; formatted: string; priceCLP: number; professionals: { id: string; surchargeCLP: number; totalCLP: number }[] }
export type Action = 'cancel' | 'accept' | 'counter' | 'confirm' | 'propose' | 'start' | 'finish' | 'no_show' | 'pay' | 'pay_local';
// SPEC-35: pago de la cita. method 'local' | 'online'; holdUntil = hasta cuándo se retiene la hora mientras se paga.
// SPEC-37: forma de cobro en el local y respaldo tributario (voucher MP o boleta SII) cuando existe.
export interface Payment {
  method: string; status: string; holdUntil?: string; paidAt?: string; refundedAt?: string; collectedAt?: string;
  localMethod?: string; backing?: { kind: 'voucher_mp' | 'boleta_sii'; label: string; number: string | null };
}
export interface Appointment {
  id: string; status: string; statusLabel: string;
  service: { id: string; name: string; durationMin: number };
  professional: { id: string; name: string };
  startsAt: string; endsAt: string; when: string; timezone: string;
  location: { kind: 'shop' | 'home'; address?: string; distanceKm?: number };
  pricing: { priceCLP: number; surchargeCLP: number; totalCLP: number };
  payment: Payment;
  note: string;
  proposal: { startsAt: string; when: string; expiresAt?: string } | null;
  actions: Action[];
  role: 'client' | 'barber' | 'admin';
  whatsapp: string | null; shopWhatsapp: string | null;
}

export const auth = {
  config: () => api<{ facebook: boolean }>('/api/auth/config'),
  me: () => api<{ user: User }>('/api/auth/me').then((r) => r.user),
  emailStatus: (email: string) => api<{ exists: boolean; hasPassword: boolean }>('/api/auth/email-status', { method: 'POST', body: { email } }),
  register: (body: { email: string; name: string; phone: string; password: string }) => api<{ user: User; verificationSent: boolean }>('/api/auth/register', { method: 'POST', body }),
  login: (email: string, password: string) => api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } }).then((r) => r.user),
  logout: () => api<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: {} }),
  update: (body: { name?: string; phone?: string }) => api<{ user: User }>('/api/auth/me', { method: 'PATCH', body }).then((r) => r.user),
  addClientRole: () => api<{ user: User }>('/api/auth/me/client-role', { method: 'POST', body: {} }).then((r) => r.user),
  resendVerification: () => api<{ ok: boolean }>('/api/auth/resend-verification', { method: 'POST', body: {} }),
  verifyEmail: (token: string) => api<{ ok: boolean }>('/api/auth/verify-email', { method: 'POST', body: { token } }),
  forgot: (email: string) => api<{ message: string }>('/api/auth/forgot', { method: 'POST', body: { email } }),
  reset: (token: string, password: string) => api<{ ok: boolean }>('/api/auth/reset', { method: 'POST', body: { token, password } }),
  remove: () => api<{ ok: boolean }>('/api/auth/me', { method: 'DELETE' }),
  fbLink: (token: string, password: string) => api<{ user: User; returnTo?: string }>('/api/auth/facebook/link', { method: 'POST', body: { token, password } }),
  fbComplete: (token: string, email: string, phone: string) => api<{ user?: User; pending?: string; returnTo?: string }>('/api/auth/facebook/complete', { method: 'POST', body: { token, email, phone } }),
  facebookStartUrl: (returnTo: string) => `${API_BASE}/api/auth/facebook/start?r=${encodeURIComponent(returnTo)}`,
};

export const agenda = {
  catalog: (onWaking?: () => void) => wakeAndGet<Catalog>('/api/wstyle/catalog', { onWaking }),
  availability: (q: { service: string; professional: string; from: string; to: string; mode: string; appointment?: string }) =>
    api<Availability>('/api/wstyle/availability?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])),
  quote: (body: { serviceId: string; professionalId: string; address: { street: string; commune: string; details?: string } }) => api<Quote>('/api/wstyle/quote', { method: 'POST', body }),
  create: (body: Record<string, unknown>) => api<{ ok: boolean; id: string; mailOk?: boolean; appointment: Appointment }>('/api/wstyle/appointments', { method: 'POST', body }),
  mine: () => api<{ upcoming: Appointment[]; past: Appointment[] }>('/api/wstyle/appointments/mine'),
  // inv: token del link de una invitación del barbero (SPEC-33 RN-12); asocia la cita a quien la abre.
  get: (id: string, inv?: string | null) => api<Appointment>(`/api/wstyle/appointments/${encodeURIComponent(id)}${inv ? `?inv=${encodeURIComponent(inv)}` : ''}`),
  act: (id: string, action: Action, body: Record<string, unknown> = {}) =>
    api<Appointment>(`/api/wstyle/appointments/${encodeURIComponent(id)}/${action === 'no_show' ? 'no-show' : action === 'pay_local' ? 'pay-local' : action}`, { method: 'POST', body }),
  // SPEC-35: el server crea la preferencia de Checkout Pro y devuelve a dónde redirigir (el token nunca pasa por acá).
  checkout: (id: string) => api<{ initPoint: string; preferenceId: string; holdUntil: string }>(`/api/wstyle/appointments/${encodeURIComponent(id)}/checkout`, { method: 'POST', body: {} }),
};
