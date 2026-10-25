import { useCallback, useEffect, useState } from 'react';
import { ApiError, auth, type User } from './api';

export type SessionStatus = 'loading' | 'ready' | 'offline';

// Sesión del cliente (cookie httpOnly; el front solo pregunta /api/auth/me). 401 = sin sesión, no es un error.
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [facebook, setFacebook] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [me, cfg] = await Promise.all([
        auth.me().catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
        auth.config().catch(() => ({ facebook: false })),
      ]);
      setUser(me);
      setFacebook(cfg.facebook);
      setStatus('ready');
      return me;
    } catch {
      setStatus('offline');
      return null;
    }
  }, []);
  useEffect(() => {
    let alive = true;
    // La primera lectura va en un microtask para no hacer setState sincrónico dentro del efecto.
    Promise.resolve().then(() => { if (alive) refresh(); });
    return () => { alive = false; };
  }, [refresh]);
  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setUser(null);
  }, []);
  return { user, setUser, status, facebook, refresh, logout };
}

/* Lee y limpia de la URL los parámetros con que vuelve el inicio con Facebook (?fb=…&t=…&email=…). */
export function takeFacebookParams(): { fb: string; t: string | null; email: string | null; name?: string | null } | null {
  const url = new URL(location.href);
  const fb = url.searchParams.get('fb');
  if (!fb) return null;
  // name: lo manda el registro de barbero cuando Facebook no entregó el correo (SPEC-33 CB-13).
  const out = { fb, t: url.searchParams.get('t'), email: url.searchParams.get('email'), name: url.searchParams.get('name') };
  for (const k of ['fb', 't', 'email', 'name']) url.searchParams.delete(k);
  history.replaceState(history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
  return out;
}
