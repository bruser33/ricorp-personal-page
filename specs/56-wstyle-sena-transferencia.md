# SPEC-56 — WS Style: seña por transferencia bancaria

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "software de corte", con SillaLibre como referencia (catálogo §7 "Seña al reservar" y §8 "Medios de cobro"). El usuario eligió las funciones. Se toman las ideas, no la marca ni el diseño; WS Style mantiene "Noir de oficio".
> Modo autónomo: detalles menores en **Asunciones pendientes de validar**.
> Se integra con **SPEC-35** (Mercado Pago, que se mantiene), **SPEC-37** (registro de pagos y rendición), **SPEC-53** (WhatsApp, opcional), **SPEC-54** (lista de espera, opcional) y **SPEC-55** (contador de inasistencias visible).

## Estado actual
- Formas de pago (`Business.payments`): **en el local** (`localEnabled`) y **en línea con Mercado Pago** (`onlineEnabled` + credenciales en `.env`).
  - Una reserva en línea nace `pendiente_pago` y retiene la hora 15 min (`PAYMENT_HOLD_MIN`, `runHolds` en el intervalo de 60 s). Sin pago, se libera con el correo `payment_incomplete`.
  - Una reserva en el local nace `pendiente` (espera la confirmación del barbero).
- Al terminar una cita en el local, el barbero declara si cobró y la forma (`localMethod`: efectivo, transferencia o tarjeta) y, si corresponde, el N° de boleta (SPEC-37).
- "Pagos" del admin y del barbero (`domain/billing.js → list`) y la **Rendición** mensual leen esos datos.
- `CustomerProfile.counters` guarda `appointments` y `noShows` por cliente y negocio.
- Las fotos de los barberos van a **GridFS** (Mongo), recortadas a WebP de 800 px. El disco de Render free es **efímero**: lo que se escribe ahí se pierde al reiniciar o redeployar.
- No existe hoy ningún "comprobante" ni datos bancarios del local en el sistema.

## Historia
Como **dueño (super admin)** quiero **pedir una seña por transferencia al reservar, a quien yo decida**, para **que no me queden horas vacías por clientes que no llegan**.
Como **cliente** quiero **ver claro cuánto pagar, a qué cuenta, con qué referencia y hasta cuándo, y subir mi comprobante desde el celular**, para **asegurar mi hora sin necesitar tarjeta**.

## Alcance
**Incluye**
1. **Configuración** (admin → Configuración → **"Seña por transferencia"**):
   - Interruptor "Pedir seña al reservar".
   - **Cuánto**: [Monto fijo] (p. ej. $5.000) o [% del servicio] (p. ej. 30 %, redondeado hacia arriba a la centena). La seña nunca supera el total de la cita.
   - **A quién**: ( ) A todos · (•) **Solo clientes nuevos** (sin ninguna cita `terminada` en WS Style) · ( ) **Solo clientes con una inasistencia previa** (`counters.noShows ≥ 1`).
   - **Plazo para pagarla**: chips **[15 min] [30 min] [60 min]**.
   - **Datos para la transferencia**: titular, RUT, banco, tipo de cuenta (corriente, vista o RUT, ahorro), N° de cuenta y correo para el aviso. Se validan RUT (dígito verificador) y correo.
   - Vista previa de lo que ve el cliente.
   - No se puede encender sin datos bancarios completos, ni sin almacenamiento de comprobantes configurado (RN-10). En esos casos se muestra el motivo.
   - Los cambios quedan en la auditoría.
2. **Aviso antes de reservar** (paso "Revisar" de `BookingPage.tsx`, solo si la regla aplica a ese cliente y eligió pagar en el local):
   - "Para guardar tu hora te pedimos una seña de $5.000 por transferencia. Tendrás 30 minutos para pagarla y subir el comprobante. El resto ($13.000) lo pagas en el local. **La seña no se devuelve si cancelas o no llegas.**"
   - Casilla obligatoria "Entiendo las condiciones de la seña".
   - Si Mercado Pago está disponible, "Pagar en línea" sigue como alternativa: el pago completo no pide seña.
3. **Estado nuevo de la cita: `pendiente_sena`** ("Pendiente de seña"). Se agrega a `STATUSES` y a `BLOCKING`: ocupa la hora.
   - `expiresAt` = el plazo (RN-04).
   - Datos de la seña en la cita (`deposit`): monto, referencia, estado (`por_pagar` · `en_revision` · `confirmada` · `rechazada` · `vencida` · `por_devolver` · `devuelta`), metadatos del comprobante (clave de almacenamiento, tipo, tamaño, hash, subido el), quién la revisó y cuándo, y motivo de rechazo.
4. **Pantalla "Deja tu seña"** (en la página de la cita `/wstyle/cita/?id=`, que es adonde lleva la reserva):
   - Tarjeta de la cita.
   - **Cuenta regresiva**: "Te guardamos la hora hasta las 18:42 · quedan 29:58". Se calcula con la hora del server (`now` de la API), no con el reloj del teléfono.
   - Monto de la seña y el resto a pagar en el local.
   - **Referencia `WS-K7QM`** con [Copiar]: "Ponla en el comentario o asunto de la transferencia".
   - Datos bancarios, cada uno con [Copiar], y [Copiar todo] en formato para pegar en la app del banco.
   - **Subir comprobante**: "Una captura, una foto o el PDF de la transferencia (hasta 5 MB)", con [Elegir archivo] (`accept="image/*,application/pdf"`, cámara en móvil), vista previa y [Enviar comprobante].
   - Enlaces "Escribir por WhatsApp al local" (`wa.me`) y [Cancelar la hora].
   - Tras enviar, se ven dos chips: **HORA ✓ Guardada** · **SEÑA ⏳ En revisión**. La cita sigue el flujo normal (`pendiente` → confirmación del barbero).
   - Si vence: "**Se venció el plazo de la seña.** No llegó el comprobante antes de las 18:42, así que liberamos la hora." [Reservar de nuevo] [Ya pagué: escribir al local].
5. **Avisos al cliente**:
   - correo al crear (instrucciones, referencia, datos y plazo);
   - correo al confirmar la seña ("Recibimos tu seña"), al rechazarla (con motivo) y al vencer;
   - con SPEC-53 activa y opt-in, WhatsApp `ws_sena_por_vencer` **10 min antes** del vencimiento si aún no hay comprobante (no se envía si el plazo es de 15 min).
6. **"Pagos por confirmar"** (panel super admin):
   - Pestaña nueva dentro de **Pagos**, con un contador en el menú lateral y una tarjeta en Inicio ("3 señas por revisar").
   - Cada fila: cliente, servicio, barbero, hora de la cita, monto esperado, referencia y hora de subida.
   - Al abrirla se ve el comprobante (imagen ampliable o PDF embebido o descargable) junto a la lista de cotejo: "Monto $5.000 · Referencia WS-K7QM · A la cuenta …4321".
   - Acciones **[✓ Confirmar seña]** y **[✕ Rechazar]** (motivo obligatorio con chips: Monto distinto · No llegó a la cuenta · Comprobante ilegible · Otro).
   - Confirmar o rechazar queda en la auditoría.
7. **En la agenda y el detalle** (barbero y admin):
   - las citas `pendiente_sena` se ven con su color y la etiqueta "Esperando seña · vence 18:42";
   - una cita con la seña en revisión muestra "Seña en revisión";
   - una con la seña confirmada muestra "✓ Seña $5.000".

   El barbero **no** ve el comprobante.
8. **Integración con el registro de pagos (SPEC-37)**:
   - Una seña **confirmada** aparece en "Pagos" del admin y del barbero como fila "Seña · transferencia" con fecha de confirmación, y suma en la **Rendición** del mes como ingreso por transferencia.
   - Al **terminar** la cita, el diálogo "¿Cobraste?" muestra "Resta por cobrar $13.000 (seña de $5.000 ya pagada)". Lo cobrado en el local se registra como hoy, por el resto.
   - El respaldo tributario (N° de boleta) sigue por venta completa, no por seña (asunción 7).
   - Una seña **rechazada**, **vencida** o sin confirmar no suma nada.
9. **Seña por devolver**: si la cita se cancela por el **barbero o el admin**, o el admin la rechaza por error después de haberla confirmado, la seña confirmada pasa a `por_devolver`.
   - Aparece en Pagos con [Marcar devuelta], para cuando Joe ya transfirió de vuelta a mano.
   - Si el **cliente** cancela o no llega, la seña confirmada no se devuelve (condición aceptada al reservar) y queda como ingreso.
10. **Almacenamiento de comprobantes** (módulo `lib/receipts.js`, con dos drivers). **Nunca en Mongo**: en la BD solo se guardan los metadatos.
    - **Local**: `fs`, en `server/uploads/receipts/<yyyy-mm>/<uuid>.<ext>`, con la carpeta en `.gitignore`.
    - **Producción (Render)**: **Cloudflare R2**, compatible con S3, en un bucket **privado** `wstyle-receipts`. Plan gratuito de 10 GB y sin costo de salida.
    - Variables: `RECEIPTS_STORAGE=fs|s3`, `RECEIPTS_DIR`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`. Los secretos van con `sync: false` en `render.yaml` y documentados en `.env.example` sin valores.
    - El archivo **nunca** es público. Se sirve por un endpoint del server que exige super admin o al dueño de la cita, con `Content-Disposition` y `X-Content-Type-Options: nosniff`.
    - El tipo se valida **por contenido**: JPEG, PNG o WebP (reusa `sniffImage` de `lib/photos.js`), HEIC/HEIF de iPhone (asunción 9) o PDF (`%PDF-`). Las imágenes se re-codifican a WebP de máx. 1600 px con `sharp`, lo que además elimina metadatos y EXIF. Los PDF se guardan tal cual.
    - Límite de **5 MB** por archivo y un comprobante vigente por cita: si se sube otro, reemplaza al anterior mientras esté en revisión.
    - **Retención**: los comprobantes se borran 12 meses después de la cita, y sus metadatos quedan.
11. **Vencimiento automático**: el intervalo de 60 s (`index.js`) corre `runDeposits`.
    - Las citas `pendiente_sena` sin comprobante con `expiresAt ≤ ahora` pasan a `expirada`: se liberan los `SlotLock`, la seña queda `vencida`, se manda el correo y se avisa a la lista de espera de SPEC-54 si existe.
    - Si el server estuvo dormido, al despertar procesa todas las vencidas.

**Fuera**
- Conciliación automática con el banco (APIs bancarias, Fintoc o Khipu): la revisión es manual.
- Seña con Mercado Pago (el pago en línea completo ya existe) y QR de billetera.
- Montos de seña distintos por servicio (asunción 3).
- Seña en las citas que crean el barbero o el admin.
- Devolución automática de dinero (se registra la devolución hecha a mano).
- Gift cards.

## Reglas de negocio
- **RN-01 Cuándo se pide.** La seña está encendida, la cita es una **reserva web** con pago **en el local** y el cliente cumple la regla configurada (todos, nuevos o con inasistencia previa). Las invitaciones del barbero, las citas del admin y las horas tomadas desde la lista de espera también pasan por esta regla si las crea el cliente por la web (asunción 4).
- **RN-02 Monto.** Fijo, o porcentaje del **precio del servicio + domicilio** (sin la tarifa de servicio de SPEC-38), redondeado hacia arriba a $100. Mínimo $1.000 y máximo el total. Se congela en la cita al reservar.
- **RN-03 Referencia.** `WS-` + 4 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin O, I, 0 ni 1), única entre las señas no finalizadas.
- **RN-04 Plazo.** `expiresAt = min(ahora + plazo, inicio − 30 min)`. Si con eso quedan menos de 10 min, no se puede reservar esa hora con seña: "Esta hora es muy pronto para pagar la seña. Elige otra o paga en línea".
- **RN-05 Comprobante a tiempo.** Basta con **subirlo** antes del vencimiento: desde ahí la hora queda guardada aunque Joe lo revise más tarde. Un comprobante que llega después del vencimiento → 409 "El plazo ya venció".
- **RN-06 Revisión.** Solo el super admin confirma o rechaza.
  - Confirmar: `deposit.status = confirmada`.
  - Rechazar: la cita pasa a `cancelada` (por admin, motivo "Seña rechazada: …"), se liberan los locks, sale el correo al cliente con el motivo y se avisa a la lista de espera.
  - Una seña en revisión cuya cita ya empezó sigue revisable; el barbero ve "Seña sin revisar".
- **RN-07 Cancelación.** Si el cliente cancela, aplica `cancelUntilMinutes` y la seña confirmada **no se devuelve**. Si cancela con la seña en revisión, queda como pendiente de revisión y Joe decide (confirmar = ingreso; rechazar = sin ingreso). Si cancelan el barbero o el admin → `por_devolver`.
- **RN-08 Privacidad.** Los datos bancarios **no son públicos**: solo los ve el cliente con una seña pendiente de **su** cita y el super admin. Nunca van al JSON-LD ni al HTML prerenderizado.
- **RN-09 Permisos.** Subir: solo el dueño de la cita. Ver el comprobante: el dueño y el super admin. Confirmar, rechazar o marcar devuelta: solo el super admin (en la matriz de SPEC-34; barbero → 403).
- **RN-10 Producción sin almacenamiento.** Si en producción (`NODE_ENV=production`) no hay driver `s3` configurado, la seña no se puede encender: no se aceptan comprobantes en el disco efímero de Render.

## Flujo principal
1. Joe enciende la seña: $5.000, solo clientes nuevos, 30 min, con sus datos bancarios.
2. Camila (cliente nueva) reserva "Corte + barba" para el viernes a las 17:00 con pago en el local, ve el aviso y acepta. La cita queda `pendiente_sena` y vence a las 12:40.
3. En la página de su cita ve la cuenta regresiva y la referencia `WS-K7QM`, transfiere desde su banco y sube la captura. Chips: Hora ✓ · Seña ⏳.
4. Joe ve "Pagos por confirmar (1)", compara el comprobante con su cuenta y presiona [✓ Confirmar seña]. Camila recibe "Recibimos tu seña".
5. El barbero confirma la cita, como siempre. El viernes la termina: "Resta por cobrar $13.000"; cobra en efectivo. Pagos y Rendición muestran $5.000 por transferencia (seña) y $13.000 en efectivo.

## Casos borde
- **CB-01** El plazo vence mientras el cliente sube el archivo: si la subida llegó al server antes de `expiresAt` se acepta; si no, 409 y la pantalla muestra "Se venció el plazo".
- **CB-02** El archivo es un .exe renombrado a .jpg, un PDF corrupto o pesa 7 MB → 400 con un mensaje claro y la hora sigue esperando.
- **CB-03** Foto HEIC desde iPhone: se acepta y se convierte (asunción 9).
- **CB-04** Doble clic en [Enviar comprobante]: un solo comprobante; el segundo reemplaza al primero de forma idempotente por hash.
- **CB-05** Joe confirma y otra pestaña rechaza a la vez: gana la primera y la segunda recibe 409 (`optimisticConcurrency`).
- **CB-06** La cita en `pendiente_sena` se reasigna o se mueve: la seña y el plazo se conservan.
- **CB-07** Joe cambia la configuración (monto o plazo) con señas en curso: las citas existentes conservan sus condiciones congeladas.
- **CB-08** El cliente cambia a "Pagar en línea" (MP) durante el plazo: la cita pasa a `pendiente_pago` y la seña queda anulada sin comprobante.
- **CB-09** El driver S3 falla al subir: 503 "No pudimos guardar tu comprobante, intenta de nuevo"; la hora sigue guardada hasta el plazo.
- **CB-10** El server de Render despierta tras 2 h dormido: `runDeposits` vence todas las atrasadas en la primera vuelta.
- **CB-11** Cliente con inasistencia previa y regla "solo nuevos": no se le pide (la regla es excluyente, no acumulativa).
- **CB-12** Cuenta eliminada: sus comprobantes se borran del almacenamiento y los metadatos quedan anonimizados.

## Criterios de aceptación
- **AC-01 Regla de aplicación.** Con cada modo (todos, nuevos, con inasistencia), un cliente que cumple obtiene `pendiente_sena` con monto, referencia y `expiresAt` correctos (RN-02 a RN-04), y uno que no cumple obtiene `pendiente`. "Pagar en línea" nunca pide seña. Test de server con el reloj inyectado.
- **AC-02 Vencimiento.** Sin comprobante, en `expiresAt` `runDeposits` deja `expirada`/`vencida`, libera los locks (la hora vuelve a la disponibilidad), registra el correo y llama al hook de lista de espera. Con comprobante subido antes, no vence. Test de server.
- **AC-03 Subida segura.** JPEG, PNG y PDF válidos → 201, con el archivo en el driver `fs` (directorio temporal en los tests) y metadatos en la cita, sin binarios en Mongo (se verifica que no hay colección GridFS nueva ni campo `Buffer`). Un .exe renombrado, un archivo de más de 5 MB o un PDF corrupto → 400. Después del plazo → 409. Otro usuario → 404. Test de server.
- **AC-04 Acceso al comprobante.** El dueño de la cita y el super admin → 200 con `nosniff`. El barbero, otro cliente o sin sesión → 403/401. Test de server.
- **AC-05 Revisión.** Confirmar → `confirmada` + correo + auditoría. Rechazar sin motivo → 400. Con motivo → la cita queda `cancelada`, se liberan los locks y se envía el correo. Barbero → 403. Test de server.
- **AC-06 Pagos y rendición.** Una seña confirmada de $5.000 + un cobro en el local de $13.000 aparecen en `billing.list` como dos movimientos y la Rendición del mes suma $18.000 (la seña como transferencia). Una seña vencida o rechazada no aparece. Cancelación por el barbero → `por_devolver` y [Marcar devuelta] → `devuelta`. Test de server (`billing.test.js`).
- **AC-07 Datos bancarios privados.** `GET /api/wstyle/catalog` y el HTML prerenderizado no contienen el RUT ni el N° de cuenta (búsqueda en `vite build` + respuesta de la API). La vista de la cita los incluye solo para su dueño con la seña pendiente. Test de server + build.
- **AC-08 Producción sin S3.** Con `NODE_ENV=production` y `RECEIPTS_STORAGE` distinto de `s3`, encender la seña → 422 con el motivo. Test de server.
- **AC-09 Cliente en el navegador (:5173).** Con un cliente nuevo de seed y la seña encendida (driver `fs`):
  - reservar muestra el aviso y la casilla obligatoria;
  - la página de la cita muestra la cuenta regresiva, la referencia con [Copiar] y los datos bancarios;
  - subir una imagen muestra los chips Hora ✓ · Seña ⏳.

  Capturas a 1440 y 390 px, sin scroll horizontal ni errores de consola.
- **AC-10 Admin en el navegador.** "Pagos por confirmar" muestra el contador, el comprobante y la lista de cotejo. [✓ Confirmar seña] la saca de la lista. En la agenda del barbero la cita muestra "✓ Seña $5.000" y el diálogo de terminar muestra "Resta por cobrar".
- **AC-11 Mercado Pago intacto.** Los tests existentes de `payments.test.js` (retención de 15 min, webhook y conciliación) pasan sin cambios.
- **AC-12 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. `server/uploads/` está en `.gitignore` y no hay secretos commiteados.

## Decisiones confirmadas (por el usuario)
- Mercado Pago se mantiene. Además, Joe puede exigir una seña (monto fijo o %) pagada por transferencia.
- Configurable para todos, solo clientes nuevos o solo clientes con inasistencia previa. Plazo para pagarla de 15, 30 o 60 min.
- El cliente ve los datos bancarios, una referencia corta (WS-XXXX) y una cuenta regresiva, y sube el comprobante (imagen o PDF, con límite de tamaño).
- La cita queda "pendiente de seña". Si vence el plazo sin comprobante, la hora se libera automáticamente.
- Joe ve "Pagos por confirmar" en su panel y confirma o rechaza. Se integra con el registro de pagos de SPEC-37.
- Los comprobantes no van a la BD: disco local en desarrollo y almacenamiento de objetos en producción (Render).

## Asunciones (pendientes de validar)
1. Producción usa **Cloudflare R2** (gratis hasta 10 GB). Cualquier S3 compatible sirve con las mismas variables. Hace falta crear la cuenta de Cloudflare en la cuenta personal, nunca la de trabajo.
2. Basta con **subir** el comprobante a tiempo para guardar la hora. Joe puede revisarlo después.
3. Un solo monto o porcentaje para todos los servicios, sin excepciones por servicio.
4. Las citas creadas por el barbero o el admin no piden seña.
5. Rechazar una seña **cancela** la cita (no da una segunda oportunidad de subir otro comprobante).
6. La seña no se devuelve si el cliente cancela o no llega. Sí se devuelve, a mano, si cancelan el barbero o el local.
7. La boleta (SPEC-37) se emite por el total de la venta al terminar, no por la seña aparte. **Validar con un contador.**
8. Límite de 5 MB por comprobante (SillaLibre usa 8 MB). Las imágenes se re-codifican a WebP de 1600 px.
9. Se aceptan fotos HEIC/HEIF de iPhone y se convierten. Si `sharp` del server no trae soporte HEIC, se pide JPG o PDF con un mensaje claro.
10. Los comprobantes se borran 12 meses después de la cita.
11. Solo el super admin revisa las señas; los barberos ven el estado, no el comprobante.
12. Porcentaje calculado sobre servicio + domicilio, sin la tarifa de servicio de SPEC-38, redondeado hacia arriba a $100, con un mínimo de $1.000.
