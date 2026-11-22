# SPEC-28 — Hero en móvil como portada de revista

> Hallazgos de revisión (2026-10-25, captura 390×844 `.playwright-mcp/page-2026-10-25T14-23-40-666Z.jpeg`): el texto del hero se amontona arriba y deja la mitad inferior vacía; "Desliza para recorrer el local" queda encima del sillón.

## Historia
Como visitante en el teléfono, quiero que la portada muestre el local arriba y el nombre, el precio y "Reservar" abajo, al alcance del pulgar, para reservar sin estirar la mano y ver el local sin texto encima.

## Estado actual
- `.compact .panel { justify-content: flex-start; padding: calc(var(--nav-h) + 40px) … 96px }` → todo el bloque del hero (etiqueta, `h1`, slogan, concepto, "Corte desde", Reservar, hint) arranca bajo el header.
- `.hint` ("Desliza para recorrer el local") está en el flujo, debajo del CTA, alineado a la izquierda, con una línea `::after`; cae sobre el sillón del render.

## Alcance
- **Incluye (solo layout compacto):** anclar el bloque del hero abajo (portada de revista), CTA "Reservar" en el tercio inferior, mover el hint a centrado abajo con flecha animada que respeta `prefers-reduced-motion`.
- **Fuera:** desktop (sin cambios), textos del hero, el CTA flotante (SPEC-26), la toma del render.

## Reglas de negocio
1. En móvil, el bloque de texto del hero se apoya en la parte inferior de la pantalla; la parte superior queda para el render.
2. "Reservar" del hero queda dentro del tercio inferior de la pantalla.
3. El hint va centrado horizontalmente, al pie de la pantalla, con una flecha hacia abajo que se mueve suave; con `prefers-reduced-motion: reduce` la flecha está quieta.
4. El hint se desvanece al empezar a scrollear (no acompaña a la siguiente sección).
5. Legibilidad: el texto anclado abajo lleva un degradado oscuro de abajo hacia arriba detrás para contrastar con el piso de madera.

## Flujo principal
1. Abre `/wstyle/` en 390×844 → tras el loader ve el local arriba; abajo: "BARBERÍA · SANTIAGO", "W(S) STYLE.", slogan, concepto, "Corte desde $12.000", "Reservar"; al pie, centrado, "Desliza para recorrer el local" + flecha.
2. Desliza → el hint desaparece y sigue el recorrido.

## Casos borde
- Pantallas bajas (360×640, 390×664 con barra de Safari): el bloque no se sale por arriba bajo el header ni se solapa con el hint; si no cabe, se reduce el espacio entre elementos antes que ocultar contenido.
- Safe area inferior (iPhone): el hint y el CTA respetan `env(safe-area-inset-bottom)`.
- Franja demo presente: no tapa la etiqueta del hero.
- Marca de agua (SPEC-25) abajo-izquierda: no se superpone con el hint ni el CTA.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 390×844; desktop 1440×900 sin cambios)
- **AC-01** 390×844, scroll 0: el `bottom` del bloque de texto del hero está a ≤ 140 px del borde inferior del viewport y el `top` de la etiqueta del hero es ≥ 844 × 0.35.
- **AC-02** El `top` del `[data-cta="hero-booking"]` es ≥ 844 × 2/3 y su `bottom` ≤ 844 − 16 − safe-area.
- **AC-03** El hint está centrado (|centro del hint − 195| ≤ 4 px), su `bottom` a ≤ 40 px del pie y no se intersecta con el CTA ni con `.ricorp-badge`.
- **AC-04** La flecha del hint tiene `animation-name` ≠ `none`; con `emulateMedia({ reducedMotion: 'reduce' })` su `animation-name` es `none` (o duración 0).
- **AC-05** Tras scrollear 80 px, el hint tiene opacidad 0.
- **AC-06** 360×640: ningún elemento del hero se intersecta con `.nav`/`.demo-strip`, ni el hint con el CTA; `scrollWidth === 360`.
- **AC-07** 1440×900: la posición del hero (rects de `h1` y CTA) no cambia respecto de `main` (±2 px).
- **AC-08** Contraste del slogan sobre su fondo efectivo ≥ 4.5:1 (muestreo de la captura en la caja del texto).
- **AC-09** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- (ninguna adicional; modo autónomo)

## Asunciones pendientes de validar
1. El cambio aplica solo al layout compacto; desktop queda igual.
2. El hint desaparece al empezar a scrollear.
3. Se agrega un degradado oscuro inferior detrás del bloque para legibilidad.
4. El orden de los elementos del hero no cambia (solo su posición vertical).
