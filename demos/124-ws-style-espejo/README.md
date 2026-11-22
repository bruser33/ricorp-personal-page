# Video demo · WS Style — Espejo WS (issue #124)

Pedido por Pedro para mostrar SPEC-62 (issue #118, PR #119): el Espejo WS en el panel del barbero.

| Formato | Archivo | Resolución | Duración |
|---|---|---|---|
| Horizontal 16:9 | `ws-style-espejo-16x9.mp4` | 1920×1080, 30 fps | 70,9 s |
| Vertical 9:16 | `ws-style-espejo-9x16.mp4` | 1080×1920, 30 fps | 70,9 s |

- H.264 + AAC, `+faststart`, loudness −14 LUFS (pico −1,5 dBFS).
- Voz `es-MX-DaliaNeural` (edge-tts, rate −3 %, pitch −2 Hz). edge-tts no es una API oficial: para uso comercial pagado conviene regenerar la voz con Azure Speech (misma voz, con licencia).
- Música: original y suave, sintetizada por `fuente/music.py` (sin samples de terceros). Se libera como CC0.
- Subtítulos quemados (Inter SemiBold) desde `fuente/guion.json`, marca fija "Un producto elaborado por ricorp.cl" y cierre con el logo de Ricorp.
- Recorrido: gancho → panel del barbero (Hoy) → Espejo WS → fotos de frente y de ambos perfiles → marcar el pelo a mano cuando no se detecta → degradado bajo, medio y alto + "al ras" → dibujar, mover y engrosar una línea → comparar A y B y combinar el degradado de B con las líneas de A → fijar el diseño.
- No se muestra el Asistente de IA (se usa solo el Editor manual; el selector y el panel del asistente se ocultan durante la grabación) ni pagos.

## Datos demo
- Barbero de demostración: `matias.demo@wstyle.local` (`npm run seed` + `npm run seed:pro-demo`); citas y clientes ficticios.
- **Cliente = maniquí 3D hecho para este video** (`fuente/maniqui/`, three.js). No es una persona ni un cliente real, y no hay licencias de terceros: las imágenes se liberan como CC0. Se descartaron las fotos libres que había: o eran cabezas de práctica con pelo largo de mujer (CC BY-SA, piden atribución) o eran clientes reales de otra barbería con el corte ya hecho.
- La detección automática de pelo reconoce el maniquí de frente, pero no de perfil. En los perfiles se usa la opción de la app "Marcar zona de pelo" + "Tomar tono de piel" (AC-03): el izquierdo se marca en cámara y el derecho fuera de cámara.

## Cómo regenerar
1. Mongo (replica set) + `server/.env` con `MAIL_DRY_RUN=1`; correr `npm run seed` y `npm run seed:pro-demo`.
2. Levantar `npm run dev --prefix server` y `npm run dev --prefix client`.
3. Maniquí: `node fuente/maniqui/shot2.js …` (ver la cabecera) → fotos en `/tmp/vid/photos/maniqui-{front,left,right}.jpg` y `python fuente/maniqui/contorno.py` → `/tmp/vid/zones.json` (ya están en la carpeta).
4. Voz: `edge-tts` por línea de `fuente/guion.json` → `/tmp/vid/tts/<id>.mp3`. Música: `python fuente/music.py /tmp/vid/music.wav 76`. Tarjetas: `fuente/card.html` + `ricorp-logo.svg` en `/tmp/vid/cards/`, fuentes Anton/Inter en `/tmp/vid/fonts/` (f1 = Anton, f2 = Inter SemiBold, f3 = Inter Bold).
5. Grabar: `node fuente/record.js h` y `node fuente/record.js v` (Playwright + screencast CDP).
6. Armar: `python fuente/compose.py h out-16x9.mp4` y `python fuente/compose.py v out-9x16.mp4`.
