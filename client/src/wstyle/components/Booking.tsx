import { useEffect, useState } from 'react';
import { ext } from '../links';
import './Booking.css';

interface Props { booking: string | null; watch: unknown }

// Secciones con CTA propio (SPEC-26 regla 3): mientras alguno de estos está en pantalla la píldora se oculta.
// Solo se observan los montados (Membresía/Barberos apagados no cuentan).
const OWN_CTA = '[data-own-cta]';

// Único CTA fijo en móvil (SPEC-26): píldora RESERVAR abajo a la derecha (zona del pulgar), destino bookingLink().
// En desktop el único fijo es el RESERVAR del header (la píldora no se muestra, ver Booking.css). Sin WhatsApp
// flotante: WhatsApp/Llamar quedan como botones secundarios en Tu trono y Llega.
export default function Booking({ booking, watch }: Props) {
  const [covered, setCovered] = useState(true);
  useEffect(() => {
    const els = [...document.querySelectorAll(OWN_CTA)];
    if (!els.length) { const t = setTimeout(() => setCovered(false)); return () => clearTimeout(t); }
    const inView = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); }
      setCovered(inView.size > 0);
    });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [booking, watch]);
  // Sin agenda, WhatsApp ni teléfono no hay nada que fijar: no queda un contenedor vacío.
  if (!booking) return null;
  return (
    <div className="dock">
      <a className={`book-fab${covered ? ' is-hidden' : ''}`} data-cta="booking" href={booking} {...ext(booking)}
        aria-hidden={covered || undefined} tabIndex={covered ? -1 : undefined}>Reservar</a>
    </div>
  );
}
