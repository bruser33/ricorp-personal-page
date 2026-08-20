import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '../i18n';
import { Footline } from './Footline';
import './Projects.css';

type Project = {
  id: number;
  title: string;
  tag: string;
  image: string;
  description: string;
  mockups?: string[];
};

const BASE = import.meta.env.BASE_URL;

const projects: Project[] = [
  {
    id: 1,
    title: 'Haru',
    tag: 'App development',
    image: BASE + 'figma-frames/image-7.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
    mockups: [BASE + 'figma-frames/project-haru-1.png', BASE + 'figma-frames/project-haru-2.png'],
  },
  {
    id: 2,
    title: 'Project 2',
    tag: 'Brand identity',
    image: BASE + 'figma-frames/image-1.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Vestibulum feugiat massa nibh justo proin dignissim purus tristique nisl. Faucibus ipsum mauris sed augue dui. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
  },
  {
    id: 3,
    title: 'Project 3',
    tag: 'Web design',
    image: BASE + 'figma-frames/image-4.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere.',
  },
  {
    id: 4,
    title: 'Project 4',
    tag: 'Illustration',
    image: BASE + 'figma-frames/image-5.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Pulvinar congue sed eu blandit fusce. Lorem vivamus elementum vitae faucibus malesuada dictum diam.',
  },
  {
    id: 5,
    title: 'Project 5',
    tag: 'Product design',
    image: BASE + 'figma-frames/image-6.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit.',
  },
  {
    id: 6,
    title: 'Project 6',
    tag: 'Editorial',
    image: BASE + 'figma-frames/news-1.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
  },
  {
    id: 7,
    title: 'Project 7',
    tag: 'Motion',
    image: BASE + 'figma-frames/news-2.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
  },
];

/* Loop visual del carrusel. La lista se repite REPEATS veces y el índice que
   manda es VIRTUAL (un entero sin acotar sobre esa tira): así el slot activo
   SIEMPRE tiene vecinos a izquierda Y derecha, incluso en el proyecto 1 — antes
   el track arrancaba en el borde y la sección se leía corrida hacia la derecha.
   Cuando el índice virtual se sale de la copia del medio se rebasa sin
   transición (ver useEffect de normalización), que es lo que hace el loop
   invisible. */
const REPEATS = 3;
const MIDDLE_COPY = 1;

/* Difuminación del caption al cambiar de card (requerimiento 6): el bloque
   título+tag se va en blur+fade, se cambia el proyecto con el caption invisible
   y vuelve a entrar. Este es el medio tiempo, no la duración total. */
const CAPTION_FADE_MS = 260;

/* El carrusel y la lista apilada son ESTRUCTURAS distintas, no un layout que se
   pueda intercambiar con CSS: el carrusel necesita la tira repetida, el track
   desplazado y los handlers de drag, y en una lista vertical el flex-basis de la
   card pasaría a ser su ALTO. Así que se decide en JS cuál se monta.
   El valor inicial sale de matchMedia y no de un efecto: montar el carrusel y
   cambiarlo en el primer efecto haría parpadear la sección en cada carga mobile. */
function useIsMobile(query = '(max-width: 720px)') {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return isMobile;
}

export function Projects() {
  const { t } = useLang();
  const total = projects.length;
  const isMobile = useIsMobile();
  // Card apilada que está en el centro de la pantalla (solo mobile).
  const [activeStack, setActiveStack] = useState(0);
  const stackRefs = useRef<(HTMLElement | null)[]>([]);
  // Índice virtual sobre la tira repetida (arranca en la copia del medio).
  const [vSlide, setVSlide] = useState(total * MIDDLE_COPY);
  const [noTransition, setNoTransition] = useState(false);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Pointer drag ("grab & move the slider" with momentum/force on release).
  const [dragging, setDragging] = useState(false);
  const [dragDX, setDragDX] = useState(0);
  const drag = useRef({ startX: 0, lastX: 0, lastT: 0, vel: 0, moved: false, pointerId: -1 });

  const currentSlide = ((vSlide % total) + total) % total;
  const loopProjects = Array.from({ length: total * REPEATS }, (_, i) => projects[i % total]);

  // Caption con un frame de retardo: el proyecto que se MUESTRA cambia recién
  // cuando el bloque ya está difuminado (requerimiento 6).
  const [shownSlide, setShownSlide] = useState(currentSlide);
  /* Derivado, no un segundo estado: "está difuminándose" ES exactamente "el
     proyecto mostrado todavía no es el activo". Con un useState aparte habría que
     encenderlo dentro del efecto y quedan dos fuentes de verdad que se pueden
     desincronizar (además de la cascada de renders que marca el lint). */
  const captionFading = shownSlide !== currentSlide;

  useEffect(() => {
    if (shownSlide === currentSlide) return;
    const id = window.setTimeout(() => setShownSlide(currentSlide), CAPTION_FADE_MS);
    return () => window.clearTimeout(id);
  }, [currentSlide, shownSlide]);

  /* ÚNICA vía de cambio del índice, y siempre expresada como delta.
     El índice no puede salirse de la tira (fuera del último slot el track se
     corre a un hueco y no queda ninguna card visible), pero tampoco se puede
     descartar el paso: seis gestos seguidos separados por menos de 900ms —
     navegación normal, no hace falta apretar nada — agotan el pasillo hacia
     atrás, y descartar ahí deja el dot activo distinto del dot clickeado.
     Así que cuando el pasillo se agota se rebasa a la copia del medio EN EL
     MISMO commit que el paso, con la transición apagada. Correr ±total es un
     no-op visual (la tira es periódica): en reposo no se ve nada, y en pleno
     movimiento termina de golpe el desplazamiento en curso y sigue desde ahí —
     el comportamiento "snappy" de cualquier carrusel, y nunca se pierde un paso.
     El rebase del useEffect de más abajo sigue siendo el camino elegante: cuando
     el usuario para, normaliza sin que se note y este atajo casi nunca corre.
     Se reserva un slot a cada punta para que el activo siempre tenga vecinos. */
  const slideRef = useRef(total * MIDDLE_COPY);

  const moveBy = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      const cur = slideRef.current;
      const next = cur + delta;
      if (next >= 1 && next <= total * REPEATS - 2) {
        slideRef.current = next;
        setVSlide(next);
        return;
      }
      /* El rebase parte de la copia del medio, así que con los deltas que llegan
         acá (±1 de teclas, ±3 del drag, ±total/2 de los dots) el resultado cae
         siempre dentro de la tira. El clamp final es para que la invariante "el
         índice nunca sale de la tira" valga por construcción y no por qué tan
         chico es el delta de cada llamador. */
      const rebased = Math.min(
        total * REPEATS - 2,
        Math.max(1, total * MIDDLE_COPY + (((cur % total) + total) % total) + delta)
      );
      setNoTransition(true);
      slideRef.current = rebased;
      setVSlide(rebased);
    },
    [total]
  );

  // goTo recibe un índice REAL de proyecto (los dots) y viaja por el camino
  // corto sobre la tira virtual.
  const goTo = useCallback(
    (i: number) => {
      const target = ((i % total) + total) % total;
      const cur = ((slideRef.current % total) + total) % total;
      let d = target - cur;
      if (d > total / 2) d -= total;
      if (d < -total / 2) d += total;
      moveBy(d);
    },
    [total, moveBy]
  );

  /* El elemento de origen llega POR PARÁMETRO. Antes se buscaba en `cardRefs`,
     que solo se llena con las cards del carrusel: en mobile las cards viven en
     `stackRefs`, así que la búsqueda daba undefined, originRect quedaba null y el
     detalle se abría creciendo desde el centro de la pantalla en vez de desde la
     card tocada. Con el elemento explícito no hay dos mapas que puedan
     desincronizarse con quién llama. */
  const openProject = useCallback((projectIndex: number, el: HTMLElement | null) => {
    setOriginRect(el ? el.getBoundingClientRect() : null);
    setExpandedSlide(projectIndex);
  }, []);

  const closeProject = useCallback(() => {
    setExpandedSlide(null);
    setOriginRect(null);
  }, []);

  const next = useCallback(() => moveBy(1), [moveBy]);
  const prev = useCallback(() => moveBy(-1), [moveBy]);

  /* Normalización del loop: al terminar el desplazamiento, si el índice virtual
     salió de la copia del medio se lo rebasa a la posición equivalente de esa
     copia. El rebase va SIN transición (noTransition) o se vería un salto de
     toda la tira. */
  useEffect(() => {
    if (vSlide >= total * MIDDLE_COPY && vSlide < total * (MIDDLE_COPY + 1)) return;
    const id = window.setTimeout(() => {
      const home = total * MIDDLE_COPY + (((slideRef.current % total) + total) % total);
      setNoTransition(true);
      slideRef.current = home;
      setVSlide(home);
    }, 900);
    return () => window.clearTimeout(id);
  }, [vSlide, total]);

  /* Reactivar la transición recién cuando el navegador ya pintó la posición
     rebasada: un solo rAF no alcanza (el estilo puede no estar comprometido
     todavía y el loop se vería como un salto animado). */
  useEffect(() => {
    if (!noTransition) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setNoTransition(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [noTransition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (expandedSlide !== null) {
        if (e.key === 'Escape') closeProject();
        return;
      }
      // Las flechas manejan el carrusel; en la lista apilada no hay qué mover.
      if (isMobile) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, expandedSlide, closeProject, isMobile]);

  /* Card "activa" de la lista apilada = la que está cruzando el centro de la
     pantalla. En el diseño es la única que muestra su título y va un poco más
     grande. Se resuelve con IntersectionObserver contra una banda fina en el
     medio del viewport (los rootMargin negativos recortan el root al 10% central)
     en vez de escuchar scroll y medir: sin listener por frame ni layout forzado. */
  useEffect(() => {
    if (!isMobile) return;
    /* El observer solo DISPARA; quién gana se decide midiendo. La banda central
       mide ~10% del alto y el gap entre cards es de 20px, así que hay un tramo
       donde dos cards la cruzan a la vez y quedarse con la primera del array
       `entries` sería arbitrario (su orden no está garantizado). Se elige la de
       centro más cercano al centro de la pantalla: determinista, y además define
       un ganador incluso cuando ninguna cruza la banda. */
    const pickNearest = () => {
      const mid = window.innerHeight / 2;
      let best = -1;
      let bestDist = Infinity;
      stackRefs.current.forEach((el, i) => {
        if (!el) return;
        const b = el.getBoundingClientRect();
        const dist = Math.abs(b.top + b.height / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      if (best >= 0) setActiveStack(best);
    };
    const io = new IntersectionObserver(pickNearest, {
      rootMargin: '-45% 0px -45% 0px',
      threshold: 0,
    });
    const els = stackRefs.current.filter(Boolean) as HTMLElement[];
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isMobile]);

  useEffect(() => {
    document.body.style.overflow = expandedSlide !== null ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [expandedSlide]);

  /* Paso del slider en px. Se MIDE del DOM en vez de recalcular "46vw + 24px":
     el ancho de card y el gap cambian por breakpoint (86vw/16px en mobile) y
     antes el drag usaba la fórmula de desktop en todos lados. offsetWidth y no
     getBoundingClientRect porque las cards laterales están escaladas y el rect
     devolvería el ancho ya reducido. */
  const stepPx = () => {
    const track = trackRef.current;
    const card = cardRefs.current[vSlide] ?? cardRefs.current[0];
    const w = card?.offsetWidth ?? window.innerWidth * 0.46;
    const gap = track ? parseFloat(getComputedStyle(track).columnGap) || 0 : 24;
    return w + gap;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (expandedSlide !== null) return;
    const d = drag.current;
    d.startX = e.clientX;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    d.vel = 0;
    d.moved = false;
    d.pointerId = e.pointerId;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const d = drag.current;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vel = (e.clientX - d.lastX) / dt; // px per ms
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    setDragDX(dx);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const d = drag.current;
    const dx = e.clientX - d.startX;
    // Momentum: project the release velocity into extra travel ("force").
    const projected = d.vel * 180;
    const rawSlides = -(dx + projected) / stepPx();
    const move = Math.max(-3, Math.min(3, Math.round(rawSlides)));
    setDragging(false);
    setDragDX(0);
    // Loop: la tira virtual se encarga de que el último conecte con el primero.
    moveBy(move);
    e.currentTarget.releasePointerCapture?.(d.pointerId);
  };

  const expanded = expandedSlide !== null ? projects[expandedSlide] : null;

  /* Abrir el detalle desde una card: teclado y puntero pasan por acá. Enter y
     Space (requerimiento 11) porque la card es un <article> con role="button",
     y ese rol no trae la activación por teclado que sí trae un <button> nativo. */
  const onCardKey = (e: React.KeyboardEvent, projectIndex: number, el: HTMLElement | null) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    openProject(projectIndex, el);
  };

  /* Lista apilada de mobile (requerimiento 9): el carrusel con vecinos recortados
     a los costados no se lee en una pantalla angosta. Acá van las 7 cards reales,
     una debajo de otra, sin tira repetida, sin dots y sin drag. */
  const stack = (
    <ul className="projects-stack">
      {projects.map((p, i) => (
        <li key={p.id}>
          <article
            ref={(el) => {
              stackRefs.current[i] = el;
            }}
            data-idx={i}
            className={`project-card stack-card${i === activeStack ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${p.title} — ${p.tag}`}
            onClick={() => openProject(i, stackRefs.current[i])}
            onKeyDown={(e) => onCardKey(e, i, stackRefs.current[i])}
          >
            <img src={p.image} alt="" draggable={false} />
            <div className="carousel-caption stack-caption">
              <h3 className="project-title">{p.title}</h3>
              <span className="project-tag-label">{p.tag}</span>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );

  const carousel = (
      <div className="projects-carousel reveal-scale">
        <div
          className={`carousel-viewport${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            ref={trackRef}
            className={`carousel-track${dragging ? ' is-dragging' : ''}${
              noTransition ? ' is-rebasing' : ''
            }`}
            style={
              {
                /* El desplazamiento lo arma el CSS a partir del ancho de card y
                   el gap del breakpoint activo (--card-w / --card-gap): así el
                   track y la card no pueden desincronizarse. El 50% es del
                   propio track, que mide lo mismo que el viewport del carrusel,
                   así que el slot activo queda centrado en pantalla. */
                ['--slide' as string]: vSlide,
                ['--drag' as string]: `${dragDX}px`,
              } as React.CSSProperties
            }
          >
            {loopProjects.map((p, i) => {
              const isActive = i === vSlide;
              /* Solo la copia del medio expone contenido a lectores de pantalla:
                 las otras dos existen únicamente para que el loop tenga vecinos. */
              const isClone = Math.floor(i / total) !== MIDDLE_COPY;
              return (
                <article
                  key={i}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className={`project-card ${isActive ? 'is-active' : 'is-side'}`}
                  onClick={() => {
                    // Suppress the click that follows a drag gesture.
                    if (drag.current.moved) {
                      drag.current.moved = false;
                      return;
                    }
                    if (isActive) openProject(i % total, cardRefs.current[i]);
                    /* goTo y no moveBy(i - slideRef.current): goTo normaliza a
                       camino corto, así que el delta queda acotado a ±total/2 en
                       vez de depender de qué tan lejos está la card clickeada en
                       la tira. Mismo resultado para las vecinas (±1), que son las
                       únicas clickeables — el overflow:hidden del viewport hace
                       que el resto no reciba el click. */
                    else goTo(i % total);
                  }}
                  onKeyDown={(e) => isActive && onCardKey(e, i % total, cardRefs.current[i])}
                  /* La condición es SOLO isActive, no `isActive && !isClone`.
                     Como mucho hay una card activa a la vez (i === vSlide), así
                     que no se duplican paradas de tabulación; pero mientras el
                     índice está fuera de la copia del medio —hasta 900ms después
                     de cada movimiento, ver el rebase— la activa ES un clon, y
                     con la condición vieja la sección se quedaba sin nada
                     enfocable y sin forma de abrir el detalle por teclado.
                     Por lo mismo aria-hidden mira solo isActive: un elemento
                     enfocable escondido de lectores de pantalla es peor que
                     mostrarlo. */
                  role={isActive ? 'button' : undefined}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={isActive ? `${p.title} — ${p.tag}` : undefined}
                  aria-hidden={!isActive}
                >
                  <img src={p.image} alt={isClone ? '' : p.title} draggable={false} />
                </article>
              );
            })}
          </div>

          {/* Título + descripción del proyecto activo: FUERA de la card, pegados
              a la izquierda y centrados verticalmente contra ella
              (requerimiento 4). Va dentro del viewport porque su altura es la de
              la card — ver la nota en .carousel-caption. */}
          <div className={`carousel-caption${captionFading ? ' is-fading' : ''}`}>
            <h3 className="project-title">{projects[shownSlide].title}</h3>
            <span className="project-tag-label">{projects[shownSlide].tag}</span>
          </div>
        </div>

        <div className="carousel-dots" role="tablist" aria-label="Projects pagination">
          {projects.map((p, i) => {
            /* Figma: the dots sit on a convex arc (dome ∩) — apex in the centre,
               dropping down toward both edges. Parabolic offset per position. */
            const mid = (total - 1) / 2;
            const t = mid === 0 ? 0 : (i - mid) / mid; // -1 … 0 … 1
            /* 0 en el centro → --arc-drop en los extremos. La amplitud vive en el
               CSS (y baja en mobile) para que escale junto con el tamaño del dot
               y el gap: con el centro de control chico el arco medía 14px y no se
               leía como arco. */
            const arc = (t * t).toFixed(3);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === currentSlide}
                aria-label={`Go to project ${i + 1}`}
                className={`carousel-dot ${i === currentSlide ? 'is-active' : ''}`}
                style={{ transform: `translateY(calc(var(--arc-drop) * ${arc}))` }}
                onClick={() => goTo(i)}
              />
            );
          })}
        </div>
      </div>
  );

  return (
    <section
      id="about"
      className={`projects ${isMobile ? 'projects-stack-section' : 'projects-carousel-section'}`}
    >
      <div className="container projects-header">
        <p className="section-label reveal">{t('projects.label')}</p>
      </div>

      {isMobile ? stack : carousel}

      <Footline />

      {expanded && (
        <div
          className="project-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${expanded.title} — ${expanded.tag}`}
          onClick={closeProject}
        >
          <div
            className="project-modal"
            onClick={(e) => e.stopPropagation()}
            style={
              originRect
                ? ({
                    ['--from-x' as string]: `${originRect.left}px`,
                    ['--from-y' as string]: `${originRect.top}px`,
                    ['--from-w' as string]: `${originRect.width}px`,
                    ['--from-h' as string]: `${originRect.height}px`,
                    /* Razón ya calculada y SIN unidad. scale() solo acepta un
                       número puro: el `calc(var(--from-w) / 1280)` que había daba
                       una longitud (0.51px), o sea un transform inválido, así que
                       el estado inicial del flip se descartaba entero y la card
                       nunca crecía desde su posición — solo aparecía. */
                    ['--from-scale' as string]: String(
                      originRect.width / Math.max(1, window.innerWidth)
                    ),
                  } as React.CSSProperties)
                : undefined
            }
          >
            {/* El título y la X salen de .project-modal-image: esa caja tiene
                overflow:hidden para recortar la foto, y ahí adentro el título no
                puede montarse sobre el borde inferior ni la X puede viajar con el
                scroll — quedarían recortados. Viven en el hero, que no recorta. */}
            <div className="project-modal-hero">
              <div className="project-modal-image">
                <img src={expanded.image} alt={expanded.title} />
              </div>
              <div className="project-modal-image-overlay">
                <h3 className="project-modal-title">{expanded.title}</h3>
                <span className="project-tag-label">{expanded.tag}</span>
              </div>
            </div>
            {/* Riel de la X: va desde el borde de la foto hasta el fondo del
                modal, y el botón queda sticky adentro. Así arranca junto a la
                foto y después ACOMPAÑA al contenido hacia abajo en vez de
                perderse arriba (requerimiento 10). */}
            <div className="project-modal-close-rail" aria-hidden="false">
              <button
                type="button"
                className="project-modal-close"
                onClick={closeProject}
                aria-label="Close project"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="project-modal-card">
              {expanded.mockups && expanded.mockups.length > 0 ? (
                <div className="project-modal-layout">
                  <div className="project-modal-text-col">
                    <p className="project-modal-text">{expanded.description}</p>
                    <p className="project-modal-text">{expanded.description}</p>
                  </div>
                  <div className="project-modal-mockups-col">
                    {expanded.mockups.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className={`project-modal-mockup mockup-${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="project-modal-text">{expanded.description}</p>
                  <p className="project-modal-text">{expanded.description}</p>
                  <p className="project-modal-text">{expanded.description}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
