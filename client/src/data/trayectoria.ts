/* ============================================================================
 * TRAYECTORIA — ESTE ES EL ARCHIVO QUE TENÉS QUE EDITAR.
 * ============================================================================
 *
 * Todo lo que la página muestra sobre tu historia y tus proyectos sale de acá.
 * No hace falta tocar ningún otro archivo: la línea de tiempo de la sección
 * "Trayectoria" y las tarjetas de la sección "Proyectos" se arman solas con
 * esta lista.
 *
 * CÓMO AGREGAR UN HITO
 * --------------------
 * Copiá un bloque de los de abajo, pegalo dentro de la lista y cambiale el
 * contenido. Los bloques van entre llaves { } y separados por coma.
 *
 *   {
 *     id: 'ricorp-2024',                        // texto único, no se muestra
 *     fecha: '2024-03',                         // ver abajo
 *     titulo: 'Fundé RICORP',
 *     descripcion: 'Una línea o dos, opcional.',
 *     imagen: 'figma-frames/news-1.png',        // opcional
 *     enlace: 'https://...',                    // opcional
 *     destacado: true,                          // opcional
 *     etiqueta: 'App development',              // opcional, solo si es destacado
 *     mockups: ['figma-frames/otra.png'],       // opcional, solo si es destacado
 *   },
 *
 * REGLAS SIMPLES
 * --------------
 * 1) `fecha` MANDA EL ORDEN. Se escribe al revés de como la decimos:
 *    año-mes ('2024-03') o año-mes-día ('2024-03-15'), siempre con dos dígitos
 *    en mes y día. El más nuevo sale arriba. No importa en qué orden dejes los
 *    bloques dentro del archivo: la página los reordena por fecha.
 * 2) `destacado: true` es lo único que hace que un hito además aparezca en la
 *    sección Proyectos. Sin esa línea, el hito vive solo en la trayectoria.
 * 3) `imagen` es la ruta DENTRO de la carpeta `client/public`. Si dejás tu foto
 *    en `client/public/figma-frames/mi-foto.png`, acá escribís
 *    'figma-frames/mi-foto.png' (sin barra al principio). Si el hito no tiene
 *    imagen, borrá la línea entera: la fila se ve bien igual, con fecha y texto.
 * 4) `titulo` acepta un salto de línea forzado escribiendo \n en el medio.
 * 5) `descripcion`, `enlace` e `imagen` son opcionales: si no los querés,
 *    borrá la línea completa.
 *
 * DOS CAMPOS QUE SOLO USA LA SECCIÓN PROYECTOS
 * --------------------------------------------
 * Los dos son OPCIONALES y solo hacen falta si el hito además lleva
 * `destacado: true`. En la línea de tiempo no se muestran nunca.
 * 6) `etiqueta` es el textito bajo el título de la tarjeta, que dice de qué
 *    tipo de trabajo se trata: 'App development', 'Brand identity', 'Web
 *    design'… Si no la ponés, la tarjeta sale solo con el título.
 * 7) `mockups` son imágenes EXTRA que se ven al abrir el proyecto (van al
 *    costado del texto). Se escriben igual que `imagen` —ruta dentro de
 *    `client/public`— y entre corchetes, separadas por coma. Sin `mockups`, el
 *    detalle muestra solo el texto.
 * 8) Un destacado SIN `imagen` no se puede dibujar como tarjeta (la tarjeta ES
 *    la imagen), así que Proyectos lo saltea. En la trayectoria sigue estando.
 * ========================================================================== */

export type HitoTrayectoria = {
  id: string;
  /** ISO 'YYYY-MM' o 'YYYY-MM-DD'. De acá salen el orden y el texto de fecha. */
  fecha: string;
  titulo: string;
  descripcion?: string;
  /** Ruta relativa a `client/public`, ej. 'figma-frames/news-1.png'. */
  imagen?: string;
  enlace?: string;
  /** true = además aparece en la sección Proyectos. */
  destacado?: boolean;
  /** Solo Proyectos: tipo de trabajo bajo el título de la tarjeta. */
  etiqueta?: string;
  /** Solo Proyectos: imágenes extra del detalle, relativas a `client/public`. */
  mockups?: string[];
};

/* ---------------------------------------------------------------------------
 * TODO(pedro): reemplazar por tu trayectoria real.
 * Los 13 hitos de abajo son CONTENIDO DE RELLENO heredado de la maqueta: los 6
 * primeros son análisis de tecnología que no son tuyos, y los 7 con `destacado`
 * son los proyectos de ejemplo que traía la maqueta (títulos "Project N" y
 * textos en lorem ipsum). Están solo para que las secciones tengan forma
 * mientras armás tu historia: borralos todos y escribí los tuyos.
 * ------------------------------------------------------------------------- */
export const trayectoria: HitoTrayectoria[] = [
  {
    id: 'relleno-radeon',
    fecha: '2022-12-14',
    titulo: 'Análisis: AMD Radeon RX 7900 XTX',
    imagen: 'figma-frames/news-featured.png',
  },
  {
    id: 'relleno-suunto',
    fecha: '2022-12-02',
    titulo: 'Análisis: Suunto 9 Peak Pro',
    imagen: 'figma-frames/news-1.png',
  },
  {
    id: 'relleno-iphone',
    fecha: '2022-11-24',
    titulo: 'Análisis: iPhone 14 vs 14 Plus\nvs 14 Pro vs 14 Pro Max',
    imagen: 'figma-frames/news-2.png',
  },
  {
    id: 'relleno-vr',
    fecha: '2022-11-15',
    titulo: 'Nuevo aspirante al trono\nde la realidad virtual',
    imagen: 'figma-frames/news-3.png',
  },
  {
    id: 'relleno-airpods',
    fecha: '2022-11-08',
    titulo: 'Análisis: AirPods Pro de 2ª Generación',
    imagen: 'figma-frames/news-4.png',
  },
  {
    id: 'relleno-proscenic',
    fecha: '2022-11-01',
    titulo: 'Análisis: Proscenic WashVac F20',
    imagen: 'figma-frames/news-5.png',
  },

  /* Los 7 de acá abajo son los que arma la sección Proyectos (`destacado`).
     Las fechas son inventadas y solo sirven para fijar el orden: como son más
     viejas que los análisis de arriba, la portada de la trayectoria no cambia. */
  {
    id: 'relleno-haru',
    fecha: '2022-10-20',
    titulo: 'Haru',
    etiqueta: 'App development',
    imagen: 'figma-frames/image-7.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
    mockups: ['figma-frames/project-haru-1.png', 'figma-frames/project-haru-2.png'],
    destacado: true,
  },
  {
    id: 'relleno-proyecto-2',
    fecha: '2022-09-15',
    titulo: 'Project 2',
    etiqueta: 'Brand identity',
    imagen: 'figma-frames/image-1.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Vestibulum feugiat massa nibh justo proin dignissim purus tristique nisl. Faucibus ipsum mauris sed augue dui. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
    destacado: true,
  },
  {
    id: 'relleno-proyecto-3',
    fecha: '2022-08-10',
    titulo: 'Project 3',
    etiqueta: 'Web design',
    imagen: 'figma-frames/image-4.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere.',
    destacado: true,
  },
  {
    id: 'relleno-proyecto-4',
    fecha: '2022-07-05',
    titulo: 'Project 4',
    etiqueta: 'Illustration',
    imagen: 'figma-frames/image-5.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Pulvinar congue sed eu blandit fusce. Lorem vivamus elementum vitae faucibus malesuada dictum diam.',
    destacado: true,
  },
  {
    id: 'relleno-proyecto-5',
    fecha: '2022-06-01',
    titulo: 'Project 5',
    etiqueta: 'Product design',
    imagen: 'figma-frames/image-6.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit.',
    destacado: true,
  },
  {
    id: 'relleno-proyecto-6',
    fecha: '2022-04-20',
    titulo: 'Project 6',
    etiqueta: 'Editorial',
    imagen: 'figma-frames/news-1.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
    destacado: true,
  },
  {
    id: 'relleno-proyecto-7',
    fecha: '2022-03-08',
    titulo: 'Project 7',
    etiqueta: 'Motion',
    imagen: 'figma-frames/news-2.png',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
    destacado: true,
  },
];

/* ==========================================================================
 * De acá para abajo es maquinaria: no hace falta tocar nada.
 * ========================================================================== */

const ISO_FECHA = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/* El orden se compara sobre el STRING ISO, no sobre objetos Date: 'YYYY-MM' y
   'YYYY-MM-DD' son comparables como texto si se normalizan al mismo largo, y así
   no hay forma de que la zona horaria corra un hito de mes. Un 'YYYY-MM' se
   normaliza al día 01, así que un hito con día explícito del mismo mes queda
   antes (más nuevo) que el que solo trae el mes. */
function claveOrden(fecha: string): string {
  const m = ISO_FECHA.exec(fecha);
  if (!m) return fecha;
  return `${m[1]}-${m[2]}-${m[3] ?? '01'}`;
}

/** Ordena una lista de hitos por fecha descendente (más nuevo primero). */
export function ordenarHitos(lista: readonly HitoTrayectoria[]): HitoTrayectoria[] {
  // Copia: `sort` muta, y `trayectoria` es la fuente de verdad compartida.
  return [...lista].sort((a, b) => claveOrden(b.fecha).localeCompare(claveOrden(a.fecha)));
}

/** Toda la trayectoria, más nueva primero. */
export function hitosOrdenados(): HitoTrayectoria[] {
  return ordenarHitos(trayectoria);
}

/** Solo los hitos marcados con `destacado: true`, más nuevos primero. */
export function hitosDestacados(): HitoTrayectoria[] {
  return ordenarHitos(trayectoria.filter((h) => h.destacado === true));
}

const LOCALES: Record<'esp' | 'eng', string> = { esp: 'es-CL', eng: 'en-US' };

/* Formatea la fecha para mostrarla. La fecha se construye en UTC y se formatea
   en UTC a propósito: `new Date('2022-12')` es medianoche UTC, y formatearla en
   la zona local (Santiago, UTC-3/-4) la mostraría como 30 de noviembre. */
export function formatearFecha(fecha: string, lang: 'esp' | 'eng' = 'esp'): string {
  const m = ISO_FECHA.exec(fecha);
  // Si alguien escribió la fecha en otro formato (o viene de la API), se muestra
  // tal cual en vez de romper.
  if (!m) return fecha;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = m[3] ? Number(m[3]) : 1;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    ...(m[3] ? { day: 'numeric' } : {}),
  }).format(d);
}
