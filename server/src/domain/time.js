/* Zona horaria del negocio (RN-01). Todo se guarda en UTC; se muestra e interpreta
   en la zona del Business (America/Santiago). Solo Intl, sin dependencias.

   Chile cambia la hora a medianoche: en abril la hora 23:00–23:59 del sábado se
   repite y en septiembre la hora 00:00–00:59 del domingo no existe. Para que eso
   no genere horas duplicadas ni inexistentes, las horas ofrecidas se generan
   recorriendo instantes UTC (no horas de reloj) y se rotulan después. */

export const SLOT_MS = 15 * 60 * 1000;
const MIN = 60 * 1000;

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      })
    );
  }
  return fmtCache.get(tz);
}

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/* Hora de reloj en `tz` para un instante. weekday ISO: 1 = lunes … 7 = domingo. */
export function wallClock(ms, tz) {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday],
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

/* Offset de `tz` en ms para un instante UTC (p.ej. -3 h → -10800000). */
export function offsetMs(ms, tz) {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/* Instante UTC de una hora de reloj local ('YYYY-MM-DD', 'HH:mm'). '24:00' = medianoche
   siguiente. Si la hora no existe (salto de septiembre) devuelve el primer instante
   válido posterior; si se repite (abril) devuelve la primera ocurrencia. */
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  /* Dos candidatos (offset antes y después); se queda con el que reproduce la hora pedida. */
  const o1 = offsetMs(wall - offsetMs(wall, tz), tz);
  const candidates = [wall - offsetMs(wall - 12 * 60 * MIN, tz), wall - offsetMs(wall + 12 * 60 * MIN, tz), wall - o1].sort((a, b) => a - b);
  for (const c of candidates) {
    const w = wallClock(c, tz);
    if (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) === wall) return c;
  }
  /* Hora inexistente: el instante del salto. */
  const before = wall - offsetMs(wall - 12 * 60 * MIN, tz);
  return before;
}

/* Fecha local 'YYYY-MM-DD' + n días (aritmética de calendario, sin zona). */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* Día de la semana ISO de una fecha de calendario. */
export function isoWeekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(s);

/* Redondeos a la grilla de 15 min (Chile tiene offsets de horas enteras: la grilla
   UTC coincide con la local). */
export const floorSlot = (ms) => Math.floor(ms / SLOT_MS) * SLOT_MS;
export const ceilSlot = (ms) => Math.ceil(ms / SLOT_MS) * SLOT_MS;

/* "sábado 4 de abril, 16:30" en la zona del negocio. */
export function formatLong(ms, tz) {
  const date = new Intl.DateTimeFormat('es-CL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  return `${date}, ${wallClock(ms, tz).time}`;
}
