/* SPEC-55: agenda más ágil (buscador de clientes, cita "ya confirmada", "el cliente no vino" que libera
   la hora, corrección del admin, bloqueos rápidos y agenda del admin), contra la BD de test REAL. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, AuditLog, CustomerProfile, PanelNotification, SlotLock, TimeOff, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { maskPhone } from '../src/domain/pro.js';
import { api, connectDb, disconnectDb, HOUR, makeClient, MIN, PRO_A, PRO_B, PRO_C, resetDb, seed, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';

describe('SPEC-55 agenda ágil', () => {
  let ctx, proA, proB, admin, cookieA, freed;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    const seeded = await seed({ pros: [PRO_A, PRO_B, { ...PRO_C, membershipStatus: 'suspended' }] });
    [proA, proB] = seeded.pros;
    ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL } });
    admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
    const ua = await makeClient({ name: 'Barbero A', email: 'sesion.a@barberos.test', phone: PRO_A.phone, roles: ['barber'] });
    await ctx.app.locals.pro.ensureBarber(ua.user);
    /* El User de sesión pasa a ser el dueño del Professional del seed. */
    const { Professional } = await import('../src/models/index.js');
    await Professional.deleteOne({ userId: ua.user._id });
    await Professional.updateOne({ _id: proA._id }, { userId: ua.user._id });
    proA.userId = ua.user._id;
    cookieA = ua.cookie;
    freed = [];
    ctx.app.locals.agenda.hooks.onSlotFreed = async (x) => { freed.push(x); };
  });

  const req = (method, path, body, cookie = admin.cookie) => api(ctx.base, method, path, { body, cookie });
  const book = async ({ pro = proA, time = '12:00', date = MONDAY, service = 'corte', name = 'Carla Díaz', phone = '+56987654321', email } = {}) => {
    const r = await req('POST', '/api/admin/appointments', { name, phone, email, serviceId: service, professionalId: String(pro._id), startsAt: at(time, date) });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };

  test('maskPhone: +56 9 ••• 54 321', () => {
    assert.equal(maskPhone('+56987654321'), '+56 9 ••• 54 321');
    assert.equal(maskPhone(null), null);
  });

  test('AC-02 buscador: el barbero ve solo a sus clientes, enmascarado y sin email; < 3 caracteres → 400; el admin ve todos', async () => {
    await book({ name: 'Carla Díaz', phone: '+56987654321', email: 'carla@clientes.test' });
    await book({ pro: proB, time: '13:00', name: 'Bruno Soto', phone: '+56933334444', email: 'bruno@clientes.test' });
    let r = await req('GET', '/api/pro/customers?q=car', undefined, cookieA);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.items.length, 1);
    const [carla] = r.json.items;
    assert.equal(carla.name, 'Carla Díaz');
    assert.equal(carla.phoneMasked, '+56 9 ••• 54 321');
    assert.ok(carla.ref, 'trae una referencia opaca para agendar');
    assert.equal(carla.lastVisit, null, 'aún no viene: su única cita es futura');
    assert.equal(carla.noShows, 0);
    const raw = JSON.stringify(r.json);
    assert.ok(!raw.includes('@'), 'nunca devuelve el email');
    assert.ok(!raw.includes('87654321'), 'nunca devuelve el celular completo');
    /* 4 dígitos también sirven. */
    assert.equal((await req('GET', '/api/pro/customers?q=4321', undefined, cookieA)).json.items.length, 1);
    /* Bruno es cliente de B: A no lo encuentra (RN-02). */
    assert.equal((await req('GET', '/api/pro/customers?q=bru', undefined, cookieA)).json.items.length, 0);
    r = await req('GET', '/api/pro/customers?q=ca', undefined, cookieA);
    assert.equal(r.status, 400);
    assert.equal((await req('GET', '/api/pro/customers?q=123', undefined, cookieA)).status, 400);
    /* El admin ve a todos. */
    r = await req('GET', '/api/admin/customers?q=bru');
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 1);
    assert.ok(!JSON.stringify(r.json).includes('@'));
  });

  test('AC-03 "Ya está confirmada": confirmada, pro_direct, ocupa los bloques, correo confirmed, sin link; ocupada → 409', async () => {
    const carla = await makeClient({ name: 'Carla Díaz', email: 'carla@clientes.test', phone: '+56987654321' });
    const prev = await book({ name: 'Carla Díaz', phone: '+56987654321' });
    const ref = (await req('GET', '/api/pro/customers?q=carla', undefined, cookieA)).json.items[0].ref;
    assert.equal(ref, prev.id);
    ctx.mailer.outbox.length = 0;
    const r = await req('POST', '/api/pro/invitations', { customerRef: ref, name: 'Carla Díaz', serviceId: 'corte', startsAt: at('14:00'), confirmed: true }, cookieA);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.appointment.status, 'confirmada');
    assert.equal(r.json.inviteUrl, null);
    assert.equal(r.json.whatsappUrl, null);
    const doc = await Appointment.findById(r.json.appointment.id);
    assert.equal(doc.source, 'pro_direct');
    assert.equal(doc.customerSnapshot.phoneE164, '+56987654321');
    assert.equal(String(doc.customerUserId), String(carla.user._id));
    assert.ok(!doc.invite?.token, 'sin link de invitación');
    assert.equal(await SlotLock.countDocuments({ appointmentId: doc._id }), 3);
    assert.ok(ctx.mailer.outbox.some((m) => m.to === 'carla@clientes.test' && /confirmada/i.test(m.subject)));
    const again = await req('POST', '/api/pro/invitations', { phone: '+56911112222', name: 'Otro', serviceId: 'corte', startsAt: at('14:00'), confirmed: true }, cookieA);
    assert.equal(again.status, 409);
    /* La referencia a una cita de OTRO barbero no sirve (no se filtra su celular). */
    const ajena = await book({ pro: proB, time: '15:00', name: 'Bruno', phone: '+56933334444' });
    const bad = await req('POST', '/api/pro/invitations', { customerRef: ajena.id, name: 'Bruno', serviceId: 'corte', startsAt: at('16:00') }, cookieA);
    assert.equal(bad.status, 400);
    assert.equal(bad.json.fields.phone, 'invalid_phone');
  });

  test('AC-10 sin regresión: "Enviar invitación" sigue igual (invitacion_enviada, link y WhatsApp)', async () => {
    const r = await req('POST', '/api/pro/invitations', { phone: '+56911112222', name: 'Rosa', serviceId: 'corte', startsAt: at('14:00') }, cookieA);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.appointment.status, 'invitacion_enviada');
    assert.match(r.json.inviteUrl, /inv=/);
    assert.match(r.json.whatsappUrl, /wa\.me/);
    assert.equal((await Appointment.findById(r.json.appointment.id)).source, 'pro_invite');
  });

  test('AC-04 "El cliente no vino": no_asistio, contador, libera los bloques desde ahora y llama a la lista de espera', async () => {
    const client = await makeClient({ name: 'Pedro Pérez', email: 'pedro@clientes.test', phone: '+56955556666' });
    const appt = await book({ service: 'corte-barba', name: 'Pedro Pérez', phone: '+56955556666', email: 'pedro@clientes.test' });
    ctx.clock.now = Date.parse(at('12:10'));
    let r = await req('POST', `/api/pro/appointments/${appt.id}/no-show`, {}, cookieA);
    assert.equal(r.status, 409, 'antes de inicio + 15 → regla actual');
    ctx.clock.now = Date.parse(at('12:20'));
    r = await req('POST', `/api/pro/appointments/${appt.id}/no-show`, {}, cookieA);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.status, 'no_asistio');
    assert.equal(r.json.noShows, 1);
    assert.equal((await CustomerProfile.findOne({ userId: client.user._id })).counters.noShows, 1);
    const left = (await SlotLock.find({ appointmentId: appt.id }).sort({ slotStart: 1 })).map((l) => l.slotStart.toISOString());
    assert.deepEqual(left, [at('12:00'), at('12:15')], 'no toca las horas pasadas');
    assert.deepEqual(freed.map((x) => [x.startsAt.toISOString(), x.endsAt.toISOString(), String(x.professionalId)]), [[at('12:30'), at('13:00'), String(proA._id)]]);
    const slots = await req('GET', `/api/pro/slots?service=corte&date=${MONDAY}`, undefined, cookieA);
    assert.ok(slots.json.slots.some((s) => s.startsAt === at('12:30')), 'la hora siguiente queda reservable');
  });

  test('CB-03 no vino sobre una cita ya terminada en el reloj: se marca y no hay nada que liberar', async () => {
    const appt = await book({ name: 'Ana', phone: '+56944443333' });
    ctx.clock.now = Date.parse(at('13:30'));
    const r = await req('POST', `/api/pro/appointments/${appt.id}/no-show`, {}, cookieA);
    assert.equal(r.status, 200);
    assert.equal(await SlotLock.countDocuments({ appointmentId: appt.id }), 3);
    assert.deepEqual(freed, []);
  });

  test('AC-07 contador: cuenta de WS Style o, sin cuenta, las no_asistio del mismo celular; 0 no se muestra', async () => {
    const vip = await makeClient({ name: 'Faltón', email: 'falton@clientes.test', phone: '+56977778888' });
    await CustomerProfile.create({ businessId: (await Appointment.db.collection('businesses').findOne())._id, userId: vip.user._id, counters: { noShows: 2 } });
    const a = await book({ name: 'Faltón', phone: '+56977778888', email: 'falton@clientes.test' });
    const b = await book({ time: '13:00', name: 'Cumplidor', phone: '+56912121212' });
    assert.equal((await req('GET', `/api/pro/appointments/${a.id}`, undefined, cookieA)).json.noShows, 2);
    assert.equal((await req('GET', `/api/admin/appointments/${a.id}`)).json.noShows, 2);
    assert.equal((await req('GET', `/api/pro/appointments/${b.id}`, undefined, cookieA)).json.noShows, 0);
    assert.equal((await req('GET', '/api/pro/customers?q=faltón', undefined, cookieA)).json.items[0].noShows, 2);
    /* Sin cuenta: se cuentan por celular. */
    ctx.clock.now = Date.parse(at('13:20'));
    assert.equal((await req('POST', `/api/pro/appointments/${b.id}/no-show`, {}, cookieA)).status, 200);
    const c = await book({ time: '15:00', name: 'Cumplidor', phone: '+56912121212' });
    assert.equal((await req('GET', `/api/pro/appointments/${c.id}`, undefined, cookieA)).json.noShows, 1);
    /* El cliente no ve su contador (RN-07). */
    assert.equal((await req('GET', `/api/wstyle/appointments/${a.id}`, undefined, vip.cookie)).json.noShows, undefined);
  });

  test('AC-06 corrección del admin: "Sí vino" dentro de 48 h resta el contador y audita; después → 409; barbero → 403', async () => {
    const client = await makeClient({ name: 'Pedro Pérez', email: 'pedro@clientes.test', phone: '+56955556666' });
    const appt = await book({ name: 'Pedro Pérez', phone: '+56955556666', email: 'pedro@clientes.test' });
    ctx.clock.now = Date.parse(at('12:20'));
    assert.equal((await req('POST', `/api/admin/appointments/${appt.id}/no-show`)).status, 200);
    /* RN-06: el barbero se entera en su bandeja. */
    assert.ok(await PanelNotification.exists({ userId: proA.userId, kind: 'admin_no_show' }));
    assert.equal((await req('POST', `/api/pro/appointments/${appt.id}/revert-no-show`, { reason: 'x' }, cookieA)).status, 404);
    assert.equal((await req('POST', `/api/admin/appointments/${appt.id}/revert-no-show`, { reason: 'x' }, cookieA)).status, 403);
    assert.equal((await req('POST', `/api/admin/appointments/${appt.id}/revert-no-show`, {})).status, 400);
    const view = await req('GET', `/api/admin/appointments/${appt.id}`);
    assert.equal(view.json.canRevertNoShow, true);
    const r = await req('POST', `/api/admin/appointments/${appt.id}/revert-no-show`, { reason: 'Llegó tarde y se atendió' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.status, 'terminada');
    assert.equal((await CustomerProfile.findOne({ userId: client.user._id })).counters.noShows, 0);
    const log = await AuditLog.findOne({ action: 'appointment.revert_no_show' });
    assert.ok(log);
    assert.match(log.summary, /Llegó tarde/);
    /* Pasadas 48 h ya no se puede. */
    const other = await book({ time: '15:00', name: 'Luis', phone: '+56966665555' });
    ctx.clock.now = Date.parse(at('15:20'));
    assert.equal((await req('POST', `/api/admin/appointments/${other.id}/no-show`)).status, 200);
    ctx.clock.now += 49 * HOUR;
    const late = await req('POST', `/api/admin/appointments/${other.id}/revert-no-show`, { reason: 'Tarde' });
    assert.equal(late.status, 409);
    assert.equal((await req('GET', `/api/admin/appointments/${other.id}`)).json.canRevertNoShow, false);
  });

  test('AC-08 bloqueo rápido: Almuerzo 1 h desde 13:00; "Resto del día" cierra con la ventana; conflicto lista las citas; no en el pasado', async () => {
    let r = await req('POST', '/api/pro/time-off', { fromDate: MONDAY, fromTime: '13:00', toDate: MONDAY, toTime: '14:00', reason: 'Almuerzo', quick: true }, cookieA);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual([r.json.timeOff.startsAt, r.json.timeOff.endsAt, r.json.timeOff.reason], [at('13:00'), at('14:00'), 'Almuerzo']);
    /* La agenda lo trae para dibujarlo. */
    const ag = await req('GET', `/api/pro/agenda?from=${MONDAY}&to=${MONDAY}`, undefined, cookieA);
    assert.ok(ag.json.timeOffs.some((o) => o.reason === 'Almuerzo'));
    /* Resto del día: PRO_A trabaja 12:00–18:00. */
    r = await req('POST', '/api/pro/time-off', { fromDate: MONDAY, fromTime: '15:00', restOfDay: true, reason: 'Trámite', quick: true }, cookieA);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.timeOff.endsAt, at('18:00'));
    assert.equal((await req('DELETE', `/api/pro/time-off/${r.json.timeOff.id}`, undefined, cookieA)).status, 200);
    /* CB-05: con una cita más tarde → 409 con la lista. */
    await book({ time: '16:00', name: 'Tarde', phone: '+56910101010' });
    r = await req('POST', '/api/pro/time-off', { fromDate: MONDAY, fromTime: '15:00', restOfDay: true, reason: 'Médico', quick: true }, cookieA);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'time_off_conflict');
    assert.equal(r.json.appointments.length, 1);
    /* RN-05: no en el pasado. */
    ctx.clock.now = Date.parse(at('15:00'));
    r = await req('POST', '/api/pro/time-off', { fromDate: MONDAY, fromTime: '14:00', toDate: MONDAY, toTime: '14:30', reason: 'Otro', quick: true }, cookieA);
    assert.equal(r.status, 400);
    assert.equal(r.json.fields.fromTime, 'past');
    /* Resto del día sin ventana de trabajo después → 400. */
    r = await req('POST', '/api/pro/time-off', { fromDate: MONDAY, fromTime: '19:00', restOfDay: true, reason: 'Otro', quick: true }, cookieA);
    assert.equal(r.status, 400);
  });

  test('AC-09 agenda del admin: un día, una columna por barbero aprobado; reservar, bloquear (auditado + bandeja) y quitar', async () => {
    const r = await req('GET', `/api/admin/agenda?date=${MONDAY}`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.barbers.map((x) => x.name).sort(), ['Barbero A', 'Barbero B'], 'CB-08: el suspendido no aparece');
    const colA = r.json.barbers.find((x) => x.id === String(proA._id));
    assert.equal(colA.day.date, MONDAY);
    assert.ok(colA.day.windows.length);
    assert.ok(colA.services.some((s) => s.id === 'corte'));
    /* Reservar en un hueco → confirmada para ese barbero. */
    const appt = await book({ pro: proB, time: '12:30', name: 'Mónica', phone: '+56920202020' });
    assert.equal(appt.status, 'confirmada');
    assert.equal(appt.professional.id, String(proB._id));
    const again = await req('GET', `/api/admin/agenda?date=${MONDAY}`);
    assert.equal(again.json.barbers.find((x) => x.id === String(proB._id)).day.appointments.length, 1);
    /* Horas libres de un barbero (para la hoja). */
    const slots = await req('GET', `/api/admin/barbers/${proA._id}/slots?service=corte&date=${MONDAY}`);
    assert.equal(slots.status, 200);
    assert.ok(slots.json.slots.some((s) => s.label === '12:00'));
    /* Bloquear para ese barbero. */
    const off = await req('POST', `/api/admin/barbers/${proA._id}/time-off`, { fromDate: MONDAY, fromTime: '13:00', toDate: MONDAY, toTime: '14:00', reason: 'Almuerzo', quick: true });
    assert.equal(off.status, 201, JSON.stringify(off.json));
    assert.equal(await TimeOff.countDocuments({ professionalId: proA._id }), 1);
    assert.ok(await AuditLog.exists({ action: 'barber.time_off_add' }));
    const note = await PanelNotification.findOne({ userId: proA.userId, kind: 'admin_time_off' });
    assert.equal(note?.title, 'WS Style bloqueó 13:00–14:00: Almuerzo');
    const del = await req('DELETE', `/api/admin/barbers/${proA._id}/time-off/${off.json.timeOff.id}`);
    assert.equal(del.status, 200);
    assert.equal(await TimeOff.countDocuments({ professionalId: proA._id }), 0);
    assert.ok(await AuditLog.exists({ action: 'barber.time_off_remove' }));
    /* El barbero no entra a la agenda del admin. */
    assert.equal((await req('GET', `/api/admin/agenda?date=${MONDAY}`, undefined, cookieA)).status, 403);
    assert.equal((await req('GET', '/api/admin/agenda?date=2026-13-01')).status, 400);
  });

  test('CB-01 dos reservas a la misma hora: una 201 y la otra 409', async () => {
    const body = (phone) => ({ phone, name: 'Cliente', serviceId: 'corte', startsAt: at('14:00'), confirmed: true });
    const [x, y] = await Promise.all([
      req('POST', '/api/pro/invitations', body('+56911110001'), cookieA),
      req('POST', '/api/pro/invitations', body('+56911110002'), cookieA),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [201, 409]);
    void MIN;
    void User;
  });
});
