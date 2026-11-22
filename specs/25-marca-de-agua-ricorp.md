# SPEC-25 — Marca de agua Ricorp nítida, legible y que no tape contenido

> Pedido del usuario (2026-10-25): "el logo de Ricorp aparece como cortado; la marca de agua debe verse bien, es nuestra presentación y nuestra marca".

## Historia
Como Ricorp (autor del sitio), quiero que la firma "Powered by RICORP ricorp.cl" se vea nítida y completa y nunca tape el contenido de la barbería, para que presente bien nuestra marca sin perjudicar la del cliente.

## Estado actual (evidencia)
- `client/src/wstyle/components/RicorpBadge.tsx/.css`: `<a class="ricorp-badge">` fijo abajo-izquierda (`z-index: 80`), alto 28 px; el logo `/wstyle/brand/ricorp-logo.svg` se dibuja a **13 px** de alto (10 px en `.compact`).
- El SVG tiene `viewBox="0 0 104 24"` y un `clipPath` con `rect height="23.3357"`: el dibujo no llena el viewBox y queda recortado por abajo; a 13/10 px los trazos caen en subpíxeles y las letras se ven cortadas/borrosas.
- El badge se monta sobre contenido: en "La carta" tapa "Vapor facial, exfoliación…"; en "Antes de venir" tapa el titular.
- Hay dos créditos: el badge flotante y el footer de "Llega" ("Sitio desarrollado por ricorp.cl").
- Regla vigente (SPEC-11, `public/wstyle/config.json`): `poweredBy` solo se oculta con `false` literal; también controla el "Powered by ricorp.cl" del Loader.

## Alcance
- **Incluye:** corregir el SVG (viewBox ajustado al bbox real de los paths, sin `clipPath` que recorte; alineado a píxel entero), tamaño legible del logo, regla de "no tapar texto", unificación del crédito, mantener `config.poweredBy`.
- **Fuera:** rediseñar el logo de Ricorp; mover la firma dentro del contenido de la barbería en otras secciones; el crédito del Loader (se mantiene tal cual).

## Reglas de negocio
1. La firma es visible en todo el recorrido salvo cuando taparía texto o un panel sólido de contenido.
2. Nunca hay dos créditos Ricorp visibles a la vez en pantalla.
3. `poweredBy: false` oculta TODA firma Ricorp (badge, footer y loader); ausente o cualquier otro valor ⇒ visible.
4. La firma es discreta (no compite con los CTA de la barbería) pero legible: logo con al menos 16 px de alto en desktop y 14 px en móvil.

## Flujo principal
1. Hero y tomas del render (paneles transparentes): el badge se ve abajo-izquierda.
2. Al llegar a una sección con panel sólido o texto que llega a la esquina inferior izquierda ("La carta", "Membresía", "Antes de venir"…): el badge se desvanece (opacidad 0, sin foco) mientras esa zona se solapa.
3. En "Llega": el badge se oculta y queda solo el crédito del footer, que usa el mismo logo SVG ("Sitio desarrollado por [logo RICORP]").

## Casos borde
- DPR 1, 2 y 3: el logo no se ve cortado ni borroso.
- Pantallas muy bajas (p.ej. 1440×700) donde el texto llega al borde inferior: el badge se oculta, no se superpone.
- Teclado: si el badge está oculto no recibe foco (`tabindex=-1` / `inert`); si está visible su foco es visible.
- `prefers-reduced-motion`: el ocultar/mostrar es instantáneo (sin transición).
- Menú móvil abierto: el badge no aparece encima del overlay.
- Coordinar con SPEC-26 (flotantes en móvil): el badge no puede compartir fila con el CTA flotante si no caben sin solaparse.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** En `ricorp-logo.svg`, la unión de `getBBox()` de todos los paths cabe dentro del `viewBox` (ningún lado sobresale) y el SVG no tiene `clipPath` que recorte paths; margen interno ≤ 1 unidad por lado.
- **AC-02** Altura renderizada del `<img>` del logo: ≥ 16 px a 1440×900 y ≥ 14 px a 390×844, con alto en px entero. Capturas a DPR 1, 2 y 3 (emulación) muestran las 6 letras "RICORP" completas, sin cortes abajo.
- **AC-03** Recorriendo todas las secciones con `scrollIntoView` (y al final de cada una), en ningún momento el rect del badge visible (opacidad > 0) se intersecta con el rect de un nodo de texto de `main` (`h1,h2,h3,p,li,address,a.btn`) ni con `.info`, `.member`, `.services`/carta o `.policies`.
- **AC-04** Caso concreto: con "Vapor facial, exfoliación…" de La carta y el titular de "Antes de venir" en la franja inferior izquierda, el badge está oculto (opacidad 0) a 1440×900 y 390×844.
- **AC-05** En cualquier scroll, el número de créditos Ricorp visibles en el viewport (badge con opacidad > 0 + `[data-powered]` dentro del viewport) es ≤ 1.
- **AC-06** El crédito del footer usa el mismo logo SVG y enlaza a `https://ricorp.cl` (nueva pestaña, `rel="noopener"`).
- **AC-07** Con `config.json` `poweredBy: false`: no existen `.ricorp-badge`, `[data-powered]` ni `.loader__by` en el DOM. Sin `config.json` o sin el campo: aparecen.
- **AC-08** Badge oculto ⇒ no enfocable con Tab; visible ⇒ foco visible. Con `prefers-reduced-motion: reduce` no hay `transition` en la opacidad.
- **AC-09** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- ✔ La firma se mantiene (es la presentación de Ricorp) y sigue la regla `config.poweredBy` de SPEC-11.

## Asunciones pendientes de validar
1. Para no tapar texto, el badge se **esconde** sobre paneles sólidos/texto (en vez de reservar una franja vacía abajo en todas las secciones).
2. En "Llega" queda solo el crédito del footer (con logo) y el badge se oculta; el texto "Sitio desarrollado por" se mantiene.
3. El badge sigue abajo-izquierda; el texto "Powered by … ricorp.cl" se mantiene (en móvil puede quedar solo "Powered by [logo]" si no cabe).
4. Tamaño mínimo del logo: 16 px desktop / 14 px móvil.
5. El "Powered by ricorp.cl" del Loader se mantiene igual.
