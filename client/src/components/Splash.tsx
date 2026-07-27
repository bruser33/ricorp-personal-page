import { useEffect, useState } from 'react';
import './Splash.css';

const BASE = import.meta.env.BASE_URL;

// Intro choreography: logo fades in centered, holds, then travels up to the
// header slot; once it lands the site is revealed underneath (the header logo
// sits at the exact same spot, so the handoff is seamless) and the dark
// backdrop fades out.
const LOGO_IN_AT = 150;
const TRAVEL_AT = 1250;
const REVEAL_AT = 2150; // logo has arrived at the header → show site + fade backdrop
const REMOVE_AT = 2750;

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
