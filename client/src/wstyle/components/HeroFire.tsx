import { useEffect, useRef } from 'react';
import { createFire, heroFadeEnd, heroOut } from '../fx/fire';
import { isCompact } from '../experience';
import type { HeroSlide } from '../heroSlides';
import './HeroFire.css';

const SRC = `${import.meta.env.BASE_URL}wstyle/hero/`;

// SPEC-49: el dueño en el hero con fuego detrás. Dos capas fijas hermanas de la película (sin contenedor que aísle
// la mezcla): el canvas del fuego (screen sobre la película) y el retrato encima; el grano, la viñeta y el sombreado
// del texto van por encima de ambas. En el primer ~15 % del scroll (antes de "El local") el retrato baja y se funde y
// el fuego se apaga (--hero-out 0 → 1); las brasas (Embers) siguen el resto del recorrido.
// SPEC-61: las otras pantallas del inicio (tomas del recorrido) van en una capa fija bajo el fuego; al elegir una, el
// retrato se funde y entra la toma. El fuego no se toca (sigue igual en todas). Las imágenes solo se montan cuando
// se "arman" las flechas (primer hover/foco/toque), así no pesan en la carga inicial.
interface Props { name: string; slides?: HeroSlide[]; active?: string; armed?: boolean; onBroken?: (id: string) => void }
const PORTRAIT_MQ = '(max-width: 768px), (orientation: portrait)';

export default function HeroFire({ name, slides = [], active = 'barbero', armed = false, onBroken }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const portrait = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current!, cv = canvas.current!, pic = portrait.current!;
    const fire = createFire(cv, { scale: isCompact() ? .4 : .5 });
    el.classList.toggle('is-static', fire.mode === 'static');
    let inView = true, out = 0, end = 1;
    // El shader corre solo con el hero a la vista y mientras el fuego no se haya apagado (regla 4).
    const sync = () => { if (inView && out < 1) fire.start(); else fire.stop(); };
    const measure = () => {
      const local = document.getElementById('reyes');
      const max = document.documentElement.scrollHeight - innerHeight;
      const anchor = local ? local.offsetTop - (parseFloat(getComputedStyle(local).scrollMarginTop) || 0) : innerHeight;
      end = heroFadeEnd(anchor, max);
    };
    const onScroll = () => {
      out = heroOut(scrollY, end);
      el.style.setProperty('--hero-out', out.toFixed(3));
      el.classList.toggle('is-out', out >= 1);
      sync();
    };
    const resize = () => {
      fire.resize(innerWidth, innerHeight);
      // El fuego se centra en el retrato (caja sin transformar: offset*, no el rect que mueve el fundido).
      // En compacto el retrato va arriba: las llamas se ciñen más a la silueta.
      fire.setShape((pic.offsetLeft + pic.offsetWidth / 2) / innerWidth, pic.offsetWidth / innerHeight * (isCompact() ? .42 : .62),
        // Compacto: las llamas nacen a la altura de los hombros (75 % del retrato), sobre la etiqueta del bloque de
        // texto; así el fuego no queda detrás de la etiqueta latón (contraste ≥ 4.5:1, AC-02).
        isCompact() ? 1 - (pic.offsetTop + pic.offsetHeight * .75) / innerHeight : 0);
      measure(); onScroll();
    };
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); });
    const hero = document.getElementById('hero');
    if (hero) io.observe(hero);
    // El alto del documento cambia al leer los JSON: se re-mide el final del fundido.
    const ro = new ResizeObserver(() => { measure(); onScroll(); });
    ro.observe(document.body);
    resize();
    addEventListener('resize', resize);
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect(); ro.disconnect();
      removeEventListener('resize', resize); removeEventListener('scroll', onScroll);
      fire.dispose();
    };
  }, []);

  return (
    <div className={`hero-fx${active !== 'barbero' ? ' is-away' : ''}`} ref={wrap}>
      {armed && slides.length > 0 && (
        <div className="hero-slides" aria-hidden={active === 'barbero' ? 'true' : undefined}>
          {slides.map((s) => (
            <picture key={s.id} className={`hero-slide${s.id === active ? ' is-active' : ''}`} data-slide={s.id}>
              <source media={PORTRAIT_MQ} srcSet={`${import.meta.env.BASE_URL}${s.srcSm}`} />
              <img className="hero-slide__img" src={`${import.meta.env.BASE_URL}${s.src}`} alt={s.id === active ? s.alt : ''}
                decoding="async" onError={() => onBroken?.(s.id)} />
            </picture>
          ))}
        </div>
      )}
      <canvas className="hero-fire" ref={canvas} aria-hidden="true" />
      <div className="hero-portrait" ref={portrait}>
        <div className="hero-portrait__fade">
          <img className="hero-portrait__img" src={`${SRC}barbero.webp`} srcSet={`${SRC}barbero-sm.webp 640w, ${SRC}barbero.webp 1100w`}
            sizes="(max-width: 768px) 86vw, 37vw" width={1100} height={1354} decoding="async" alt={name ? `El barbero de ${name}` : 'El barbero'} />
        </div>
      </div>
    </div>
  );
}
