/* SPEC-59 AC-01…AC-06: catálogo de estilos y foto de referencia del cliente, contra la BD de
   test REAL (replica set de un nodo) con reloj inyectado. Las imágenes se generan con sharp. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { Appointment, AuditLog, AuthToken, ClientPhoto, Style, User } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { newToken, sha256 } from '../src/lib/session.js';
import { serviceCategory } from '../src/domain/styles.js';
import { api, connectDb, disconnectDb, HOUR, makeClient, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const DAY = 24 * HOUR;
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();

async function sessionFor(userId) {
  const token = newToken();
  await AuthToken.create({ type: 'session', userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 365 * DAY) });
  return `ws_session=${token}`;
}

const gridFiles = () => mongoose.connection.db.collection('photos.files');
const fileExists = async (id) => Boolean(await gridFiles().findOne({ _id: new mongoose.Types.ObjectId(String(id)) }));

/* JPG 4000×3000 con EXIF de rotación (6 = girar 90°) y coordenadas GPS. */
async function exifJpeg() {
  return sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#a07040' } })
    .jpeg({ quality: 70 })
    .withExif({ IFD0: { Make: 'Telefono' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 26/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '70/1 39/1 0/1' } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}
const smallPng = (color = '#203040') => sharp({ create: { width: 600, height: 400, channels: 3, background: color } }).png().toBuffer();

describe('SPEC-59 fotos de estilos', () => {
  let ctx, seeded, proA, proB, cookieA, cookieB, admin, adminCookie, client, other;
  before(connectDb);
  after(disconnectDb);
  after(async () => ctx && stop(ctx.server));
  beforeEach(async () => {
    if (ctx) await stop(ctx.server);
    await resetDb();
    await gridFiles().deleteMany({});
    await mongoose.connection.db.collection('photos.chunks').deleteMany({});
    seeded = await seed({ pros: [PRO_A, PRO_B] });
    [proA, proB] = seeded.pros;
    ctx = await start({ now: SUNDAY_9AM });
    cookieA = await sessionFor(proA.userId);
    cookieB = await sessionFor(proB.userId);
    admin = await User.create({ email: 'dueno@wstyle.test', name: 'Joe', roles: ['superadmin'], emailVerified: true });
    adminCookie = await sessionFor(admin._id);
    client = await makeClient({ name: 'Pedro', phone: '+56987654321' });
    other = await makeClient({ name: 'Otro', phone: '+56987650000' });
  });

  const req = (method, path, body, cookie) => api(ctx.base, method, path, { body, cookie });
  async function multipart(path, cookie, files, fields = {}, field = 'photos') {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const [name, buf, type] of files) fd.append(field, new Blob([buf], { type }), name);
    const res = await fetch(ctx.base + path, { method: 'POST', body: fd, headers: cookie ? { Cookie: cookie } : {} });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* sin JSON */
    }
    return { status: res.status, json };
  }
  const uploadStyles = (cookie, files, fields, base = '/api/admin/styles') => multipart(base, cookie, files, fields);
  const uploadClient = (cookie, buf, type = 'image/jpeg', name = 'mia.jpg') => multipart('/api/wstyle/reference-photo', cookie, [[name, buf, type]], {}, 'photo');
  const book = async (who, extra = {}, time = '12:00', proId = proA._id) => {
    const r = await req('POST', '/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(proId), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: 'local', ...extra }, who.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };

  test('AC-01 subida y compresión: WebP ≤ 1200 (estilo) / ≤ 1000 (cliente), sin recorte, derecho y sin EXIF; Mongo guarda solo el id', async () => {
    const jpg = await exifJpeg();
    const before = await sharp(jpg).metadata();
    assert.equal(before.orientation, 6);
    assert.ok(before.exif.toString('latin1').includes('Telefono'));

    const r = await uploadStyles(adminCookie, [['fade.jpg', jpg, 'image/jpeg']], { category: 'barberia', name: 'Low fade texturizado' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const style = await Style.findOne().lean();
    assert.match(style.photoId, /^[a-f0-9]{24}$/);
    assert.equal(Object.keys(style).some((k) => Buffer.isBuffer(style[k])), false);
    const img = await fetch(ctx.base + `/api/wstyle/photos/${style.photoId}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    assert.equal(meta.format, 'webp');
    /* 4000×3000 girada 90° → vertical 3000×4000 → 900×1200 (proporción intacta, sin recorte cuadrado). */
    assert.deepEqual([meta.width, meta.height], [900, 1200]);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);

    const c = await uploadClient(client.cookie, jpg);
    assert.equal(c.status, 201, JSON.stringify(c.json));
    const cimg = await fetch(ctx.base + c.json.url, { headers: { Cookie: client.cookie } });
    assert.equal(cimg.status, 200);
    assert.equal(cimg.headers.get('cache-control'), 'private, no-store');
    const cmeta = await sharp(Buffer.from(await cimg.arrayBuffer())).metadata();
    assert.deepEqual([cmeta.width, cmeta.height], [750, 1000]);
    assert.equal(cmeta.exif, undefined);
    const doc = await ClientPhoto.findOne().lean();
    assert.equal(doc.fileId, c.json.id);
    assert.equal(doc.appointmentId, null);
  });

  test('AC-02 validación: PDF disfrazado → 400, 5 MB + 1 byte → 413, imagen corrupta → 400', async () => {
    const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(2000));
    let r = await uploadClient(client.cookie, pdf, 'image/jpeg', 'foto.jpg');
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_image');
    assert.equal(r.json.message, 'Esa imagen no se pudo leer. Prueba con un JPG o PNG');

    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    r = await uploadClient(client.cookie, big);
    assert.equal(r.status, 413);
    assert.equal(r.json.message, 'La foto pesa más de 5 MB');

    const good = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const corrupt = Buffer.concat([good.subarray(0, 200), Buffer.alloc(300, 7)]);
    r = await uploadClient(client.cookie, corrupt);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_image');

    r = await uploadStyles(adminCookie, [['x.jpg', pdf, 'image/jpeg']], { category: 'barberia' });
    assert.equal(r.status, 400);
    assert.equal(await Style.countDocuments(), 0);
    assert.equal(await ClientPhoto.countDocuments(), 0);
    assert.equal(await gridFiles().countDocuments(), 0);

    /* Sin sesión no se recibe nada. */
    r = await uploadClient(null, good);
    assert.equal(r.status, 401);
  });

  test('AC-03 catálogo público: solo activos, filtrados por servicio y categoría (RN-06) y ordenados', async () => {
    const png = await smallPng();
    let r = await uploadStyles(adminCookie, [['1.png', png, 'image/png'], ['2.png', png, 'image/png'], ['3.png', png, 'image/png']], { category: 'barberia', name: 'Degradado' });
    assert.equal(r.status, 201);
    assert.equal(r.json.items.length, 3);
    r = await uploadStyles(adminCookie, [['p.png', png, 'image/png']], { category: 'decoloracion', name: 'Platinado' });
    r = await uploadStyles(adminCookie, [['b.png', png, 'image/png']], { category: 'barberia', name: 'Solo barba', serviceIds: JSON.stringify(['corte-barba']) });
    const all = (await req('GET', '/api/admin/styles', undefined, adminCookie)).json.items;
    const deg = all.filter((s) => s.name === 'Degradado');
    /* Orden: `order` y luego el más nuevo primero. */
    await req('PATCH', `/api/admin/styles/${deg[2].id}`, { name: 'Low fade texturizado' }, adminCookie);
    await req('POST', '/api/admin/styles/reorder', { ids: [deg[2].id, deg[0].id, deg[1].id] }, adminCookie);
    await req('PATCH', `/api/admin/styles/${deg[1].id}`, { active: false }, adminCookie);

    const corte = (await req('GET', '/api/wstyle/styles?service=corte')).json;
    assert.equal(corte.category, 'barberia');
    assert.deepEqual(corte.items.map((s) => s.id), [deg[2].id, deg[0].id]);
    assert.equal(corte.items[0].name, 'Low fade texturizado');
    assert.match(corte.items[0].photoUrl, /^\/api\/wstyle\/photos\/[a-f0-9]{24}$/);

    const barba = (await req('GET', '/api/wstyle/styles?service=corte-barba')).json.items.map((s) => s.name);
    assert.ok(barba.includes('Solo barba'));
    assert.ok(barba.includes('Low fade texturizado'));
    assert.ok(!(await req('GET', '/api/wstyle/styles?service=corte')).json.items.some((s) => s.name === 'Solo barba'));
    assert.ok(!barba.includes('Platinado'));

    /* Sin servicio: todos los activos (el oculto nunca). */
    const every = (await req('GET', '/api/wstyle/styles')).json.items;
    assert.equal(every.length, 4);
    assert.ok(!every.some((s) => s.id === deg[1].id));
    /* La foto del oculto: 404 público; el panel (super admin) sí la ve. */
    const hidden = await Style.findById(deg[1].id).lean();
    assert.equal((await fetch(ctx.base + `/api/wstyle/photos/${hidden.photoId}`)).status, 404);
    assert.equal((await fetch(ctx.base + `/api/wstyle/photos/${hidden.photoId}`, { headers: { Cookie: adminCookie } })).status, 200);

    /* Categoría deducida del servicio (SPEC-51). */
    assert.equal(serviceCategory({ slug: 'decoloracion-global' }), 'decoloracion');
    assert.equal(serviceCategory({ slug: 'corte', category: 'tratamientos' }), 'tratamientos');
    assert.equal(serviceCategory({ slug: 'corte' }), 'barberia');
  });

  test('AC-04 permisos: barbero A no toca estilos de B; foto del cliente solo dueño, su barbero y super admin', async () => {
    const png = await smallPng();
    const a = await uploadStyles(cookieA, [['a.png', png, 'image/png']], { category: 'barberia', name: 'De A' }, '/api/pro/styles');
    assert.equal(a.status, 201, JSON.stringify(a.json));
    const b = await uploadStyles(cookieB, [['b.png', png, 'image/png']], { category: 'barberia', name: 'De B' }, '/api/pro/styles');
    assert.equal(b.status, 201);
    const mineA = (await req('GET', '/api/pro/styles', undefined, cookieA)).json.items;
    assert.deepEqual(mineA.map((s) => s.name), ['De A']);
    const idB = b.json.items[0].id;
    assert.equal((await req('PATCH', `/api/pro/styles/${idB}`, { name: 'Hackeado' }, cookieA)).status, 403);
    assert.equal((await req('DELETE', `/api/pro/styles/${idB}`, undefined, cookieA)).status, 403);
    assert.equal((await Style.findById(idB)).name, 'De B');
    assert.equal((await req('PATCH', `/api/pro/styles/${mineA[0].id}`, { active: false }, cookieA)).status, 200);
    /* El super admin, todos. */
    assert.equal((await req('PATCH', `/api/admin/styles/${idB}`, { category: 'tratamientos' }, adminCookie)).status, 200);
    /* Matriz SPEC-34: anónimo 401, cliente 403. */
    assert.equal((await req('GET', '/api/admin/styles')).status, 401);
    assert.equal((await req('GET', '/api/admin/styles', undefined, client.cookie)).status, 403);
    assert.equal((await req('GET', '/api/pro/styles', undefined, client.cookie)).status, 403);
    assert.equal((await uploadStyles(client.cookie, [['c.png', png, 'image/png']], { category: 'barberia' }, '/api/pro/styles')).status, 403);
    assert.equal((await req('DELETE', `/api/admin/styles/${idB}`, undefined, cookieA)).status, 403);

    const photo = (await uploadClient(client.cookie, png, 'image/png', 'mia.png')).json;
    const appt = await book(client, { clientPhotoId: photo.id });
    const url = ctx.base + appt.appointment.reference.clientPhoto.url;
    const status = async (cookie) => (await fetch(url, { headers: cookie ? { Cookie: cookie } : {} })).status;
    assert.equal(await status(client.cookie), 200);
    assert.equal(await status(cookieA), 200);
    assert.equal(await status(adminCookie), 200);
    assert.equal(await status(other.cookie), 404);
    assert.equal(await status(cookieB), 404);
    assert.equal(await status(null), 401);
    /* CB-05: por la ruta pública tampoco sale. */
    assert.equal((await fetch(ctx.base + `/api/wstyle/photos/${photo.id}`)).status, 404);
    /* Moderación: solo super admin. */
    assert.equal((await req('POST', `/api/admin/appointments/${appt.id}/remove-photo`, {}, cookieA)).status, 403);
    assert.equal((await req('POST', `/api/admin/appointments/${appt.id}/remove-photo`, {}, client.cookie)).status, 403);
    /* El barbero ve la referencia en su ficha. */
    const proView = (await req('GET', `/api/pro/appointments/${appt.id}`, undefined, cookieA)).json;
    assert.equal(proView.reference.clientPhoto.id, photo.id);
  });

  test('AC-05 reserva con referencia: guarda estilo (nombre congelado) y foto; sin foto igual que hoy; provisional borrada a las 24 h', async () => {
    const png = await smallPng();
    await uploadStyles(adminCookie, [['f.png', png, 'image/png']], { category: 'barberia', name: 'Low fade texturizado' });
    const style = await Style.findOne().lean();
    const photo = (await uploadClient(client.cookie, png, 'image/png', 'mia.png')).json;
    /* CB-08: se oculta entre elegirlo y confirmar → la cita se crea igual. */
    await req('PATCH', `/api/admin/styles/${style._id}`, { active: false }, adminCookie);
    const appt = await book(client, { styleId: String(style._id), clientPhotoId: photo.id, note: 'Bien corto atrás' });
    const doc = await Appointment.findById(appt.id).lean();
    assert.equal(doc.reference.styleName, 'Low fade texturizado');
    assert.equal(String(doc.reference.styleId), String(style._id));
    assert.equal(doc.reference.clientPhotoId, photo.id);
    assert.equal(doc.note, 'Bien corto atrás');
    assert.equal(String((await ClientPhoto.findOne({ fileId: photo.id })).appointmentId), appt.id);
    /* RN-05: estilo oculto → nombre y "Foto ya no disponible" (photoUrl null). */
    assert.deepEqual(appt.appointment.reference.style, { id: String(style._id), name: 'Low fade texturizado', photoUrl: null });

    /* Una provisional no se reutiliza en otra cita ni la usa otro cliente. */
    let r = await req('POST', '/api/wstyle/appointments', { serviceId: 'corte', professionalId: String(proA._id), startsAt: at('13:00'), mode: 'shop', acceptPolicies: true, clientPhotoId: photo.id }, client.cookie);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_photo');

    /* Sin foto → igual que hoy. */
    const plain = await book(other, {}, '14:00');
    assert.equal(plain.appointment.reference, null);
    assert.equal((await Appointment.findById(plain.id).lean()).reference, undefined);

    /* CB-04: provisional abandonada → se borra a las 24 h (reloj simulado). */
    const lost = (await uploadClient(other.cookie, png, 'image/png', 'otra.png')).json;
    ctx.clock.now += 23 * HOUR;
    await ctx.app.locals.styles.runCleanup();
    assert.ok(await fileExists(lost.id));
    ctx.clock.now += 2 * HOUR;
    const out = await ctx.app.locals.styles.runCleanup();
    assert.equal(out.provisional, 1);
    assert.equal(await fileExists(lost.id), false);
    assert.equal(await ClientPhoto.countDocuments({ fileId: lost.id }), 0);
    /* La asociada a la cita sigue. */
    assert.ok(await fileExists(photo.id));

    /* RN-03: máximo 5 provisionales a la vez. */
    for (let i = 0; i < 5; i++) assert.equal((await uploadClient(other.cookie, png, 'image/png', `p${i}.png`)).status, 201);
    r = await uploadClient(other.cookie, png, 'image/png', 'p6.png');
    assert.equal(r.status, 429);
  });

  test('RN-09 el cliente cambia o quita su foto mientras la cita no termina; la anterior se borra', async () => {
    const png = await smallPng();
    const first = (await uploadClient(client.cookie, png, 'image/png', 'a.png')).json;
    const appt = await book(client, { clientPhotoId: first.id });
    const second = (await uploadClient(client.cookie, await smallPng('#ffffff'), 'image/png', 'b.png')).json;
    let r = await req('PUT', `/api/wstyle/appointments/${appt.id}/reference`, { clientPhotoId: second.id }, client.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.reference.clientPhoto.id, second.id);
    assert.equal(await fileExists(first.id), false);
    /* El barbero no puede cambiarla. */
    assert.equal((await req('PUT', `/api/wstyle/appointments/${appt.id}/reference`, { clientPhotoId: null }, cookieA)).status, 403);
    r = await req('PUT', `/api/wstyle/appointments/${appt.id}/reference`, { clientPhotoId: null }, client.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.reference, null);
    assert.equal(await fileExists(second.id), false);
    await Appointment.updateOne({ _id: appt.id }, { status: 'cancelada' });
    assert.equal((await req('PUT', `/api/wstyle/appointments/${appt.id}/reference`, { clientPhotoId: null }, client.cookie)).status, 409);
  });

  test('AC-06 moderación, limpieza a los 90 días y cuenta eliminada', async () => {
    const png = await smallPng();
    const photo = (await uploadClient(client.cookie, png, 'image/png', 'mia.png')).json;
    const appt = await book(client, { clientPhotoId: photo.id });
    let r = await req('POST', `/api/admin/appointments/${appt.id}/remove-photo`, {}, adminCookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(await fileExists(photo.id), false);
    const view = (await req('GET', `/api/wstyle/appointments/${appt.id}`, undefined, client.cookie)).json;
    assert.equal(view.reference.clientPhoto, null);
    assert.equal(view.reference.clientPhotoNotice, 'Foto quitada por el local');
    const log = await AuditLog.findOne({ action: 'appointment.photo_removed' }).lean();
    assert.equal(log.entityId, appt.id);
    assert.equal(String(log.actorUserId), String(admin._id));

    /* 90 días después de finalizada. */
    const p2 = (await uploadClient(other.cookie, png, 'image/png', 'b.png')).json;
    const appt2 = await book(other, { clientPhotoId: p2.id }, '14:00');
    await Appointment.updateOne({ _id: appt2.id }, { status: 'terminada' });
    const endsAt = (await Appointment.findById(appt2.id)).endsAt.getTime();
    ctx.clock.now = endsAt + 89 * DAY;
    assert.equal((await ctx.app.locals.styles.runCleanup()).expired, 0);
    assert.ok(await fileExists(p2.id));
    ctx.clock.now = endsAt + 91 * DAY;
    assert.equal((await ctx.app.locals.styles.runCleanup()).expired, 1);
    assert.equal(await fileExists(p2.id), false);
    assert.equal((await Appointment.findById(appt2.id).lean()).reference.clientPhotoState, 'expired');

    /* Cuenta eliminada (RN-10). */
    ctx.clock.now = SUNDAY_9AM;
    const p3 = (await uploadClient(client.cookie, png, 'image/png', 'c.png')).json;
    const appt3 = await book(client, { clientPhotoId: p3.id }, '15:00');
    const pending = (await uploadClient(client.cookie, png, 'image/png', 'd.png')).json;
    r = await req('DELETE', '/api/auth/me', undefined, client.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(await fileExists(p3.id), false);
    assert.equal(await fileExists(pending.id), false);
    assert.equal((await Appointment.findById(appt3.id).lean()).reference.clientPhotoState, 'deleted');
  });

  test('RN-07 límites: 12 por subida', async () => {
    const png = await smallPng();
    const files = Array.from({ length: 13 }, (_, i) => [`${i}.png`, png, 'image/png']);
    const r = await uploadStyles(adminCookie, files, { category: 'barberia' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'too_many_photos');
    assert.equal(await Style.countDocuments(), 0);
  });
});
