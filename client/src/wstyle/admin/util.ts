// Funciones puras del panel del super admin (probadas en util.test.ts).
import type { AdminService, ExportContent, MembershipStatus, WeekDay } from './api';

export type AdminSection = 'inicio' | 'barberos' | 'citas' | 'carta' | 'horario' | 'estadisticas' | 'configuracion' | 'auditoria';
export const SECTIONS: { key: AdminSection; label: string; path: string }[] = [
  { key: 'inicio', label: 'Inicio', path: '/wstyle/admin/' },
  { key: 'barberos', label: 'Barberos', path: '/wstyle/admin/barberos/' },
  { key: 'citas', label: 'Citas', path: '/wstyle/admin/citas/' },
  { key: 'carta', label: 'Carta', path: '/wstyle/admin/carta/' },
  { key: 'horario', label: 'Horario', path: '/wstyle/admin/horario/' },
  { key: 'estadisticas', label: 'Estadísticas', path: '/wstyle/admin/estadisticas/' },
  { key: 'configuracion', label: 'Configuración', path: '/wstyle/admin/configuracion/' },
  { key: 'auditoria', label: 'Auditoría', path: '/wstyle/admin/auditoria/' },
];

/* /wstyle/admin/carta/ → 'carta'. Cualquier otra cosa bajo /wstyle/admin/ → 'inicio'. */
export function sectionFromPath(pathname: string): AdminSection {
  const m = (pathname.replace(/\/+$/, '') + '/').match(/\/wstyle\/admin\/([a-z]+)\/$/);
  const key = m?.[1] as AdminSection | undefined;
  return key && SECTIONS.some((s) => s.key === key) ? key : 'inicio';
}

export const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = { pending: 'Por aprobar', approved: 'Aprobado', rejected: 'Rechazado', suspended: 'Suspendido' };
export const MEMBERSHIP_TONE: Record<MembershipStatus, 'wait' | 'ok' | 'off' | 'warn'> = { pending: 'wait', approved: 'ok', rejected: 'off', suspended: 'warn' };

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Por cobrar', cobrado: 'Cobrado', pago_pendiente: 'Terminó sin cobrar', pagado: 'Pagado en línea', reembolso_pendiente: 'Reembolso pendiente',
  // SPEC-35 (en línea)
  en_proceso: 'Pago en proceso', rechazado: 'Pago rechazado', reembolsado: 'Reembolsado', contracargo: 'Contracargo',
};
// "pendiente" significa "por cobrar en el local" o "esperando el pago en línea" según el método.
export const paymentLabel = (p: { method: string; status: string }) =>
  p.method === 'online' && p.status === 'pendiente' ? 'Esperando el pago' : PAYMENT_STATUS_LABEL[p.status] ?? p.status;
export const STATUS_OPTIONS: [string, string][] = [
  ['pendiente', 'Esperando confirmación'], ['confirmada', 'Confirmada'], ['propuesta_cambio', 'Propuesta de cambio'], ['invitacion_enviada', 'Invitación enviada'],
  ['en_curso', 'En curso'], ['terminada', 'Terminada'], ['cancelada', 'Cancelada'], ['expirada', 'Expirada'], ['no_asistio', 'No asistió'], ['pendiente_pago', 'Esperando el pago'],
];

export const WEEKDAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/* CB-08: el HTML publicado (services.json) tiene precios/servicios distintos a los de la BD. */
export interface PriceDiff { id: string; name: string; published: number | null; current: number | null }
export function publishedDiff(published: { id?: string; name?: string; priceCLP?: unknown }[], current: Pick<AdminService, 'id' | 'name' | 'priceCLP' | 'active' | 'archived'>[]): PriceDiff[] {
  const live = current.filter((s) => s.active && !s.archived);
  const out: PriceDiff[] = [];
  for (const s of live) {
    const p = published.find((x) => x.id === s.id);
    const price = typeof p?.priceCLP === 'number' ? p.priceCLP : p ? Number(p.priceCLP) : null;
    if (!p || price !== s.priceCLP) out.push({ id: s.id, name: s.name, published: p ? price : null, current: s.priceCLP });
  }
  for (const p of published) if (p.id && !live.some((s) => s.id === p.id)) out.push({ id: p.id, name: String(p.name ?? p.id), published: typeof p.priceCLP === 'number' ? p.priceCLP : null, current: null });
  return out;
}

/* "Exportar a JSON": services.json con el mismo formato (una línea por servicio, como el archivo del repo). */
export function servicesJsonText(services: ExportContent['services']): string {
  const line = (s: ExportContent['services'][number]) =>
    '  { ' + Object.entries({ id: s.id, name: s.name, description: s.description, priceCLP: s.priceCLP, durationMin: s.durationMin }).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }';
  return '[\n' + services.map(line).join(',\n') + '\n]\n';
}
export const hoursJsonText = (hours: ExportContent['hours']) => JSON.stringify(hours, null, 2) + '\n';

/* Mes en curso (o el de una fecha) como rango de fechas locales. */
export function monthOf(date: string) {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}
export function shiftMonth(date: string, n: number) {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
export const monthLabel = (date: string) => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(date.slice(0, 7) + '-15T12:00:00Z'));

/* Validación local del horario (el server revalida): HH:mm, apertura < cierre, sin superposición. */
const toMin = (t: string) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
export function weekProblems(week: WeekDay[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const d of week) {
    const rs = [...d.ranges].sort((a, b) => toMin(a.opens) - toMin(b.opens));
    for (const [i, r] of rs.entries()) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.opens) || !/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(r.closes)) { out[d.weekday] = 'Revisa las horas.'; break; }
      if (toMin(r.opens) >= toMin(r.closes)) { out[d.weekday] = 'El cierre tiene que ser después de la apertura.'; break; }
      if (i > 0 && toMin(r.opens) < toMin(rs[i - 1].closes)) { out[d.weekday] = 'Los rangos se superponen.'; break; }
    }
  }
  return out;
}

/* Precio y duración como los valida el server (CB-06). null = válido. */
export function priceProblem(v: string): string | null {
  if (!/^\d+$/.test(v.trim())) return 'Ingresa un precio entero en pesos, sin puntos ni decimales.';
  const n = Number(v);
  return n > 0 && n <= 10_000_000 ? null : 'El precio tiene que ser mayor que 0.';
}
export function durationProblem(v: string): string | null {
  if (!/^\d+$/.test(v.trim())) return 'Ingresa los minutos.';
  const n = Number(v);
  return n >= 5 && n <= 240 && n % 5 === 0 ? null : 'Entre 5 y 240 minutos, en múltiplos de 5.';
}

/* Nombre legible de una acción de auditoría. */
export const AUDIT_LABEL: Record<string, string> = {
  'barber.approve': 'Aprobó barbero', 'barber.reject': 'Rechazó barbero', 'barber.suspend': 'Suspendió barbero', 'barber.reactivate': 'Reactivó barbero', 'barber.reopen': 'Reabrió postulación',
  'barber.profile': 'Editó perfil de barbero', 'barber.services': 'Editó servicios de barbero', 'barber.availability': 'Editó disponibilidad de barbero', 'barber.home-service': 'Editó domicilio de barbero',
  'appointment.confirm': 'Confirmó cita', 'appointment.reject': 'Rechazó cita', 'appointment.cancel': 'Canceló cita', 'appointment.propose': 'Propuso cambio', 'appointment.start': 'Inició cita',
  'appointment.finish': 'Terminó cita', 'appointment.no_show': 'Marcó inasistencia', 'appointment.collect': 'Marcó cobrado', 'appointment.reassign': 'Reasignó cita', 'appointment.create': 'Agendó cita',
  'appointments.export': 'Exportó CSV', 'service.create': 'Creó servicio', 'service.update': 'Editó servicio', 'service.price': 'Cambió precio', 'service.archive': 'Archivó servicio', 'service.delete': 'Borró servicio',
  'content.export': 'Exportó JSON', 'schedule.hours': 'Cambió horario', 'schedule.closure_add': 'Agregó cierre', 'schedule.closure_remove': 'Quitó cierre', 'settings.update': 'Cambió configuración', 'account.password': 'Cambió su contraseña',
};
