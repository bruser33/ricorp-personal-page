# SPEC-16 — Slider de Proyectos: arrastre con la mano y fuerza

> Pedido del usuario (2026-10-12), punto 2 de la lista de correcciones: "el controlador de atrás y adelante no funciona; se debe activar la mano y si la muevo hacia la izquierda se mueve el slider a la izquierda… dependiendo de la fuerza, si hago mucha fuerza se mueven dos sliders, si no una". Punto 6 (parte slider): sacar el mensaje de políticas del slider.
> Referencia: `~/Desktop/Grabación de pantalla 2026-10-12 a la(s) 11.52.58 a.m..mov`, tramo 10–26 s (prototipo de Figma).

## Historia
Como visitante, quiero agarrar el slider con el cursor de mano y arrastrarlo, para recorrer los proyectos con un gesto natural, donde un tirón fuerte avanza más que uno suave.

## Alcance
- **Incluye:** cursor de mano (abierta al pasar, cerrada al agarrar) en todo el slider, incluidas las cards; arrastre con mouse y touch; avance de 1 o 2 cards según la velocidad del gesto; clic en card vecina y clic en la activa (abre el modal) siguen funcionando; quitar `<Footline />` del slider.
- **Fuera:** botones de flecha visibles (se quitaron en `e7f487a` y siguen fuera); hand-tracking por cámara; cambios al modal de proyecto.

## Estado actual (código)
- `client/src/components/Projects.tsx:431-471`: drag con pointer; inercia `vel*180` clampada a ±3 slides (`:462-464`); `setPointerCapture` sobre el viewport (`:442`). Hipótesis: el capture desvía el `click` al viewport y las cards no reciben su `onClick` → "atrás/adelante no funciona".
- Auto-play cada 4200 ms con transición lineal (`:71`, `:289-313`) que puede pelear con el drag.
- `<Footline />` en `Projects.tsx:660`.

## Reglas de negocio
1. Dirección: arrastrar hacia la izquierda trae la card siguiente (el track se mueve a la izquierda); hacia la derecha, la anterior. El track sigue al dedo/cursor 1:1 durante el arrastre.
2. Fuerza = velocidad del gesto al soltar. Suave (o arrastre lento que supere ~15 % del ancho de card) → **1 card**. Fuerte (velocidad alta) → **2 cards**. Nunca más de 2.
3. Un arrastre menor al umbral (<5 px o sin velocidad suficiente) vuelve a la card actual y cuenta como clic.
4. Durante el arrastre el auto-play se pausa y se reanuda con la regla existente (4000 ms tras interactuar).
5. El loop infinito se mantiene (sin saltos visibles al cruzar el borde).

## Flujo principal
Hover sobre el slider → cursor `grab` → mousedown/touchstart → `grabbing` y el track sigue el puntero → soltar → se calcula la velocidad → snap animado a ±1 o ±2 cards → dots actualizados.

## Casos borde
- Touch en mobile (auto-play apagado ahí): mismo comportamiento, sin bloquear el scroll vertical (gesto mayormente vertical = scroll de página).
- Clic en card vecina sin arrastre → `goTo` a esa card. Clic en la activa → abre el modal.
- `prefers-reduced-motion`: el snap es instantáneo, pero el arrastre funciona.

## Criterios de aceptación
- **AC-01** Sobre cualquier punto del slider (cards incluidas) el cursor computado es `grab`, y `grabbing` mientras se arrastra.
- **AC-02** Arrastre lento hacia la izquierda de ~30 % del ancho de card → el índice activo avanza exactamente +1; hacia la derecha → −1.
- **AC-03** Arrastre rápido (flick, ≥ umbral de velocidad definido en código como constante con nombre) → avanza exactamente ±2.
- **AC-04** Ningún gesto avanza más de 2.
- **AC-05** Clic sin arrastre en una card vecina la centra; clic en la activa abre el modal (verificado en Chromium con Playwright, eventos de mouse reales).
- **AC-06** El slider ya no contiene el texto "Política de Privacidad"/"Privacy Policy" (sin `<Footline>` dentro de `#about`).
- **AC-07** `cd client && npm run build` y `npm run lint` verdes.

## Decisiones confirmadas
- ✔ "La mano" = cursor de mano con mouse/touch (no cámara, no flechas). (usuario, 2026-10-12)
- ✔ Fuerza fuerte = 2 cards, suave = 1.

## Asunciones pendientes de validar
- Umbral de velocidad de "fuerte": se calibra a ojo (≈ 0.8 px/ms) y queda como constante.

## Decisiones de implementación (pendientes de validar por el usuario)
- Regla 3: solo un gesto **< 5 px** cuenta como clic. Un arrastre de 5 px a ~15 % de la card, lento, vuelve a la card actual pero NO abre/centra (abrir el modal tras arrastrar 60 px sería sorpresivo).
- La velocidad solo cuenta desde **30 px** de recorrido (`DRAG_FLICK_MIN_PX`): sin ese mínimo un tap con temblor de 6 px en 5 ms "volaba" a >1 px/ms y saltaba 2 cards.
- Un arrastre lento que ya cruzó más de card y media termina en 2 (no en 1): el track sigue al dedo 1:1 y devolverlo se leería como rebote. Tope duro de 2 igual.
- Constantes en `Projects.tsx`: `DRAG_FLICK_VELOCITY = 0.8 px/ms`, `DRAG_NUDGE_VELOCITY = 0.3`, `DRAG_MIN_FRACTION = 0.15`, ventana de velocidad 100 ms.
