// Funciones puras de la agenda (probadas en util.test.ts). Las validaciones son las mismas del server
// (server/src/lib/validate.js), que sigue siendo la autoridad.

export const TZ = 'America/Santiago';
export const MAX_NOTE = 300;

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.trim().length <= 254;

/* Celular chileno → E.164 (+569XXXXXXXX) o null. */
export function clMobile(s: string): string | null {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('569')) return '+' + d;
  if (d.length === 9 && d.startsWith('9')) return '+56' + d;
  return null;
}
/* "+56912345678" → "+56 9 1234 5678" */
export const prettyPhone = (e164: string | null) => (e164 && /^\+569\d{8}$/.test(e164) ? `+56 9 ${e164.slice(4, 8)} ${e164.slice(8)}` : e164 ?? '');

export function weakPassword(p: string, email = ''): boolean {
  if (p.length < 8 || p.length > 200) return true;
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return true;
  return Boolean(email) && p.trim().toLowerCase() === email.trim().toLowerCase();
}

/* Mensaje por código de campo del server (CB-09). */
export const FIELD_MESSAGES: Record<string, string> = {
  invalid_email: 'Revisa el correo: falta algo (ej. nombre@correo.cl).',
  required: 'Este dato es obligatorio.',
  invalid_phone: 'Ingresa un celular chileno: +56 9 XXXX XXXX.',
  weak_password: 'Mínimo 8 caracteres, con al menos una letra y un número, y distinta de tu correo.',
  too_long: `Máximo ${MAX_NOTE} caracteres.`,
  invalid_service: 'Elige un servicio de la carta.',
  invalid_professional: 'Ese barbero no está disponible para este servicio.',
  self_booking: 'No puedes reservar contigo mismo.',
  invalid_start: 'Elige una hora.',
};
export const fieldMessage = (code?: string) => (code ? FIELD_MESSAGES[code] ?? 'Revisa este dato.' : undefined);

export const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/* ─── Fechas (todo en la zona del local) */
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/* 'YYYY-MM-DD' local de un instante. */
export const localDate = (d: Date | number | string) => dateFmt.format(new Date(d));
export const localTime = (d: Date | number | string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
/* "lunes 2 de noviembre" */
export const longDay = (date: string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date + 'T12:00:00Z'));
/* "2 de noviembre, 16:30" (como la tarjeta de Styluxe). */
export const dayMonthTime = (iso: string) =>
  `${new Intl.DateTimeFormat('es-CL', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))}, ${localTime(iso)}`;

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const WEEK_LABELS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
export const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 15)));

/* Grilla del mes con la semana empezando el lunes (LU MA MI JU VI SA DO): null = celda vacía. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/* ─── .ics (asunción 11: "Agregar al calendario") */
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
export function buildIcs(a: { id: string; startsAt: string; endsAt: string; title: string; location: string; url: string }, now = new Date()) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WS Style//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}@wstyle`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(a.startsAt)}`,
    `DTEND:${icsDate(a.endsAt)}`,
    `SUMMARY:${icsText(a.title)}`,
    `LOCATION:${icsText(a.location)}`,
    `URL:${a.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/* ─── Selección en curso (sessionStorage con try/catch: modo privado o storage lleno no rompen el flujo). */
export interface Selection {
  serviceId?: string;
  professionalId?: string;   // id | 'any'
  date?: string;
  startsAt?: string;
  mode?: 'shop' | 'home';
  address?: { street: string; commune: string; details: string };
  note?: string;
}
const KEY = 'wstyle-reserva';
export function loadSelection(): Selection {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as Selection;
  } catch {
    return {};
  }
}
export function saveSelection(s: Selection) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin storage: la selección vive solo en memoria y en la URL */
  }
}
export function clearSelection() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}

/* La URL de retorno lleva la selección (ida y vuelta a Facebook): /wstyle/reservar/?servicio=…&barbero=…&inicio=… */
export function selectionToQuery(s: Selection) {
  const q = new URLSearchParams();
  if (s.serviceId) q.set('servicio', s.serviceId);
  if (s.professionalId) q.set('barbero', s.professionalId);
  if (s.startsAt) q.set('inicio', s.startsAt);
  if (s.mode === 'home') q.set('modo', 'domicilio');
  return q.toString();
}
export function selectionFromQuery(search: string): Selection {
  const q = new URLSearchParams(search);
  const s: Selection = {};
  if (q.get('servicio')) s.serviceId = q.get('servicio')!;
  if (q.get('barbero')) s.professionalId = q.get('barbero')!;
  const inicio = q.get('inicio');
  if (inicio && !Number.isNaN(Date.parse(inicio))) {
    s.startsAt = new Date(inicio).toISOString();
    s.date = localDate(inicio);
  }
  if (q.get('modo') === 'domicilio') s.mode = 'home';
  return s;
}

export const STATUS_TONE: Record<string, 'wait' | 'ok' | 'warn' | 'off'> = {
  pendiente_pago: 'wait', pendiente: 'wait', invitacion_enviada: 'wait', propuesta_cambio: 'warn',
  confirmada: 'ok', en_curso: 'ok', terminada: 'off', cancelada: 'off', expirada: 'off', no_asistio: 'off',
};
