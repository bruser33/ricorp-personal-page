/* Doble del BORDE HTTP de Mercado Pago (SPEC-35): implementa `fetch` para las rutas que usa
   el adaptador (preferencias, pagos, búsqueda y reembolsos) y registra cada llamada. La BD
   sigue siendo real; esto reemplaza solo al servicio externo. Las firmas de los webhooks se
   calculan acá con el mismo algoritmo que documenta Mercado Pago. */
import { signManifest, signatureManifest } from '../src/lib/mercadopago.js';

export const MP_TOKEN = 'TEST-1234567890-token-de-prueba-no-mostrar';
export const MP_SECRET = 'whsec-prueba-no-mostrar';
export const MP_ENV = {
  MP_ACCESS_TOKEN: MP_TOKEN,
  MP_WEBHOOK_SECRET: MP_SECRET,
  PUBLIC_SITE_URL: 'https://ricorp.test',
  API_PUBLIC_URL: 'https://api.ricorp.test',
};

export function fakeMercadoPago() {
  const calls = [];
  const payments = new Map();
  const state = { failPreference: null, failRefund: null, failGet: null, prefSeq: 0, refundSeq: 0 };

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers, body });
    if (headers.authorization !== `Bearer ${MP_TOKEN}`) return json(401, { message: 'invalid access token', error: 'unauthorized' });

    if (method === 'POST' && u.pathname === '/checkout/preferences') {
      if (state.failPreference) return json(state.failPreference, { message: 'internal error', error: 'internal_error' });
      const id = `pref-${++state.prefSeq}`;
      return json(201, { id, init_point: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${id}`, sandbox_init_point: `https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=${id}` });
    }
    if (method === 'GET' && u.pathname === '/v1/payments/search') {
      const ref = u.searchParams.get('external_reference');
      return json(200, { results: [...payments.values()].filter((p) => p.external_reference === ref), paging: { total: 0 } });
    }
    let m = u.pathname.match(/^\/v1\/payments\/([^/]+)$/);
    if (method === 'GET' && m) {
      if (state.failGet) return json(state.failGet, { message: 'internal error' });
      const p = payments.get(decodeURIComponent(m[1]));
      return p ? json(200, p) : json(404, { message: 'Payment not found', error: 'not_found' });
    }
    m = u.pathname.match(/^\/v1\/payments\/([^/]+)\/refunds$/);
    if (method === 'POST' && m) {
      if (state.failRefund) return json(400, { message: state.failRefund, error: 'bad_request' });
      const p = payments.get(decodeURIComponent(m[1]));
      if (!p) return json(404, { message: 'Payment not found' });
      p.status = 'refunded';
      return json(201, { id: ++state.refundSeq, payment_id: p.id, amount: p.transaction_amount, status: 'approved' });
    }
    return json(404, { message: 'not found' });
  }

  /* Registra (o actualiza) un pago en "Mercado Pago". */
  /* `fee` (SPEC-37): comisión de Mercado Pago en CLP → fee_details + neto recibido, como los devuelve el API. */
  function pay(appointmentId, { id = String(Math.floor(Math.random() * 1e10)), status = 'approved', amount, currency = 'CLP', fee } = {}) {
    const p = { id: Number(id), status, status_detail: status === 'approved' ? 'accredited' : status, external_reference: String(appointmentId), transaction_amount: amount, currency_id: currency, date_created: new Date().toISOString(), payment_type_id: 'credit_card' };
    if (fee !== undefined) {
      p.fee_details = [{ type: 'mercadopago_fee', amount: fee, fee_payer: 'collector' }];
      p.transaction_details = { net_received_amount: amount - fee, total_paid_amount: amount };
    }
    payments.set(String(id), p);
    return p;
  }

  return { fetch: fetchImpl, calls, payments, state, pay, callsTo: (method, re) => calls.filter((c) => c.method === method && re.test(c.path)) };
}

/* Firma un webhook como lo haría Mercado Pago. `over` permite alterar partes para los casos borde. */
export function signedHeaders({ dataId, secret = MP_SECRET, ts = String(Date.now()), requestId = `req-${Math.random().toString(36).slice(2)}`, signId = dataId } = {}) {
  const v1 = signManifest(secret, signatureManifest({ dataId: signId, requestId, ts }));
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

export async function sendWebhook(base, { dataId, type = 'payment', headers }) {
  const res = await fetch(`${base}/api/payments/mp/webhook?data.id=${encodeURIComponent(dataId)}&type=${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? signedHeaders({ dataId })) },
    body: JSON.stringify({ action: 'payment.updated', api_version: 'v1', type, data: { id: String(dataId) }, live_mode: false }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* sin JSON */
  }
  return { status: res.status, json: body };
}
