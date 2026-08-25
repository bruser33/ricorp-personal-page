import { useEffect, useState } from 'react';
import './Splash.css';

const BASE = import.meta.env.BASE_URL;

// Intro choreography: logo fades in centered, holds, then travels up to the
// header slot; once it lands the site is revealed underneath (the header logo
// sits at the exact same spot, so the handoff is seamless) and the dark
// backdrop fades out.
/* Tiempos medidos sobre el prototipo de Figma del clip de referencia: ahí el
   hold negro previo al hero dura 1.60s, contra los 2.15s que tardaba este
   splash. El gesto NO cambia — se comprime entero por ×0.744 (1600/2150), así
   que el fade, el hold y el viaje conservan sus proporciones. Los ms del CSS
   (Splash.css) van apareados a estas constantes: mover una sin la otra deja el
   logo aterrizando después del reveal. */
const LOGO_IN_AT = 110;
const TRAVEL_AT = 930;
const REVEAL_AT = 1600; // logo has arrived at the header → show site + fade backdrop
const REMOVE_AT = 2100;

export function Splash({ onDone }: { onDone?: () => void }) {
  const [logoIn, setLogoIn] = useState(false);
  const [toTop, setToTop] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setLogoIn(true), LOGO_IN_AT),
      window.setTimeout(() => setToTop(true), TRAVEL_AT),
      window.setTimeout(() => {
        setFadingOut(true);
        onDone?.();
      }, REVEAL_AT),
      window.setTimeout(() => setRemoved(true), REMOVE_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [onDone]);

  if (removed) return null;

  return (
    <div
      className={`splash ${fadingOut ? 'splash-out' : ''}`}
      aria-hidden="true"
      role="presentation"
    >
      <img
        src={BASE + 'ricorp-logo.svg'}
        alt=""
        className={`splash-logo ${logoIn ? 'is-in' : ''} ${toTop ? 'to-top' : ''}`}
      />
    </div>
  );
}

// Re-export timing constants for App-level coordination
export const SPLASH_TOTAL_MS = REMOVE_AT;
export const SPLASH_HOLD_END = TRAVEL_AT;
/* Cuánto sigue vivo el logo del splash DESPUÉS del reveal. Cualquier cosa que
   tenga que pasar recién cuando ese logo ya no está (en mobile: retirar el
   wordmark del header, ver Header.css) tiene que esperar al menos esto, contado
   desde el reveal. Se exporta en vez de copiarse: mover REMOVE_AT o REVEAL_AT
   acá dejaría al header apagando su logo mientras el del splash todavía está
   encima, sin que nada falle. */
export const SPLASH_OUTRO_MS = REMOVE_AT - REVEAL_AT;
