# SPEC-43 — Post de W Style: el tutorial arriba solo y el reel en lugar del teléfono

> Pedido del usuario (2026-10-27): "la imagen de abajo quítala porque tiene un play cortado, reemplázala por el reel, y la parte de
> arriba déjala solo para el video promocional que hice".

## Estado actual
`client/src/components/Post.tsx` (`PostCuerpo`): tras el 1er párrafo va la fila `VideosPost` (tutorial izq. + reel der.); el 2.º
mockup (`wstyle-mockup-mobile.webp`, "teléfono" flotante a la derecha) muestra un ícono de play cortado.

## Alcance
1. La fila de arriba muestra **solo el tutorial** (`videos.tutorial`) a todo el ancho del post (16:9).
2. Si el hito tiene `videos.reel`, el reel **ocupa el lugar del teléfono** (`.post-telefono`: flotante a la derecha, vertical 9:16,
   mismo ancho/inclinación/sombra que el teléfono) y el 2.º mockup no se muestra.
3. `wstyle-2026` deja `mockups` solo con `wstyle-mockup-desktop.webp`.
4. Mismas reglas de video de SPEC-39 (controls, playsInline, preload none, póster, pausa al cerrar, sin autoplay).

## Criterios de aceptación
- **AC1** En el post de W Style hay exactamente 2 `<video>`: el tutorial justo después del 1er párrafo, de ancho completo; el reel
  flotando a la derecha donde estaba el teléfono, con texto corriendo a su izquierda (desktop 1440).
- **AC2** No aparece `wstyle-mockup-mobile.webp` en el post.
- **AC3** A 390 px: tutorial a todo el ancho, reel centrado con ancho ≤ 360 px, sin scroll horizontal.
- **AC4** Igual desde slider y Trayectoria (mismo `PostModal`). Tests + build en verde.
