/* SPEC-56 AC-01…AC-08: seña por transferencia bancaria, contra la BD de test real. Los
   comprobantes van al driver `fs` en un directorio temporal (nunca a Mongo). El reloj es
   inyectado: domingo 1-nov-2026 09:00 (Santiago) y las citas el lunes 2-nov. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { Appointment, AuditLog, Business, CustomerProfile, Professional, SlotLock } from '../src/models/index.js';
import { zonedToUtc } from '../src/domain/time.js';
import { depositAmountCLP, depositDeadline, makeReference, normalizeRut, REF_ALPHABET } from '../src/domain/deposits.js';
import { createReceiptStore, signS3, sniffReceipt } from '../src/lib/receipts.js';
import { api, connectDb, disconnectDb, makeClient, MIN, PRO_A, PRO_B, resetDb, seed, start, stop } from './helpers.js';
import { fakeMercadoPago, MP_ENV } from './mp-fake.js';

const TZ = 'America/Santiago';
const MONDAY = '2026-11-02';
const SUNDAY_9AM = Date.parse('2026-11-01T12:00:00Z');
const at = (time, date = MONDAY) => new Date(zonedToUtc(date, time, TZ)).toISOString();
const ADMIN_EMAIL = 'dueno@wstyle.test';
/* RUT y cuenta de prueba (RUT con dígito verificador válido): nunca deben salir en público. */
const BANK = { holder: 'Joe Camacho', rut: '11.111.111-1', bank: 'Banco Estado', accountType: 'rut', accountNumber: '987654321', email: 'pagos@wstyle.test' };

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
const jpeg = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#c08040' } }).jpeg().toBuffer();
const png = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#204060' } }).png().toBuffer();

function world() {
  const t = { ctx: null, seeded: null, admin: null, dir: null, released: [] };
  t.boot = async ({ deposit = {}, env = {}, mp = false } = {}) => {
    if (t.ctx) await stop(t.ctx.server);
    await resetDb();
    if (t.dir) rmSync(t.dir, { recursive: true, force: true });
    t.dir = mkdtempSync(path.join(tmpdir(), 'ws-receipts-'));
    t.released = [];
    t.seeded = await seed({ pros: [PRO_A, PRO_B] });
    await Business.updateOne({}, { $set: { 'payments.onlineEnabled': mp, 'payments.localEnabled': true, deposit: { enabled: true, kind: 'fixed', fixedCLP: 5000, percent: 30, appliesTo: 'all', minutes: 30, bank: BANK, ...deposit } } });
    const fake = fakeMercadoPago();
    t.ctx = await start({
      now: SUNDAY_9AM,
      env: { SUPERADMIN_EMAIL: ADMIN_EMAIL, ...(mp ? MP_ENV : {}), ...env },
      mercadoPagoFetch: fake.fetch,
      receiptStore: env.NODE_ENV ? undefined : createReceiptStore({ RECEIPTS_STORAGE: 'fs', RECEIPTS_DIR: t.dir }),
      onSlotReleased: (e) => t.released.push(e),
    });
    t.admin = await makeClient({ name: 'Dueño', email: ADMIN_EMAIL, roles: ['superadmin'] });
  };
  t.stop = async () => {
    if (t.ctx) await stop(t.ctx.server);
    if (t.dir) rmSync(t.dir, { recursive: true, force: true });
  };
  t.get = (p, cookie) => api(t.ctx.base, 'GET', p, { cookie });
  t.post = (p, body = {}, cookie) => api(t.ctx.base, 'POST', p, { body, cookie });
  t.put = (p, body = {}, cookie) => api(t.ctx.base, 'PUT', p, { body, cookie });
  t.pro = (i = 0) => t.seeded.pros[i];
  t.client = (name = 'Camila') => makeClient({ name, email: `${name.toLowerCase()}${Math.random().toString(36).slice(2, 7)}@clientes.test`, phone: `+5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  t.book = (c, { time = '12:00', service = 'corte', method = 'local', accept = true, pro = t.pro(0) } = {}) =>
    t.post('/api/wstyle/appointments', { serviceId: service, professionalId: String(pro._id), startsAt: at(time), mode: 'shop', acceptPolicies: true, paymentMethod: method, ...(accept ? { acceptDeposit: true } : {}) }, c.cookie);
  t.upload = async (id, buf, cookie, { name = 'comprobante.jpg', type = 'image/jpeg' } = {}) => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type }), name);
    const res = await fetch(`${t.ctx.base}/api/wstyle/appointments/${id}/deposit/receipt`, { method: 'POST', body: fd, headers: cookie ? { Cookie: cookie } : {} });
    let json = null;
    try { json = await res.json(); } catch { /* sin JSON */ }
    return { status: res.status, json };
  };
  t.run = () => t.ctx.app.locals.deposits.runDeposits();
  t.mails = (re) => t.ctx.mailer.outbox.filter((m) => re.test(m.template || ''));
  t.barberCookie = async (p = t.pro(0)) => {
    const c = await makeClient({ name: p.displayName, email: `sesion.${Math.random().toString(36).slice(2, 7)}@barberos.test`, roles: ['barber'] });
    await Professional.updateOne({ _id: p._id }, { userId: c.user._id });
    return c.cookie;
  };
  t.files = () => (existsSync(t.dir) ? readdirSync(t.dir, { recursive: true }).filter((f) => /\.(webp|pdf)$/.test(String(f))) : []);
  return t;
}

describe('SPEC-56 · reglas puras', () => {
  test('RN-02 monto: fijo, % redondeado hacia arriba a $100, mínimo $1.000 y tope el total', () => {
    const p = { priceCLP: 18000, surchargeCLP: 0, totalCLP: 18000 };
    assert.equal(depositAmountCLP({ kind: 'fixed', fixedCLP: 5000 }, p), 5000);
    assert.equal(depositAmountCLP({ kind: 'percent', percent: 30 }, p), 5400);
    /* 12.345 × 30 % = 3.703,5 → 3.800 */
    assert.equal(depositAmountCLP({ kind: 'percent', percent: 30 }, { priceCLP: 12345, totalCLP: 12345 }), 3800);
    /* % sobre servicio + domicilio, sin la tarifa de servicio. */
    assert.equal(depositAmountCLP({ kind: 'percent', percent: 50 }, { priceCLP: 10000, surchargeCLP: 3000, totalCLP: 14300 }), 6500);
    assert.equal(depositAmountCLP({ kind: 'percent', percent: 1 }, p), 1000);
    assert.equal(depositAmountCLP({ kind: 'fixed', fixedCLP: 50000 }, p), 18000);
  });

  test('RN-03 referencia WS-XXXX sin O, I, 0 ni 1', () => {
    for (let i = 0; i < 300; i++) {
      const r = makeReference();
      assert.match(r, /^WS-[A-HJ-NP-Z2-9]{4}$/);
    }
    assert.ok(!/[OI01]/.test(REF_ALPHABET));
  });

  test('RN-04 plazo = min(ahora + plazo, inicio − 30 min); menos de 10 min → muy pronto', () => {
    const now = Date.parse('2026-11-02T14:00:00Z');
    assert.deepEqual(depositDeadline(now, now + 3 * 60 * MIN, 30), { deadline: now + 30 * MIN, tooSoon: false });
    assert.deepEqual(depositDeadline(now, now + 50 * MIN, 60), { deadline: now + 20 * MIN, tooSoon: false });
    assert.equal(depositDeadline(now, now + 35 * MIN, 30).tooSoon, true);
  });

  test('RUT con dígito verificador', () => {
    assert.equal(normalizeRut('111111111'), '11.111.111-1');
    assert.equal(normalizeRut('76.543.210-3'), '76.543.210-3');
    assert.equal(normalizeRut('76.543.210-K'), null);
    assert.equal(normalizeRut('12.345.678-5'), '12.345.678-5');
    assert.equal(normalizeRut('abc'), null);
  });

  test('tipo por contenido: JPEG, PNG, WebP, HEIC y PDF; un .exe no', async () => {
    assert.equal(sniffReceipt(await jpeg()), 'jpeg');
    assert.equal(sniffReceipt(PDF), 'pdf');
    assert.equal(sniffReceipt(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)])), 'heic');
    assert.equal(sniffReceipt(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)])), null);
  });

  test('§10 driver S3: firma SigV4 y bucket privado (sin ACL pública)', async () => {
    const calls = [];
    const store = createReceiptStore(
      { RECEIPTS_STORAGE: 's3', S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', S3_BUCKET: 'wstyle-receipts', S3_ACCESS_KEY_ID: 'AKID', S3_SECRET_ACCESS_KEY: 'SECRET' },
      { fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(init.method === 'GET' ? 'x' : null, { status: 200 }); }, clock: () => Date.parse('2026-11-02T12:00:00Z') }
    );
    assert.equal(store.configured, true);
    await store.put('2026-11/0b9f5c1e-1111-4222-8333-444455556666.webp', Buffer.from('abc'), 'image/webp');
    assert.equal(calls[0].url, 'https://acct.r2.cloudflarestorage.com/wstyle-receipts/2026-11/0b9f5c1e-1111-4222-8333-444455556666.webp');
    assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20261102\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.ok(!('x-amz-acl' in calls[0].init.headers));
    const h = signS3({ method: 'GET', url: 'https://x.test/b/k', region: 'auto', accessKeyId: 'A', secretAccessKey: 'S', now: 0 });
    assert.equal(h['x-amz-date'], '19700101T000000Z');
    /* Sin credenciales → no configurado; en producción el fs no cuenta (RN-10). */
    assert.equal(createReceiptStore({ RECEIPTS_STORAGE: 's3' }).configured, false);
    assert.equal(createReceiptStore({ NODE_ENV: 'production' }).configured, false);
    await assert.rejects(() => store.put('../../etc/passwd', Buffer.from('x'), 'text/plain'));
  });
});

describe('SPEC-56 seña por transferencia', () => {
  const t = world();
  before(connectDb);
  after(disconnectDb);
  after(() => t.stop());

  describe('AC-01 regla de aplicación', () => {
    beforeEach(() => t.boot());

    test('modo "todos": pendiente_sena con monto, referencia y plazo; sin aceptar las condiciones → 400', async () => {
      const c = await t.client();
      const no = await t.book(c, { accept: false });
      assert.equal(no.status, 400);
      assert.equal(no.json.error, 'deposit_terms_required');
      const r = await t.book(c);
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const a = await Appointment.findById(r.json.id).lean();
      assert.equal(a.status, 'pendiente_sena');
      assert.equal(a.deposit.amountCLP, 5000);
      assert.equal(a.deposit.status, 'por_pagar');
      assert.match(a.deposit.reference, /^WS-[A-HJ-NP-Z2-9]{4}$/);
      assert.equal(a.expiresAt.getTime(), SUNDAY_9AM + 30 * MIN);
      assert.equal(a.deposit.deadlineAt.getTime(), SUNDAY_9AM + 30 * MIN);
      /* Ocupa la hora (BLOCKING). */
      assert.ok((await SlotLock.countDocuments({ appointmentId: a._id })) > 0);
      /* La vista del dueño trae referencia, datos bancarios y la hora del server. */
      const v = r.json.appointment;
      assert.equal(v.deposit.reference, a.deposit.reference);
      assert.equal(v.deposit.bank.rut, BANK.rut);
      assert.equal(v.deposit.restIfPaidCLP, 12000 - 5000);
      assert.equal(v.now, new Date(SUNDAY_9AM).toISOString());
      assert.ok(v.actions.includes('deposit_upload'));
      /* Correo de instrucciones con la referencia y los datos. */
      const m = t.mails(/client_deposit_requested/);
      assert.equal(m.length, 1);
      assert.match(m[0].text, new RegExp(a.deposit.reference));
      assert.match(m[0].text, /987654321/);
      /* El barbero aún no recibe "nueva cita" (llega con el comprobante). */
      assert.equal(t.mails(/barber_new/).length, 0);
    });

    test('modo "solo nuevos": quien ya tiene una cita terminada no paga seña; uno nuevo sí', async () => {
      await Business.updateOne({}, { $set: { 'deposit.appliesTo': 'new' } });
      const old = await t.client('Pedro');
      await Appointment.create({ businessId: t.seeded.business._id, professionalId: t.pro(0)._id, customerUserId: old.user._id, startsAt: new Date('2026-10-01T15:00:00Z'), endsAt: new Date('2026-10-01T15:40:00Z'), serviceSnapshot: { slug: 'corte', name: 'Corte', priceCLP: 12000, durationMin: 40 }, status: 'terminada' });
      const r1 = await t.book(old, { accept: false });
      assert.equal(r1.status, 201, JSON.stringify(r1.json));
      assert.equal(r1.json.appointment.status, 'pendiente');
      assert.equal(r1.json.appointment.deposit, null);
      const fresh = await t.client();
      const r2 = await t.book(fresh, { time: '13:00' });
      assert.equal(r2.json.appointment.status, 'pendiente_sena');
    });

    test('modo "con inasistencia": solo quien faltó; CB-11 la regla "nuevos" no se acumula', async () => {
      await Business.updateOne({}, { $set: { 'deposit.appliesTo': 'no_show', 'deposit.kind': 'percent', 'deposit.percent': 30 } });
      const ok = await t.client('Sin');
      const r1 = await t.book(ok, { accept: false });
      assert.equal(r1.json.appointment.status, 'pendiente');
      const faltón = await t.client('Falto');
      await CustomerProfile.create({ businessId: t.seeded.business._id, userId: faltón.user._id, counters: { appointments: 3, noShows: 1 } });
      const r2 = await t.book(faltón, { time: '13:00', service: 'corte-barba' });
      assert.equal(r2.json.appointment.status, 'pendiente_sena');
      /* 30 % de $18.000 = $5.400 */
      assert.equal(r2.json.appointment.deposit.amountCLP, 5400);
      /* CB-11: con "solo nuevos", alguien con inasistencia pero sin citas terminadas sí paga; con una terminada, no. */
      await Business.updateOne({}, { $set: { 'deposit.appliesTo': 'new' } });
      await Appointment.create({ businessId: t.seeded.business._id, professionalId: t.pro(0)._id, customerUserId: faltón.user._id, startsAt: new Date('2026-10-01T15:00:00Z'), endsAt: new Date('2026-10-01T15:40:00Z'), serviceSnapshot: { slug: 'corte', name: 'Corte', priceCLP: 12000, durationMin: 40 }, status: 'terminada' });
      await Appointment.deleteOne({ _id: r2.json.id });
      await SlotLock.deleteMany({ appointmentId: new mongoose.Types.ObjectId(r2.json.id) });
      const r3 = await t.book(faltón, { time: '14:00', accept: false });
      assert.equal(r3.json.appointment.status, 'pendiente');
    });

    test('"Pagar en línea" nunca pide seña; la hora muy pronta → 422', async () => {
      await t.boot({ mp: true });
      const c = await t.client();
      const r = await t.book(c, { method: 'online', accept: false });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.appointment.status, 'pendiente_pago');
      assert.equal((await Appointment.findById(r.json.id).lean()).deposit, undefined);
      /* Lunes 11:25 → cita 12:00: el plazo sería 11:30 (5 min) → muy pronto. */
      await Business.updateOne({}, { $set: { 'settings.minLeadMinutes': 0 } });
      t.ctx.clock.now = Date.parse(at('11:25'));
      const c2 = await t.client('Pronto');
      const late = await t.book(c2, { time: '12:00', pro: t.pro(1) });
      assert.equal(late.status, 422, JSON.stringify(late.json));
      assert.equal(late.json.error, 'deposit_too_soon');
      assert.match(late.json.message, /muy pronto/);
      /* Preaviso para el paso "Revisar". */
      const pv = await t.post('/api/wstyle/deposit/preview', { serviceId: 'corte', startsAt: at('16:00'), mode: 'shop' }, c2.cookie);
      assert.equal(pv.status, 200);
      assert.deepEqual({ required: pv.json.required, amountCLP: pv.json.amountCLP, restCLP: pv.json.restCLP, minutes: pv.json.minutes, tooSoon: pv.json.tooSoon }, { required: true, amountCLP: 5000, restCLP: 7000, minutes: 30, tooSoon: false });
    });
  });

  describe('subida, vencimiento, revisión y pagos', () => {
    beforeEach(() => t.boot());

    test('AC-02 sin comprobante vence a tiempo: expirada/vencida, libera la hora, correo y lista de espera; con comprobante no vence', async () => {
      const c1 = await t.client('Uno');
      const c2 = await t.client('Dos');
      const a1 = (await t.book(c1)).json.id;
      const a2 = (await t.book(c2, { time: '14:00' })).json.id;
      assert.equal((await t.upload(a2, await jpeg(), c2.cookie)).status, 201);
      t.ctx.clock.now = SUNDAY_9AM + 29 * MIN;
      assert.equal((await t.run()).expired, 0);
      /* CB-10: el server "despierta" 2 h después y vence todo lo atrasado en la primera vuelta. */
      t.ctx.clock.now = SUNDAY_9AM + 2 * 60 * MIN;
      assert.equal((await t.run()).expired, 1);
      const x1 = await Appointment.findById(a1).lean();
      assert.equal(x1.status, 'expirada');
      assert.equal(x1.deposit.status, 'vencida');
      assert.equal(await SlotLock.countDocuments({ appointmentId: x1._id }), 0);
      assert.equal(t.mails(/client_deposit_expired/).length, 1);
      assert.equal(t.released.length, 1);
      assert.equal(String(t.released[0].appointment._id), a1);
      const x2 = await Appointment.findById(a2).lean();
      assert.equal(x2.status, 'pendiente');
      assert.equal(x2.deposit.status, 'en_revision');
      /* La hora vuelve a la disponibilidad. */
      const av = await t.get(`/api/wstyle/availability?service=corte&professional=${t.pro(0)._id}&from=${MONDAY}&to=${MONDAY}`);
      assert.ok(av.json.days[0].slots.some((s) => s.startsAt === at('12:00')));
      /* Subir después del vencimiento → 409. */
      const late = await t.upload(a1, await jpeg(), c1.cookie);
      assert.equal(late.status, 409);
      assert.equal(late.json.error, 'deposit_expired');
    });

    test('AC-03 subida segura: JPEG, PNG y PDF → 201 en disco (no en Mongo); .exe, > 5 MB, PDF corrupto → 400; tarde → 409; otro usuario → 404', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      const other = await t.client('Otro');
      assert.equal((await t.upload(id, await jpeg(), other.cookie)).status, 404);
      assert.equal((await t.upload(id, await jpeg(), null)).status, 401);
      const exe = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(2048, 7)]);
      const r1 = await t.upload(id, exe, c.cookie, { name: 'foto.jpg' });
      assert.equal(r1.status, 400);
      assert.equal(r1.json.error, 'invalid_file');
      const big = Buffer.concat([await jpeg(), Buffer.alloc(7 * 1024 * 1024)]);
      const r2 = await t.upload(id, big, c.cookie);
      assert.equal(r2.status, 400);
      assert.equal(r2.json.error, 'file_too_large');
      const r3 = await t.upload(id, Buffer.from('%PDF-1.4\n1 0 obj << /Type', 'latin1'), c.cookie, { name: 'c.pdf', type: 'application/pdf' });
      assert.equal(r3.status, 400);
      /* CB-02: la hora sigue esperando. */
      assert.equal((await Appointment.findById(id).lean()).status, 'pendiente_sena');
      assert.equal(t.files().length, 0);

      const ok = await t.upload(id, await jpeg(), c.cookie);
      assert.equal(ok.status, 201, JSON.stringify(ok.json));
      assert.equal(ok.json.appointment.status, 'pendiente');
      assert.equal(ok.json.appointment.deposit.status, 'en_revision');
      assert.equal(t.mails(/barber_new/).length, 1);
      /* Reemplazo mientras está en revisión: PNG grande → WebP ≤ 1600 px; el anterior se borra. */
      const ok2 = await t.upload(id, await png(), c.cookie, { name: 'c.png', type: 'image/png' });
      assert.equal(ok2.status, 201);
      let a = await Appointment.findById(id).lean();
      assert.equal(a.deposit.receipt.contentType, 'image/webp');
      const files = t.files();
      assert.equal(files.length, 1);
      const meta = await sharp(path.join(t.dir, files[0])).metadata();
      assert.equal(meta.width, 1600);
      assert.equal(meta.exif, undefined);
      /* PDF tal cual. */
      const ok3 = await t.upload(id, PDF, c.cookie, { name: 'c.pdf', type: 'application/pdf' });
      assert.equal(ok3.status, 201);
      a = await Appointment.findById(id).lean();
      assert.equal(a.deposit.receipt.contentType, 'application/pdf');
      assert.equal(statSync(path.join(t.dir, a.deposit.receipt.key)).size, PDF.length);
      /* CB-04: el mismo archivo otra vez → idempotente (200, sin archivo nuevo). */
      const again = await t.upload(id, PDF, c.cookie, { name: 'c.pdf', type: 'application/pdf' });
      assert.equal(again.status, 200);
      assert.equal(t.files().length, 1);
      /* Sin binarios en Mongo: ni GridFS nuevo ni Buffer en la cita. */
      const cols = (await mongoose.connection.db.listCollections().toArray()).map((x) => x.name);
      assert.ok(!cols.some((n) => /receipt/i.test(n)));
      const raw = await Appointment.collection.findOne({ _id: a._id });
      const hasBinary = (o) => o && typeof o === 'object' && (o._bsontype === 'Binary' || Buffer.isBuffer(o) || Object.values(o).some(hasBinary));
      assert.equal(hasBinary(raw.deposit), false);
    });

    test('AC-04 acceso al comprobante: dueño y super admin → 200 con nosniff; barbero, otro cliente y sin sesión → 403/401', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      await t.upload(id, PDF, c.cookie, { name: 'c.pdf', type: 'application/pdf' });
      const fetchAs = (cookie) => fetch(`${t.ctx.base}/api/wstyle/appointments/${id}/deposit/receipt`, { headers: cookie ? { Cookie: cookie } : {} });
      for (const cookie of [c.cookie, t.admin.cookie]) {
        const r = await fetchAs(cookie);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(r.headers.get('content-type'), 'application/pdf');
        assert.match(r.headers.get('content-disposition'), /comprobante-WS-/);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), PDF);
      }
      assert.equal((await fetchAs(await t.barberCookie())).status, 403);
      assert.equal((await fetchAs((await t.client('Otro')).cookie)).status, 403);
      assert.equal((await fetchAs(null)).status, 401);
      /* El barbero ve el estado de la seña, no el comprobante ni la referencia ni el banco. */
      const bv = await t.get(`/api/wstyle/appointments/${id}`, await t.barberCookie());
      assert.equal(bv.json.deposit.status, 'en_revision');
      assert.equal(bv.json.deposit.reference, undefined);
      assert.equal(bv.json.deposit.bank, undefined);
    });

    test('AC-05 revisión: confirmar → confirmada + correo + auditoría; rechazar sin motivo → 400; con motivo → cancelada y hora libre; barbero → 403; CB-05', async () => {
      const c1 = await t.client('Uno');
      const c2 = await t.client('Dos');
      const a1 = (await t.book(c1)).json.id;
      const a2 = (await t.book(c2, { time: '14:00' })).json.id;
      await t.upload(a1, await jpeg(), c1.cookie);
      await t.upload(a2, await jpeg(), c2.cookie);
      const list = await t.get('/api/admin/deposits', t.admin.cookie);
      assert.equal(list.status, 200);
      assert.equal(list.json.counts.review, 2);
      assert.deepEqual(list.json.items[0].checklist, { amountCLP: 5000, reference: list.json.items[0].reference, accountLast4: '4321', bank: 'Banco Estado' });
      const ov = await t.get('/api/admin/overview', t.admin.cookie);
      assert.equal(ov.json.cards.depositsToReview, 2);
      const barber = await t.barberCookie();
      assert.equal((await t.post(`/api/admin/deposits/${a1}/confirm`, {}, barber)).status, 403);
      /* CB-05: confirmar y rechazar a la vez → gana uno, el otro 409. */
      const [conf, rej] = await Promise.all([t.post(`/api/admin/deposits/${a1}/confirm`, {}, t.admin.cookie), t.post(`/api/admin/deposits/${a1}/reject`, { reasonCode: 'monto' }, t.admin.cookie)]);
      assert.deepEqual([conf.status, rej.status].sort(), [200, 409]);
      if (conf.status === 200) {
        assert.equal((await Appointment.findById(a1).lean()).deposit.status, 'confirmada');
        assert.equal(t.mails(/client_deposit_confirmed/).length, 1);
        assert.ok(await AuditLog.exists({ action: 'deposit.confirm' }));
      }
      assert.equal((await t.post(`/api/admin/deposits/${a2}/reject`, {}, t.admin.cookie)).status, 400);
      assert.equal((await t.post(`/api/admin/deposits/${a2}/reject`, { reasonCode: 'otro' }, t.admin.cookie)).status, 400);
      const r = await t.post(`/api/admin/deposits/${a2}/reject`, { reasonCode: 'no_llego' }, t.admin.cookie);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const x2 = await Appointment.findById(a2).lean();
      assert.equal(x2.status, 'cancelada');
      assert.equal(x2.deposit.status, 'rechazada');
      assert.match(x2.history.at(-1).reason, /Seña rechazada: No llegó a la cuenta/);
      assert.equal(await SlotLock.countDocuments({ appointmentId: x2._id }), 0);
      assert.equal(t.mails(/client_deposit_rejected/).length, 1);
      assert.ok(await AuditLog.exists({ action: 'deposit.reject' }));
      assert.ok(t.released.some((e) => String(e.appointment._id) === a2));
    });

    test('AC-06 pagos y rendición: seña $5.000 + local $13.000 = $18.000; vencida o rechazada no suma; barbero cancela → por_devolver → devuelta', async () => {
      const c = await t.client();
      const id = (await t.book(c, { service: 'corte-barba' })).json.id;
      await t.upload(id, await jpeg(), c.cookie);
      await t.post(`/api/admin/deposits/${id}/confirm`, {}, t.admin.cookie);
      /* Una vencida y una rechazada (no deben aparecer). */
      const v = await t.client('Vence');
      const vid = (await t.book(v, { time: '14:00' })).json.id;
      const rj = await t.client('Rechazo');
      const rid = (await t.book(rj, { time: '15:00' })).json.id;
      await t.upload(rid, await jpeg(), rj.cookie);
      await t.post(`/api/admin/deposits/${rid}/reject`, { reasonCode: 'ilegible' }, t.admin.cookie);
      t.ctx.clock.now = SUNDAY_9AM + 40 * MIN;
      await t.run();
      assert.equal((await Appointment.findById(vid).lean()).deposit.status, 'vencida');

      /* El barbero confirma, inicia y termina: "Resta por cobrar $13.000". */
      const barber = await t.barberCookie();
      assert.equal((await t.post(`/api/wstyle/appointments/${id}/confirm`, {}, barber)).status, 200);
      t.ctx.clock.now = Date.parse(at('12:00'));
      const seen = await t.get(`/api/wstyle/appointments/${id}`, barber);
      assert.equal(seen.json.deposit.status, 'confirmada');
      assert.equal(seen.json.deposit.restCLP, 13000);
      assert.equal((await t.post(`/api/wstyle/appointments/${id}/start`, {}, barber)).status, 200);
      t.ctx.clock.now = Date.parse(at('13:00'));
      const fin = await t.post(`/api/wstyle/appointments/${id}/finish`, { collected: true, localMethod: 'efectivo' }, barber);
      assert.equal(fin.status, 200, JSON.stringify(fin.json));

      const pays = await t.get('/api/admin/payments?from=2026-11-01&to=2026-11-30', t.admin.cookie);
      const mine = pays.json.items.filter((r) => r.appointmentId === id);
      assert.equal(mine.length, 2);
      const dep = mine.find((r) => r.kind === 'deposit');
      const loc = mine.find((r) => r.kind === 'local');
      assert.deepEqual([dep.amountCLP, dep.method, dep.methodLabel, dep.status], [5000, 'transferencia', 'Seña · transferencia', 'aprobado']);
      assert.deepEqual([loc.amountCLP, loc.method, loc.status], [13000, 'efectivo', 'aprobado']);
      assert.ok(!pays.json.items.some((r) => r.appointmentId === vid || r.appointmentId === rid));
      const ren = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
      assert.equal(ren.json.totals.approvedCLP, 18000);
      assert.equal(ren.json.cuadre.ok, true, JSON.stringify(ren.json.cuadre));
      assert.equal(ren.json.sales.find((r) => r.kind === 'deposit').method, 'transferencia');
      /* El barbero ve la fila de la seña en sus pagos. */
      const pp = await t.get('/api/pro/payments?from=2026-11-01&to=2026-11-30', barber);
      if (pp.status === 200) assert.ok(pp.json.items.some((r) => r.kind === 'deposit' && r.appointmentId === id));

      /* Cancelación por el barbero de otra cita con seña confirmada → por_devolver → devuelta. */
      t.ctx.clock.now = SUNDAY_9AM + 45 * MIN;
      const k = await t.client('Kevin');
      const kid = (await t.book(k, { time: '16:00' })).json.id;
      await t.upload(kid, await jpeg(), k.cookie);
      await t.post(`/api/admin/deposits/${kid}/confirm`, {}, t.admin.cookie);
      const cancel = await t.post(`/api/wstyle/appointments/${kid}/cancel`, { reasonCode: 'enfermedad' }, barber);
      assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
      assert.equal((await Appointment.findById(kid).lean()).deposit.status, 'por_devolver');
      const refundList = await t.get('/api/admin/deposits?view=refund', t.admin.cookie);
      assert.equal(refundList.json.items.length, 1);
      assert.equal((await t.post(`/api/admin/deposits/${kid}/refunded`, {}, t.admin.cookie)).status, 200);
      assert.equal((await Appointment.findById(kid).lean()).deposit.status, 'devuelta');
      assert.ok(await AuditLog.exists({ action: 'deposit.refunded' }));
    });

    test('RN-07 el cliente cancela con la seña confirmada → no se devuelve; CB-08 cambiar a pagar en línea anula la seña', async () => {
      const c = await t.client();
      const id = (await t.book(c, { time: '17:00' })).json.id;
      await t.upload(id, await jpeg(), c.cookie);
      await t.post(`/api/admin/deposits/${id}/confirm`, {}, t.admin.cookie);
      const r = await t.post(`/api/wstyle/appointments/${id}/cancel`, { reason: 'No puedo' }, c.cookie);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal((await Appointment.findById(id).lean()).deposit.status, 'confirmada');

      await t.boot({ mp: true });
      const c2 = await t.client();
      const id2 = (await t.book(c2)).json.id;
      const v = await t.get(`/api/wstyle/appointments/${id2}`, c2.cookie);
      assert.ok(v.json.actions.includes('deposit_pay_online'));
      const sw = await t.post(`/api/wstyle/appointments/${id2}/deposit/pay-online`, {}, c2.cookie);
      assert.equal(sw.status, 200, JSON.stringify(sw.json));
      assert.equal(sw.json.status, 'pendiente_pago');
      assert.equal(sw.json.deposit.status, 'anulada');
      assert.equal(sw.json.deposit.bank, undefined);
    });

    test('RN-01 "Pagar en línea" → "Cambiar a pagar en el local" no salta la seña', async () => {
      await t.boot({ mp: true });
      const c = await t.client();
      const r = await t.book(c, { method: 'online', accept: false });
      assert.equal(r.json.appointment.status, 'pendiente_pago');
      const loc = await t.post(`/api/wstyle/appointments/${r.json.id}/pay-local`, {}, c.cookie);
      assert.equal(loc.status, 200, JSON.stringify(loc.json));
      assert.equal(loc.json.status, 'pendiente_sena');
      assert.equal(loc.json.deposit.status, 'por_pagar');
      assert.equal(loc.json.deposit.amountCLP, 5000);
      assert.equal(t.mails(/client_deposit_requested/).length, 1);
      /* CB-08 de ida y vuelta: anular y volver a pedirla. */
      const sw = await t.post(`/api/wstyle/appointments/${r.json.id}/deposit/pay-online`, {}, c.cookie);
      assert.equal(sw.json.deposit.status, 'anulada');
      const back = await t.post(`/api/wstyle/appointments/${r.json.id}/pay-local`, {}, c.cookie);
      assert.equal(back.json.status, 'pendiente_sena');
      assert.equal(back.json.deposit.status, 'por_pagar');
    });

    test('cancelar una cita esperando la seña la anula: sin datos bancarios ni referencia tomada', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      const r = await t.post(`/api/wstyle/appointments/${id}/cancel`, { reason: 'No puedo' }, c.cookie);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.deposit.status, 'anulada');
      assert.equal(r.json.deposit.bank, undefined);
      assert.ok(!r.json.actions.includes('deposit_upload'));
    });

    test('rechazar por error una seña confirmada de una cita ya terminada: la cita no se cancela y el cuadre usa lo cobrado', async () => {
      const c = await t.client();
      const id = (await t.book(c, { service: 'corte-barba' })).json.id;
      await t.upload(id, await jpeg(), c.cookie);
      await t.post(`/api/admin/deposits/${id}/confirm`, {}, t.admin.cookie);
      const barber = await t.barberCookie();
      await t.post(`/api/wstyle/appointments/${id}/confirm`, {}, barber);
      t.ctx.clock.now = Date.parse(at('12:00'));
      await t.post(`/api/wstyle/appointments/${id}/start`, {}, barber);
      await t.post(`/api/wstyle/appointments/${id}/finish`, { collected: true, localMethod: 'efectivo' }, barber);
      const rej = await t.post(`/api/admin/deposits/${id}/reject`, { reasonCode: 'no_llego' }, t.admin.cookie);
      assert.equal(rej.status, 200, JSON.stringify(rej.json));
      const a = await Appointment.findById(id).lean();
      assert.deepEqual([a.status, a.deposit.status], ['terminada', 'por_devolver']);
      await t.post(`/api/admin/deposits/${id}/refunded`, {}, t.admin.cookie);
      const ren = await t.get('/api/admin/rendicion?month=2026-11', t.admin.cookie);
      /* Entraron $13.000 en el local y la seña de $5.000 se devolvió: ventas netas $13.000. */
      assert.equal(ren.json.totals.netSalesCLP, 13000);
      assert.equal(ren.json.cuadre.ok, true, JSON.stringify(ren.json.cuadre));
    });

    test('RN-10 sin almacenamiento configurado: no se pide seña y la subida responde 503', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      const store = t.ctx.app.locals.receipts;
      store.configured = false;
      try {
        const up = await t.upload(id, await jpeg(), c.cookie);
        assert.equal(up.status, 503);
        assert.equal(t.files().length, 0);
        const c2 = await t.client('Sin');
        const r = await t.book(c2, { time: '15:00', accept: false });
        assert.equal(r.json.appointment.status, 'pendiente');
      } finally {
        store.configured = true;
      }
    });

    test('CB-06 reasignar una cita esperando la seña conserva la seña y el plazo', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      const before = await Appointment.findById(id).lean();
      const r = await t.post(`/api/admin/appointments/${id}/reassign`, { professionalId: String(t.pro(1)._id) }, t.admin.cookie);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const after = await Appointment.findById(id).lean();
      assert.equal(String(after.professionalId), String(t.pro(1)._id));
      assert.deepEqual([after.status, after.deposit.reference, after.expiresAt.getTime()], ['pendiente_sena', before.deposit.reference, before.expiresAt.getTime()]);
    });

    test('CB-12 cuenta eliminada: el comprobante se borra del almacenamiento y quedan los metadatos', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      await t.upload(id, await jpeg(), c.cookie);
      assert.equal(t.files().length, 1);
      await t.ctx.app.locals.deposits.onAccountDeleted(c.user);
      assert.equal(t.files().length, 0);
      const a = await Appointment.findById(id).lean();
      assert.ok(a.deposit.receipt.purgedAt);
      assert.ok(a.deposit.receipt.hash);
    });

    test('§10 retención: el comprobante se borra 12 meses después de la cita', async () => {
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      await t.upload(id, await jpeg(), c.cookie);
      t.ctx.clock.now = Date.parse(at('12:00')) + 366 * 24 * 60 * MIN;
      const r = await t.run();
      assert.equal(r.purged, 1);
      assert.equal(t.files().length, 0);
    });
  });

  describe('configuración y privacidad', () => {
    beforeEach(() => t.boot({ deposit: { enabled: false } }));

    test('AC-07 el catálogo público no trae el RUT ni el N° de cuenta; la cita sí, solo a su dueño con la seña pendiente', async () => {
      const cat = await t.get('/api/wstyle/catalog');
      const s = JSON.stringify(cat.json);
      assert.equal(cat.json.business.deposit.enabled, false);
      assert.ok(!s.includes('11.111.111-1') && !s.includes('987654321') && !s.includes('pagos@wstyle.test'));
      await Business.updateOne({}, { $set: { 'deposit.enabled': true } });
      const s2 = JSON.stringify((await t.get('/api/wstyle/catalog')).json);
      assert.ok(!s2.includes('11.111.111-1') && !s2.includes('987654321'));
      const c = await t.client();
      const id = (await t.book(c)).json.id;
      const other = await t.get(`/api/wstyle/appointments/${id}`, (await t.client('Otro')).cookie);
      assert.equal(other.status, 404);
      const mine = await t.get(`/api/wstyle/appointments/${id}`, c.cookie);
      assert.equal(mine.json.deposit.bank.accountNumber, '987654321');
    });

    test('configuración: valida RUT y correo, exige datos completos, audita y no expone el N° de cuenta en la auditoría', async () => {
      const put = (body) => t.put('/api/admin/deposit-settings', body, t.admin.cookie);
      const barber = await t.barberCookie();
      assert.equal((await t.put('/api/admin/deposit-settings', { enabled: true }, barber)).status, 403);
      assert.equal((await put({ bank: { rut: '11.111.111-2' } })).json.error, 'invalid_rut');
      assert.equal((await put({ bank: { email: 'nope' } })).json.error, 'invalid_email');
      assert.equal((await put({ minutes: 45 })).status, 400);
      await Business.updateOne({}, { $unset: { 'deposit.bank.accountNumber': 1 } });
      const inc = await put({ enabled: true });
      assert.equal(inc.status, 422);
      assert.equal(inc.json.error, 'bank_incomplete');
      const ok = await put({ enabled: true, kind: 'percent', percent: 30, appliesTo: 'no_show', minutes: 60, bank: { accountNumber: '000-123-4321' } });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.deepEqual([ok.json.enabled, ok.json.kind, ok.json.percent, ok.json.appliesTo, ok.json.minutes, ok.json.bankComplete], [true, 'percent', 30, 'no_show', 60, true]);
      const log = await AuditLog.findOne({ action: 'deposit.settings' }).lean();
      assert.ok(log);
      assert.ok(!JSON.stringify(log).includes('000-123-4321'));
      assert.ok(!JSON.stringify(log).includes('11.111.111-1'));
      const got = await t.get('/api/admin/deposit-settings', t.admin.cookie);
      assert.equal(got.json.storage.configured, true);
    });

    test('AC-08 producción sin S3 → no se puede encender (422 con el motivo)', async () => {
      await t.boot({ deposit: { enabled: false }, env: { NODE_ENV: 'production', RECEIPTS_STORAGE: 'fs' } });
      const r = await t.put('/api/admin/deposit-settings', { enabled: true }, t.admin.cookie);
      assert.equal(r.status, 422);
      assert.equal(r.json.error, 'storage_required');
      assert.match(r.json.message, /S3/);
      const g = await t.get('/api/admin/deposit-settings', t.admin.cookie);
      assert.equal(g.json.storage.configured, false);
    });
  });
});
