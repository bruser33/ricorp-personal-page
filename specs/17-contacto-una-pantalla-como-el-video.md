# SPEC-17 — Contacto en una sola pantalla, con el glow y el orbe del video

> Pedido del usuario (2026-10-12), puntos 3, 4, 6 y 10:
> 3) "Empecemos un nuevo proyecto" está duplicado; debe salir una sola vez.
> 4) No sale el círculo noisy detrás del título como en el video; revisar las animaciones del video; también hay un círculo morado a la derecha que se movía, que teníamos antes y se perdió.
> 6) El mensaje de políticas va debajo de "contacta con nosotros".
> 10) En contacto hay códigos detrás: error del Figma, no deben estar.
> Referencia: `~/Desktop/Grabación de pantalla 2026-10-12 a la(s) 11.52.58 a.m..mov`, tramo **38–54 s** (prototipo de Figma). Extraer frames con Swift+AVFoundation (no hay ffmpeg; ver memoria "medir tiempos desde un video de referencia").

## Historia
Como visitante, al llegar a contacto quiero ver una sola escena —glow, título, orbe morado en movimiento y formulario— que entra con la coreografía del prototipo.

## Alcance
- **Incluye:** fusionar `#contact` y `#contact-form` en UNA sección `#contact`; título una sola vez; glow "noisy" detrás del título; orbe 3D morado a la derecha animado (deriva + giro); coreografía de entrada del video; `<Footline />` (políticas) al pie de esta sección; garantizar cero "líneas de código" de fondo.
- **Fuera:** lógica de envío del formulario (`POST /api/contact`, adjuntos) — no cambia; textos i18n del título.

## Estado actual (código)
- `client/src/components/Contact.tsx`: `ContactHeadline` (`:29-40`) se monta en `#contact` (`:115-119`) y otra vez en `#contact-form` (`:135`). Orbe `.contact-orb-3d` (`figma-frames/contact-orb.png`, animaciones `orb-float` 18 s + `orb-turn` 22 s, `Contact.css:79-170`) solo en `#contact-form`.
- Glow: `.contact::before` (`Contact.css:28-40`) y halo `.contact-orb` (`:42-54`); el "círculo noisy" del video es el blob global `body::before` + `.blob-grain` (`index.css:149-330`), que en contacto se contrae a 0.18 con desvío lateral (`App.tsx:51-52`).
- Code rain eliminada en `5c97fc5`; verificar que no vuelva.
- Paradas del blob y snap usan `contact` y `contact-form` (`App.tsx:25-107`, `index.css:109-120`).

## Coreografía objetivo (del video, t relativo a llegar a la sección; medir y afinar con frames)
| t | Qué pasa |
|---|---|
| 0 s | Fondo oscuro; aparece el glow morado difuso con grano ("noisy") centrado detrás de donde irá el título. |
| ~+2 s | Entra el título "Let's start a new .project" + subtítulo "What are you looking for?". |
| ~+4 s | Entra el orbe morado a la derecha del título (crece/gira desde pequeño) y queda en loop de deriva + giro. |
| ~+5 s | Entra el input "Write here…"; al escribir aparece el email y "Send email"; al enviar "Sent!" (ya existe). |
| salida | Al salir de la sección, título y orbe se desvanecen y el orbe se va hacia la derecha. |

## Reglas de negocio
1. El título aparece una sola vez en todo el documento.
2. El glow va **detrás del título** (no abajo a la izquierda) y lleva grano/ruido como el blob del hero.
3. El orbe está a la derecha del título, a su altura, y se mueve siempre (respetando `prefers-reduced-motion`: estático).
4. Las políticas (`Footline`) se ven al pie de contacto (el final de la página).

## Casos borde
- Mobile: título, orbe (más chico, encima o al lado), formulario; sin desborde horizontal.
- Reentrar a la sección repite la coreografía de entrada (o al menos no deja elementos invisibles).
- Links/anclas `#contact-form` existentes deben llevar a `#contact`.

## Criterios de aceptación
- **AC-01** `document.querySelectorAll('h2')` contiene el título de contacto **exactamente 1 vez**; no existe `#contact-form` como sección separada.
- **AC-02** Con la sección en vista existe un glow (pseudo o elemento) con grano centrado detrás del título (el centro del glow cae dentro del bounding box del título ± 20 %).
- **AC-03** El orbe `.contact-orb-3d` está visible a la derecha del título y su `transform` cambia en el tiempo (dos muestras separadas 1 s difieren).
- **AC-04** El orden de entrada es glow → título → orbe → input (opacidad > 0.5 en ese orden, medido con Playwright).
- **AC-05** No hay elementos `.code-line`/`.contact-bg` ni texto de código en la sección.
- **AC-06** El texto de políticas aparece al pie de `#contact`.
- **AC-07** El formulario sigue enviando (smoke contra el back local :4000).
- **AC-08** `npm run build` y `npm run lint` verdes; sin overflow horizontal en 390 px.

## Decisiones confirmadas
- ✔ Una sola pantalla como el video (no dos pantallas). (usuario, 2026-10-12)
- ✔ Las líneas de código del Figma NO se replican.

## Asunciones pendientes de validar
- Los tiempos de la tabla son aproximados (frames cada 1 s); el implementer los afina con frames cada 0.25 s.
