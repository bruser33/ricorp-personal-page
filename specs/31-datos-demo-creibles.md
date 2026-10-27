# SPEC-31 — Datos de demo verosímiles (dirección y teléfono)

> Hallazgo de revisión (2026-10-25): "Calle Falsa 123" y "+56 9 0000 0000" delatan la demo y restan credibilidad a la presentación.

## Historia
Como Ricorp mostrando el sitio a un cliente potencial, quiero que la dirección y el teléfono de ejemplo parezcan de un negocio real de Santiago, para que la demo se vea como un sitio terminado, sin dejar de ser claramente una demo.

## Estado actual
- `client/public/wstyle/content/site.json`: `contact.phone` y `contact.whatsapp` = "+56 9 0000 0000"; `address.street` = "Calle Falsa 123"; `mapsUrl` = búsqueda de "Calle Falsa 123 Santiago". `demo: true` muestra la franja "Versión de demostración · precios y datos de ejemplo".
- El teléfono genera `wa.me/56900000000` y `tel:+56900000000` (`ctaLinks` en `links.ts`), y el JSON-LD publica `telephone` y `address`.

## Alcance
- **Incluye:** nueva dirección ficticia verosímil (calle real de Santiago con numeración plausible), teléfono móvil chileno ficticio con formato válido, `mapsUrl` coherente con la dirección, y que en modo demo los botones WhatsApp/Llamar/Reservar no contacten a un tercero real.
- **Fuera:** datos reales del negocio (SPEC-01), horario, precios, franja demo (se mantiene), `_placeholders`.

## Reglas de negocio
1. `demo: true` y la franja se mantienen.
2. La dirección usa una calle real de Santiago con un número que no corresponda a una barbería conocida (verificado en Google Maps antes de fijarla).
3. El teléfono mostrado tiene formato chileno móvil válido (`+56 9 XXXX XXXX`), sin patrones obviamente falsos (0000, 1234, 5555).
4. **Mientras `demo: true`, ningún CTA marca ni escribe al número ficticio** (podría ser de una persona real): WhatsApp, Llamar y Reservar llevan a un destino seguro (ver asunción 3). Con `demo: false` funcionan normal con el número real.
5. El JSON-LD sigue publicando los datos del JSON (son los que se muestran).

## Flujo principal
1. Visitante llega a "Llega": ve "Dirección: <calle verosímil>, Providencia/Santiago" y "Teléfono: +56 9 …"; "Cómo llegar" abre Maps en esa dirección.
2. Toca "WhatsApp"/"Llamar"/"Reservar" en demo → va al destino seguro, no al número ficticio.

## Casos borde
- `clPhone` debe reconocer el nuevo número (11 dígitos, empieza con 569) o el botón desaparece.
- `demo` como string "true"/"TRUE" (ya soportado en `App.tsx`): mismo comportamiento demo.
- `booking.url` configurado (SPEC-32) en demo: Reservar puede ir a la agenda demo, no al número.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** El DOM y `dist/wstyle/index.html` no contienen "Calle Falsa" ni "0000 0000"; `grep -rn "Calle Falsa\|0000 0000" client/public client/src` → 0.
- **AC-02** En "Llega" se muestran la nueva dirección y el nuevo teléfono; el teléfono cumple `/^\+56 9 \d{4} \d{4}$/` y no contiene `0000`, `1234` ni `5555`.
- **AC-03** `[data-cta="maps"]` apunta a `https://www.google.com/maps/search/?api=1&query=` con la nueva dirección codificada.
- **AC-04** Con `demo: true`: ningún `a[href]` del documento contiene los dígitos del teléfono ficticio (`wa.me/569…` o `tel:+569…`).
- **AC-05** Con `demo: false` (cambiado localmente para la prueba): WhatsApp y Llamar apuntan a `wa.me/<número>` y `tel:+<número>`, y la franja no está.
- **AC-06** La franja "Versión de demostración" sigue visible con `demo: true` en ambos tamaños.
- **AC-07** JSON-LD: `telephone` y `address.streetAddress` coinciden con lo mostrado.
- **AC-08** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- ✔ Se mantienen `demo: true` y la franja; los datos son ficticios pero verosímiles, sin usar un negocio o teléfono real existente.

## Asunciones pendientes de validar
1. Dirección propuesta: "Av. Providencia 2124, local 7, Providencia" (comuna Providencia, Región Metropolitana) — el implementador confirma en Maps que no hay una barbería ahí; si la hay, cambia el número.
2. Teléfono propuesto: "+56 9 6482 3175" (solo se muestra; no se contacta en demo).
3. En demo, WhatsApp/Llamar/Reservar abren el contacto de Ricorp (`https://ricorp.cl/contacto`) en nueva pestaña, en vez del número ficticio.
4. La ciudad mostrada pasa a "Providencia, Región Metropolitana" (y el hero dice "Barbería · Providencia"); si se prefiere "Santiago", se deja `city: "Santiago"`.
