/* Doble del BORDE HTTP de la WhatsApp Cloud API de Meta (SPEC-53): implementa `fetch` para
   POST /{version}/{phone-number-id}/messages y registra cada llamada. La BD sigue siendo real;
   esto reemplaza solo al servicio externo. Las firmas del webhook se calculan con el mismo
   algoritmo que documenta Meta (HMAC-SHA256 del cuerpo crudo con el app secret). */
import crypto from 'node:crypto';

export const WA_ENV = {
  WHATSAPP_TOKEN: 'EAAG-token-de-prueba-no-mostrar',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '999000111',
  WHATSAPP_APP_SECRET: 'app-secret-de-prueba-no-mostrar',
  WHATSAPP_VERIFY_TOKEN: 'verify-de-prueba',
};

export const signBody = (raw, secret = WA_ENV.WHATSAPP_APP_SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

export function fakeWhatsApp() {
  const calls = [];
  /* Respuestas en cola: { status, body } o 'network'. Vacía → 200 con un id nuevo. */
  const queue = [];
  let seq = 0;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method || 'GET', host: u.host, path: u.pathname, headers, body });
    /* Una vuelta del event loop: deja que otro despachador en paralelo intente tomar el mismo mensaje. */
    await new Promise((r) => setImmediate(r));
    const next = queue.shift();
    if (next === 'network') throw new TypeError('fetch failed');
    if (next) return json(next.status, next.body);
    if (headers.authorization !== `Bearer ${WA_ENV.WHATSAPP_TOKEN}`) return json(401, { error: { message: 'Invalid OAuth access token', code: 190 } });
    return json(200, { messaging_product: 'whatsapp', contacts: [{ input: body?.to, wa_id: body?.to }], messages: [{ id: `wamid.TEST${++seq}` }] });
  }

  const err = (status, code, message = 'error') => ({ status, body: { error: { message, type: 'OAuthException', code } } });
  return { fetchImpl, calls, queue, err };
}
