/* Disponibilidad real (RN-02, RN-03, RN-04). Funciones puras: reciben los datos ya
   leídos de la BD y el "ahora" (reloj inyectable), y devuelven instantes UTC.

   Una hora h está libre si [h, h + duración) cabe entera en
     horario del local ∩ disponibilidad semanal del barbero − feriados − ausencias
   y ninguno de los bloques de 15 min de [h − traslado, h + duración + traslado)
   está ocupado por otra cita (SlotLock). */
import { SLOT_MS, addDays, ceilSlot, floorSlot, wallClock, zonedToUtc } from './time.js';

const MIN = 60 * 1000;

/* Bloques de 15 min que ocupa una cita (incluye el margen de traslado a domicilio). */
export function slotsFor(startMs, durationMin, bufferMin = 0) {
  const from = floorSlot(startMs - bufferMin * MIN);
  const to = ceilSlot(startMs + (durationMin + bufferMin) * MIN);
  const out = [];
  for (let t = from; t < to; t += SLOT_MS) out.push(t);
  return out;
}

function intersect(a, b) {
  const s = Math.max(a[0], b[0]);
  const e = Math.min(a[1], b[1]);
  return s < e ? [s, e] : null;
}

function subtract(windows, cut) {
  const out = [];
  for (const [s, e] of windows) {
    if (cut[1] <= s || cut[0] >= e) {
      out.push([s, e]);
      continue;
    }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}

/* Rangos del local para un día: acepta una entrada ({opens, closes}) o la lista de
   entradas de ese día de la semana (SPEC-34 RN-05: un día puede tener varios rangos). */
export function shopRanges(shopHours) {
  const list = Array.isArray(shopHours) ? shopHours : [shopHours];
  return list.filter((h) => h && h.opens && h.closes);
}

/**
 * Ventanas de trabajo de un profesional en un día local (instantes UTC):
 * horario del local ∩ disponibilidad semanal − cierres − ausencias.
 * La usan las horas libres (daySlots), la agenda del barbero y la ocupación (SPEC-34 RN-07).
 */
export function workWindows({ date, tz, shopHours, closures = [], rules = [], timeOffs = [] }) {
  const ranges = shopRanges(shopHours);
  if (!ranges.length || closures.includes(date)) return [];
  const shop = ranges.map((h) => [zonedToUtc(date, h.opens, tz), zonedToUtc(date, h.closes, tz)]);
  let windows = [];
  for (const r of rules) {
    const own = [zonedToUtc(date, r.start, tz), zonedToUtc(date, r.end, tz)];
    for (const s of shop) {
      const x = intersect(own, s);
      if (x) windows.push(x);
    }
  }
  for (const off of timeOffs) windows = subtract(windows, [new Date(off.startsAt).getTime(), new Date(off.endsAt).getTime()]);
  return windows.sort((a, b) => a[0] - b[0]);
}

/**
 * Horas de inicio libres de UN profesional en UN día local.
 * @param {object} p
 * @param {string} p.date        'YYYY-MM-DD' en la zona del negocio
 * @param {string} p.tz
 * @param {{opens:string|null, closes:string|null}|{opens:string|null, closes:string|null}[]|null} p.shopHours  horario del local ese día (uno o varios rangos)
 * @param {string[]} p.closures  fechas cerradas del local
 * @param {{start:string,end:string}[]} p.rules  disponibilidad del barbero ese día de la semana
 * @param {{startsAt:Date|number, endsAt:Date|number}[]} p.timeOffs
 * @param {Set<number>} p.locked  slotStart (ms) ocupados del barbero
 * @param {number} p.durationMin
 * @param {number} [p.bufferMin] margen de traslado (domicilio)
 * @param {number} p.now         ms
 * @param {number} p.minLeadMin
 * @param {number} p.horizonDays
 * @returns {{startsAt:number, label:string}[]}
 */
export function daySlots(p) {
  const { date, tz, shopHours, closures = [], rules = [], timeOffs = [], locked = new Set(), durationMin, bufferMin = 0, now, minLeadMin, horizonDays } = p;
  if (!(durationMin > 0)) return [];
  const windows = workWindows({ date, tz, shopHours, closures, rules, timeOffs });
  if (!windows.length) return [];

  const earliest = now + minLeadMin * MIN;
  /* Horizonte por día de calendario: hoy + 30 días incluye ese día completo. */
  if (date > addDays(wallClock(now, tz).date, horizonDays)) return [];
  const dur = durationMin * MIN;
  const seen = new Set();
  const out = [];
  for (const [ws, we] of windows) {
    for (let s = ceilSlot(ws); s + dur <= we; s += SLOT_MS) {
      if (s < earliest) continue;
      if (slotsFor(s, durationMin, bufferMin).some((t) => locked.has(t))) continue;
      const w = wallClock(s, tz);
      /* Solo horas que pertenecen a ese día local, y una sola vez cada rótulo
         (la hora repetida de abril no se ofrece dos veces). */
      if (w.date !== date || seen.has(w.time)) continue;
      seen.add(w.time);
      out.push({ startsAt: s, label: w.time });
    }
  }
  return out.sort((a, b) => a.startsAt - b.startsAt);
}

/* Distancia en km en línea recta (haversine) entre [lng, lat]. */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
