import type { ReactNode } from 'react';
import type { User } from '../api';

// Marco de las páginas de la agenda: header con la marca (vuelve a la landing), Reservar, Mis citas y la cuenta.
export default function Shell({ user, current, children }: { user: User | null; current: 'reservar' | 'cita' | 'cuenta' | 'mis-citas'; children: ReactNode }) {
  const link = (href: string, label: string, key: string) => (
    <a href={href} aria-current={current === key ? 'page' : undefined}>{label}</a>
  );
  return (
    <div className="ag">
      <a className="ag-skip" href="#ag-main">Saltar al contenido</a>
      <header className="ag-header">
        <a className="ag-brand" href="/wstyle/">WS STYLE</a>
        <nav aria-label="Agenda" className="ag-nav">
          {link('/wstyle/reservar/', 'Reservar', 'reservar')}
          {user && link('/wstyle/cuenta/mis-citas/', 'Mis citas', 'mis-citas')}
          {link('/wstyle/cuenta/', user ? user.name.split(' ')[0] || 'Mi cuenta' : 'Entrar', 'cuenta')}
        </nav>
      </header>
      <main id="ag-main" className="ag-main">{children}</main>
      <footer className="ag-footer"><a href="/wstyle/">← Volver a WS Style</a></footer>
    </div>
  );
}
