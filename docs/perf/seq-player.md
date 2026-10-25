# Recorrido 3D — medición "player"

2026-10-25T22:09:52.068Z · commit 5a8e799+cambios · CPU 4× · red Fast 4G (9 Mbps / 1.5 Mbps / 165 ms) · 3 corridas por escenario (mediana; M2/M3 máx = peor corrida)

## desktop — 150 frames desktop/sd 1280×720, 46.2 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.9 · prog. ≤ 7.7) | 1518 | 309 KB | 5.7 | 225 | 150 / 150 / 0 |
| normal | 0 | 50 | 0 / 0 / 56 (draw ≤ 1.6 · prog. ≤ 7.6) | 1529 | 309 KB | 5.8 | 225 | 150 / 150 / 0 |
| rapido | 0.56 | 50 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 6.7) | 1424 | 309 KB | 5.7 | 225 | 103 / 103 / 0 |
| salto | 0.96 | 33 | 0 / 0 / 0 (draw ≤ 1.6 · prog. ≤ 7.2) | 1456 | 309 KB | 6.4 | 225 | 137 / 137 / 0 |
| vaiven | 0 | 67 | 0 / 0 / 0 (draw ≤ 1.2 · prog. ≤ 5.5) | 1340 | 309 KB | 5.9 | 225 | 150 / 150 / 0 |

Memoria (3 recorridos): heap tras GC 3.49 → 3.59 → 3.64 MB (4.3 %), bitmaps pico 225 MB (64 frames).

## mobile — 150 frames mobile/hd 900×1600, 46.4 px de scroll por frame

| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |
|---|---|---|---|---|---|---|---|---|
| lento | 0 | 0 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 4.3) | 1534 | 438 KB | 5.6 | 115.4 | 150 / 150 / 0 |
| normal | 0 | 100 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 7.5) | 1533 | 438 KB | 5.8 | 115.4 | 150 / 150 / 0 |
| rapido | 12.64 | 167 | 0 / 0 / 0 (draw ≤ 1.3 · prog. ≤ 4.6) | 1511 | 438 KB | 5.6 | 115.4 | 77 / 77 / 0 |
| salto | 1.2 | 17 | 0 / 0 / 0 (draw ≤ 1.4 · prog. ≤ 3.9) | 1524 | 438 KB | 6.4 | 115.4 | 107 / 107 / 0 |
| vaiven | 0 | 67 | 0 / 0 / 0 (draw ≤ 1.7 · prog. ≤ 5.7) | 1556 | 438 KB | 5.8 | 115.4 | 150 / 150 / 0 |

Memoria (3 recorridos): heap tras GC 3.52 → 3.61 → 3.66 MB (4 %), bitmaps pico 115.4 MB (21 frames).

