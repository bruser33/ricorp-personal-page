# Video demo v2 · WS Style — Espejo WS (issue #124)

Segunda versión del demo de SPEC-62 (issue #118, PR #119). Esta vez el corte se prueba **sobre la foto real de Joe**
(dueño de WS Style). Pedro lo autorizó el 22-nov-2026. La v1, con el maniquí, sigue en `../124-ws-style-espejo/`.

| Formato | Archivo | Resolución |
|---|---|---|
| Vertical 9:16 (Reels) | `ws-style-espejo-v2-9x16.mp4` + `poster-9x16.jpg` | 1080×1920, 30 fps |
| Horizontal 16:9 | `ws-style-espejo-v2-16x9.mp4` + `poster-16x9.jpg` | 1920×1080, 30 fps |

- Duración ≈ 65,5 s. H.264 + AAC, `+faststart`, audio a −14 LUFS (pico −1,5 dBTP).
- Voz `es-MX-DaliaNeural` (edge-tts, rate −3 %, pitch −2 Hz). edge-tts no es una API oficial. Para publicidad pagada, conviene regenerar la voz con Azure Speech (es la misma voz, con licencia).
- Música original sintetizada (`../124-ws-style-espejo/fuente/music.py`, CC0), baja cuando habla la voz (ducking).
- Guion: `fuente/guion.json` (el de ChatGPT con los ajustes de Pedro).

## Qué muestra
1. **Gancho:** antes/después de Joe con un barrido cobre (`joe-frente` → `joe-corte-1`).
2. **Panel del barbero** (Matías, de demostración) → Espejo WS, en el Editor manual.
3. **Foto de frente** con «Elegir de galería». Se marca el pelo con unos toques y se ve la opción «Repetir foto». No hay perfiles: solo existe la foto de frente.
4. **Degradado** bajo → medio → alto y «Al ras», con un acercamiento a la cabeza de Joe.
5. **Línea de diseño:** se dibuja, se mueve, se engrosa, se oculta y se vuelve a mostrar.
6. **Comparar A y B** lado a lado, y «Usar degradado B con líneas A».
7. **Vista previa con IA:** montaje con las imágenes de ChatGPT (Joe, opciones 1 y 2; Pedro, antes y después). No se muestra la pantalla del Asistente de IA.
8. **Fijar el diseño:** autorización y el botón «Descargar referencia», sin descargar.
9. **Terminar la sesión:** «Sí, descartar» y la pantalla queda vacía.
10. **Cierre:** el diseño elegido, un fundido a negro y el logo de Ricorp con la firma. El último segundo va en silencio.

## Composición
- **9:16:** arriba, el acercamiento a la cabeza. Al medio, los subtítulos. Abajo, el celular. Cuando no hay foto en pantalla, el celular se ve grande.
- **16:9:** el celular a la izquierda y el resultado ampliado a la derecha, con los subtítulos debajo.
- **Subtítulos:** máximo 2 líneas, con fondo oscuro semitransparente. Nunca van sobre la cara ni sobre los controles.
- **Detalles visuales:** cursor de punto cobre de 11 px y marca de agua «Un producto elaborado por ricorp.cl» al 60 %.

## Notas honestas
- **La detección automática no separa el pelo de Joe del fondo oscuro.** Sin ayuda, el degradado casi no cambiaba, así que el pelo se marca con la herramienta real de la app, «Marcar zona de pelo». Se hace en cámara y acelerado (contorno en `fuente/zona-joe.json`).
- **Las imágenes `*-corte-*` las generó ChatGPT.** En el video van rotuladas «Vista previa con IA».

## Cómo regenerar
1. Mongo con replica set, más `server/.env` con `MAIL_DRY_RUN=1`. Después: `npm run seed && npm run seed:pro-demo` (en `server/`).
2. Levantar `npm run dev --prefix server` y `npm run dev --prefix client`.
3. Copiar `fotos/joe-frente.jpg` a `/tmp/vid/`. Generar la voz con edge-tts por línea de `fuente/guion.json` (en `/tmp/vid/tts/<id>.mp3`) y la música con `python ../124-ws-style-espejo/fuente/music.py /tmp/vid/music.wav 75`.
4. Preparar el logo: `client/public/wstyle/brand/ricorp-logo.svg` renderizado a `/tmp/vid/logo.png`. Las fuentes van en `/tmp/vid/fonts/`: f1 = Anton, f2 = Inter SemiBold, f3 = Inter Bold.
5. Grabar con `node fuente/record.js`: una sola toma, la app en un iframe de 432 px escalado ×2, y los frames en `/tmp/vid/rec/`.
6. Armar con `python fuente/compose.py v ws-style-espejo-v2-9x16.mp4` y `python fuente/compose.py h ws-style-espejo-v2-16x9.mp4`. Los posters salen con `--poster archivo.jpg` (y `POSTER_T=<segundos>`).
