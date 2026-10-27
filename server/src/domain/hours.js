/* Horario semanal del local (SPEC-34 RN-05/RN-06). En la BD (Business.hours) va una
   entrada por rango: { weekday, opens, closes }; un día cerrado es una entrada con
   opens/closes null (o ninguna). El panel trabaja con la forma "semana":
   [{ weekday, ranges: [{ opens, closes }] }] y la landing / services.json con las filas
   de site.json: [{ days: 'Lunes a viernes', dayCodes: 'Mo-Fr', opens, closes }]. */
import { isTime } from './time.js';

const CODES = ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const MAX_RANGES_PER_DAY = 3;

const toMin = (t) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));

/* Entradas de la BD → semana (los 7 días, rangos ordenados). */
export function entriesToWeek(entries = []) {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    ranges: entries
      .filter((h) => h.weekday === weekday && h.opens && h.closes)
      .map((h) => ({ opens: h.opens, closes: h.closes }))
      .sort((a, b) => toMin(a.opens) - toMin(b.opens)),
  }));
}

/* Semana → entradas de la BD (un día sin rangos queda como cerrado explícito). */
export function weekToEntries(week) {
  const out = [];
  for (const d of week) {
    if (!d.ranges.length) out.push({ weekday: d.weekday, opens: null, closes: null });
    for (const r of d.ranges) out.push({ weekday: d.weekday, opens: r.opens, closes: r.closes });
  }
  return out;
}

/* Valida la semana que manda el panel. Devuelve { week } o { error, message }. */
export function parseWeek(raw) {
  if (!Array.isArray(raw)) return { error: 'invalid_hours', message: 'Falta el horario' };
  const byDay = new Map();
  for (const d of raw) {
    const weekday = Number(d?.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || byDay.has(weekday)) return { error: 'invalid_hours', message: 'Día inválido' };
    const ranges = Array.isArray(d.ranges) ? d.ranges : [];
    if (ranges.length > MAX_RANGES_PER_DAY) return { error: 'too_many_ranges', message: `Máximo ${MAX_RANGES_PER_DAY} rangos por día` };
    const clean = [];
    for (const r of ranges) {
      if (!isTime(r?.opens) || !isTime(r?.closes) || r.opens === '24:00') return { error: 'invalid_time', message: `${NAMES[weekday]}: revisa las horas` };
      if (toMin(r.opens) >= toMin(r.closes)) return { error: 'invalid_range', message: `${NAMES[weekday]}: la hora de cierre tiene que ser posterior a la de apertura` };
      clean.push({ opens: r.opens, closes: r.closes });
    }
    clean.sort((a, b) => toMin(a.opens) - toMin(b.opens));
    for (let i = 1; i < clean.length; i++) {
      if (toMin(clean[i].opens) < toMin(clean[i - 1].closes)) return { error: 'overlapping_ranges', message: `${NAMES[weekday]}: los rangos se superponen` };
    }
    byDay.set(weekday, clean);
  }
  return { week: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, ranges: byDay.get(weekday) || [] })) };
}

/* ¿[startMin, endMin) cabe entero en algún rango del día? */
export function fitsInRanges(ranges, startMin, endMin) {
  return ranges.some((r) => toMin(r.opens) <= startMin && endMin <= toMin(r.closes));
}

/* Semana → filas de site.json, agrupando días SEGUIDOS con el mismo horario
   ("Lunes a viernes 10:00–20:00"). Un día con dos rangos da dos filas con el mismo rótulo. */
export function weekToSiteRows(week) {
  const key = (d) => JSON.stringify(d.ranges);
  const groups = [];
  for (const d of [...week].sort((a, b) => a.weekday - b.weekday)) {
    const last = groups.at(-1);
    if (last && key(last.days.at(-1)) === key(d) && last.days.at(-1).weekday === d.weekday - 1) last.days.push(d);
    else groups.push({ days: [d] });
  }
  const rows = [];
  for (const g of groups) {
    const first = g.days[0].weekday;
    const lastDay = g.days.at(-1).weekday;
    const days = first === lastDay ? NAMES[first] : lastDay === first + 1 ? `${NAMES[first]} y ${NAMES[lastDay].toLowerCase()}` : `${NAMES[first]} a ${NAMES[lastDay].toLowerCase()}`;
    const dayCodes = first === lastDay ? CODES[first] : lastDay === first + 1 ? `${CODES[first]},${CODES[lastDay]}` : `${CODES[first]}-${CODES[lastDay]}`;
    const ranges = g.days[0].ranges;
    if (!ranges.length) rows.push({ days, dayCodes, opens: null, closes: null });
    for (const r of ranges) rows.push({ days, dayCodes, opens: r.opens, closes: r.closes });
  }
  return rows;
}
