/* Login con Google (SPEC-38 RN-22…RN-27): OAuth 2.0 Authorization Code + OpenID Connect
   EN EL SERVER, igual que Facebook. El secreto (GOOGLE_CLIENT_SECRET) solo vive acá.

   Validación del id_token: se recibe DIRECTO del token endpoint de Google por TLS, en una
   llamada autenticada con el secreto. OIDC Core 3.1.3.7 (punto 6) permite en ese caso usar la
   validación TLS del emisor en vez de verificar la firma, así que no se descargan las llaves
   JWKS. Sí se validan iss, aud, exp, sub, nonce y email_verified.

   `fetchImpl` es el borde HTTP con Google: los tests lo reemplazan por un token endpoint
   simulado (la BD sigue siendo real). */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/* code: 'google_invalid' | 'google_unverified' → la persona ve "No se completó" (gg=error);
   'google_error' → problema de Google o de red (gg=no_disponible). */
const fail = (code, message) => Object.assign(new Error(`google: ${message}`), { code });

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw fail('google_invalid', 'id_token mal formado');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw fail('google_invalid', 'id_token ilegible');
  }
}

export function createGoogleClient({ clientId, clientSecret, redirectUri, fetchImpl = fetch } = {}) {
  const enabled = Boolean(clientId && clientSecret && redirectUri);

  function authorizeUrl(state, nonce) {
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${q}`;
  }

  /* code → id_token validado → { id (sub), email, name }. */
  async function profileFromCode(code, { nonce, now = Date.now() } = {}) {
    let res;
    let body;
    try {
      res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      throw fail('google_error', `sin respuesta del token endpoint (${err.message})`);
    }
    /* invalid_grant = código vencido/reusado o manipulado: es un "no se completó", no una caída. */
    if (!res.ok || body.error) throw fail(body.error === 'invalid_grant' ? 'google_invalid' : 'google_error', body.error_description || body.error || `HTTP ${res.status}`);
    if (!body.id_token) throw fail('google_error', 'sin id_token');
    const t = decodeJwtPayload(body.id_token);
    if (!ISSUERS.includes(t.iss)) throw fail('google_invalid', 'iss inválido');
    const aud = Array.isArray(t.aud) ? t.aud : [t.aud];
    if (!aud.includes(clientId)) throw fail('google_invalid', 'aud inválido');
    if (!(Number(t.exp) * 1000 > now)) throw fail('google_invalid', 'id_token vencido');
    if (!t.sub) throw fail('google_invalid', 'sin sub');
    if (!nonce || t.nonce !== nonce) throw fail('google_invalid', 'nonce inválido');
    if (!t.email) throw fail('google_unverified', 'sin email');
    if (t.email_verified !== true && t.email_verified !== 'true') throw fail('google_unverified', 'email no verificado');
    return { id: String(t.sub), email: String(t.email).toLowerCase(), name: t.name ? String(t.name) : '' };
  }

  return { enabled, authorizeUrl, profileFromCode };
}
