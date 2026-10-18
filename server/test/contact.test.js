/* Casos borde de POST /api/contact (SPEC-23). Cada test levanta la app en un
   puerto efímero (listen(0)) con un env SIN credenciales de correo: nunca sale
   un mail de verdad, y Mongo no está conectado, así que tampoco se toca la BD.
   Solo fetch/FormData/Blob nativos de Node 20+, sin dependencias. */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, MAX_FILES, MAX_TOTAL_BYTES, MAX_MESSAGE_LENGTH, RATE_LIMIT } from '../src/app.js';

const silent = { log() {}, error() {} };

async function start(options = {}) {
  const app = createApp({ env: {}, logger: silent, ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return { app, server, url: `http://127.0.0.1:${port}/api/contact` };
}

function stop(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
}

function form({ subject = 'Hola, quiero una web', email = 'yo@ricorp.cl', website, files = [] } = {}) {
  const fd = new FormData();
  if (subject !== null) fd.append('subject', subject);
  if (email !== null) fd.append('email', email);
  if (website !== undefined) fd.append('website', website);
  for (const f of files) fd.append('files', f.blob, f.name);
  return fd;
}

const pdf = (name, size = 1000) => ({ name, blob: new Blob([new Uint8Array(size)], { type: 'application/pdf' }) });

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo JSON */
  }
  return { status: res.status, json };
}

describe('POST /api/contact (dry-run local)', () => {
  let ctx;
  before(async () => {
    /* Rate limit alto para que no interfiera; se prueba aparte. */
    ctx = await start({ rateLimit: { max: 1000, windowMs: 60_000 } });
  });
  after(() => stop(ctx.server));

  test('ok: mensaje + email + adjuntos válidos → 200 dry-run', async () => {
    const r = await post(ctx.url, form({ files: [pdf('cv.pdf'), { name: 'foto.png', blob: new Blob(['x'], { type: 'image/png' }) }] }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, dryRun: true, attachments: 2 });
  });

  test('faltan campos → 400 missing fields', async () => {
    for (const body of [form({ subject: null }), form({ email: null }), form({ subject: '   ' })]) {
      const r = await post(ctx.url, body);
      assert.equal(r.status, 400);
      assert.equal(r.json.error, 'missing fields');
    }
  });

  test('email inválido → 400 invalid email', async () => {
    for (const email of ['a@b', 'sin-arroba', 'a b@c.com', '@dominio.cl']) {
      const r = await post(ctx.url, form({ email }));
      assert.equal(r.status, 400, email);
      assert.equal(r.json.error, 'invalid email', email);
    }
  });

  test('mensaje de más de 5000 caracteres → 400 message too long; justo 5000 pasa', async () => {
    const long = await post(ctx.url, form({ subject: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }));
    assert.equal(long.status, 400);
    assert.equal(long.json.error, 'message too long');
    const exact = await post(ctx.url, form({ subject: 'a'.repeat(MAX_MESSAGE_LENGTH) }));
    assert.equal(exact.status, 200);
  });

  test('más de 5 archivos → 413 too many files', async () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => pdf(`doc-${i}.pdf`));
    const r = await post(ctx.url, form({ files }));
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'too many files');
  });

  test('más de 10 MB en total (dos de 6 MB) → 413 attachments too large', async () => {
    const r = await post(ctx.url, form({ files: [pdf('a.pdf', 6 * 1024 * 1024), pdf('b.pdf', 6 * 1024 * 1024)] }));
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'attachments too large');
  });

  test('un solo archivo de más de 10 MB → 413 attachments too large', async () => {
    const r = await post(ctx.url, form({ files: [pdf('enorme.pdf', MAX_TOTAL_BYTES + 1)] }));
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'attachments too large');
  });

  test('tipo no permitido (.exe, .js) → 400 file type not allowed con el nombre', async () => {
    for (const [name, type] of [
      ['setup.exe', 'application/x-msdownload'],
      ['script.js', 'text/javascript'],
    ]) {
      const r = await post(ctx.url, form({ files: [pdf('ok.pdf'), { name, blob: new Blob(['x'], { type }) }] }));
      assert.equal(r.status, 400, name);
      assert.equal(r.json.error, 'file type not allowed');
      assert.equal(r.json.filename, name);
    }
  });

  test('archivo vacío (0 bytes) → 400 empty file', async () => {
    const r = await post(ctx.url, form({ files: [{ name: 'vacio.txt', blob: new Blob([], { type: 'text/plain' }) }] }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'empty file');
    assert.equal(r.json.filename, 'vacio.txt');
  });

  test('honeypot lleno → 200 fingido sin pasar por el mailer', async () => {
    const logs = [];
    const spy = { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
    const own = await start({ logger: spy });
    try {
      /* Aunque el resto venga mal (email inválido), el bot recibe un ok. */
      const r = await post(own.url, form({ email: 'no-es-email', website: 'http://spam.example' }));
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, true);
      assert.ok(logs.some((l) => l.includes('honeypot')));
      assert.ok(!logs.some((l) => l.includes('dry-run')), 'no debe llegar al envío');
    } finally {
      await stop(own.server);
    }
  });

  test('honeypot vacío no afecta un envío normal', async () => {
    const r = await post(ctx.url, form({ website: '' }));
    assert.equal(r.status, 200);
    assert.equal(r.json.dryRun, true);
  });
});

describe('rate limit', () => {
  let ctx;
  before(async () => {
    ctx = await start();
  });
  after(() => stop(ctx.server));
  beforeEach(() => ctx.app.locals.contactLimiter.reset());

  test(`el envío ${RATE_LIMIT.max + 1} en la ventana → 429 con Retry-After`, async () => {
    for (let i = 0; i < RATE_LIMIT.max; i++) {
      const r = await post(ctx.url, form());
      assert.equal(r.status, 200, `envío ${i + 1}`);
    }
    const res = await fetch(ctx.url, { method: 'POST', body: form() });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal((await res.json()).error, 'too many requests');
  });

  test('reset() vuelve a permitir envíos', async () => {
    const r = await post(ctx.url, form());
    assert.equal(r.status, 200);
  });

  test('la ventana es configurable y expira', async () => {
    const own = await start({ rateLimit: { max: 1, windowMs: 100 } });
    try {
      assert.equal((await post(own.url, form())).status, 200);
      assert.equal((await post(own.url, form())).status, 429);
      await new Promise((r) => setTimeout(r, 150));
      assert.equal((await post(own.url, form())).status, 200);
    } finally {
      await stop(own.server);
    }
  });
});

describe('Render sin mailer', () => {
  test('RENDER=true sin RESEND ni SMTP → 503 mailer not configured, y el health lo dice', async () => {
    const ctx = await start({ env: { RENDER: 'true' } });
    try {
      const r = await post(ctx.url, form());
      assert.equal(r.status, 503);
      assert.equal(r.json.error, 'mailer not configured');
      const health = await (await fetch(ctx.url.replace('/contact', '/health'))).json();
      assert.equal(health.mailer, 'unconfigured');
    } finally {
      await stop(ctx.server);
    }
  });
});
