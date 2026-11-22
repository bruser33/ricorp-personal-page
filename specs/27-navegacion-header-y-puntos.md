# SPEC-27 — Navegación: que el header no tape las secciones y puntos con nombre

> Hallazgos de revisión (2026-10-25): header + franja "Versión de demostración" ocupan ~95 px y tapan las etiquetas de sección al navegar ("06 — MEMBRESÍA" cortada). Los 9 puntos de progreso no dicen a qué sección llevan.

## Historia
Como visitante, quiero que al saltar a una sección vea su título completo y saber a qué sección lleva cada punto lateral, para orientarme en el recorrido.

## Estado actual
- `--nav-h: 68px` (56 px en `.compact`); `.demo-strip` fija debajo del header (`top: var(--nav-h)`, padding 7 px, z 39) → ~95 px tapados en desktop y ~80 px en móvil.
- No hay `scroll-margin-top` en las secciones; los anclas `#reyes`, `#servicios`, `#llega` del nav y los puntos llevan el borde superior de la sección bajo el header. Los paneles compensan con `padding-top` en `.is-demo`, pero las secciones `Extra` (Membresía, Políticas…) igual quedan con la etiqueta cortada.
- `components/ProgressDots.tsx`: `<a aria-label={label}>` sin texto visible; en `.compact` los puntos se ocultan.

## Alcance
- **Incluye:** `scroll-margin-top` en todas las secciones destino igual a la altura real de header + franja; franja demo más baja (una línea, ≤ 24 px) integrada visualmente al header; etiqueta visible del capítulo en hover/focus de cada punto; estado `aria-current` en el punto activo.
- **Fuera:** mostrar los puntos en móvil (siguen ocultos en compact); cambiar el orden o los nombres de capítulos; menú móvil.

## Reglas de negocio
1. Al navegar a cualquier sección (nav, puntos, menú móvil, URL con hash), su etiqueta numerada ("06 — MEMBRESÍA") y su titular quedan enteros debajo del header + franja.
2. La franja demo sigue visible mientras `demo: true` (no se quita ni se cierra) pero ocupa menos.
3. Cada punto muestra, en hover y en foco de teclado, el nombre del capítulo ("Membresía", "La carta"…) a su izquierda; el lector de pantalla lo anuncia y el punto activo se anuncia como actual.
4. Nombres de los puntos = los `label` de `chapters` en `App.tsx` (Inicio, El local, El oficio, El espejo, Tu trono, La carta, Membresía, …, Llega).

## Flujo principal
1. Clic en "SERVICIOS" del header → la página baja y "05 — LA CARTA" se ve completa bajo la franja.
2. Hover sobre el 7º punto → aparece "Membresía" junto al punto; clic → "06 — MEMBRESÍA" visible entera.
3. Tab hasta los puntos → cada uno muestra su nombre al recibir foco.

## Casos borde
- `demo: false`: sin franja, el `scroll-margin-top` se ajusta solo a la altura del header.
- Carga con hash (`/wstyle/#membresia`) o recarga: mismo resultado que el clic (también tras el loader).
- Secciones opcionales (Barberos/Reseñas) desactivadas: no hay punto ni etiqueta para ellas.
- Etiqueta del punto no debe salirse por la derecha ni tapar el texto del panel (se dibuja hacia la izquierda, con fondo).
- `prefers-reduced-motion`: la etiqueta aparece sin animación.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** Para cada capítulo, tras navegar a `#id` (clic en punto/nav/menú y también cargando la URL con hash) y esperar el fin del scroll, el `getBoundingClientRect().top` de la etiqueta `.eyebrow` de la sección es ≥ (bottom de `.demo-strip` o de `.nav` si no hay franja) + 8 px, en ambos tamaños.
- **AC-02** Caso concreto: "06 — MEMBRESÍA" se ve entera tras clic en su punto a 1440×900 (captura).
- **AC-03** La altura de `.demo-strip` es ≤ 24 px y su texto ocupa una sola línea en ambos tamaños; `demo:false` ⇒ no existe `[data-demo-banner]`.
- **AC-04** 1440×900: `hover` y `focus` en cada punto muestran un elemento visible con el `label` del capítulo; sin hover/focus no es visible. El texto no se superpone con texto de `main` (rects).
- **AC-05** Cada punto tiene nombre accesible = label del capítulo; el activo tiene `aria-current="true"` (o `"location"`) y solo uno lo tiene.
- **AC-06** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- (ninguna adicional; modo autónomo)

## Asunciones pendientes de validar
1. La franja demo se mantiene fija pero más baja e integrada al header (misma superficie), en vez de moverse al pie o al hero.
2. La etiqueta de los puntos aparece solo en hover/foco (no siempre visible, ni la del activo).
3. En móvil los puntos siguen ocultos.
4. La etiqueta usa el nombre corto ("Membresía"), sin el número.
