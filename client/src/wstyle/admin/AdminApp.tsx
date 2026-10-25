import { useEffect, useState } from 'react';
import { ApiError } from '../agenda/api';
import AuthPanel, { type FacebookReturn } from '../agenda/components/AuthPanel';
import { Spinner } from '../agenda/components/ui';
import { useSession } from '../agenda/session';
import { admin } from './api';
import AdminShell from './components/AdminShell';
import { LoadError } from './components/common';
import AppointmentsPage from './pages/AppointmentsPage';
import AuditPage from './pages/AuditPage';
import BarbersPage from './pages/BarbersPage';
import HomePage from './pages/HomePage';
import SchedulePage from './pages/SchedulePage';
import ServicesPage from './pages/ServicesPage';
import SettingsPage from './pages/SettingsPage';
import StatsPage from './pages/StatsPage';
import { SECTIONS, sectionFromPath } from './util';

// Panel del super admin (SPEC-34): /wstyle/admin/ y sus secciones, cada una una carpeta real en dist/ con su
// index.html (recargar funciona en Pages y en vite preview). El enrutado es por location.pathname.
export default function AdminApp({ fbReturn }: { fbReturn: FacebookReturn | null }) {
  const session = useSession();
  const section = sectionFromPath(location.pathname);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusErr, setStatusErr] = useState<ApiError | null>(null);
  const [unread, setUnread] = useState(0);
  const user = session.user;
  const isAdmin = Boolean(user?.roles.includes('superadmin'));

  const loadStatus = () => {
    setStatusErr(null);
    admin.status().then((s) => setConfigured(s.configured), (e) => setStatusErr(e instanceof ApiError ? e : new ApiError(0, 'network', 'Sin conexión')));
  };
  useEffect(() => {
    let alive = true;
    admin.status().then((s) => { if (alive) setConfigured(s.configured); }, (e) => { if (alive) setStatusErr(e instanceof ApiError ? e : new ApiError(0, 'network', 'Sin conexión')); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    admin.notifications().then((n) => { if (alive) setUnread(n.unread); }, () => {});
    return () => { alive = false; };
  }, [isAdmin]);
  useEffect(() => {
    const label = SECTIONS.find((s) => s.key === section)?.label ?? 'Panel';
    document.title = `${label} · Panel WS Style`;
  }, [section]);

  const logout = async () => { await session.logout(); };

  // CB-07: la API no responde → error reintentable (nunca pantalla en blanco).
  if (statusErr || session.status === 'offline') {
    return <AdminShell section="entrar" nav={false}><LoadError error={statusErr ?? new ApiError(0, 'network', 'Sin conexión')} onRetry={() => { loadStatus(); session.refresh(); }} /></AdminShell>;
  }
  if (configured === null || session.status === 'loading') return <AdminShell section="entrar" nav={false}><Spinner label="Cargando el panel…" /></AdminShell>;

  // CB-01: sin super admin en el server.
  if (!configured) {
    return (
      <AdminShell section="entrar" nav={false}>
        <h1 className="ag-h1">Panel no configurado</h1>
        <div className="ag-card ag-narrow" data-state="unconfigured">
          <p>Todavía no hay una cuenta de administrador. Para crearla:</p>
          <ol className="adm-steps">
            <li>En <code>server/.env</code> define <code>SUPERADMIN_EMAIL</code> y <code>SUPERADMIN_PASSWORD</code> (mínimo 8 caracteres, con letras y números).</li>
            <li>Reinicia la API (o corre <code>npm run seed:admin</code> en <code>server/</code>).</li>
            <li>Vuelve a esta página y entra con ese correo y contraseña.</li>
          </ol>
        </div>
      </AdminShell>
    );
  }

  if (!user) {
    return (
      <AdminShell section="entrar" nav={false}>
        <h1 className="ag-h1">Panel de WS Style</h1>
        <div className="ag-card ag-narrow">
          <AuthPanel facebook={false} returnTo={location.pathname} fbReturn={fbReturn} title="Entrar al panel" onAuthed={(u) => session.setUser(u)} />
        </div>
      </AdminShell>
    );
  }

  if (!isAdmin) {
    return (
      <AdminShell section="entrar" nav={false} userLabel={user.email ?? user.name} onLogout={logout}>
        <h1 className="ag-h1">Sin acceso</h1>
        <div className="ag-card ag-narrow" data-state="forbidden">
          <p>La cuenta <strong>{user.email}</strong> no es de administrador.</p>
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" onClick={logout}>Entrar con otra cuenta</button>
            <a className="btn btn--ghost" href="/wstyle/">Ir a WS Style</a>
          </div>
        </div>
      </AdminShell>
    );
  }

  const page = {
    inicio: <HomePage onUnread={setUnread} />,
    barberos: <BarbersPage />,
    citas: <AppointmentsPage />,
    carta: <ServicesPage />,
    horario: <SchedulePage />,
    estadisticas: <StatsPage />,
    configuracion: <SettingsPage user={user} />,
    auditoria: <AuditPage />,
  }[section];

  return <AdminShell section={section} unread={unread} userLabel={user.email ?? user.name} onLogout={logout}>{page}</AdminShell>;
}
