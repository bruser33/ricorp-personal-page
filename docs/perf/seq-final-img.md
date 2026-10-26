# Recorrido 3D — medición "final-img"

2026-10-26T00:42:13.737Z · commit c006f33+cambios · CPU 4× · red Fast 4G (9 Mbps / 1.5 Mbps / 165 ms) · 3 corridas por escenario (mediana; M2/M3 máx = peor corrida)

## desktop — 301 frames desktop/sd 1280×720, 22.9 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| normal | 0 | 34 | 0 / 0 / 0 (draw ≤ 1.5 · prog. ≤ 10.6) | 1384 | 265 KB | 7.8 | 225 | 301 / 301 / 0 |
| rapido | 0 | 33 | 0 / 0 / 0 (draw ≤ 1.9 · prog. ≤ 4.3) | 1385 | 265 KB | 6.3 | 225 | 119 / 119 / 0 |
| vaiven | 0 | 50 | 1 / 142 / 160 (draw ≤ 1.8 · prog. ≤ 136.8) | 1380 | 265 KB | 7.4 | 225 | 301 / 301 / 0 |

## mobile — 223 frames mobile/hd 900×1600, 31.1 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| normal | 0 | 50 | 0 / 0 / 0 (draw ≤ 1.9 · prog. ≤ 17.6) | 1503 | 389 KB | 6.7 | 115.4 | 223 / 223 / 0 |
| rapido | 1.24 | 50 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 4.2) | 1506 | 389 KB | 6.6 | 115.4 | 92 / 92 / 0 |
| vaiven | 0 | 67 | 0 / 0 / 153 (draw ≤ 1.8 · prog. ≤ 123.9) | 1507 | 389 KB | 6.8 | 115.4 | 223 / 223 / 0 |

