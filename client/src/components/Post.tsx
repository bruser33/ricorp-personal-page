import { useRef, useState } from 'react';
import { formatearFecha } from '../data/trayectoria';
import type { HitoTrayectoria, VideoPost } from '../data/trayectoria';
import { useLang } from '../i18n';
import { distribucionPost, rotulo, rutaPublica, tituloTarjeta } from '../lib/post';
import { DetailModal } from './DetailModal';
import { ProjectLinks } from './ProjectLinks';
import './Post.css';

/* El post de un proyecto (SPEC-39). Antes vivía dentro de Projects.tsx y la
   Trayectoria armaba su propio detalle con otras props, así que el mismo
   proyecto se veía distinto según por dónde se entraba. Ahora los dos lados
   montan ESTE modal: misma banda, mismo título, mismos párrafos, imágenes,
   videos y enlaces. */

/* Un video del post. preload="none" + póster: no se baja nada hasta que el
   usuario le da play, y nunca hay autoplay (ni con sonido ni sin él), así que
   prefers-reduced-motion queda respetado de entrada. La pausa al cerrar la
   hace DetailModal sobre todos los <video> del overlay. */
function VideoMedia({ video }: { video: VideoPost }) {
  return (
    <video
      className="post-video__media"
      src={rutaPublica(video.src)}
      poster={video.poster ? rutaPublica(video.poster) : undefined}
      controls
      playsInline
      preload="none"
      aria-label={video.titulo}
    />
  );
}

/* Fila de arriba (SPEC-43): SOLO el tutorial, 16:9 a todo el ancho del post.
   El reel ya no va acá: ocupa el lugar del teléfono (ver PostCuerpo). */
function TutorialPost({ video }: { video: VideoPost }) {
  return (
    <figure className="post-video post-video--tutorial">
      <figcaption className="post-video__titulo">{video.titulo}</figcaption>
      <VideoMedia video={video} />
    </figure>
  );
}

/* Cuerpo del post, con la distribución del prototipo de Figma (video
   2026-10-18): párrafo a todo el ancho; imagen a la izquierda con el texto
   corriendo a su derecha; teléfono inclinado a la derecha con texto a su
   izquierda; y el texto sigue corriendo al lado del teléfono hasta que se
   termina, sin dejar huecos. Las imágenes van flotando (no en una columna
   aparte) para que el texto las rodee como en el diseño. El tutorial va
   después del primer párrafo, antes de la primera imagen; el reel, si hay,
   ocupa el lugar del teléfono (SPEC-43, ver distribucionPost). Sin
   `parrafos`, la descripción hace de único párrafo. */
/* Galería con slider en el lugar de la imagen de la izquierda del post. El
   desplazamiento es scroll horizontal nativo con scroll-snap: así el dedo, el
   trackpad (dos dedos) y la rueda horizontal funcionan solos y con su inercia,
   y las flechas solo llaman a scrollTo. El índice se deduce del scroll. */
function GaleriaPost({ fotos }: { fotos: { src: string; pie: string }[] }) {
  const pistaRef = useRef<HTMLDivElement | null>(null);
  const [indice, setIndice] = useState(0);
  const total = fotos.length;

  const irA = (i: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    const destino = Math.max(0, Math.min(total - 1, i));
    pista.scrollTo({ left: destino * pista.clientWidth, behavior: 'smooth' });
  };

  const alScrollear = () => {
    const pista = pistaRef.current;
    if (!pista || !pista.clientWidth) return;
    setIndice(Math.round(pista.scrollLeft / pista.clientWidth));
  };

  return (
    <figure className="post-figura post-galeria" aria-roledescription="carrusel" aria-label="Galería">
      <div
        ref={pistaRef}
        className="galeria-pista"
        onScroll={alScrollear}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            irA(indice + 1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            irA(indice - 1);
          }
        }}
      >
        {fotos.map((f, i) => (
          <div
            key={f.src}
            className="galeria-slide"
            role="group"
            aria-roledescription="foto"
            aria-label={`${i + 1} de ${total}`}
          >
            <img
              src={rutaPublica(f.src)}
              alt={f.pie}
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="galeria-flecha galeria-flecha--prev"
        aria-label="Foto anterior"
        disabled={indice === 0}
        onClick={() => irA(indice - 1)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="galeria-flecha galeria-flecha--next"
        aria-label="Foto siguiente"
        disabled={indice === total - 1}
        onClick={() => irA(indice + 1)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <figcaption className="galeria-pie">
        <span className="galeria-contador">
          {indice + 1} / {total}
        </span>
        <span aria-live="polite">{fotos[indice]?.pie}</span>
      </figcaption>
    </figure>
  );
}

export function PostCuerpo({ hito }: { hito: HitoTrayectoria }) {
  const parrafos = hito.parrafos?.length ? hito.parrafos : hito.descripcion ? [hito.descripcion] : [];
  const [primero, segundo, tercero, ...resto] = parrafos;
  const { tutorial, figura, telefono } = distribucionPost(hito);
  return (
    /* lang="es": el contenido de trayectoria.ts está en español aunque el sitio
       esté en inglés, y el justificado parte las palabras según este idioma. */
    <div className="post" lang="es">
      {primero && <p className="project-modal-text">{primero}</p>}
      {tutorial && <TutorialPost video={tutorial} />}
      {hito.galeria?.length ? (
        <GaleriaPost fotos={hito.galeria} />
      ) : (
        figura && (
          <figure className="post-figura">
            <img src={rutaPublica(figura)} alt="" loading="lazy" decoding="async" />
          </figure>
        )
      )}
      {segundo && <p className="project-modal-text">{segundo}</p>}
      {telefono?.tipo === 'reel' && (
        /* El reel en el hueco del teléfono: misma caja flotante, ancho,
           inclinación y sombra (.post-telefono), vertical 9:16. */
        <figure className="post-telefono post-reel">
          <VideoMedia video={telefono.video} />
        </figure>
      )}
      {telefono?.tipo === 'imagen' && (
        <img
          className="post-telefono"
          src={rutaPublica(telefono.src)}
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
