# SPEC-60 — WS Style: gift cards

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18. Las decisiones se tomaron con el usuario. Idea de referencia: "Gift cards" de SillaLibre (catálogo §12). Se toma la idea, no la marca ni el diseño.

## Estado actual
- Pago en línea de **citas** con Mercado Pago Checkout Pro (SPEC-35/37, `server/src/domain/payments.js`):
  - la preferencia lleva `external_reference = <appointmentId>` y `unit_price = pricing.totalCLP`;
  - `applyPayment` busca la **cita** por `external_reference` y valida que el monto sea igual a `pricing.totalCLP`;
  - idempotencia con `PaymentEvent` (índice único pago+estado), webhook + conciliación + sincronización al ver la página;
  - reembolsos desde el panel.
- Desglose de cobro (SPEC-38, `domain/pricing.js` `quote()`): servicio + domicilio + **tarifa de servicio** (administración + costo de pagos) = total. Es la misma tarifa en el local o en línea.
- Pago en el local: `payment.method = 'local'`, cobrado al terminar (`localMethod`: efectivo, transferencia o tarjeta).
- No existe ningún concepto de cupón, descuento ni saldo a favor.
- La venta queda en la rendición (`RendicionPage`, `domain/billing.js`) y el respaldo tributario por venta va en `payment.taxDoc` (SPEC-37).

## Historia
Como **cliente**, quiero **comprar en línea una gift card de WS Style para regalar** (un monto o un servicio) y **mandarla con un mensaje**, para **tener un regalo listo en minutos**.
Como **quien la recibe**, quiero **usar el código al reservar** para **pagar mi cita con el regalo**.
Como **dueño**, quiero **emitir gift cards vendidas en el local y controlar su saldo, estado y anulación**, para **vender regalos sin perder el control**.

## Alcance
**Incluye**
1. **Modelo de gift card**:
   - **código único** (`WS-XXXX-XXXX`, RN-02) y QR del código;
   - **tipo**: `monto` (CLP) o `servicio` (servicio de la carta, con su precio congelado);
   - monto original y **saldo**;
   - de (quien regala), para (quien recibe) y mensaje (máximo 140 caracteres);
   - **vencimiento**;
   - **estado**: `pendiente_pago`, `activa`, `usada`, `vencida` o `anulada`;
   - origen: `online` o `local` (con forma de cobro);
   - movimientos (emisión, canje por cita, reversión y anulación) con el usuario y la fecha.
2. **Compra en línea** (`/wstyle/regalar/`, con enlace desde la landing y desde la reserva):
   - formulario "Regala WS Style": [Un monto] (montos rápidos $10.000, $20.000, $30.000, $50.000 u otro entre $5.000 y $200.000) o [Un servicio] (selector de la carta), De, Para, Mensaje y el email de quien compra;
   - requiere sesión (como la reserva, SPEC-38);
   - pago con Mercado Pago reutilizando `payments.js`. La preferencia lleva `external_reference = gc:<id>` y el webhook, la conciliación y la vista enrutan por prefijo;
   - al aprobarse, la gift card pasa a `activa` y se envía por correo a quien compra, con la tarjeta y el enlace para descargarla.
3. **Emisión manual** (Panel → sección nueva "Gift cards" → [Emitir]): mismo formulario más la forma de cobro (efectivo, transferencia o tarjeta). Nace `activa` y queda en la rendición como venta en el local.
4. **La tarjeta** (diseño "Noir de oficio"):
   - wordmark WS STYLE, "Un regalo para **Valentina**", monto o servicio, mensaje, "De Camila";
   - código grande, QR y "Válida hasta 18 nov 2027";
   - "Reserva con este código en ricorp.cl/wstyle/reservar".

   Página pública por enlace secreto (`/wstyle/regalo/?t=<token>`) con [Descargar PNG] (1080×1350) y [Compartir] (hoja de compartir del sistema o WhatsApp `wa.me` con el texto y el enlace). Se genera en el cliente.
5. **Canje al reservar** (paso "Confirmar" de `BookingPage`): campo "¿Tienes una gift card?" con el código y [Aplicar].
   - Muestra "Gift card WS-7KQ4-M9TP aplicada · Regalo de Camila · −$20.000 [Quitar]".
   - El desglose (`PriceBreakdown`) suma la línea "Gift card −$X" y "Total a pagar $Y".
   - Si el total a pagar es $0, no se pide un medio de pago.
   - Si queda un resto, se paga en línea o en el local como hoy.
6. **Aplicación del saldo** (RN-05): se **reserva** el monto al crear la cita. Se **confirma** cuando la cita se paga (en línea) o termina (en el local), y se **devuelve** a la gift card si la cita se cancela, expira o se reembolsa.
7. **Panel → Gift cards**:
   - contadores (Por pagar, Activas, Usadas, Vencidas y Anuladas);
   - listado con búsqueda por código o nombre y filtros por estado. Cada fila muestra: código, de→para, tipo, monto, saldo, vence, estado y origen;
   - detalle con los movimientos y las citas donde se usó;
   - acciones [Ver o descargar tarjeta], [Reenviar correo], [Extender vencimiento] y [Anular] (motivo obligatorio).
8. **Ajustes**: interruptor "Vender gift cards en línea" (apagado por defecto) y vigencia por defecto (12 meses).
9. **Landing**: un enlace discreto "Regala WS Style" (en "Antes de venir" o en el pie) solo si la venta en línea está activa.
10. **Rendición y respaldo**: la venta de la gift card es el ingreso (respaldo tributario según SPEC-37 al vender). El canje en una cita no es una venta nueva: la cita registra la parte pagada con gift card para que la rendición no la cuente dos veces.

**Fuera**
- Gift cards por servicio con barbero específico, gift cards recargables o corporativas en lote.
- Envío programado en una fecha (SillaLibre "Elegir fecha") ni envío automático por WhatsApp (si se implementa SPEC-53, puede sumar el envío).
- Pago de gift cards por transferencia con comprobante (puede llegar con SPEC-56).
- Diseños estacionales (Navidad).
- Canjear gift cards por productos de puntos (SPEC-57) o devolver el saldo en dinero.

## Reglas de negocio
- **RN-01 Precio de venta.** Quien compra en línea paga el **valor de la tarjeta + la tarifa de servicio** (misma `quote()` de SPEC-38 con `priceCLP = valor`, sin domicilio). La tarjeta carga el valor completo. En el local, el admin registra lo cobrado.
- **RN-02 Código.** 8 caracteres de un alfabeto sin ambiguos, con el formato `WS-XXXX-XXXX`. Se genera con aleatorio criptográfico y es único (índice único). La búsqueda no distingue mayúsculas ni guiones. El enlace de la tarjeta usa un **token distinto** del código: ver la tarjeta no requiere el código, y tener el código no da acceso a la página.
- **RN-03 Vigencia.** Por defecto 12 meses desde la activación. Al vencer, el saldo queda inutilizable (estado `vencida`). El admin puede extender una tarjeta (auditado). Una reserva para una fecha posterior al vencimiento se acepta si el canje se hace antes de vencer (asunción 4).
- **RN-04 Qué cubre.**
  - **Monto**: se descuenta del **total** de la cita (servicio + domicilio + tarifa de servicio).
  - **Servicio**: cubre ese servicio. Si se usa en ese servicio, cubre el total de la cita **sin domicilio**: servicio + su tarifa (asunción 2). Si se usa en otro servicio, actúa como monto por el precio congelado.

  La tarifa de servicio de la cita **no se recalcula** por usar la gift card.
- **RN-05 Saldo y concurrencia.**
  - Aplicar = descuento atómico condicional (`saldo ≥ aplicado` y estado `activa`) en una transacción con la creación de la cita.
  - Dos reservas simultáneas con la misma tarjeta sin saldo para ambas → una OK y la otra 409 "Esta gift card ya no tiene saldo suficiente".
  - Si sobra saldo, queda para la próxima. Saldo 0 → `usada`.
  - Una tarjeta por cita.
- **RN-06 Devolución.** Si la cita se cancela o expira antes de atenderse, o su pago en línea se reembolsa, el monto aplicado vuelve a la tarjeta (movimiento `reversion`). Si la tarjeta ya venció, vuelve igual, pero queda `vencida` (asunción 5). Es idempotente por cita.
- **RN-07 Pago restante en línea.** El total de la preferencia de Mercado Pago es `pricing.totalCLP − giftCardCLP`, y `applyPayment` valida contra ese monto (no contra `totalCLP`). Si el resto es $0, la cita no pasa por `pendiente_pago`: sigue el camino de pago en el local, pero ya "cobrada" por gift card.
- **RN-08 Compra en línea.**
  - La gift card nace `pendiente_pago` y solo pasa a `activa` cuando el API de Mercado Pago confirma `approved` con el monto exacto (misma regla que SPEC-35 RN-07). Webhook repetido → sin duplicar.
  - Una `pendiente_pago` de más de 24 h → se descarta (no es canjeable y no aparece en "Activas").
  - Un reembolso de la compra → la tarjeta pasa a `anulada` si no se usó. Si ya se usó, se alerta al admin y la tarjeta queda bloqueada.
- **RN-09 Anulación.** Solo el super admin, con motivo. Una tarjeta anulada no se canjea. Los canjes ya confirmados no se deshacen. Las reservas pendientes que la usan mantienen su aplicación (asunción 6). Queda auditado.
- **RN-10 Validaciones.**
  - Monto entero de $5.000 a $200.000.
  - De y Para: 1–40 caracteres.
  - Mensaje: 0–140 caracteres en texto plano, sanitizado igual que las reseñas (SPEC-52 RN-05).
  - Servicio activo de la carta.
  - El body del cliente no puede fijar saldo, estado, código ni vencimiento.
- **RN-11 Puntos.** Pagar una cita con gift card no reduce los puntos de SPEC-57 (se calculan sobre el precio del servicio). Comprar una gift card no da puntos.
- **RN-12 Abuso.** Probar códigos al azar: el endpoint de validar código tiene limitador de tasa (por usuario e IP) y responde lo mismo ("Código no válido") ante un código inexistente, vencido o anulado (asunción 7).

### Autorización (se suma a la matriz de SPEC-34)
| Acción | Anónimo | client | barber | superadmin |
|---|---|---|---|---|
| Ver la tarjeta por su enlace secreto | ✓ (con token) | ✓ | ✓ | ✓ |
| Comprar en línea | 401 | ✓ | ✓ (como cliente) | ✓ (como cliente) |
| Validar y aplicar un código al reservar | 401 | ✓ | ✓ (como cliente) | ✓ (como cliente) |
| Emitir manual, listar, anular, extender, reenviar | 401 | 403 | 403 (asunción 8) | ✓ |

## Flujo principal
1. Joe activa "Vender gift cards en línea".
2. Camila entra a `/wstyle/regalar/`, elige $20.000, De "Camila", Para "Valentina", mensaje "¡Feliz cumple!". Paga $20.000 + tarifa en Mercado Pago.
3. El webhook confirma el pago → la tarjeta `WS-7KQ4-M9TP` queda `activa`. Camila recibe un correo con la tarjeta, la descarga en PNG y se la manda a Valentina por WhatsApp.
4. Valentina reserva "Corte + barba" (total $17.000 con tarifa). En "Confirmar" ingresa el código → "−$17.000 · Total a pagar $0". Confirma sin medio de pago. La tarjeta queda con saldo $3.000.
5. Si Valentina cancela a tiempo, los $17.000 vuelven a la tarjeta (saldo $20.000).
6. Joe vende una tarjeta de "Decoloración global" en el local → [Emitir] con cobro "efectivo" → la descarga y se la entrega al cliente.

## Casos borde
- **CB-01** Doble clic en [Aplicar] o en [Confirmar reserva] → una sola aplicación.
- **CB-02** Dos personas usan la misma tarjeta a la vez y el saldo alcanza para una → una OK y la otra 409.
- **CB-03** Código con minúsculas o sin guiones (`ws7kq4m9tp`) → se reconoce.
- **CB-04** Tarjeta vencida, anulada o `pendiente_pago` → "Código no válido" (sin detalle, RN-12). En el panel, el admin ve el motivo real.
- **CB-05** El total de la cita es menor que el saldo → total a pagar $0 y el saldo restante queda en la tarjeta.
- **CB-06** El total es mayor que el saldo → paga el resto en línea (la preferencia es por el resto) o en el local.
- **CB-07** El webhook de la compra llega dos veces, o primero `pending` y después `approved` → una sola activación.
- **CB-08** Pago de la compra con monto distinto → no se activa y se alerta al admin (como `payment_mismatch`).
- **CB-09** Gift card de servicio cuyo servicio se archivó después → se puede usar en otro servicio como monto por el precio congelado.
- **CB-10** Mensaje con HTML → se guarda como texto plano. La tarjeta nunca lo renderiza como HTML.
- **CB-11** Móvil 390 px: formulario, tarjeta y panel sin scroll horizontal. El PNG mide 1080×1350 exactos.

## Diseño ("Noir de oficio")
- Tarjeta en negro con textura, filete `--brass`, "UN REGALO PARA" en Inter versalitas, el nombre en Cormorant Italic grande, el monto o servicio en Anton, y el código en monoespaciada sobre una banda hueso con el QR oscuro sobre claro.
- La página `/wstyle/regalar/` usa el mismo shell de la agenda (`Shell.tsx`) y su tipografía.

## Criterios de aceptación
Tests de server con `node --test` contra la BD de test real (`pagina_personal_test`), con el MP fake (`server/test/mp-fake.js`) y el mailer en dry-run. Tests de client con vitest. Navegador en `http://127.0.0.1:5173/wstyle/` a 1440×900 y 390×844.

- **AC-01 Compra en línea.**
  - Crear una compra de $20.000 → gift card `pendiente_pago` y una preferencia con `external_reference = gc:<id>` y el monto de `quote()`.
  - Webhook `approved` con el monto exacto → `activa`, saldo $20.000 y correo registrado.
  - Webhook repetido → sin cambios.
  - Monto distinto → no se activa y hay alerta.
  - El enrutamiento por prefijo no rompe los pagos de citas (los tests de SPEC-35 pasan).

  Test de server.
- **AC-02 Emisión manual.** El super admin emite una tarjeta de $30.000 con cobro "efectivo" → `activa` y queda en la rendición. Client y barber → 403. Test de server.
- **AC-03 Canje y saldo.**
  - Cita de total $17.000 con una tarjeta de $20.000 → cita con gift card $17.000, total a pagar $0 y saldo $3.000.
  - Cita de $25.000 con saldo $3.000 → resto $22.000. La preferencia de Mercado Pago (si es en línea) es por $22.000 y `applyPayment` acepta ese monto.

  Test de server.
- **AC-04 Concurrencia.** Dos creaciones de cita simultáneas con la misma tarjeta (saldo para una) → exactamente una OK y la otra 409. El saldo nunca queda negativo. Test de server.
- **AC-05 Devolución.**
  - Cancelar o expirar una cita con gift card devuelve el monto una sola vez (cancelar dos veces no duplica).
  - Reembolsar el pago restante en línea también devuelve la parte de la gift card.

  Test de server.
- **AC-06 Validación de códigos.**
  - Inexistente, vencido, anulado o `pendiente_pago` → la misma respuesta "Código no válido".
  - El limitador de tasa responde 429 después de N intentos.
  - Minúsculas y sin guiones → se reconoce.

  Test de server.
- **AC-07 Anulación y vencimiento.** Anular sin motivo → 400; con motivo → `anulada` y auditado. Con reloj simulado al día 366 → `vencida` y no canjeable. Extender → vuelve a `activa`. Test de server.
- **AC-08 Desglose en el client.** `PriceBreakdown` con la gift card muestra la línea "Gift card −$X" y "Total a pagar". Los vectores de `pricing.ts` siguen iguales a los del server. Vitest.
- **AC-09 Flujo en el navegador.**
  - Comprar una tarjeta con el MP fake o sandbox local → ver la tarjeta en `/wstyle/regalo/?t=…`, descargar el PNG (1080×1350) y reservar con el código hasta el total $0.
  - El panel → Gift cards muestra la tarjeta con su saldo actualizado.

  Capturas a 1440 y 390 px, sin errores de consola.
- **AC-10 Venta apagada.** Con "Vender gift cards en línea" apagado: `/wstyle/regalar/` muestra "Por ahora las gift cards se venden en el local" y el enlace de la landing no está en el DOM. El canje de tarjetas activas sigue funcionando.
- **AC-11 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. Los tests existentes de pagos (SPEC-35/37/38) pasan.

## Decisiones confirmadas (por el usuario)
- Joe crea o vende tarjetas de regalo: monto en CLP o un servicio específico, código único + QR, nombre de quien regala y de quien recibe, mensaje y vencimiento.
- Venta en línea con Mercado Pago (reutiliza el flujo existente) y emisión manual desde el panel (vendida en el local).
- Diseño de la tarjeta con la identidad de WS Style, descargable y compartible.
- Canje al reservar ingresando el código: descuenta del total; si sobra saldo, queda para la próxima; no se canjea dos veces (concurrencia).
- Panel con listado, saldo, estado y anulación.

## Asunciones (detalles menores, pendientes de validar)
1. Quien compra en línea paga la tarifa de servicio de SPEC-38 sobre el valor de la tarjeta. La tarjeta carga el valor completo.
2. Una gift card de servicio usada en ese servicio cubre servicio + tarifa, pero no el domicilio.
3. Vigencia por defecto: 12 meses, editable en Ajustes y extensible por tarjeta.
4. Lo que cuenta es la fecha del canje (al reservar), no la de la cita.
5. Si la cita se cancela después de que la tarjeta venció, el saldo vuelve, pero la tarjeta sigue vencida (el admin puede extenderla).
6. Anular una tarjeta no cancela las reservas que ya la aplicaron.
7. Ante un código inválido, el cliente ve un mensaje genérico; el motivo exacto solo lo ve el admin.
8. Los barberos no emiten ni anulan gift cards; solo ven en la ficha de la cita que se pagó con gift card.
9. Una sola gift card por cita.
10. La venta en línea viene apagada hasta que Joe la active. Los montos rápidos son $10.000, $20.000, $30.000 y $50.000.
11. La tarjeta se envía al correo de quien compra (no directo a quien recibe). Quien compra la reenvía por WhatsApp o la descarga.
