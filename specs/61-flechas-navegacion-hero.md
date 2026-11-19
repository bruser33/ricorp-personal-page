# SPEC-61 — WS Style: Flechas de navegación en pantalla principal

> Pedido de Joe (dueño de WS Style, GitHub `jhoncamacho017-ai`) vía issue #99, 2026-11-19. Decisiones 1–6 confirmadas por Joe. Queda **una pregunta abierta** (P1: qué se muestra en las otras pantallas) que bloquea solo el contenido, no la mecánica. No se implementa hasta que Joe diga "hazla".

## Estado actual (revisado contra el código, rama `main` @ 0f5e782)
- **El hero tiene una sola "pantalla".** `client/src/wstyle/App.tsx` → `<Section id="hero" className="panel--hero">` con etiqueta, titular `h1` ("WS STYLE."), slogan, concepto, precio "desde" y botón [Reservar]. No existe carrusel, slider ni estado de "pantalla actual".
- **Barbero + fuego (SPEC-49):** `components/HeroFire.tsx` + `HeroFire.css`. Son capas `position: fixed` (no están dentro de la sección): canvas WebGL del fuego (`fx/fire.ts`, `mix-blend-mode: screen`) y el retrato `public/wstyle/hero/barbero.webp` (1100 px) / `barbero-sm.webp` (640 px). Desktop: retrato a la derecha (37vw), texto a la izquierda. Móvil (`.compact`): retrato centrado arriba, texto al pie. Al hacer scroll el retrato y el fuego se funden (`--hero-out`); las brasas (`components/Embers.tsx`) siguen el recorrido.
- **No hay más imágenes para el hero.** En `public/wstyle/` solo están `hero/` (las 2 versiones del retrato), `brand/`, `content/` y `seq/` (150 cuadros del recorrido 3D del local, en 4 resoluciones). `site.json` no tiene galería; los barberos están `enabled: false` y sin foto; el catálogo de estilos (SPEC-59) está especificado pero **no implementado** (no hay modelo `Style` en `server/src/models`).
- **Paleta:** "Noir de oficio" — `--ink #0E0D0C`, acento `--brass #B8875A`, cobre del fuego `#C2622D`, brillo hueso `#EDE6DA` (SPEC-49 regla 2: nada de naranja puro tipo `#FF7A00`).
- **Movimiento:** `hooks/useMotion.ts` (Lenis + GSAP) ya respeta `prefers-reduced-motion`; `HeroFire.css` desactiva animaciones con `reduce`.
- **Teclado:** no hay atajos globales de flechas en la landing (solo `Nav.tsx` escucha Escape). Lenis usa las flechas ↑/↓ para scroll.
- **Contenido editable:** todos los textos de la landing salen de `public/wstyle/content/site.json` (tipos en `content.ts`).
- **Publicación:** push a `main` dispara `.github/workflows/deploy-pages.yml` → https://ricorp.cl/wstyle/. Solo Pedro (`bruser33`) mergea.

## Historia
Como visitante de WS Style, quiero navegar entre distintas imágenes o pantallas de la sección principal mediante flechas a la izquierda y a la derecha, para explorar el contenido sin perder la identidad visual de la barbería.

## Alcance
**Incluye:**
- Dos flechas simétricas, una a cada lado del hero del barbero.
- Estilo cobre/naranja y brillo inspirado en el fuego del fondo.
- Navegación hacia adelante y atrás con transiciones suaves.
- Navegación circular entre primera y última pantalla.
- Adaptación a celulares.
- Conservar la imagen actual del barbero y el efecto de fuego.
- Lista de pantallas configurable desde `site.json` (sin tocar código para agregar o quitar una).

**No incluye:**
- Reemplazar la imagen actual del barbero ni eliminar el fuego.
- Modificar reservas, servicios, precios u otras secciones.
- Crear imágenes o contenido nuevo sin autorización (ver P1).
- Avance automático (autoplay) — no se pidió.

## Reglas de negocio
RN-01: Deben verse dos flechas simétricas en la pantalla principal.
RN-02: La izquierda retrocede y la derecha avanza entre elementos del inicio.
RN-03: Ambas mantienen tamaño, ubicación y estilo visual equilibrados.
RN-04: El diseño usa tonos cobre/naranja con brillo coherente con el fuego (dentro de la paleta de SPEC-49: tope `#C2622D`, brillo `#EDE6DA`).
RN-05: Los cambios entre elementos tienen transiciones suaves.
RN-06: Avanzar desde el último lleva al primero.
RN-07: Retroceder desde el primero lleva al último.
RN-08: En celulares ambas flechas siguen visibles y adaptadas.
RN-09: La primera pantalla conserva al barbero y el fuego actuales.
RN-10: Las flechas no ocultan al barbero ni contenido importante (titular, slogan, precio, [Reservar]).
RN-11: El titular, el slogan y [Reservar] se mantienen fijos en todas las pantallas; solo cambia la imagen/escena (así nunca se pierde el botón de reservar).
RN-12: Con una sola pantalla configurada no se muestran flechas (el hero queda exactamente como hoy).
RN-13: Con `prefers-reduced-motion: reduce` el cambio es instantáneo (sin deslizamiento) y el brillo de las flechas no late.

## Flujo principal
1. El visitante abre la página WS Style y ve al barbero con fuego de fondo (pantalla 1).
2. Ve una flecha a cada lado.
3. Presiona derecha y aparece el siguiente elemento con transición suave.
4. Presiona izquierda y regresa al anterior.
5. Puede navegar circularmente entre elementos disponibles.

## Casos borde
- Desde el primero, izquierda muestra el último; desde el último, derecha muestra el primero.
- Si solo hay un elemento, no se muestran flechas (RN-12).
- En celulares, las flechas no deben tapar contenido principal.
- Si falta una imagen (404 o error de carga), esa pantalla se salta; nunca queda la pantalla en blanco. Si fallan todas las extra, se ocultan las flechas.
- Mantener la animación del fuego existente al navegar (el fuego y las brasas no se reinician ni parpadean).
- Clics rápidos repetidos: no se acumulan transiciones; la última pulsación manda.
- Al bajar con scroll y volver arriba, se conserva la pantalla en la que estaba.
- Sin WebGL (fuego estático de SPEC-49): las flechas funcionan igual.

## Criterios de aceptación
(Verificación en http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844.)
- **AC-01** Las dos flechas aparecen alineadas y simétricas: misma altura (`top` del rect igual ±1 px) y misma distancia al borde de la pantalla (±1 px).
- **AC-02** Ambas tienen estilo visual coherente con el fuego: borde/brillo cobre-latón dentro de la paleta; estados hover y foco visibles (anillo de foco con contraste ≥ 3:1).
- **AC-03** Derecha muestra el siguiente elemento (`aria-live` anuncia "Pantalla 2 de N").
- **AC-04** Izquierda muestra el anterior.
- **AC-05** Las transiciones son suaves (fundido/deslizamiento de 400–700 ms); con `prefers-reduced-motion: reduce` el cambio es instantáneo.
- **AC-06** La navegación es circular (1 ← izquierda = N; N → derecha = 1).
- **AC-07** Funciona en celulares sin ocultar contenido: a 390×844 el rect de cada flecha no se cruza con el titular, el slogan, el precio ni [Reservar], y su área táctil es ≥ 44×44 px.
- **AC-08** La primera pantalla conserva al barbero y el fuego originales (mismo `barbero.webp`, mismo canvas del fuego; los tests de `heroFire.test.tsx` siguen pasando).
- **AC-09** No cambia reservas ni otras secciones (tests existentes de WS Style en verde; diff limitado al hero, `site.json`/`content.ts` y CSS).
- **AC-10** Accesible con teclado: Tab llega a ambas flechas, Enter/Espacio las activan; son `<button>` con `aria-label` "Pantalla anterior" / "Pantalla siguiente"; el grupo tiene `aria-roledescription="carrusel"`.
- **AC-11** Con un solo elemento configurado no se renderizan flechas (test unitario).
- **AC-12** Sin errores de consola; `tsc`, `vitest`, `lint`, `npm test` del server y `npm run build` en verde.
- **AC-13** Publicado en https://ricorp.cl/wstyle/ después del merge de Pedro (Pages en verde) y Joe confirma que lo vio en la web real.

## Decisiones confirmadas (por Joe)
1. Las flechas navegarán entre varias imágenes o pantallas del inicio.
2. Tendrán estilo cobre/naranja con brillo inspirado en el fuego.
3. Las transiciones serán suaves.
4. La navegación será circular.
5. En celulares se mostrarán ambas flechas adaptadas.
6. La primera pantalla conservará al barbero y el fuego actuales.

## Pregunta abierta (bloquea solo el contenido de las pantallas 2…N)
**P1 — ¿Qué se muestra en las otras pantallas?** Hoy no hay ninguna otra imagen para el hero.
- A: Tomas del recorrido 3D del local que ya existen (p. ej. "El local", "El espejo", "Tu trono"), con el fuego detrás. *(Recomendada: no inventa nada, se puede hacer ya.)*
- B: Fotos reales que Joe mande (del local, de trabajos, del equipo).
- C: Fotos del catálogo de estilos, cuando SPEC-59 esté hecha.
- D: Pantallas con los servicios/promociones que ya están en la carta (texto + precio sobre el fuego).
- E: Otra.

Hasta que Joe responda, la mecánica (flechas, transición, accesibilidad) se puede construir y probar con la opción A; si Joe elige B y no llegan las fotos, el AC de contenido queda ⛔ BLOQUEADO y se publica solo con lo aprobado.

## Diseño técnico (propuesta para el planner)
- **Datos:** campo opcional `site.hero.slides` en `public/wstyle/content/site.json` (tipado en `content.ts`): lista de `{ id, kind: 'portrait' | 'image', src?, srcSm?, alt, caption? }`. La pantalla 1 es siempre `portrait` (el barbero de SPEC-49) aunque el JSON no la liste. Validación tolerante (entradas sin `src` o `alt` se descartan) siguiendo el estilo de `str()`/`content.ts`.
- **Lógica pura** en `client/src/wstyle/heroSlides.ts`: `nextIndex(i, n)`, `prevIndex(i, n)` (circular), `normalizeSlides(site)`; tests en `heroSlides.test.ts` (test-first).
- **Componente** `components/HeroSlides.tsx` (+ `HeroSlides.css`):
  - Estado `index`; la capa de imagen de las pantallas 2…N vive junto al retrato dentro de `.hero-fx` (mismas capas fijas, bajo el grano/viñeta y sobre el fuego), para que el fuego no se toque. En la pantalla 1 se ve el retrato actual; en las otras el retrato se funde y entra la imagen (crossfade 500 ms, `opacity`/`transform` solamente).
  - Las flechas son `<button>` dentro de `<Section id="hero">` (se van con el scroll como el resto del hero). `HeroFire` recibe el índice activo por prop para fundir el retrato.
  - Ubicación: desktop centradas verticalmente, a 24 px de cada borde; la izquierda queda en la franja libre entre el borde y el titular (verificar que no se cruce con el `h1` de 15vw; si se cruza, bajarlas a la altura del retrato). Móvil: a media altura del retrato (zona superior), fuera del bloque de texto del pie.
  - Estilo: círculo 56 px (44 px en móvil) fondo `rgba(14,13,12,.55)` + `backdrop-filter: blur`, borde 1 px `--brass`, chevron hueso, `box-shadow` cobre `#C2622D` que respira suave (keyframes de 3 s, desactivado con `reduce`); hover/focus: brillo más intenso + `outline` latón.
  - Accesibilidad: `aria-label`, región `aria-live="polite"` con "Pantalla X de N", `aria-roledescription="carrusel"`. No se capturan ←/→ globalmente (no pelear con Lenis ni con el resto de la página); solo con foco dentro del grupo.
  - Imágenes: `loading="lazy"` excepto la siguiente, que se precarga al primer hover/foco; `onError` marca la pantalla como inválida y la salta.
- **Gate:** `cd client && npx tsc -b --noEmit && npx vitest run && npm run lint && cd ../server && npm test` + `npm run build`. Playwright headless a 1440×900 y 390×844 con capturas para el PR.
- **Riesgo de regresión:** capas fijas y `mix-blend-mode` de SPEC-49 (no crear un contenedor con `transform`/`isolation` que rompa el `screen` del fuego); prerender SSR (`ssr.tsx`) — el índice inicial debe ser 0 en servidor.

## Publicación (requisito posterior, comentario de Pedro del 2026-11-19)
Una vez que Joe dé la orden "hazla" y la implementación pase el gate, el panel de revisores, Playwright y /code-review:
1. Claude abre el PR `SPEC-61 — …` con capturas y comenta el link en la issue #99.
2. **Pedro revisa y mergea** (Claude no mergea ni despliega: regla del repo). El merge a `main` dispara el deploy automático a GitHub Pages.
3. Se comunica en la issue la URL https://ricorp.cl/wstyle/ y el estado del deploy (Pages en verde).
4. La tarea no se da por cerrada hasta que Joe confirme que lo vio en la web real (AC-13).
