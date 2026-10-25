# SPEC-37 — WS Style: pagos en el panel del super admin y respaldo tributario (voucher MP gratis; emisión SII vía API en fase 2)

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

## Proveedor: el más fácil para empezar y gratis (pedido del usuario 2026-10-25)
Pedido: "busca el proveedor que sea más fácil para empezar y que sea gratis, cobrando por comisión, la más baja".

| Opción | Costo | Facilidad | Qué cubre |
|---|---|---|---|
| **A. Modelo voucher con Mercado Pago (recomendada para empezar)** | **$0 extra**: solo la comisión de MP que ya se paga por cobrar (SPEC-35) | La más fácil: no hay proveedor, certificado ni folios. Basta con declarar en el SII el modelo "No emito boleta cuando recibo un pago electrónico" | Todos los pagos online con MP: el comprobante de MP **es** la boleta y MP lo informa al SII |
| B. Sistema gratuito del SII (app/portal de boletas) | $0 | Manual, sin API | Solo para la excepción "pagar en el local": el barbero emite la boleta desde la app del SII y el sistema solo registra el número |
| C. LibreDTE Comunidad (open source) | $0 de licencia, pero hay que alojarlo, certificarse y mantenerlo | Difícil | Emisión propia con API (boleta, factura, nota de crédito) |
| D. LibreDTE Plus / OpenFactura (Haulmer) / SimpleFactura / Bsale | Suscripción mensual, no por comisión (precios no publicados en lo revisado; LibreDTE ofrece 10 días de prueba gratis) | Media: API lista, piden certificado digital y habilitación en el SII | Emisión propia con API |
| E. Servicio de boletas de Mercado Pago | 6 meses gratis | Atado al dispositivo **Point Smart** (venta presencial), no sirve para pagos web | No aplica |

**Decisión para la fase 1:** opción **A** para los pagos web y **B** para los pagos en el local. No existe un proveedor de facturación que cobre por comisión: la única "comisión" del esquema es la de Mercado Pago, y no hay costo extra. La emisión propia vía API (opciones C/D) queda como **fase 2**, solo si aparecen clientes que pidan factura o si el volumen de pagos en el local lo justifica. Fuentes: [Mercado Pago · boletas](https://www.mercadopago.cl/mp/boletas-electronicas), [LibreDTE · precios y términos](https://www.libredte.cl/faq/activacion-precios-y-terminos.pdf?full=1), [LibreDTE · API](https://www.libredte.cl/academy/integration/guide/integration-guide), [OpenFactura (Haulmer)](https://workspace.google.com/marketplace/app/openfactura/228901650785).

**Emisor:** la barbería **no tiene RUT**. Funcionará como **persona natural**, con el RUT personal del dueño y su inicio de actividades en primera categoría, que es requisito para emitir boletas ([Nubox · requisitos](https://blog.nubox.com/empresas/requisitos-para-emitir-boleta-electronica)). **El trámite del RUT queda pendiente para después** (decisión del usuario). Mientras tanto todo funciona en sandbox o en modo prueba, con datos ficticios y el emisor configurable por variables de entorno.

## Historia
Como **super admin de WS Style** quiero **ver todos los pagos de las citas en mi panel, saber con qué comprobante tributario queda respaldado cada uno y tener un resumen mensual listo para declarar**, para **controlar la caja y cumplir con el SII sin costo extra ni trabajo manual innecesario**.

## Alcance
**Fase 1 (esta spec, se implementa ahora)**
1. **Pagos en el panel del super admin** (SPEC-34): lista con filtros, detalle y totales. Incluye pagos con Mercado Pago (aprobados, pendientes, rechazados, reembolsados) y pagos "en el local" que el barbero o el admin marcan como cobrados.
2. **Respaldo tributario por pago** (opción A + B):
   - Pago web aprobado con MP → respaldo **"voucher MP"** (sin emisión propia ni proveedor).
   - Pago en el local → al marcarlo como cobrado se pide el **N° de boleta** emitida en la app o el portal gratuito del SII (opcional mientras no haya RUT). Si falta, queda en la lista "sin boleta".
   - Reembolso de un pago MP → lo maneja MP y queda registrado como reembolso en el panel.
3. **Rendición mensual**: reporte con ventas por tipo de respaldo (voucher MP / boleta SII manual), total, neto e IVA estimados, reembolsos y comisiones de MP, conciliado contra los pagos. Exportable a CSV, sirve para revisar el F29. Avisa de los pagos sin respaldo.
4. **Configuración del emisor** en el server (variables de entorno): nombre y RUT de la persona natural, modelo de emisión declarado. Mientras no haya RUT: "Emisor pendiente" visible en el panel y todo en sandbox.
5. **Interfaz `TaxDocumentProvider`** con una implementación "voucher" (sin emisión) y otra "manual", para enchufar un proveedor con API en la fase 2 sin rehacer el panel.

**Fase 2 (fuera de esta spec, se activa después)**
- Trámite del RUT e inicio de actividades del dueño como persona natural.
- Emisión propia vía API (LibreDTE / OpenFactura / SimpleFactura / Bsale): boleta 39, factura 33 a pedido, nota de crédito 61, cola de reintentos y PDF al cliente.

**Fuera**
- Presentar el F29 automáticamente.
- Contabilidad completa (compras, remuneraciones).
- Boletas de honorarios de los barberos.
- El modelo marketplace (Res. 51/2024), que queda para Styluxe.

## Reglas de negocio
1. El **superadmin** ve todos los pagos y la rendición. El **barbero** ve solo los pagos de sus citas, sin la rendición. El **cliente** ve solo los suyos ("Mis citas"). El resto recibe 403.
2. Montos en CLP enteros. Los precios de la carta **incluyen IVA** (19 %): neto = round(total / 1,19) e IVA = total − neto. Se muestran como "estimados" mientras el emisor esté pendiente.
3. Cada pago aprobado tiene **un solo** respaldo: voucher MP o boleta SII manual. Nunca se marca una boleta propia sobre un pago MP (evita la doble emisión).
4. El recargo por domicilio se suma al monto afecto y en el detalle va en una línea aparte.
5. El panel muestra fija la advertencia: "El modelo voucher solo es válido si en el SII declaraste 'No emito boleta cuando recibo un pago electrónico'. Validar con contador."
6. Los datos sensibles (tokens de MP, RUT real) solo van en el server, por variables de entorno. Nunca en el cliente, el repo ni los logs.
7. Cuadre de la rendición: pagos aprobados − reembolsos = vouchers MP + boletas manuales + "sin respaldo". Se lista cada diferencia.

## Flujo principal
1. El cliente paga (SPEC-35). El webhook de MP marca el pago `approved` y se registra el respaldo "voucher MP" con el id de la transacción.
2. Pago en el local: el barbero o el admin marca la cita "cobrada", con el método (efectivo/transferencia) y el N° de boleta SII (opcional).
3. **Panel → Pagos**: columnas fecha, cliente, barbero, servicio, método, monto, estado y respaldo. Filtros por fecha, barbero, método, estado y "sin respaldo". Totales del período arriba.
4. Detalle: id MP, estado, monto, comisión MP, neto recibido, respaldo; acción "registrar N° de boleta" para los pagos en el local.
5. **Panel → Rendición → mes**: resumen, cuadre, diferencias y exportación CSV.

## Casos borde
- Pago pendiente o rechazado: sin respaldo y no suma a las ventas.
- Contracargo o reembolso en MP: el webhook lo refleja y la rendición lo descuenta.
- Webhook duplicado: idempotente, un solo registro.
- Pago en el local nunca marcado: la cita aparece en "por cobrar".
- Emisor pendiente (sin RUT): el panel funciona, con el aviso "Emisor pendiente".
- Cambio del modelo de emisión a mitad de mes: rige desde ese momento y la rendición muestra ambos tramos.

## Criterios de aceptación
- **AC-01** El super admin ve "Pagos" con la lista, los filtros (fecha, barbero, método, estado, sin respaldo) y los totales. Un barbero solo ve los suyos. Cliente y visitante → 403 en la API (tests).
- **AC-02** Un pago MP sandbox aprobado aparece con id MP, monto, comisión, neto recibido y respaldo "voucher MP". Un webhook repetido no lo duplica (test).
- **AC-03** Un pago en el local marcado como cobrado aparece con su método; con N° de boleta queda "boleta SII", sin él queda en "sin respaldo".
- **AC-04** No se puede asignar un N° de boleta a un pago con voucher MP (regla 3, test).
- **AC-05** El cálculo neto/IVA cumple la regla 2 con los montos de la carta y con recargo por domicilio (tests, diferencia ≤ $1).
- **AC-06** La rendición de un mes sembrado muestra totales por respaldo, neto, IVA, reembolsos, comisiones MP y el cuadre de la regla 7, y exporta CSV (test).
- **AC-07** Sin RUT configurado, el panel muestra "Emisor pendiente" y no rompe ninguna vista.
- **AC-08** La advertencia de la regla 5 se ve en Pagos y en Rendición.
- **AC-09** El token de MP y el RUT no aparecen en `client/dist`, el repo ni los logs de test (grep).
- **AC-10** Existe la interfaz `TaxDocumentProvider` con las implementaciones `voucher` y `manual`, y un test que cambia la implementación por configuración.
- **AC-11** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` y `cd server && npm test` en verde.

## Decisiones confirmadas
- El super admin ve los pagos en su panel.
- La barbería **no tiene RUT**: operará como **persona natural**. **El tema del RUT queda pendiente para después**; el resto se termina ahora.
- Proveedor: el más fácil y gratis. Fase 1 = **modelo voucher de Mercado Pago** (sin costo extra; la única comisión es la de MP) + **SII gratuito manual** para los pagos en el local. La emisión vía API pasa a la fase 2.
- El F29 no se presenta solo: el sistema entrega el resumen conciliado.

## Asunciones pendientes de validar
1. No se encontró ningún proveedor de boletas que cobre por comisión. El esquema voucher MP es el único sin costo fijo; se acepta como "el proveedor" de la fase 1.
2. La mayoría de los pagos serán online con MP. "Pagar en el local" es la excepción y su boleta se emite a mano en la app del SII.
3. Los precios de la carta incluyen IVA (persona natural en primera categoría, afecta a IVA). Validar con un contador el régimen (p.ej. Pro Pyme transparente).
4. El barbero ve solo los pagos de sus citas, sin totales del local.
5. Los reembolsos se hacen desde Mercado Pago y el panel solo los refleja (botón de reembolso: fase 2).
6. Factura a empresas: fase 2. Mientras tanto, si una empresa la pide, se atiende a mano.
7. Los registros de pagos se conservan 6 años.
