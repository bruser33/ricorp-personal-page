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
 *     reel: 'https://www.instagram.com/reel/…', // opcional, solo si es destacado
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
 * TRES CAMPOS QUE SOLO USA LA SECCIÓN PROYECTOS
 * ---------------------------------------------
 * Los tres son OPCIONALES y solo hacen falta si el hito además lleva
 * `destacado: true`. En la línea de tiempo no se muestran nunca.
 * 6) `etiqueta` es el textito bajo el título de la tarjeta, que dice de qué
 *    tipo de trabajo se trata: 'App development', 'Brand identity', 'Web
 *    design'… Si no la ponés, la tarjeta sale solo con el título.
 * 7) `mockups` son imágenes EXTRA que se ven al abrir el proyecto (van al
 *    costado del texto). Se escriben igual que `imagen` —ruta dentro de
 *    `client/public`— y entre corchetes, separadas por coma. Sin `mockups`, el
 *    detalle muestra solo el texto.
 * 8) `reel` es la URL de un reel de Instagram sobre el proyecto. Al abrir el
 *    proyecto aparece un enlace "Ver reel" que lo abre en otra pestaña. Si no
 *    hay reel todavía, borrá la línea (o dejala vacía: ''): sin reel el
 *    detalle no muestra nada de Instagram.
 *    Aparte: si el hito tiene `enlace`, el detalle muestra "Ver sitio" (nueva
 *    pestaña). Una ruta del propio sitio se escribe con barra: '/wstyle/'.
 * 9) `tituloTarjeta` (opcional) es un título CORTO para la tarjeta del
 *    slider de Proyectos, que va en letra muy grande: un título largo ocupa
 *    cinco líneas y se sale de la tarjeta. La línea de tiempo y el detalle
 *    siguen usando `titulo`.
 * 10) Un destacado SIN `imagen` no se puede dibujar como tarjeta (la tarjeta ES
 *    la imagen), así que Proyectos lo saltea. En la trayectoria sigue estando.
 * 11) `videos` (opcional) muestra videos DENTRO del post, después del primer
 *    párrafo: `tutorial` (horizontal 16:9, va a la izquierda) y `reel`
 *    (vertical 9:16, a la derecha); en el teléfono van uno debajo del otro.
 *    Cada uno lleva `src` (el .mp4 dentro de `client/public`, ej.
 *    'videos/wstyle-reel.mp4'), `titulo` (texto corto que se ve encima) y,
 *    opcional, `poster` (la imagen que se ve antes de darle play). Comprimí
 *    el .mp4 a 15 MB o menos antes de dejarlo en `client/public/videos/`.
 *
 * EL DETALLE SE VE IGUAL DESDE LOS DOS LADOS
 * ------------------------------------------
 * Si el hito tiene `parrafos`, `mockups`, `videos` o `destacado`, al abrirlo
 * desde la Trayectoria se ve EXACTAMENTE el mismo post que desde el slider de
 * Proyectos (título corto, etiqueta, párrafos, imágenes, videos y enlaces).
 * Sin nada de eso, abre el detalle simple: título, fecha, descripción y "Ver más".
 * ========================================================================== */

export type HitoTrayectoria = {
  id: string;
  /** ISO 'YYYY-MM' o 'YYYY-MM-DD'. De acá salen el orden y el texto de fecha. */
  fecha: string;
  titulo: string;
  descripcion?: string;
  /** Ruta relativa a `client/public`, ej. 'figma-frames/news-1.webp'. */
  imagen?: string;
  enlace?: string;
  /** Texto del enlace en el detalle (por defecto 'Ver sitio'). Para un perfil,
   *  una playlist o un video conviene decir qué es: 'Ver playlist en YouTube'. */
  textoEnlace?: string;
  /** true = además aparece en la sección Proyectos. */
  destacado?: boolean;
  /** Solo Proyectos: tipo de trabajo bajo el título de la tarjeta. */
  etiqueta?: string;
  /** Solo Proyectos: encuadre de la foto en la banda del post (object-position
   *  CSS, p.ej. '50% 21%'). La banda es muy apaisada y por defecto muestra la
   *  franja del medio; si lo importante está más arriba, se corre acá. */
  focoBanner?: string;
  /** Solo Proyectos: alto de la banda del post como fracción de la pantalla
   *  (por defecto 0.4). Más alta si el motivo es un logo que no entra. */
  altoBanner?: number;
  /** Solo Proyectos: el texto LARGO del post (un string por párrafo). Sin él,
   *  el post usa `descripcion`. La línea de tiempo usa siempre `descripcion`. */
  parrafos?: string[];
  /** Solo Proyectos: título corto para la tarjeta del slider (va en letra muy
   *  grande). Sin él se usa `titulo`. */
  tituloTarjeta?: string;
  /** Solo Proyectos: imágenes extra del detalle, relativas a `client/public`. */
  mockups?: string[];
  /** Solo Proyectos: URL de un reel de Instagram. Ausente o '' = no se muestra. */
  reel?: string;
  /** Videos auto-hospedados del post (SPEC-39): tutorial 16:9 a la izquierda y
   *  reel 9:16 a la derecha, después del primer párrafo. Rutas relativas a
   *  `client/public`, ej. 'videos/wstyle-reel.mp4'. */
  videos?: { tutorial?: VideoPost; reel?: VideoPost };
};

/** Un video del post: el MP4 (H.264 + AAC, ≤ 15 MB), su póster opcional y un
 *  título corto que se ve encima y hace de nombre accesible. */
export type VideoPost = {
  src: string;
  poster?: string;
  titulo: string;
};

/* ---------------------------------------------------------------------------
 * TODO(pedro): reemplazar por tu trayectoria real.
 * W Style (el primero) es real. Los 12 hitos que le siguen son CONTENIDO DE
 * RELLENO heredado de la maqueta: los 6 primeros son análisis de tecnología que
 * no son tuyos, y los 6 con `destacado` son los proyectos de ejemplo que traía la maqueta (títulos "Project N" y
 * textos en lorem ipsum). Están solo para que las secciones tengan forma
 * mientras armás tu historia: borralos todos y escribí los tuyos.
 * ------------------------------------------------------------------------- */
export const trayectoria: HitoTrayectoria[] = [
  /* Proyecto real (SPEC-20). Por fecha es el hito más nuevo: abre la
     trayectoria y la sección Proyectos. Imagen y mockups son frames de la
     secuencia de Blender de la propia landing (client/public/wstyle/seq/).
     Cuando el reel esté en Instagram, agregá la línea `reel: 'https://…'`. */
  {
    id: 'wstyle-2026',
    fecha: '2026-10',
    titulo: 'W Style',
    etiqueta: 'Web design + 3D',
    imagen: 'figma-frames/wstyle-card.webp',
    descripcion:
      'Landing inmersiva para la barbería W Style, en Santiago. El recorrido es una secuencia renderizada en Blender que avanza con el scroll, con dirección de arte "Noir de oficio". Incluye carta de servicios con precios en CLP (corte, corte + barba, perfilado, lavado + masaje, limpieza facial), membresía Club W, reserva por WhatsApp, horario y ubicación. Hecha en React + TypeScript + Vite, con HTML prerenderizado para SEO, variantes HD para escritorio y móvil, y respaldo en three.js. Publicada en ricorp.cl/wstyle.',
    mockups: ['figma-frames/wstyle-mockup-desktop.webp', 'figma-frames/wstyle-mockup-mobile.webp'],
    parrafos: [
      'W Style es una barbería de Santiago que quería una web a la altura de su oficio, y nos propusimos que entrar a su sitio se sintiera como cruzar la puerta del local. Por eso la landing no es una página más con fotos: es un recorrido inmersivo en el que una secuencia renderizada en Blender avanza a medida que haces scroll, con una dirección de arte que bautizamos "Noir de oficio": luces bajas, materiales nobles y el detalle de cada herramienta.',
      'El reto técnico fue que esa secuencia se viera fluida en cualquier dispositivo. Preparamos variantes HD para escritorio y para móvil, la cargamos de forma progresiva para no hacer esperar a nadie y dejamos un respaldo en three.js para los navegadores que lo necesitan. Todo está construido en React con TypeScript y Vite, y el HTML se prerenderiza para que Google pueda leer la página completa desde el primer momento.',
      'Pero una barbería vive de sus clientes, así que el recorrido termina en lo importante: la carta de servicios con precios en pesos chilenos (corte, corte + barba, perfilado, lavado + masaje y limpieza facial), la membresía Club W, el horario, la ubicación y la reserva directa por WhatsApp, a un toque desde el teléfono.',
      'Cuidamos también lo que no se ve. La secuencia se adapta a la pantalla en la que la miras, los textos se revelan con el ritmo del recorrido y la página respeta a quien prefiere menos movimiento. Cada detalle, desde los precios hasta el botón de reserva, se pensó para que el cliente llegue a la barbería sabiendo exactamente qué quiere.',
      'Hoy W Style está publicada en ricorp.cl/wstyle y es uno de los proyectos que mejor resume cómo nos gusta trabajar: entender el negocio, contar su historia con tecnología de punta y que todo termine en algo simple para el usuario. ¡Te invitamos a recorrerla y a hacerte un corte!',
    ],
    enlace: '/wstyle/',
    videos: {
      tutorial: {
        src: 'videos/wstyle-tutorial.mp4',
        poster: 'videos/wstyle-tutorial.webp',
        titulo: 'Tutorial: agendar y pagar',
      },
      reel: {
        src: 'videos/wstyle-reel.mp4',
        poster: 'videos/wstyle-reel.webp',
        titulo: 'Reel',
      },
    },
    destacado: true,
  },

  {
    id: 'relleno-radeon',
    fecha: '2022-12-14',
    titulo: 'Análisis: AMD Radeon RX 7900 XTX',
    imagen: 'figma-frames/news-featured.webp',
  },
  {
    id: 'relleno-suunto',
    fecha: '2022-12-02',
    titulo: 'Análisis: Suunto 9 Peak Pro',
    imagen: 'figma-frames/news-1.webp',
  },
  {
    id: 'relleno-iphone',
    fecha: '2022-11-24',
    titulo: 'Análisis: iPhone 14 vs 14 Plus\nvs 14 Pro vs 14 Pro Max',
    imagen: 'figma-frames/news-2.webp',
  },
  {
    id: 'relleno-vr',
    fecha: '2022-11-15',
    titulo: 'Nuevo aspirante al trono\nde la realidad virtual',
    imagen: 'figma-frames/news-3.webp',
  },
  {
    id: 'relleno-airpods',
    fecha: '2022-11-08',
    titulo: 'Análisis: AirPods Pro de 2ª Generación',
    imagen: 'figma-frames/news-4.webp',
  },
  {
    id: 'relleno-proscenic',
    fecha: '2022-11-01',
    titulo: 'Análisis: Proscenic WashVac F20',
    imagen: 'figma-frames/news-5.webp',
  },

  /* Proyectos informáticos (slider) = SOLO los mejores: hoy W Style, Haru e
     Invasión UFPS (pedido 2026-10-18: "por ahora solo 3"). Los "Project N" de
     acá abajo son ejemplos de relleno: ya no van al slider, quedan en la
     Bitácora hasta que se reemplacen o se borren. Fechas inventadas. */
  /* Haru: proyecto real (descripción de Pedro, 2026-10-18). La fecha sigue
     siendo la de relleno: falta la real. */
  {
    id: 'haru',
    fecha: '2022-10-20',
    titulo: 'Haru',
    etiqueta: 'App development',
    /* Banner HD (2880x1620) al estilo del de Invasión UFPS: el logo ORIGINAL
       (HARU/Brand/Haru-logo.svg, vectorial, rasterizado a 900 px en el naranjo
       de marca #FFAF3B) centrado sobre las hojas del brand board (0- Brand.png)
       desenfocadas y oscurecidas, como el fondo de las pantallas de login. */
    imagen: 'figma-frames/haru-banner-hd.webp',
    /* El logo es el motivo: banda alta como la de Invasión UFPS. Encuadre al
       centro: el logo está al 45% del alto, entra entero con aire a 1440x540 y
       en 390x506 (ocupa ~72% del ancho) y deja libre la parte baja al título. */
    altoBanner: 0.6,
    focoBanner: '50% 50%',
    descripcion:
      'Haru nace de una idea simple: hay muchísimos trabajos que la gente hace todos los días de manera informal y que merecen hacerse con las mismas garantías que cualquier otro, como acompañar a alguien a una cita médica, hacer un trámite o dar una mano por unas horas. Construimos una app para regularizar ese tipo de trabajos, conectando a quien necesita la ayuda con quien la ofrece, de forma clara y segura para las dos partes. ¡Creemos que la tecnología tiene que servir justamente para eso: hacer más fácil y más digno el trabajo de todos los días!',
    /* Solo las 2 pantallas que cuentan la app (el detalle está maquetado para
       2 teléfonos): el home con los servicios cercanos y el servicio en curso
       con su cronómetro. Recortadas de "44 vistas" (HARU.zip); las tablas son
       de 1920 px, así que cada teléfono se escaló 2× con Lanczos. */
    mockups: ['figma-frames/haru-brand.webp', 'figma-frames/haru-home.webp'],
    parrafos: [
      'Haru nace de una idea simple: hay muchísimos trabajos que la gente hace todos los días de manera informal y que merecen hacerse con las mismas garantías que cualquier otro, como acompañar a alguien a una cita médica, hacer un trámite, dar una clase particular o una mano en el hogar por unas horas. Construimos una app para regularizar ese tipo de trabajos, conectando a quien necesita la ayuda con quien la ofrece, de forma clara y segura para las dos partes.',
      'Todo parte de una identidad propia: "Ayuda, Crea, Anuncia, Crece". Elegimos la tipografía Montserrat, una paleta de verdes y naranjos que transmite confianza y cercanía, y fondos de hojas que acompañan cada pantalla. La app se organiza en tres pestañas: Asistir, para encontrar a alguien que te ayude; Servicios, para explorar por categorías como Hogar, Salud, Educación o Belleza según la distancia y las calificaciones; y Crear, para publicar tu propio servicio con su precio por hora y tu disponibilidad.',
      'Cada perfil muestra su experiencia, su calificación y sus horarios, y si el precio no calza, se puede negociar las horas y el valor directamente desde la app, con un chat para coordinar los detalles. Al llegar el momento, el servicio se inicia con un cronómetro que lleva el tiempo real y el tiempo extra.',
      'Para quien ofrece su trabajo, Haru es también una vitrina: puede mostrar fotos de lo que hace, describir su experiencia en meses o años, decidir si va hasta la casa del cliente y definir su radio de atención. Las notificaciones avisan cuando alguien quiere contratarte, cuando un aspirante se postula a tu servicio y cuando falta poco para empezar, para que nadie llegue tarde a su compromiso.',
      'Al terminar, Haru muestra un resumen con el total a recibir, la persona califica el servicio y puede premiarlo con una insignia, y el pago queda registrado por transferencia o efectivo, con una comisión clara para la plataforma. ¡Creemos que la tecnología tiene que servir justamente para eso: hacer más fácil, más seguro y más digno el trabajo de todos los días!',
    ],
    destacado: true,
  },
  {
    id: 'relleno-proyecto-3',
    fecha: '2022-08-10',
    titulo: 'Project 3',
    etiqueta: 'Web design',
    imagen: 'figma-frames/image-4.webp',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere.',
  },
  {
    id: 'relleno-proyecto-4',
    fecha: '2022-07-05',
    titulo: 'Project 4',
    etiqueta: 'Illustration',
    imagen: 'figma-frames/image-5.webp',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Pulvinar congue sed eu blandit fusce. Lorem vivamus elementum vitae faucibus malesuada dictum diam.',
  },
  {
    id: 'relleno-proyecto-5',
    fecha: '2022-06-01',
    titulo: 'Project 5',
    etiqueta: 'Product design',
    imagen: 'figma-frames/image-6.webp',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit.',
  },
  {
    id: 'relleno-proyecto-6',
    fecha: '2022-04-20',
    titulo: 'Project 6',
    etiqueta: 'Editorial',
    imagen: 'figma-frames/news-1.webp',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
  },
  {
    id: 'relleno-proyecto-7',
    fecha: '2022-03-08',
    titulo: 'Project 7',
    etiqueta: 'Motion',
    imagen: 'figma-frames/news-2.webp',
    descripcion:
      'Lorem ipsum dolor sit amet consectetur. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
  },
  /* Workana: datos del perfil público (2026-10-18), como texto propio y con
     enlace al perfil — sin capturas ni logo (los TyC de Workana no lo permiten)
     y sin nombres de clientes en las reseñas. La fecha es aproximada: el perfil
     dice "Registrado hace 11 años" y las primeras reseñas son de esa época.
     `parrafos` (SPEC-41): solo reescribe datos de la `descripcion` (tipos de
     trabajo, 10 proyectos, 13 calificaciones, certificaciones, las dos citas
     textuales). El perfil público devolvió 403 el 2026-10-27 y no hubo correos
     de Workana en el Gmail conectado: no se agregó ningún dato nuevo. */
  {
    id: 'workana-freelancer',
    fecha: '2015-01',
    titulo: 'Freelancer en Workana\ndesde hace 11 años',
    tituloTarjeta: 'Workana',
    /* SPEC-42: portada y mockups tipográficos con los datos de la ficha (11
       años, 10 proyectos, 13 calificaciones, certificaciones, dos reseñas sin
       nombre). Sin logo ni capturas de Workana. Generadas con
       client/scripts/banners-trayectoria.mjs. */
    imagen: 'figma-frames/workana-freelancer-banner.webp',
    mockups: ['figma-frames/workana-freelancer-1.webp', 'figma-frames/workana-freelancer-2.webp'],
    parrafos: [
      'Hace once años abrimos una puerta que hasta hoy no se ha cerrado: mi perfil de freelancer en Workana. La idea era simple y a la vez ambiciosa: que el software que sabíamos construir no tuviera que quedarse en la ciudad donde estábamos, sino que pudiera llegar a clientes de toda Latinoamérica que necesitaran una app, un sitio web o una idea convertida en producto. Workana nos dio esa vitrina, y desde entonces ha sido una parte constante de mi trayectoria.',
      'Los proyectos fueron de lo más variados. Desarrollamos aplicaciones móviles para Android e iOS, sitios web a la medida de cada negocio y también trabajos de animación con Three.js, donde el navegador deja de ser una hoja plana y se convierte en un espacio en tres dimensiones. Cada encargo traía su propio desafío y nos obligaba a aprender algo nuevo, porque trabajar a distancia significa entender rápido qué necesita el cliente, proponer una solución concreta y explicarla con claridad, sin una reunión cara a cara de por medio.',
      'Ese aprendizaje también quedó por escrito. En la plataforma rendimos las certificaciones de JavaScript Avanzado, donde obtuvimos un 80%, de React Native y de Angular. Más que un número en una ficha, esas certificaciones son una forma de mostrarle a un cliente que no nos conoce en persona que lo que decimos saber hacer, lo sabemos hacer. Cuando alguien te encarga su proyecto sin haberte visto nunca, cada señal de confianza cuenta, y preferimos que esas señales hablen por nosotros antes que cualquier promesa.',
      'Hoy mi ficha suma 10 proyectos completados y 13 calificaciones de clientes, y detrás de cada una hay un trabajo hecho en equipo con alguien que confió en nosotros. Por respeto a esas personas no publicamos sus nombres, pero sí nos quedamos con sus palabras: "su profesionalismo me inspiró confianza y no me equivoqué; definitivamente lo buscaré para otros proyectos" y "muy buen profesional, cumple en las fechas establecidas y con gran responsabilidad". Leerlas todavía nos recuerda por qué este trabajo vale la pena.',
      'Esas frases resumen lo que buscamos en cada entrega: cumplir con lo prometido, en la fecha acordada, y que el cliente sepa que puede volver a contar con nosotros para lo que venga. Si quieres conocer el perfil completo, con sus calificaciones y certificaciones, lo encuentras enlazado en este mismo post. Y si estás pensando en una app, un sitio web o una experiencia en 3D, conversemos: cada proyecto nuevo es una oportunidad de volver a aprender. ¡Once años después, seguimos con las mismas ganas de construir el próximo proyecto contigo!',
    ],
    descripcion:
      'En Workana empecé a construir software para clientes de toda Latinoamérica: apps Android e iOS, sitios web y animación con Three.js. Hoy mi ficha suma 10 proyectos completados, 13 calificaciones de clientes y certificaciones en JavaScript Avanzado (80%), React Native y Angular. De esos clientes me quedo con frases como "su profesionalismo me inspiró confianza y no me equivoqué; definitivamente lo buscaré para otros proyectos" y "muy buen profesional, cumple en las fechas establecidas y con gran responsabilidad", ¡que son justamente lo que busco en cada entrega!',
    enlace: 'https://www.workana.com/freelancer/ad4614d2e994b49a7fd475e709d3020e',
    textoEnlace: 'Ver perfil en Workana',
  },
  /* Tesis: videojuego "Invasión UFPS" en Unity. Etapas reconstruidas de los
     correos 2016-2017 (anteproyecto con el director, contrato del ilustrador
     Junior Molina, menú y primer escenario, personaje y sprites, logo y
     enemigos, pruebas de niveles) y del video de la playlist. */
  {
    id: 'tesis-invasion-ufps',
    fecha: '2017-04',
    titulo: 'Invasión UFPS: mi videojuego\nde tesis en Unity',
    /* Pantalla de inicio del juego, ilustrada por Junior Molina (rescatada del
       correo "Imagenes, logo, elementos.", 16-ene-2017). Versión HD (2880 px):
       fondo original reescalado 4x con Real-ESRGAN (modelo digital-art, vía
       Upscayl), logo reconstruido en Blender a partir del original, el texto
       "Toca la pantalla" borrado (pedido), y recortada simétrica alrededor del
       logo para que quede al centro. El original medía 963 px y se veía
       borroso a sangre. */
    imagen: 'figma-frames/invasion-ufps-menu-hd.webp',
    /* El logo es el motivo: banda más alta (60% de la pantalla) para que entre
       entero con aire, y encuadre corrido arriba porque su centro está al 33%
       del alto de la imagen. */
    altoBanner: 0.6,
    focoBanner: '50% 4%',
    /* También en "Proyectos informáticos" (pedido 2026-10-18). Sin mockups: el
       detalle está maquetado para 2 teléfonos verticales y el juego es
       apaisado; la pantalla de inicio ya va como imagen principal. */
    destacado: true,
    etiqueta: 'Game development',
    tituloTarjeta: 'Invasión UFPS',
    mockups: ['figma-frames/invasion-ufps-personaje.webp', 'figma-frames/invasion-ufps-logo.webp'],
    parrafos: [
      'Para graduarme de ingeniero en la UFPS no quisimos hacer una tesis de papel: hicimos un videojuego. Invasión UFPS nació como un prototipo que habíamos armado un par de años antes y que decidimos convertir en un juego completo en Unity, ambientado en nuestra propia universidad. El primer paso fue el anteproyecto, que pulimos una y otra vez con nuestro director hasta dejarlo listo en 2016.',
      'Un juego vive de su arte, así que armamos el equipo y contratamos a Junior Molina como ilustrador. Le enviamos fotos reales de la universidad para que el menú principal partiera desde la entrada de la UFPS y el primer escenario se pareciera al campus. Junior diseñó al protagonista, el estudiante, despiezado parte por parte con una guía de capas para poder animarlo, con sus poses normal, golpeado y final, y sus ataques con escuadras que brillan.',
      'Después llegaron el logo, los elementos del escenario, como el pupitre, el bloque de cemento, el topógrafo y el bote de basura, y los enemigos, como la rata de latas. Con todo ese material programamos los niveles en Unity, ensamblando cada sprite y cada animación.',
      'Coordinar con un ilustrador a distancia fue una escuela en sí misma. Le pasábamos referencias, videos y guías de cómo se iban a mover los personajes, él nos devolvía las piezas por partes, y nosotros las montábamos en el juego y le enviábamos la APK para que lo probara. Ese ida y vuelta, correo a correo, fue lo que le dio al juego su identidad.',
      'La última etapa fue probar y probar: revisar los niveles uno por uno, corregir las vidas, los conteos y los movimientos hasta que cada nivel funcionó de punta a punta, y grabar el resultado para compartirlo en video. ¡Un proyecto que nos enseñó a llevar una idea desde el papel hasta un juego jugable, trabajando en equipo con un artista de verdad!',
    ],
    descripcion:
      'Para graduarme de ingeniero en la UFPS no quisimos hacer una tesis de papel: hicimos un videojuego. Lo construimos por etapas. Primero el anteproyecto, que pulimos con nuestro director hasta dejarlo listo en 2016. Después armamos el equipo: contratamos a Junior Molina como ilustrador y le pasamos fotos reales de la universidad para que el menú principal partiera de la entrada de la UFPS y el primer escenario se pareciera al campus. Luego vino el arte del personaje, el estudiante, despiezado parte por parte para animarlo con sprites y sus ataques, seguido del logo, los elementos del escenario y los enemigos, como la rata de latas. Con eso programamos los niveles en Unity y los probamos una y otra vez, corrigiendo vidas, conteos y movimientos hasta que cada nivel funcionó de punta a punta. ¡Un proyecto que nos enseñó a llevar una idea desde el papel hasta un juego jugable!',
    enlace: 'https://www.youtube.com/watch?v=1Oq8jxT7OgE',
    textoEnlace: 'Ver el juego en YouTube',
  },
  /* Playlist "Proyectos Informaticos" del canal de YouTube de Pedro (11 videos,
     de hace 7 a 11 años). Fecha aproximada: el grueso de los videos es de hace
     ~9 años.
     `parrafos` (SPEC-41): títulos, fechas de publicación, duraciones y
     descripciones de los 11 videos de la playlist (leídos 2026-10-27):
     SmartCorp nov-2014 (Android Studio + PHP); Vendifood app/web, Hambai POS,
     trackeo vehicular, Eventus 24 y MRCI oct-2016 (ionic 1 o Bootstrap + PHP
     nativo); tesis Invasión UFPS abr-2017 (12:45); demo Monopoly nov-2017;
     Cargo Ex app (desde 1-sep-2018) y portal (desde 1-dic-2018, 5 módulos en
     6 meses, React/Redux) con Node y AWS EC2/Lambda/API Gateway, subidos
     may-2019. */
  {
    id: 'youtube-proyectos-informaticos',
    fecha: '2017-01',
    titulo: 'Mis entregas, documentadas\nen YouTube',
    tituloTarjeta: 'YouTube',
    /* SPEC-42: portada y mockups con las miniaturas y títulos reales de los 11
       videos de la playlist. Generadas con client/scripts/banners-trayectoria.mjs. */
    imagen: 'figma-frames/youtube-proyectos-informaticos-banner.webp',
    mockups: [
      'figma-frames/youtube-proyectos-informaticos-1.webp',
      'figma-frames/youtube-proyectos-informaticos-2.webp',
    ],
    parrafos: [
      'Desde temprano tomamos una costumbre que nos ha acompañado siempre: cada proyecto que entregábamos lo dejábamos grabado funcionando. Un documento o una captura pueden decir mucho, pero un video muestra de verdad cómo quedó una aplicación, cómo se navega y cómo responde. Así nació la playlist "Proyectos Informaticos" de mi canal de YouTube, pensada para que el cliente, los colegas y cualquier estudiante pudieran ver el trabajo tal como se entregó, sin adornos. Con los años, esa playlist se convirtió también en un registro de cómo fuimos creciendo.',
      'El video más antiguo es de noviembre de 2014 y lleva el nombre de SmartCorp, nuestro equipo de ese año en el Torneo TuApp: una app nativa para Android construida en Android Studio, con un backend en PHP. En octubre de 2016 llegó una tanda completa de entregas: la aplicación móvil y la página web de Vendifood, el POS móvil Hambai, una aplicación de trackeo vehicular, Eventus 24 y un análisis contable para MRCI. Seis proyectos distintos, cada uno con su propio cliente y su propia necesidad, grabados en apenas unos días.',
      'Esos proyectos nos enseñaron a resolver mucho con pocas herramientas. Las apps móviles las construimos con ionic 1 y un backend en PHP nativo, mientras que la web de Vendifood y la aplicación de trackeo vehicular las hicimos con PHP nativo y Bootstrap. Era un stack sencillo, pero nos permitía entregar rápido y que cada cliente tuviera su producto funcionando en el teléfono o en el navegador, que al final es lo que importa.',
      'En 2017 la playlist se llenó de Unity 3D: en abril subimos Invasión UFPS, mi proyecto de tesis de ingeniería informática, con más de doce minutos de juego, y en noviembre una demo de Monopoly, también hecha en Unity. Después vino Cargo Ex, un proyecto de logística: una app de última milla en Android nativo, iniciada el 1 de septiembre de 2018, y un portal en React con Redux, iniciado el 1 de diciembre, que en seis meses sumó cinco módulos de gestión. Ambos corren sobre Node y AWS, con EC2, Lambda y API Gateway.',
      'Hoy son once videos, grabados entre 2014 y 2019, y juntos cuentan cómo fuimos pasando de PHP e ionic a React, Node y la nube de AWS. Volver a verlos es recordar cada entrega y confirmar que mostrar el trabajo funcionando sigue siendo la mejor carta de presentación. La mayoría dura entre dos y cuatro minutos, lo justo para ver cada proyecto en acción. ¡Te invitamos a darle play a la playlist y ver cada proyecto tal como se entregó!',
    ],
    descripcion:
      'Cada proyecto que entregaba lo dejaba grabado funcionando, para que el cliente, los colegas y cualquier estudiante pudieran ver de verdad cómo había quedado. Así nació la playlist "Proyectos Informaticos" de mi canal: apps móviles como Vendifood, el POS móvil Hambai y una app de trackeo vehicular, el sitio web de Vendifood, Eventus 24, un análisis contable para MRCI, el portal y la app de última milla de Cargo Ex con React, Android, AWS y Node, y hasta mi proyecto de tesis en Unity 3D. ¡Once videos que muestran el trabajo tal como se entregó!',
    enlace: 'https://www.youtube.com/watch?v=I8gpO6U7JJg&list=PLz0yhZJ2NlfMSuAyDHCZFtMt2BgIEKXeZ',
    textoEnlace: 'Ver playlist en YouTube',
  },
  /* Reseñas del Torneo TuApp. Los datos (fechas, lugar, equipos, carta de
     finalistas y certificado) salen de los correos de TuApp.org de 2013 y 2014.
     `parrafos` (SPEC-41): mismos datos que la `descripcion` de cada uno, más el
     video "Video SmartCorp" de la playlist (1-nov-2014, Android Studio + PHP).
     El Gmail conectado hoy es el de trabajo y no tiene esos correos: el resto
     de los párrafos es reflexión, sin datos nuevos (no se sabe qué hacía la
     app de R2D2 ni la de SmartCorp, así que no se describe). */
  {
    id: 'tuapp-2014-smartcorp',
    fecha: '2014-12-10',
    titulo: 'Finalistas del Torneo TuApp 2014\ncon SmartCorp',
    tituloTarjeta: 'TuApp 2014',
    /* SPEC-42: portada tipográfica (10-12-2014, GAM, Santiago) y mockups con la
       miniatura real del "Video SmartCorp" de la playlist (nov-2014). Generadas
       con client/scripts/banners-trayectoria.mjs. */
    imagen: 'figma-frames/tuapp-2014-smartcorp-banner.webp',
    mockups: ['figma-frames/tuapp-2014-smartcorp-1.webp', 'figma-frames/tuapp-2014-smartcorp-2.webp'],
    parrafos: [
      'Un año después de nuestra primera final, volvimos al Torneo TuApp. Esta vez nos presentamos como equipo SmartCorp, con la experiencia de 2013 a cuestas y una meta clara: llegar otra vez a la final, pero mejor preparados. Ya sabíamos lo que significaba presentar frente a un público exigente, y queríamos que esta vez la aplicación hablara por sí sola, funcionando de punta a punta y sin depender de explicaciones. Volver a un torneo después de haber llegado a la final no es lo mismo que ir por primera vez: uno sabe lo que viene y también lo que está en juego.',
      'El camino a la final pasaba por un video beta: había que mostrar la app funcionando antes de que se definieran los finalistas. De esa misma época es el video de SmartCorp que todavía está en mi canal de YouTube, subido en noviembre de 2014: una app nativa para Android construida en Android Studio, con un backend en PHP. Después de enviar nuestro video beta recibimos la carta oficial de TuApp.org que nos confirmaba en la final.',
      'La final fue el 10 de diciembre en el Centro Cultural Gabriela Mistral (GAM) de Santiago. Las reglas eran claras y exigentes: tres minutos para presentar la app en vivo, funcionando en nuestro propio smartphone, frente a empresarios, inversionistas y estudiantes de toda la región. En tres minutos no hay espacio para improvisar: cada palabra y cada toque en la pantalla tienen que estar pensados, porque una falla en vivo no se puede esconder. Por eso la demostración tenía que ser real, en nuestro propio teléfono, tal como la usaría cualquier persona.',
      'Lo más exigente fue que todo eso pasó mientras cerrábamos el semestre en la universidad. El semestre no se detuvo por el torneo, así que preparar la presentación fue también un ejercicio de organización: ensayar el recorrido por la app, ajustar lo que fallaba y volver a ensayar, una y otra vez, hasta que cada paso salía natural y el tiempo alcanzaba justo para mostrarlo todo.',
      'De esa final nos quedó el certificado de participación firmado por la dirección de TuApp.org y una lección que sigue vigente en cada proyecto que entregamos: la preparación se nota cuando llega el momento de mostrar el trabajo, y lo que parece fácil sobre el escenario es fruto de muchas horas de práctica antes. Mirar ese certificado hoy es recordar a un equipo de estudiantes que se atrevió a mostrar su trabajo frente a quienes podían invertir en él. ¡Practicar y practicar hasta lograrlo sí funciona!',
    ],
    descripcion:
      'Volvimos al Torneo TuApp, esta vez como equipo SmartCorp, y después de enviar nuestro video beta recibimos la carta oficial que nos confirmaba en la final. El 10 de diciembre presentamos nuestra app en vivo en el Centro Cultural Gabriela Mistral (GAM) de Santiago: tres minutos, funcionando en nuestro propio smartphone, frente a empresarios, inversionistas y estudiantes de toda la región. Lo logramos mientras cerrábamos semestre en la universidad, y de ahí nos quedó el certificado de participación firmado por la dirección de TuApp.org y la certeza de que ¡practicar y practicar hasta lograrlo sí funciona!',
  },
  {
    id: 'tuapp-2013-r2d2',
    fecha: '2013-12-11',
    titulo: 'Seleccionados para la final del\nTorneo Universitario de Apps TuApp 2013',
    tituloTarjeta: 'TuApp 2013',
    /* SPEC-42: portada tipográfica (11-12-2013, Santiago, equipo R2D2) y mockups
       con el formato de la final (3 min + 1 de preguntas) y su ficha. Generadas
       con client/scripts/banners-trayectoria.mjs. */
    imagen: 'figma-frames/tuapp-2013-r2d2-banner.webp',
    mockups: ['figma-frames/tuapp-2013-r2d2-1.webp', 'figma-frames/tuapp-2013-r2d2-2.webp'],
    parrafos: [
      'En 2013 nos animamos por primera vez a competir con una aplicación móvil. Formamos el equipo R2D2 y participamos en el Torneo Universitario de Apps de TuApp.org, una competencia pensada para estudiantes que quieren llevar lo que aprenden en clases a un producto real. Para un grupo que recién empezaba en el mundo de las apps, presentarse ya era un desafío, y llegar al evento final parecía una meta lejana. Lo que teníamos eran ganas, una idea y muchas horas de trabajo en la universidad.',
      'La noticia llegó por correo: TuApp.org nos confirmó que estábamos entre los equipos seleccionados para presentar en el evento final, el 11 de diciembre de 2013 en Santiago de Chile. Pasar de una idea trabajada en la universidad a un escenario de ese nivel era un salto enorme, y también la oportunidad de medir nuestro trabajo con otros equipos universitarios. Que una organización dedicada a promover el talento universitario en aplicaciones eligiera nuestro proyecto fue una enorme motivación para seguir.',
      'El formato no daba espacio para rodeos: tres minutos para mostrar la app y uno para responder las preguntas del público. Tres minutos obligan a decidir qué es lo esencial: qué problema resuelve la aplicación, cómo se usa y por qué vale la pena. Cuando el tiempo es tan corto, cada segundo cuenta, y aprender a resumir un proyecto se vuelve tan importante como saber programarlo. Ese minuto de preguntas, además, es el más honesto: el público pregunta lo que de verdad le importa, y responder bien depende de conocer el proyecto de punta a punta.',
      'El público hacía que todo fuera todavía más importante. Ese día había empresarios, profesores y siete ejecutivos de Google USA que venían a buscar talento latinoamericano. Para un grupo de estudiantes, presentar frente a personas así era una oportunidad que no se repite seguido, y también una forma de entender cómo se mira un producto desde afuera de la sala de clases. Ver de cerca a una empresa como Google interesada en el talento de la región nos mostró que el trabajo bien hecho no tiene fronteras.',
      'TuApp 2013 fue nuestro primer paso en las competencias de aplicaciones, y no fue el último: al año siguiente volvimos al torneo como equipo SmartCorp y llegamos otra vez a la final. Desde entonces, cada vez que mostramos un proyecto recordamos esos tres minutos y ese minuto de preguntas. Esa primera experiencia nos dejó la prueba de que lo que construíamos en la universidad podía llegar ¡mucho más lejos de lo que imaginábamos!',
    ],
    descripcion:
      'Nuestra primera vez compitiendo con una aplicación móvil, como equipo R2D2: fuimos seleccionados para presentar en el evento final del Torneo Universitario de Apps, el 11 de diciembre de 2013 en Santiago de Chile, con tres minutos para mostrar la app y uno para las preguntas del público. Ese día había empresarios, profesores y siete ejecutivos de Google USA buscando talento latinoamericano, y para un grupo de estudiantes eso fue la prueba de que lo que construíamos en la universidad podía llegar ¡mucho más lejos de lo que imaginábamos!',
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
