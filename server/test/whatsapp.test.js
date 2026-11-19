/* SPEC-53: confirmación y recordatorios por WhatsApp (AC-01…AC-08, AC-12), contra la BD de
   test real. El borde HTTP de Meta es un doble (test/wa-fake.js): ningún test llama a
   graph.facebook.com (el `fetch` global se envuelve para que falle si alguien lo intenta). */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, AuditLog, Business, OutboundMessage, PanelNotification, Professional, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { reminderSendAt, renderMessage, templateParams } from '../src/domain/messaging.js';
import { classify, maskPhone } from '../src/lib/whatsapp.js';
import { api, connectDb, disconnectDb, HOUR, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeWhatsApp, signBody, WA_ENV } from './wa-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const WEDNESDAY = '2026-11-04';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const local = (time, date = MONDAY) => zonedToUtc(date, time, TZ);
const at = (time, date = MONDAY) => new Date(local(time, date)).toISOString();

/* AC-06: cualquier intento de hablar con Meta de verdad hace fallar el test. */
const realFetch = globalThis.fetch;
const graphCalls = [];
before(() => {
  globalThis.fetch = (url, init) => {
    if (String(url).includes('graph.facebook.com')) {
      graphCalls.push(String(url));
      return Promise.reject(new Error('Un test intentó llamar a graph.facebook.com'));
    }
    return realFetch(url, init);
  };
});
after(() => {
  globalThis.fetch = realFetch;
  assert.deepEqual(graphCalls, [], 'ningún test puede llamar a graph.facebook.com');
});

function booking(proId, startsAt, extra = {}) {
  return { serviceId: 'corte', professionalId: String(proId), startsAt, mode: 'shop', acceptPolicies: true, paymentMethod: 'local', note: '', ...extra };
}

/* Arma un entorno: `live` = con credenciales (fetch de Meta falso); si no, modo simulación. */
function harness({ live = false } = {}) {
  const t = { wa: null };
  t.boot = async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    const seeded = await seed({ pros: [PRO_A, PRO_B] });
    t.pro = seeded.pros[0];
    t.proB = seeded.pros[1];
    t.wa = fakeWhatsApp();
    t.ctx = await start({ now: SUNDAY_9AM, env: live ? WA_ENV : {}, whatsappFetch: t.wa.fetchImpl });
    t.messaging = t.ctx.app.locals.messaging;
    const barber = await makeClient({ name: 'Barbero A', roles: ['barber'], phone: '+56911119999' });
    await Professional.updateOne({ _id: t.pro._id }, { userId: barber.user._id });
    t.barber = barber.cookie;
    t.admin = await makeClient({ name: 'Joe Admin', email: 'joe@admin.test', roles: ['superadmin'], phone: '+56911118888' });
  };
  t.stop = () => t.ctx && stop(t.ctx.server);
  t.post = (path, body, cookie) => api(t.ctx.base, 'POST', path, { body, cookie });
  t.get = (path, cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.put = (path, body, cookie) => api(t.ctx.base, 'PUT', path, { body, cookie });
  /* Reserva (opt-in según `optIn`) y la confirma el barbero. */
  t.bookAndConfirm = async ({ client, time = '12:00', date = MONDAY, optIn = true, confirm = true, pro = t.pro } = {}) => {
    const c = client || (await makeClient({ name: 'Pedro Pérez', phone: '+56987654321' }));
    const r = await t.post('/api/wstyle/appointments', booking(pro._id, at(time, date), { whatsappOptIn: optIn }), c.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    if (confirm) {
      const k = await t.post(`/api/wstyle/appointments/${r.json.id}/confirm`, {}, t.barber);
      assert.equal(k.status, 200, JSON.stringify(k.json));
    }
    return { id: r.json.id, client: c };
  };
  t.msgs = (id) => OutboundMessage.find(id ? { appointmentId: id } : {}).sort({ kind: 1, createdAt: 1 }).lean();
  return t;
}

describe('SPEC-53 · reglas puras', () => {
  test('RN-04 anticipación + horario de silencio (22:00–08:00)', () => {
    const now = SUNDAY_9AM;
    const s = local('12:00');
    assert.equal(reminderSendAt({ startsMs: s, option: '2h', now, tz: TZ }), local('10:00'));
    assert.equal(reminderSendAt({ startsMs: s, option: '4h', now, tz: TZ }), local('08:00'));
    assert.equal(reminderSendAt({ startsMs: s, option: '1d', now, tz: TZ }), local('18:00', '2026-11-01'));
    assert.equal(reminderSendAt({ startsMs: local('12:00', WEDNESDAY), option: '2d', now, tz: TZ }), local('18:00', MONDAY));
    assert.equal(reminderSendAt({ startsMs: s, option: 'off', now, tz: TZ }), null);
    /* "Dos días antes" de un lunes ya pasó (sábado 18:00) → no se programa. */
    assert.equal(reminderSendAt({ startsMs: s, option: '2d', now, tz: TZ }), null);
    /* 11:00 con 4 h → 07:00 (silencio) → 08:00 (más cerca que las 21:00 de la víspera). */
    assert.equal(reminderSendAt({ startsMs: local('11:00'), option: '4h', now, tz: TZ }), local('08:00'));
    /* 08:30 con 2 h → 06:30 → las 08:00 pasan de la cita − 60 min → 21:00 de la víspera. */
    assert.equal(reminderSendAt({ startsMs: local('08:30'), option: '2h', now, tz: TZ }), local('21:00', '2026-11-01'));
    /* A menos de 30 min de "ahora" no se programa. */
    assert.equal(reminderSendAt({ startsMs: s, option: '2h', now: local('09:45'), tz: TZ }), null);
  });

  test('RN-07 texto: nombre de pila, servicio, barbero, fecha y hora; nunca precio ni email', () => {
    const appt = { customerSnapshot: { name: 'Pedro Pérez', email: 'p@x.cl' }, serviceSnapshot: { name: 'Corte', priceCLP: 12000 }, professionalSnapshot: { displayName: 'Barbero A' }, startsAt: new Date(local('12:00')), pricing: { totalCLP: 12000 } };
    const p = templateParams(appt, TZ);
    assert.deepEqual(p, ['Pedro', 'Corte', 'Barbero A', 'lunes 2 de noviembre', '12:00']);
    const text = renderMessage('reminder', p, { link: 'https://ricorp.cl/wstyle/cita/?id=1&t=x', shopWhatsapp: 'wa.me/56955550000' });
    assert.match(text, /Hola Pedro, te recordamos tu hora en WS Style: Corte con Barbero A, lunes 2 de noviembre a las 12:00/);
    assert.match(text, /\[Ver o cancelar mi cita\] https:\/\/ricorp\.cl/);
    assert.doesNotMatch(text, /12\.000|p@x\.cl/);
    assert.equal(maskPhone('+56912345678'), '+569****5678');
  });

  test('errores de Meta: transitorios, permanentes, plantilla y credenciales', () => {
    assert.equal(classify(500, {}).kind, 'transient');
    assert.equal(classify(429, { code: 130429 }).kind, 'transient');
    assert.equal(classify(400, { code: 131026 }).kind, 'permanent');
    assert.equal(classify(400, { code: 131026 }).message, 'el número no tiene WhatsApp');
    assert.equal(classify(400, { code: 132015 }).kind, 'template');
    assert.equal(classify(401, { code: 190 }).kind, 'auth');
  });
});

describe('SPEC-53 · programación (AC-01, AC-02)', () => {
  const t = harness();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 con opt-in: confirmar crea 1 confirmación (ahora) y 1 recordatorio (el día anterior, 18:00); el opt-in queda en el usuario', async () => {
    const { id, client } = await t.bookAndConfirm();
    const u = await User.findById(client.user._id).lean();
    assert.equal(u.whatsappOptIn.accepted, true);
    assert.equal(u.whatsappOptIn.source, 'reserva');
    assert.equal(u.whatsappOptIn.phoneE164, '+56987654321');
    const me = await t.get('/api/auth/me', client.cookie);
    assert.equal(me.json.user.whatsappOptIn, true);
    const [conf, rem] = await t.msgs(id);
    assert.equal((await t.msgs(id)).length, 2);
    assert.equal(conf.kind, 'confirmation');
    assert.equal(conf.sendAt.getTime(), SUNDAY_9AM);
    assert.equal(conf.status, 'por_salir');
    assert.equal(rem.kind, 'reminder');
    assert.equal(rem.sendAt.getTime(), local('18:00', '2026-11-01'));
    /* Mientras está pendiente no hay nada (RN-03). */
    const p = await t.bookAndConfirm({ time: '15:00', confirm: false });
    assert.equal((await t.msgs(p.id)).length, 0);
  });

  test('AC-01 sin opt-in no se programa nada (el correo sigue igual)', async () => {
    const { id, client } = await t.bookAndConfirm({ optIn: false });
    assert.equal((await t.msgs(id)).length, 0);
    assert.equal((await User.findById(client.user._id).lean()).whatsappOptIn.accepted, false);
    assert.ok(t.ctx.mailer.outbox.some((m) => m.to === client.user.email));
  });

  for (const [chip, date, expected] of [
    ['2h', MONDAY, () => local('10:00')],
    ['4h', MONDAY, () => local('08:00')],
    ['1d', MONDAY, () => local('18:00', '2026-11-01')],
    ['2d', WEDNESDAY, () => local('18:00', MONDAY)],
    ['off', MONDAY, () => null],
  ]) {
    test(`AC-01 chip "${chip}"`, async () => {
      await Business.updateOne({}, { $set: { 'whatsapp.reminder': chip } });
      const { id } = await t.bookAndConfirm({ date });
      const rem = (await t.msgs(id)).find((m) => m.kind === 'reminder');
      if (expected() == null) assert.equal(rem, undefined);
      else assert.equal(rem.sendAt.getTime(), expected());
      assert.equal((await t.msgs(id)).filter((m) => m.kind === 'confirmation').length, 1);
    });
  }

  test('CB-01 confirmada 1 h antes con "2 horas antes": sale solo la confirmación', async () => {
    await Business.updateOne({}, { $set: { 'whatsapp.reminder': '2h' } });
    const { id } = await t.bookAndConfirm({ confirm: false });
    t.ctx.clock.now = local('11:00');
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/confirm`, {}, t.barber)).status, 200);
    const msgs = await t.msgs(id);
    assert.deepEqual(msgs.map((m) => m.kind), ['confirmation']);
  });

  test('AC-02 cancelar deja los pendientes en "Ya no aplica" (CB-02)', async () => {
    const { id, client } = await t.bookAndConfirm();
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/cancel`, {}, client.cookie)).status, 200);
    const msgs = await t.msgs(id);
    assert.ok(msgs.every((m) => m.status === 'no_aplica'));
    assert.ok(msgs.every((m) => m.reason === 'La cita se canceló'));
  });

  test('AC-02 mover la cita (propuesta aceptada) reprograma el recordatorio y no repite la confirmación (CB-03)', async () => {
    const { id, client } = await t.bookAndConfirm();
    const pr = await t.post(`/api/wstyle/appointments/${id}/propose`, { startsAt: at('15:00', WEDNESDAY) }, t.barber);
    assert.equal(pr.status, 200, JSON.stringify(pr.json));
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/accept`, {}, client.cookie)).status, 200);
    const msgs = await t.msgs(id);
    assert.equal(msgs.filter((m) => m.kind === 'confirmation').length, 1);
    const rems = msgs.filter((m) => m.kind === 'reminder');
    assert.equal(rems.length, 2);
    const old = rems.find((m) => m.apptStartsAt.getTime() === local('12:00'));
    const fresh = rems.find((m) => m.apptStartsAt.getTime() === local('15:00', WEDNESDAY));
    assert.equal(old.status, 'no_aplica');
    assert.equal(fresh.status, 'por_salir');
    assert.equal(fresh.sendAt.getTime(), local('18:00', '2026-11-03'));
  });

  test('AC-02 una propuesta a una cita PENDIENTE que el cliente acepta sí confirma por WhatsApp (primera vez)', async () => {
    const { id, client } = await t.bookAndConfirm({ confirm: false });
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/propose`, { startsAt: at('15:00') }, t.barber)).status, 200);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/accept`, {}, client.cookie)).status, 200);
    assert.deepEqual((await t.msgs(id)).map((m) => m.kind), ['confirmation', 'reminder']);
  });

  test('AC-02 "no asistió" deja los pendientes en "Ya no aplica"', async () => {
    await Business.updateOne({}, { $set: { 'whatsapp.reminder': '2h' } });
    const { id } = await t.bookAndConfirm();
    t.ctx.clock.now = local('12:20');
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/no-show`, {}, t.barber)).status, 200);
    const rem = (await t.msgs(id)).find((m) => m.kind === 'reminder');
    assert.equal(rem.status, 'no_aplica');
    assert.equal(rem.reason, 'El cliente no asistió');
  });

  test('cita creada por el admin (nace confirmada) usa el opt-in guardado; sin opt-in no se envía', async () => {
    const c = await makeClient({ name: 'Ana Admin', email: 'ana@clientes.test', phone: '+56987650000' });
    await User.updateOne({ _id: c.user._id }, { $set: { whatsappOptIn: { accepted: true, at: new Date(), source: 'cuenta' } } });
    const r = await t.post('/api/admin/appointments', { name: 'Ana Admin', phone: '+56987650000', email: 'ana@clientes.test', serviceId: 'corte', professionalId: String(t.pro._id), startsAt: at('13:00') }, t.admin.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual((await t.msgs(r.json.id)).map((m) => m.kind), ['confirmation', 'reminder']);
    const r2 = await t.post('/api/admin/appointments', { name: 'Sin Optin', phone: '+56987651111', serviceId: 'corte', professionalId: String(t.pro._id), startsAt: at('14:00') }, t.admin.cookie);
    assert.equal(r2.status, 201);
    assert.equal((await t.msgs(r2.json.id)).length, 0);
  });

  test('invitación del barbero aceptada por el cliente con opt-in → confirmación', async () => {
    const c = await makeClient({ name: 'Inés', phone: '+56987652222' });
    await User.updateOne({ _id: c.user._id }, { $set: { whatsappOptIn: { accepted: true, at: new Date(), source: 'reserva' } } });
    const inv = await t.post('/api/pro/invitations', { name: 'Inés', phone: '+56987652222', serviceId: 'corte', startsAt: at('16:00') }, t.barber);
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    const id = inv.json.appointment.id;
    assert.equal((await t.msgs(id)).length, 0);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/confirm`, {}, c.cookie)).status, 200);
    assert.deepEqual((await t.msgs(id)).map((m) => m.kind), ['confirmation', 'reminder']);
  });

  test('RN-02 "Mi cuenta" desactiva el opt-in y frena todo lo "Por salir"; sin celular válido no se puede activar', async () => {
    const { id, client } = await t.bookAndConfirm();
    const r = await api(t.ctx.base, 'PATCH', '/api/auth/me', { body: { whatsappOptIn: false }, cookie: client.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.whatsappOptIn, false);
    assert.ok((await t.msgs(id)).every((m) => m.status === 'no_aplica' && m.reason === 'El cliente se dio de baja'));
    const noPhone = await makeClient({ name: 'Sin Fono', phone: '' });
    const bad = await api(t.ctx.base, 'PATCH', '/api/auth/me', { body: { whatsappOptIn: true }, cookie: noPhone.cookie });
    assert.equal(bad.status, 400);
  });

  test('CB-13 cuenta eliminada: sus mensajes "Por salir" no salen', async () => {
    const { id, client } = await t.bookAndConfirm();
    const r = await api(t.ctx.base, 'DELETE', '/api/auth/me', { cookie: client.cookie });
    assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
    assert.ok((await t.msgs(id)).every((m) => m.status !== 'por_salir'));
  });
});

describe('SPEC-53 · despachador con Meta (AC-03, AC-04)', () => {
  const t = harness({ live: true });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-03 200 → Enviado con el id de Meta; la plantilla lleva variables y el botón con el token', async () => {
    const { id } = await t.bookAndConfirm();
    const r = await t.messaging.runDispatch();
    assert.equal(r.sent, 1);
    const conf = (await t.msgs(id)).find((m) => m.kind === 'confirmation');
    assert.equal(conf.status, 'enviado');
    assert.equal(conf.waMessageId, 'wamid.TEST1');
    assert.equal(t.wa.calls.length, 1);
    const call = t.wa.calls[0];
    assert.equal(call.path, `/v23.0/${WA_ENV.WHATSAPP_PHONE_NUMBER_ID}/messages`);
    assert.equal(call.body.to, '56987654321');
    assert.equal(call.body.template.name, 'ws_cita_confirmada');
    assert.equal(call.body.template.language.code, 'es');
    assert.deepEqual(call.body.template.components[0].parameters.map((p) => p.text), ['Pedro', 'Corte', 'Barbero A', 'lunes 2 de noviembre', '12:00']);
    assert.match(call.body.template.components[1].parameters[0].text, new RegExp(`^id=${id}&t=[\\w-]{20,}$`));
    /* El texto guardado no expone el token (con credenciales reales). */
    assert.match(conf.renderedText, /&t=…/);
    /* El recordatorio (mañana 18:00) aún no sale. */
    assert.equal((await t.msgs(id)).find((m) => m.kind === 'reminder').status, 'por_salir');
  });

  test('AC-03 / CB-05 500 → reintentos a 1, 5 y 15 min y luego "No salió · Meta no respondió"', async () => {
    const { id } = await t.bookAndConfirm();
    const conf = () => OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    const start = t.ctx.clock.now;
    let elapsed = 0;
    for (const [i, delay] of [1, 5, 15].entries()) {
      t.wa.queue.push(t.wa.err(500, 1, 'internal'));
      await t.messaging.runDispatch();
      const m = await conf();
      assert.equal(m.status, 'por_salir', `intento ${i + 1}`);
      assert.equal(m.attempts, i + 1);
      assert.equal(m.sendAt.getTime(), start + elapsed + delay * MIN);
      /* Antes de tiempo no se reintenta. */
      t.ctx.clock.now = start + elapsed + delay * MIN - 1000;
      await t.messaging.runDispatch();
      assert.equal(t.wa.calls.length, i + 1);
      elapsed += delay * MIN;
      t.ctx.clock.now = start + elapsed;
    }
    t.wa.queue.push(t.wa.err(503, 2, 'unavailable'));
    await t.messaging.runDispatch();
    const m = await conf();
    assert.equal(m.status, 'fallido');
    assert.equal(m.lastError, 'Meta no respondió');
    assert.equal(t.wa.calls.length, 4);
  });

  test('AC-03 / CB-06 error permanente (número sin WhatsApp) → "No salió" sin reintento', async () => {
    const { id } = await t.bookAndConfirm();
    t.wa.queue.push(t.wa.err(400, 131026, 'Message undeliverable'));
    await t.messaging.runDispatch();
    const m = await OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    assert.equal(m.status, 'fallido');
    assert.equal(m.lastError, 'el número no tiene WhatsApp');
    t.ctx.clock.now += HOUR;
    await t.messaging.runDispatch();
    assert.equal(t.wa.calls.length, 1);
  });

  test('CB-07 plantilla no aprobada → "No salió" y UN solo aviso al super admin', async () => {
    await t.bookAndConfirm({ time: '12:00' });
    await t.bookAndConfirm({ time: '15:00', client: await makeClient({ name: 'Otra Persona', phone: '+56987650001' }) });
    t.wa.queue.push(t.wa.err(400, 132015, 'Template is paused'), t.wa.err(400, 132015, 'Template is paused'));
    await t.messaging.runDispatch();
    const failed = await OutboundMessage.find({ kind: 'confirmation' }).lean();
    assert.equal(failed.length, 2);
    assert.ok(failed.every((m) => m.status === 'fallido' && m.lastError === 'plantilla no aprobada'));
    assert.equal(await PanelNotification.countDocuments({ userId: t.admin.user._id, kind: 'whatsapp_template' }), 1);
  });

  test('CB-08 token inválido (401) → queda "Por salir" con un intento y Configuración muestra "Credenciales inválidas"', async () => {
    const { id } = await t.bookAndConfirm();
    t.wa.queue.push(t.wa.err(401, 190, 'Invalid OAuth access token'));
    const r = await t.messaging.runDispatch();
    assert.equal(r.auth, 1);
    const m = await OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    assert.equal(m.status, 'por_salir');
    assert.equal(m.attempts, 1);
    const cfg = await t.get('/api/admin/whatsapp', t.admin.cookie);
    assert.equal(cfg.json.channel.mode, 'auth_failed');
    assert.match(cfg.json.channel.label, /Credenciales inválidas/);
    /* El próximo envío exitoso limpia la alerta. */
    t.ctx.clock.now += 6 * MIN;
    await t.messaging.runDispatch();
    assert.equal((await OutboundMessage.findById(m._id).lean()).status, 'enviado');
    assert.equal((await t.get('/api/admin/whatsapp', t.admin.cookie)).json.channel.mode, 'live');
  });

  test('AC-03 / CB-10 dos despachadores en paralelo → un solo fetch por mensaje', async () => {
    const clients = await Promise.all([0, 1, 2].map((i) => makeClient({ name: `Cliente ${i}`, phone: `+5698765100${i}` })));
    for (const [i, c] of clients.entries()) await t.bookAndConfirm({ client: c, time: ['12:00', '13:00', '14:00'][i] });
    const [a, b] = await Promise.all([t.messaging.runDispatch(), t.messaging.runDispatch()]);
    assert.equal(a.sent + b.sent, 3);
    assert.equal(t.wa.calls.length, 3);
    assert.equal(new Set(t.wa.calls.map((c) => c.body.to)).size, 3);
  });

  test('AC-04 / RN-05 cita cancelada entre la programación y el envío → no llama a fetch', async () => {
    const { id } = await t.bookAndConfirm();
    /* Cambio "por fuera" (sin el hook) para probar la relectura del despachador. */
    await Appointment.updateOne({ _id: id }, { $set: { status: 'cancelada' } });
    await t.messaging.runDispatch();
    assert.equal(t.wa.calls.length, 0);
    assert.ok((await t.msgs(id)).filter((m) => m.kind === 'confirmation').every((m) => m.status === 'no_aplica'));
  });

  test('CB-04 recordatorio atrasado (servidor dormido) a 40 min de la cita → "Ya no aplica · llegó tarde"', async () => {
    await Business.updateOne({}, { $set: { 'whatsapp.reminder': '2h' } });
    const { id } = await t.bookAndConfirm();
    await t.messaging.runDispatch();
    t.ctx.clock.now = local('11:20');
    await t.messaging.runDispatch();
    const rem = (await t.msgs(id)).find((m) => m.kind === 'reminder');
    assert.equal(rem.status, 'no_aplica');
    assert.equal(rem.reason, 'Llegó tarde');
    assert.equal(t.wa.calls.length, 1);
  });

  test('horario de silencio también al enviar: un recordatorio que despierta a las 06:30 espera a las 08:00', async () => {
    await Business.updateOne({}, { $set: { 'whatsapp.reminder': '2h' } });
    const { id } = await t.bookAndConfirm({ time: '12:00' });
    await t.messaging.runDispatch();
    const rem = await OutboundMessage.findOne({ appointmentId: id, kind: 'reminder' });
    await OutboundMessage.updateOne({ _id: rem._id }, { $set: { sendAt: new Date(local('06:00')) } });
    t.ctx.clock.now = local('06:30');
    await t.messaging.runDispatch();
    const r1 = await OutboundMessage.findById(rem._id).lean();
    assert.equal(r1.status, 'por_salir');
    assert.equal(r1.sendAt.getTime(), local('08:00'));
    assert.equal(t.wa.calls.length, 1);
    t.ctx.clock.now = local('08:00');
    await t.messaging.runDispatch();
    assert.equal((await OutboundMessage.findById(rem._id).lean()).status, 'enviado');
  });

  test('la cita se mueve ANTES de que salga la confirmación: la confirmación sale igual (una sola)', async () => {
    const { id, client } = await t.bookAndConfirm();
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/propose`, { startsAt: at('15:00', WEDNESDAY) }, t.barber)).status, 200);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/accept`, {}, client.cookie)).status, 200);
    await t.messaging.runDispatch();
    const confs = (await t.msgs(id)).filter((m) => m.kind === 'confirmation');
    assert.equal(confs.length, 1);
    assert.equal(confs[0].status, 'enviado');
    assert.equal(t.wa.calls[0].body.template.components[0].parameters[3].text, 'miércoles 4 de noviembre');
  });

  test('la cita se mueve y vuelve a su hora original: el recordatorio de esa hora revive', async () => {
    const { id, client } = await t.bookAndConfirm();
    const move = async (time, date) => {
      assert.equal((await t.post(`/api/wstyle/appointments/${id}/propose`, { startsAt: at(time, date) }, t.barber)).status, 200);
      assert.equal((await t.post(`/api/wstyle/appointments/${id}/accept`, {}, client.cookie)).status, 200);
    };
    await move('15:00', WEDNESDAY);
    await move('12:00', MONDAY);
    const rems = (await t.msgs(id)).filter((m) => m.kind === 'reminder');
    const monday = rems.find((m) => m.apptStartsAt.getTime() === local('12:00'));
    assert.equal(monday.status, 'por_salir');
    assert.equal(monday.sendAt.getTime(), local('18:00', '2026-11-01'));
    assert.equal(rems.find((m) => m.apptStartsAt.getTime() === local('15:00', WEDNESDAY)).status, 'no_aplica');
    assert.equal((await t.msgs(id)).filter((m) => m.kind === 'confirmation').length, 1);
  });

  test('CB-12 el cliente cambia su teléfono: sale al teléfono vigente', async () => {
    const { client } = await t.bookAndConfirm();
    await api(t.ctx.base, 'PATCH', '/api/auth/me', { body: { phone: '+56 9 1111 2222' }, cookie: client.cookie });
    await t.messaging.runDispatch();
    assert.equal(t.wa.calls[0].body.to, '56911112222');
  });

  test('lease vencido (el proceso murió a mitad) → vuelve a la cola y sale una vez', async () => {
    const { id } = await t.bookAndConfirm();
    await OutboundMessage.updateOne({ appointmentId: id, kind: 'confirmation' }, { $set: { status: 'enviando', leaseUntil: new Date(t.ctx.clock.now + 2 * MIN) } });
    await t.messaging.runDispatch();
    assert.equal(t.wa.calls.length, 0);
    t.ctx.clock.now += 3 * MIN;
    await t.messaging.runDispatch();
    assert.equal(t.wa.calls.length, 1);
  });
});

describe('SPEC-53 · webhook de Meta (AC-05)', () => {
  const t = harness({ live: true });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  const hook = (payload, sig) => {
    const raw = JSON.stringify(payload);
    return realFetch(`${t.ctx.base}/api/whatsapp/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig ?? signBody(raw) }, body: raw }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
  };
  const statusEvent = (id, status, ts) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: [{ id, status, timestamp: String(ts), recipient_id: '56987654321' }] } }] }] });
  const incoming = (id, from, text) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', contacts: [{ wa_id: from, profile: { name: 'Pedro WA' } }], messages: [{ id, from, timestamp: '1', type: 'text', text: { body: text } }] } }] }] });

  test('GET devuelve el challenge con el verify token correcto y 403 con uno incorrecto', async () => {
    const ok = await realFetch(`${t.ctx.base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${WA_ENV.WHATSAPP_VERIFY_TOKEN}&hub.challenge=12345`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '12345');
    const bad = await realFetch(`${t.ctx.base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345`);
    assert.equal(bad.status, 403);
  });

  test('POST con firma inválida → 401 y no se procesa', async () => {
    const { id } = await t.bookAndConfirm();
    await t.messaging.runDispatch();
    const r = await hook(statusEvent('wamid.TEST1', 'delivered', 1), 'sha256=' + '0'.repeat(64));
    assert.equal(r.status, 401);
    assert.equal((await t.msgs(id)).find((m) => m.kind === 'confirmation').status, 'enviado');
  });

  test('CB-09 estados idempotentes y monótonos: Leído no retrocede a Entregado', async () => {
    const { id } = await t.bookAndConfirm();
    await t.messaging.runDispatch();
    const conf = () => OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    assert.equal((await hook(statusEvent('wamid.TEST1', 'delivered', 1767000000))).status, 200);
    assert.equal((await conf()).status, 'entregado');
    await hook(statusEvent('wamid.TEST1', 'read', 1767000100));
    await hook(statusEvent('wamid.TEST1', 'read', 1767000100));
    assert.equal((await conf()).status, 'leido');
    await hook(statusEvent('wamid.TEST1', 'delivered', 1767000200));
    const m = await conf();
    assert.equal(m.status, 'leido');
    assert.equal(m.deliveredAt.getTime(), 1767000000 * 1000);
    assert.equal(m.readAt.getTime(), 1767000100 * 1000);
  });

  test('"BAJA" entrante (sin importar mayúsculas ni tildes) desactiva el opt-in y frena los pendientes', async () => {
    const { id, client } = await t.bookAndConfirm();
    await hook(incoming('wamid.IN1', '56987654321', '  baja. '));
    assert.equal((await User.findById(client.user._id).lean()).whatsappOptIn.accepted, false);
    assert.ok((await t.msgs(id)).every((m) => m.status === 'no_aplica'));
    /* Respuesta de cortesía (texto, dentro de la ventana de 24 h). */
    assert.equal(t.wa.calls.at(-1).body.type, 'text');
    /* Repetido: idempotente (no se responde dos veces). */
    const n = t.wa.calls.length;
    await hook(incoming('wamid.IN1', '56987654321', 'BAJA'));
    assert.equal(t.wa.calls.length, n);
  });

  test('otro texto → aviso en la bandeja del super admin + respuesta automática con el WhatsApp del local', async () => {
    await t.bookAndConfirm();
    await hook(incoming('wamid.IN2', '56987654321', 'Hola, llego 5 min tarde'));
    const n = await PanelNotification.findOne({ userId: t.admin.user._id, kind: 'whatsapp_reply' }).lean();
    assert.equal(n.title, 'Pedro Pérez respondió por WhatsApp');
    assert.equal(n.body, 'Hola, llego 5 min tarde');
    const last = t.wa.calls.at(-1);
    assert.equal(last.body.type, 'text');
    assert.match(last.body.text.body, /Este número solo envía avisos\. Escríbenos al https:\/\/wa\.me\/56955550000/);
  });
});

describe('SPEC-53 · modo sin credenciales y link con token (AC-06, AC-07)', () => {
  const t = harness({ live: false });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  const linkOf = async (id) => {
    await t.messaging.runDispatch();
    const conf = await OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    return new URL(conf.renderedText.match(/https?:\/\/\S+/)[0]).searchParams.get('t');
  };

  test('AC-06 sin variables: "Simulado" con el texto renderizado y sin pedir nada a Meta', async () => {
    const { id } = await t.bookAndConfirm();
    const r = await t.messaging.runDispatch();
    assert.equal(r.simulated, 1);
    assert.equal(t.wa.calls.length, 0);
    const conf = await OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    assert.equal(conf.status, 'simulado');
    assert.match(conf.renderedText, /^Hola Pedro, tu hora en WS Style quedó confirmada: Corte con Barbero A, el lunes 2 de noviembre a las 12:00\./);
    assert.match(conf.renderedText, /\/wstyle\/cita\/\?id=[a-f0-9]{24}&t=[\w-]{20,}/);
    const cfg = await t.get('/api/admin/whatsapp', t.admin.cookie);
    assert.equal(cfg.json.channel.mode, 'dry-run');
  });

  test('AC-07 id + t: ver y cancelar sin sesión; confirmar/aceptar/contraofertar → 403; otra cita o vencido → 404', async () => {
    const { id } = await t.bookAndConfirm();
    const other = await t.bookAndConfirm({ time: '15:00', client: await makeClient({ name: 'Otro', phone: '+56987650002' }) });
    const tok = await linkOf(id);
    const view = await t.get(`/api/wstyle/appointments/${id}?t=${tok}`);
    assert.equal(view.status, 200, JSON.stringify(view.json));
    assert.equal(view.json.guest, true);
    assert.deepEqual(view.json.actions, ['cancel']);
    assert.equal((await t.get(`/api/wstyle/appointments/${other.id}?t=${tok}`)).status, 404);
    assert.equal((await t.get(`/api/wstyle/appointments/${id}?t=malo`)).status, 404);
    assert.equal((await t.get(`/api/wstyle/appointments/${id}`)).status, 401);
    for (const a of ['confirm', 'accept', 'counter', 'propose']) {
      const r = await t.post(`/api/wstyle/appointments/${id}/${a}`, { t: tok, startsAt: at('16:00') });
      assert.equal(r.status, 403, `${a} → ${r.status}`);
    }
    const c = await t.post(`/api/wstyle/appointments/${id}/cancel`, { t: tok, reason: 'No alcanzo' });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.equal(c.json.status, 'cancelada');
    assert.deepEqual(c.json.actions, []);
    const appt = await Appointment.findById(id).lean();
    assert.equal(appt.history.at(-1).by, 'client');
    /* CB-14: cancelada → se ve sin acciones; después del fin de la cita el token ya no sirve. */
    assert.deepEqual((await t.get(`/api/wstyle/appointments/${id}?t=${tok}`)).json.actions, []);
    t.ctx.clock.now = local('13:00');
    assert.equal((await t.get(`/api/wstyle/appointments/${id}?t=${tok}`)).status, 404);
  });

  test('AC-07 con la sesión de OTRA persona + token: se ve como invitado y solo cancela', async () => {
    const { id } = await t.bookAndConfirm();
    const tok = await linkOf(id);
    const other = await makeClient({ name: 'Otra Sesión', phone: '+56987650009' });
    const view = await t.get(`/api/wstyle/appointments/${id}?t=${tok}`, other.cookie);
    assert.equal(view.status, 200);
    assert.equal(view.json.guest, true);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/confirm`, { t: tok }, other.cookie)).status, 403);
    assert.equal((await t.post(`/api/wstyle/appointments/${id}/cancel`, {}, other.cookie)).status, 404);
    const c = await t.post(`/api/wstyle/appointments/${id}/cancel`, { t: tok }, other.cookie);
    assert.equal(c.status, 200);
    assert.equal(c.json.status, 'cancelada');
  });

  test('AC-07 con el token se respeta el plazo de cancelación (cancelUntilMinutes)', async () => {
    const { id } = await t.bookAndConfirm();
    const tok = await linkOf(id);
    t.ctx.clock.now = local('10:00');
    const r = await t.post(`/api/wstyle/appointments/${id}/cancel`, { t: tok });
    assert.equal(r.status, 409);
    assert.equal(r.json.reason, 'too_late');
  });
});

describe('SPEC-53 · panel "Mensajes" y configuración (AC-08, AC-10, AC-12)', () => {
  const t = harness({ live: true });
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('KPIs, lista, detalle con el texto final y búsqueda', async () => {
    const { id } = await t.bookAndConfirm();
    await t.messaging.runDispatch();
    const l = await t.get('/api/admin/messages', t.admin.cookie);
    assert.equal(l.status, 200);
    assert.equal(l.json.kpis.pending, 1);
    assert.equal(l.json.kpis.nextSendAt, new Date(local('18:00', '2026-11-01')).toISOString());
    assert.equal(l.json.kpis.monthSent, 1);
    assert.equal(l.json.items.length, 2);
    const rem = l.json.items.find((m) => m.kind === 'reminder');
    assert.equal(rem.kindLabel, 'RECORDATORIO');
    assert.equal(rem.statusLabel, 'Por salir');
    assert.equal(rem.customer, 'Pedro Pérez');
    assert.equal(rem.phone, '+569****4321');
    assert.equal(rem.canStop, true);
    const d = await t.get(`/api/admin/messages/${rem.id}`, t.admin.cookie);
    assert.match(d.json.text, /te recordamos tu hora en WS Style/);
    assert.equal((await t.get('/api/admin/messages?status=enviado', t.admin.cookie)).json.items.length, 1);
    assert.equal((await t.get('/api/admin/messages?kind=reminder', t.admin.cookie)).json.items.length, 1);
    assert.equal((await t.get('/api/admin/messages?q=pedro', t.admin.cookie)).json.items.length, 2);
    assert.equal((await t.get('/api/admin/messages?q=4321', t.admin.cookie)).json.items.length, 2);
    assert.equal((await t.get('/api/admin/messages?q=nadie', t.admin.cookie)).json.items.length, 0);
    assert.ok(id);
  });

  test('[No mandarlo] → "Frenado" + auditoría; ya saliendo → 409 "Ya está saliendo"', async () => {
    const { id } = await t.bookAndConfirm();
    const rem = await OutboundMessage.findOne({ appointmentId: id, kind: 'reminder' }).lean();
    const r = await t.post(`/api/admin/messages/${rem._id}/stop`, {}, t.admin.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'frenado');
    assert.equal(r.json.statusLabel, 'Frenado');
    assert.ok(await AuditLog.exists({ action: 'whatsapp.stop', entityId: String(rem._id) }));
    assert.equal((await t.post(`/api/admin/messages/${rem._id}/stop`, {}, t.admin.cookie)).status, 409);
    const conf = await OutboundMessage.findOneAndUpdate({ appointmentId: id, kind: 'confirmation' }, { $set: { status: 'enviando' } }, { new: true }).lean();
    const busy = await t.post(`/api/admin/messages/${conf._id}/stop`, {}, t.admin.cookie);
    assert.equal(busy.status, 409);
    assert.equal(busy.json.message, 'Ya está saliendo');
  });

  test('[Reintentar] un "No salió" transitorio con la cita futura', async () => {
    const { id } = await t.bookAndConfirm();
    await OutboundMessage.updateOne({ appointmentId: id, kind: 'confirmation' }, { $set: { status: 'fallido', errorKind: 'transient', lastError: 'Meta no respondió', attempts: 4 } });
    const conf = await OutboundMessage.findOne({ appointmentId: id, kind: 'confirmation' }).lean();
    const l = await t.get('/api/admin/messages?status=fallido', t.admin.cookie);
    assert.equal(l.json.items[0].canRetry, true);
    const r = await t.post(`/api/admin/messages/${conf._id}/retry`, {}, t.admin.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'por_salir');
    await t.messaging.runDispatch();
    assert.equal((await OutboundMessage.findById(conf._id).lean()).status, 'enviado');
  });

  test('cambiar el chip a "2 horas antes" re-programa los "Por salir" y queda en la auditoría', async () => {
    const { id } = await t.bookAndConfirm();
    const r = await t.put('/api/admin/whatsapp', { reminder: '2h' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.reminder, '2h');
    assert.equal(r.json.rescheduled, 1);
    const rem = await OutboundMessage.findOne({ appointmentId: id, kind: 'reminder' }).lean();
    assert.equal(rem.sendAt.getTime(), local('10:00'));
    assert.ok(await AuditLog.exists({ action: 'settings.whatsapp' }));
    /* "No mandar" → ya no aplica; volver a un chip lo revive. */
    await t.put('/api/admin/whatsapp', { reminder: 'off' }, t.admin.cookie);
    assert.equal((await OutboundMessage.findById(rem._id).lean()).status, 'no_aplica');
    await t.put('/api/admin/whatsapp', { reminder: '4h' }, t.admin.cookie);
    const back = await OutboundMessage.findById(rem._id).lean();
    assert.equal(back.status, 'por_salir');
    assert.equal(back.sendAt.getTime(), local('08:00'));
    /* Validación: campos desconocidos (p.ej. el token) y valores fuera de lista → 400. */
    assert.equal((await t.put('/api/admin/whatsapp', { token: 'x' }, t.admin.cookie)).status, 400);
    assert.equal((await t.put('/api/admin/whatsapp', { reminder: '3h' }, t.admin.cookie)).status, 400);
    assert.equal((await t.put('/api/admin/whatsapp', { confirmEnabled: false }, t.admin.cookie)).json.confirmEnabled, false);
  });

  test('confirmEnabled apagado: solo se programa el recordatorio', async () => {
    await t.put('/api/admin/whatsapp', { confirmEnabled: false }, t.admin.cookie);
    const { id } = await t.bookAndConfirm();
    assert.deepEqual((await t.msgs(id)).map((m) => m.kind), ['reminder']);
  });

  test('AC-12 la API del panel nunca devuelve el token ni el app secret', async () => {
    await t.bookAndConfirm();
    await t.messaging.runDispatch();
    const bodies = [
      await t.get('/api/admin/whatsapp', t.admin.cookie),
      await t.get('/api/admin/messages', t.admin.cookie),
      await t.get('/api/admin/settings', t.admin.cookie),
    ].map((r) => JSON.stringify(r.json));
    for (const b of bodies) {
      for (const secret of [WA_ENV.WHATSAPP_TOKEN, WA_ENV.WHATSAPP_APP_SECRET, WA_ENV.WHATSAPP_VERIFY_TOKEN]) assert.ok(!b.includes(secret));
    }
    const cfg = JSON.parse(bodies[0]);
    assert.equal(cfg.channel.mode, 'live');
    assert.match(cfg.preview.confirmation, /quedó confirmada/);
    assert.match(cfg.preview.reminder, /te recordamos/);
    assert.deepEqual(cfg.options.map((o) => o.id), ['2h', '4h', '1d', '2d', 'off']);
  });

  test('AC-08 permisos: cliente y barbero → 403; super admin → 200', async () => {
    const c = await makeClient({ name: 'Cliente', phone: '+56987650003' });
    for (const [m, p] of [['GET', '/api/admin/messages'], ['GET', '/api/admin/whatsapp'], ['PUT', '/api/admin/whatsapp']]) {
      assert.equal((await api(t.ctx.base, m, p, { cookie: c.cookie, body: m === 'GET' ? undefined : {} })).status, 403);
      assert.equal((await api(t.ctx.base, m, p, { cookie: t.barber, body: m === 'GET' ? undefined : {} })).status, 403);
      assert.equal((await api(t.ctx.base, m, p, { cookie: t.admin.cookie, body: m === 'GET' ? undefined : {} })).status, 200);
    }
  });
});
