/* Facebook Login (RN-24): OAuth 2.0 Authorization Code EN EL SERVER. El secreto
   (FB_APP_SECRET) solo vive acá; el navegador solo ve el link al diálogo de
   Facebook. `fetchImpl` es el borde HTTP con Facebook: los tests lo reemplazan por
   respuestas simuladas del Graph API (la BD sigue siendo real). */
import crypto from 'node:crypto';

const GRAPH_VERSION = 'v21.0';

export function createFacebookClient({ appId, appSecret, redirectUri, fetchImpl = fetch, graphVersion = GRAPH_VERSION } = {}) {
  const enabled = Boolean(appId && appSecret && redirectUri);

  function authorizeUrl(state) {
    const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code', scope: 'public_profile,email' });
    return `https://www.facebook.com/${graphVersion}/dialog/oauth?${q}`;
  }

  async function getJson(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const err = new Error(`facebook: ${body?.error?.message || 'HTTP ' + res.status}`);
      err.code = 'facebook_error';
      throw err;
    }
    return body;
  }

  /* code → access_token → { id, name, email? }. appsecret_proof firma la llamada al Graph. */
  async function profileFromCode(code) {
    const tokenUrl =
      `https://graph.facebook.com/${graphVersion}/oauth/access_token?` +
      new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
    const { access_token: accessToken } = await getJson(tokenUrl);
    if (!accessToken) throw Object.assign(new Error('facebook: sin access_token'), { code: 'facebook_error' });
    const proof = crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
    const me = await getJson(
      `https://graph.facebook.com/${graphVersion}/me?` + new URLSearchParams({ fields: 'id,name,email', access_token: accessToken, appsecret_proof: proof })
    );
    if (!me.id) throw Object.assign(new Error('facebook: perfil sin id'), { code: 'facebook_error' });
    return { id: String(me.id), name: me.name ? String(me.name) : '', email: me.email ? String(me.email).toLowerCase() : null };
  }

  /* signed_request de la URL de eliminación de datos que exige Meta. */
  function parseSignedRequest(signed) {
    const [sig, payload] = String(signed || '').split('.');
    if (!sig || !payload) return null;
    const expected = crypto.createHmac('sha256', appSecret).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  return { enabled, authorizeUrl, profileFromCode, parseSignedRequest };
}

/* `state` firmado (anti-CSRF): lleva la URL de retorno, un nonce que también va en
   una cookie httpOnly, y su vencimiento. */
export function signState(data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(state, secret, now = Date.now()) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}
