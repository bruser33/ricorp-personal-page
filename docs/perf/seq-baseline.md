# Recorrido 3D — medición "baseline"

2026-10-25T14:57:50.288Z · commit 5a8e799 · CPU 4× · red Fast 4G (9 Mbps / 1.5 Mbps / 165 ms) · 3 corridas por escenario (mediana; M2/M3 máx = peor corrida)

## desktop — 150 frames desktop/sd 1280×720, 46.2 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 100 | 0 / 0 / 0 | 1321 | 309 KB | 5.8 | 165.2 | 150 / 150 / 0 |
| normal | 12.15 | 233 | 0 / 0 / 52 | 1325 | 309 KB | 6 | 158.2 | 147 / 147 / 0 |
| rapido | 82.84 | 233 | 0 / 0 / 0 | 1326 | 309 KB | 6 | 102 | 77 / 77 / 0 |
| salto | 13.96 | 117 | 0 / 0 / 0 | 1321 | 309 KB | 6.5 | 98.4 | 59 / 59 / 0 |
| vaiven | 58 | 267 | 0 / 0 / 0 | 1327 | 309 KB | 6 | 165.2 | 270 / 119 / 80 |

Memoria (3 recorridos): heap tras GC 3.44 → 3.51 → 3.56 MB (3.5 %), bitmaps pico 147.7 MB (42 frames).

## mobile — 150 frames mobile/hd 900×1600, 46.4 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 100 | 0 / 0 / 0 | 1574 | 438 KB | 6 | 258.2 | 150 / 150 / 0 |
| normal | 19.46 | 233 | 0 / 0 / 0 | 1485 | 438 KB | 6.1 | 219.7 | 125 / 125 / 0 |
| rapido | 74.53 | 333 | 0 / 0 / 0 | 1519 | 438 KB | 5.9 | 137.3 | 65 / 65 / 0 |
| salto | 10.3 | 117 | 0 / 0 / 0 | 1519 | 438 KB | 6.6 | 153.8 | 57 / 57 / 0 |
| vaiven | 52.84 | 267 | 0 / 0 / 0 | 1546 | 438 KB | 6 | 258.2 | 221 / 114 / 75 |

Memoria (3 recorridos): heap tras GC 3.46 → 3.52 → 3.58 MB (3.5 %), bitmaps pico 230.7 MB (42 frames).

