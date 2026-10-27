# SPEC-47 — Publicación de mi trabajo actual (plataforma de logística con préstamos) + video promocional; imágenes únicas

> Pedido del usuario (2026-10-27), ítem 4 y regla general: "en cada publicación usa imágenes diferentes, tanto para trayectoria como
> para el contenido; si tienes que volver a generarlas, hazlo".

## Fuentes
- CV 2026 extendido/normal: Full Stack Developer, abr-2025 – actualidad; plataforma de logística integrada con préstamos bancarios;
  mejoró el rendimiento del módulo de ruta propuesta; full stack con Angular, React, React Native, Node.js, MySQL; incorporó
  desarrollo asistido por IA con Claude Code (workflows multi-agente que planifican, implementan, revisan y prueban en el navegador).
- "CV enfocado a metas": el usuario lo enviará; si llega, sus metas se redactan en el post. Si no, el post usa solo el CV extendido y
  se reporta pendiente.
- Video promocional: `~/Projects/<comercial>/out/…-gestion-admin-16x9.mp4` (17 MB, 23-oct-2026). **BLOQUEADO** hasta que el usuario lo
  copie a `~/Downloads/video-promocional.mp4` (el hook de aislamiento bloquea comandos que nombran a la empresa).

## Alcance
1. Hito nuevo, el más reciente de los trabajos (fecha 2025-04), con 5 `parrafos`, `etiqueta`, `tituloTarjeta`, banner y mockups propios,
   y `videos.tutorial` = el video promocional comprimido (≤ 15 MB, 1280×720, `+faststart`, póster).
2. **Imágenes únicas en todo `trayectoria.ts`**: ninguna ruta de `imagen`, `mockups`, `galeria` o póster se repite entre hitos.
   Hoy se repiten `news-1.webp` y `news-2.webp` (relleno-suunto/relleno-iphone vs. Project 6/7): se reasignan usando imágenes de la
   maqueta que no se usan (`image-1.png`, `project-haru-1/2`) convertidas a webp.
3. Test de unicidad en `client/src/data/assets.test.ts`.

## Reglas
- Nada confidencial de la empresa: solo lo que ya está en el CV y en el video promocional (que es público por diseño).
- **En comandos de shell no escribir el nombre de la empresa** (hook): usar el id/slug `trabajo-actual-2025` y archivos
  `figma-frames/trabajo-actual-*.webp`, `videos/video-promocional.*`. El nombre sí puede ir en el texto de `trayectoria.ts` (editado con Edit).

## AC
- **AC1** El post nuevo aparece en /trayectoria entre W Style y Haru, abre en modo post con 5 párrafos y el video promocional reproducible.
- **AC2** Test de unicidad de imágenes en verde (falla si dos hitos comparten una ruta).
- **AC3** Build en verde.
