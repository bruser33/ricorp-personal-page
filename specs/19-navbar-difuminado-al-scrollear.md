# SPEC-19 — Navbar: recuperar el panel difuminado detrás del logo al scrollear

> Pedido del usuario (2026-10-12), punto 9: "teníamos un efecto en el navbar donde sale el logo de RICORP que se perdió; cuando bajaba tenía un fondo blanco difuminado hacia la derecha, era único, se hacía con scroll".
> Referencia: video, tramo 20–24 s: al scrollear aparece una píldora translúcida desde el logo RICORP hasta "about", que difumina lo que pasa por detrás (se ve la cara borrosa).

## Historia
Como visitante, al bajar quiero que el logo y los links queden sobre un panel de vidrio esmerilado, como en el prototipo.

## Alcance
- **Incluye:** restaurar en `Header.css` el panel de `454ef4f` (píldora desde el logo hacia la derecha, `rgba(255,255,255,0.07)`, `backdrop-filter: blur(14px)`, borde `rgba(255,255,255,0.10)`, transición con `--dur-hover`/`--ease-figma-out`) que aparece con `.site-header.scrolled`; versión mobile de `abf0da9` (píldora a la izquierda, `left:-14px; width:124px; height:52px`).
- **Fuera:** links del navbar (SPEC-18 cambia `news`); idioma.

## Estado actual (código)
- `client/src/components/Header.css:43-61`: solo un scrim oscuro de borde a borde (desde `9ffc38a`, "header sin contorno").
- `scrolled` se activa con `scrollY > 10` (`Header.tsx:17-22`).
- CSS histórico: `git show 454ef4f -- client/src/components/Header.css`.

## Reglas de negocio
1. Arriba del todo (scrollY ≤ 10) no hay panel; al bajar aparece con transición.
2. El panel difumina el contenido detrás (backdrop blur), no es un color opaco.
3. **Gotcha de build:** escribir solo `backdrop-filter` (sin `-webkit-backdrop-filter`): con ambas, el minificador deja solo la prefijada y Chrome pierde el blur (ver `vite.config.ts` y el fix de la ronda 4 del PR #9).
4. El scrim oscuro actual se reemplaza por el panel.

## Criterios de aceptación
- **AC-01** Con `scrollY = 0`, el pseudo/panel tiene fondo transparente y `backdrop-filter: none`.
- **AC-02** Con `scrollY > 10`, `getComputedStyle(panel).backdropFilter` contiene `blur(14px)` y el fondo es `rgba(255, 255, 255, 0.07)`.
- **AC-03** En el **build de producción** (`npm run build && npm run preview`) el CSS servido contiene `backdrop-filter:blur(14px)` sin prefijo y Chromium lo aplica.
- **AC-04** El panel abarca desde el logo hasta el último link en escritorio (1440 px); en mobile (390 px) es la píldora del logo.
- **AC-05** `npm run build` y `npm run lint` verdes.

## Decisiones confirmadas
- ✔ Volver al efecto de `454ef4f` (+ mobile de `abf0da9`), que coincide con el video.

## Asunciones pendientes de validar
- "Blanco difuminado hacia la derecha" = el panel que se extiende del logo hacia la derecha (ninguna versión tuvo un degradado que se desvanece; si el usuario quiere fade real, agregar `mask-image: linear-gradient(to right, #000 60%, transparent)`).
