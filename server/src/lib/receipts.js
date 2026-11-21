/* Comprobantes de la seña por transferencia (SPEC-56 §10). NUNCA en Mongo: en la BD solo van
   los metadatos (clave, tipo, tamaño, hash). Dos drivers:
   - fs: disco local (desarrollo y tests), en RECEIPTS_DIR (por defecto server/uploads/receipts).
   - s3: almacenamiento de objetos compatible con S3, bucket PRIVADO. Sirve cualquier proveedor
     S3: Backblaze B2 (gratis sin tarjeta), Cloudflare R2, AWS S3, o SeaweedFS en CI. Cambiar de
     proveedor = cambiar las variables S3_* (ver docs/almacenamiento-comprobantes.md).
     Firma SigV4 a mano con fetch: sin SDK extra para tres operaciones (PUT/GET/DELETE).
   El tipo se valida por CONTENIDO (firma de bytes + decodificación), no por la extensión. */
import crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sniffImage } from './photos.js';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MAX_SIDE = 1600;
const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/receipts');

/* 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf' | null según los primeros bytes. */
export function sniffReceipt(buf) {
  if (!buf || buf.length < 12) return null;
  const img = sniffImage(buf);
  if (img) return img;
  /* HEIC/HEIF de iPhone: caja ISO-BMFF `ftyp` con una marca de imagen. */
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

const bad = (code, message) => Object.assign(new Error(message), { code });

/* Buffer original → { body, contentType, ext }. Imágenes → WebP de máx. 1600 px (sin EXIF ni
   metadatos); PDF tal cual (si está completo). Lanza { code } con un mensaje para el cliente. */
export async function normalizeReceipt(buf) {
  if (!buf?.length) throw bad('empty_file', 'El archivo está vacío.');
  if (buf.length > MAX_RECEIPT_BYTES) throw bad('file_too_large', 'El archivo pesa más de 5 MB. Sube una captura o un PDF más liviano.');
  const kind = sniffReceipt(buf);
  if (!kind) throw bad('invalid_file', 'Ese archivo no es una imagen ni un PDF. Sube una captura, una foto o el PDF de la transferencia.');
  if (kind === 'pdf') {
    /* Un PDF completo termina con %%EOF (se tolera basura/espacios al final). */
    if (!buf.subarray(Math.max(0, buf.length - 1024)).toString('latin1').includes('%%EOF')) throw bad('invalid_file', 'El PDF está incompleto o dañado. Descárgalo de nuevo desde tu banco.');
    return { body: buf, contentType: 'application/pdf', ext: 'pdf', kind };
  }
  try {
    const body = await sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .resize(RECEIPT_MAX_SIDE, RECEIPT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { body, contentType: 'image/webp', ext: 'webp', kind };
  } catch {
    /* Asunción 9: si el sharp del server no trae HEIC, se pide JPG o PDF con un mensaje claro. */
    if (kind === 'heic') throw bad('heic_unsupported', 'No pudimos leer la foto del iPhone (HEIC). Sube una captura de pantalla o el PDF de la transferencia.');
    throw bad('invalid_file', 'La imagen está dañada. Sube otra captura o el PDF de la transferencia.');
  }
}

export const receiptKey = (now, ext) => {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
};

/* La clave la arma el server; igual se valida para que nunca salga del directorio. */
const safeKey = (key) => {
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(webp|pdf)$/.test(String(key))) throw bad('invalid_key', 'clave inválida');
  return String(key);
};

function fsDriver(dir) {
  const file = (key) => path.join(dir, safeKey(key));
  return {
    driver: 'fs',
    async put(key, body) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), body);
    },
    async get(key) {
      try {
        return await readFile(file(key));
      } catch {
        return null;
      }
    },
    async del(key) {
      await rm(file(key), { force: true });
    },
  };
}

/* ─── S3 (R2) con firma AWS SigV4. */
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

export function signS3({ method, url, body = Buffer.alloc(0), region, accessKeyId, secretAccessKey, now = Date.now(), headers = {} }) {
  const u = new URL(url);
  const amzDate = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])), host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const canonical = [method, u.pathname, u.searchParams.toString(), names.map((k) => `${k}:${all[k].trim()}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

function s3Driver({ endpoint, bucket, region, accessKeyId, secretAccessKey, fetchImpl, clock }) {
  const base = String(endpoint).replace(/\/$/, '');
  const urlOf = (key) => `${base}/${encodeURIComponent(bucket)}/${safeKey(key).split('/').map(encodeURIComponent).join('/')}`;
  const call = async (method, key, body, headers = {}) => {
    const url = urlOf(key);
    const signed = signS3({ method, url, body: body || Buffer.alloc(0), region, accessKeyId, secretAccessKey, now: clock(), headers });
    const { host: _host, ...sendHeaders } = signed;
    return fetchImpl(url, { method, headers: sendHeaders, body: body || undefined, signal: AbortSignal.timeout(20_000) });
  };
  return {
    driver: 's3',
    async put(key, body, contentType) {
      const res = await call('PUT', key, body, { 'content-type': contentType });
      if (!res.ok) throw bad('storage_failed', `S3 PUT ${res.status}`);
    },
    async get(key) {
      const res = await call('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw bad('storage_failed', `S3 GET ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async del(key) {
      const res = await call('DELETE', key);
      if (!res.ok && res.status !== 404) throw bad('storage_failed', `S3 DELETE ${res.status}`);
    },
  };
}

/* La región firma la petición (SigV4): R2 usa "auto", pero B2 y AWS rechazan una región distinta
   a la del endpoint. Con S3_REGION vacía o "auto" se deduce del endpoint conocido. */
export function inferS3Region(endpoint, region) {
  const r = String(region || '').trim();
  if (r && r.toLowerCase() !== 'auto') return r;
  let host = '';
  try {
    host = new URL(String(endpoint)).hostname;
  } catch {
    return 'auto';
  }
  const b2 = host.match(/(?:^|\.)s3\.([a-z0-9-]+)\.backblazeb2\.com$/i);
  if (b2) return b2[1];
  const aws = host.match(/(?:^|\.)s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i);
  if (aws) return aws[1];
  if (/(?:^|\.)s3\.amazonaws\.com$/i.test(host)) return 'us-east-1';
  return 'auto';
}

/* `configured` = hay un driver usable. RN-10: en producción solo cuenta el driver s3. */
export function createReceiptStore(env = {}, { fetchImpl = fetch, clock = Date.now } = {}) {
  const want = String(env.RECEIPTS_STORAGE || 'fs').toLowerCase();
  /* Render define RENDER=true: cuenta como producción aunque no haya NODE_ENV. */
  const production = env.NODE_ENV === 'production' || Boolean(env.RENDER);
  if (want === 's3') {
    const cfg = { endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, region: inferS3Region(env.S3_ENDPOINT, env.S3_REGION), accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY };
    const missing = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'].filter((k) => !cfg[k]);
    if (missing.length) return { driver: 's3', configured: false, production, reason: 'Faltan las credenciales del almacenamiento de comprobantes (S3_*).' };
    return { ...s3Driver({ ...cfg, fetchImpl, clock }), configured: true, production };
  }
  const store = fsDriver(env.RECEIPTS_DIR ? path.resolve(env.RECEIPTS_DIR) : DEFAULT_DIR);
  /* RN-10: el disco de Render es efímero → en producción el driver fs no sirve. */
  if (production) return { ...store, configured: false, production, reason: 'En producción los comprobantes necesitan almacenamiento S3 (RECEIPTS_STORAGE=s3); el disco de Render se borra al reiniciar.' };
  return { ...store, configured: true, production };
}
