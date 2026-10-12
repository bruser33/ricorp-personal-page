import { useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
/* Los estilos del detalle (overlay, flip, hero, riel de la X, panel) nacieron en
   Projects.css y siguen ahí. Se importan explícitamente para que el modal no
   dependa de que Proyectos esté montado; Vite deduplica el CSS. Lo único propio
   de este componente (la variante sin imagen) vive en DetailModal.css. */
import './Projects.css';
import './DetailModal.css';

/* Detalle animado compartido por Proyectos y la trayectoria (SPEC-18). Crece
   desde el rect de la tarjeta que lo abrió (`originRect`, medido con
   getBoundingClientRect en el clic) hasta tapar la pantalla: la animación es
   `modalFlipIn` de Projects.css, alimentada por las custom properties --from-*.
   Escape lo maneja quien lo abre: en la vista de trayectoria el mismo Escape
   tiene que cerrar SOLO el detalle, y eso lo decide el dueño del estado. */
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
      className="project-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        className={`project-modal${image ? '' : ' project-modal--sin-imagen'}`}
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
              } as CSSProperties)
            : undefined
        }
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
            onClick={onClose}
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
