# SPEC-39 — El post de un proyecto se ve igual desde Trayectoria y desde el slider, y el de W Style lleva sus dos videos

> Pedido del usuario (2026-10-27), ítems 1 y 3 de la lista de correcciones. Captura de referencia:
> `~/Desktop/Captura de pantalla 2026-10-27 a la(s) 1.39.42 p.m..png` (post de W Style abierto desde el slider).

## Historia
Como visitante de ricorp.cl, quiero que el post de un proyecto se vea igual si lo abro desde la página
Trayectoria o desde el slider de Proyectos, y que el de W Style muestre el tutorial y el reel, para
conocer el proyecto completo sin importar por dónde entré.

## Estado actual (diagnóstico)
- Slider (`client/src/components/Projects.tsx:851-867`): `DetailModal` con `title=tituloTarjeta`, `imagePosition=focoBanner`,
  `heroVh=altoBanner`, `tag=etiqueta`, `footer=<ProjectLinks>` y cuerpo `<PostCuerpo>` (párrafos + mockups intercalados). **Es la forma correcta.**
- Trayectoria (`client/src/components/News.tsx:241-260`): `DetailModal` con título completo, tag = fecha,
  solo `descripcion` y un enlace "Ver más". Por eso W Style, Haru e Invasión UFPS se ven distintos.

## Alcance
- **Incluye:**
  1. Extraer `PostCuerpo` (y lo que necesite: `rutaImagen`, `tituloTarjeta`, `rotulo`) a un módulo compartido
     (p.ej. `client/src/components/Post.tsx`) y usarlo desde `Projects.tsx` y `News.tsx`.
  2. En `News.tsx`, cuando el hito tenga `parrafos`, `mockups`, `destacado` o `videos`, abrir el modal con
     **exactamente las mismas props** que el slider (título corto, etiqueta, foco/alto de banda, `ProjectLinks`, `PostCuerpo`).
     Un hito sin nada de eso sigue abriéndose como hoy (título + fecha + descripción + "Ver más"), pero con
     `PostCuerpo` si tiene `parrafos` (lo usará SPEC-41).
  3. Campo nuevo opcional en `HitoTrayectoria`: `videos?: { tutorial?: VideoPost; reel?: VideoPost }` con
     `VideoPost = { src: string; poster?: string; titulo: string }` (rutas relativas a `client/public`), documentado
     en el comentario de cabecera de `trayectoria.ts` como los otros campos.
  4. `PostCuerpo` dibuja una fila de videos: **tutorial a la izquierda (16:9) y reel a la derecha (9:16)**, alineados
     al alto; en mobile (≤ 768 px) se apilan (tutorial arriba, reel abajo, reel con ancho máximo de teléfono).
  5. Assets: comprimir a `client/public/videos/`
     - tutorial: `~/Projects/barberia-3d-tutorial/clip-tutorial/out/wstyle-tutorial-16x9.mp4` (= `~/Desktop/WS-Style-tutorial.mp4`, 43 MB)
     - reel: `~/Projects/barberia-3d/clip/out/wstyle-reel-9x16.mp4` (28 MB)
     con `ffmpeg` (H.264 + AAC, `-movflags +faststart`), y un póster `.webp` por video (cuadro representativo).
  6. Hito `wstyle-2026`: agregar `videos` con ambos.

## Reglas de negocio
1. Cada MP4 publicado ≤ 15 MB (tutorial ≤ 1280×720; reel ≤ 720×1280). Audio se conserva.
2. `<video controls playsInline preload="none" poster=…>`; nunca autoplay con sonido. Cada video con `aria-label`/título visible corto
   ("Tutorial: agendar y pagar" / "Reel").
3. Al cerrar el modal, ningún video sigue sonando.
4. Respeta `prefers-reduced-motion` (no autoplay).

## Criterios de aceptación
- **AC1** Abrir W Style desde Trayectoria y desde el slider produce el mismo modal: mismo título ("W Style"), misma etiqueta,
  misma banda (alto/foco), mismos párrafos, mockups, videos y enlaces (comparar el `innerText` y los `src` del `.post` y del footer).
- **AC2** Igual para Haru e Invasión UFPS.
- **AC3** El post de W Style muestra dos `<video>`: el de la izquierda es el tutorial 16:9, el de la derecha el reel 9:16; en desktop
  están en la misma fila (mismo `offsetTop` del contenedor de fila, `left` del tutorial < `left` del reel).
- **AC4** A 390 px de ancho se apilan y no hay scroll horizontal.
- **AC5** Ambos videos reproducen en el navegador local (`readyState ≥ 2` tras play) y ninguno pesa > 15 MB.
- **AC6** `npm run build` y `npm test` en verde; un test unitario cubre que un hito con `parrafos` se renderiza con `PostCuerpo`
  (o la función que decide el modo del modal).

## Asunciones (completadas sin el usuario)
1. "El último video sobre pagos y agendar citas" = el tutorial de SPEC-36 (`wstyle-tutorial-16x9.mp4`).
2. "El reel" = `wstyle-reel-9x16.mp4` (versión latam, la principal).
3. La fila de videos va **después del primer párrafo** del post (antes de la primera imagen).
4. Videos auto-hospedados en GitHub Pages (no YouTube/Instagram embebido), comprimidos.
5. La forma "correcta" es la del slider; Trayectoria se adapta a ella, no al revés.
