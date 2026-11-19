# SPEC-57 — WS Style: puntos por cita y canje de productos

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "cuando la persona agende el corte por la web, le dé 10 puntos, 20 puntos, y que después el cliente pueda canjear productos cuando tenga un considerable de puntos". Las decisiones se tomaron con el usuario. Idea de referencia: la "tarjeta de fidelidad" de SillaLibre (catálogo §11). Se toma la idea, no la marca ni el diseño.

## Estado actual
- Las citas (`Appointment`, `server/src/models/index.js`) terminan en `terminada` cuando el barbero o el admin marcan "Terminar" (acción `finish`, `server/src/domain/agenda.js`). **Hoy no existe ninguna transición que saque una cita de `terminada`.**
- `Appointment.source` vale `web | pro_invite | admin`. Desde SPEC-38 la reserva web exige sesión, así que toda cita `web` tiene `customerUserId`.
- `pricing` está congelado en la cita (SPEC-38):
  - `priceCLP` = servicio;
  - `surchargeCLP` = domicilio;
  - `serviceFeeCLP` = tarifa de servicio (administración + costo de pagos);
  - `totalCLP` = suma de las líneas.
  - No existen descuentos ni cupones.
- Pago en línea (SPEC-35/37): `payment.status` puede pasar a `reembolsado` o `contracargo` después de `pagado`, incluso con la cita ya `terminada`.
- Cliente: cuenta (`User`, rol `client`, `CustomerProfile` por negocio) y páginas `/wstyle/cuenta/` y `/wstyle/cuenta/mis-citas/` (`agenda/pages/AccountPages.tsx`).
- Panel del super admin: `/wstyle/admin/` (secciones en `admin/util.ts`), con `AuditLog`. Panel del barbero: `/wstyle/pro/`.
- Las fotos se guardan como WebP en GridFS (`server/src/lib/photos.js`) y se sirven en `GET /api/wstyle/photos/:id`.

## Historia
Como **cliente de WS Style** quiero **juntar puntos cada vez que me atiendo por una reserva web y canjearlos por productos de la barbería**, para **sentir que volver tiene premio**.
Como **dueño (super admin)** quiero **definir cuántos puntos da cada peso y qué productos se pueden canjear**, para **fidelizar sin regalar de más y con todo auditado**.
Como **barbero**, quiero **marcar como entregado un canje cuando el cliente lo retira** para **que no se entregue dos veces**.

## Alcance
**Incluye**
1. **Configuración** (Panel → Configuración → "Puntos"):
   - interruptor "Programa de puntos activo" (apagado por defecto hasta que Joe lo prenda, asunción 1);
   - tasa "puntos por cada $1.000 del servicio" (entero de 0 a 100, por defecto 1).
2. **Libro de puntos (ledger)** por cliente y negocio. Cada movimiento guarda:
   - tipo: `ganado`, `canjeado`, `devuelto`, `revertido` o `ajuste`;
   - puntos (con signo);
   - referencia (cita o canje);
   - motivo, quién lo hizo y fecha.

   El saldo es la suma de los movimientos. Los movimientos no se editan ni se borran.
3. **Acreditación al terminar**: al pasar una cita a `terminada`, si cumple RN-01, se crea un movimiento `ganado` en la misma operación.
4. **Reversión**: si después el pago en línea de esa cita pasa a `reembolsado` o `contracargo`, se crea un movimiento `revertido` por los mismos puntos. El admin también puede revertir a mano los puntos de una cita (RN-06).
5. **Productos canjeables** (Panel → sección nueva "Puntos"): crear, editar, activar/desactivar y reordenar productos. Cada producto tiene:
   - nombre, foto (GridFS, misma tubería de `photos.js`) y descripción;
   - costo en puntos;
   - stock opcional (vacío = sin límite);
   - activo/inactivo.
6. **Canje por el cliente** (`/wstyle/cuenta/puntos/`):
   - saldo, historial de movimientos y catálogo de productos activos;
   - [Canjear] con confirmación ("Vas a usar 120 puntos en Cera mate. ¿Confirmas?");
   - al confirmar descuenta los puntos (movimiento `canjeado`), baja el stock y entrega un **código de retiro** (`WS-XXXX`, ver RN-08) que queda en "Mis canjes" con su estado.
7. **Entrega o anulación en el local**:
   - en el panel del super admin y en el del barbero, una lista "Canjes por entregar" con búsqueda por código;
   - [Marcar entregado] → estado `entregado`;
   - [Anular] (motivo obligatorio) → estado `anulado`, movimiento `devuelto` por los puntos y reposición del stock.
8. **Ajuste manual** del super admin sobre el saldo de un cliente (suma o resta), con motivo obligatorio.
9. **Correos** al cliente:
   - "Ganaste N puntos" (dentro del correo "Gracias por venir" que ya existe, como una línea más);
   - "Tu canje está listo para retirar" con el código;
   - aviso de anulación.
10. **Landing** (`/wstyle/`): bloque breve "Junta puntos con cada corte" que explica el programa en 2–3 líneas y enlaza a `/wstyle/cuenta/puntos/`. Sin cifras de puntos ni productos inventados. Solo se muestra si el programa está activo.
11. **Auditoría**: cambios de configuración, CRUD de productos, entregas, anulaciones y ajustes quedan en `AuditLog`.

**Fuera**
- Canjear puntos como descuento de una cita, o por servicios (solo productos).
- Puntos por citas `pro_invite` o `admin`, por compras de gift cards (SPEC-60) o por reseñas (SPEC-52).
- Vencimiento de puntos (asunción 4), niveles (oro, plata), referidos.
- Venta de productos por dinero o tienda en línea.
- Notificaciones por WhatsApp (si se implementa SPEC-53, puede sumar el aviso de canje listo).

## Reglas de negocio
- **RN-01 Qué cita da puntos.** Una cita da puntos solo si se cumplen todas estas condiciones:
  - `source = 'web'`;
  - tiene `customerUserId` con cuenta activa;
  - pasa a `terminada`;
  - el programa está activo en ese momento.

  Citas `cancelada`, `expirada` o `no_asistio` no dan puntos. Agendar no da puntos.
- **RN-02 Cálculo.** `puntos = floor(pricing.priceCLP × tasa / 1000)`.
  - La base es solo el precio del **servicio** congelado en la cita. **No** cuentan el domicilio (`surchargeCLP`) ni la tarifa de servicio (`serviceFeeCLP`, SPEC-38).
  - Siempre redondea hacia abajo. Con tasa 1: corte $10.000 → 10 pts; decoloración $50.000 → 50 pts; $12.500 → 12 pts.
  - Si se usa una gift card (SPEC-60), los puntos se calculan igual sobre el precio del servicio, porque la gift card es un medio de pago y no un descuento (asunción 3). Hoy no existen descuentos; si en el futuro se agregan, la base será el precio del servicio menos el descuento.
  - Se usa la tasa vigente al momento de terminar. Si el resultado es 0, no se crea el movimiento.
- **RN-03 Una sola vez por cita.** Como máximo un `ganado` y un `revertido` por cita, garantizado por un índice único (cita + tipo). Terminar dos veces o un reintento no duplican.
- **RN-04 Saldo.** El saldo es la suma del ledger y nunca puede quedar negativo por un canje. Un `revertido` o un ajuste negativo sí puede dejarlo negativo (por ejemplo, si ya canjeó esos puntos); en ese caso el cliente ve el saldo negativo y no puede canjear hasta volver a positivo (asunción 5).
- **RN-05 Canje atómico.** Canjear valida en una transacción:
  - producto activo;
  - stock > 0 (si tiene stock);
  - saldo ≥ costo.

  Luego crea el canje `pendiente_retiro`, el movimiento `canjeado` (−costo) y baja el stock. Dos canjes simultáneos que juntos superan el saldo o el stock → uno OK y el otro 409 "No te alcanzan los puntos" o "Se agotó". Los puntos se descuentan al canjear, no al entregar.
- **RN-06 Reversión.**
  - **Automática:** si el pago en línea de una cita con puntos pasa a `reembolsado` o `contracargo`, se crea `revertido` (−puntos ganados).
  - **Manual:** el super admin puede [Revertir puntos] de una cita con motivo obligatorio.
  - Si en el futuro se agrega una transición que saque una cita de `terminada` (por ejemplo, "corregir a no asistió"), esa transición debe llamar a la misma reversión.
  - Revertir dos veces no tiene efecto (RN-03).
- **RN-07 Estados del canje.** `pendiente_retiro → entregado` o `pendiente_retiro → anulado`. `entregado` y `anulado` son finales. Anular un canje entregado no está permitido (409). Si hay una corrección, se hace con un ajuste manual.
- **RN-08 Código de retiro.** 6 caracteres de un alfabeto sin ambiguos (sin 0/O, 1/I/L), con prefijo `WS-` (por ejemplo, `WS-7KQ4M9`). Es único por negocio y no da pistas de otros canjes. Solo lo ven el dueño del canje, el barbero y el admin.
- **RN-09 Productos.**
  - Costo entero de 1 a 100.000 puntos.
  - Stock entero ≥ 0 o vacío.
  - Desactivar un producto no afecta canjes ya hechos; los canjes guardan nombre y costo congelados.
  - Un producto con canjes no se borra: se desactiva.
- **RN-10 Ajuste manual.** Solo el super admin. Entero distinto de 0 y motivo de 5 a 200 caracteres. Queda en el ledger y en la auditoría.
- **RN-11 Programa apagado.** No se acreditan puntos nuevos. El cliente sigue viendo su saldo y puede canjear lo que tiene (asunción 2). La landing oculta el bloque.
- **RN-12 Cuenta eliminada.** Si `User.status = deleted`, sus canjes `pendiente_retiro` quedan visibles para el admin, que decide si entregar o anular. El ledger se conserva para la auditoría.

### Autorización (se suma a la matriz de SPEC-34)
| Acción | Anónimo | client | barber | superadmin |
|---|---|---|---|---|
| Ver catálogo de productos activos | ✓ | ✓ | ✓ | ✓ |
| Ver saldo, historial y canjes propios; canjear | 401 | ✓ | ✓ (como cliente) | ✓ (como cliente) |
| Ver canjes por entregar; marcar entregado | 401 | 403 | ✓ | ✓ |
| Anular canje | 401 | 403 | ✓ (asunción 7) | ✓ |
| Configuración, productos, ajustes, revertir puntos, ledger de cualquier cliente | 401 | 403 | 403 | ✓ |

## Flujo principal
1. Joe activa el programa (tasa 1) y crea el producto "Cera mate" (120 pts, stock 10, foto).
2. Pedro reserva un "Corte + barba" ($15.000) por la web. El barbero lo marca "Terminar" → se crea `ganado +15` y el correo "Gracias por venir" dice "Sumaste 15 puntos. Tu saldo: 15".
3. Después de varias visitas, Pedro tiene 130 pts. En `/wstyle/cuenta/puntos/` toca [Canjear] en "Cera mate" y confirma → saldo 10, código `WS-7KQ4M9`, estado "Por retirar". Recibe el correo con el código.
4. En el local, el barbero busca `WS-7KQ4M9` en "Canjes por entregar" y toca [Marcar entregado] → Pedro ve "Entregado el 18 nov 2026".
5. Si el producto no estaba, el barbero toca [Anular], con el motivo "Sin stock físico" → se crea `devuelto +120` y el stock se repone.

## Casos borde
- **CB-01** Cita `admin` o `pro_invite` terminada → no da puntos.
- **CB-02** Precio del servicio $9.990 con tasa 1 → 9 pts. Tasa 0 → ningún movimiento.
- **CB-03** Cita a domicilio: servicio $10.000 + domicilio $5.000 + tarifa → 10 pts (solo el servicio).
- **CB-04** Doble clic en [Canjear] o dos pestañas → un solo canje y un solo descuento.
- **CB-05** Stock 1 y dos clientes canjean a la vez → uno OK y el otro 409 "Se agotó".
- **CB-06** Pago reembolsado de una cita cuyos puntos ya se canjearon → saldo negativo, sin canje posible hasta volver a positivo.
- **CB-07** Entregar un canje ya anulado, o anular uno ya entregado → 409 con el estado actual.
- **CB-08** Código inexistente o mal escrito en la búsqueda → "No encontramos ese código".
- **CB-09** Joe cambia la tasa a 2 → solo afecta a las citas que terminen después del cambio.
- **CB-10** Producto desactivado con canjes pendientes → los canjes siguen y se pueden entregar.
- **CB-11** Foto de producto inválida (no es imagen o pesa más de 5 MB) → 400, mismo manejo que las fotos de barbero.
- **CB-12** Móvil 390 px: saldo, historial y catálogo sin scroll horizontal.

## Diseño ("Noir de oficio")
- Saldo grande en Cormorant Italic ("130 puntos"), acento `--brass`.
- Productos en tarjetas sobrias: foto, nombre en versalitas Inter y costo "120 PTS". Si el saldo no alcanza: botón deshabilitado con "Te faltan 30".
- El código de retiro va en tipografía monoespaciada grande, con [Copiar].
- Bloque de la landing: un renglón en Anton ("JUNTA PUNTOS CON CADA CORTE.") + 2 líneas en Cormorant + enlace "Ver cómo funciona", dentro del panel sólido de Extras. Sin iconos de regalo ni colores ajenos a la paleta.

## Criterios de aceptación
Tests de server con `node --test` contra la BD de test real (`pagina_personal_test`), con el mailer en dry-run. Tests de client con vitest. Navegador en `http://127.0.0.1:5173/wstyle/` a 1440×900 y 390×844.

- **AC-01 Acreditación.** Una cita `web` con cliente, servicio $15.000 y tasa 1, al terminar crea exactamente un `ganado +15`. Terminarla de nuevo (o reintentar) no duplica. Citas `admin` o `pro_invite`, o con el programa apagado → sin movimiento. Test de server.
- **AC-02 Cálculo.** Vectores: $10.000 → 10; $9.990 → 9; $50.000 → 50; domicilio y tarifa de servicio no suman; tasa 2 con $12.500 → 25; tasa 0 → sin movimiento. Test unitario de la función de cálculo.
- **AC-03 Reversión.** Una cita con puntos cuyo pago pasa a `reembolsado` (vía `applyPayment` con el MP fake) crea `revertido −N` una sola vez. [Revertir puntos] manual sin motivo → 400; con motivo → OK, y repetirlo no cambia nada. Test de server.
- **AC-04 Canje.** Con saldo 130 y producto de 120 pts y stock 1:
  - canjear → 201, saldo 10, stock 0, código con formato `WS-[A-HJ-KM-NP-Z2-9]{6}`;
  - un segundo canje → 409.
  - Dos canjes simultáneos con saldo para uno solo → exactamente uno OK.

  Test de server.
- **AC-05 Entrega y anulación.**
  - Barbero marca entregado → `entregado`. Anular un entregado → 409.
  - Anular un `pendiente_retiro` → `anulado`, `devuelto +costo` y stock repuesto.
  - Client → 403 en ambos.
  - Cada acción deja registro de auditoría.

  Test de server.
- **AC-06 Ajuste y autorización.** Un ajuste sin motivo → 400. Un client o barber haciendo un ajuste, CRUD de productos o cambio de configuración → 403. Un client no ve el ledger de otro (404). La matriz de autorización de SPEC-34 se extiende con los endpoints nuevos. Test de server.
- **AC-07 Correos.** El correo `client_finished` incluye "Sumaste N puntos" cuando corresponde, y no lo incluye si la cita no da puntos. El canje registra el correo con el código. Test de server sobre `Notification` en dry-run.
- **AC-08 Cuenta del cliente en el navegador.** Con un cliente de seed con 130 pts:
  - `/wstyle/cuenta/puntos/` muestra saldo, historial y productos;
  - canjear muestra la confirmación y luego el código;
  - el saldo baja a 10;
  - un producto de 200 pts muestra "Te faltan 70" deshabilitado.

  Capturas a 1440 y 390 px, sin errores de consola.
- **AC-09 Panel en el navegador.** El super admin crea un producto con foto, lo ve en el catálogo del cliente, busca un código en "Canjes por entregar" y lo marca entregado. El barbero ve la misma lista en `/wstyle/pro/`.
- **AC-10 Landing.** Con el programa activo, `/wstyle/` muestra el bloque "Junta puntos con cada corte" con el enlace a la cuenta. Con el programa apagado, el bloque no está en el DOM. El prerender no incluye cifras de puntos. Sin scroll horizontal en 390 px.
- **AC-11 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. Los tests existentes de W Style pasan.

## Decisiones confirmadas (por el usuario)
- Los puntos se suman cuando la cita se **atiende** (`terminada`), no al agendar. Solo citas agendadas por la web con cuenta de cliente.
- La cantidad depende del precio: tasa configurable por Joe, por defecto **1 punto por cada $1.000 CLP** del precio del servicio (corte $10.000 = 10 pts; decoloración $50.000 = 50 pts).
- Canje por **productos en el local**. Joe carga los productos (nombre, foto, descripción, costo en puntos, stock opcional, activo/inactivo). El cliente ve su saldo e historial, canjea y recibe un código; lo retira en la barbería y el barbero o el admin lo marca "entregado" (o lo anula y se devuelven los puntos). Los puntos se descuentan **al canjear**, no al entregar.
- Movimientos de puntos auditables (ledger: ganados, canjeados, devueltos, ajustes manuales con motivo). Si una cita terminada se revierte, se revierten sus puntos.
- Bloque breve en la landing: "Junta puntos con cada corte", sin cifras inventadas.

## Asunciones (detalles menores, pendientes de validar)
1. El programa viene **apagado** y Joe lo activa en Configuración. Las citas terminadas antes de activarlo no dan puntos retroactivos.
2. Con el programa apagado, el cliente igual puede canjear su saldo.
3. La base de cálculo es solo el precio del servicio (sin domicilio ni tarifa de servicio). Pagar con gift card no reduce los puntos.
4. Los puntos no vencen.
5. Un saldo puede quedar negativo por una reversión. No se cobra nada; solo bloquea canjes hasta volver a positivo.
6. "Revertir" hoy se dispara por reembolso o contracargo del pago en línea, o a mano por el admin. No se agrega una transición nueva para sacar una cita de `terminada`.
7. El barbero puede entregar y anular canjes (está en el local), pero no puede ajustar saldos ni editar productos.
8. El correo "Gracias por venir" suma la línea de puntos; no hay un correo aparte por cada acreditación.
9. Un canje es de una unidad de un producto; para dos unidades se canjea dos veces.
10. El canje `pendiente_retiro` no vence solo: el admin lo anula si el cliente nunca lo retira.
11. El bloque de la landing va dentro del capítulo "Antes de venir" (o justo antes de él) y no agrega un capítulo numerado nuevo.
