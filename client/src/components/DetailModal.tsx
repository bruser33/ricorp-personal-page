import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
/* Los estilos del detalle (overlay, flip, hero, riel de la X, panel) nacieron en
   Projects.css y siguen ahí. Se importan explícitamente para que el modal no
   dependa de que Proyectos esté montado; Vite deduplica el CSS. Lo único propio
   de este componente (la variante sin imagen) vive en DetailModal.css. */
import './Projects.css';
import './DetailModal.css';

/* Detalle animado compartido por Proyectos y la trayectoria (SPEC-18). Crece
   desde el rect de la tarjeta que lo abrió (`originRect`, medido con
   getBoundingClientRect en el clic): la banda de foto crece hasta su lugar
   arriba (`heroFlipIn` + `heroClipIn` de Projects.css, alimentadas por las
   --from-* que calcula flipDesde) y después entran título, panel y X.
   Al cerrar hace el camino inverso (como en el prototipo): se van panel y X, la
   banda vuelve a encogerse sobre la tarjeta y recién ahí se llama a onClose.
   Escape también cierra animado: se intercepta acá en captura para que el
   handler del dueño (que cerraría de golpe) no llegue a correr. */
export type DetailModalProps = {
  /** Rect de la tarjeta de origen. null = crece desde el centro (fallback del CSS). */
  originRect: DOMRect | null;
  /** Título del hero. Va en una sola línea (los \n se aplanan antes). */
  title: string;
  /** Texto accesible del dialog. Por defecto, el título. */
  ariaLabel?: string;
  /** URL ya resuelta de la foto. Sin imagen el detalle abre sin banda de foto. */
  image?: string;
  /** Rótulo bajo el título (etiqueta del proyecto, fecha del hito…). */
  tag?: ReactNode;
  /** Texto accesible de la X. */
  closeLabel?: string;
  onClose: () => void;
  /** Contenido del panel (.project-modal-card). */
  children?: ReactNode;
  /** Slot al FINAL del panel, después del contenido (enlaces del hito:
      p.ej. `<ProjectLinks hito={...} />`). Se dibuja aunque no haya children. */
  footer?: ReactNode;
};

/* Duraciones del cierre. CIERRE_MS tiene que cubrir la más larga de las
   animaciones `.is-closing` de Projects.css (heroFlipOut: 160ms de espera +
   520ms); si se acortan allá, se acorta acá. */
const CIERRE_MS = 700;
const SUBIDA_MS = 320;

/* Alto de la banda de foto en px. ES la misma fórmula que --modal-hero-h en
   Projects.css (clamp(240px, 40vh, 520px)): el flip necesita el número antes
   del primer paint, cuando todavía no hay nada que medir. Si se toca uno, se
   toca el otro. */
const altoBanda = () => Math.min(520, Math.max(240, window.innerHeight * 0.4));

/* Estado inicial del flip, como en el prototipo de Figma: crece SOLO la banda
   de foto, desde la tarjeta hasta ocupar el ancho arriba (antes crecía el
   detalle entero, panel vacío incluido). La banda se escala en bloque (origen
   arriba a la izquierda) hasta medir lo que la tarjeta de ancho, y un clip
   vertical centrado la recorta a la proporción de la tarjeta; al animar,
   escala y clip llegan juntos a 1 y 0. Todo en px SIN unidad donde CSS pide
   número: scale() con unidad invalida el transform entero (bug viejo). */
function flipDesde(r: DOMRect): CSSProperties {
  const escala = r.width / Math.max(1, window.innerWidth);
  const altoVisible = r.height / escala; // alto de la tarjeta, en px de la banda
  const clip = Math.max(0, (altoBanda() - altoVisible) / 2);
  return {
    ['--from-x' as string]: `${r.left}px`,
    // El borde de arriba de lo visible cae `clip` px adentro de la banda.
    ['--from-y' as string]: `${r.top - clip * escala}px`,
    ['--from-scale' as string]: String(escala),
    ['--from-clip' as string]: `${clip}px`,
    // Radio de la tarjeta (24px en pantalla) llevado a px de la banda.
    ['--from-radius' as string]: `${24 / escala}px`,
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function DetailModal({
  originRect,
  title,
  ariaLabel,
  image,
  tag,
  closeLabel = 'Close project',
  onClose,
  children,
  footer,
}: DetailModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const cerrandoRef = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* Cierre animado. Si el usuario bajó leyendo, primero se vuelve arriba: la
     banda tiene que estar a la vista para encogerse sobre la tarjeta. Con
     movimiento reducido se cierra en el acto. */
  const requestClose = useCallback(() => {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    const overlay = overlayRef.current;
    const subir = overlay && overlay.scrollTop > 4;
    if (subir) overlay.scrollTo({ top: 0, behavior: 'smooth' });
    const espera = subir ? SUBIDA_MS : 0;
    timers.current.push(
      window.setTimeout(() => setCerrando(true), espera),
      window.setTimeout(onClose, espera + CIERRE_MS)
    );
  }, [onClose]);

  /* Escape en CAPTURA sobre window: corre antes que los listeners de burbuja
     de Proyectos y de la Bitácora, y el stopPropagation los deja afuera. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [requestClose]);

  /* Foco: entra a la X al abrir y vuelve a lo que lo tenía al cerrar (la
     tarjeta tocada). preventScroll porque la X es sticky dentro del overlay y
     enfocarla no tiene que mover nada mientras corre el flip. */
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previo && previo.isConnected) previo.focus({ preventScroll: true });
    };
  }, []);

  // Tab no se escapa del dialog (aria-modal no lo impide por sí solo).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = overlayRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={`project-modal-overlay${cerrando ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={requestClose}
      onKeyDown={onKeyDown}
    >
      <div
        className={`project-modal${image ? '' : ' project-modal--sin-imagen'}`}
        onClick={(e) => e.stopPropagation()}
        style={originRect && image ? flipDesde(originRect) : undefined}
      >
        {/* El título y la X salen de .project-modal-image: esa caja tiene
            overflow:hidden para recortar la foto, y ahí adentro el título no
            puede montarse sobre el borde inferior ni la X puede viajar con el
            scroll — quedarían recortados. Viven en el hero, que no recorta. */}
        <div className="project-modal-hero">
          {image && (
            <div className="project-modal-image">
              <img src={image} alt={title} />
            </div>
          )}
          <div className="project-modal-image-overlay">
            <h3 className="project-modal-title">{title}</h3>
            {tag && <span className="project-tag-label">{tag}</span>}
          </div>
        </div>
        {/* Riel de la X: va desde el borde de la foto hasta el fondo del
            modal, y el botón queda sticky adentro. Así arranca junto a la
            foto y después ACOMPAÑA al contenido hacia abajo en vez de
            perderse arriba (requerimiento 10). */}
        <div className="project-modal-close-rail" aria-hidden="false">
          <button
            ref={closeRef}
            type="button"
            className="project-modal-close"
            onClick={requestClose}
            aria-label={closeLabel}
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
        {(children || footer) && (
          <div className="project-modal-card">
            {children}
            {footer && <div className="project-modal-footer">{footer}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
