/* SPEC-54 AC-01…AC-10: lista de espera de días llenos, contra la BD de test real y con el reloj inyectado. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, AuthToken, Business, CustomerProfile, Notification, PanelNotification, Service, User, WaitlistEntry } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { newToken, sha256 } from '../src/lib/session.js';
import { api, connectDb, disconnectDb, HOUR, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ms = (time, date = MONDAY) => zonedToUtc(date, time, TZ);
const HOURS = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

async function sessionFor(userId) {
  const token = newToken();
  await AuthToken.create({ type: 'session', userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * HOUR) });
  return `ws_session=${token}`;
}

describe('lista de espera (SPEC-54)', () => {
  let ctx, seeded, proA, proB;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));

  async function boot(pros = [PRO_A]) {
    if (ctx) await stop(ctx.server);
    await resetDb();
    seeded = await seed({ pros });
    [proA, proB] = seeded.pros;
    ctx = await start({ now: SUNDAY_9AM });
  }
  beforeEach(() => boot());

  const call = (method, path, cookie, body) => api(ctx.base, method, path, { cookie, body });
  const svc = (slug) => seeded.services.find((s) => s.slug === slug);
  const barberCookie = (p = proA) => sessionFor(p.userId);
  const book = (cookie, time, extra = {}) =>
    call('POST', '/api/wstyle/appointments', cookie, { serviceId: 'corte-barba', professionalId: String(proA._id), startsAt: at(time, extra.date || MONDAY), mode: 'shop', acceptPolicies: true, paymentMethod: 'local', ...extra });

  /* Llena el lunes del barbero A (12:00–18:00) con 6 citas de 60 min, una por cliente. */
  async function fillMonday(p = proA, hours = HOURS) {
    const appts = {};
    for (const h of hours) {
      const c = await makeClient({ name: `Ocupa ${h}`, phone: `+5698${h.replace(':', '')}0000`.slice(0, 12) });
      const r = await book(c.cookie, h, { professionalId: String(p._id) });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      appts[h] = { id: r.json.id, cookie: c.cookie };
    }
    return appts;
  }

  /* Entradas sembradas directo en la BD (orden de llegada = createdAt). */
  async function entries(list) {
    const out = [];
    for (const [i, e] of list.entries()) {
      const c = await makeClient({ name: e.name, email: `${e.name.toLowerCase()}@clientes.test` });
      const doc = await WaitlistEntry.create({
        businessId: seeded.business._id,
        customerUserId: c.user._id,
        customerSnapshot: { name: e.name, phoneE164: c.user.phoneE164, email: c.user.email },
        date: e.date || MONDAY,
        serviceId: svc(e.service || 'corte-barba')._id,
        professionalId: e.pro === undefined ? null : e.pro,
        pref: e.pref || 'all',
        token: `tok-${e.name}-${i}`,
        createdAt: new Date(SUNDAY_9AM - (100 - i) * MIN),
      });
      out.push({ ...c, entry: doc, name: e.name });
    }
    return out;
  }

  const waitMails = () => ctx.mailer.outbox.filter((m) => m.template === 'waitlist_slot');

  test('AC-01 disponibilidad: lunes lleno (full), sábado y domingo cerrados (sin full)', async () => {
    await fillMonday();
    const r = await call('GET', `/api/wstyle/availability?service=corte-barba&professional=any&from=2026-11-01&to=2026-11-07`);
    assert.equal(r.status, 200);
    assert.equal(r.json.waitlist, true);
    const day = (d) => r.json.days.find((x) => x.date === d);
    assert.equal(day(MONDAY).full, true);
    assert.equal(day(MONDAY).slots.length, 0);
    assert.equal(day('2026-11-01').full, undefined, 'domingo: local cerrado');
    assert.equal(day('2026-11-07').full, undefined, 'sábado: el barbero no trabaja');
    assert.equal(day(TUESDAY).full, undefined);
    assert.ok(day(TUESDAY).slots.length > 0);
    /* Un feriado no es "lleno". */
    await Business.updateOne({ _id: seeded.business._id }, { $push: { closures: { date: TUESDAY, reason: 'Feriado' } } });
    const r2 = await call('GET', `/api/wstyle/availability?service=corte-barba&professional=any&from=${TUESDAY}&to=${TUESDAY}`);
    assert.equal(r2.json.days[0].full, undefined);
  });

  test('AC-02 anotarse y límites (401, 409 ×5, 403) + CB-10', async () => {
    const occupied = await fillMonday();
    const body = { date: MONDAY, serviceId: 'corte-barba', professionalId: 'any', pref: 'pm' };
    assert.equal((await call('POST', '/api/wstyle/waitlist', null, body)).status, 401);

    const ana = await makeClient({ name: 'Ana', email: 'ana@clientes.test' });
    const ok = await call('POST', '/api/wstyle/waitlist', ana.cookie, body);
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json.entry.status, 'waiting');
    assert.equal(ok.json.entry.professional.name, 'Cualquiera');
    assert.equal(ok.json.entry.pref, 'pm');
    const again = await call('POST', '/api/wstyle/waitlist', ana.cookie, body);
    assert.equal(again.status, 409);
    assert.equal(again.json.error, 'already_on_list');

    /* Cuarta activa. */
    const bea = await makeClient({ name: 'Bea' });
    for (const d of ['2026-11-04', '2026-11-05', '2026-11-06']) {
      await WaitlistEntry.create({ businessId: seeded.business._id, customerUserId: bea.user._id, date: d, serviceId: svc('corte')._id, token: `bea-${d}` });
    }
    const fourth = await call('POST', '/api/wstyle/waitlist', bea.cookie, body);
    assert.equal(fourth.status, 409);
    assert.equal(fourth.json.error, 'too_many_entries');

    /* Con cita activa ese día. */
    const busy = await call('POST', '/api/wstyle/waitlist', occupied['12:00'].cookie, body);
    assert.equal(busy.status, 409);
    assert.equal(busy.json.error, 'has_appointment');

    /* ≥ 2 inasistencias. */
    const lu = await makeClient({ name: 'Lu' });
    await CustomerProfile.create({ businessId: seeded.business._id, userId: lu.user._id, counters: { noShows: 2 } });
    const ns = await call('POST', '/api/wstyle/waitlist', lu.cookie, body);
    assert.equal(ns.status, 403);
    assert.equal(ns.json.error, 'no_shows');
    assert.match(ns.json.message, /escríbenos por WhatsApp/);

    /* Persona 31 del día. */
    const others = await User.insertMany(Array.from({ length: 29 }, (_, i) => ({ name: `X${i}`, email: `x${i}@clientes.test`, phoneE164: '+56900000000', roles: ['client'] })));
    await WaitlistEntry.insertMany(others.map((u, i) => ({ businessId: seeded.business._id, customerUserId: u._id, date: MONDAY, serviceId: svc('corte')._id, token: `x-${i}` })));
    const late = await makeClient({ name: 'Tardía' });
    const full = await call('POST', '/api/wstyle/waitlist', late.cookie, body);
    assert.equal(full.status, 409);
    assert.equal(full.json.error, 'day_list_full');

    /* CB-10: el martes tiene horas → no se anota, se ofrecen. Domingo cerrado → day_closed. */
    const free = await call('POST', '/api/wstyle/waitlist', late.cookie, { ...body, date: TUESDAY });
    assert.equal(free.status, 409);
    assert.equal(free.json.error, 'slots_available');
    assert.ok(free.json.slots.length > 0);
    const closed = await call('POST', '/api/wstyle/waitlist', late.cookie, { ...body, date: '2026-11-08' });
    assert.equal(closed.status, 409);
    assert.equal(closed.json.error, 'day_closed');

    /* Mis listas y salir. */
    const mine = await call('GET', '/api/wstyle/waitlist/mine', ana.cookie);
    assert.equal(mine.json.entries.length, 1);
    assert.equal(mine.json.entries[0].statusLabel, 'Esperando');
    assert.equal((await call('DELETE', `/api/wstyle/waitlist/${ok.json.entry.id}`, bea.cookie)).status, 404, 'no puede sacar a otra persona');
    assert.equal((await call('DELETE', `/api/wstyle/waitlist/${ok.json.entry.id}`, ana.cookie)).status, 200);
    assert.equal((await call('GET', '/api/wstyle/waitlist/mine', ana.cookie)).json.entries.length, 0);
  });

  /* 5 compatibles (todo el día / tarde) + 1 incompatible (mañana) antes de las otras. */
  const SIX = [
    { name: 'Ana' },
    { name: 'Manu', pref: 'am' },
    { name: 'Bea', pref: 'pm' },
    { name: 'Caro' },
    { name: 'Dani' },
    { name: 'Eli' },
  ];
  function assertFirstThree(list) {
    const mails = waitMails();
    assert.deepEqual(mails.map((m) => m.to), ['ana@clientes.test', 'bea@clientes.test', 'caro@clientes.test']);
    assert.match(mails[0].text, /Se liberó una hora el lunes 2 de noviembre: Corte \+ barba con Barbero A a las 16:00\. La primera persona que la confirme se la queda\./);
    assert.ok(mails[0].text.includes(`http://localhost:5173/wstyle/reservar/?espera=${list[0].entry.token}`));
    assert.doesNotMatch(mails[0].text, /turno/i);
  }
  async function assertSideEffects() {
    assert.equal(await Notification.countDocuments({ template: 'waitlist_slot', status: 'dry-run' }), 3);
    const inbox = await PanelNotification.findOne({ userId: proA.userId, kind: 'waitlist_notified' }).lean();
    assert.equal(inbox.title, 'Se liberó 16:00: avisamos a 3 personas de la lista de espera');
    const st = await WaitlistEntry.find({}).sort({ createdAt: 1 }).lean();
    assert.deepEqual(st.map((e) => e.status), ['notified', 'waiting', 'notified', 'notified', 'waiting', 'waiting']);
  }

  test('AC-03 cancelación del cliente → avisa a las 3 primeras compatibles + bandeja del barbero', async () => {
    const appts = await fillMonday();
    const list = await entries(SIX);
    const r = await call('POST', `/api/wstyle/appointments/${appts['16:00'].id}/cancel`, appts['16:00'].cookie, { reason: 'No puedo' });
    assert.equal(r.status, 200);
    assertFirstThree(list);
    await assertSideEffects();
    /* CB-04 / RN-03: otra liberación inmediata no vuelve a avisar a las mismas (30 min). */
    await call('POST', `/api/wstyle/appointments/${appts['17:00'].id}/cancel`, appts['17:00'].cookie, {});
    const second = waitMails().slice(3).map((m) => m.to);
    assert.deepEqual(second, ['dani@clientes.test', 'eli@clientes.test']);
  });

  test('AC-03 expiración (sin confirmación del barbero) → aviso', async () => {
    const appts = await fillMonday();
    const cookie = await barberCookie();
    for (const h of HOURS.filter((x) => x !== '16:00')) assert.equal((await call('POST', `/api/pro/appointments/${appts[h].id}/confirm`, cookie, {})).status, 200);
    const list = await entries(SIX);
    ctx.clock.now = SUNDAY_9AM + 12 * HOUR + MIN;
    const r = await ctx.app.locals.agenda.runExpirations();
    assert.equal(r.expired, 1);
    assertFirstThree(list);
  });

  test('AC-03 rechazo del barbero → aviso', async () => {
    const appts = await fillMonday();
    const list = await entries(SIX);
    const r = await call('POST', `/api/pro/appointments/${appts['16:00'].id}/reject`, await barberCookie(), { reasonCode: 'imprevisto' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assertFirstThree(list);
    await assertSideEffects();
  });

  test('AC-03 reasignación a otro barbero → avisa la lista del barbero que quedó libre', async () => {
    await boot([PRO_A, PRO_B]);
    const appts = await fillMonday();
    const list = await entries(SIX.map((e) => ({ ...e, pro: proA._id })));
    const admin = await makeClient({ name: 'Dueño', email: 'admin@ws.test', roles: ['superadmin'] });
    const r = await call('POST', `/api/admin/appointments/${appts['16:00'].id}/reassign`, admin.cookie, { professionalId: String(proB._id) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assertFirstThree(list);
  });

  test('AC-04 dos avisados confirman a la vez: 201 y 409 "Alguien tomó esta hora antes"', async () => {
    const appts = await fillMonday();
    const [ana, bea] = await entries([{ name: 'Ana' }, { name: 'Bea' }]);
    await call('POST', `/api/wstyle/appointments/${appts['16:00'].id}/cancel`, appts['16:00'].cookie, {});
    assert.equal(waitMails().length, 2);
    const offer = await call('GET', `/api/wstyle/waitlist/offer?t=${ana.entry.token}`, ana.cookie);
    assert.equal(offer.status, 200);
    assert.deepEqual(offer.json.slots.map((s) => s.label), ['16:00']);
    const take = (c) => book(c.cookie, '16:00', { professionalId: 'any', waitlistToken: c.entry.token });
    const res = await Promise.all([take(ana), take(bea)]);
    assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
    const lost = res.find((r) => r.status === 409);
    assert.equal(lost.json.error, 'slot_taken');
    assert.equal(lost.json.message, 'Alguien tomó esta hora antes. Sigues en la lista de espera.');
    const winner = res[0].status === 201 ? ana : bea;
    const loser = winner === ana ? bea : ana;
    assert.equal((await WaitlistEntry.findById(winner.entry._id)).status, 'booked');
    assert.equal((await WaitlistEntry.findById(loser.entry._id)).status, 'waiting');
    const appt = await Appointment.findOne({ customerUserId: winner.user._id });
    assert.equal(appt.status, 'pendiente');
    /* El perdedor ve que ya no hay horas. */
    const after = await call('GET', `/api/wstyle/waitlist/offer?t=${loser.entry.token}`, loser.cookie);
    assert.equal(after.json.slots.length, 0);
    assert.match(after.json.message, /Alguien tomó esta hora antes/);
  });

  test('AC-05 RN-06: 20 min → nadie; 45 min → aviso; tomar a 40 min por el link sí, reserva normal no', async () => {
    const appts = await fillMonday();
    const [ana] = await entries([{ name: 'Ana' }]);
    const cookie = await barberCookie();
    ctx.clock.now = ms('15:40');
    await call('POST', `/api/pro/appointments/${appts['16:00'].id}/cancel`, cookie, { reasonCode: 'imprevisto' });
    assert.equal(waitMails().length, 0);

    ctx.clock.now = ms('16:15');
    await call('POST', `/api/pro/appointments/${appts['17:00'].id}/cancel`, cookie, { reasonCode: 'imprevisto' });
    assert.equal(waitMails().length, 1);
    /* La primera hora reservable que usa el hueco (16:45–17:45 cabe: 16:00 ya estaba libre). */
    assert.match(waitMails()[0].text, /a las 16:45/);

    ctx.clock.now = ms('16:20');
    const normal = await book((await makeClient({ name: 'Otro' })).cookie, '17:00');
    assert.equal(normal.status, 409, 'la reserva normal exige 120 min');
    const take = await book(ana.cookie, '17:00', { waitlistToken: ana.entry.token });
    assert.equal(take.status, 201, JSON.stringify(take.json));
    const appt = await Appointment.findById(take.json.id);
    assert.ok(appt.expiresAt.getTime() > ms('16:20'), 'el barbero alcanza a confirmarla');
  });

  test('el token vale solo para el barbero y la preferencia de la entrada', async () => {
    await boot([PRO_A, PRO_B]);
    const appts = await fillMonday();
    const [carla] = await entries([{ name: 'Carla', pref: 'am' }]);
    await call('POST', `/api/wstyle/appointments/${appts['16:00'].id}/cancel`, appts['16:00'].cookie, {});
    assert.equal(waitMails().length, 0, '16:00 no entra en "mañana"');
    ctx.clock.now = ms('15:00');
    const pm = await book(carla.cookie, '16:00', { professionalId: 'any', waitlistToken: carla.entry.token });
    assert.equal(pm.status, 409);
    const [dani] = await entries([{ name: 'Dani', pro: proA._id }]);
    const otherPro = await book(dani.cookie, '16:00', { professionalId: String(proB._id), waitlistToken: dani.entry.token });
    assert.equal(otherPro.status, 409, 'pidió al barbero A: no puede usar los 30 min con B');
  });

  test('AC-06 token: otra cuenta 403, día pasado 410, lista apagada 409', async () => {
    const [ana] = await entries([{ name: 'Ana' }]);
    const bea = await makeClient({ name: 'Bea' });
    assert.equal((await call('GET', `/api/wstyle/waitlist/offer?t=${ana.entry.token}`, null)).status, 401);
    assert.equal((await call('GET', `/api/wstyle/waitlist/offer?t=${ana.entry.token}`, bea.cookie)).status, 403);
    assert.equal((await call('GET', `/api/wstyle/waitlist/offer?t=nada`, bea.cookie)).status, 404);
    const stolen = await book(bea.cookie, '16:00', { waitlistToken: ana.entry.token });
    assert.equal(stolen.status, 403);
    await Business.updateOne({ _id: seeded.business._id }, { $set: { 'settings.waitlistEnabled': false } });
    const off = await call('GET', `/api/wstyle/waitlist/offer?t=${ana.entry.token}`, ana.cookie);
    assert.equal(off.status, 409);
    assert.equal(off.json.message, 'La lista de espera no está activa.');
    await Business.updateOne({ _id: seeded.business._id }, { $set: { 'settings.waitlistEnabled': true } });
    ctx.clock.now = ms('09:00', TUESDAY);
    const past = await call('GET', `/api/wstyle/waitlist/offer?t=${ana.entry.token}`, ana.cookie);
    assert.equal(past.status, 410);
    /* Alcance 8: el barrido la marca "Terminó". */
    await ctx.app.locals.waitlist.sweep();
    assert.equal((await WaitlistEntry.findById(ana.entry._id)).status, 'ended');
  });

  test('AC-07 barbero: chip con la cantidad, [Sacar] baja a 2, [Avisarle] da wa.me con el link', async () => {
    const list = await entries([{ name: 'Ana', date: '2026-11-07' }, { name: 'Bea', date: '2026-11-07', pref: 'am' }, { name: 'Caro', date: '2026-11-07', pro: proA._id }]);
    const cookie = await barberCookie();
    const r = await call('GET', '/api/pro/waitlist?from=2026-11-02&to=2026-11-08', cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.enabled, true);
    assert.deepEqual(r.json.days.map((d) => [d.date, d.count]), [['2026-11-07', 3]]);
    assert.deepEqual(r.json.days[0].entries.map((e) => e.name), ['Ana', 'Bea', 'Caro']);
    assert.equal(r.json.days[0].entries[1].pref, 'am');
    assert.equal(r.json.days[0].entries[0].phone, undefined, 'RN-09: sin teléfono');
    const wa = await call('POST', `/api/pro/waitlist/${list[0].entry._id}/notify`, cookie);
    assert.equal(wa.status, 200);
    assert.match(wa.json.waUrl, /^https:\/\/wa\.me\/56987654321\?text=/);
    assert.ok(decodeURIComponent(wa.json.waUrl).includes(`/wstyle/reservar/?espera=${list[0].entry.token}`));
    assert.equal((await WaitlistEntry.findById(list[0].entry._id)).notices[0].kind, 'manual');
    const after = await call('GET', '/api/pro/waitlist?from=2026-11-02&to=2026-11-08', cookie);
    assert.equal(after.json.days[0].entries[0].statusLabel, 'Te avisamos');
    assert.ok(after.json.days[0].entries[0].notifiedAt);
    assert.equal((await call('DELETE', `/api/pro/waitlist/${list[1].entry._id}`, cookie)).status, 200);
    const r2 = await call('GET', '/api/pro/waitlist?from=2026-11-02&to=2026-11-08', cookie);
    assert.equal(r2.json.days[0].count, 2);
  });

  test('AC-09 apagada: la disponibilidad lo dice, no se anota, no avisa y el panel lo sabe', async () => {
    const appts = await fillMonday();
    await entries([{ name: 'Ana' }]);
    const admin = await makeClient({ name: 'Dueño', email: 'admin@ws.test', roles: ['superadmin'] });
    const set = await call('PUT', '/api/admin/settings', admin.cookie, { waitlist: false });
    assert.equal(set.status, 200);
    assert.equal(set.json.waitlist, false);
    const av = await call('GET', `/api/wstyle/availability?service=corte-barba&professional=any&from=${MONDAY}&to=${MONDAY}`);
    assert.equal(av.json.waitlist, false);
    const c = await makeClient({ name: 'Bea' });
    const j = await call('POST', '/api/wstyle/waitlist', c.cookie, { date: MONDAY, serviceId: 'corte-barba', professionalId: 'any' });
    assert.equal(j.status, 409);
    assert.equal(j.json.error, 'waitlist_off');
    await call('POST', `/api/wstyle/appointments/${appts['16:00'].id}/cancel`, appts['16:00'].cookie, {});
    assert.equal(waitMails().length, 0);
    assert.equal((await call('GET', '/api/pro/waitlist', await barberCookie())).json.enabled, false);
    /* Las entradas se conservan (CB-06). */
    assert.equal(await WaitlistEntry.countDocuments({ active: true }), 1);
    assert.equal((await call('PUT', '/api/admin/settings', admin.cookie, { waitlist: 'sí' })).status, 400);
  });

  test('AC-10 permisos: barbero ve solo lo suyo y "Cualquiera"; admin todo; cliente nada del panel', async () => {
    await boot([PRO_A, PRO_B]);
    const list = await entries([{ name: 'Ana', pro: proA._id }, { name: 'Bea' }, { name: 'Caro', pro: proB._id }]);
    const a = await call('GET', '/api/pro/waitlist?from=2026-11-02&to=2026-11-08', await barberCookie(proA));
    assert.deepEqual(a.json.days[0].entries.map((e) => e.name), ['Ana', 'Bea']);
    const bCookie = await barberCookie(proB);
    assert.equal((await call('POST', `/api/pro/waitlist/${list[0].entry._id}/notify`, bCookie)).status, 404);
    assert.equal((await call('DELETE', `/api/pro/waitlist/${list[0].entry._id}`, bCookie)).status, 404);
    assert.equal((await call('GET', '/api/pro/waitlist', list[1].cookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/waitlist', list[1].cookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/waitlist', bCookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/waitlist', null)).status, 401);
    const admin = await makeClient({ name: 'Dueño', email: 'admin@ws.test', roles: ['superadmin'] });
    const all = await call('GET', '/api/admin/waitlist', admin.cookie);
    assert.equal(all.json.days[0].count, 3);
    assert.equal(all.json.summary.next7, 3);
    assert.deepEqual(all.json.days[0].entries.map((e) => e.professional), ['Barbero A', 'Cualquiera', 'Barbero B']);
    assert.equal((await call('DELETE', `/api/admin/waitlist/${list[2].entry._id}`, admin.cookie)).status, 200);
  });

  test('CB-05 reservar otra hora ese mismo día por el flujo normal → "Tomaste la hora"; CB-08/09', async () => {
    const [ana, bea] = await entries([{ name: 'Ana', date: TUESDAY }, { name: 'Bea', date: TUESDAY, service: 'corte' }]);
    const r = await book(ana.cookie, '12:00', { date: TUESDAY });
    assert.equal(r.status, 201);
    assert.equal((await WaitlistEntry.findById(ana.entry._id)).status, 'booked');
    /* CB-08: servicio desactivado → termina y se avisa por correo. */
    await Service.updateOne({ _id: svc('corte')._id }, { active: false });
    const s = await ctx.app.locals.waitlist.sweep();
    assert.equal(s.gone, 1);
    assert.equal((await WaitlistEntry.findById(bea.entry._id)).status, 'ended');
    assert.ok(ctx.mailer.outbox.some((m) => m.template === 'waitlist_ended' && m.to === 'bea@clientes.test'));
    /* CB-09: cuenta eliminada → sus entradas se borran. */
    await ctx.app.locals.agenda.onAccountDeleted(bea.user);
    assert.equal(await WaitlistEntry.countDocuments({ customerUserId: bea.user._id }), 0);
  });
});
