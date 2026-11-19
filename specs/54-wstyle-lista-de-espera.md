# SPEC-54 — WS Style: lista de espera

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "software de corte", con SillaLibre como referencia (catálogo §6, "Lista de espera"). El usuario eligió las funciones. Se toman las ideas, no la marca ni el diseño; WS Style mantiene "Noir de oficio".
> Modo autónomo: detalles menores en **Asunciones pendientes de validar**.
> Se integra con **SPEC-53** (WhatsApp; opcional), **SPEC-55** ("El cliente no vino" libera la hora) y **SPEC-56** (seña vencida libera la hora). Funciona sola, solo con correo, si esas no están.

## Estado actual
- En la reserva (`agenda/pages/BookingPage.tsx` + `components/Calendar.tsx`), un día sin horas libres queda **deshabilitado** ("Sin disponibilidad"). No se distingue un día **cerrado** (local cerrado, feriado, barbero sin turno) de uno **lleno**.
- La hora se libera cuando la cita se cancela (cliente, barbero o admin), cuando expira (`pendiente`, `invitacion_enviada`, `propuesta_cambio`, `pendiente_pago` → `runExpirations` / `runHolds`), cuando el barbero la rechaza y cuando se reasigna a otro barbero. En esos casos se borran sus `SlotLock`.
- `no_asistio` hoy **no** borra los `SlotLock` del resto de la cita. SPEC-55 lo corrige.
- Reservar exige sesión y celular (`User.phoneE164`). Hay rate limit de reservas (`BOOKING_RATE_LIMIT`).
- Correos por `notify`/`emails.js`. Bandeja del super admin (`adminInbox`) y del barbero (`PanelNotification`).

## Historia
Como **cliente** que no encuentra hora el día que quiere, quiero **anotarme en la lista de espera de ese día** para que **me avisen si se libera una hora y poder tomarla**.
Como **barbero o dueño** quiero **ver cuánta gente espera cada día** para **llenar las horas que se liberan sin perseguir a nadie**.

## Alcance
**Incluye**
1. **Día lleno vs. cerrado.** La disponibilidad (`GET /api/wstyle/availability`) informa, por día, si está **lleno**: hay horario de atención para ese servicio y barbero, pero no quedan horas.
   - En el calendario, un día lleno se puede **tocar** (estilo distinto, "Lleno") y uno cerrado sigue deshabilitado.
   - Solo cuenta como "lleno" un día dentro del horizonte (`horizonDays`) y no pasado.
2. **Anotarse** (lado cliente). Al elegir un día lleno, en lugar de las horas aparece la tarjeta: "No quedan horas libres este día. ¿Te anotamos en la lista de espera? Si se libera una hora te avisamos por correo (y por WhatsApp si lo activaste). Ojo: no es una reserva."
   - Muestra el servicio elegido y el barbero ("Cualquiera" o el elegido), con opción de cambiarlo a "Cualquiera".
   - Rango horario opcional: "Me sirve: todo el día / mañana (antes de 14:00) / tarde (desde 14:00)".
   - Botón [Anotarme]. Confirmación: "Listo, estás en la lista de espera del <día>. Si se libera una hora te avisamos. Si no te escribimos, ese día no hubo lugar."
3. **Mis listas de espera.** En "Mis citas" (`/wstyle/cuenta/mis-citas/`), bloque "En lista de espera" con día, servicio, barbero, estado (Esperando · Te avisamos · Tomaste la hora · Terminó) y [Salir de la lista].
4. **Liberación → aviso** (dominio, p. ej. `domain/waitlist.js`).
   - Cada vez que una cita futura deja de ocupar su hora, se calcula para ese barbero y día si **queda al menos una hora reservable** con la disponibilidad real (horario, ausencias, otras citas, `minLeadMinutes` de la lista, RN-06).
   - Motivos: cancelación, expiración, rechazo, reasignación, "El cliente no vino" de SPEC-55, seña vencida o rechazada de SPEC-56.
   - Si queda, se avisa a los **3 primeros** compatibles de la lista (RN-03), en orden de llegada.
   - Aviso por **correo** (plantilla nueva `waitlist_slot`: "Se liberó una hora el <día>: <servicio> con <barbero> a las <hh:mm>. La primera persona que la confirme se la queda.") y, si SPEC-53 está activa y el cliente tiene opt-in, por **WhatsApp** (plantilla `ws_lista_espera_cupo` con botón URL).
5. **Tomar la hora.** El aviso lleva [Tomar esta hora] → `/wstyle/reservar/?espera=<token>`.
   - Pide sesión del mismo cliente.
   - Abre la reserva en el paso "Revisar" con servicio, barbero y hora precargados. Si hay varias horas libres ese día, muestra las compatibles para elegir.
   - Al confirmar se crea la cita por el **flujo normal** (`create`): mismas reglas de pago, seña (SPEC-56), estado inicial y correos.
   - El primero que crea la cita se la queda (garantía del índice único de `SlotLock`).
   - Los demás ven: "Alguien tomó esta hora antes. Sigues en la lista de espera."
6. **Indicador en la agenda.**
   - **Barbero** (`pro/pages/AgendaPage.tsx`): en el encabezado de cada día, un chip con ícono de reloj de arena y la cantidad en espera para ese día (las personas que pidieron a ese barbero + las de "Cualquiera"). Tocarlo abre una hoja con la lista: nombre, servicio, preferencia horaria, "anotado hh:mm", estado y "avisado hh:mm". Acciones:
     - [Avisarle] abre `wa.me` con un texto prellenado y el link, y lo registra como aviso manual;
     - [Sacar].
   - **Super admin**: el mismo chip y la misma hoja en la vista de agenda de SPEC-55. En "Citas" se suma un resumen "Lista de espera: N personas en los próximos 7 días".
7. **Configuración (admin → Configuración → "Lista de espera")**: interruptor encendido/apagado. Apagada: los días llenos vuelven a verse como hoy (deshabilitados) y no se envían avisos. Las entradas activas se conservan.
8. **Expiración.** Las entradas de un día terminan solas al cierre de ese día ("Terminó"). Si el cliente reserva cualquier hora ese día (por la lista o no), su entrada pasa a "Tomaste la hora".
9. **Sanitización y autorización** por rol con la matriz de SPEC-34. Body validado en el server.

**Fuera**
- Fila de clientes sin hora (walk-ins) con espera estimada (SillaLibre §5).
- Reservar automáticamente al primero de la lista sin que confirme.
- Lista de espera para "cualquier día de la semana" o rangos de varios días.
- Prioridad por fidelidad o pago.
- Avisar a la lista cuando el barbero amplía su horario o borra una ausencia (solo se avisa ante citas que liberan su hora).

## Reglas de negocio
- **RN-01 Quién.** Solo clientes con sesión y celular válido. Una entrada por cliente y día. No puede anotarse quien ya tiene una cita activa (`BLOCKING`) ese mismo día.
- **RN-02 Límites anti-abuso.**
  - Máximo **3 entradas activas** por cliente.
  - Máximo **30 personas** por día (después: "La lista de este día está completa").
  - Anotarse usa el mismo rate limit de la reserva (5 cada 10 min por IP).
  - Un cliente con **2 o más inasistencias** (`CustomerProfile.counters.noShows`) no puede anotarse: "Para anotarte en la lista de espera escríbenos por WhatsApp".
- **RN-03 Compatibilidad y orden.** Una entrada es compatible con la hora liberada si:
  - es del mismo día;
  - el servicio de la entrada cabe en el hueco con ese barbero, y el barbero hace ese servicio;
  - el barbero es el elegido o "Cualquiera";
  - la hora entra en su preferencia horaria.

  El orden es FIFO por fecha de inscripción. Se avisa a los 3 primeros compatibles que no fueron avisados en los últimos 30 min.
- **RN-04 Aviso no es reserva.** Avisar no bloquea la hora. Cualquiera (de la lista o una reserva normal) puede tomarla antes.
- **RN-05 Validez del link.** El token del aviso sirve para ese cliente y ese día. Vence cuando el día termina o cuando la entrada sale de la lista. Un token usado por otra cuenta → 403.
- **RN-06 Anticipación.** Las horas tomadas desde la lista usan una anticipación mínima de **30 min** (no los 120 min de `minLeadMinutes`) para poder llenar huecos del mismo día. Solo se avisa si la hora liberada empieza en ≥ 30 min.
- **RN-07 Reintento de avisos.** Una entrada recibe como máximo 3 avisos automáticos por día. Si nadie toma la hora, no se vuelve a avisar por esa misma liberación.
- **RN-08 Aviso al barbero y al admin.** Cuando se avisa a la lista, el barbero de la hora recibe una notificación en su bandeja: "Se liberó 16:00: avisamos a 3 personas de la lista de espera". Cuando alguien la toma, recibe la notificación normal de nueva cita.
- **RN-09 Privacidad.** El barbero ve nombre, servicio y preferencia. El teléfono solo se usa para el botón [Avisarle]. El cliente nunca ve a los demás de la lista ni su posición (asunción 5).

## Flujo principal
1. Ana quiere "Corte + barba" el sábado. El sábado aparece "Lleno"; lo toca, elige "Cualquiera · tarde" y presiona [Anotarme].
2. El chip del sábado en la agenda de Carlos muestra 3.
3. El viernes, Pedro cancela su hora del sábado a las 16:00. El sistema calcula que esa hora es reservable y avisa a los 3 primeros compatibles por correo (y WhatsApp si corresponde). Carlos recibe "Se liberó 16:00…".
4. Ana toca [Tomar esta hora], revisa y confirma. La cita queda `pendiente` (o `pendiente_sena` con SPEC-56). Su entrada pasa a "Tomaste la hora".
5. Luis toca su link un minuto después y ve "Alguien tomó esta hora antes. Sigues en la lista de espera."

## Casos borde
- **CB-01** La hora liberada es de 30 min y el servicio de la entrada dura 60: esa entrada no es compatible y se avisa a la siguiente.
- **CB-02** Se cancela una cita de un día pasado o que ya empezó: no se avisa.
- **CB-03** "El cliente no vino" (SPEC-55) de un servicio de 60 min a los 15 min de su hora: el resto (45 min) solo se avisa si queda un hueco que empiece en ≥ 30 min y quepa un servicio. Normalmente no habrá aviso.
- **CB-04** Dos cancelaciones seguidas del mismo día: cada una dispara su cálculo. RN-03 evita avisar dos veces a la misma persona en 30 min.
- **CB-05** El cliente se anota y después reserva otro día: su entrada sigue. Si reserva ese mismo día → "Tomaste la hora".
- **CB-06** El admin apaga la lista con entradas activas: no se envían más avisos y los links ya enviados responden "La lista de espera no está activa". Al encenderla, las entradas vigentes vuelven a esperar.
- **CB-07** El correo falla: queda `Notification` failed y el aviso por WhatsApp (si aplica) sale igual. La entrada cuenta como avisada.
- **CB-08** Un barbero suspendido o un servicio desactivado: las entradas que dependían solo de ese barbero o servicio terminan y se avisa al cliente por correo ("Ese día ya no está disponible").
- **CB-09** Cuenta eliminada: sus entradas se borran.
- **CB-10** El día lleno se libera por una cancelación mientras el cliente mira la tarjeta: al anotarse, el server responde "Se acaba de liberar una hora" con las horas, en vez de anotarlo.

## Criterios de aceptación
- **AC-01 Día lleno.** La disponibilidad marca `full: true` en un día con horario y sin horas, y no lo marca en un día cerrado o feriado. Test de server. En el navegador (:5173), el día lleno es tocable y muestra la tarjeta; el cerrado sigue deshabilitado.
- **AC-02 Anotarse y límites.** Se crea la entrada. Segunda entrada del mismo día → 409. Cuarta activa → 409. Con cita activa ese día → 409. Con ≥ 2 inasistencias → 403. Día 31 → 409. Sin sesión → 401. Test de server.
- **AC-03 Liberación → aviso.** Con 5 entradas compatibles y 1 incompatible, cancelar una cita futura envía el correo `waitlist_slot` a las 3 primeras compatibles en orden (`Notification` dry-run) y una notificación al barbero. Con SPEC-53 en dry-run, encola además 3 WhatsApp. Test de server con el reloj inyectado, uno por cada motivo de liberación (cancelación, expiración, rechazo, reasignación).
- **AC-04 Primero que confirma.** Dos clientes avisados crean la cita a la vez: una 201 y otra 409 "Alguien tomó esta hora antes". La entrada del ganador queda "Tomaste la hora" y la del otro sigue "Esperando". Test de server.
- **AC-05 RN-06 y CB-03.** Con una hora liberada que empieza en 20 min no se avisa a nadie. Con una que empieza en 45 min, sí. Tomar una hora a 40 min de su inicio por el link funciona aunque `minLeadMinutes` sea 120. Por la reserva normal, sigue rechazada. Test de server.
- **AC-06 Token.** El link de otra cuenta → 403. Vencido (día pasado) o con la lista apagada → página con el mensaje correspondiente. Test de server y verificación en el navegador.
- **AC-07 Indicador.** En `/wstyle/pro/agenda/`, con 3 entradas sembradas para el sábado, el chip del sábado muestra 3. La hoja lista los nombres, y [Sacar] lo baja a 2. [Avisarle] abre `wa.me` con el link (se verifica el `href`). Captura a 1440 y 390 px.
- **AC-08 Cliente en el navegador.** Flujo completo con seed:
  - día lleno → [Anotarme] → aparece en "Mis citas · En lista de espera";
  - se cancela una cita desde el panel del barbero → el correo en el buzón local (Mailpit o dry-run) tiene el link;
  - el link lleva al paso Revisar con la hora → confirmar → la cita aparece en "Próximas".

  Sin errores de consola. En 390 px sin scroll horizontal.
- **AC-09 Apagado.** Con la lista apagada, `full` no habilita el día en el cliente, no se envían avisos y el chip no aparece. Test de server y navegador.
- **AC-10 Permisos.** Endpoints de lista del barbero (solo los de sus días o "Cualquiera"), del admin (todo) y del cliente (solo las propias) según la matriz de SPEC-34; cruzados → 403/404. Test de server.
- **AC-11 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde; los tests existentes de agenda y pagos pasan.

## Decisiones confirmadas (por el usuario)
- Si no hay hora libre el día que quiere, el cliente puede anotarse en la lista de espera de ese día, con servicio y barbero opcionales.
- Cuando se libera una hora (cancelación o "no vino"), se avisa a los primeros de la lista por correo, y por WhatsApp si SPEC-53 está activa, con un link para tomarla. El primero que confirma se la queda.
- En la agenda del barbero y del admin hay un indicador con la cantidad en espera por día.
- Límites anti-abuso razonables.

## Asunciones (pendientes de validar)
1. Se avisa a **3** personas a la vez (no de a una con turnos de espera).
2. La hora tomada desde la lista sigue el flujo normal (`pendiente`, confirmación del barbero, seña si aplica). No queda confirmada sola.
3. Anticipación mínima de 30 min para horas tomadas desde la lista (RN-06), aunque la reserva normal exija 120.
4. Límites: 1 entrada por día, 3 activas por cliente, 30 por día. Quien tiene 2 o más inasistencias no puede anotarse.
5. El cliente no ve su posición en la lista.
6. La lista viene **encendida** por defecto.
7. Preferencia horaria simple: todo el día, mañana (antes de 14:00) o tarde (desde 14:00).
8. El barbero puede sacar a alguien de la lista y avisarle a mano por `wa.me`. Ninguna de las dos acciones se le notifica al cliente.
9. Avisar a la lista no se dispara cuando el barbero amplía su horario o borra una ausencia; solo cuando una cita libera su hora.
10. El texto del aviso es tuteo chileno y nunca dice "turno" (en WS Style se dice "hora" o "cita").
