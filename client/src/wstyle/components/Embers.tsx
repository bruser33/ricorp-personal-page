import { useEffect, useRef } from 'react';
import { createEmbers, emberDensity } from '../fx/embers';
import { isCompact } from '../experience';

// SPEC-49: brasas a pantalla completa durante todo el recorrido (estilos en HeroFire.css). La densidad sigue a la
// sección que ocupa el centro de la pantalla (plena en el hero, mínima en las tomas, sube en "Tu trono"); en el hero
// nacen alrededor del retrato. ≤ 60 en compacto, ≤ 160 en desktop. Con movimiento reducido no se anima nada.
export default function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const compact = isCompact();
    const embers = createEmbers(cv, { max: compact ? 60 : 160 });
    const update = () => {
      const mid = innerHeight / 2;
      const sec = [...document.querySelectorAll<HTMLElement>('main > section[id]')].find((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= mid && r.bottom > mid;
      });
      const id = sec?.id ?? null, d = emberDensity(id);
      embers.setDensity(d);
      cv.dataset.density = String(d);
      const pic = document.querySelector<HTMLElement>('.hero-portrait');
      if (id === 'hero' && pic) embers.setSource((pic.offsetLeft + pic.offsetWidth / 2) / innerWidth, compact ? .55 : .3);
      else embers.setSource(.5, .8);
    };
    const resize = () => { embers.resize(innerWidth, innerHeight); update(); };
    resize();
    embers.start();
    // Sondeo liviano (no por frame): la sección activa cambia como mucho unas veces por segundo.
    const poll = embers.running ? setInterval(update, 300) : 0;
    addEventListener('resize', resize);
    return () => { clearInterval(poll); removeEventListener('resize', resize); embers.dispose(); };
  }, []);

  return <canvas className="embers" ref={ref} aria-hidden="true" />;
}
