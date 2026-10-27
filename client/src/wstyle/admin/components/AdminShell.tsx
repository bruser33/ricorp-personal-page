import type { ReactNode } from 'react';
import { SECTIONS, type AdminSection } from '../util';

// Marco del panel del super admin: marca, secciones (en móvil, una fila deslizable bajo el header) y salir.
// /wstyle/admin/ no se enlaza desde la landing y lleva noindex (AC-12).
export default function AdminShell({ section, children, nav = true, unread = 0, userLabel, onLogout }: {
  section: AdminSection | 'entrar';
  children: ReactNode;
  nav?: boolean;
  unread?: number;
  userLabel?: string;
  onLogout?: () => void;
}) {
  return (
    <div className="ag adm">
      <a className="ag-skip" href="#ag-main">Saltar al contenido</a>
      <div className="adm-top">
      <header className="ag-header adm-header">
        <a className="ag-brand" href="/wstyle/admin/">WS STYLE <span className="pro-brand-tag">ADMIN</span></a>
        {onLogout && (
          <div className="adm-user">
            {userLabel && <span className="adm-user__name">{userLabel}</span>}
            <button type="button" className="ag-link" onClick={onLogout}>Salir</button>
          </div>
        )}
      </header>
      {nav && (
        <nav className="adm-nav" aria-label="Secciones del panel">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <a href={s.path} aria-current={section === s.key ? 'page' : undefined}>
                  {s.label}
                  {s.key === 'inicio' && unread > 0 && <span className="adm-nav__n" aria-label={`${unread} avisos sin leer`}>{unread > 9 ? '9+' : unread}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      </div>
      <main id="ag-main" className="ag-main adm-main">{children}</main>
      <footer className="ag-footer"><a href="/wstyle/">← Ver la landing de WS Style</a></footer>
    </div>
  );
}
