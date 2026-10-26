# Rendimiento del recorrido 3D de WS Style (SPEC-30)

## Cómo se mide

```bash
cd client
npm run build                                   # medición SIEMPRE en build de producción
npm run measure:seq -- --label <nombre>         # → docs/perf/seq-<nombre>.json + .md (≈ 12 min)
npm run measure:seq -- --compare baseline,player,final   # → docs/perf/seq-informe.md (tabla antes/después)
npm run measure:seq -- --label final-img --query '?seqdecode=img' --scenarios normal,rapido,vaiven
                                                # ruta de respaldo del decodificador (<img> + blob URL)
node scripts/verify-swap.mjs [--query '?seqdecode=img']  # rotación desktop↔móvil sin recargar → seq-swap[-img].json
```

`client/scripts/measure-seq.mjs` levanta su propio `vite preview` (127.0.0.1:4182) y usa Google Chrome
(`playwright-core`, channel `chrome`). Condiciones fijas: CPU 4× (CDP) y red **Fast 4G** de DevTools (9 Mbps,
1.5 Mbps, 165 ms); desktop 1440×900 DPR 1 y móvil 390×844 DPR 3 táctil; cada corrida en un contexto nuevo (caché
fría); 3 corridas por escenario (mediana; M2/M3 = peor corrida). Escenarios, tras `__site.ready` + 1.5 s:
lento (30 s), normal (12 s), rápido (3 s), salto (clic en el navbar a Visítanos y vuelta con el logo) y vaivén
(3 idas y vueltas entre las anclas 2 y 4), más "memoria" (3 recorridos completos, heap tras GC).

Métricas: M1 desfase (% de rAF con |mostrado − pedido| > 2 frames), M2 pegado máximo (ms), M3 long tasks, M4 ms
y bytes de la secuencia hasta el primer frame, M5 heap y bitmaps retenidos. En el reproductor nuevo, M1 se desglosa
por causa (frame pedido sin bytes = red / con bytes sin decodificar = decodificación).

Rotación (caso borde de la spec, `Experience.swapFormat`): `client/scripts/verify-swap.mjs` abre `/wstyle/` en un
teléfono (390×844, DPR 3, táctil, CPU 4×, Fast 4G) y lo gira vertical ↔ horizontal 4 veces (8 cambios de formato).
Tras cada giro comprueba: formato de la secuencia = layout nuevo, sin recarga de página, el frame mostrado sigue al
scroll, hueco máximo entre rAF y long tasks > 100 ms; y memoria: bitmaps vivos (createImageBitmap − close) y blob URLs
vivos (createObjectURL − revokeObjectURL) ≤ presupuesto de UN reproductor en reposo, heap tras GC sin crecer > 10 %.
Sale con código 1 si algo falla.

Presupuesto de bytes (regla 5): **MB decimales, 1 MB = 1 000 000 B** (la lectura más estricta de "≤ 10 MB"). El
campo `budget` de cada variante en `manifest.json` está en bytes con esa unidad y `bytes` ≤ `budget` en las cuatro.

Archivos: `seq-baseline` (reproductor y secuencia originales, 150 frames), `seq-player` (reproductor nuevo con la
secuencia original: efecto del código solo), `seq-final` (reproductor nuevo + secuencia re-renderizada),
`seq-final-img` (lo mismo con `?seqdecode=img`), `seq-swap[-img].json` (rotación), `seq-ssim.json` (calidad, AC-07) e `seq-informe.md` (tabla antes/después generada con `--compare`, más la
sección "Lectura y criterios de aceptación" escrita a mano: regenerar la tabla la borra). Capturas antes/después en
`capturas/`.

## Pipeline de la secuencia (repo `~/Projects/barberia-3d`, rama `lane/recorrido`)

```bash
blender -b blender/barberia.blend -P blender/spec30_tomas.py          # tomas nuevas (carta y fachada) en el .blend
node scripts/export-camera-path-ricorp.mjs --url http://127.0.0.1:4182/wstyle/ --frames 301
blender/renders/render_spec30.sh                                      # PNG 1600×900 y 900×1600 (≈ 33 s/frame)
python3 scripts/publish_seq_spec30.py --dest <ricorp>/client/public/wstyle/seq [--only mobile --frames 223]
python3 scripts/ssim-seq.py --seq <ricorp>/client/public/wstyle/seq --out <ricorp>/docs/perf/seq-ssim.json
```
