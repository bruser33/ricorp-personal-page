# Video demo · WS Style — Agenda y kit de reservas (issue #106)

Pedido por Joe para mostrar SPEC-55 (agenda del barbero) y SPEC-58 (kit de difusión).

| Formato | Archivo | Resolución | Duración |
|---|---|---|---|
| Horizontal 16:9 | `ws-style-agenda-kit-16x9.mp4` | 1920×1080, 30 fps | 54 s |
| Vertical 9:16 | `ws-style-agenda-kit-9x16.mp4` | 1080×1920, 30 fps | 54 s |

- H.264 + AAC, `+faststart`, loudness −14 LUFS (pico −1,5 dBFS).
- Voz `es-MX-DaliaNeural` (edge-tts, rate −3 %, pitch −2 Hz). edge-tts no es una API oficial: para uso comercial pagado conviene regenerar la voz con Azure Speech (misma voz, con licencia).
- Música: original, sintetizada por `fuente/music.py` (sin licencias de terceros).
- Subtítulos quemados (Inter SemiBold) y marca fija "Demo con datos ficticios · Un producto elaborado por ricorp.cl"; cierre con el logo de Ricorp.
- Datos: app local con los seeds de demo (`seed`, `seed:admin`, `seed:pro-demo`, `seed:admin-demo`) y orígenes de reserva ficticios. Cuentas `*.demo@wstyle.local`; clientes y citas ficticios. El link del kit se generó con `VITE_SITE_URL=https://ricorp.cl`, así que el QR del video apunta al link real de reservas.

## Cómo regenerar
1. Mongo (replica set) + `server/.env` con `SUPERADMIN_EMAIL=dueno.demo@wstyle.local`, `SUPERADMIN_PASSWORD=demo12345`, `MAIL_DRY_RUN=1`; correr los 4 seeds y crear la cuenta `cliente.demo@wstyle.local` (`POST /api/auth/register`).
2. Levantar `npm run dev --prefix server` y `VITE_SITE_URL=https://ricorp.cl npm run dev --prefix client`.
3. Voz: `edge-tts` por línea de `fuente/guion.json` → `/tmp/vid/tts/lN.mp3`. Música: `python fuente/music.py /tmp/vid/music.wav 58`.
4. Grabar: `node fuente/record.js h` y `node fuente/record.js v` (Playwright + screencast CDP; rutas en `/tmp/vid`).
5. Armar: `python fuente/compose.py h out-16x9.mp4` y `python fuente/compose.py v out-9x16.mp4`.
