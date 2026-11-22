# Video demo v3 · WS Style — Espejo WS (issue #124)

Tercera versión del demo de SPEC-62 (issue #118, PR #119). Parte de la v2 (`../124-ws-style-espejo-v2/`), con la misma
voz, la misma música, las mismas fotos de Joe y Pedro (autorizadas por Pedro el 22-nov-2026) y el mismo guion. Aplica la
revisión de ChatGPT de la v2 («pasó de demo técnico a pieza comercial, pero todavía no la publicaría»).

| Formato | Archivo | Resolución |
|---|---|---|
| Vertical 9:16 (Reels) | `ws-style-espejo-v3-9x16.mp4` + `poster-9x16.jpg` | 1080×1920, 30 fps |
| Horizontal 16:9 | `ws-style-espejo-v3-16x9.mp4` + `poster-16x9.jpg` | 1920×1080, 30 fps |

- Duración ≈ 65 s. H.264 + AAC, `+faststart`, audio a −14 LUFS.
- Voz `es-MX-DaliaNeural` (edge-tts, rate −3 %, pitch −2 Hz). Para publicidad pagada, conviene regenerarla con Azure Speech.
- Música original sintetizada (`../124-ws-style-espejo/fuente/music.py`, CC0).

## Qué cambió frente a la v2
1. **Antes/después contundente.** El gancho muestra el costado de la cabeza de Joe, siempre con el mismo encuadre:
   *Foto original* → *Vista previa con IA · opción 1* (degradado medio + línea) → *opción 2* (degradado alto).
   Se usan barridos.
2. **Sin tomas repetidas de la cara.** El degradado del Espejo sobre la foto de Joe es suave, así que se muestra **una sola vez**,
   en un plano corto de la zona sobre la oreja (*Foto original* ↔ *Espejo WS · degradado alto*). La línea se ve **en vivo**
   en un acercamiento del costado mientras Matías la dibuja, la mueve y la engrosa. Después vienen la comparación A/B y el antes/después.
3. **La app se ve grande.** `record.js` registra en cada cuadro dónde está el dedo de Matías y cuándo conviene acercar. Con eso, el
   montaje mueve una «cámara» sobre el celular:
   - **9:16:** el celular ocupa casi toda la pantalla y crece a todo el ancho al tocar Bajo/Medio/Alto, Al ras, Dibujar línea,
     Comparar A y B, Fijar y Terminar.
   - **16:9:** el celular es ~50 % más grande que en la v2 (800 px de ancho en vez de 536). A la derecha va el paso
     (01–07), el plano corto o la comparación A/B ampliada.
4. **Rótulos.** *Foto original* va sobre las fotos reales de Joe y de Pedro, incluida la foto dentro de la app mientras está sin
   cambios. *Vista previa con IA* va sobre las imágenes de ChatGPT. El tramo de IA dice además: «Montaje ilustrativo con imágenes
   generadas por IA. No es una captura de la app.».
5. **Subtítulos.** Van siempre sobre una franja oscura semitransparente con un filete cobre, así que se leen también sobre
   el fondo negro. Tienen máximo 2 líneas y nunca tapan la cara ni los controles.

## Cómo regenerar
1. Mongo con replica set y `server/.env` con `MAIL_DRY_RUN=1`. Después `npm run seed && npm run seed:pro-demo` en `server/`.
   Levantar `npm run dev --prefix server` y `npm run dev --prefix client`.
2. Preparar los insumos en `/tmp/vid/`:
   - `joe-frente.jpg`, copiado de `../124-ws-style-espejo-v2/fotos/`.
   - La voz por línea de `fuente/guion.json` con edge-tts, en `tts/<id>.mp3`.
   - `music.wav`, con `python ../124-ws-style-espejo/fuente/music.py /tmp/vid/music.wav 75`.
   - `logo.png`, a partir de `client/public/wstyle/brand/ricorp-logo.svg`.
   - Las fuentes en `fonts/`: f1 = Anton, f2 = Inter SemiBold, f3 = Inter Bold.
3. `PW=<ruta a playwright> node fuente/record.js`. Graba una sola toma y deja los cuadros, el registro, `alto.png` y `elegido.png` en `/tmp/vid/rec/`.
4. `python fuente/compose.py v ws-style-espejo-v3-9x16.mp4` y `python fuente/compose.py h ws-style-espejo-v3-16x9.mp4`.
   Los posters salen con `--poster archivo.jpg` (y `POSTER_T=<segundos>`). Para revisar cuadros sueltos: `PREVIEW=t1,t2,…`.
