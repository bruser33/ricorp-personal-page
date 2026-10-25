/* Adaptador de Mercado Pago Checkout Pro (SPEC-35). Solo HTTP: la lógica de qué hacer
   con un pago vive en domain/payments.js.

   - `fetchImpl` se inyecta: los tests simulan el BORDE HTTP de Mercado Pago (nunca la BD).
   - El access token solo viaja en el header Authorization: no se loguea ni entra en los
     mensajes de error (RN-11).
   - `baseUrl` (env MP_API_BASE) existe solo para apuntar a un doble local en pruebas
     manuales; en producción y sandbox es https://api.mercadopago.com. */
import crypto from 'node:crypto';

export const MP_API = 'https://api.mercadopago.com';

export class MpError extends Error {
  constructor(status, message, code = 'mp_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* Modo según el prefijo del token: TEST- = credenciales de prueba; APP_USR- = producción. */
export const mpMode = (token) => (!token ? null : String(token).startsWith('TEST-') ? 'sandbox' : 'production');

export function createMercadoPagoClient({ accessToken, fetchImpl = fetch, baseUrl = MP_API, timeoutMs = 10_000 }) {
  const base = String(baseUrl || MP_API).replace(/\/$/, '');

  async function call(method, path, { body, idempotencyKey } = {}) {
    if (!accessToken) throw new MpError(503, 'Mercado Pago no está configurado', 'payments_not_configured');
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new MpError(0, `Mercado Pago no respondió (${err?.name === 'TimeoutError' ? 'timeout' : 'red'})`, 'mp_unreachable');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      /* Solo el mensaje público de Mercado Pago (p.ej. "insufficient_amount"), nunca los headers. */
      const detail = String(data?.message || data?.error || `HTTP ${res.status}`).slice(0, 200);
      throw new MpError(res.status, detail, data?.error ? String(data.error) : 'mp_error');
    }
    return data ?? {};
  }

  return {
    configured: Boolean(accessToken),
    mode: mpMode(accessToken),
    createPreference: (preference, { idempotencyKey }) => call('POST', '/checkout/preferences', { body: preference, idempotencyKey }),
    getPayment: (id) => call('GET', `/v1/payments/${encodeURIComponent(String(id))}`),
    searchPayments: async (externalReference) => {
      const q = new URLSearchParams({ external_reference: String(externalReference), sort: 'date_created', criteria: 'asc', limit: '50' });
      const r = await call('GET', `/v1/payments/search?${q}`);
      return Array.isArray(r.results) ? r.results : [];
    },
    /* Reembolso total: sin `amount` en el cuerpo. La clave de idempotencia es estable por
       pago, así un reintento después de un timeout no devuelve dos veces. */
    refund: (paymentId, { idempotencyKey }) => call('POST', `/v1/payments/${encodeURIComponent(String(paymentId))}/refunds`, { body: {}, idempotencyKey }),
  };
}

/* ─── Firma del webhook (x-signature)
   Header: `ts=<ts>,v1=<hmac>`. Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
   (data.id del query string, en minúsculas si es alfanumérico; se omiten las partes
   ausentes). HMAC-SHA256 hex con la clave secreta del webhook. */
export const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

export function parseSignature(header) {
  const out = {};
  for (const part of String(header || '').split(',')) {
    const [k, ...rest] = part.split('=');
    if (!k || !rest.length) continue;
    out[k.trim()] = rest.join('=').trim();
  }
  return { ts: out.ts || null, v1: out.v1 || null };
}

export function signatureManifest({ dataId, requestId, ts }) {
  let m = '';
  if (dataId) m += `id:${/[a-z]/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId)};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}

export function signManifest(secret, manifest) {
  return crypto.createHmac('sha256', String(secret)).update(manifest).digest('hex');
}

/* `ts` puede venir en segundos o en milisegundos según la versión del panel: se acepta ambos. */
export const tsToMs = (ts) => {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
};

export function verifySignature({ secret, header, requestId, dataId, now = Date.now(), maxAgeMs = SIGNATURE_MAX_AGE_MS }) {
  if (!secret) return { ok: false, reason: 'no_secret' };
  const { ts, v1 } = parseSignature(header);
  if (!ts || !v1) return { ok: false, reason: 'missing' };
  const tsMs = tsToMs(ts);
  if (tsMs === null || Math.abs(now - tsMs) > maxAgeMs) return { ok: false, reason: 'stale' };
  const expected = Buffer.from(signManifest(secret, signatureManifest({ dataId, requestId, ts })), 'hex');
  const given = /^[a-f0-9]+$/i.test(v1) ? Buffer.from(v1, 'hex') : Buffer.alloc(0);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}
