/* Adaptador de la WhatsApp Business Platform – Cloud API de Meta (SPEC-53). Solo HTTP: qué
   mandar y cuándo vive en domain/messaging.js.

   - API oficial con plantillas aprobadas (nada de WhatsApp Web ni librerías no oficiales).
   - `fetchImpl` se inyecta: los tests simulan el BORDE HTTP de Meta (test/wa-fake.js) y nunca
     llaman a graph.facebook.com.
   - El token solo viaja en el header Authorization: no se loguea ni entra en los errores.
   - Sin WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID, o con WHATSAPP_DRY_RUN=1, el canal queda en
     modo simulación: nada sale hacia Meta. */
import crypto from 'node:crypto';

export const GRAPH_API = 'https://graph.facebook.com';
export const DEFAULT_API_VERSION = 'v23.0';

/* Nombres de las plantillas (fijos: el código depende del nombre y del orden de sus variables). */
export const TEMPLATES = {
  confirmation: 'ws_cita_confirmada',
  reminder: 'ws_cita_recordatorio',
};

export class WaError extends Error {
  /* kind: 'transient' (se reintenta) | 'permanent' (no) | 'auth' (credenciales) | 'template' (plantilla no aprobada). */
  constructor(kind, message, { status = 0, code = null } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

/* Códigos de error de la Cloud API → tipo y motivo en español para el panel. */
const PERMANENT = {
  131026: 'el número no tiene WhatsApp',
  131021: 'el número es el mismo que envía',
  131030: 'el número no está autorizado (la cuenta de Meta está en modo prueba)',
  131045: 'el número emisor no está registrado en Meta',
  131051: 'tipo de mensaje no soportado',
  131008: 'faltan datos en el mensaje',
  131009: 'un dato del mensaje no es válido',
  100: 'un dato del mensaje no es válido',
  131047: 'pasaron más de 24 h desde la última respuesta del cliente',
  368: 'Meta bloqueó temporalmente el número emisor',
  131031: 'Meta bloqueó la cuenta de WhatsApp Business',
};
const TEMPLATE_CODES = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016, 132068, 132069]);
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);
/* 190 = token vencido o inválido; 10 / 200 = el token no tiene permiso sobre el número. */
const AUTH_CODES = new Set([190, 10, 200]);

export function classify(status, err = {}) {
  const code = Number(err.code ?? NaN);
  if (TEMPLATE_CODES.has(code)) return new WaError('template', 'plantilla no aprobada', { status, code });
  if (PERMANENT[code]) return new WaError('permanent', PERMANENT[code], { status, code });
  if (status === 401 || AUTH_CODES.has(code)) {
    return new WaError('auth', 'credenciales inválidas', { status, code });
  }
  if (status === 429 || status >= 500 || TRANSIENT_CODES.has(code)) return new WaError('transient', 'Meta no respondió', { status, code });
  return new WaError('permanent', `Meta rechazó el mensaje (${Number.isFinite(code) ? code : `HTTP ${status}`})`, { status, code });
}

/* "+56912345678" → "+569****5678" (RN-07: los logs nunca muestran el número completo). */
export const maskPhone = (p) => {
  const s = String(p || '');
  return s.length > 8 ? `${s.slice(0, 4)}****${s.slice(-4)}` : '****';
};

/* Estado del canal para el panel (sin secretos). */
export function channelStatus(env = {}) {
  const missing = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'].filter((k) => !String(env[k] || '').trim());
  const forcedDry = String(env.WHATSAPP_DRY_RUN || '') === '1';
  const webhookMissing = ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'].filter((k) => !String(env[k] || '').trim());
  if (forcedDry || missing.length === 2) return { mode: 'dry-run', missing, webhookMissing, forced: forcedDry };
  if (missing.length) return { mode: 'incomplete', missing, webhookMissing };
  return { mode: 'live', missing: [], webhookMissing };
}

export function createWhatsAppClient({ env = {}, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const token = String(env.WHATSAPP_TOKEN || '').trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const version = String(env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION).trim();
  const lang = String(env.WHATSAPP_TEMPLATE_LANG || 'es').trim();
  const appSecret = String(env.WHATSAPP_APP_SECRET || '').trim();
  const verifyToken = String(env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const status = channelStatus(env);
  const live = status.mode === 'live';

  async function post(body) {
    if (!live) throw new WaError('permanent', 'WhatsApp no está configurado');
    let res;
    try {
      res = await fetchImpl(`${GRAPH_API}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new WaError('transient', 'Meta no respondió');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw classify(res.status, data?.error || {});
    const id = data?.messages?.[0]?.id;
    if (!id) throw new WaError('transient', 'Meta no respondió');
    return { id: String(id) };
  }

  /* Plantilla con variables de cuerpo ({{1}}…) y el sufijo del botón URL dinámico. */
  function sendTemplate({ to, template, params = [], buttonSuffix = null }) {
    const components = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }];
    if (buttonSuffix) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonSuffix }] });
    return post({ to: String(to).replace(/\D/g, ''), type: 'template', template: { name: template, language: { code: lang }, components } });
  }

  /* Texto libre: solo dentro de la ventana de 24 h que abre un mensaje del cliente (respuesta automática). */
  function sendText({ to, text }) {
    return post({ to: String(to).replace(/\D/g, ''), type: 'text', text: { body: String(text).slice(0, 1000), preview_url: false } });
  }

  /* X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, cuerpo crudo). Comparación en tiempo constante. */
  function validSignature(raw, header) {
    if (!appSecret || !raw || !header) return false;
    const want = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
    const a = Buffer.from(String(header));
    const b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const validVerifyToken = (t) => Boolean(verifyToken) && typeof t === 'string' && t.length === verifyToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(verifyToken));

  return { live, dryRun: !live, status, lang, sendTemplate, sendText, validSignature, validVerifyToken };
}
