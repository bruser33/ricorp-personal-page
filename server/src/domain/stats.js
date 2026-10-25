/* Estadísticas del negocio (SPEC-34 RN-07). Rango de fechas LOCALES (America/Santiago):
   [from 00:00, to + 1 día 00:00) calculados con zonedToUtc, así un rango que cruza el
   cambio de hora no pierde ni duplica horas (CB-10).

   Definiciones (las mismas que muestra el panel):
   - Citas por estado: todas las citas que EMPIEZAN en el rango.
   - Ingresos: suma de `pricing.totalCLP` de las citas `terminada`, separadas en
     pagado en línea (método ≠ local y pago `pagado`), cobrado en el local (método local y
     pago `cobrado`) y pendiente de cobro (el resto de las terminadas).
   - Ticket promedio: ingresos / nº de terminadas.
   - Servicios más pedidos: citas no canceladas ni expiradas, por servicio.
   - Ocupación del barbero: minutos reservados (citas que ocupan agenda + terminadas +
     inasistencias) / minutos disponibles (su disponibilidad ∩ horario del local −
     cierres − ausencias) en el rango.
   - % domicilio: sobre las citas no canceladas ni expiradas.
   - Comisión de plataforma: suma de `pricing.platformFeeCLP` de las terminadas. */
import { Appointment, AvailabilityRule, BLOCKING, Membership, Professional, STATUSES, TimeOff } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { workWindows } from './availability.js';
import { addDays, isDate, isoWeekday, wallClock, zonedToUtc } from './time.js';

const MIN = 60 * 1000;
const RESERVED = new Set([...BLOCKING, 'terminada', 'no_asistio']);
const VOID = new Set(['cancelada', 'expirada']);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function monthRange(now, tz) {
  const today = wallClock(now, tz).date;
  const from = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function parseRange(q, now, tz) {
  const def = monthRange(now, tz);
  const from = q.from ? String(q.from) : def.from;
  const to = q.to ? String(q.to) : q.from ? from : def.to;
  if (!isDate(from) || !isDate(to) || to < from || addDays(from, 366) < to) throw new HttpError(400, 'invalid_range', 'Rango de fechas inválido');
  return { from, to };
}

/* Parte del barbero de una cita (citas antiguas: servicio + domicilio). */
const barberPart = (a) => a.pricing?.barberCLP ?? (a.pricing?.priceCLP || 0) + (a.pricing?.surchargeCLP || 0);

export async function computeStats(b, { from, to, professionalId = null }) {
  const tz = b.timezone;
  const start = new Date(zonedToUtc(from, '00:00', tz));
  const end = new Date(zonedToUtc(addDays(to, 1), '00:00', tz));
  const q = { businessId: b._id, startsAt: { $gte: start, $lt: end } };
  if (professionalId) q.professionalId = professionalId;
  const appts = await Appointment.find(q).lean();

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const a of appts) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  const finished = appts.filter((a) => a.status === 'terminada');
  const revenue = { totalCLP: 0, onlineCLP: 0, localCLP: 0, pendingCLP: 0 };
  let platformFeeCLP = 0;
  /* SPEC-38 RN-19: parte de los barberos (servicio + domicilio), administración y costo de pagos cobrados. */
  let barbersCLP = 0;
  let paymentFeeCLP = 0;
  for (const a of finished) {
    const total = a.pricing?.totalCLP || 0;
    revenue.totalCLP += total;
    platformFeeCLP += a.pricing?.platformFeeCLP || 0;
    barbersCLP += barberPart(a);
    paymentFeeCLP += a.pricing?.paymentFeeCLP || 0;
    const method = a.payment?.method || 'local';
    const status = a.payment?.status;
    if (method !== 'local' && status === 'pagado') revenue.onlineCLP += total;
    else if (method === 'local' && status === 'cobrado') revenue.localCLP += total;
    else revenue.pendingCLP += total;
  }

  const live = appts.filter((a) => !VOID.has(a.status));
  const services = new Map();
  for (const a of live) {
    const k = a.serviceSnapshot?.slug || String(a.serviceSnapshot?.serviceId);
    if (!services.has(k)) services.set(k, { id: k, name: a.serviceSnapshot?.name || k, count: 0, revenueCLP: 0 });
    const s = services.get(k);
    s.count++;
    if (a.status === 'terminada') s.revenueCLP += a.pricing?.totalCLP || 0;
  }
  const topServices = [...services.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'es'));

  /* Barberos: los aprobados/suspendidos del negocio + cualquiera con citas en el rango. */
  let proIds;
  if (professionalId) proIds = [String(professionalId)];
  else {
    const ms = await Membership.find({ businessId: b._id, status: { $in: ['approved', 'suspended'] } }, { professionalId: 1 }).lean();
    proIds = [...new Set([...ms.map((m) => String(m.professionalId)), ...appts.map((a) => String(a.professionalId))])];
  }
  const [pros, rules, offs] = await Promise.all([
    Professional.find({ _id: { $in: proIds } }, { displayName: 1 }).lean(),
    AvailabilityRule.find({ businessId: b._id, professionalId: { $in: proIds } }).lean(),
    TimeOff.find({ businessId: b._id, professionalId: { $in: proIds }, startsAt: { $lt: end }, endsAt: { $gt: start } }).lean(),
  ]);
  const closures = (b.closures || []).map((c) => c.date);
  const barbers = proIds.map((id) => {
    const mine = appts.filter((a) => String(a.professionalId) === id);
    const myRules = rules.filter((r) => String(r.professionalId) === id);
    const myOffs = offs.filter((o) => String(o.professionalId) === id);
    let availableMin = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const wd = isoWeekday(date);
      const windows = workWindows({ date, tz, shopHours: (b.hours || []).filter((h) => h.weekday === wd), closures, rules: myRules.filter((r) => r.weekday === wd), timeOffs: myOffs });
      for (const [s, e] of windows) availableMin += (e - s) / MIN;
    }
    const bookedMin = mine.filter((a) => RESERVED.has(a.status)).reduce((acc, a) => acc + (a.endsAt - a.startsAt) / MIN, 0);
    const done = mine.filter((a) => a.status === 'terminada');
    return {
      id,
      name: pros.find((p) => String(p._id) === id)?.displayName || mine[0]?.professionalSnapshot?.displayName || 'Barbero',
      appointments: mine.length,
      finished: done.length,
      revenueCLP: done.reduce((acc, a) => acc + (a.pricing?.totalCLP || 0), 0),
      earningsCLP: done.reduce((acc, a) => acc + barberPart(a), 0),
      cancellations: mine.filter((a) => a.status === 'cancelada').length,
      noShows: mine.filter((a) => a.status === 'no_asistio').length,
      bookedMin,
      availableMin,
      occupancyPct: pct(bookedMin, availableMin),
    };
  }).sort((x, y) => y.revenueCLP - x.revenueCLP || y.appointments - x.appointments || x.name.localeCompare(y.name, 'es'));

  /* Serie diaria (gráfico): citas que empiezan ese día local e ingresos de las terminadas. */
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) days.push({ date, appointments: 0, revenueCLP: 0 });
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  for (const a of appts) {
    const d = days[dayIndex.get(wallClock(a.startsAt.getTime(), tz).date)];
    if (!d) continue;
    d.appointments++;
    if (a.status === 'terminada') d.revenueCLP += a.pricing?.totalCLP || 0;
  }

  return {
    from,
    to,
    timezone: tz,
    total: appts.length,
    byStatus,
    revenue,
    finished: finished.length,
    averageTicketCLP: finished.length ? Math.round(revenue.totalCLP / finished.length) : 0,
    topServices,
    barbers,
    homePct: pct(live.filter((a) => a.location?.kind === 'home').length, live.length),
    platformFeeCLP,
    paymentFeeCLP,
    barbersCLP,
    days,
  };
}
