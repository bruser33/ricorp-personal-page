# Video demo v3.1 · WS Style — Espejo WS (issue #124)

Retoque de la v3 (`../124-ws-style-espejo-v3/`, aprobada por ChatGPT) **sin volver a grabar**. Se parte del MP4 de la v3,
se reemplazan solo 4 tramos y el audio se copia tal cual: misma voz, música, subtítulos, cierre, 65 s y −14 LUFS.

| Formato | Archivo | Resolución |
|---|---|---|
| Vertical 9:16 | `ws-style-espejo-v3-1-9x16.mp4` + `poster-9x16.jpg` | 1080×1920, 30 fps |
| Horizontal 16:9 | `ws-style-espejo-v3-1-16x9.mp4` + `poster-16x9.jpg` | 1920×1080, 30 fps |

## Qué cambió frente a la v3
1. **Que se note la diferencia entre cortes.** Todos los antes/después hacen zoom a la sien de Joe, que es donde
   cambian el degradado y la línea. Llevan un **divisor deslizante** sobre la misma foto y un **recuadro** que marca la zona que cambia:
   - Gancho (0–5 s): foto original ↔ vista previa con IA 1 ↔ IA 2.
   - Plano corto del Espejo (l4): foto original ↔ degradado alto.
   - Comparar A y B (l6): A (alto + línea) sobre B (medio), y luego el combinado (degradado B + línea de A) contra la foto original.
   - Tramo de IA: las tres fotos de Joe con zoom a la sien.
   La nuca no aparece porque solo hay foto de frente.
2. **Aclaración de la IA.** Durante todo el tramo «Vista previa con IA» (39,7–47,3 s), la frase «Montaje ilustrativo con
   imágenes generadas por IA. No es una captura de la app.» queda fija en una franja inferior oscura con filete cobre.
   No tapa las caras ni los subtítulos.

Las imágenes del Espejo (degradado alto, opción A, opción B, combinado) salen del **mismo código de la app**
(`blendFade` de `client/src/wstyle/pro/mirror/photo.ts`). Se aplica a la foto de Joe con la misma zona de pelo y los mismos ajustes de la grabación:
A = alto, al ras 0,9, con línea de grosor 1,9; B = medio, al ras 0,7.
El tono de piel se toma como mediana de la mejilla, igual que la detección automática. Puede variar un poco respecto del que usó la app en la grabación.
Así se ven en alta resolución sin volver a grabar la pantalla.

## Cómo regenerar
```bash
pip install pillow numpy imageio-ffmpeg
# fuentes en /tmp/vid/fonts: f1.ttf = Anton, inter.ttf = Inter variable (Google Fonts)
cd /tmp/v31   # carpeta de trabajo
python <repo>/demos/124-ws-style-espejo-v3-1/fuente/prep.py      # foto 960 px + máscara de la zona de pelo + tono
node   <repo>/demos/124-ws-style-espejo-v3-1/fuente/fade.mjs     # blendFade de la app → alto / medio
python <repo>/demos/124-ws-style-espejo-v3-1/fuente/mk.py        # línea + orig/A/B/C/alto .png
cd <repo>/demos
python 124-ws-style-espejo-v3-1/fuente/retoque.py v 124-ws-style-espejo-v3/ws-style-espejo-v3-9x16.mp4 124-ws-style-espejo-v3-1/ws-style-espejo-v3-1-9x16.mp4
python 124-ws-style-espejo-v3-1/fuente/retoque.py h 124-ws-style-espejo-v3/ws-style-espejo-v3-16x9.mp4 124-ws-style-espejo-v3-1/ws-style-espejo-v3-1-16x9.mp4
# poster: añadir  --poster poster.jpg --t <segundos>   ·   cuadros sueltos: --preview t1,t2
```
