# SPEC-53 — WS Style: confirmación y recordatorios por WhatsApp

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "software de corte", con SillaLibre (sillalibre.com) como referencia. El usuario eligió las funciones a integrar. Se toman las ideas (catálogo de SillaLibre §9, "WhatsApp: confirmaciones y recordatorios"), no la marca ni el diseño: WS Style mantiene su dirección de arte "Noir de oficio".
> Modo autónomo: los detalles menores quedan como **Asunciones pendientes de validar** al final.

## Estado actual
- Los avisos al cliente salen **solo por correo** (`server/src/lib/emails.js` + `lib/mailer.js`, con modo dry-run). Cada envío queda en `Notification` (`channel: 'email'`, `status: sent | dry-run | failed`).
- WhatsApp existe solo como enlaces `wa.me` armados a mano: la invitación del barbero (`inviteLinks`, `domain/agenda.js`) y el contacto del local (`Business.contact.whatsapp`). No hay envío automático ni recordatorios.
- La reserva web exige sesión. El cliente tiene `User.phoneE164` (si no lo tiene, la reserva lo pide: "Para avisarte si cambia algo").
- Una reserva web queda `pendiente` hasta que el barbero confirma (`confirmWithinMinutes`). Las del super admin nacen `confirmada`. Las invitaciones del barbero pasan a `confirmada` cuando el cliente acepta.
- La página de la cita (`/wstyle/cita/?id=<id>`) exige sesión. Solo la invitación tiene un token propio (`inv`). El cliente puede cancelar hasta `cancelUntilMinutes` (180 min) antes.
- Hay un intervalo en proceso cada 60 s (`server/src/index.js`) que corre `runExpirations` y `runHolds`. Render free **se duerme** tras ~15 min sin tráfico y ese intervalo deja de correr.
- Los secretos viven solo en `server/.env` y en Render como `sync: false` (patrón de Mercado Pago y Google).

## Historia
Como **cliente de WS Style** quiero **recibir por WhatsApp la confirmación de mi hora y un recordatorio antes**, con un link para verla o cancelarla, para **no olvidarme y avisar a tiempo si no puedo ir**.
Como **dueño (super admin)** quiero **elegir cuándo sale el recordatorio y ver qué mensajes están por salir, cuáles salieron y cuáles fallaron**, para **bajar las ausencias sin depender de escribir a mano**.

## Decisión técnica: API oficial (Meta WhatsApp Cloud API)
- Se usa la **WhatsApp Business Platform – Cloud API** de Meta con **plantillas aprobadas** (categoría *Utility*).
- **No** se vincula el número personal ni se usan librerías no oficiales tipo WhatsApp Web (Baileys, whatsapp-web.js): violan los términos de WhatsApp y el número puede quedar bloqueado.
- La cuenta de Meta (Business Manager + WABA + app) es **de Joe/WS Style o personal de bruser33**. Nunca una cuenta de trabajo ni de ordename.
- El número emisor es un número dedicado de WS Style registrado en la Cloud API. Un número registrado en la Cloud API **deja de funcionar en la app de WhatsApp** del celular, salvo que se use la "coexistencia" de Meta con la app **WhatsApp Business** (validar disponibilidad en Chile). Ver asunción 2.

## Alcance
**Incluye**
1. **Canal WhatsApp en el server** (`lib/whatsapp.js`): envía plantillas por la Graph API (`POST /{phone-number-id}/messages`), valida la firma del webhook y entiende los códigos de error de Meta. Tiene inyección de `fetchImpl`, igual que `lib/mercadopago.js`, para testear sin red.
2. **Variables de entorno** (en `server/.env.example`, documentadas paso a paso como las de MP/Google; en `render.yaml` los secretos van como `sync: false`). Ningún secreto se commitea ni se lee o escribe desde el panel:
   - `WHATSAPP_TOKEN`: token **permanente** de un *System User* de la WABA (secreto).
   - `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_BUSINESS_ACCOUNT_ID`.
   - `WHATSAPP_APP_SECRET`: valida `X-Hub-Signature-256` del webhook (secreto).
   - `WHATSAPP_VERIFY_TOKEN`: el *challenge* de alta del webhook (secreto).
   - `WHATSAPP_API_VERSION` (default fijo en el código, p. ej. `v23.0`).
   - `WHATSAPP_TEMPLATE_LANG` (default `es`).
   - `WHATSAPP_DRY_RUN=1`: fuerza el modo sin envío.
3. **Plantillas** (se crean en el WhatsApp Manager de Meta y deben quedar *Approved*; los nombres y las variables quedan fijos en el código). Texto propuesto, con tuteo chileno (sin voseo):
   - `ws_cita_confirmada`: "Hola {{1}}, tu hora en WS Style quedó confirmada: {{2}} con {{3}}, el {{4}} a las {{5}}. Si no puedes venir, avísanos desde el link para dárselo a otra persona." Botón URL dinámico **[Ver o cancelar mi cita]** → `https://ricorp.cl/wstyle/cita/?{{1}}`.
   - `ws_cita_recordatorio`: "Hola {{1}}, te recordamos tu hora en WS Style: {{2}} con {{3}}, {{4}} a las {{5}}. ¿No alcanzas a llegar? Cancela desde el link y liberamos la hora." Mismo botón.
   - Pie común: "Este número solo envía avisos. Para hablar con nosotros escribe al {{wa.me del local}}". El texto exacto queda sujeto a la aprobación de Meta.
   - SPEC-54 y SPEC-56 agregan sus plantillas (`ws_lista_espera_cupo`, `ws_sena_por_vencer`) sobre este mismo canal.
4. **Opt-in del cliente**:
   - Al confirmar la reserva (paso "Revisar", `BookingPage.tsx`) aparece la casilla "Quiero recibir la confirmación y el recordatorio por WhatsApp al +56 9 …".
   - Se guarda en el usuario: aceptado o rechazado, fecha, teléfono y origen. La próxima reserva muestra la casilla con lo último que eligió.
   - "Mi cuenta" permite desactivarlo.
   - Sin opt-in, o sin teléfono móvil válido, no se programa ningún WhatsApp para ese cliente; el correo sigue igual.
   - Las citas que crea el super admin o el barbero (invitación) usan el opt-in que el cliente ya tenga guardado. Si no tiene, no se envía.
5. **Cola de envíos** (colección nueva, p. ej. `OutboundMessage`):
   - Cada mensaje guarda tipo (confirmación o recordatorio), cita, teléfono, plantilla y parámetros, `sendAt`, estado, intentos, último error, id de mensaje de Meta y marcas de tiempo (enviado, entregado, leído).
   - Estados visibles: **Por salir**, **Enviando**, **Enviado**, **Entregado**, **Leído**, **No salió** (fallido), **Frenado** (cancelado por Joe), **Ya no aplica** (cita cancelada o movida, o recordatorio vencido) y **Simulado** (dry-run).
   - Un índice único por (cita, tipo, `startsAt` de la cita) evita duplicados.
6. **Programación automática** (hooks en las transiciones de `domain/agenda.js` y `domain/pro.js`):
   - Cuando una cita llega a `confirmada` (por el barbero, por invitación aceptada o por creación del admin), se encola la **confirmación** con `sendAt = ahora` y el **recordatorio** según la configuración.
   - Si la cita se **mueve** (propuesta aceptada, reprogramación o reasignación), el recordatorio pendiente pasa a "Ya no aplica" y se programa uno nuevo para la nueva hora. La confirmación no se repite (asunción 6).
   - Si la cita se **cancela**, expira o termina en `no_asistio`, sus mensajes pendientes pasan a "Ya no aplica".
7. **Despachador (scheduler)**:
   - Corre en el intervalo de 60 s que ya existe.
   - Toma los mensajes vencidos de forma atómica (`findOneAndUpdate` Por salir → Enviando, con *lease* de 2 min para recuperar los que quedaron colgados si el proceso muere).
   - Envía hasta 20 por vuelta.
   - **Reintentos**: errores transitorios (red, 5xx, 429 o *rate limit* de Meta) se reintentan con espera de 1, 5 y 15 min (máx. 3 intentos) y luego quedan "No salió". Errores permanentes (número sin WhatsApp, plantilla no aprobada o pausada, número inválido, token inválido) quedan "No salió" sin reintento, con el motivo en español.
   - **Al despertar** (Render free): si un recordatorio se atrasó, sale solo si faltan ≥ 60 min para la cita; si no, queda "Ya no aplica · llegó tarde".
   - **Horario de silencio** 22:00–08:00 (hora de Chile): los recordatorios que caen ahí se adelantan a las 21:00 del día anterior o se atrasan a las 08:00, lo que quede más cerca sin pasar de la cita − 60 min. La confirmación sale en el momento, a cualquier hora, porque es respuesta a una acción del cliente o del barbero.
8. **Webhook** `GET/POST /api/whatsapp/webhook`:
   - El GET responde el *challenge* con `WHATSAPP_VERIFY_TOKEN`.
   - El POST valida la firma (si es inválida → 401 y no se procesa) y actualiza los estados (`sent`, `delivered`, `read`, `failed`) por id de mensaje, de forma idempotente.
   - Un mensaje **entrante** del cliente: si dice "BAJA", "STOP" o "NO" (sin importar mayúsculas ni tildes), se desactiva su opt-in. Cualquier otro texto genera una notificación en la bandeja del super admin ("Fulano respondió por WhatsApp: …") y una respuesta automática gratuita, dentro de la ventana de 24 h: "Este número solo envía avisos. Escríbenos al <wa.me del local>".
9. **Link para ver o cancelar sin sesión**:
   - El botón de la plantilla lleva `id=<id>&t=<token>`. El token es aleatorio por cita, se guarda hasheado y sirve hasta el fin de la cita.
   - Con ese token, `/wstyle/cita/` muestra la cita y deja **solo cancelar** (con las mismas reglas de `cancelUntilMinutes` y motivos). Cualquier otra acción pide sesión.
   - Un token inválido o vencido lleva al login normal.
10. **Configuración (panel super admin → Configuración → "WhatsApp")**:
    - Estado del canal, sin mostrar secretos: "Conectado · número +56 9 …", "Modo simulación (sin credenciales)" o "Credenciales incompletas: falta X".
    - Interruptor "Confirmar cuando la cita queda confirmada" (por defecto encendido).
    - "Recordarle antes de su hora", con chips de selección única: **[2 horas antes] [4 horas antes] [El día anterior] [Dos días antes] [No mandar]**. Por defecto: El día anterior.
    - Vista previa con burbujas de los dos mensajes, con datos de ejemplo.
    - Los cambios quedan en la auditoría (`AuditLog`). Cambiar la anticipación **re-programa** los recordatorios "Por salir" de citas futuras.
11. **Panel super admin → sección nueva "Mensajes"** (`/wstyle/admin/mensajes/`, en `SECTIONS`):
    - KPIs: Por salir · Entregados en 7 días · No salieron en 7 días · Próximo envío (fecha y hora).
    - Lista "Uno por uno": tipo (CONFIRMACIÓN o RECORDATORIO), cliente, servicio, barbero, hora de la cita, "Sale el …" o "Salió el …", estado y motivo si falló. Tiene filtros por estado y tipo y búsqueda por cliente o teléfono.
    - Acción **[No mandarlo]** en los "Por salir": pasa a "Frenado" y queda en la auditoría. **[Reintentar]** en los "No salió" con error transitorio y cita aún futura.
    - Vista de detalle con el texto final renderizado tal como lo verá el cliente.
12. **Modo sin credenciales (local y tests)**:
    - Sin `WHATSAPP_TOKEN` o `WHATSAPP_PHONE_NUMBER_ID`, o con `WHATSAPP_DRY_RUN=1`, todo funciona igual (opt-in, cola, scheduler, panel), pero el envío **no llama a Meta**: el mensaje queda "Simulado", con el texto renderizado y una línea de log `[wa] dry-run → +569… · ws_cita_recordatorio`.
    - Los tests usan un `fetch` falso (como `test/mp-fake.js`) y **nunca** llaman a `graph.facebook.com`.
13. **Legal**: la política de privacidad (`/wstyle/privacidad/`) suma que el teléfono se usa para avisos por WhatsApp (Meta como encargado del envío) y cómo darse de baja.

**Fuera**
- Vincular un número personal o usar WhatsApp Web no oficial.
- Promociones o mensajes de marketing ("te extrañamos", gift cards); la reseña en Google por WhatsApp.
- Bandeja de chat bidireccional en el panel (solo se reenvía el aviso de respuesta y se contesta automáticamente).
- WhatsApp a los barberos (siguen con correo y la bandeja del panel).
- Cambiar los correos existentes: **el correo sigue igual**.
- Push del navegador o PWA.

## Reglas de negocio
- **RN-01 Canal opcional.** WhatsApp se suma al correo, nunca lo reemplaza. Si el canal falla o no está configurado, la reserva funciona igual.
- **RN-02 Opt-in explícito.** Solo se envía a clientes con opt-in vigente y teléfono móvil chileno válido (`clMobile`). Darse de baja (desde la cuenta o con "BAJA") detiene todos los mensajes "Por salir" de ese cliente.
- **RN-03 Qué dispara la confirmación.** Llegar a `confirmada`. Una cita `pendiente` que expira sin confirmar no envía WhatsApp; el correo "Tu reserva expiró" sigue igual.
- **RN-04 Recordatorio.** Uno por cita, según la anticipación configurada al momento de programarlo:
  - 2 h y 4 h se cuentan desde la hora de la cita;
  - "El día anterior" sale a las 18:00 del día anterior;
  - "Dos días antes" sale a las 18:00 de dos días antes.

  Si ese momento ya pasó cuando la cita se confirma, o cae a menos de 30 min de la confirmación, no se programa recordatorio.
- **RN-05 Coherencia con la cita.** Antes de enviar, el despachador relee la cita: si ya no está `confirmada`, o su hora cambió, el mensaje pasa a "Ya no aplica". Nunca sale un recordatorio de una cita cancelada.
- **RN-06 Sin duplicados.** Como máximo una confirmación y un recordatorio por cita y hora. Un reintento reusa el mismo registro.
- **RN-07 Datos mínimos.** El mensaje lleva nombre de pila, servicio, barbero, fecha y hora. Nunca el email, el precio ni datos de pago. Los logs muestran el teléfono enmascarado (`+569****5678`).
- **RN-08 Permisos.** La sección "Mensajes" y la configuración de WhatsApp son solo del super admin (`client` y `barber` → 403). Se agregan a la matriz de autorización de SPEC-34.
- **RN-09 Costo.** Meta cobra las plantillas enviadas. Desde jul-2025 el cobro es **por mensaje entregado** y ya no por conversación de 24 h. Las plantillas *Utility* que se envían dentro de una ventana de atención abierta son gratis. **Valor de referencia a validar con el usuario**: plantilla *Utility* en Chile ≈ US$0,02 por mensaje, según la tabla de tarifas de Meta. Con ~2 mensajes por cita y 400 citas al mes son ≈ US$16 al mes. El panel "Mensajes" muestra el conteo mensual de enviados para estimar el gasto.

## Flujo principal
1. Pedro reserva en `/wstyle/reservar/`, deja marcada la casilla de WhatsApp y confirma. La cita queda `pendiente`; el correo de siempre sale.
2. El barbero confirma, la cita pasa a `confirmada` y se encolan la confirmación (ahora) y el recordatorio (el día anterior a las 18:00).
3. El despachador envía la confirmación. Meta responde con el id del mensaje y el webhook lo marca Entregado y luego Leído.
4. Joe abre "Mensajes": ve 1 por salir (el recordatorio) y 1 entregado.
5. El día anterior a las 18:00 sale el recordatorio. Pedro toca [Ver o cancelar mi cita], cancela sin iniciar sesión y la hora se libera (y avisa a la lista de espera si SPEC-54 está activa).

## Casos borde
- **CB-01** Cita confirmada 1 h antes con recordatorio "2 horas antes": sale solo la confirmación.
- **CB-02** El cliente cancela antes de que salga el recordatorio: pasa a "Ya no aplica" y no se envía.
- **CB-03** El barbero propone otra hora y el cliente acepta: el recordatorio viejo pasa a "Ya no aplica" y se programa uno nuevo; no se reenvía la confirmación.
- **CB-04** El servidor estuvo dormido y un recordatorio de "2 horas antes" se atrasó a 40 min de la cita: "Ya no aplica · llegó tarde".
- **CB-05** Meta responde 429 o 5xx: se reintenta en 1, 5 y 15 min. A la tercera falla queda "No salió" con "Meta no respondió".
- **CB-06** El número no tiene WhatsApp (error 131026 o equivalente): "No salió · el número no tiene WhatsApp", sin reintento.
- **CB-07** La plantilla está pausada o rechazada: "No salió · plantilla no aprobada". Además, aviso único en la bandeja del super admin, sin repetirlo por cada cita.
- **CB-08** Token vencido o inválido (401): todos los envíos de esa vuelta quedan "Por salir" con un intento sumado, y el panel de Configuración muestra "Credenciales inválidas".
- **CB-09** Webhook con firma inválida → 401. Un webhook repetido o un estado desordenado (`delivered` después de `read`) nunca retrocede el estado.
- **CB-10** Dos procesos o vueltas toman el mismo mensaje: el *claim* atómico garantiza un solo envío.
- **CB-11** Joe presiona [No mandarlo] justo cuando el despachador lo toma: gana el primero. Si ya está "Enviando", la acción responde 409 "Ya está saliendo".
- **CB-12** El cliente cambia su teléfono después de reservar: los "Por salir" usan el teléfono vigente del usuario al momento del envío.
- **CB-13** Una cuenta eliminada (`onAccountDeleted`) cancela sus mensajes "Por salir".
- **CB-14** Link con token de una cita ya terminada o cancelada: muestra el estado sin acciones.

## Criterios de aceptación
- **AC-01 Programación.** Al confirmar una cita de un cliente con opt-in se crean exactamente una confirmación (`sendAt = ahora`) y un recordatorio (`sendAt` según RN-04, con horario de silencio). Sin opt-in no se crea nada. Test de server con el reloj inyectado, uno por cada chip.
- **AC-02 Cancelar y mover.** Cancelar, expirar o marcar `no_asistio` deja los pendientes en "Ya no aplica". Mover la cita reprograma el recordatorio y no duplica la confirmación. Test de server.
- **AC-03 Despachador y reintentos.** Con `fetch` falso:
  - 200 → Enviado, con el id de Meta guardado;
  - 500 ×3 → reintentos en 1/5/15 min y luego "No salió";
  - error permanente → "No salió" sin reintento;
  - dos despachadores en paralelo → un solo `fetch` por mensaje.

  Test de server.
- **AC-04 Coherencia (RN-05).** Un mensaje cuya cita se canceló entre la programación y el envío no llama a `fetch`. Test de server.
- **AC-05 Webhook.** El GET devuelve el challenge con el verify token correcto y 403 con uno incorrecto. El POST con firma inválida da 401. Los estados `delivered`/`read` se aplican de forma idempotente y monótona. "BAJA" entrante desactiva el opt-in y frena los pendientes. Test de server.
- **AC-06 Modo sin credenciales.** Sin las variables, la cola queda en "Simulado" con el texto renderizado y **ningún** test hace una petición a `graph.facebook.com` (el `fetch` global se envuelve para que falle si se intenta). Test de server.
- **AC-07 Link con token.** `id + t` válido permite ver y cancelar sin sesión, y no permite confirmar, aceptar ni contraofertar (403). Un token de otra cita, o vencido, → 404/login. Test de server.
- **AC-08 Permisos.** `GET/POST` de mensajes y la configuración de WhatsApp: `client` y `barber` → 403, super admin → 200. Se agregan a la matriz de SPEC-34. Test de server.
- **AC-09 Opt-in en el navegador (:5173).** En `/wstyle/reservar/` con un cliente de seed, el paso Revisar muestra la casilla con el teléfono. Al reservar con la casilla marcada y confirmar desde el panel del barbero, "Mensajes" del admin muestra la confirmación "Simulado" y el recordatorio "Por salir". Capturas a 1440 y 390 px.
- **AC-10 Panel "Mensajes" en el navegador.**
  - Muestra los KPIs, los filtros y el detalle con el texto renderizado.
  - [No mandarlo] cambia la fila a "Frenado" y aparece en Auditoría.
  - Cambiar el chip a "2 horas antes" en Configuración re-programa la fila "Por salir" (cambia "Sale el …").
  - En 390 px no hay scroll horizontal y no hay errores de consola.
- **AC-11 Correo intacto.** Los tests existentes de correos (`mailer.test.js`, `appointments.test.js`) pasan sin cambios en asuntos ni cuerpos.
- **AC-12 Secretos.** `server/.env.example` documenta las variables sin valores. En `render.yaml` los secretos van con `sync: false`. `git grep` no encuentra tokens. La API del panel nunca devuelve el token ni el app secret.
- **AC-13 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde.

## Decisiones confirmadas (por el usuario)
- Confirmación al reservar con link para ver o cancelar, y recordatorio configurable por Joe con chips: 2 h, 4 h, el día anterior, dos días antes.
- Pantalla "Mensajes" en el panel admin con los envíos programados, enviados y fallidos, y opción de frenar uno antes de que salga.
- **API oficial de WhatsApp Business (Meta Cloud API) con plantillas aprobadas.** No se vincula el número personal (riesgo de bloqueo).
- Opt-in del cliente (teléfono + aceptación al reservar), cola y scheduler con reintentos, modo sin credenciales en local y tests sin llamar a Meta.
- El correo actual sigue igual.

## Asunciones (pendientes de validar)
1. **Costo:** se asume ≈ US$0,02 por plantilla *Utility* entregada en Chile (cobro por mensaje desde jul-2025). Validar con el usuario y con la tabla vigente de Meta antes de activar en producción.
2. El número emisor es un número **dedicado** de WS Style. Si Joe quiere usar el mismo número de su WhatsApp Business, se evalúa la "coexistencia" de Meta. Su WhatsApp personal nunca se usa.
3. La "confirmación" sale cuando la cita queda `confirmada`, no cuando queda `pendiente`. Así no se confirma por WhatsApp algo que el barbero aún no aceptó.
4. Un solo recordatorio por cita (los chips son de selección única), con "El día anterior" como default. "El día anterior" y "Dos días antes" salen a las 18:00.
5. Horario de silencio de 22:00 a 08:00 para los recordatorios. La confirmación no lo respeta.
6. Si la cita se mueve, no se reenvía la confirmación; solo se reprograma el recordatorio.
7. La casilla de opt-in viene **desmarcada** la primera vez y después recuerda la última elección del cliente.
8. Las respuestas de los clientes no se leen en un chat: llegan como notificación al super admin y reciben una respuesta automática con el WhatsApp del local.
9. **Render free se duerme:** para que los recordatorios salgan a tiempo hace falta mantenerlo despierto. Opciones: un ping externo cada 10 min a `/api/health` (cron-job.org o un workflow programado de GitHub Actions en `bruser33/ricorp-personal-page`) o subir a un plan pago de Render. Se asume el ping externo; decisión a validar.
10. Los mensajes se conservan 180 días en la cola y luego se borran.
11. Los textos de las plantillas pueden cambiar por la revisión de Meta. El código solo depende del nombre de la plantilla y del orden de sus variables.
12. El idioma de las plantillas es `es` (Meta no tiene `es_CL`).
