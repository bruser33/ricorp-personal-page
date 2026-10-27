# SPEC-48 — Video promocional de Haru, como el reel de W Style

> Pedido del usuario (2026-10-27): "de Haru mejor haz un video promocional así como el que hiciste con WS Style".

## Referencia
Reel de W Style: `~/Projects/barberia-3d/clip/` (README.md, COMO-SE-HIZO-EL-REEL.txt en ~/Downloads, LICENCIAS.md, scripts/voz.py,
scripts/montage.py). Vertical 9:16, 1080×1920, 30 fps, ~20–30 s, voz en off es (edge-tts), subtítulos quemados, música CC0 con
ducking, −14 LUFS, cierre "POWERED BY ricorp.cl". **Solo lectura** de ese proyecto.

## Alcance
1. Proyecto nuevo `~/Projects/haru-promo/` (guion.json, scripts, out/, LICENCIAS.md, README con cómo regenerar).
2. Material: pantallas reales de Haru (`~/Downloads/haru-x/HARU/44 vistas`, logo `Brand/Haru-logo.svg`; ya recortadas en
   `client/public/figma-frames/haru/`), animadas en un teléfono con movimientos suaves (entradas, paneos, zoom a detalles), sobre la
   identidad de Haru (verdes/naranjos, hojas, Montserrat).
3. Guion basado SOLO en lo que dicen los `parrafos` de Haru en `client/src/data/trayectoria.ts` (ayuda por horas con garantías;
   Asistir / Servicios / Crear; negociar precio y horas con chat; cronómetro del servicio; calificación e insignias; lema "Ayuda,
   Crea, Anuncia, Crece"). Nada inventado.
4. Voz es-latam natural vía edge-tts (verificar pronunciación de "Haru"), subtítulos legibles, música CC0, cierre con logo Haru +
   "POWERED BY ricorp.cl".
5. Publicación: `client/public/videos/haru-promo.mp4` (≤ 10 MB, 720×1280, +faststart) + póster webp. En el hito `haru`:
   `videos: { reel: {...} }` (ocupa el lugar del teléfono, como en W Style) y **se quita `galeria`** (el video la reemplaza); las
   pantallas de `figma-frames/haru/` que ya no se usen se borran.

## AC
- **AC1** El MP4 dura 20–40 s, 9:16, con voz, subtítulos y cierre Ricorp; −14 LUFS ±1.
- **AC2** El post de Haru muestra el reel en el lugar del teléfono y ya no la galería; reproduce y se pausa al cerrar.
- **AC3** Tests (assets, unicidad, Post.test) actualizados y en verde; build en verde.
