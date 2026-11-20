import { useEffect, useRef, useState } from 'react';

export default function Ambience() {
  const fire = useRef<HTMLAudioElement>(null);
  const piano = useRef<HTMLAudioElement>(null);
  const mixer = useRef<{ context: AudioContext; gains: GainNode[] } | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => () => { void mixer.current?.context.close(); }, []);
  useEffect(() => {
    if (!on) return;
    const mix = mixer.current!;
    function blend() {
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, document.getElementById('hero')?.offsetHeight || innerHeight)));
      const audible = document.hidden ? 0 : 1;
      mix.gains[0].gain.setTargetAtTime((1 - progress) * .32 * audible, mix.context.currentTime, .18);
      mix.gains[1].gain.setTargetAtTime(progress * .3 * audible, mix.context.currentTime, .18);
    }
    blend();
    window.addEventListener('scroll', blend, { passive: true });
    document.addEventListener('visibilitychange', blend);
    return () => {
      window.removeEventListener('scroll', blend);
      document.removeEventListener('visibilitychange', blend);
    };
  }, [on]);

  async function toggle() {
    const tracks = [fire.current!, piano.current!];
    if (on) { tracks.forEach(track => track.pause()); setOn(false); return; }
    try {
      if (!mixer.current) {
        const context = new AudioContext();
        const gains = tracks.map(track => {
          const gain = context.createGain();
          gain.gain.value = 0;
          context.createMediaElementSource(track).connect(gain).connect(context.destination);
          return gain;
        });
        mixer.current = { context, gains };
      }
      await Promise.all([mixer.current.context.resume(), ...tracks.map(track => track.play())]);
      setOn(true);
      setError(false);
    } catch {
      tracks.forEach(track => track.pause());
      setError(true);
    }
  }
  return <>
    <audio ref={fire} src="./audio/fuego.mp3" loop preload="none" />
    <audio ref={piano} src="./audio/estudio.mp3" loop preload="none" />
    <button type="button" className="ws-sound" aria-pressed={on} onClick={toggle}>{on ? 'Silenciar' : error ? 'Reintentar sonido' : 'Activar sonido'}</button>
  </>;
}
