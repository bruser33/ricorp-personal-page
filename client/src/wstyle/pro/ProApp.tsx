import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../agenda/api';
import AuthPanel, { type FacebookReturn } from '../agenda/components/AuthPanel';
import { Spinner, Unavailable } from '../agenda/components/ui';
import { useSession } from '../agenda/session';
import { loadContent } from '../content';
import { ctaLinks } from '../links';
import { pro, type ProMe } from './api';
import ProShell from './components/ProShell';
import ReviewState from './components/ReviewState';
import type { MeState, ProCtx } from './ctx';
import AgendaPage from './pages/AgendaPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import TodayPage from './pages/TodayPage';

// Panel del barbero (SPEC-33): /wstyle/pro/ (Hoy), /wstyle/pro/agenda/, /wstyle/pro/perfil/ y /wstyle/pro/registro/.
// Cada ruta es una carpeta real en dist/ con su index.html; el enrutado es por location.pathname.
export default function ProApp({ fbReturn }: { fbReturn: FacebookReturn | null }) {
  const session = useSession();
  const [me, setMe] = useState<ProMe | null>(null);
  const [meState, setMeState] = useState<MeState>('idle');
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const user = session.user;

  const reloadMe = useCallback(async () => {
    try {
      const m = await pro.me();
      setMe(m);
      setMeState('ready');
      return m;
    } catch (e) {
      setMe(null);
      if (e instanceof ApiError && e.status === 403) setMeState('not_barber');
      else if (e instanceof ApiError && e.status === 401) setMeState('idle');
      else setMeState('error');
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      if (!user) { setMe(null); setMeState('idle'); return; }
      setMeState('loading');
      reloadMe();
    });
    return () => { alive = false; };
  }, [user, reloadMe]);

  useEffect(() => {
    let alive = true;
    loadContent('/wstyle/').then((c) => { if (alive) setWhatsapp(ctaLinks(c.site).whatsapp); }, () => {});
    return () => { alive = false; };
  }, []);

  const ctx: ProCtx = { session, me, meState, setMe, reloadMe, fbReturn, whatsapp };
  const path = location.pathname.replace(/\/+$/, '/');
  if (path.endsWith('/wstyle/pro/registro/')) return <RegisterPage ctx={ctx} />;
  const tab = path.endsWith('/wstyle/pro/agenda/') ? 'agenda' : path.endsWith('/wstyle/pro/perfil/') ? 'perfil' : 'hoy';

  if (session.status === 'loading' || (user && (meState === 'loading' || meState === 'idle'))) return <ProShell tab="entrar"><Spinner label="Cargando tu panel…" /></ProShell>;
  if (session.status === 'offline' || meState === 'error') return <ProShell tab="entrar"><Unavailable whatsapp={whatsapp} onRetry={() => (user ? reloadMe() : session.refresh())} /></ProShell>;

  // C. Entrar (email + contraseña o Facebook, el mismo componente de la agenda).
  if (!user) {
    const here = path.endsWith('/wstyle/pro/') ? '/wstyle/pro/' : path;
    return (
      <ProShell tab="entrar">
        <h1 className="ag-h1">Panel del barbero</h1>
        <div className="ag-card ag-narrow">
          <AuthPanel facebook={session.facebook} returnTo={here} fbReturn={fbReturn} title="Entrar" onAuthed={(u) => session.setUser(u)} />
          <p className="pro-join-link">¿Eres barbero y aún no tienes cuenta? <a href="/wstyle/pro/registro/">Trabaja con nosotros</a></p>
        </div>
      </ProShell>
    );
  }

  if (meState === 'not_barber' || !me) {
    return (
      <ProShell tab="entrar">
        <h1 className="ag-h1">Panel del barbero</h1>
        <div className="ag-card ag-narrow" data-state="not-barber">
          <p>Tu cuenta <strong>{user.email}</strong> no tiene perfil de barbero.</p>
          <div className="ag-actions ag-actions--wrap">
            <a className="btn btn--primary" href="/wstyle/pro/registro/">Crear mi perfil de barbero</a>
            <a className="btn btn--ghost" href="/wstyle/cuenta/">Ir a mi cuenta</a>
          </div>
        </div>
      </ProShell>
    );
  }

  const status = me.membership.status;
  // Registro incompleto (celular/términos o aún sin enviar a revisión) → al onboarding.
  if (me.needsCompletion || (status === 'pending' && !me.membership.submittedAt && tab !== 'perfil')) {
    return (
      <ProShell tab="entrar">
        <h1 className="ag-h1">Termina tu registro</h1>
        <div className="ag-card ag-narrow">
          <p>Te falta completar tu perfil para enviarlo a revisión.</p>
          <a className="btn btn--primary" href="/wstyle/pro/registro/">Continuar</a>
        </div>
      </ProShell>
    );
  }

  if (status !== 'approved' && !(status === 'pending' && tab === 'perfil')) {
    return (
      <ProShell tab="entrar">
        <ReviewState me={me} onLogout={async () => { await session.logout(); }} />
      </ProShell>
    );
  }

  if (tab === 'perfil') return <ProfilePage ctx={ctx} />;
  if (tab === 'agenda') return <AgendaPage ctx={ctx} />;
  return <TodayPage ctx={ctx} />;
}
