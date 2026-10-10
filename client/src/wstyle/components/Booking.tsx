import './Booking.css';

interface Props { booking: string | null; whatsapp: string | null }

// Capa de conversión fija (SPEC-15 AC-08, dirección "Noir de oficio"): abajo a la derecha la píldora RESERVAR
// (agenda online o WhatsApp) y el WhatsApp flotante. El badge Ricorp va abajo a la izquierda para no chocar.
export default function Booking({ booking, whatsapp }: Props) {
  return (
    <div className="dock">
      {booking && <a className="book-fab" data-cta="booking" href={booking} target="_blank" rel="noopener">Reservar</a>}
      {whatsapp && (
        <a className="wa-fab" data-cta="whatsapp-float" href={whatsapp} target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>
        </a>
      )}
    </div>
  );
}
