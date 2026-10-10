import { useEffect, useState } from 'react';
import './Nav.css';

interface Props { name: string | null; whatsapp: string | null; scrolled: boolean }

// Nav fija: logo, EL LOCAL · SERVICIOS · VISÍTANOS, Reservar (WhatsApp) y hamburguesa en layout compacto.
export default function Nav({ name, whatsapp, scrolled }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const close = () => setOpen(false);
  return (
    <header className={`nav${open ? ' is-open' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      {name && <a className="nav__logo" href="#hero" data-field="name">{name}</a>}
      <nav className="nav__menu" aria-label="Principal">
        <ul className="nav-links" id="nav-links">
          <li><a href="#reyes" onClick={close}>EL LOCAL</a></li>
          <li><a href="#servicios" onClick={close}>SERVICIOS</a></li>
          <li><a href="#llega" onClick={close}>VISÍTANOS</a></li>
        </ul>
        {whatsapp && <a className="btn btn--primary nav-cta" data-cta="whatsapp" href={whatsapp} target="_blank" rel="noopener">Reservar</a>}
      </nav>
      <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="nav-links" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(!open)}><span></span></button>
    </header>
  );
}
