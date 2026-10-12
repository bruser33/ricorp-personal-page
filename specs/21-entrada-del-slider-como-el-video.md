# SPEC-21 — Entrada al slider: deslizamiento de abajo hacia arriba como en el video

> Pedido del usuario (2026-10-12): "el slider no tiene el mismo efecto que en el video; en el video parece como que sale de abajo hacia arriba; analiza eso".
> Referencia: `~/Desktop/Grabación de pantalla 2026-10-12 a la(s) 11.52.58 a.m..mov`, tramo **9.0–12.0 s** (prototipo de Figma, hero → Proyectos).

## Análisis del video (medido cada 0.1 s, frame de 618 px de alto)
Borde superior de la card activa (Haru) en el viewport:

| t (s) | 9.4 | 9.6 | 9.8 | 10.0 | 10.2 | 10.4 | 10.6 | 10.8 | 11.0 | 11.2 | 11.4 | 11.6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| y (px) | 604 | 524 | 436 | 368 | 302 | 244 | 190 | 144 | 104 | 74 | 54 | 46 |
| y (% alto) | 98 | 85 | 71 | 60 | 49 | 39 | 31 | 23 | 17 | 12 | 9 | 7 |

- **Es un solo deslizamiento continuo de ~2.2 s** (9.35 → 11.6 s): el hero y el slider suben **juntos** como una película. El slider asoma por el borde inferior y sube hasta su lugar.
- **Curva ease-out:** arranca a velocidad máxima (~40 px por 0.1 s) y frena suave hasta 0 (≈ `cubic-bezier(0.25, 0.6, 0.3, 1)` / easeOutCubic; afinar contra la tabla). Sin rebote.
- **Navbar:** a los 9.2 s el navbar se va hacia arriba y no se ve durante el deslizamiento ni en Proyectos. Vuelve a aparecer al subir (21–22 s, con la píldora de SPEC-19). → **Pendiente de validar** con el usuario, NO se implementa en esta spec.
- **Dots** del slider aparecen cuando las cards ya casi llegaron (~10.5–11.0 s), con un fade.
- Hoy: `useAutoAdvanceToProjects` (`client/src/App.tsx:115-176`) usa `scrollIntoView({behavior:'smooth'})` nativo (rápido, ~0.5 s, con la curva del navegador) y además pelea con `scroll-snap-type: y proximity` (`index.css:109-120`). Por eso el slider "aparece" en vez de subir.

## Historia
Como visitante, al pasar del hero a Proyectos quiero ver cómo el slider sube desde abajo en un deslizamiento lento y suave, como en el prototipo.

## Alcance
- **Incluye:** reemplazar el scroll nativo del auto-avance por una animación propia (rAF) de ~2200 ms con ease-out; suspender snap/`scroll-behavior` durante el deslizamiento y restaurarlos al terminar; ignorar wheel/touch/teclas durante el deslizamiento (sin cortarlo); fade-in de los dots al llegar. También el link "about" del navbar hacia `#about` desde el hero usa el mismo deslizamiento.
- **Fuera:** ocultar el navbar al bajar (pendiente de validar); drag del slider (SPEC-16); el resto de las transiciones entre secciones.

## Criterios de aceptación
- **AC-01** Tras el intro, un wheel en el hero dispara un deslizamiento hasta `#about` que dura 2000–2400 ms (medido con `performance.now()` + `scrollY` muestreado cada frame).
- **AC-02** La curva medida es monótona y ease-out: la velocidad del primer 20 % del tiempo es ≥ 3× la del último 20 %; el recorrido al 50 % del tiempo es ≥ 70 %.
- **AC-03** Durante el deslizamiento, wheel/teclas adicionales no lo cortan ni lo duplican; al terminar, `scrollY === #about.offsetTop` (± 2 px) y el snap vuelve a estar activo.
- **AC-04** Los dots tienen opacidad < 0.2 al empezar y 1 al llegar.
- **AC-05** `prefers-reduced-motion`: salto directo sin animación (comportamiento actual).
- **AC-06** `npm run build` y `npm run lint` verdes.

## Decisiones confirmadas
- ✔ Replicar el deslizamiento de abajo hacia arriba del video. (usuario, 2026-10-12)

## Asunciones pendientes de validar
- Ocultar el navbar mientras se baja y mostrarlo al subir, como en el video.
- Duración 2.2 s (es larga; si se siente lenta, bajar a 1.6 s manteniendo la curva).
