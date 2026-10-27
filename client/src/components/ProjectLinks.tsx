import type { HitoTrayectoria } from '../data/trayectoria';
import './ProjectLinks.css';

/* Enlaces del detalle de un proyecto (SPEC-20): "Ver sitio" si el hito trae
   `enlace` y "Ver reel" si trae `reel`. Vive en su propio archivo a propósito:
   así el modal compartido (SPEC-18) lo monta con una sola línea, igual que el
   de Proyectos. Sin ninguno de los dos no se renderiza nada — en particular, sin
   `reel` no queda ni un nodo que mencione Instagram. */
export function ProjectLinks({ hito }: { hito: Pick<HitoTrayectoria, 'enlace' | 'reel' | 'textoEnlace'> }) {
  const { enlace, reel, textoEnlace } = hito;
  if (!enlace && !reel) return null;
  return (
    <div className="project-links">
      {enlace && (
        <a className="project-link" href={enlace} target="_blank" rel="noreferrer">
          {textoEnlace || 'Ver sitio'} <span aria-hidden="true">↗</span>
        </a>
      )}
      {reel && (
        <a className="project-link" href={reel} target="_blank" rel="noreferrer">
          Ver reel en Instagram <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}
