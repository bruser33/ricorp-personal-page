import { useEffect, useState } from 'react';
import './Nav.css';

interface Props { name: string | null; booking: string | null; scrolled: boolean }

const LINKS: [string, string][] = [['#reyes', 'EL LOCAL'], ['#servicios', 'SERVICIOS'], ['#llega', 'VISÍTANOS']];

// Header fijo: wordmark en mayúsculas, EL LOCAL · SERVICIOS · VISÍTANOS y RESERVAR latón. En layout compacto el
// RESERVAR del header se quita (queda el dock) y el menú es un overlay a pantalla completa con enlaces Anton
// numerados (PR #9 D7/D8), que incluye Reservar.
export default function Nav({ name, booking, scrolled }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('menu-open', open); }, [open]);
  const close = () => setOpen(false);
  const ext = booking && !booking.startsWith('tel:') ? { target: '_blank', rel: 'noopener' } : {};
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
      <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="nav-links" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(!open)}><span></span></button>
    </header>
  );
}
