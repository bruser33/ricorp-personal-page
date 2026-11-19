/* SPEC-52 AC-01…AC-07: reseñas de clientes contra la BD de test REAL (replica set), mailer en dry-run y reloj
   inyectado. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, AuditLog, Notification, PanelNotification, Review, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { api, connectDb, disconnectDb, makeClient, MIN, PRO_A, resetDb, seed, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const DAY = 24 * 60 * MIN;
const MONDAY = '2026-11-02';
const NOW = Date.parse('2026-11-18T15:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';
const GOOD = 'Excelente degradado, muy buena atención.';

function suite() {
  const t = { ctx: null, seeded: null, admin: null };
  t.boot = async ({ now = NOW } = {}) => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    await Review.init();
    t.seeded = await seed({ pros: [PRO_A] });
    t.ctx = await start({ now, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL } });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  t.req = (method, path, body, cookie) => api(t.ctx.base, method, path, { body, cookie });
  t.client = (name = 'Pedro Rico Díaz') => makeClient({ name, email: `${Math.random().toString(36).slice(2, 9)}@clientes.test` });
  /* Cita creada directo en la BD: terminada hace `ago` (por defecto 1 día). */
  t.appt = async (owner, { status = 'terminada', ago = DAY, service = 'Corte + barba' } = {}) => {
    const pro = t.seeded.pros[0];
    const end = new Date(t.ctx.clock.now - ago);
    return Appointment.create({
      businessId: t.seeded.business._id,
      professionalId: pro._id,
      customerUserId: owner ? owner.user._id : null,
      customerSnapshot: { name: owner?.user.name || 'Cliente por teléfono', email: owner?.user.email, phoneE164: '+56911112222' },
      serviceSnapshot: { slug: 'corte-barba', name: service, priceCLP: 18000, durationMin: 60 },
      professionalSnapshot: { displayName: 'Joe' },
      startsAt: new Date(end.getTime() - 60 * MIN),
      endsAt: new Date(end.getTime() - 10 * MIN),
      status,
      history: status === 'terminada' ? [{ at: end, from: 'en_curso', to: 'terminada', by: 'barber' }] : [],
    });
  };
  t.review = (cookie, appt, body = {}) => t.req('POST', '/api/wstyle/reviews', { appointmentId: String(appt._id), rating: 5, comment: GOOD, ...body }, cookie);
  return t;
}

describe('SPEC-52 reseñas', () => {
  const t = suite();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  test('AC-01 el dueño de una cita terminada crea su reseña → 201, visible, con nombre corto y servicio', async () => {
    const c = await t.client('Pedro Rico Díaz');
    const appt = await t.appt(c);
    const r = await t.review(c.cookie, appt);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.review.author, 'Pedro D.');
    assert.equal(r.json.review.service, 'Corte + barba');
    const doc = await Review.findOne({ appointmentId: appt._id }).lean();
    assert.equal(doc.status, 'visible');
    assert.equal(doc.rating, 5);
    assert.equal(doc.comment, GOOD);
    assert.equal(doc.authorName, 'Pedro D.');
    assert.equal(doc.serviceName, 'Corte + barba');
    assert.equal(doc.professionalName, 'Joe');
    assert.equal(String(doc.userId), String(c.user._id));
    /* RN-06: el nombre queda guardado; si el cliente se cambia el nombre, la reseña no cambia. */
    await User.updateOne({ _id: c.user._id }, { name: 'Otro Nombre' });
    assert.equal((await t.req('GET', '/api/wstyle/reviews')).json.items[0].author, 'Pedro D.');
    /* CB-11 */
    const m = await t.client('María José Pérez');
    assert.equal((await t.review(m.cookie, await t.appt(m))).json.review.author, 'María P.');
  });

  test('AC-02 elegibilidad: estados no atendidos 409, ajena/inexistente 404, anónimo 401, duplicada 409, plazo 409', async () => {
    const c = await t.client();
    for (const status of ['cancelada', 'no_asistio', 'expirada', 'confirmada', 'en_curso']) {
      const r = await t.review(c.cookie, await t.appt(c, { status }));
      assert.equal(r.status, 409, status);
      assert.equal(r.json.message, 'Solo puedes reseñar una cita atendida.');
    }
    const other = await t.client('Otra Persona');
    const foreign = await t.appt(other);
    const r404 = await t.review(c.cookie, foreign);
    assert.equal(r404.status, 404);
    assert.equal(r404.json.message, 'No encontramos esa cita en tu cuenta');
    assert.equal((await t.review(c.cookie, { _id: '0123456789abcdef01234567' })).status, 404);
    assert.equal((await t.review(c.cookie, { _id: 'no-es-un-id' })).status, 404);
    /* Cita sin cuenta (creada por teléfono): nadie la puede reseñar. */
    assert.equal((await t.review(c.cookie, await t.appt(null))).status, 404);
    assert.equal((await t.review(undefined, await t.appt(c))).status, 401);
    /* El super admin tampoco reseña citas de otros (404 si no es su cita como cliente). */
    assert.equal((await t.review(t.admin.cookie, foreign)).status, 404);

    const mine = await t.appt(c);
    assert.equal((await t.review(c.cookie, mine)).status, 201);
    const again = await t.review(c.cookie, mine);
    assert.equal(again.status, 409);
    assert.equal(again.json.message, 'Ya dejaste una reseña para esta cita.');

    /* CB-02: envíos simultáneos → exactamente una reseña. */
    const twin = await t.appt(c);
    const results = await Promise.all(Array.from({ length: 5 }, () => t.review(c.cookie, twin)));
    assert.deepEqual(results.map((x) => x.status).sort(), [201, 409, 409, 409, 409]);
    assert.equal(await Review.countDocuments({ appointmentId: twin._id }), 1);

    /* RN-03: 60 días sí, 61 no. */
    assert.equal((await t.review(c.cookie, await t.appt(c, { ago: 59 * DAY }))).status, 201);
    const late = await t.review(c.cookie, await t.appt(c, { ago: 61 * DAY }));
    assert.equal(late.status, 409);
    assert.equal(late.json.message, 'El plazo para reseñar esta cita terminó.');
  });

  test('AC-02 formulario: eligibility dice open / reviewed / expired / not_attended; ajena 404; anónimo 401', async () => {
    const c = await t.client();
    const open = await t.appt(c);
    const get = (a, cookie = c.cookie) => t.req('GET', `/api/wstyle/reviews/eligibility?cita=${a._id}`, undefined, cookie);
    let r = await get(open);
    assert.equal(r.status, 200);
    assert.equal(r.json.state, 'open');
    assert.equal(r.json.appointment.service, 'Corte + barba');
    assert.equal(r.json.appointment.professional, 'Joe');
    await t.review(c.cookie, open, { rating: 4 });
    r = await get(open);
    assert.equal(r.json.state, 'reviewed');
    assert.equal(r.json.review.rating, 4);
    assert.equal((await get(await t.appt(c, { ago: 61 * DAY }))).json.state, 'expired');
    assert.equal((await get(await t.appt(c, { status: 'no_asistio' }))).json.state, 'not_attended');
    assert.equal((await get(await t.appt(await t.client('X Y')))).status, 404);
    assert.equal((await get(open, null)).status, 401);
  });

  test('AC-03 validación y sanitización: estrellas, largo, HTML fuera y campos extra ignorados', async () => {
    const c = await t.client('Ana Ruiz');
    for (const rating of [0, 6, 4.5, '5']) assert.equal((await t.review(c.cookie, await t.appt(c), { rating })).status, 400, String(rating));
    assert.equal((await t.review(c.cookie, await t.appt(c), { comment: 'Corto' })).status, 400);
    assert.equal((await t.review(c.cookie, await t.appt(c), { comment: 'x'.repeat(301) })).status, 400);
    const short = await t.review(c.cookie, await t.appt(c), { comment: '<script>alert("una reseña muy larga")</script>Bien' });
    assert.equal(short.status, 400);
    assert.equal(await Review.countDocuments({}), 0);
    const a = await t.appt(c);
    const r = await t.review(c.cookie, a, { comment: '<script>alert(1)</script>Muy bueno el corte', author: 'Hacker', serviceName: 'Falso', status: 'hidden', userId: String(t.admin.user._id) });
    assert.equal(r.status, 201);
    const doc = await Review.findOne({ appointmentId: a._id }).lean();
    assert.equal(doc.comment, 'Muy bueno el corte');
    assert.equal(doc.authorName, 'Ana R.');
    assert.equal(doc.serviceName, 'Corte + barba');
    assert.equal(doc.status, 'visible');
    assert.equal(String(doc.userId), String(c.user._id));
  });

  test('AC-04 resumen público: promedio 4,3 y 3 reseñas (sin la oculta), más reciente primero, sin datos personales', async () => {
    const ids = [];
    for (const [name, rating] of [['Uno Uno', 5], ['Dos Dos', 4], ['Tres Tres', 1], ['Cuatro Cuatro', 4]]) {
      const c = await t.client(name);
      const r = await t.review(c.cookie, await t.appt(c), { rating });
      ids.push(r.json.review.id);
    }
    assert.equal((await t.req('POST', `/api/admin/reviews/${ids[2]}/hide`, { reason: 'Prueba' }, t.admin.cookie)).status, 200);
    const pub = await t.req('GET', '/api/wstyle/reviews');
    assert.equal(pub.status, 200);
    assert.deepEqual(pub.json.summary, { average: 4.3, count: 3 });
    assert.deepEqual(pub.json.items.map((x) => x.id), [ids[3], ids[1], ids[0]]);
    const raw = JSON.stringify(pub.json);
    for (const leak of ['email', 'phone', 'userId', 'appointmentId', 'reason', 'hidden', '@clientes.test', 'Prueba']) assert.ok(!raw.includes(leak), leak);
    assert.deepEqual(Object.keys(pub.json.items[0]).sort(), ['author', 'comment', 'createdAt', 'id', 'rating', 'service']);
    /* Sin reseñas visibles → count 0 (la landing no muestra el capítulo). */
    await Review.updateMany({}, { status: 'hidden' });
    assert.deepEqual((await t.req('GET', '/api/wstyle/reviews')).json.summary, { average: 0, count: 0 });
  });

  test('AC-10 paginación: 8 reseñas → 6 + 2', async () => {
    for (let i = 0; i < 8; i++) {
      const c = await t.client(`Cliente ${i}`);
      await t.review(c.cookie, await t.appt(c), { rating: 5 - (i % 2) });
    }
    const p1 = (await t.req('GET', '/api/wstyle/reviews')).json;
    assert.equal(p1.items.length, 6);
    assert.equal(p1.hasMore, true);
    assert.equal(p1.summary.count, 8);
    assert.equal(p1.summary.average, 4.5);
    const p2 = (await t.req('GET', '/api/wstyle/reviews?page=2')).json;
    assert.equal(p2.items.length, 2);
    assert.equal(p2.hasMore, false);
    assert.equal(new Set([...p1.items, ...p2.items].map((x) => x.id)).size, 8);
  });

  test('AC-05 ocultar y mostrar: solo super admin, auditado; cuenta eliminada oculta sus reseñas', async () => {
    const c = await t.client('Pedro Rico');
    const id = (await t.review(c.cookie, await t.appt(c))).json.review.id;
    const barber = await makeClient({ name: 'Barbero', email: 'barbero@b.test', roles: ['barber'] });
    for (const [who, cookie, status] of [['anon', undefined, 401], ['client', c.cookie, 403], ['barber', barber.cookie, 403]]) {
      assert.equal((await t.req('POST', `/api/admin/reviews/${id}/hide`, {}, cookie)).status, status, who);
      assert.equal((await t.req('GET', '/api/admin/reviews', undefined, cookie)).status, status, who);
    }
    let r = await t.req('POST', `/api/admin/reviews/${id}/hide`, { reason: 'Lenguaje ofensivo' }, t.admin.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await t.req('GET', '/api/wstyle/reviews')).json.summary.count, 0);
    assert.equal((await t.req('POST', `/api/admin/reviews/${id}/hide`, {}, t.admin.cookie)).status, 409);
    const list = await t.req('GET', '/api/admin/reviews?status=hidden', undefined, t.admin.cookie);
    assert.equal(list.json.items[0].hidden.reason, 'Lenguaje ofensivo');
    assert.equal(list.json.items[0].customer.name, 'Pedro Rico');
    assert.deepEqual(list.json.counts, { visible: 0, hidden: 1 });
    /* Búsqueda por cliente o texto y filtro por estrellas. */
    assert.equal((await t.req('GET', '/api/admin/reviews?q=pedro', undefined, t.admin.cookie)).json.total, 1);
    assert.equal((await t.req('GET', '/api/admin/reviews?q=degradado', undefined, t.admin.cookie)).json.total, 1);
    assert.equal((await t.req('GET', '/api/admin/reviews?q=nadie', undefined, t.admin.cookie)).json.total, 0);
    assert.equal((await t.req('GET', '/api/admin/reviews?rating=3', undefined, t.admin.cookie)).json.total, 0);
    /* RN-09: el cliente la sigue viendo en Mis citas, sin aviso. */
    const mine = await t.req('GET', '/api/wstyle/appointments/mine', undefined, c.cookie);
    assert.equal(mine.json.past[0].review.rating, 5);
    r = await t.req('POST', `/api/admin/reviews/${id}/show`, {}, t.admin.cookie);
    assert.equal(r.status, 200);
    assert.equal((await t.req('GET', '/api/wstyle/reviews')).json.summary.count, 1);
    const logs = await AuditLog.find({ entity: 'review' }).sort({ at: 1 }).lean();
    assert.deepEqual(logs.map((l) => l.action), ['review.hide', 'review.show']);
    assert.equal(logs[0].entityId, id);
    assert.equal(String(logs[0].actorUserId), String(t.admin.user._id));
    assert.deepEqual(logs[0].after, { status: 'hidden', reason: 'Lenguaje ofensivo' });

    /* RN-12: el cliente elimina su cuenta → su reseña se oculta y deja de contar (y no se puede volver a mostrar). */
    assert.equal((await t.req('DELETE', '/api/auth/me', undefined, c.cookie)).status, 200);
    assert.equal((await t.req('GET', '/api/wstyle/reviews')).json.summary.count, 0);
    const doc = await Review.findById(id).lean();
    assert.equal(doc.status, 'hidden');
    assert.equal(doc.hidden.by, 'account_deleted');
    assert.equal((await t.req('POST', `/api/admin/reviews/${id}/show`, {}, t.admin.cookie)).status, 409);

    /* RN-12 con una reseña que el admin YA había ocultado: tampoco se puede volver a mostrar. */
    const d = await t.client('Dora Díaz');
    const did = (await t.review(d.cookie, await t.appt(d))).json.review.id;
    assert.equal((await t.req('POST', `/api/admin/reviews/${did}/hide`, {}, t.admin.cookie)).status, 200);
    assert.equal((await t.req('DELETE', '/api/auth/me', undefined, d.cookie)).status, 200);
    assert.equal((await Review.findById(did).lean()).hidden.by, 'account_deleted');
    assert.equal((await t.req('POST', `/api/admin/reviews/${did}/show`, {}, t.admin.cookie)).status, 409);
    assert.equal((await t.req('GET', '/api/wstyle/reviews')).json.summary.count, 0);
  });

  test('AC-06 invitación: el "Gracias por venir" trae el link; Mis citas dice si se puede reseñar o sus estrellas', async () => {
    t.ctx.clock.now = Date.parse('2026-11-01T12:00:00Z');
    const c = await t.client('Pedro Rico');
    const pro = t.seeded.pros[0];
    const booked = await t.req('POST', '/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(pro._id), startsAt: at('12:00'), mode: 'shop', acceptPolicies: true, paymentMethod: 'local' }, c.cookie);
    assert.equal(booked.status, 201, JSON.stringify(booked.json));
    const id = booked.json.id;
    assert.equal((await t.req('POST', `/api/admin/appointments/${id}/confirm`, {}, t.admin.cookie)).status, 200);
    t.ctx.clock.now = Date.parse(at('12:00'));
    assert.equal((await t.req('POST', `/api/admin/appointments/${id}/start`, {}, t.admin.cookie)).status, 200);
    assert.equal((await t.req('POST', `/api/admin/appointments/${id}/finish`, {}, t.admin.cookie)).status, 200);
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'client_finished');
    assert.ok(mail, 'correo client_finished');
    const link = `http://localhost:5173/wstyle/cuenta/resena/?cita=${id}`;
    assert.ok(mail.text.includes(`Deja tu reseña: ${link}`), mail.text);
    assert.ok(mail.html.includes(`href="${link.replace(/&/g, '&amp;')}"`));

    let mine = await t.req('GET', '/api/wstyle/appointments/mine', undefined, c.cookie);
    assert.equal(mine.json.past[0].canReview, true);
    assert.equal(mine.json.past[0].review, null);
    assert.equal((await t.req('POST', '/api/wstyle/reviews', { appointmentId: id, rating: 4, comment: GOOD }, c.cookie)).status, 201);
    mine = await t.req('GET', '/api/wstyle/appointments/mine', undefined, c.cookie);
    assert.equal(mine.json.past[0].canReview, false);
    assert.deepEqual(mine.json.past[0].review, { rating: 4 });

    /* Cita sin cuenta (agendada por teléfono): el correo no invita a reseñar. */
    t.ctx.mailer.outbox.length = 0;
    const phone = await t.req('POST', '/api/admin/appointments', { name: 'Diana', phone: '9 7777 1111', email: 'diana@clientes.test', serviceId: 'corte', professionalId: String(pro._id), startsAt: at('16:00') }, t.admin.cookie);
    assert.equal(phone.status, 201, JSON.stringify(phone.json));
    t.ctx.clock.now = Date.parse(at('16:00'));
    await t.req('POST', `/api/admin/appointments/${phone.json.id}/start`, {}, t.admin.cookie);
    await t.req('POST', `/api/admin/appointments/${phone.json.id}/finish`, {}, t.admin.cookie);
    const m2 = t.ctx.mailer.outbox.find((m) => m.template === 'client_finished');
    if (m2) assert.ok(!m2.text.includes('/wstyle/cuenta/resena/'));
  });

  test('AC-07 aviso al super admin: correo (Notification) con estrellas y link al panel; bandeja y tarjeta de 7 días', async () => {
    const c = await t.client('Pedro Rico');
    const a = await t.appt(c);
    await t.review(c.cookie, a, { rating: 4 });
    const n = await Notification.findOne({ template: 'admin_review_new' }).lean();
    assert.ok(n, 'Notification del correo al admin');
    assert.equal(n.to, ADMIN_EMAIL);
    assert.equal(n.status, 'dry-run');
    assert.equal(String(n.appointmentId), String(a._id));
    const mail = t.ctx.mailer.outbox.find((m) => m.template === 'admin_review_new');
    assert.match(mail.subject, /Nueva reseña: ★★★★☆/);
    assert.ok(mail.text.includes(GOOD));
    assert.ok(mail.text.includes('/wstyle/admin/resenas/'));
    assert.equal(await PanelNotification.countDocuments({ kind: 'review_new', userId: t.admin.user._id }), 1);
    const ov = await t.req('GET', '/api/admin/overview', undefined, t.admin.cookie);
    assert.equal(ov.json.cards.reviewsLast7d, 1);
    t.ctx.clock.now += 8 * DAY;
    assert.equal((await t.req('GET', '/api/admin/overview', undefined, t.admin.cookie)).json.cards.reviewsLast7d, 0);
  });
});
