/* Almacenamiento de comprobantes (SPEC-56 §10) contra un S3 REAL.
   - Región: se deduce del endpoint (B2/AWS) para que la firma SigV4 calce.
   - Ida y vuelta real: solo corre si hay un S3 de pruebas (S3_TEST_ENDPOINT). En CI y en el
     runner de Claude es SeaweedFS (software libre) en Docker; en un PC sin S3 se salta. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createReceiptStore, inferS3Region, normalizeReceipt, receiptKey, signS3 } from '../src/lib/receipts.js';

describe('región S3 según el proveedor', () => {
  test('B2 y AWS toman la región del endpoint; R2 y desconocidos quedan en auto', () => {
    assert.equal(inferS3Region('https://s3.us-east-005.backblazeb2.com', ''), 'us-east-005');
    assert.equal(inferS3Region('https://s3.us-west-004.backblazeb2.com', 'auto'), 'us-west-004');
    assert.equal(inferS3Region('https://s3.sa-east-1.amazonaws.com', undefined), 'sa-east-1');
    assert.equal(inferS3Region('https://abc123.r2.cloudflarestorage.com', 'auto'), 'auto');
    assert.equal(inferS3Region('http://localhost:8333', ''), 'auto');
    assert.equal(inferS3Region('no es url', ''), 'auto');
    assert.equal(inferS3Region('https://s3.amazonaws.com', ''), 'us-east-1');
    assert.equal(inferS3Region('https://wstyle-receipts.s3.us-east-005.backblazeb2.com', ''), 'us-east-005');
    assert.equal(inferS3Region('https://s3.us-east-005.backblazeb2.com', '  AUTO '), 'us-east-005');
  });

  test('una región explícita manda sobre la deducida', () => {
    assert.equal(inferS3Region('https://s3.us-east-005.backblazeb2.com', 'eu-central-003'), 'eu-central-003');
  });

  test('el driver firma con la región deducida del endpoint de B2', async () => {
    const calls = [];
    const store = createReceiptStore(
      { RECEIPTS_STORAGE: 's3', S3_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com', S3_BUCKET: 'wstyle-receipts', S3_REGION: 'auto', S3_ACCESS_KEY_ID: 'KEY', S3_SECRET_ACCESS_KEY: 'SECRET' },
      { fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200 }); }, clock: () => Date.parse('2026-11-21T12:00:00Z') }
    );
    await store.put('2026-11/0b9f5c1e-1111-4222-8333-444455556666.pdf', Buffer.from('%PDF-'), 'application/pdf');
    assert.equal(calls[0].url, 'https://s3.us-east-005.backblazeb2.com/wstyle-receipts/2026-11/0b9f5c1e-1111-4222-8333-444455556666.pdf');
    assert.match(calls[0].init.headers.authorization, /Credential=KEY\/20261121\/us-east-005\/s3\/aws4_request/);
  });
});

const E = process.env;
const live = E.S3_TEST_ENDPOINT
  ? { RECEIPTS_STORAGE: 's3', S3_ENDPOINT: E.S3_TEST_ENDPOINT, S3_BUCKET: E.S3_TEST_BUCKET || 'wstyle-receipts-test', S3_REGION: E.S3_TEST_REGION || 'us-east-1', S3_ACCESS_KEY_ID: E.S3_TEST_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY: E.S3_TEST_SECRET_ACCESS_KEY }
  : null;

describe('S3 real (SeaweedFS en CI)', { skip: live ? false : 'sin S3_TEST_ENDPOINT: no hay S3 de pruebas en este equipo' }, () => {
  /* Crea el bucket si no existe (PUT /<bucket>); 409 = ya existía. */
  const ensureBucket = async () => {
    const url = `${live.S3_ENDPOINT.replace(/\/$/, '')}/${live.S3_BUCKET}`;
    const { host: _h, ...headers } = signS3({ method: 'PUT', url, region: live.S3_REGION, accessKeyId: live.S3_ACCESS_KEY_ID, secretAccessKey: live.S3_SECRET_ACCESS_KEY });
    const res = await fetch(url, { method: 'PUT', headers });
    assert.ok(res.ok || res.status === 409, `crear bucket: HTTP ${res.status} ${await res.text()}`);
  };

  test('sube, lee y borra un comprobante de verdad', async () => {
    await ensureBucket();
    const store = createReceiptStore(live);
    assert.equal(store.configured, true);
    assert.equal(store.driver, 's3');
    const pdf = Buffer.from(`%PDF-1.4\n% comprobante de prueba ${crypto.randomUUID()}\n%%EOF\n`, 'latin1');
    const { body, contentType, ext } = await normalizeReceipt(pdf);
    const key = receiptKey(Date.now(), ext);
    await store.put(key, body, contentType);
    const back = await store.get(key);
    assert.ok(back, 'el comprobante subido se puede leer');
    assert.equal(crypto.createHash('sha256').update(back).digest('hex'), crypto.createHash('sha256').update(body).digest('hex'));
    await store.del(key);
    assert.equal(await store.get(key), null, 'después de borrarlo ya no existe');
  });

  test('una clave secreta incorrecta no puede subir (el S3 sí revisa la firma)', async () => {
    await ensureBucket();
    const store = createReceiptStore({ ...live, S3_SECRET_ACCESS_KEY: `${live.S3_SECRET_ACCESS_KEY}-mala` });
    const key = receiptKey(Date.now(), 'pdf');
    await assert.rejects(() => store.put(key, Buffer.from('%PDF-\n%%EOF\n'), 'application/pdf'), (e) => e.code === 'storage_failed' && /S3 PUT 403/.test(e.message));
  });

  test('el bucket es privado: sin firma no se puede leer', async () => {
    await ensureBucket();
    const store = createReceiptStore(live);
    const key = receiptKey(Date.now(), 'pdf');
    await store.put(key, Buffer.from('%PDF-1.4\n%%EOF\n'), 'application/pdf');
    const res = await fetch(`${live.S3_ENDPOINT.replace(/\/$/, '')}/${live.S3_BUCKET}/${key}`);
    assert.ok(res.status === 403 || res.status === 401, `lectura anónima debe fallar, dio ${res.status}`);
    await store.del(key);
  });
});
