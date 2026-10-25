/* SPEC-32 AC-01…AC-04: disponibilidad real contra la BD de test. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AvailabilityRule, Business, Professional, SlotLock, TimeOff } from '../src/models/index.js';
import { daySlots, slotsFor } from '../src/domain/availability.js';
import { wallClock, zonedToUtc } from '../src/domain/time.js';
import { connectDb, disconnectDb, resetDb, seed, start, stop, api, PRO_A, PRO_B } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
/* Domingo 1-nov 09:00 local: el lunes completo queda dentro de la anticipación y el horizonte. */
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');

const labels = (days, date) => (days.find((d) => d.date === date)?.slots ?? []).map((s) => s.label);
function grid(from, to) {
  const out = [];
  for (let m = from; m <= to; m += 15) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

describe('disponibilidad (AC-01…AC-03)', () => {
  let ctx, seeded;
  before(connectDb);
  after(disconnectDb);
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    seeded = await seed();
    ctx = await start({ now: SUNDAY_9AM });
  });
  after(async () => ctx && stop(ctx.server));

  const get = (q) => api(ctx.base, 'GET', `/api/wstyle/availability?${new URLSearchParams(q)}`);

  test('AC-01 intersección local ∩ barbero − citas: cada 15 min de 12:00 a 17:15 sin los que solapan 14:00–14:40', async () => {
    const pro = seeded.pros[0];
    /* Cita existente 14:00–14:40 (sus bloques de 15 min). */
    const s = zonedToUtc(MONDAY, '14:00', TZ);
    await SlotLock.insertMany(slotsFor(s, 40).map((t) => ({ businessId: seeded.business._id, professionalId: pro._id, slotStart: new Date(t), appointmentId: pro._id })));
    const res = await get({ service: 'corte', professional: String(pro._id), from: MONDAY, to: MONDAY });
    assert.equal(res.status, 200);
    const expected = grid(12 * 60, 17 * 60 + 15).filter((l) => !['13:30', '13:45', '14:00', '14:15', '14:30'].includes(l));
    assert.deepEqual(labels(res.json.days, MONDAY), expected);
    /* Último inicio 17:15 (+40 = 17:55 ≤ 18:00). */
    assert.ok(!labels(res.json.days, MONDAY).includes('17:30'));
  });

  test('AC-02 feriado del local, ausencia del barbero y domingo cerrado → sin horas', async () => {
    const pro = seeded.pros[0];
    await Business.updateOne({ _id: seeded.business._id }, { closures: [{ date: MONDAY, reason: 'Feriado' }] });
    let res = await get({ service: 'corte', from: MONDAY, to: MONDAY });
    assert.deepEqual(labels(res.json.days, MONDAY), []);

    await Business.updateOne({ _id: seeded.business._id }, { closures: [] });
    await TimeOff.create({ businessId: seeded.business._id, professionalId: pro._id, startsAt: new Date(zonedToUtc(MONDAY, '00:00', TZ)), endsAt: new Date(zonedToUtc('2026-11-03', '00:00', TZ)) });
    res = await get({ service: 'corte', from: MONDAY, to: MONDAY });
    assert.deepEqual(labels(res.json.days, MONDAY), []);

    res = await get({ service: 'corte', from: '2026-11-08', to: '2026-11-08' });
    assert.deepEqual(labels(res.json.days, '2026-11-08'), [], 'domingo cerrado');
  });

  test('AC-02 / CB-03 un servicio de 60 min no ofrece 19:15 si el local cierra a las 20:00', async () => {
    const pro = seeded.pros[0];
    await AvailabilityRule.updateMany({ professionalId: pro._id }, { start: '10:00', end: '22:00' });
    const res = await get({ service: 'corte-barba', professional: String(pro._id), from: MONDAY, to: MONDAY });
    const l = labels(res.json.days, MONDAY);
    assert.equal(l.at(-1), '19:00');
    assert.ok(!l.includes('19:15'));
    assert.equal(l[0], '10:00');
  });

  test('AC-03 anticipación mínima 2 h y horizonte de 30 días (reloj inyectado)', async () => {
    const pro = seeded.pros[0];
    /* Lunes 13:10 local → lo primero es 15:15 (≥ 15:10). */
    ctx.clock.now = zonedToUtc(MONDAY, '13:10', TZ);
    let res = await get({ service: 'corte', professional: String(pro._id), from: MONDAY, to: MONDAY });
    assert.equal(labels(res.json.days, MONDAY)[0], '15:15');
    /* Horizonte: hoy + 30 días es el último día con horas. */
    ctx.clock.now = SUNDAY_9AM;
    res = await get({ service: 'corte', from: '2026-11-25', to: '2026-12-08' });
    const withSlots = res.json.days.filter((d) => d.slots.length).map((d) => d.date);
    assert.ok(withSlots.includes('2026-12-01'), 'martes 1-dic (día 30) tiene horas');
    assert.ok(!res.json.days.some((d) => d.date > '2026-12-01'), 'nada después del día 30');
  });

  test('CB-06 / RN-06 barbero sin disponibilidad o suspendido no aparece; "sin preferencia" une a los dos', async () => {
    await seed({ pros: [PRO_A, PRO_B] });
    const cat = await api(ctx.base, 'GET', '/api/wstyle/catalog');
    assert.deepEqual(cat.json.professionals.map((p) => p.name), ['Barbero A', 'Barbero B']);
    const b = await Professional.findOne({ displayName: 'Barbero B' });
    const res = await get({ service: 'corte', from: MONDAY, to: MONDAY });
    assert.deepEqual(res.json.days[0].slots[0].professionalIds.length, 2);
    await AvailabilityRule.deleteMany({ professionalId: b._id });
    let cat2 = await api(ctx.base, 'GET', '/api/wstyle/catalog');
    assert.deepEqual(cat2.json.professionals.map((p) => p.name), ['Barbero A']);
    await Professional.updateOne({ displayName: 'Barbero A' }, { status: 'suspended' });
    cat2 = await api(ctx.base, 'GET', '/api/wstyle/catalog');
    assert.deepEqual(cat2.json.professionals, []);
    /* CB-07: sin nadie, el día queda sin horas. */
    const none = await get({ service: 'corte', from: MONDAY, to: MONDAY });
    assert.deepEqual(none.json.days, []);
  });
});

describe('zona horaria y cambios de hora de Chile (AC-04)', () => {
  /* Local abierto sáb 22:00–24:00 y dom 00:00–03:00; barbero igual. Tests sobre daySlots
     (pura) con las fechas REALES de transición de 2026 y 2027. */
  const base = {
    tz: TZ,
    durationMin: 30,
    minLeadMin: 0,
    horizonDays: 3650,
    now: Date.parse('2026-01-01T00:00:00Z'),
  };
  const sat = { opens: '22:00', closes: '24:00' };
  const sun = { opens: '00:00', closes: '03:00' };
  const check = (date, hours, rules) => {
    const slots = daySlots({ ...base, date, shopHours: hours, rules });
    const ls = slots.map((s) => s.label);
    assert.equal(new Set(ls).size, ls.length, `${date}: sin rótulos duplicados`);
    for (const s of slots) {
      const w = wallClock(s.startsAt, TZ);
      assert.equal(w.time, s.label, `${date}: el rótulo es la hora local real`);
      assert.equal(w.date, date);
      assert.equal(s.startsAt % (15 * 60 * 1000), 0);
    }
    return ls;
  };

  for (const [year, endSat, startSun] of [
    ['2026', '2026-04-04', '2026-09-06'],
    ['2027', '2027-04-03', '2027-09-05'],
  ]) {
    test(`AC-04 ${year}: abril (23:00–23:59 se repite) sin horas duplicadas`, () => {
      const ls = check(endSat, sat, [{ start: '22:00', end: '24:00' }]);
      assert.deepEqual(ls, ['22:00', '22:15', '22:30', '22:45', '23:00', '23:15', '23:30', '23:45']);
    });
    test(`AC-04 ${year}: septiembre (00:00–00:59 no existe) sin horas inexistentes`, () => {
      const ls = check(startSun, sun, [{ start: '00:00', end: '03:00' }]);
      assert.ok(!ls.some((l) => l.startsWith('00:')), 'no hay 00:xx');
      assert.deepEqual(ls, ['01:00', '01:15', '01:30', '01:45', '02:00', '02:15', '02:30']);
    });
  }

  test('AC-04 las horas se devuelven en America/Santiago y viajan en UTC', () => {
    const [first] = daySlots({ ...base, date: '2026-11-02', shopHours: { opens: '10:00', closes: '20:00' }, rules: [{ start: '12:00', end: '18:00' }] });
    assert.equal(first.label, '12:00');
    assert.equal(new Date(first.startsAt).toISOString(), '2026-11-02T15:00:00.000Z');
    const [winter] = daySlots({ ...base, date: '2026-06-01', shopHours: { opens: '10:00', closes: '20:00' }, rules: [{ start: '12:00', end: '18:00' }] });
    assert.equal(new Date(winter.startsAt).toISOString(), '2026-06-01T16:00:00.000Z');
  });
});
