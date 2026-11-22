# SPEC-26 — Un solo CTA "Reservar" fijo y botones secundarios visibles

> Hallazgos de revisión (2026-10-25): desde la 2ª sección conviven "Reservar" del nav + "Reservar" flotante + botón WhatsApp flotante; en "Llega" además WhatsApp/Llamar. En móvil hay 3 flotantes (badge, Reservar, WhatsApp) en 60 px. En "Llega" los botones secundarios (contorno oscuro sobre fondo oscuro) casi desaparecen.

## Historia
Como visitante, quiero ver un único botón "Reservar" claro en todo momento (y no tres que compiten), y que los botones secundarios se lean bien, para decidir rápido cómo reservar.

## Estado actual
- `components/Nav.tsx`: `nav-cta` "Reservar" en el header (desktop); en `.compact` se quita y queda en el menú overlay.
- `components/Booking.tsx` (`.dock`, fijo abajo-derecha): píldora `book-fab` "Reservar" (oculta solo mientras el CTA del hero está en vista) + `wa-fab` WhatsApp **siempre**. Ambos en desktop y móvil.
- Secciones con CTA propio: Hero ("Reservar"), Tu trono ("Reservar por WhatsApp" + "Llamar"), Membresía ("Quiero el club"), Barberos (si `enabled`), Llega ("Cómo llegar" + "WhatsApp" + "Llamar").
- `.btn--ghost`: borde `rgba(237,230,218,.45)` y fondo `rgba(14,13,12,.8)` → se pierde sobre el render oscuro.
- Destino de reserva: `bookingLink(site)` en `client/src/wstyle/links.ts` (agenda → WhatsApp → teléfono). SPEC-32 agregará agendamiento online.

## Alcance
- **Incluye:** regla de un único CTA fijo por layout; quitar el WhatsApp flotante; ocultar el flotante en secciones con CTA propio; estilo de `.btn--ghost` con borde cobre (`--brass`) e íconos (WhatsApp, teléfono, mapa); todo CTA "Reservar" usa `bookingLink()`.
- **Fuera:** el destino de la reserva (SPEC-32), textos de los CTA de sección, la marca de agua (SPEC-25), el hero móvil (SPEC-28).

## Reglas de negocio
1. **Desktop (no compact):** el único CTA fijo es "Reservar" del header. No hay píldora ni WhatsApp flotantes.
2. **Móvil (compact):** el único CTA fijo es la píldora "Reservar" flotante abajo-derecha (zona del pulgar). No hay WhatsApp flotante.
3. La píldora móvil se oculta mientras una sección con CTA propio tiene ese CTA en pantalla (hero, Tu trono, Membresía, Barberos, Llega).
4. Todos los "Reservar"/"Quiero el club"/"Reservar por WhatsApp" cuyo destino es reservar toman el href de `bookingLink()` (único punto de cambio del destino). "Reservar por WhatsApp" pasa a decir "Reservar" si `bookingLink()` no es WhatsApp.
5. WhatsApp y Llamar siguen disponibles como botones secundarios dentro de Tu trono y Llega.
6. Botón secundario: borde 1 px `--brass`, texto `--bone`, ícono a la izquierda; hover: fondo `--brass` 12 %.

## Flujo principal
- Desktop: hero (CTA del hero) → al scrollear queda solo "Reservar" del header → en Llega: header + "Cómo llegar" (primario) + "WhatsApp"/"Llamar" (secundarios con borde cobre).
- Móvil: hero (CTA del hero, sin flotante) → tomas del render: aparece la píldora "Reservar" → Membresía/Llega: la píldora se oculta mientras sus CTA están en pantalla.

## Casos borde
- Sin `booking.url` ni WhatsApp ni teléfono: no hay CTA fijo ni contenedor vacío.
- Solo teléfono: "Reservar" abre `tel:` en la misma pestaña (sin `_blank`).
- Membresía desactivada / Barberos `enabled:false`: la regla 3 solo aplica a secciones montadas.
- Menú móvil abierto: la píldora no queda encima del overlay.
- Cambio de tamaño (rotar / redimensionar cruzando el umbral compact): el CTA fijo cambia sin recargar y nunca hay dos visibles.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** No existe `[data-cta="whatsapp-float"]` en el DOM en ningún tamaño.
- **AC-02** 1440×900: en cada sección (scroll a cada `id` de capítulo), el número de enlaces "Reservar" **fijos** visibles (posición `fixed`, opacidad > 0, dentro del viewport) es exactamente 1 (el del header), y no existe `.book-fab` visible.
- **AC-03** 390×844: en las tomas sin CTA propio (El local, El oficio, El espejo, La carta, Antes de venir) hay exactamente 1 CTA fijo visible (`.book-fab`), y su rect queda en el tercio inferior de la pantalla.
- **AC-04** 390×844: con el CTA del hero, de Tu trono, Membresía o Llega dentro del viewport, `.book-fab` tiene opacidad 0, `aria-hidden="true"` y `tabindex="-1"`.
- **AC-05** 390×844: en ningún scroll los rects de `.book-fab` y `.ricorp-badge` visibles se intersectan (y no hay más de 2 elementos flotantes abajo).
- **AC-06** Todos los `a` con texto "Reservar", "Quiero el club" o "Reservar por WhatsApp" tienen el mismo `href` que `bookingLink(site)`; cambiar `booking.url` en `site.json` a una URL de prueba cambia todos a la vez (verificado en el DOM).
- **AC-07** En Llega y Tu trono, `.btn--ghost` tiene `border-color` = `--brass` (rgb(184,135,90)) y un `svg` de ícono `aria-hidden`; contraste texto/fondo del botón ≥ 4.5:1 y borde/fondo de la sección ≥ 3:1.
- **AC-08** Redimensionar de 1440 a 390 y vuelta sin recargar: AC-02 y AC-03 se siguen cumpliendo.
- **AC-09** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- ✔ Un solo CTA fijo: el del header en desktop, flotante en móvil.
- ✔ El destino de "Reservar" tiene un único punto de cambio (`bookingLink()` en `links.ts`), preparado para SPEC-32.

## Asunciones pendientes de validar
1. Se elimina el botón flotante de WhatsApp en todos los tamaños (WhatsApp queda en Tu trono y Llega).
2. En desktop el "Reservar" del header es visible siempre (no se oculta sobre secciones con CTA propio).
3. En móvil la píldora no aparece en el hero (el hero tiene su propio "Reservar").
4. "Quiero el club" de Membresía lleva al mismo destino que "Reservar".
5. Íconos de los secundarios: WhatsApp (logo), teléfono y pin de mapa, en línea, del color del texto.
