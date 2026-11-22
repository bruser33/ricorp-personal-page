# SPEC-37 — WS Style: el super admin ve los pagos, y boletas o facturas electrónicas del SII automáticas

> Pedido del usuario (2026-10-25): "también en el panel administrativo super admin debería poder verse los pagos que se hacen, y también investiga en impuestos internos para poder crear facturas sobre eso y rendirlas de forma automática".
> Modo autónomo: lo no confirmado queda en "Asunciones pendientes de validar". Depende de **SPEC-34** (panel del super admin) y **SPEC-35** (pagos con Mercado Pago).

## Investigación SII (resumen, 2026-10-25; **validar con un contador antes de producción**)
- **Qué documento corresponde.** WS Style es una barbería que vende servicios a personas, así que el documento normal es la **boleta electrónica** (DTE tipo 39 afecta / 41 exenta). La **factura electrónica** (tipo 33) solo corresponde si el cliente es una empresa y la pide con RUT y giro. Si una boleta se emitió por error, se anula con una **nota de crédito electrónica** (tipo 61).
- **El voucher puede valer como boleta** (Res. SII N° 176/2020, vigente desde 2021). Si el contribuyente declara ante el SII el modelo *"No emito boleta cuando recibo un pago electrónico"*, el comprobante de Mercado Pago **es** la boleta, y Mercado Pago lo informa al SII. Si declara *"Siempre emito boleta"*, debe emitir su propia boleta electrónica. Emitir las dos para la misma venta es un error que se corrige con nota de crédito. Fuentes: [SII · voucher como boleta](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html), [Mercado Pago · boletas](https://www.mercadopago.cl/mp/boletas-electronicas), [SII noticia 2021](https://www.sii.cl/noticias/2021/050121noti01er.htm).
- **Pagos en el local** (efectivo, o transferencia sin voucher) no generan voucher: requieren boleta electrónica propia.
- **Emisión automática.** Para emitir por cuenta propia hacen falta un **certificado digital** del representante, folios autorizados (**CAF**) del SII, un XML del DTE firmado y el envío al SII. Las **boletas** usan servicios **REST** propios, con token propio, hasta 500 boletas por envío y diagnóstico por *track id*. Las **facturas** usan SOAP. El formato vigente de la boleta es la v4.2 (sept. 2025). Fuentes: [Instructivo emisión boleta electrónica](https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf), [Formato boleta electrónica](https://www.sii.cl/factura_electronica/factura_mercado/formato_boleta_electronica.pdf). Antes de producción hay que pasar la **certificación** en el ambiente de pruebas del SII (*maullin*). El sistema gratuito del SII (Portal MiPyme) **no tiene API**. Para automatizar, la alternativa realista es un **proveedor con API** (p.ej. LibreDTE, OpenFactura/Haulmer, SimpleFactura, Bsale) o certificarse directamente.
- **"Rendir" (declarar).** Con documentos electrónicos, el SII arma el **Registro de Compras y Ventas (RCV)** y propone el **F29** mensual (IVA). Lo automatizable es que cada venta quede documentada e informada al SII y que el sistema entregue un **resumen mensual conciliado** (ventas, IVA débito, notas de crédito) para revisar y presentar el F29. **Presentar el F29 por la persona no se automatiza** porque requiere la clave tributaria del contribuyente y su revisión.
- **Plataformas que cobran comisión** (Res. SII N° 51/2024): emiten una boleta diaria que resume las comisiones cobradas a personas naturales. **No aplica hoy** porque WS Style es una sola barbería. Sí aplicaría a un futuro Styluxe (modelo "Uber de barberos"); queda solo como consideración. Fuente: [Res. SII 51/2024](https://www.sii.cl/normativa_legislacion/resoluciones/2024/reso51.pdf).
- Desde 2025 es obligatorio entregar el comprobante (boleta o voucher) al cliente ([SII noticia 27-02-2025](https://www.sii.cl/noticias/2025/270225noti01aav.htm)). En la web, eso equivale a enviarlo por correo y dejarlo en "Mis citas".

## Historia
Como **super admin de WS Style** quiero **ver todos los pagos de las citas en mi panel y que cada pago quede respaldado por su boleta (o factura) electrónica sin trabajo manual, con un resumen mensual listo para declarar**, para **controlar la caja y cumplir con el SII sin digitar documentos uno por uno**.

## Alcance
**Incluye**
1. **Pagos en el panel del super admin** (SPEC-34): lista de pagos con filtros, detalle y totales. Muestra pagos con Mercado Pago (aprobados, pendientes, rechazados, reembolsados) y pagos "en el local" que el barbero o el admin marcan como cobrados.
2. **Documento tributario por pago**, según el modelo de emisión configurado:
   - *Modo voucher* (por defecto): un pago aprobado con Mercado Pago queda respaldado por el voucher, sin emisión propia. Un pago en el local genera boleta electrónica.
   - *Modo emito siempre*: cada pago aprobado genera una boleta electrónica (tipo 39).
   - Si el cliente la pide (RUT, razón social, giro, dirección) → **factura electrónica** (tipo 33) en lugar de la boleta.
   - Un reembolso o cancelación de un pago ya documentado genera una **nota de crédito electrónica** (tipo 61).
3. **Integración con un proveedor de documentos electrónicos con API** detrás de una interfaz propia, para poder cambiar de proveedor o certificarse directo más adelante. Primero se trabaja en **ambiente de certificación/pruebas**.
4. Envío del PDF del documento al cliente por correo y descarga desde "Mis citas" y desde el panel.
5. **Rendición mensual**: reporte por mes con ventas por tipo de documento, neto, IVA débito y notas de crédito, conciliado contra los pagos. Exportable a CSV/PDF para el F29. Incluye alertas de pagos sin documento.
6. **Reintentos y cola**: si el proveedor o el SII fallan, el pago queda "documento pendiente" y se reintenta solo. El admin ve el estado y puede reintentar a mano.

**Fuera**
- Presentar el F29 automáticamente en el SII.
- Contabilidad completa (compras, remuneraciones, honorarios de barberos).
- Boleta de honorarios de los barberos.
- El modelo marketplace de comisiones (Res. 51/2024), que queda para Styluxe.
- Facturas a la propia ricorp.
- Emisión en producción sin la certificación aprobada.

## Reglas de negocio
1. Solo el rol **superadmin** ve todos los pagos y la rendición. El **barbero** ve solo los pagos de sus citas, sin la rendición. El **cliente** ve solo los suyos.
2. Montos en CLP enteros. Los precios de la carta **incluyen IVA** (19 %), así que neto = round(total / 1,19) e IVA = total − neto.
3. Cada pago aprobado tiene **exactamente un** respaldo: voucher MP, boleta o factura. Nunca dos documentos para el mismo pago (regla anti doble emisión).
4. El recargo por domicilio es parte del monto afecto y va en una línea propia del documento.
5. La factura solo se emite si el RUT es válido (dígito verificador) y vienen razón social, giro y dirección. Si falta algo, se emite boleta y se avisa.
6. El reembolso de un pago documentado genera nota de crédito por el monto reembolsado (total o parcial), referenciando el documento original.
7. El "modelo de emisión" (voucher / emito siempre) es una configuración del super admin y debe coincidir con lo declarado en el SII. El panel muestra una advertencia explícita sobre esto.
8. Credenciales del proveedor, certificado y CAF solo en variables de entorno o almacenamiento seguro del server. Nunca en el cliente, en el repo ni en logs.
9. La rendición mensual se cierra con un "cuadre": suma de pagos aprobados − reembolsos = suma de documentos − notas de crédito (más vouchers). Toda diferencia se lista.
10. Folios: si se emite directo y no a través de un proveedor, se alerta cuando quedan < 20 % de los folios del CAF.

## Flujo principal
1. El cliente paga (SPEC-35). El webhook de Mercado Pago marca el pago `approved`.
2. Según el modo: se registra el respaldo voucher, o se encola la emisión de boleta/factura.
3. El worker emite con el proveedor, guarda folio, tipo, track id, estado SII y PDF, y envía el PDF por correo al cliente.
4. El super admin entra a **Panel → Pagos**: lista (fecha, cliente, barbero, servicio, método, monto, estado del pago, documento y su estado). Filtros por fecha, barbero, método, estado y "sin documento". Totales del período arriba.
5. Detalle del pago: datos de MP (id, estado, comisión MP, neto recibido), documento (descargar PDF/XML) y acciones (reintentar emisión, emitir nota de crédito al reembolsar).
6. **Panel → Rendición → mes**: resumen conciliado, diferencias y exportación.

## Casos borde
- Pago pendiente o rechazado: no genera documento.
- Pago que pasa de aprobado a reembolsado (contracargo): nota de crédito automática y alerta.
- Webhook duplicado: idempotencia, un solo documento.
- Proveedor o SII caído: documento pendiente con reintentos (backoff); alerta si sigue pendiente después de 24 h.
- SII rechaza el documento: estado "rechazado" con el motivo, visible y reintentable tras corregirlo.
- Pago en el local que nadie marca como cobrado: la cita se completa sin pago y aparece en "por cobrar".
- Cambio del modo de emisión a mitad de mes: rige desde ese momento y la rendición muestra ambos tramos.
- Cliente sin email: el documento queda disponible en el panel y en "Mis citas".

## Criterios de aceptación
- **AC-01** El super admin ve "Pagos" con la lista, los filtros (fecha, barbero, método, estado, sin documento) y los totales del período. Un barbero solo ve los suyos. Un cliente o un visitante recibe 403 en la API.
- **AC-02** El detalle de un pago MP sandbox aprobado muestra el id MP, el estado, el monto, la comisión y su documento o voucher.
- **AC-03** En *modo voucher*, un pago MP aprobado queda "respaldado por voucher" y **no** se llama al proveedor (test). Un pago en el local marcado como cobrado genera una boleta en ambiente de pruebas.
- **AC-04** En *modo emito siempre*, un pago aprobado genera exactamente una boleta tipo 39 en el ambiente de pruebas del proveedor/SII, con folio, PDF y estado guardados. Un webhook repetido no genera una segunda (test).
- **AC-05** Con datos de empresa válidos se emite una factura tipo 33. Con un RUT inválido se emite boleta y se muestra el aviso (tests de validación de RUT).
- **AC-06** Un reembolso total o parcial genera una nota de crédito tipo 61 que referencia el documento original, por el monto exacto.
- **AC-07** El cálculo neto/IVA cumple la regla 2 (tests con montos de la carta y con recargo por domicilio). Ninguna diferencia supera $1 por documento.
- **AC-08** Si el proveedor falla, el pago queda "documento pendiente" y el reintento automático lo emite al recuperarse. El botón "Reintentar" funciona (test con proveedor simulado; **el proveedor es un servicio externo, no la BD**).
- **AC-09** La rendición del mes muestra ventas por tipo, neto, IVA y notas de crédito, junto con el cuadre de la regla 9. Exporta CSV y lista las diferencias (test con un mes sembrado).
- **AC-10** El cliente recibe el PDF por correo y lo puede descargar desde "Mis citas".
- **AC-11** No aparecen credenciales, certificados ni CAF en el bundle del cliente, el repo ni los logs (grep en `client/dist` y en los logs de test).
- **AC-12** El panel muestra la advertencia de que el modo de emisión debe coincidir con lo declarado en el SII y la nota "validar con contador".
- **AC-13** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` y `cd server && npm test` en verde.

## Decisiones confirmadas
- El super admin ve los pagos en su panel (pedido explícito).
- Se investiga el SII y se automatizan la emisión y el reporte para declarar. La presentación del F29 queda manual porque requiere la clave del contribuyente.

## Asunciones pendientes de validar
1. **Modo por defecto = voucher** (el comprobante de Mercado Pago vale como boleta). Solo se emite boleta propia para los pagos en el local y factura cuando la piden.
2. Se usa un **proveedor con API** (a elegir: LibreDTE, OpenFactura/Haulmer, SimpleFactura o Bsale) en lugar de certificarse directo con el SII. La elección depende del costo mensual.
3. El emisor es **la barbería WS Style** (su RUT). Hoy no hay RUT real, así que todo corre en ambiente de pruebas con datos ficticios hasta tenerlo.
4. Los precios de la carta incluyen IVA. La barbería está afecta a IVA y no es exenta.
5. "Rendir automáticamente" = documentos informados al SII + reporte mensual conciliado listo para el F29, no la presentación del F29.
6. El barbero ve los pagos de sus citas, pero no los montos totales del local ni la rendición.
7. La factura se pide en el paso de pago con un check "Necesito factura".
8. Los reembolsos los inicia el super admin desde el panel (también reembolsan en MP sandbox).
9. Se conservan los documentos y PDFs 6 años (plazo tributario general), en almacenamiento del server.
