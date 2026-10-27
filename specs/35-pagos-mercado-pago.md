# SPEC-35 — WS Style: pagar la cita en línea con Mercado Pago Checkout Pro

> Pedido del usuario (2026-10-25): "Una vez tengas el agendamiento, configura una API de pagos (en una investigación vi que podría funcionar gratis)."
> Decisión confirmada: **Mercado Pago Checkout Pro**.
>
> Depende de SPEC-32 (cita, estados, cuenta del cliente). Configuración y reembolsos desde el panel de SPEC-34.
> Modo autónomo: lo no confirmado está en "Asunciones pendientes de validar".

## Qué significa "gratis" aquí
- **Sandbox gratis:** credenciales de prueba, usuarios de prueba (vendedor y comprador) y tarjetas de prueba sin costo y sin dinero real.
- **Producción sin costo fijo:** sin mensualidad, sin costo de integración ni de alta. **Sí cobra una comisión por cada pago aprobado** (porcentaje + IVA según el plazo de liberación del dinero elegido en la cuenta de Mercado Pago Chile). Verificar la tabla vigente en la cuenta al pasar a producción; esta spec no fija cifras.
- No hay costo de infraestructura extra: el webhook lo recibe el mismo server Express (Render free).

## Estado actual
- No hay pagos. SPEC-32 deja el paso 4 de la reserva con "Pagar en el local" y la máquina de estados ya prevé `pendiente_pago`.
- `server/src/app.js` (`createApp({ env })`) lee la configuración de `env`, lo que permite inyectar credenciales de prueba en tests. `render.yaml` declara variables con `sync: false`.
- El front es estático en GitHub Pages: **ningún secreto puede vivir en el client**.

## Historia
Como **cliente de WS Style** quiero **pagar mi cita en línea al reservarla (o elegir pagar en el local)**, para **dejarla asegurada sin tener que llevar efectivo**; y como **dueño** quiero **que el estado del pago se refleje solo en la cita y poder devolver el dinero cuando corresponde**.

## Alcance
**Incluye**
- Opción "Pagar en línea" en el paso 4 de la reserva (si el super admin la habilitó) junto a "Pagar en el local".
- Creación de la preferencia de Checkout Pro **en el server**, redirección al checkout de Mercado Pago y regreso a la página de la cita.
- Webhook (`notification_url`) con verificación de firma `x-signature`, consulta del pago a la API de Mercado Pago, idempotencia y actualización de la cita.
- Estados de pago `approved` / `pending` / `in_process` / `rejected` / `cancelled` / `refunded` / `charged_back` mapeados a la cita.
- Reintento de pago mientras la hora siga retenida.
- Reembolso total desde el panel del super admin.
- Conciliación de respaldo (si un webhook se pierde).
- Credenciales de prueba en `server/.env` y guía para probar el webhook en local con un túnel.

**Fuera**
- Checkout API / Bricks (formulario de tarjeta propio), tarjetas guardadas (la pantalla "Métodos de pago" de Styluxe), suscripciones (la membresía "Club W" no se cobra en línea en esta spec), cuotas configuradas a medida, propinas.
- Split de pagos / marketplace (cobrar a nombre de cada barbero y retener comisión): **solo diseño** para Styluxe, ver abajo.
- Reembolsos parciales, boletas/facturas SII.
- Activar producción o desplegar: todo se valida en sandbox y en local.

## Reglas de negocio
- **RN-01 Formas de pago.** "Pagar en el local" (efectivo/débito/crédito al llegar) y "Pagar en línea" (Mercado Pago). Cada una se habilita/deshabilita en la configuración (SPEC-34). Las citas creadas por invitación del barbero (SPEC-33) son siempre "en el local".
- **RN-02 Monto.** Se cobra el **total** de la cita (servicio + recargo de domicilio) en CLP, entero, calculado por el server desde la cita (nunca desde el client). Un solo ítem: "<Servicio> · WS Style · <fecha hh:mm>".
- **RN-03 Retención de la hora.** Al elegir "Pagar en línea" la cita se crea en `pendiente_pago` (ocupa la hora, SPEC-32 RN-02) y la preferencia vence a los **15 min**. Si en ese plazo no hay pago aprobado, la cita pasa a `cancelada` (motivo "pago no completado") y libera la hora.
- **RN-04 Aprobado.** Pago `approved` → `payment.status = pagado`, la cita pasa de `pendiente_pago` a `pendiente` (espera confirmación del barbero, como cualquier cita) y se envían los correos de "reserva recibida" con "Pagado en línea".
- **RN-05 Rechazado.** `rejected`/`cancelled` → la cita sigue en `pendiente_pago` mientras dure la retención y la página de la cita ofrece "Reintentar pago" (nueva preferencia, mismo vencimiento original) o "Cambiar a pagar en el local" (pasa a `pendiente` con pago en el local).
- **RN-06 Pendiente.** Para que el resultado llegue en minutos se excluyen los medios de pago diferidos (efectivo en puntos de pago / transferencias offline). Si igual llega `pending`/`in_process`, la retención se extiende hasta 2 h; si se resuelve después de eso, aplica RN-08.
- **RN-07 Fuente de verdad.** El estado del pago **solo** se cambia con datos obtenidos del API de Mercado Pago (`GET /v1/payments/{id}`) usando el access token del server. Ni los parámetros de `back_urls` ni el cuerpo del webhook se creen tal cual.
- **RN-08 Pago tardío / huérfano.** Si llega un `approved` para una cita ya `cancelada`/`expirada` y la hora sigue libre, se reactiva la cita a `pendiente`; si la hora ya la tomó otro, la cita queda `cancelada` con `payment.status = reembolso_pendiente` y alerta al super admin.
- **RN-09 Reembolsos.** Corresponde reembolso total cuando: el barbero rechaza o cancela, la cita expira sin confirmación, el super admin cancela, el cliente cancela dentro del plazo permitido (≥ 3 h antes, SPEC-32 RN-13), o RN-08. La cita queda `reembolso_pendiente` y el super admin pulsa "Reembolsar" en el panel → `POST /v1/payments/{id}/refunds` → `reembolsado`. Si el cliente cancela fuera de plazo no puede hacerlo en línea (solo por WhatsApp) y el reembolso queda a criterio del admin.
- **RN-10 Contracargos.** `charged_back` → alerta al super admin; la cita no cambia de estado automáticamente.
- **RN-11 Secretos.** `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` solo en `server/.env` (local) y en variables de Render con `sync: false` (cuando se despliegue). No se exponen por ninguna API, no se loguean y no entran al bundle del client. El panel solo muestra "Configurado: sí/no · Modo: prueba/producción" (deducido del prefijo `TEST-`/`APP_USR-`).
- **RN-12 Comisión de plataforma.** La comisión de plataforma (SPEC-34, por defecto 0 %) se registra en la cita como dato contable; **no** se descuenta en Mercado Pago (WS Style es un solo vendedor). La comisión de Mercado Pago es aparte y se ve en la cuenta de Mercado Pago.

### Integración (Checkout Pro)
- **Crear preferencia** (`POST /api/wstyle/appointments/:id/checkout`, requiere sesión del dueño de la cita): el server arma `items` (título, `quantity: 1`, `unit_price` = total, `currency_id: 'CLP'`), `payer.email`, `external_reference` = id de la cita, `back_urls` (`success`/`failure`/`pending` → `<SITE>/wstyle/cita/?id=<id>&pago=<resultado>`), `auto_return: 'approved'`, `notification_url` = `<API_PUBLIC_URL>/api/payments/mp/webhook`, `expires: true` + `expiration_date_to` (= fin de la retención), `payment_methods.excluded_payment_types` (diferidos, RN-06), `statement_descriptor: 'WSSTYLE'`, y un `X-Idempotency-Key` por intento. Guarda `preferenceId` y responde el `init_point`; el client redirige.
- **Regreso** (`back_urls`): la página de la cita **no** confía en `?pago=`; consulta al server el estado (que a su vez puede consultar a Mercado Pago si aún no llegó el webhook) y muestra "Pago aprobado", "Estamos confirmando tu pago…" o "El pago no se completó" con Reintentar / Pagar en el local.
- **Webhook** (`POST /api/payments/mp/webhook`, público):
  1. Lee `x-signature` (`ts=<ts>,v1=<hash>`) y `x-request-id`; arma el manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (`data.id` del query string, en minúsculas si es alfanumérico; se omiten las partes ausentes), calcula HMAC-SHA256 con `MP_WEBHOOK_SECRET` y compara en tiempo constante. Firma inválida → 401 y no se procesa. Se rechaza `ts` con más de 10 min de antigüedad (anti-replay).
  2. Solo procesa `type = payment`; otros tipos → 200 sin hacer nada.
  3. Consulta `GET /v1/payments/{data.id}` y ubica la cita por `external_reference`. Si el pago no corresponde a ninguna cita o el monto/moneda no coinciden con la cita → registra alerta y responde 200 (no reintentar).
  4. **Idempotencia:** `PaymentEvent` con índice único por (`mpPaymentId`, `status`) + transiciones de pago monótonas (no se vuelve de `pagado` a `pendiente`). Un mismo evento recibido N veces produce un solo cambio y un solo correo.
  5. Responde 200/201 rápido (Mercado Pago reintenta si no recibe 2xx).
- **Conciliación**: un proceso periódico (cada 5 min mientras el server está despierto, y al arrancar) busca citas `pendiente_pago` o con pago `in_process` y consulta `GET /v1/payments/search?external_reference=<id>`; aplica la misma lógica idempotente. Cubre webhooks perdidos y el "sueño" de Render free.
- **Variables** en `server/.env`: `MP_ACCESS_TOKEN` (credencial de prueba del **usuario vendedor de prueba**), `MP_WEBHOOK_SECRET` (clave secreta de "Webhooks" en Tus integraciones), `MP_NOTIFICATION_URL` (opcional: sobreescribe la URL del webhook, p.ej. la del túnel), `PUBLIC_SITE_URL` (para `back_urls`; en local `http://localhost:5173`), `API_PUBLIC_URL`. `render.yaml` agrega las mismas con `sync: false` (sin desplegar).

### Cómo probar en local
1. En Mercado Pago Developers (cuenta personal de Pedro, nunca de ordename): crear la aplicación (Checkout Pro), crear **usuarios de prueba** vendedor y comprador (país Chile) y copiar las credenciales de prueba del vendedor a `server/.env`.
2. Configurar el webhook en "Tus integraciones → Webhooks" (modo prueba), evento "Pagos", y copiar la clave secreta a `MP_WEBHOOK_SECRET`.
3. Exponer el server local con un túnel gratuito (p.ej. `cloudflared tunnel --url http://localhost:4000` o `ngrok http 4000`) y poner esa URL en `MP_NOTIFICATION_URL` y en la configuración del webhook. Mercado Pago no puede llamar a `localhost`.
4. Reservar en `http://localhost:5173/wstyle/reservar/` → "Pagar en línea" → pagar en el checkout con el **comprador de prueba** y una **tarjeta de prueba** de Chile, usando como nombre del titular `APRO` (aprobado), `OTHE` (rechazado) o `CONT` (pendiente).
5. Ver el pago llegar al webhook (log de una línea) y la cita cambiar de estado en `/wstyle/cita/?id=…` y en el panel.
6. "Simular notificación" del panel de Webhooks de Mercado Pago sirve para probar la firma.

## Flujo principal
1. Paso 4 de la reserva (SPEC-32): elige "Pagar en línea" → "Ir a pagar $<total>".
2. Server crea la cita `pendiente_pago` (retención 15 min) + preferencia → redirige a Mercado Pago.
3. Paga → vuelve a `/wstyle/cita/?id=…` → "Estamos confirmando tu pago…" → (webhook o conciliación) → "Pago aprobado · Esperando confirmación de <barbero>".
4. Correos al cliente y al barbero con "Pagado en línea".
5. Si luego el barbero rechaza → cita `cancelada`, pago `reembolso_pendiente` → el super admin pulsa "Reembolsar" → `reembolsado` → correo al cliente "Te devolvimos $<total>".

## Casos borde
- **CB-01** Webhook duplicado o fuera de orden (`approved` antes que `pending`) → un solo cambio; nunca se retrocede de `pagado`.
- **CB-02** Webhook con firma inválida, sin `x-signature` o con `ts` viejo → 401, sin cambios, log de alerta (sin datos sensibles).
- **CB-03** Webhook que nunca llega (túnel caído, Render dormido) → la conciliación lo resuelve; la página de la cita consulta al server, que consulta a Mercado Pago.
- **CB-04** El cliente cierra el checkout sin pagar → a los 15 min la cita se cancela y la hora se libera; correo "Tu reserva no se completó".
- **CB-05** El cliente vuelve con `?pago=approved` falsificado en la URL → no cambia nada (RN-07).
- **CB-06** Pago aprobado después de la retención y con la hora ya ocupada → RN-08 (reembolso pendiente + alerta).
- **CB-07** Monto del pago distinto al total de la cita → no se marca pagado; alerta al admin.
- **CB-08** Dos pestañas pagan la misma cita → el segundo pago aprobado queda como `reembolso_pendiente` (la cita ya estaba pagada).
- **CB-09** `MP_ACCESS_TOKEN` ausente → "Pagar en línea" no aparece aunque esté habilitado en config; el panel muestra "Mercado Pago no configurado".
- **CB-10** Mercado Pago responde error al crear la preferencia → la cita queda `pendiente_pago`; la UI ofrece reintentar o "Pagar en el local".
- **CB-11** Reembolso falla en Mercado Pago (saldo insuficiente, pago muy antiguo) → queda `reembolso_pendiente` con el error visible para el admin; se puede reintentar.
- **CB-12** Contracargo → alerta (RN-10).

## Criterios de aceptación
Tests de server con `node --test` contra BD de test real (`pagina_personal_test`, replica set de un nodo). El cliente HTTP de Mercado Pago se **inyecta** (es un servicio externo; nunca se mockea la BD). Firmas de webhook calculadas en el test con un `MP_WEBHOOK_SECRET` de prueba. Prueba de punta a punta en sandbox real + navegador en :5173.

- **AC-01 Preferencia en el server.** Crear checkout de una cita propia en `pendiente_pago` envía a Mercado Pago: `unit_price` = total de la cita en CLP, `currency_id: 'CLP'`, `external_reference` = id, `back_urls` a `/wstyle/cita/?id=…`, `notification_url`, vencimiento = fin de la retención, medios diferidos excluidos, y header de idempotencia; responde el `init_point`. Cita ajena → 404; cita ya pagada → 409. Test de server.
- **AC-02 Secretos.** `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` no aparecen en ninguna respuesta de la API, en los logs de los tests ni en `client/dist` (`grep`). Test de server + verificación del build.
- **AC-03 Firma.** Webhook con firma válida → procesa; firma alterada, ausente, con otro `data.id` o `ts` > 10 min → 401 sin cambios. Test de server.
- **AC-04 Mapeo de estados.** Para pagos `approved`, `rejected`, `cancelled`, `in_process`, `pending`, `refunded`, `charged_back` (respuestas del API inyectadas), la cita y su pago terminan en el estado de RN-03…RN-10. Test de server.
- **AC-05 Idempotencia.** El mismo webhook `approved` enviado 5 veces (y en paralelo) → un solo cambio de estado, un solo `PaymentEvent` por estado, un solo correo. `pending` después de `approved` no retrocede. Test de server.
- **AC-06 Retención.** Sin pago aprobado a los 15 min (reloj inyectado) la cita pasa a `cancelada` y libera la hora; con `in_process` se extiende hasta 2 h. Test de server.
- **AC-07 Tardío y huérfano.** `approved` después de cancelar por vencimiento: hora libre → la cita vuelve a `pendiente`; hora ocupada → `reembolso_pendiente` + alerta. Monto distinto → no se marca pagado + alerta. Test de server.
- **AC-08 Regreso sin confiar en la URL.** `GET` del estado de la cita con `?pago=approved` en la URL y sin pago real → sigue `pendiente_pago`. Test de server; en navegador se ve "Estamos confirmando tu pago…".
- **AC-09 Conciliación.** Con el webhook "perdido", el proceso de conciliación consulta por `external_reference` y aplica el estado correcto (idempotente con un webhook que llegue después). Test de server.
- **AC-10 Reembolso.** Barbero rechaza una cita pagada → `reembolso_pendiente`; el super admin reembolsa → se llama `POST /v1/payments/{id}/refunds` una sola vez (doble clic no duplica) → `reembolsado` + correo; error de Mercado Pago → sigue pendiente con el mensaje. Solo `superadmin` puede reembolsar. Test de server.
- **AC-11 Sin configuración.** Sin `MP_ACCESS_TOKEN`, "Pagar en línea" no se ofrece y el endpoint de checkout responde 503 `payments_not_configured`. Test de server.
- **AC-12 Punta a punta en sandbox (manual, documentado).** Con credenciales de prueba y túnel: reservar en :5173 con "Pagar en línea", pagar con el comprador de prueba y titular `APRO` → la cita queda "Pagado en línea · esperando confirmación"; repetir con `OTHE` → "El pago no se completó" con Reintentar / Pagar en el local; repetir con `CONT` → "Estamos confirmando tu pago…". Capturas y log del webhook en el informe de verificación.
- **AC-13 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` verdes.

## Consideración para Styluxe (solo diseño, no implementar)
En un "Uber de barberos" cada profesional cobra a su nombre y la plataforma retiene su comisión. En Mercado Pago eso es el modelo **marketplace**: cada profesional conecta su cuenta por OAuth, la preferencia se crea con el token del profesional y se agrega `marketplace_fee` (la comisión de la plataforma). El modelo de SPEC-32 ya deja `platformFeeRate`/`platformFeeCLP` por cita y `Payment` separado de `Appointment`, para que el cambio sea de proveedor de cobro y no de dominio. Nada de esto se construye ahora.

## Decisiones confirmadas (por el usuario)
- Proveedor: **Mercado Pago Checkout Pro** (sandbox gratis; en producción sin costo fijo, solo comisión por venta).
- Webhook/notificación con estado de pago reflejado en la cita.
- La preferencia se crea en el server; el access token nunca va al client.
- ✎ Los clientes tienen cuenta (SPEC-32): el email del pagador sale de la cuenta.

## Asunciones pendientes de validar
1. Se mantiene la opción **"Pagar en el local"** junto a "Pagar en línea"; el cliente elige.
2. Pagar en línea **no** confirma la cita sola: igual espera la confirmación del barbero (como Styluxe).
3. La hora se retiene 15 min mientras el cliente paga (2 h si el pago queda "en proceso").
4. Se excluyen medios de pago diferidos (pago en efectivo en puntos / transferencias offline) para que el resultado sea inmediato.
5. Los **reembolsos son manuales**: el super admin pulsa "Reembolsar" (total) en el panel; sin reembolsos parciales.
6. Si el cliente cancela con ≥ 3 h de anticipación se le reembolsa el total; fuera de plazo, a criterio del admin.
7. El webhook se prueba en local con un túnel gratuito (cloudflared o ngrok) y la URL va en `MP_NOTIFICATION_URL`.
8. La membresía "Club W" no se cobra en línea en esta etapa.
9. Correo al cliente cuando se aprueba el pago, cuando no se completa y cuando se reembolsa.

## Dependencias
- **SPEC-32** (obligatoria): cita, `pendiente_pago`, retención de hora, cuenta del cliente, página de la cita.
- **SPEC-34**: habilitar pagos, reembolsos, alertas, auditoría.
- **SPEC-33**: rechazo/cancelación del barbero dispara reembolso pendiente.
- Cuenta de Mercado Pago Chile personal de Pedro con aplicación de Checkout Pro, usuarios de prueba y webhook de prueba configurado. Túnel local para recibir notificaciones.
