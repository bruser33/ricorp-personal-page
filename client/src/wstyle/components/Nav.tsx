import { useEffect, useState } from 'react';
import { ACCOUNT_ENTRY_URL, ext as linkAttrs } from '../links';
import { useSession } from '../agenda/session';
import './Nav.css';

interface Props { name: string | null; booking: string | null; scrolled: boolean }

const LINKS: [string, string][] = [['#reyes', 'EL LOCAL'], ['#servicios', 'SERVICIOS'], ['#llega', 'VISÍTANOS']];

// Header fijo: wordmark en mayúsculas, EL LOCAL · SERVICIOS · VISÍTANOS y RESERVAR latón, que en desktop es el
// ÚNICO CTA fijo y siempre visible (SPEC-26). En layout compacto el RESERVAR del header se quita (el fijo pasa a ser
// la píldora del dock) y el menú es un overlay a pantalla completa con enlaces Anton numerados (PR #9 D7/D8), que
// incluye Reservar.
export default function Nav({ name, booking, scrolled }: Props) {
  const [open, setOpen] = useState(false);
  const { user, refresh } = useSession();
  useEffect(() => {
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    window.addEventListener('pageshow', onRestore);
    return () => window.removeEventListener('pageshow', onRestore);
  }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('menu-open', open); }, [open]);
  const close = () => setOpen(false);
  const ext = booking ? linkAttrs(booking) : {};
  return (
    <header className={`nav${open ? ' is-open' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      {name && <a className="nav__logo" href="#hero" data-field="name">{name}</a>}
      <nav className="nav__menu" aria-label="Principal">
        <ul className="nav-links" id="nav-links">
          {LINKS.map(([href, label], i) => <li key={href}><a href={href} onClick={close}><span className="nav-links__num">{String(i + 1).padStart(2, '0')}</span>{label}</a></li>)}
          {booking && <li className="nav-links__book"><a href={booking} {...ext} onClick={close}><span className="nav-links__num">{String(LINKS.length + 1).padStart(2, '0')}</span>RESERVAR</a></li>}
        </ul>
        {booking && <a className="btn btn--primary nav-cta" href={booking} {...ext}>Reservar</a>}
      </nav>
      <a className="nav__account" href={ACCOUNT_ENTRY_URL} aria-label={user ? 'Mi cuenta' : 'Entrar a WS Style'}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 21v-1.5a7.5 7.5 0 0 1 15 0V21" strokeLinecap="round" />
        </svg>
        <span>{user ? 'Mi cuenta' : 'Entrar'}</span>
      </a>
      <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="nav-links" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(!open)}><span></span></button>
    </header>
  );
}
