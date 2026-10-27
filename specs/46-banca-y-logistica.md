# SPEC-46 — Tres publicaciones: Cargo Ex, Banco Security y Banco de Chile

> Pedido del usuario (2026-10-27), ítem 3: "antes de Haru y después de Invasión UFPS quiero 3 publicaciones… resalta mi trabajo en
> banco y en logística… lee los escritos que tengo en mi Drive".

## Fuentes
- CV 2026 extendido y normal (`~/Downloads/CV Pedro Rico 2026 - Extendido.pdf` / `- Normal.pdf`):
  - Cargo Ex (logística y última milla), Full Stack, jun-2017 – oct-2019: transformación digital del papel a la informática; web de
    impresión de etiquetas (React, Node.js, AWS); app Android de última milla para repartidores.
  - Banco Security, Full Stack, nov-2019 – abr-2022: botón de pago en línea con 99% de éxito; integración uno a uno con los bancos de
    Chile (API, credenciales, certificación); Node.js, .NET, Angular, Flutter.
  - 3IT (cliente Banco de Chile), Full Stack, may-2023 – mar-2025: migración de APIs Java 8 → 9 → 11 sin cortar el servicio;
    Angular 9, React, JUnit.
- Drive personal (Google Drive conectado, pedro.luis.rico43@gmail.com): docs "Cargo Ex", "Banco Security", "Manual de usuario cargoex".
- Playlist de YouTube (ya citada en `youtube-proyectos-informaticos`): portal y app de última milla de Cargo Ex.

## Alcance
- 3 hitos nuevos con `parrafos` (5, 400–700 palabras, voz de los posts existentes, sin inventar), `etiqueta`, `tituloTarjeta`,
  `imagen` (banner) y 2 `mockups`, cada uno con imágenes PROPIAS y distintas.
- Imágenes: el **ícono/logo de cada empresa** como motivo del banner (logo oficial descargado de su sitio público, sin alterarlo),
  sobre una composición propia en la línea del sitio. Mockups: piezas gráficas con los datos reales del hito (p.ej. "99% de éxito",
  "Java 8 → 9 → 11", flujo papel → etiqueta → última milla).
- Fechas = inicio de cada trabajo (2017-06, 2019-11, 2023-05). **Orden pedido: entre Invasión UFPS y Haru** → como Haru tiene fecha
  de relleno (2022-10-20, "falta la real"), se mueve Haru a `2025-03` y se anota en su comentario que la fecha sigue pendiente.
- No marcar `destacado` (no van al slider).

## AC
- **AC1** En /trayectoria, el orden (más nuevo arriba) deja a Haru antes que Banco de Chile, Banco Security y Cargo Ex, y a esos tres antes que Invasión UFPS.
- **AC2** Cada uno abre en modo post con 5 párrafos, banda con su logo y 2 mockups.
- **AC3** Test SPEC-41 extendido a los 3 ids; tests de assets y unicidad en verde; build en verde.
