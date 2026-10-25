# SPEC-30 — Recorrido 3D de WS Style fluido: medir, re-renderizar y mejorar el reproductor

> Pedido del usuario (2026-10-25): "re-renderiza el proyecto porque en la página a veces siento que el recorrido 3D se congela; investígalo para que sea mejor".

## Historia
Como visitante de WS Style (`/wstyle/`), quiero que el recorrido 3D avance de forma continua mientras hago scroll, incluso rápido o en un teléfono modesto, para que la experiencia se sienta cinematográfica y no "pegada".

## Estado actual (medido antes de escribir la spec)
- Reproductor: `client/src/wstyle/seq/SequencePlayer.ts` + `client/src/wstyle/hooks/useScrollCamera.ts` + `client/src/wstyle/experience.ts`.
- Secuencia de **150 frames webp** (desktop sd 1280×720 = 7.6 MB, hd 1600×900 = 10.5 MB; mobile 720×1280 / 900×1600) para ~7 800 px de scroll → **~50 px de scroll por frame** (escalonado visible). 7 anclas: 1, 26, 51, 76, 100, 125, 150.
- Memoria acotada: anclas + ventana ±20 (`WINDOW = 20`) decodificados; fuera de la ventana libera con `img.src = ''` y re-pide. Carga en background con concurrencia 4, primero 1 de cada 5.
- Causa principal sospechada: con scroll rápido más allá de la ventana, `nearest()` devuelve un frame lejano (a menudo un ancla) y la imagen queda "pegada" hasta que llegan los frames.
- Hipótesis secundarias a medir: decodificación y `drawImage` de webp grandes en el hilo principal; re-fetch de lo que se acaba de liberar; suavizado del frame (factor k) que añade latencia.
- Proyecto Blender: `~/Projects/barberia-3d` (`blender/barberia.blend`, `blender/render_camino.py`, `blender/camera-path-desktop.json` / `camera-path-mobile.json`, `scripts/export-wstyle.mjs`, `scripts/sync-seq.mjs` → `public/wstyle/seq`). Blender en `/opt/homebrew/bin/blender`.
- Auditoría de estilo: la toma de fondo de **"La carta"** es una cenital fría con tinte azul en la esquina superior derecha; la toma final de **"Llega"** es una pared con una puerta, sin clímax.

## Alcance
- **Incluye:**
  1. **Baseline medido** (antes de tocar nada) con un script reproducible.
  2. **Mejoras del reproductor**: decodificación fuera del hilo principal (`createImageBitmap`, idealmente en worker/`OffscreenCanvas` si el navegador lo soporta, con respaldo), prefetch **direccional** según velocidad y sentido del scroll, ventana **adaptable** (más ancha hacia donde va el usuario y según memoria del dispositivo), no liberar lo que se va a volver a pedir (histéresis/LRU), y que el frame mostrado sea siempre el **más cercano disponible al pedido** y no un ancla lejana.
  3. **Re-render** en Blender con más frames (objetivo 300–450; el número final lo fija la medición) y calidad/resolución recalibradas por variante con **presupuesto de bytes** (ver reglas).
  4. **Nuevas tomas**: "La carta" con toma cálida (navajas / sillón); final de "Llega" con clímax (fachada iluminada o silla iluminada).
  5. Actualizar `manifest.json`, anclas y el mapeo scroll→frame si cambia el número de frames.
- **Fuera:** cambiar textos, secciones o el diseño de la UI de WS Style; cambiar el respaldo three.js más allá de lo necesario para que siga funcionando; video `<video>` como reemplazo de la secuencia (se puede evaluar en el informe, no implementar).

## Reglas de negocio
1. **Medir primero.** No se re-renderiza ni se cambia el reproductor sin baseline guardado.
2. Las mediciones son en **build de producción** (`npm run build` + `vite preview`), nunca en dev, con **CDP throttle CPU 4×** y red **Fast 4G** (perfil Chrome DevTools), en **desktop (1440×900)** y **móvil (390×844, DPR 3, touch)**.
3. Métricas oficiales (por escenario):
   - **M1 desfase**: % de frames de animación (rAF) durante el scroll en que |frame mostrado − frame pedido| > 2.
   - **M2 pegado máximo**: mayor tiempo continuo (ms) en que el frame mostrado no cambia mientras el frame pedido sí cambia.
   - **M3 long tasks**: cantidad y duración total de long tasks (> 50 ms) durante el scroll (PerformanceObserver `longtask`).
   - **M4 primer frame / LCP** y **bytes transferidos** hasta el primer frame utilizable.
   - **M5 memoria**: pico de JS heap + estimación de bitmaps retenidos (frames vivos × ancho × alto × 4).
4. Escenarios de scroll (scriptados, deterministas, con `window.scrollTo` por rAF, sin smooth-scroll del navegador): **lento** (recorrido completo en 30 s), **normal** (12 s), **rápido** (3 s), **salto** (clic en el navbar a la última sección y vuelta) y **vaivén** (adelante/atrás 3 veces en una zona).
5. **Presupuesto de bytes** por variante (total de la secuencia): desktop sd ≤ 14 MB, desktop hd ≤ 20 MB, mobile sd ≤ 10 MB, mobile hd ≤ 14 MB. Las anclas + primeros frames necesarios para el primer render ≤ 600 KB.
6. La calidad visual no puede empeorar de forma perceptible: SSIM ≥ 0.95 de cada frame nuevo contra un render de referencia sin compresión (muestra de 10 frames).
7. Se mantienen el **respaldo three.js** (fallo de manifest/anclas o sin soporte) y **prefers-reduced-motion** (sin interpolación ni animación: salto directo al frame de la sección).
8. Memoria acotada sigue siendo requisito: en móvil, pico de bitmaps retenidos ≤ 150 MB.

## Flujo principal
1. Script de medición `~/Projects/barberia-3d/scripts/measure-seq.mjs` (o en este repo `client/scripts/measure-seq.mjs`) corre los 5 escenarios × 2 dispositivos y escribe `docs/perf/seq-baseline.json` + un resumen legible.
2. Se aplican las mejoras del reproductor sobre la secuencia actual de 150 frames y se mide de nuevo (`seq-player.json`), para separar el efecto del código del efecto del re-render.
3. Se re-renderiza (desktop y móvil) con el número de frames y calidad elegidos, incluidas las tomas nuevas de "La carta" y "Llega"; se exporta a `client/public/wstyle/seq/...` con el pipeline existente.
4. Se mide la versión final (`seq-final.json`) y se compara contra el baseline en una tabla antes/después.
5. Verificación visual en el navegador local de las tomas nuevas y del recorrido completo.

## Casos borde
- Scroll rápido hasta el final apenas carga la página (frames aún no descargados): debe mostrarse el frame disponible más cercano al pedido, nunca uno de otra sección si hay uno más cercano.
- Cambio de sentido brusco (vaivén): lo recién mostrado no se re-descarga.
- Pestaña en segundo plano y vuelta: no se dispara un pico de descargas ni long tasks.
- Rotación / resize de móvil: cambio de variante (desktop↔mobile) sin congelar ni filtrar memoria.
- Red lenta o un frame 404: no se bloquea el recorrido; se salta al vecino disponible.
- Navegador sin `createImageBitmap` en worker / `OffscreenCanvas` (Safari antiguo): ruta de respaldo en hilo principal funcionando.
- prefers-reduced-motion activo: sin carga en background masiva (comportamiento actual).

## Criterios de aceptación
- **AC-01 Baseline:** existe `docs/perf/seq-baseline.json` con M1–M5 para los 5 escenarios × 2 dispositivos, generado por un script versionado y reproducible con un comando documentado.
- **AC-02 Desfase (M1):** en el escenario **normal**, M1 ≤ 2 % en desktop y ≤ 5 % en móvil; en **rápido**, M1 ≤ 10 % desktop y ≤ 20 % móvil; y en todos los escenarios M1 baja al menos 50 % respecto al baseline.
- **AC-03 Pegado máximo (M2):** ≤ 150 ms en normal y ≤ 400 ms en rápido/salto (desktop y móvil); nunca peor que el baseline.
- **AC-04 Long tasks (M3):** durante el escenario normal, ninguna long task > 100 ms atribuible a decodificación/dibujo de frames y duración total de long tasks reducida ≥ 50 % frente al baseline.
- **AC-05 Densidad:** la secuencia final tiene ≥ 300 frames y ≤ 26 px de scroll por frame en desktop.
- **AC-06 Bytes:** cada variante cumple el presupuesto de la regla 5; la descarga hasta el primer frame no crece más de 20 % frente al baseline.
- **AC-07 Calidad:** SSIM ≥ 0.95 en la muestra de 10 frames (regla 6), con el informe de SSIM guardado junto a las métricas.
- **AC-08 Memoria:** pico de bitmaps retenidos en móvil ≤ 150 MB y sin crecimiento sostenido tras 3 recorridos completos (heap final ≤ heap tras el primer recorrido + 10 %).
- **AC-09 Sin re-descarga en vaivén:** en el escenario vaivén, ningún frame se pide por red más de una vez (verificado con el listado de requests).
- **AC-10 Tomas nuevas:** el fondo de "La carta" es una toma cálida (navajas o sillón) sin dominante azul (media de canal B ≤ media de canal R en la esquina superior derecha) y la toma final de "Llega" muestra fachada o silla iluminada; capturas antes/después adjuntas.
- **AC-11 Respaldos:** forzando fallo del manifest se ve el respaldo three.js; con prefers-reduced-motion el recorrido salta por sección sin interpolar; ambos verificados en el navegador local.
- **AC-12 Informe:** tabla antes/después (baseline → reproductor → final) con M1–M5 por escenario y dispositivo en el PR.
- **AC-13** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes (y tests si existen).

## Decisiones confirmadas
- Medir primero, en build de producción con CPU 4× y Fast 4G, desktop y móvil (pedido del orquestador).
- Mantener respaldo three.js y prefers-reduced-motion.
- Incluir en el re-render las tomas nuevas de "La carta" (cálida) y final de "Llega" (con clímax).
- La marca es **WS Style** (SPEC-24).

## Asunciones pendientes de validar
1. Los umbrales numéricos de AC-02/03/04/08 son objetivo inicial; si el baseline muestra que son triviales o imposibles, se recalibran y se documenta el motivo.
2. El número final de frames (300–450) lo decide la medición dentro del presupuesto de bytes; no se fija de antemano.
3. Se acepta un aumento moderado del peso total (presupuestos de la regla 5) a cambio de fluidez.
4. Para el final de "Llega" se prefiere la **fachada iluminada** de noche; la silla iluminada queda como alternativa si la fachada no está modelada con calidad suficiente.
5. Para "La carta" se prefiere un plano cálido de **navajas sobre el mesón**; el sillón es alternativa.
6. El recorrido (trayectoria de cámara) no cambia salvo en esas dos tomas.
7. El tiempo de render en Blender (horas de máquina) es aceptable sin límite explícito.
8. Si `vite preview` sirve `/wstyle/` distinto que GitHub Pages, la medición oficial se hace en `vite preview` igual.
