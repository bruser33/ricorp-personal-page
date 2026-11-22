# SPEC-29 — Dirección de arte: cifra "1 SILLA.", contraste en El local, carnet Club, footer y versalitas

> Hallazgos de revisión (2026-10-25, capturas `.playwright-mcp/page-2026-10-25T14-23-*.jpeg`). Las tomas del render de "La carta" y del final van en SPEC-30, no aquí.

## Historia
Como visitante, quiero que cada sección se vea terminada y legible (cifras bien compuestas, texto que se lee sobre el render, una membresía que parezca un carnet de verdad), para confiar en la barbería.

## Estado actual
- **(a)** `.stat` en "El local": `stat__value` "1" en Cormorant itálica (80–140 px, `line-height .8`) y `stat__label` "SILLA." en Anton (28–44 px), `align-items: baseline` → no comparten línea base visual ni peso.
- **(b)** Copy de "El local" sobre el render (espejo/pared clara): contraste insuficiente; no hay velo detrás de la columna de texto.
- **(c)** Membresía (`Extras.tsx` `Membership`, `.member` en `Extras.css`): grid precio izq. / perks der. sobre el render borroso; se ve plano y el fondo parece un error.
- **(d)** Footer de "Llega" (`.footer`, `margin-right: 200px`, `.panel--last > .panel__inner { margin: auto 0 }`): queda flotando a media pantalla en desktop.
- **(e)** Tracking de versalitas disperso: `.eyebrow .3em`, `.hint .24em`, `.btn .24em`, `.book-fab .26em`, `.demo-strip .3em/.18em`, `.loader__pct .3em`, `.member h3 .32em`, `h3 .16em`, nav links (valor propio).

## Alcance
- **Incluye:** (a) cifra destacada compuesta; (b) degradado lateral oscuro tras la columna de texto en las tomas con copy sobre el render; (c) tarjeta tipo carnet "Club" con borde cobre; (d) footer pegado al final de la última sección; (e) token CSS único para el tracking de versalitas.
- **Fuera:** tomas/encuadres del render (SPEC-30), textos, el CTA de Membresía (destino en SPEC-26/32), la marca de agua (SPEC-25), el nombre del club (SPEC-24).

## Reglas de negocio
1. **(a)** La cifra y su palabra se leen como una unidad: "1" grande en la misma familia y alineada a la línea base/altura de mayúsculas de "SILLA."; la nota "Toda la atención." debajo.
2. **(b)** Todo texto de `main` sobre el render alcanza contraste ≥ 4.5:1 (cuerpo) y ≥ 3:1 (titulares grandes) en ambos tamaños.
3. **(c)** La membresía es una tarjeta: superficie sólida `--graphite`, borde 1 px `--brass`, radio, nombre del club como encabezado de carnet, precio grande, perks en lista dentro de la misma tarjeta, nota y CTA al pie. Sin fondo borroso visible detrás.
4. **(d)** El footer queda al final de la sección "Llega", ancho de la columna de contenido, debajo del bloque de información, nunca centrado verticalmente en el aire.
5. **(e)** Existe un token `--tracking-caps` (y como máximo una variante `--tracking-caps-tight` para tamaños ≤ 10 px) usado por nav, etiquetas `.eyebrow`, hint, botones, píldora, franja demo, loader y `h3`.

## Flujo principal
Recorrido completo a 1440×900 y 390×844: El local (cifra compuesta, copy legible) → Membresía (carnet) → Llega (footer al pie).

## Casos borde
- `stat` sin `note` o sin `label`: la cifra se ve sola sin hueco.
- `membership` sin `perks` o sin `priceCLP`: la tarjeta se adapta sin cajas vacías.
- Móvil: el carnet ocupa el ancho de la columna (sin desborde horizontal); perks debajo del precio.
- Degradado (b) en móvil: de abajo hacia arriba o a pantalla completa, sin oscurecer el centro de la toma más de lo necesario.
- Pantallas altas (1440×1200): el footer sigue al final de "Llega", no flotando.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01 (a)** En "El local", `.stat__value` y `.stat__label` usan la misma `font-family` y el `bottom` de sus cajas de texto (línea base) difiere ≤ 2 px; captura en ambos tamaños.
- **AC-02 (b)** Muestreo de la captura: contraste del copy y la etiqueta de "El local" (y de El oficio / El espejo / Tu trono) contra el fondo efectivo ≥ 4.5:1 en ambos tamaños; existe el degradado detrás de la columna de texto (pseudo-elemento o capa) y no cubre más del 60 % del ancho en desktop.
- **AC-03 (c)** `.member` tiene `background-color` opaco (alfa = 1), `border` 1 px de color `--brass` y `border-radius` > 0; nombre, precio, perks, nota y CTA están dentro de su rect; `backdrop-filter` = `none`.
- **AC-04 (c)** 390×844: `.member` cabe en el ancho (`scrollWidth === 390`) y los perks quedan debajo del precio.
- **AC-05 (d)** 1440×900 y 1440×1200 con scroll al final: `bottom` del `.footer` está a ≤ 96 px del final de `#llega` y por debajo del `bottom` de `.info`.
- **AC-06 (e)** `getComputedStyle(document.documentElement).getPropertyValue('--tracking-caps')` no es vacío; `grep -nE "letter-spacing:\s*\.[0-9]+em" client/src/wstyle` no encuentra valores ≥ .14em fuera de la definición de los tokens.
- **AC-07** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- (ninguna adicional; modo autónomo)

## Asunciones pendientes de validar
1. (a) La cifra "1" pasa a Anton (misma familia que "SILLA."), en vez de pasar "SILLA." a serif.
2. (b) El degradado va a la izquierda (tras la columna de texto) en desktop y de abajo hacia arriba en móvil.
3. (c) El carnet dice "Club" como encabezado + nombre del club; sin número de socio ni QR falsos.
4. (d) En móvil el footer también va al final de la sección (ya ocupa el ancho).
5. (e) Valor del token: `.24em` (y `.18em` para ≤ 10 px).
