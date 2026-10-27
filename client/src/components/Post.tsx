import { formatearFecha } from '../data/trayectoria';
import type { HitoTrayectoria, VideoPost } from '../data/trayectoria';
import { useLang } from '../i18n';
import { rotulo, rutaPublica, tituloTarjeta } from '../lib/post';
import { DetailModal } from './DetailModal';
import { ProjectLinks } from './ProjectLinks';
import './Post.css';

/* El post de un proyecto (SPEC-39). Antes vivía dentro de Projects.tsx y la
   Trayectoria armaba su propio detalle con otras props, así que el mismo
   proyecto se veía distinto según por dónde se entraba. Ahora los dos lados
   montan ESTE modal: misma banda, mismo título, mismos párrafos, imágenes,
   videos y enlaces. */

/* Una celda de la fila de videos. preload="none" + póster: no se baja nada
   hasta que el usuario le da play, y nunca hay autoplay (ni con sonido ni sin
   él), así que prefers-reduced-motion queda respetado de entrada. */
function VideoCelda({ video, tipo }: { video: VideoPost; tipo: 'tutorial' | 'reel' }) {
  return (
    <figure className={`post-video post-video--${tipo}`}>
      <figcaption className="post-video__titulo">{video.titulo}</figcaption>
      <video
        className="post-video__media"
        src={rutaPublica(video.src)}
        poster={video.poster ? rutaPublica(video.poster) : undefined}
        controls
        playsInline
        preload="none"
        aria-label={video.titulo}
      />
    </figure>
  );
}

/* Fila de videos: tutorial 16:9 a la izquierda y reel 9:16 a la derecha, con
   el mismo alto (ver Post.css); en mobile se apilan. */
function VideosPost({ videos }: { videos: NonNullable<HitoTrayectoria['videos']> }) {
  const { tutorial, reel } = videos;
  if (!tutorial && !reel) return null;
  return (
    <div className="post-videos">
      {tutorial && <VideoCelda video={tutorial} tipo="tutorial" />}
      {reel && <VideoCelda video={reel} tipo="reel" />}
    </div>
  );
}

/* Cuerpo del post, con la distribución del prototipo de Figma (video
   2026-10-18): párrafo a todo el ancho; imagen a la izquierda con el texto
   corriendo a su derecha; teléfono inclinado a la derecha con texto a su
   izquierda; y el texto sigue corriendo al lado del teléfono hasta que se
   termina, sin dejar huecos. Las imágenes van flotando (no en una columna
   aparte) para que el texto las rodee como en el diseño. Los videos van
   después del primer párrafo, antes de la primera imagen. Sin `parrafos`, la
   descripción hace de único párrafo. */
export function PostCuerpo({ hito }: { hito: HitoTrayectoria }) {
  const parrafos = hito.parrafos?.length ? hito.parrafos : hito.descripcion ? [hito.descripcion] : [];
  const [primero, segundo, tercero, ...resto] = parrafos;
  const [figura, telefono] = hito.mockups ?? [];
  return (
    /* lang="es": el contenido de trayectoria.ts está en español aunque el sitio
       esté en inglés, y el justificado parte las palabras según este idioma. */
    <div className="post" lang="es">
      {primero && <p className="project-modal-text">{primero}</p>}
      {hito.videos && <VideosPost videos={hito.videos} />}
      {figura && (
        <figure className="post-figura">
          <img src={rutaPublica(figura)} alt="" loading="lazy" decoding="async" />
        </figure>
      )}
      {segundo && <p className="project-modal-text">{segundo}</p>}
      {telefono && (
        <img
          className="post-telefono"
          src={rutaPublica(telefono)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      {tercero && <p className="project-modal-text">{tercero}</p>}
      {resto.map((p, i) => (
        <p key={i} className="project-modal-text">
          {p}
        </p>
      ))}
    </div>
  );
}

/* El modal del post con las props del slider. Cualquier cambio de forma del
   post se hace acá y llega igual a Proyectos y a la Trayectoria. */
export function PostModal({
  hito,
  originRect,
  onClose,
}: {
  hito: HitoTrayectoria;
  originRect: DOMRect | null;
  onClose: () => void;
}) {
  const { lang } = useLang();
  return (
    <DetailModal
      originRect={originRect}
      /* El título corto de la tarjeta, si lo hay: en la banda un título de
         dos líneas en letra gigante tapa la imagen. El completo queda como
         texto accesible del diálogo. */
      title={tituloTarjeta(hito)}
      ariaLabel={rotulo(hito)}
      image={hito.imagen ? rutaPublica(hito.imagen) : undefined}
      imagePosition={hito.focoBanner}
      heroVh={hito.altoBanner}
      /* Sin etiqueta (hitos que no son proyectos, p.ej. Workana o TuApp) se
         muestra la fecha, como mostraba el detalle simple. Los destacados la
         traen, así que el slider no cambia. */
      tag={hito.etiqueta ?? (hito.fecha ? formatearFecha(hito.fecha, lang) : undefined)}
      closeLabel={lang === 'esp' ? 'Cerrar proyecto' : 'Close project'}
      onClose={onClose}
      footer={<ProjectLinks hito={hito} />}
    >
      <PostCuerpo hito={hito} />
    </DetailModal>
  );
}
