import { useState, type ReactNode } from 'react';
import NotificationsSheet from './NotificationsSheet';

export type ProTab = 'hoy' | 'agenda' | 'pagos' | 'perfil' | 'registro' | 'entrar';

// Marco del panel: marca, pestañas (Hoy · Agenda · Pagos · Perfil) y la campana con las no leídas (RN-16). En móvil las
// pestañas van en una barra fija abajo, al alcance del pulgar.
export default function ProShell({ tab, children, operative = false, unread = 0, onUnreadChange, onOpenAppointment }: {
  tab: ProTab;
  children: ReactNode;
  operative?: boolean;
  unread?: number;
  onUnreadChange?: (n: number) => void;
  onOpenAppointment?: (id: string) => void;
}) {
  const [bell, setBell] = useState(false);
  const link = (href: string, label: string, key: ProTab, icon: ReactNode) => (
    <a href={href} aria-current={tab === key ? 'page' : undefined}>{icon}<span>{label}</span></a>
  );
  return (
    <div className="ag pro">
      <a className="ag-skip" href="#ag-main">Saltar al contenido</a>
      <header className="ag-header pro-header">
        <a className="ag-brand" href="/wstyle/">WS STYLE <span className="pro-brand-tag">PRO</span></a>
        {operative && (
          <nav aria-label="Panel" className="pro-tabs">
            {link('/wstyle/pro/', 'Hoy', 'hoy', <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" /></svg>)}
            {link('/wstyle/pro/agenda/', 'Agenda', 'agenda', <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" /></svg>)}
            {link('/wstyle/pro/pagos/', 'Pagos', 'pagos', <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 10h18M7 14.5h4" stroke="currentColor" strokeWidth="1.6" /></svg>)}
            {link('/wstyle/pro/perfil/', 'Perfil', 'perfil', <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></svg>)}
          </nav>
        )}
        {onUnreadChange && (
          <button type="button" className="pro-bell" onClick={() => setBell(true)} aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>
            {unread > 0 && <span className="pro-bell__n" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
          </button>
        )}
      </header>
      <main id="ag-main" className="ag-main pro-main">{children}</main>
      <footer className="ag-footer"><a href="/wstyle/">← Volver a WS Style</a></footer>
      {bell && onUnreadChange && (
        <NotificationsSheet onClose={() => setBell(false)} onRead={() => onUnreadChange(0)}
          onOpenAppointment={onOpenAppointment ? (id) => { setBell(false); onOpenAppointment(id); } : undefined} />
      )}
    </div>
  );
}
