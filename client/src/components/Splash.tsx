import { useEffect, useState } from 'react';
import './Splash.css';

const LOGO_FADE_IN_AT = 200;
const LOGO_HOLD_UNTIL = 1800;
const SPLASH_FADE_OUT_AT = 1800;
const SPLASH_REMOVE_AT = 2800;

export function Splash({ onDone }: { onDone?: () => void }) {
  const [logoIn, setLogoIn] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setLogoIn(true), LOGO_FADE_IN_AT);
    const t2 = window.setTimeout(() => setFadingOut(true), SPLASH_FADE_OUT_AT);
    const t3 = window.setTimeout(() => {
      setRemoved(true);
      onDone?.();
    }, SPLASH_REMOVE_AT);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone]);

  if (removed) return null;

  return (
    <div
      className={`splash ${fadingOut ? 'splash-out' : ''}`}
      aria-hidden="true"
      role="presentation"
    >
      <div className={`splash-logo ${logoIn ? 'splash-logo-in' : ''}`}>RICORP</div>
    </div>
  );
}

// Re-export timing constants for App-level coordination
export const SPLASH_TOTAL_MS = SPLASH_REMOVE_AT;
export const SPLASH_HOLD_END = LOGO_HOLD_UNTIL;
