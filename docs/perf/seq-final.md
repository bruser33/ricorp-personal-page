# Recorrido 3D — medición "final"

2026-10-26T00:32:42.372Z · commit c006f33+cambios · CPU 4× · red Fast 4G (9 Mbps / 1.5 Mbps / 165 ms) · 3 corridas por escenario (mediana; M2/M3 máx = peor corrida)

## desktop — 301 frames desktop/sd 1280×720, 22.9 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 4.8) | 1385 | 265 KB | 6 | 225 | 301 / 301 / 0 |
| normal | 0 | 33 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 6) | 1374 | 265 KB | 6 | 225 | 301 / 301 / 0 |
| rapido | 0 | 33 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 4.5) | 1389 | 265 KB | 5.6 | 225 | 116 / 116 / 0 |
| salto | 0.65 | 17 | 0 / 0 / 0 (draw ≤ 1.2 · prog. ≤ 8.1) | 1390 | 265 KB | 6.3 | 225 | 159 / 159 / 0 |
| vaiven | 0 | 50 | 0 / 0 / 0 (draw ≤ 1.3 · prog. ≤ 8.1) | 1390 | 265 KB | 6.1 | 225 | 301 / 301 / 0 |

Memoria (3 recorridos): heap tras GC 3.54 → 3.61 → 3.66 MB (3.4 %), bitmaps pico 225 MB (64 frames).

## mobile — 223 frames mobile/hd 900×1600, 31.1 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.3 · prog. ≤ 5.3) | 1503 | 389 KB | 5.6 | 115.4 | 223 / 223 / 0 |
| normal | 0 | 83 | 0 / 0 / 0 (draw ≤ 1 · prog. ≤ 4.3) | 1498 | 389 KB | 5.9 | 115.4 | 223 / 223 / 0 |
| rapido | 4.4 | 50 | 0 / 0 / 0 (draw ≤ 1.5 · prog. ≤ 4.5) | 1491 | 389 KB | 5.7 | 115.4 | 92 / 92 / 0 |
| salto | 1.19 | 17 | 0 / 0 / 0 (draw ≤ 1.5 · prog. ≤ 6) | 1490 | 389 KB | 6.4 | 115.4 | 124 / 124 / 0 |
| vaiven | 0 | 67 | 0 / 0 / 0 (draw ≤ 1.3 · prog. ≤ 5) | 1485 | 389 KB | 5.8 | 115.4 | 223 / 223 / 0 |

Memoria (3 recorridos): heap tras GC 3.54 → 3.62 → 3.68 MB (4 %), bitmaps pico 115.4 MB (21 frames).

