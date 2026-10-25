// Funciones puras del panel del barbero (probadas en util.test.ts). Fechas siempre en la zona del local.
import { addDays, localTime } from '../agenda/util';

export const WEEKDAYS = [
  { n: 1, short: 'Lun', long: 'lunes' },
  { n: 2, short: 'Mar', long: 'martes' },
  { n: 3, short: 'Mié', long: 'miércoles' },
  { n: 4, short: 'Jue', long: 'jueves' },
  { n: 5, short: 'Vie', long: 'viernes' },
  { n: 6, short: 'Sáb', long: 'sábado' },
  { n: 7, short: 'Dom', long: 'domingo' },
];

// Estados que ocupan agenda (los mismos del server).
export const BLOCKING = ['pendiente', 'pendiente_pago', 'invitacion_enviada', 'confirmada', 'propuesta_cambio', 'en_curso'];

// Motivos de cancelación del barbero (RN-09). Las claves son las del server.
export const CANCEL_REASONS: { code: string; label: string }[] = [
  { code: 'imprevisto', label: 'Imprevisto personal' },
  { code: 'enfermedad', label: 'Enfermedad' },
  { code: 'local', label: 'Problema con el local' },
  { code: 'otro', label: 'Otro' },
];

const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minutesOfDay = (iso: string) => hm(localTime(iso));

export interface GridDay {
  date: string;
  shop: { opens: string; closes: string } | null;
  windows: { startsAt: string; endsAt: string }[];
  appointments: { startsAt: string; endsAt: string; status: string }[];
}

// Rango vertical de la grilla (minutos del día): apertura más temprana → cierre más tarde, ampliado por citas fuera
// de ese rango; por hora completa.
export function gridRange(days: GridDay[]) {
  const opens = days.filter((d) => d.shop).map((d) => hm(d.shop!.opens));
  const closes = days.filter((d) => d.shop).map((d) => (d.shop!.closes === '24:00' ? 1440 : hm(d.shop!.closes)));
  let startMin = opens.length ? Math.min(...opens) : 600;
  let endMin = closes.length ? Math.max(...closes) : 1200;
  for (const d of days) {
    for (const a of d.appointments) {
      const s = minutesOfDay(a.startsAt);
      const e = s + Math.max(15, (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60000);
      startMin = Math.min(startMin, s);
      endMin = Math.max(endMin, e);
    }
  }
  return { startMin: Math.floor(startMin / 60) * 60, endMin: Math.min(1440, Math.ceil(endMin / 60) * 60) };
}

// Huecos de `stepMin` dentro de las ventanas de trabajo que no pisan una cita activa y no pasaron (RN-13).
export function freeCells(day: GridDay, now: number, stepMin = 30) {
  const busy = day.appointments.filter((a) => BLOCKING.includes(a.status)).map((a) => [Date.parse(a.startsAt), Date.parse(a.endsAt)]);
  const out: { startsAt: string; label: string }[] = [];
  for (const w of day.windows) {
    const we = Date.parse(w.endsAt);
    for (let t = Date.parse(w.startsAt); t + stepMin * 60000 <= we; t += stepMin * 60000) {
      const end = t + stepMin * 60000;
      if (t < now) continue;
      if (busy.some(([s, e]) => s < end && e > t)) continue;
      const startsAt = new Date(t).toISOString();
      out.push({ startsAt, label: localTime(startsAt) });
    }
  }
  return out;
}

export function blockBox(a: { startsAt: string; endsAt: string }, startMin: number, pxPerMin: number) {
  const top = (minutesOfDay(a.startsAt) - startMin) * pxPerMin;
  const height = Math.max(15, (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60000) * pxPerMin;
  return { top, height };
}

export function mondayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -wd);
}

export type AgendaView = 'day' | '3days' | 'week';
export function visibleDays(anchor: string, view: AgendaView) {
  if (view === 'day') return [anchor];
  if (view === '3days') return [0, 1, 2].map((i) => addDays(anchor, i));
  const mon = mondayOf(anchor);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i));
}

// "lun 2" para la cabecera de la grilla.
export const shortDay = (date: string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(date + 'T12:00:00Z')).replace('.', '');

export const isoWeekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
};

// Mensajes de los campos de domicilio (RN-06).
export const HOME_ERRORS: Record<string, string> = {
  surchargeCLP: 'El recargo va de $0 a $50.000.',
  radiusKm: 'El radio va de 1 a 30 km.',
  travelBufferMin: 'El margen va de 0 a 90 minutos.',
};
