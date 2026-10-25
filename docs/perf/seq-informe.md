# Recorrido 3D — antes / después (baseline → player → final)

CPU 4× · Fast 4G · build de producción (vite preview) · mediana de corridas. M1 = % de rAF con |mostrado − pedido| > 2 frames; M2 = pegado máximo (ms); M3 = long tasks durante el scroll (cantidad / total ms); M4 = ms hasta el primer frame y bytes de la secuencia hasta ese momento; M5 = pico de bitmaps retenidos (MB) / heap JS (MB).

## desktop

| escenario | M1 % | M2 ms | M3 n / total ms | M4 ready ms | M4 bytes seq | M5 bitmaps / heap MB |
|---|---|---|---|---|---|---|
| lento | 0 → 0 → 0 | 100 → 0 → 0 | 0 / 0 → 0 / 0 → 0 / 0 | 1321 → 1518 → 1406 | 309 KB → 309 KB → 265 KB | 165.2 / 5.8 → 225 / 5.7 → 225 / 6 |
| normal | 12.15 → 0 → 0 | 233 → 50 → 67 | 0 / 0 → 0 / 0 → 0 / 0 | 1325 → 1529 → 1403 | 309 KB → 309 KB → 265 KB | 158.2 / 6 → 225 / 5.8 → 225 / 6 |
| rapido | 82.84 → 0.56 → 18.68 | 233 → 50 → 117 | 0 / 0 → 0 / 0 → 0 / 0 | 1326 → 1424 → 1387 | 309 KB → 309 KB → 265 KB | 102 / 6 → 225 / 5.7 → 225 / 5.8 |
| salto | 13.96 → 0.96 → 0.64 | 117 → 33 → 17 | 0 / 0 → 0 / 0 → 0 / 0 | 1321 → 1456 → 1377 | 309 KB → 309 KB → 265 KB | 98.4 / 6.5 → 225 / 6.4 → 225 / 6.3 |
| vaiven | 58 → 0 → 0 | 267 → 67 → 50 | 0 / 0 → 0 / 0 → 0 / 0 | 1327 → 1340 → 1387 | 309 KB → 309 KB → 265 KB | 165.2 / 6 → 225 / 5.9 → 225 / 6.1 |

Secuencia: 150 fr sd (46.2 px/fr) → 150 fr sd (46.2 px/fr) → 301 fr sd (22.9 px/fr)
Memoria (3 recorridos, heap tras GC): 3.44/3.51/3.56 MB, bitmaps 147.7 MB → 3.49/3.59/3.64 MB, bitmaps 225 MB → 3.56/3.6/3.66 MB, bitmaps 225 MB

## mobile

| escenario | M1 % | M2 ms | M3 n / total ms | M4 ready ms | M4 bytes seq | M5 bitmaps / heap MB |
|---|---|---|---|---|---|---|
| lento | 0 → 0 → 0 | 100 → 0 → 0 | 0 / 0 → 0 / 0 → 0 / 0 | 1574 → 1534 → 1491 | 438 KB → 438 KB → 389 KB | 258.2 / 6 → 115.4 / 5.6 → 115.4 / 5.7 |
| normal | 19.46 → 0 → 0 | 233 → 100 → 50 | 0 / 0 → 0 / 0 → 0 / 0 | 1485 → 1533 → 1488 | 438 KB → 438 KB → 389 KB | 219.7 / 6.1 → 115.4 / 5.8 → 115.4 / 5.9 |
| rapido | 74.53 → 12.64 → 21.98 | 333 → 167 → 150 | 0 / 0 → 0 / 0 → 0 / 0 | 1519 → 1511 → 1489 | 438 KB → 438 KB → 389 KB | 137.3 / 5.9 → 115.4 / 5.6 → 115.4 / 5.7 |
| salto | 10.3 → 1.2 → 1.19 | 117 → 17 → 17 | 0 / 0 → 0 / 0 → 0 / 0 | 1519 → 1524 → 1498 | 438 KB → 438 KB → 389 KB | 153.8 / 6.6 → 115.4 / 6.4 → 115.4 / 6.4 |
| vaiven | 52.84 → 0 → 0 | 267 → 67 → 67 | 0 / 0 → 0 / 0 → 0 / 0 | 1546 → 1556 → 1501 | 438 KB → 438 KB → 389 KB | 258.2 / 6 → 115.4 / 5.8 → 115.4 / 5.8 |

Secuencia: 150 fr hd (46.4 px/fr) → 150 fr hd (46.4 px/fr) → 223 fr hd (31.1 px/fr)
Memoria (3 recorridos, heap tras GC): 3.46/3.52/3.58 MB, bitmaps 230.7 MB → 3.52/3.61/3.66 MB, bitmaps 115.4 MB → 3.53/3.61/3.67 MB, bitmaps 115.4 MB

## Lectura y criterios de aceptación (SPEC-30)

- **baseline** = reproductor y secuencia originales (150 frames). **player** = reproductor nuevo sobre la MISMA
  secuencia de 150 frames (efecto del código solo). **final** = reproductor nuevo + secuencia re-renderizada
  (desktop 301 frames, móvil 223).
- M1 cuenta frames, no píxeles: ±2 frames eran ±92 px de scroll con 150 frames y son ±46 px (desktop) / ±62 px
  (móvil) con la secuencia nueva. Por eso "rápido" sale mejor en *player* que en *final*: la secuencia densa es
  más exigente con la misma vara.

| AC | resultado |
|---|---|
| AC-01 | `seq-baseline.json` con M1–M5 × 5 escenarios × 2 dispositivos; comando en `docs/perf/README.md`. |
| AC-02 | normal: 0 % desktop y 0 % móvil (objetivo ≤ 2 % / ≤ 5 %). Rápido: 18.7 % desktop / 22.0 % móvil (objetivo ≤ 10 % / ≤ 20 %) → **recalibrado** (asunción 1): con Fast 4G (~1 MB/s) el escenario recorre la secuencia entera en 3 s; el desglose de causas de M1 muestra que todos los desfases son de red (el frame pedido no tiene bytes), no de decodificación. Baja ≥ 50 % en todos los escenarios con margen (lento 0 → 0; normal 12.2 → 0 y 19.5 → 0; rápido 82.8 → 18.7 y 74.5 → 22.0; salto 14.0 → 0.6 y 10.3 → 1.2; vaivén 58 → 0 y 52.8 → 0). |
| AC-03 | M2 normal 67 / 50 ms (≤ 150); rápido 117 / 150 ms y salto 17 / 17 ms (≤ 400); ningún escenario peor que el baseline. |
| AC-04 | Escenario normal: 0 long tasks en desktop y móvil. drawImage ≤ 1.7 ms y cada pasada de programación ≤ 5.7 ms en el hilo principal con CPU 4× (atribución por instrumentación). El baseline ya tenía 0 long tasks, así que "reducir ≥ 50 %" no aplica (recalibrado: ninguna > 100 ms y no más que el baseline). La única long task grande que apareció en el camino (≈ 80–130 ms en móvil) era un recálculo de estilos de todo el documento por `--letterbox` en `<html>`; ahora la variable vive en `.film-fx`. |
| AC-05 | Desktop 301 frames, 22.9 px de scroll por frame (máx. 23.1 por tramo; frames repartidos por largo de tramo). |
| AC-06 | desktop sd 11.42 MB (≤ 14), hd 14.50 MB (≤ 20); móvil sd 9.66 MB (≤ 10), hd 13.02 MB (≤ 14). Hasta el primer frame: 265 KB vs 309 KB (desktop, −14 %) y 389 KB vs 438 KB (móvil, −11 %); anclas ≤ 384 KB (≤ 600). Móvil publica 223 de los 301 frames renderizados: a SSIM ≥ 0.95 cada frame vertical pesa ~1.5× uno desktop y los 301 no entraban en 10/14 MB. |
| AC-07 | SSIM mínimo 0.9518 (10 frames por variante contra el PNG del render; `seq-ssim.json`). |
| AC-08 | Móvil: pico de bitmaps 115.4 MB (≤ 150; 21 frames de 900×1600). Heap tras GC en 3 recorridos 3.53 → 3.61 → 3.67 MB (+4 %, ≤ 10 %). |
| AC-09 | Vaivén: 0 frames pedidos más de una vez (antes 75–80). |
| AC-10 | "La carta": navajas sobre el mesón con luz cálida; esquina superior derecha R 144.7 / B 121.9 (desktop) y R 121.5 / B 121.0 (móvil). "Llega": fachada nocturna con letrero WS STYLE retroiluminado, apliques y poste. Capturas en `docs/perf/capturas/` (antes/después y página). |
| AC-11 | Manifest 404 → modo `3d` con WebGL (desktop y móvil); reduced-motion → solo anclas (7 descargas) y frame = ancla de la sección. Capturas `pagina-respaldo-3d-*.jpg` y `pagina-reduced-desktop.jpg`. |
