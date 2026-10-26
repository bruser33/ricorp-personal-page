# Recorrido 3D — antes / después (baseline → player → final)

CPU 4× · Fast 4G · build de producción (vite preview) · mediana de corridas. M1 = % de rAF con |mostrado − pedido| > 2 frames; M2 = pegado máximo (ms); M3 = long tasks durante el scroll (cantidad / total ms); M4 = ms hasta el primer frame y bytes de la secuencia hasta ese momento; M5 = pico de bitmaps retenidos (MB) / heap JS (MB).

## desktop

| escenario | M1 % | M2 ms | M3 n / total ms | M4 ready ms | M4 bytes seq | M5 bitmaps / heap MB |
|---|---|---|---|---|---|---|
| lento | 0 → 0 → 0 | 100 → 0 → 0 | 0 / 0 → 0 / 0 → 0 / 0 | 1321 → 1518 → 1385 | 309 KB → 309 KB → 265 KB | 165.2 / 5.8 → 225 / 5.7 → 225 / 6 |
| normal | 12.15 → 0 → 0 | 233 → 50 → 33 | 0 / 0 → 0 / 0 → 0 / 0 | 1325 → 1529 → 1374 | 309 KB → 309 KB → 265 KB | 158.2 / 6 → 225 / 5.8 → 225 / 6 |
| rapido | 82.84 → 0.56 → 0 | 233 → 50 → 33 | 0 / 0 → 0 / 0 → 0 / 0 | 1326 → 1424 → 1389 | 309 KB → 309 KB → 265 KB | 102 / 6 → 225 / 5.7 → 225 / 5.6 |
| salto | 13.96 → 0.96 → 0.65 | 117 → 33 → 17 | 0 / 0 → 0 / 0 → 0 / 0 | 1321 → 1456 → 1390 | 309 KB → 309 KB → 265 KB | 98.4 / 6.5 → 225 / 6.4 → 225 / 6.3 |
| vaiven | 58 → 0 → 0 | 267 → 67 → 50 | 0 / 0 → 0 / 0 → 0 / 0 | 1327 → 1340 → 1390 | 309 KB → 309 KB → 265 KB | 165.2 / 6 → 225 / 5.9 → 225 / 6.1 |

Secuencia: 150 fr sd (46.2 px/fr) → 150 fr sd (46.2 px/fr) → 301 fr sd (22.9 px/fr)
Memoria (3 recorridos, heap tras GC): 3.44/3.51/3.56 MB, bitmaps 147.7 MB → 3.49/3.59/3.64 MB, bitmaps 225 MB → 3.54/3.61/3.66 MB, bitmaps 225 MB

## mobile

| escenario | M1 % | M2 ms | M3 n / total ms | M4 ready ms | M4 bytes seq | M5 bitmaps / heap MB |
|---|---|---|---|---|---|---|
| lento | 0 → 0 → 0 | 100 → 0 → 0 | 0 / 0 → 0 / 0 → 0 / 0 | 1574 → 1534 → 1503 | 438 KB → 438 KB → 389 KB | 258.2 / 6 → 115.4 / 5.6 → 115.4 / 5.6 |
| normal | 19.46 → 0 → 0 | 233 → 100 → 83 | 0 / 0 → 0 / 0 → 0 / 0 | 1485 → 1533 → 1498 | 438 KB → 438 KB → 389 KB | 219.7 / 6.1 → 115.4 / 5.8 → 115.4 / 5.9 |
| rapido | 74.53 → 12.64 → 4.4 | 333 → 167 → 50 | 0 / 0 → 0 / 0 → 0 / 0 | 1519 → 1511 → 1491 | 438 KB → 438 KB → 389 KB | 137.3 / 5.9 → 115.4 / 5.6 → 115.4 / 5.7 |
| salto | 10.3 → 1.2 → 1.19 | 117 → 17 → 17 | 0 / 0 → 0 / 0 → 0 / 0 | 1519 → 1524 → 1490 | 438 KB → 438 KB → 389 KB | 153.8 / 6.6 → 115.4 / 6.4 → 115.4 / 6.4 |
| vaiven | 52.84 → 0 → 0 | 267 → 67 → 67 | 0 / 0 → 0 / 0 → 0 / 0 | 1546 → 1556 → 1485 | 438 KB → 438 KB → 389 KB | 258.2 / 6 → 115.4 / 5.8 → 115.4 / 5.8 |

Secuencia: 150 fr hd (46.4 px/fr) → 150 fr hd (46.4 px/fr) → 223 fr hd (31.1 px/fr)
Memoria (3 recorridos, heap tras GC): 3.46/3.52/3.58 MB, bitmaps 230.7 MB → 3.52/3.61/3.66 MB, bitmaps 115.4 MB → 3.54/3.62/3.68 MB, bitmaps 115.4 MB

## Lectura y criterios de aceptación (SPEC-30)

- **baseline** = reproductor y secuencia originales (150 frames). **player** = reproductor nuevo (versión del primer
  commit de la spec) sobre la MISMA secuencia de 150 frames: efecto del código solo. **final** = reproductor actual +
  secuencia re-renderizada (desktop 301 frames, móvil 223).
- Corrección tras la revisión: con la secuencia densa el prefetch anterior (gruesos por nivel 16/8/4 mezclados con
  finos cercanos) daba 18.7 % / 22.0 % en rápido. Causa medida: con Fast 4G sobre HTTP/1.1 (6 conexiones × 165 ms de
  latencia por request) entran ~20 frames/s, que no alcanzaban para 1 de cada 4 frames por delante de un scroll de
  100 frames/s. Ahora el reproductor baja primero la **cobertura** (anclas + 1 de cada 5 frames, `coverageFrames`: con
  la tolerancia de ±2 de M1 basta) en orden de necesidad, quieto o con scroll ≥ 60 frames/s, y recién después lo fino;
  el vecindario inmediato en reposo pasó de ±6 a ±12 frames (con ±6 el lento móvil quedaba pegado 117 ms, peor que el
  baseline). **Los umbrales de AC-02 no se recalibraron.**

| AC | resultado |
|---|---|
| AC-01 | `seq-baseline.json` con M1–M5 × 5 escenarios × 2 dispositivos; comando en `docs/perf/README.md`. |
| AC-02 | Normal: 0 % desktop y 0 % móvil (objetivo ≤ 2 % / ≤ 5 %). Rápido: **0 % desktop** (corridas 0/0/0, objetivo ≤ 10 %) y **4.4 % móvil** (4.4/2.2/4.4, objetivo ≤ 20 %). Baja ≥ 50 % en todos: normal 12.2 → 0 y 19.5 → 0; rápido 82.8 → 0 y 74.5 → 4.4; salto 14.0 → 0.65 y 10.3 → 1.19; vaivén 58 → 0 y 52.8 → 0; lento 0 → 0. |
| AC-03 | M2 normal 33 / 83 ms (≤ 150); rápido 33 / 50 ms y salto 17 / 17 ms (≤ 400); ningún escenario peor que el baseline (lento 100 → 0 en ambos). |
| AC-04 | Escenario normal: 0 long tasks en desktop y móvil; drawImage ≤ 1.4 ms y cada pasada de programación ≤ 6 ms con CPU 4×. El baseline ya tenía 0 long tasks: "reducir ≥ 50 %" no aplica (ninguna > 100 ms y no más que el baseline). |
| AC-05 | Desktop 301 frames, 22.9 px de scroll por frame. |
| AC-06 | Unidad fijada: **MB decimal (1 MB = 1 000 000 B)**, la lectura más estricta. desktop sd 11 977 682 B (≤ 14 000 000), hd 15 205 968 B (≤ 20 000 000); móvil sd **9 681 138 B** (≤ 10 000 000; antes 10 127 790 B a q78, ahora q77 con SSIM mínimo 0.9533), hd 13 653 066 B (≤ 14 000 000). Hasta el primer frame: 265 KB vs 309 KB (desktop, −14 %) y 389 KB vs 438 KB (móvil, −11 %). |
| AC-07 | SSIM mínimo 0.9518 (10 frames por variante contra el PNG del render; `seq-ssim.json`, regenerado tras el re-encode de móvil sd). |
| AC-08 | Móvil: pico de bitmaps 115.4 MB (≤ 150). Heap tras GC en 3 recorridos 3.54 → 3.62 → 3.68 MB (+4 %, ≤ 10 %). |
| AC-09 | Vaivén: 0 frames pedidos más de una vez (antes 75–80). |
| AC-10 | Sin cambios en esta corrección: capturas en `docs/perf/capturas/`. |
| AC-11 | Sin cambios en esta corrección: capturas `pagina-respaldo-3d-*.jpg` y `pagina-reduced-desktop.jpg`. |
| AC-12 | Esta tabla; falta pegarla en el PR (no se abre PR desde el carril). |

### Casos borde sin cobertura en la entrega anterior

- **Rotación desktop↔móvil sin recargar (`Experience.swapFormat`)** — `client/scripts/verify-swap.mjs`, teléfono
  390×844 DPR 3 con CPU 4× y Fast 4G, 8 giros (`seq-swap.json`, `seq-swap-img.json`, capturas `capturas/swap-*.jpg`):
  el formato sigue al layout en los 8 giros, sin recarga, el cambio tarda 0.56–0.86 s (anclas del formato nuevo) con
  el anterior dibujando, el hueco máximo entre rAF es 33 ms y no hay long tasks; tras hacer scroll el frame mostrado
  alcanza al pedido (±2) en ≤ 1.1 s. Memoria: en reposo los bitmaps vivos (`createImageBitmap` − `close`) o blob URLs
  vivos (`<img>`) son exactamente los retenidos por el reproductor actual (nada del anterior ni huérfanos), pico 28
  durante el cambio (21 del viejo + anclas del nuevo); heap tras GC 3.71 → 3.95 MB en 4 ciclos (+6.5 %).
- **Ruta de respaldo `?seqdecode=img`** (`seq-final-img.json`, normal/rápido/vaivén): M1 0 % en todos salvo rápido
  móvil 1.24 %; M2 ≤ 67 ms; normal y rápido sin long tasks. **Hallazgo:** en vaivén aparece una long task de 140–160 ms
  en 1 de 3 corridas (desktop y móvil) dentro de una pasada de programación; no aparece con `createImageBitmap`
  (ruta principal). Es la ruta de Safari antiguo, fuera del escenario de AC-04; queda documentada, no corregida.
