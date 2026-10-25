# Recorrido 3D — medición "final"

2026-10-25T23:19:58.147Z · commit 5a8e799+cambios · CPU 4× · red Fast 4G (9 Mbps / 1.5 Mbps / 165 ms) · 3 corridas por escenario (mediana; M2/M3 máx = peor corrida)

## desktop — 301 frames desktop/sd 1280×720, 22.9 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.8 · prog. ≤ 5) | 1406 | 265 KB | 6 | 225 | 301 / 301 / 0 |
| normal | 0 | 67 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 5.5) | 1403 | 265 KB | 6 | 225 | 298 / 298 / 0 |
| rapido | 18.68 | 117 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 5.2) | 1387 | 265 KB | 5.8 | 225 | 111 / 111 / 0 |
| salto | 0.64 | 17 | 0 / 0 / 0 (draw ≤ 1.3 · prog. ≤ 4.5) | 1377 | 265 KB | 6.3 | 225 | 158 / 158 / 0 |
| vaiven | 0 | 50 | 0 / 0 / 0 (draw ≤ 1.5 · prog. ≤ 5.4) | 1387 | 265 KB | 6.1 | 225 | 301 / 301 / 0 |

Memoria (3 recorridos): heap tras GC 3.56 → 3.6 → 3.66 MB (2.8 %), bitmaps pico 225 MB (64 frames).

## mobile — 223 frames mobile/hd 900×1600, 31.1 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.8 · prog. ≤ 4.2) | 1491 | 389 KB | 5.7 | 115.4 | 223 / 223 / 0 |
| normal | 0 | 50 | 0 / 0 / 0 (draw ≤ 1.1 · prog. ≤ 5.7) | 1488 | 389 KB | 5.9 | 115.4 | 223 / 223 / 0 |
| rapido | 21.98 | 150 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 5.2) | 1489 | 389 KB | 5.7 | 115.4 | 90 / 90 / 0 |
| salto | 1.19 | 17 | 0 / 0 / 0 (draw ≤ 1.1 · prog. ≤ 6.9) | 1498 | 389 KB | 6.4 | 115.4 | 127 / 127 / 0 |
| vaiven | 0 | 67 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 5.4) | 1501 | 389 KB | 5.8 | 115.4 | 223 / 223 / 0 |

Memoria (3 recorridos): heap tras GC 3.53 → 3.61 → 3.67 MB (4 %), bitmaps pico 115.4 MB (21 frames).

