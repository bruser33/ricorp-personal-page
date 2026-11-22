/* SPEC-51 AC-01…AC-05: categorías de la carta, migración idempotente, catálogo, panel y agenda con servicios
   largos. Contra la BD de test REAL (helpers.js). */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Appointment, AuditLog, Business, PlatformSettings, Professional, ProfessionalService, Service, ServiceCategory } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { CARTA_MIGRATION, ensureCartaMigration, importCatalog, normalizeCatalogJson, readContent } from '../src/seed.js';
import { api, connectDb, disconnectDb, makeClient, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const ADMIN_EMAIL = 'dueno@wstyle.test';
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();

const CONTENT = readContent();
/* Tabla aprobada de la spec (precio CLP, duración, categoría). */
const NEW_SERVICES = {
  'decoloracion-global': ['Global', 50000, 150, 'decoloracion'],
  'decoloracion-bloque': ['Bloque de color', 25000, 90, 'decoloracion'],
  'decoloracion-superior': ['Superior', 40000, 120, 'decoloracion'],
  'decoloracion-mechas-puntas': ['Mechas y puntas', 45000, 150, 'decoloracion'],
  'decoloracion-platinado': ['Rubio platinado, beige y ceniza', 50000, 180, 'decoloracion'],
  'decoloracion-matizacion': ['Matización y tonos fantasía', 30000, 60, 'decoloracion'],
  'decoloracion-diseno': ['Diseños de color personalizados', 70000, 180, 'decoloracion'],
  'ondulacion-permanente': ['Ondulación permanente', 45000, 120, 'ondulacion'],
  'tratamientos-capilares': ['Tratamientos capilares', 15000, 45, 'tratamientos'],
};
const BARBERIA = { corte: [10000, 40], 'corte-barba': [12000, 60], barba: [8000, 25], 'lavado-masaje': [7000, 20], 'limpieza-facial': [15000, 35] };
const NOTE = 'Cada servicio incluye una evaluación previa del cabello.';

/* La carta "antes de SPEC-51": los 5 de barbería, sin categorías (formato array). */
const OLD_CARTA = CONTENT.services.filter((s) => s.category === 'barberia').map(({ category, ...s }) => s);
const counts = async () => [await ServiceCategory.countDocuments({}), await Service.countDocuments({}), await ProfessionalService.countDocuments({})];

describe('SPEC-51 AC-01 / AC-02 migración de la carta', () => {
  before(connectDb);
  after(disconnectDb);
  beforeEach(resetDb);

  test('services.json trae 4 categorías y 14 servicios con los importes de la tabla (AC-06 lado server)', () => {
    assert.deepEqual(CONTENT.categories.map((c) => c.name), ['Barbería', 'Decoloración capilar', 'Ondulación permanente', 'Tratamientos capilares']);
    assert.equal(CONTENT.categories.find((c) => c.id === 'decoloracion').note, NOTE);
    assert.equal(CONTENT.services.length, 14);
    for (const [id, [name, price, mins, cat]] of Object.entries(NEW_SERVICES)) {
      const s = CONTENT.services.find((x) => x.id === id);
      assert.deepEqual([s.name, s.priceCLP, s.durationMin, s.category, s.homeServiceAllowed], [name, price, mins, cat, false], id);
    }
    /* El formato antiguo (array) sigue aceptándose. */
    assert.deepEqual(normalizeCatalogJson(OLD_CARTA), { categories: [], services: OLD_CARTA });
  });

  test('sobre la carta actual deja 4 categorías y 14 servicios; los de barbería sin cambios; segunda corrida idéntica', async () => {
    /* BD de producción hoy: carta de 5 servicios sin categoría + un barbero aprobado con sus servicios. */
    const { business, pros } = await seed({ services: OLD_CARTA, pros: [PRO_A, { ...PRO_B, membershipStatus: 'pending' }] });
    await Service.updateMany({}, { $unset: { categoryId: 1 } });
    await ServiceCategory.deleteMany({});
    const before = await Service.find({}).lean();

    const first = await importCatalog(CONTENT);
    assert.equal(first.created, 9);
    const cats = await ServiceCategory.find({ businessId: business._id }).sort({ order: 1 }).lean();
    assert.deepEqual(cats.map((c) => [c.name, c.note]), [['Barbería', ''], ['Decoloración capilar', NOTE], ['Ondulación permanente', ''], ['Tratamientos capilares', '']]);
    const catSlug = new Map(cats.map((c) => [String(c._id), c.slug]));
    const all = await Service.find({}).lean();
    assert.equal(all.length, 14);
    for (const [id, [name, price, mins, cat]] of Object.entries(NEW_SERVICES)) {
      const s = all.find((x) => x.slug === id);
      assert.deepEqual([s.name, s.priceCLP, s.durationMin, catSlug.get(String(s.categoryId)), s.homeServiceAllowed, s.active], [name, price, mins, cat, false, true], id);
    }
    for (const old of before) {
      const s = all.find((x) => x.slug === old.slug);
      assert.equal(catSlug.get(String(s.categoryId)), 'barberia');
      assert.deepEqual([s.name, s.description, s.priceCLP, s.durationMin, s.homeServiceAllowed], [old.name, old.description, old.priceCLP, old.durationMin, old.homeServiceAllowed]);
      assert.deepEqual([s.priceCLP, s.durationMin], BARBERIA[s.slug]);
    }
    /* Asunción 3: los nuevos quedan enlazados al barbero aprobado (no al pendiente). */
    const [proA, proB] = pros;
    assert.equal(await ProfessionalService.countDocuments({ professionalId: proA._id }), 14);
    assert.equal(await ProfessionalService.countDocuments({ professionalId: proB._id }), 5);

    const c1 = await counts();
    assert.deepEqual(c1, [4, 14, 19]);
    const second = await importCatalog(CONTENT);
    assert.equal(second.created, 0);
    assert.deepEqual(await counts(), c1);
  });

  test('CB-01 / CB-02 no pisa un precio editado ni reactiva un archivado; no re-enlaza un servicio desmarcado', async () => {
    const { business, pros } = await seed({ services: OLD_CARTA, pros: [PRO_A] });
    await importCatalog(CONTENT);
    await Service.updateOne({ slug: 'decoloracion-global' }, { priceCLP: 55000 });
    await Service.updateOne({ slug: 'decoloracion-bloque' }, { active: false, archivedAt: new Date(SUNDAY_9AM) });
    const permanente = await Service.findOne({ slug: 'ondulacion-permanente' });
    await ProfessionalService.deleteOne({ professionalId: pros[0]._id, serviceId: permanente._id });
    await ServiceCategory.updateOne({ businessId: business._id, slug: 'decoloracion' }, { name: 'Coloración', note: 'Otra nota' });
    const c1 = await counts();

    await importCatalog(CONTENT);
    assert.deepEqual(await counts(), c1);
    assert.equal((await Service.findOne({ slug: 'decoloracion-global' })).priceCLP, 55000);
    const bloque = await Service.findOne({ slug: 'decoloracion-bloque' });
    assert.equal(bloque.active, false);
    assert.ok(bloque.archivedAt);
    assert.equal(await ProfessionalService.countDocuments({ serviceId: permanente._id }), 0);
    const deco = await ServiceCategory.findOne({ slug: 'decoloracion' });
    assert.deepEqual([deco.name, deco.note], ['Coloración', 'Otra nota']);
  });
});

describe('SPEC-51 migración al arrancar el server (producción no corre seed:catalog)', () => {
  before(connectDb);
  after(disconnectDb);
  beforeEach(resetDb);

  test('se aplica una sola vez sobre la carta actual, sin tocar el negocio; después no revive lo que Joe borre', async () => {
    assert.deepEqual(await ensureCartaMigration(), { applied: false, reason: 'no_business' });
    const { business } = await seed({ services: OLD_CARTA, pros: [PRO_A] });
    await Service.updateMany({}, { $unset: { categoryId: 1 } });
    await ServiceCategory.deleteMany({});
    await Business.updateOne({ _id: business._id }, { name: 'WS Style editado', 'contact.whatsapp': '+56 9 9999 9999' });

    const r = await ensureCartaMigration();
    assert.deepEqual(r, { applied: true, created: 9, services: 14, categories: 4 });
    /* 1 barbero aprobado: sus 5 de antes + los 9 nuevos. */
    assert.deepEqual(await counts(), [4, 14, 14]);
    const b = await Business.findById(business._id).lean();
    assert.deepEqual([b.name, b.contact.whatsapp], ['WS Style editado', '+56 9 9999 9999']);
    assert.ok(await PlatformSettings.exists({ appliedDefaults: CARTA_MIGRATION }));

    /* Joe borra un servicio nuevo sin citas: el siguiente arranque no lo recrea. */
    await Service.deleteOne({ slug: 'decoloracion-diseno' });
    assert.deepEqual(await ensureCartaMigration(), { applied: false, reason: 'done' });
    assert.equal(await Service.countDocuments({}), 13);
  });
});

/* Panel del super admin con la carta real migrada. */
function panel() {
  const t = {};
  t.boot = async () => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    t.seeded = await seed({ services: CONTENT.services, categories: CONTENT.categories, pros: [{ ...PRO_A, rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '10:00', end: '20:00' })) }] });
    t.ctx = await start({ now: SUNDAY_9AM, env: { SUPERADMIN_EMAIL: ADMIN_EMAIL } });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => t.ctx && stop(t.ctx.server);
  const call = (m) => (path, body, cookie = t.admin.cookie) => api(t.ctx.base, m, path, { body, cookie });
  t.get = (path, cookie = t.admin.cookie) => api(t.ctx.base, 'GET', path, { cookie });
  t.post = call('POST');
  t.patch = call('PATCH');
  t.put = call('PUT');
  t.del = (path) => api(t.ctx.base, 'DELETE', path, { cookie: t.admin.cookie });
  return t;
}

describe('SPEC-51 AC-03 / AC-04 catálogo y panel', () => {
  const t = panel();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  const catalog = async () => (await api(t.ctx.base, 'GET', '/api/wstyle/catalog')).json;
  const svc = async (slug) => (await t.get('/api/admin/services')).json.items.find((s) => s.id === slug);
  const cat = async (slug) => (await t.get('/api/admin/service-categories')).json.items.find((c) => c.id === slug);

  test('AC-03 GET /api/wstyle/catalog: categorías ordenadas con nota, cada servicio con su categoría, sin vacías', async () => {
    const c = await catalog();
    assert.deepEqual(c.categories, CONTENT.categories);
    assert.deepEqual(c.services.map((s) => [s.id, s.category, s.priceCLP, s.durationMin]), CONTENT.services.map((s) => [s.id, s.category, s.priceCLP, s.durationMin]));
    /* CB-07: categoría sin servicios activos → no se lista. */
    await t.post('/api/admin/service-categories', { name: 'Uñas' });
    await Service.updateOne({ slug: 'tratamientos-capilares' }, { active: false });
    const after = await catalog();
    assert.deepEqual(after.categories.map((x) => x.id), ['barberia', 'decoloracion', 'ondulacion']);
    /* RN-01: servicio sin categoría (dato viejo) → "barberia". */
    await Service.updateOne({ slug: 'decoloracion-global' }, { $unset: { categoryId: 1 } });
    assert.equal((await catalog()).services.find((s) => s.id === 'decoloracion-global').category, 'barberia');
  });

  test('AC-04 crear/editar servicio con categoría válida → 2xx; inexistente → 400 (CB-08); por defecto Barbería', async () => {
    const deco = await cat('decoloracion');
    let r = await t.post('/api/admin/services', { name: 'Mechas babylights', priceCLP: 60000, durationMin: 180, categoryId: deco._id });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.service.categoryId, deco._id);
    r = await t.post('/api/admin/services', { name: 'Corte niño', priceCLP: 9000, durationMin: 30 });
    assert.equal(r.status, 201);
    assert.equal(r.json.service.categoryId, (await cat('barberia'))._id);
    r = await t.post('/api/admin/services', { name: 'Fantasma', priceCLP: 9000, durationMin: 30, categoryId: '000000000000000000000000' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_category');
    assert.ok(r.json.message);

    const global = await svc('decoloracion-global');
    r = await t.patch(`/api/admin/services/${global._id}`, { categoryId: 'no-existe', updatedAt: global.updatedAt });
    assert.equal(r.status, 400);
    const trat = await cat('tratamientos');
    r = await t.patch(`/api/admin/services/${global._id}`, { categoryId: trat._id, updatedAt: global.updatedAt });
    assert.equal(r.status, 200);
    assert.equal(r.json.service.categoryId, trat._id);
    const log = await AuditLog.findOne({ action: 'service.category' });
    assert.deepEqual([log.before.categoryId, log.after.categoryId], [(await cat('decoloracion'))._id, trat._id]);
  });

  test('Flujo 4: Joe cambia la duración de "Global" a 165 min → el catálogo la muestra y la categoría sigue igual', async () => {
    const global = await svc('decoloracion-global');
    const r = await t.patch(`/api/admin/services/${global._id}`, { durationMin: 165, updatedAt: global.updatedAt });
    assert.equal(r.status, 200);
    const s = (await catalog()).services.find((x) => x.id === 'decoloracion-global');
    assert.deepEqual([s.durationMin, s.category, s.priceCLP], [165, 'decoloracion', 50000]);
  });

  test('AC-04 categorías: crear, renombrar, nota, reordenar, borrar (409 con servicios), todo auditado', async () => {
    let r = await t.post('/api/admin/service-categories', { name: 'Uñas', note: 'Solo con hora' });
    assert.equal(r.status, 201);
    const unas = r.json.category;
    assert.deepEqual([unas.id, unas.name, unas.note, unas.services], ['unas', 'Uñas', 'Solo con hora', 0]);
    assert.equal((await t.post('/api/admin/service-categories', { name: 'x' })).status, 400);

    const deco = await cat('decoloracion');
    r = await t.patch(`/api/admin/service-categories/${deco._id}`, { name: 'Coloración', note: 'Incluye evaluación.' });
    assert.equal(r.status, 200);
    let c = await catalog();
    assert.deepEqual(c.categories[1], { id: 'decoloracion', name: 'Coloración', note: 'Incluye evaluación.' });

    const items = (await t.get('/api/admin/service-categories')).json.items;
    const ids = items.map((x) => x._id);
    const newOrder = [ids[3], ids[0], ids[1], ids[2], ids[4]];
    assert.equal((await t.put('/api/admin/service-categories/order', { ids: ids.slice(1) })).status, 400);
    r = await t.put('/api/admin/service-categories/order', { ids: newOrder });
    assert.equal(r.status, 200);
    c = await catalog();
    assert.deepEqual(c.categories.map((x) => x.id), ['tratamientos', 'barberia', 'decoloracion', 'ondulacion']);

    /* CB-06 */
    const ond = await cat('ondulacion');
    r = await t.del(`/api/admin/service-categories/${ond._id}`);
    assert.equal(r.status, 409);
    assert.equal(r.json.message, 'Mueve o archiva sus servicios antes de borrar la categoría');
    assert.equal((await t.del(`/api/admin/service-categories/${(await cat('barberia'))._id}`)).status, 409);
    r = await t.del(`/api/admin/service-categories/${unas._id}`);
    assert.equal(r.status, 200);
    assert.equal(await ServiceCategory.countDocuments({}), 4);

    const actions = (await AuditLog.find({ action: /^service\.category\./ }).lean()).map((x) => x.action).sort();
    assert.deepEqual(actions, ['service.category.create', 'service.category.delete', 'service.category.reorder', 'service.category.update']);
  });

  test('AC-04 "Exportar a JSON" incluye las categorías y la categoría de cada servicio (formato de services.json)', async () => {
    const r = await t.get('/api/admin/export');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.categories, CONTENT.categories);
    const strip = ({ placeholder, ...s }) => s;
    assert.deepEqual(r.json.services, CONTENT.services.map(strip));
  });

  test('panel del barbero: sus servicios con categoría y las categorías en orden (asunción 7)', async () => {
    const c = await makeClient({ name: 'Barbero A', email: 'sesion.a@barberos.test', roles: ['barber'] });
    await Professional.updateOne({ _id: t.seeded.pros[0]._id }, { userId: c.user._id });
    const me = await t.get('/api/pro/me', c.cookie);
    assert.equal(me.status, 200);
    assert.deepEqual(me.json.categories.map((x) => x.id), ['barberia', 'decoloracion', 'ondulacion', 'tratamientos']);
    assert.deepEqual(me.json.services.map((s) => [s.id, s.category, s.selected]), CONTENT.services.map((s) => [s.id, s.category, true]));
  });
});

describe('SPEC-51 AC-05 agenda con servicios largos (180 min)', () => {
  const t = panel();
  before(connectDb);
  after(disconnectDb);
  beforeEach(() => t.boot());
  after(() => t.stop());

  const pro = () => t.seeded.pros[0];
  const slots = async (service) => {
    const r = await api(t.ctx.base, 'GET', `/api/wstyle/availability?${new URLSearchParams({ service, professional: String(pro()._id), from: MONDAY, to: MONDAY })}`);
    assert.equal(r.status, 200);
    return (r.json.days.find((d) => d.date === MONDAY)?.slots ?? []).map((s) => s.label);
  };
  const book = async (service, time) => {
    const c = await makeClient({ email: `c${Math.random().toString(36).slice(2, 8)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
    return api(t.ctx.base, 'POST', '/api/wstyle/appointments', { body: { serviceId: service, professionalId: String(pro()._id), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: 'local' }, cookie: c.cookie });
  };
  const grid = (from, to) => {
    const out = [];
    for (let m = from; m <= to; m += 15) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    return out;
  };

  test('CB-04 / CB-05 con una cita 13:00–14:00 no se ofrece ningún inicio que se superponga; el último es 17:00', async () => {
    assert.equal((await book('corte-barba', '13:00')).status, 201);
    const l = await slots('decoloracion-platinado');
    assert.deepEqual(l, ['10:00', ...grid(14 * 60, 17 * 60)]);
    assert.equal(l.at(-1), '17:00');
  });

  test('crear una de 180 min que se superpone → 409; una que termina justo cuando empieza otra → 201', async () => {
    assert.equal((await book('corte-barba', '13:00')).status, 201);
    const clash = await book('decoloracion-platinado', '11:00');
    assert.equal(clash.status, 409, JSON.stringify(clash.json));
    const ok = await book('decoloracion-platinado', '10:00');
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    /* Precio de la tabla en la cita (la carta pública y la reserva cobran lo mismo). */
    const appt = await Appointment.findById(ok.json.id).lean();
    assert.deepEqual([appt.serviceSnapshot.priceCLP, appt.serviceSnapshot.durationMin, appt.pricing.priceCLP], [50000, 180, 50000]);
    assert.equal(appt.endsAt.getTime() - appt.startsAt.getTime(), 180 * 60 * 1000);
    /* Inicio que terminaría después del cierre del barbero (17:15 + 180 = 20:15) → rechazado. */
    assert.notEqual((await book('decoloracion-platinado', '17:15')).status, 201);
    assert.equal((await book('decoloracion-platinado', '17:00')).status, 201);
  });

  test('la duración editada (165 min) es la que bloquea la agenda', async () => {
    await Service.updateOne({ slug: 'decoloracion-global' }, { durationMin: 165 });
    const l = await slots('decoloracion-global');
    assert.equal(l.at(-1), '17:15');
  });
});
