import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '../i18n';
import { PostModal } from './Post';
import { rotulo, rutaPublica as rutaImagen, tituloPlano, tituloTarjeta } from '../lib/post';
import { hitosDestacados } from '../data/trayectoria';
import type { HitoTrayectoria } from '../data/trayectoria';
import './Projects.css';

/* rutaImagen, tituloPlano, tituloTarjeta y rotulo viven en lib/post.ts: los
   comparten este slider y la Trayectoria (SPEC-39). */

/* La tarjeta de Proyectos ES la imagen (el título vive afuera), así que un
   destacado sin `imagen` no se puede dibujar. Se DESCARTA acá en vez de
   renderizar una card hueca: en la línea de tiempo sigue apareciendo igual, que
   es donde un hito sin foto se lee bien. */
type Proyecto = HitoTrayectoria & { imagen: string };

/* Fuente única: esta sección ya no tiene lista propia. Muestra los hitos de
   `src/data/trayectoria.ts` marcados con `destacado: true`, más nuevos primero.
   Se resuelve a nivel de módulo porque `trayectoria` es una constante: así la
   referencia es estable entre renders y no hace falta memoizar nada. */
const projects: Proyecto[] = hitosDestacados().filter((h): h is Proyecto => !!h.imagen);

/* Loop visual del carrusel. La lista se repite REPEATS veces y el índice que
   manda es VIRTUAL (un entero sin acotar sobre esa tira): así el slot activo
   SIEMPRE tiene vecinos a izquierda Y derecha, incluso en el proyecto 1 — antes
   el track arrancaba en el borde y la sección se leía corrida hacia la derecha.
   Cuando el índice virtual se sale de la copia del medio se rebasa sin
   transición (ver useEffect de normalización), que es lo que hace el loop
   invisible. */
const REPEATS = 3;

/* Cantidad FIJA de dots del arco, como en el diseño (7), aunque haya menos
   proyectos (hoy 3): el arco es parte de la composición y con 3 puntos no se
   lee como arco. El dot activo avanza un lugar por cada paso del slider (y
   vuelve a empezar), así que sigue marcando el movimiento. */
const DOTS = 7;
const modulo = (n: number, m: number) => ((n % m) + m) % m;
/* Camino corto (−3…+3) para ir del dot `de` al dot `a` dando la vuelta. */
const pasosEntreDots = (de: number, a: number) => {
  let d = modulo(a - de, DOTS);
  if (d > DOTS / 2) d -= DOTS;
  return d;
};
const MIDDLE_COPY = 1;

// ¿El índice virtual está dentro de la copia del medio (o sea, no hay que rebasear)?
const inMiddleCopy = (v: number, total: number) =>
  v >= total * MIDDLE_COPY && v < total * (MIDDLE_COPY + 1);

/* Difuminación del caption al cambiar de card (requerimiento 6): el bloque
   título+tag se va en blur+fade, se cambia el proyecto con el caption invisible
   y vuelve a entrar. Este es el medio tiempo, no la duración total. */
const CAPTION_FADE_MS = 260;

/* Auto-play del carrusel (solo desktop).
   El valor original (2100ms) salía de medir un video del prototipo de Figma: ~5
   proyectos en 10.4s. Se leía demasiado rápido, así que hoy son 4200ms, elegidos
   a ojo. El video nuevo NO sirve para medir esto: ahí el prototipo lo mueven a
   mano y los cambios de slide caen a 0.4, 1.0, 2.4, 2.6, 3.6, 3.8 y 7.8s, sin
   patrón. Si hay que volver a tocar la velocidad, es este número y nada más.
   Antes el track transicionaba en `AUTOPLAY_MS linear` para que nunca quedara
   quieto, y ese era el bug: la card nueva se marca activa (más grande, con su
   título) en el instante en que ARRANCA el paso, pero llega al centro recién al
   final. Durante los 4.2s la card grande viajaba descentrada y el título del
   proyecto nuevo quedaba montado sobre la card anterior. Ahora cada paso desliza
   AUTOPLAY_SLIDE_MS con ease-in-out y descansa centrado el resto del intervalo:
   se sigue moviendo solo, pero lo que dice el título es lo que está al centro. */
const AUTOPLAY_MS = 4200;
const AUTOPLAY_SLIDE_MS = 1100;

/* Respiro tras una interacción explícita (drag, dot, teclas) antes de que el
   auto-play retome: si retomara enseguida, le pelearía al usuario el control. */
const AUTOPLAY_RESUME_MS = 4000;

/* Arrastre con la mano (SPEC-16). La "fuerza" del gesto es la velocidad del
   puntero al soltar, medida sobre la ventana de los últimos DRAG_VELOCITY_WINDOW_MS
   (una sola muestra entre dos pointermove es puro ruido: dos eventos a 1ms dan
   velocidades absurdas). Reglas:
   - menos de DRAG_CLICK_PX recorridos → no es un arrastre, es un clic;
   - velocidad ≥ DRAG_FLICK_VELOCITY en el sentido del gesto Y al menos
     DRAG_FLICK_MIN_PX recorridos → tirón fuerte, 2 cards (sin ese mínimo, un tap
     con temblor de 6px en 5ms ya "vuela" a más de 1px/ms y saltaba 2 cards);
   - recorrido ≥ DRAG_MIN_FRACTION del paso, o velocidad ≥ DRAG_NUDGE_VELOCITY
     (con el mismo mínimo de DRAG_FLICK_MIN_PX) →
     1 card (2 si el arrastre lento ya cruzó más de una card y media: el track
     sigue al dedo 1:1, y devolverlo una card para atrás se leería como un rebote);
   - si no, vuelve a la card actual.
   Nunca más de DRAG_MAX_STEP cards por gesto. */
const DRAG_CLICK_PX = 5;
const DRAG_MIN_FRACTION = 0.15;
const DRAG_FLICK_VELOCITY = 0.8; // px/ms — calibrado a ojo, ver la spec.
const DRAG_NUDGE_VELOCITY = 0.3; // px/ms
const DRAG_FLICK_MIN_PX = 30;
const DRAG_VELOCITY_WINDOW_MS = 100;
const DRAG_MAX_STEP = 2;

/* Gesto horizontal del trackpad (ver el efecto de wheel): cuántos px de
   deltaX acumulados hacen falta para pasar de card, y cuánto silencio entre
   eventos da por terminada la ráfaga (la inercia del trackpad sigue mandando
   eventos un buen rato después de levantar los dedos). */
const WHEEL_UMBRAL_PX = 40;
const WHEEL_SILENCIO_MS = 220;

/* Cuántas cards avanza un gesto. Positivo = siguiente (el dedo fue a la
   izquierda, dx negativo). Función pura: no lee el DOM ni el estado. */
function slidesForGesture(dx: number, velocity: number, step: number): number {
  if (Math.abs(dx) < DRAG_CLICK_PX || step <= 0) return 0;
  const dir = dx < 0 ? 1 : -1;
  // Velocidad en el MISMO sentido que el recorrido: un tirón y vuelta atrás no suma.
  const speed = Math.sign(velocity) === Math.sign(dx) ? Math.abs(velocity) : 0;
  // Por debajo de DRAG_FLICK_MIN_PX la velocidad no cuenta (ni para 2 ni para 1).
  const flickable = Math.abs(dx) >= DRAG_FLICK_MIN_PX;
  if (flickable && speed >= DRAG_FLICK_VELOCITY) return dir * DRAG_MAX_STEP;
  const fraction = Math.abs(dx) / step;
  if (fraction < DRAG_MIN_FRACTION && !(flickable && speed >= DRAG_NUDGE_VELOCITY)) return 0;
  return dir * Math.min(DRAG_MAX_STEP, Math.max(1, Math.round(fraction)));
}

/* El carrusel y la lista apilada son ESTRUCTURAS distintas, no un layout que se
   pueda intercambiar con CSS: el carrusel necesita la tira repetida, el track
   desplazado y los handlers de drag, y en una lista vertical el flex-basis de la
   card pasaría a ser su ALTO. Así que se decide en JS cuál se monta.
   El valor inicial sale de matchMedia y no de un efecto: montar el carrusel y
   cambiarlo en el primer efecto haría parpadear la sección en cada carga mobile. */
function useIsMobile(query = '(max-width: 720px)') {
  return useMediaQuery(query);
}

/* Mismo patrón que el resto del repo (window.matchMedia): valor inicial sincrónico
   + listener de cambios. Lo usan el breakpoint de mobile y prefers-reduced-motion. */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function Projects() {
  const { t } = useLang();
  const total = projects.length;
  /* Con 0 ó 1 destacado NO hay carrusel posible: el índice virtual da por hecho
     que el slot activo tiene vecinos a ambos lados (por eso la tira repetida), y
     con un solo proyecto el rebase del loop y el auto-play quedarían girando
     sobre la misma card para siempre. Con 1 se muestra la card sola —sin loop,
     sin dots y sin auto-play— y con 0 la sección se queda solo con su
     encabezado. */
  const hasLoop = total > 1;
  const isMobile = useIsMobile();
  // Card apilada que está en el centro de la pantalla (solo mobile).
  const [activeStack, setActiveStack] = useState(0);
  const stackRefs = useRef<(HTMLElement | null)[]>([]);
  // Índice virtual sobre la tira repetida (arranca en la copia del medio).
  const [vSlide, setVSlide] = useState(hasLoop ? total * MIDDLE_COPY : 0);
  const [noTransition, setNoTransition] = useState(false);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /* Arrastre con la mano (SPEC-16). `dragging` es estado porque pinta (cursor
     grabbing, transición apagada, auto-play en pausa); el resto vive en un ref
     porque los handlers de puntero corren varias veces por frame y no pueden
     esperar a un re-render para leer dónde arrancó el gesto. */
  const [dragging, setDragging] = useState(false);
  const [dragDX, setDragDX] = useState(0);
  const drag = useRef<{
    active: boolean;
    startX: number;
    pointerId: number;
    captured: boolean;
    moved: boolean;
    samples: { x: number; t: number }[];
  }>({ active: false, startX: 0, pointerId: -1, captured: false, moved: false, samples: [] });

  /* --- Auto-play (solo desktop) ------------------------------------------- */
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sectionRef = useRef<HTMLElement | null>(null);
  // La sección está a la vista: fuera de pantalla el auto-play se apaga.
  const [inView, setInView] = useState(false);
  // Interacción explícita reciente (drag, dot, teclas): ver AUTOPLAY_RESUME_MS.
  const [autoplaySuspended, setAutoplaySuspended] = useState(false);
  const resumeTimer = useRef(0);
  /* ¿El último paso lo dio el auto-play? Lo consume el rebase de normalización
     para saber cuánto dura la transición en curso (4200ms lineales vs 850ms). */
  const lastStepWasAutoplay = useRef(false);

  /* Toda interacción del usuario pasa por acá: apaga el auto-play y lo vuelve a
     encender recién tras AUTOPLAY_RESUME_MS de inactividad (el timer se reinicia
     con cada gesto, así que gestos encadenados no lo reviven en el medio). */
  const suspendAutoplay = useCallback(() => {
    lastStepWasAutoplay.current = false;
    setAutoplaySuspended(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(
      () => setAutoplaySuspended(false),
      AUTOPLAY_RESUME_MS
    );
  }, []);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  // Sin loop no hay aritmética modular que valga (con total 0 sería un NaN).
  const currentSlide = hasLoop ? ((vSlide % total) + total) % total : 0;
  const loopProjects = hasLoop
    ? Array.from({ length: total * REPEATS }, (_, i) => projects[i % total])
    : projects;

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
  const slideRef = useRef(hasLoop ? total * MIDDLE_COPY : 0);
  // Dot activo del arco (0…DOTS-1). Avanza con cada paso, ver DOTS.
  const [dot, setDot] = useState(0);

  const moveBy = useCallback(
    (delta: number) => {
      if (delta === 0 || !hasLoop) return;
      setDot((d) => modulo(d + delta, DOTS));
      const cur = slideRef.current;
      const next = cur + delta;
      if (next >= 1 && next <= total * REPEATS - 2) {
        slideRef.current = next;
        setVSlide(next);
        return;
      }
      /* El rebase cae SIEMPRE en la copia del medio, en el proyecto destino
         calculado en módulo. Antes sumaba el delta crudo y lo acotaba a la
         tira: con los 7 dots fijos un dot puede pedir ±3 pasos sobre 3
         proyectos, y el clamp dejaba el slider en el proyecto equivocado. */
      const rebased = total * MIDDLE_COPY + modulo(modulo(cur, total) + delta, total);
      setNoTransition(true);
      slideRef.current = rebased;
      setVSlide(rebased);
    },
    [total, hasLoop]
  );

  // goTo recibe un índice REAL de proyecto (los dots) y viaja por el camino
  // corto sobre la tira virtual.
  const goTo = useCallback(
    (i: number) => {
      // Los dots y las cards vecinas son interacción explícita: cortan el auto-play.
      suspendAutoplay();
      const target = ((i % total) + total) % total;
      const cur = ((slideRef.current % total) + total) % total;
      let d = target - cur;
      if (d > total / 2) d -= total;
      if (d < -total / 2) d += total;
      moveBy(d);
    },
    [total, moveBy, suspendAutoplay]
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

  /* El auto-play manda solo si: hay carrusel (desktop; en mobile la lista apilada
     no tiene qué mover), el usuario no pidió menos movimiento, la sección está a
     la vista, nadie está arrastrando, no hay detalle abierto y no hubo
     interacción reciente. El puntero ENCIMA ya no lo pausa: el carrusel ocupa el
     ancho completo y el centro de la pantalla, así que al bajar con la rueda el
     mouse casi siempre quedaba sobre él y el slider se congelaba. */
  const autoplayActive =
    hasLoop &&
    !isMobile &&
    !prefersReducedMotion &&
    inView &&
    !dragging &&
    expandedSlide === null &&
    !autoplaySuspended;

  /* Visibilidad de la sección. Sin esto el carrusel seguiría avanzando (y
     repintando) con la sección fuera de pantalla, y al volver el usuario se
     encontraría el orden cambiado sin haber visto el movimiento. */
  useEffect(() => {
    if (isMobile) return;
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile]);

  /* Deslizar con dos dedos en el trackpad (o la rueda horizontal). En un Mac
     ese es EL gesto natural para "agarrar y correr" un slider, y el carrusel
     solo entendía el arrastre con el puntero apretado: con el trackpad se
     sentía clavado. El gesto llega como ráfaga de eventos `wheel` con deltaX:
     se acumula y, al pasar el umbral, avanza UNA card y se ignora el resto de
     la ráfaga (inercia del trackpad) hasta un respiro sin eventos. Solo actúa
     si el gesto es claramente horizontal: el scroll vertical de la página
     sigue intacto. Listener nativo y no onWheel porque React lo registra
     pasivo y acá hace falta preventDefault (si no, Safari/Chrome lo toman
     como "atrás/adelante" del historial). */
  useEffect(() => {
    if (isMobile || !hasLoop) return;
    const el = viewportRef.current;
    if (!el) return;
    let acumulado = 0;
    let bloqueado = false;
    let silencio = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      window.clearTimeout(silencio);
      silencio = window.setTimeout(() => {
        bloqueado = false;
        acumulado = 0;
      }, WHEEL_SILENCIO_MS);
      if (bloqueado) return;
      acumulado += e.deltaX;
      if (Math.abs(acumulado) < WHEEL_UMBRAL_PX) return;
      suspendAutoplay();
      moveBy(acumulado > 0 ? 1 : -1);
      bloqueado = true;
      acumulado = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(silencio);
    };
  }, [isMobile, hasLoop, moveBy, suspendAutoplay]);

  // Motor del auto-play: un paso cada AUTOPLAY_MS; cada paso desliza
  // AUTOPLAY_SLIDE_MS (clase .is-autoplaying) y el resto del intervalo descansa.
  useEffect(() => {
    if (!autoplayActive) return;
    const id = window.setInterval(() => {
      const track = trackRef.current;
      /* Rebase del loop SIN el camino de noTransition (ese camino apaga la
         transición un par de frames y metería un tirón). Este tick cae con la
         transición anterior ya terminada, o sea con el track EN REPOSO: ahí correr el
         índice una periodicidad completa de la tira renderiza exactamente la
         misma imagen. Se pinta en el mismo tick (transición apagada a mano +
         reflow forzado para que el navegador la dé por comprometida) y el paso
         de abajo ya anima con la transición de la clase, sin frames muertos. */
      if (track && !inMiddleCopy(slideRef.current, total)) {
        const home = total * MIDDLE_COPY + (((slideRef.current % total) + total) % total);
        track.style.transition = 'none';
        track.style.setProperty('--slide', String(home));
        track.getBoundingClientRect();
        track.style.transition = '';
        slideRef.current = home;
      }
      lastStepWasAutoplay.current = true;
      moveBy(1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplayActive, moveBy, total]);

  /* Normalización del loop: al terminar el desplazamiento, si el índice virtual
     salió de la copia del medio se lo rebasa a la posición equivalente de esa
     copia. El rebase va SIN transición (noTransition) o se vería un salto de
     toda la tira. */
  useEffect(() => {
    if (!hasLoop) return;
    if (inMiddleCopy(vSlide, total)) return;
    /* Con el auto-play corriendo el rebase lo hace el propio tick (en reposo y
       sin apagar la transición): si además saltara acá, cortaría el
       deslizamiento en curso a la mitad. */
    if (autoplayActive) return;
    const id = window.setTimeout(
      () => {
        const home = total * MIDDLE_COPY + (((slideRef.current % total) + total) % total);
        setNoTransition(true);
        slideRef.current = home;
        setVSlide(home);
      },
      /* Hay que esperar a que termine la transición EN CURSO o el rebase la
         corta: 850ms las del usuario, AUTOPLAY_SLIDE_MS si el último paso lo
         dio el auto-play y recién ahora se apagó (p.ej. la sección salió de la
         vista a mitad del deslizamiento). */
      lastStepWasAutoplay.current ? AUTOPLAY_SLIDE_MS + 60 : 900
    );
    return () => window.clearTimeout(id);
  }, [vSlide, total, autoplayActive, hasLoop]);

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
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      suspendAutoplay();
      if (e.key === 'ArrowRight') next();
      else prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, expandedSlide, closeProject, isMobile, suspendAutoplay]);

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

  /* Velocidad al soltar (px/ms) sobre la ventana reciente. Si el puntero se
     quedó quieto antes de soltar, la ventana queda con una sola muestra y la
     velocidad es 0: arrastrar, frenar y soltar NO es un tirón. */
  const releaseVelocity = (x: number, t: number) => {
    const samples = drag.current.samples.filter((s) => t - s.t <= DRAG_VELOCITY_WINDOW_MS);
    const first = samples[0];
    if (!first || t - first.t <= 0) return 0;
    return (x - first.x) / (t - first.t);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (expandedSlide !== null || !hasLoop) return;
    // Solo el botón principal (el derecho abre el menú contextual, no arrastra).
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const d = drag.current;
    d.active = true;
    d.startX = e.clientX;
    d.pointerId = e.pointerId;
    d.captured = false;
    d.moved = false;
    d.samples = [{ x: e.clientX, t: e.timeStamp }];
    suspendAutoplay();
    setDragging(true);
    /* El pointer capture NO se toma acá. Con el capture puesto desde el
       pointerdown, Chromium despacha el `click` al elemento que captura (el
       viewport) y no a la card: el onClick de las cards nunca corría, así que ni
       la vecina se centraba ni la activa abría el detalle (el "atrás/adelante no
       funciona" del reporte). Se toma recién cuando el gesto pasa a ser un
       arrastre, ver onPointerMove. */
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    // Ventana acotada: alcanza con lo que entra en DRAG_VELOCITY_WINDOW_MS.
    if (d.samples.length > 32) d.samples.shift();
    if (!d.moved && Math.abs(dx) >= DRAG_CLICK_PX) {
      d.moved = true;
      if (!d.captured) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        d.captured = true;
      }
    }
    // 1:1 desde el primer px (el umbral decide si es clic, no si el track sigue).
    setDragDX(dx);
  };

  /* Fin del gesto. `cancel` = el navegador se quedó con el puntero (en touch,
     un gesto mayormente vertical pasa a ser scroll de página por el
     touch-action: pan-y): vuelve a la card actual sin avanzar. */
  const finishDrag = (
    el: HTMLElement,
    e: { pointerId: number; clientX: number; timeStamp: number },
    cancel: boolean
  ) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    d.active = false;
    const dx = e.clientX - d.startX;
    const move = cancel
      ? 0
      : slidesForGesture(dx, releaseVelocity(e.clientX, e.timeStamp), stepPx());
    /* `moved` NO se resetea al cancelar: si al gesto abortado le sigue un click
       (el pointerup llega después de perder el capture), ese click no es un
       clic del usuario y no tiene que abrir el detalle. Lo resetea el próximo
       pointerdown. */
    suspendAutoplay();
    setDragging(false);
    setDragDX(0);
    // Loop: la tira virtual se encarga de que el último conecte con el primero.
    moveBy(move);
    if (d.captured && el.hasPointerCapture?.(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    d.captured = false;
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
     a los costados no se lee en una pantalla angosta. Acá van las cards reales
     (una por destacado), una debajo de otra, sin tira repetida, sin dots y sin
     drag. */
  const stack = total === 0 ? null : (
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
            aria-label={rotulo(p)}
            onClick={() => openProject(i, stackRefs.current[i])}
            onKeyDown={(e) => onCardKey(e, i, stackRefs.current[i])}
          >
            <img src={rutaImagen(p.imagen)} alt="" draggable={false} />
            <div className="carousel-caption stack-caption">
              <h3 className="project-title">{tituloTarjeta(p)}</h3>
              {p.etiqueta && <span className="project-tag-label">{p.etiqueta}</span>}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );

  /* Sin destacados no hay nada que montar: ni carrusel ni lista. La sección se
     queda con su encabezado, sin dots huérfanos. */
  const carousel = total === 0 ? null : (
      <div className="projects-carousel reveal-scale">
        <div
          ref={viewportRef}
          className={`carousel-viewport${dragging ? ' is-dragging' : ''}`}
          onPointerLeave={(e) => {
            /* Sin capture todavía (no pasó de DRAG_CLICK_PX), el pointerup fuera
               del carrusel no llegaría nunca y el gesto quedaría colgado en
               "grabbing" con el auto-play en pausa. */
            if (drag.current.active && !drag.current.captured) {
              finishDrag(e.currentTarget, e, true);
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishDrag(e.currentTarget, e, false)}
          onPointerCancel={(e) => finishDrag(e.currentTarget, e, true)}
          /* Capture perdido sin pointerup (blur de ventana, otro elemento que se
             queda con el puntero): sin esto el gesto quedaba colgado en grabbing
             con el auto-play en pausa. Tras un pointerup normal el gesto ya está
             cerrado cuando llega, y finishDrag no hace nada.
             OJO: solo el del PROPIO viewport. En touch Chromium captura el
             puntero implícitamente sobre la card tocada; al pasarle el capture al
             viewport, la card pierde el suyo y ese lostpointercapture BURBUJEA
             hasta acá — sin el filtro, cada arrastre táctil se cancelaba solo. */
          onLostPointerCapture={(e) => {
            if (e.target === e.currentTarget) finishDrag(e.currentTarget, e, true);
          }}
        >
          <div
            ref={trackRef}
            className={`carousel-track${autoplayActive ? ' is-autoplaying' : ''}${
              dragging ? ' is-dragging' : ''
            }${noTransition ? ' is-rebasing' : ''}`}
            style={
              {
                /* El desplazamiento lo arma el CSS a partir del ancho de card y
                   el gap del breakpoint activo (--card-w / --card-gap): así el
                   track y la card no pueden desincronizarse. El 50% es del
                   propio track, que mide lo mismo que el viewport del carrusel,
                   así que el slot activo queda centrado en pantalla. */
                ['--slide' as string]: vSlide,
                ['--drag' as string]: `${dragDX}px`,
                /* La duración del paso del auto-play viaja al CSS en vez de
                   repetir el número allá (ver AUTOPLAY_SLIDE_MS). */
                ['--autoplay-slide-ms' as string]: `${AUTOPLAY_SLIDE_MS}ms`,
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
                  aria-label={isActive ? rotulo(p) : undefined}
                  aria-hidden={!isActive}
                >
                  <img
                    src={rutaImagen(p.imagen)}
                    alt={isClone ? '' : tituloPlano(p.titulo)}
                    draggable={false}
                    /* Decodificar fuera del hilo principal: al entrar una card
                       nueva al centro no se come un frame del deslizamiento. */
                    decoding="async"
                  />
                </article>
              );
            })}
          </div>

          {/* Título + descripción del proyecto activo: FUERA de la card, pegados
              a la izquierda y centrados verticalmente contra ella
              (requerimiento 4). Va dentro del viewport porque su altura es la de
              la card — ver la nota en .carousel-caption. */}
          <div className={`carousel-caption${captionFading ? ' is-fading' : ''}`}>
            <h3 className="project-title">{tituloTarjeta(projects[shownSlide])}</h3>
            {projects[shownSlide].etiqueta && (
              <span className="project-tag-label">{projects[shownSlide].etiqueta}</span>
            )}
          </div>

          {/* Flechas anterior/siguiente a los costados del slider. Cortan el
              pointerdown para que un clic en la flecha no arranque un arrastre
              del viewport (que es quien escucha el gesto), y pasan por
              suspendAutoplay como cualquier interacción explícita. */}
          {hasLoop && (
            <>
              <button
                type="button"
                className="carousel-arrow carousel-arrow--prev"
                aria-label={t('projects.prev')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  suspendAutoplay();
                  prev();
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="carousel-arrow carousel-arrow--next"
                aria-label={t('projects.next')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  suspendAutoplay();
                  next();
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Un solo proyecto no se pagina: el dot único no diría nada. */}
        {hasLoop && (
          <div className="carousel-dots" role="tablist" aria-label="Projects pagination">
            {Array.from({ length: DOTS }, (_, i) => {
              /* Figma: the dots sit on a convex arc (dome ∩) — apex in the centre,
                 dropping down toward both edges. Parabolic offset per position. */
              const mid = (DOTS - 1) / 2;
              const t = mid === 0 ? 0 : (i - mid) / mid; // -1 … 0 … 1
              /* 0 en el centro → --arc-drop en los extremos. La amplitud vive en el
                 CSS (y baja en mobile) para que escale junto con el tamaño del dot
                 y el gap: con el centro de control chico el arco medía 14px y no se
                 leía como arco. */
              const arc = (t * t).toFixed(3);
              const pasos = pasosEntreDots(dot, i);
              const destino = modulo(currentSlide + pasos, total);
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === dot}
                  aria-label={`Go to project ${destino + 1}: ${tituloPlano(projects[destino].titulo)}`}
                  className={`carousel-dot ${i === dot ? 'is-active' : ''}`}
                  style={{ transform: `translateY(calc(var(--arc-drop) * ${arc}))` }}
                  onClick={() => {
                    suspendAutoplay();
                    moveBy(pasos);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
  );

  return (
    <section
      id="about"
      ref={sectionRef}
      className={`projects ${isMobile ? 'projects-stack-section' : 'projects-carousel-section'}`}
    >
      <div className="container projects-header">
        <p className="section-label reveal">{t('projects.label')}</p>
      </div>

      {isMobile ? stack : carousel}

      {/* El post es el mismo componente que abre la Trayectoria (SPEC-39). */}
      {expanded && <PostModal hito={expanded} originRect={originRect} onClose={closeProject} />}
    </section>
  );
}
