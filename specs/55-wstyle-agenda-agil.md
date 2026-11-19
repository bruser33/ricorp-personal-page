# SPEC-55 — WS Style: agenda más ágil para el barbero

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "software de corte", con SillaLibre como referencia (catálogo §3 "Agenda del día" y §4 "Bloquear horarios"). El usuario eligió las funciones. Se toman las ideas, no la marca ni el diseño; WS Style mantiene "Noir de oficio".
> Modo autónomo: detalles menores en **Asunciones pendientes de validar**.
> **Esta spec es solo el delta** sobre lo que ya construyó SPEC-33 (agenda e "Invitar cita") y SPEC-34 (panel admin).

## Estado actual (lo que ya existe)
- **Agenda del barbero** `/wstyle/pro/agenda/` (`pro/pages/AgendaPage.tsx`):
  - vista Día y Semana (3 días en móvil) y línea de "ahora";
  - bloques por cita con colores por estado;
  - los huecos libres son celdas de 30 min (`freeCells`, `pro/util.ts`) que dicen solo "+ 10:00". Tocar una abre **InviteSheet** con esa hora.
- **InviteSheet** (`pro/components/InviteSheet.tsx`):
  - pide celular, nombre, servicio, fecha y hora, y domicilio opcional;
  - crea una cita `invitacion_enviada` (el cliente confirma por link o WhatsApp, `domain/pro.js → invite`);
  - si el celular coincide con un `User` cliente, la vincula. **No hay búsqueda de clientes existentes**: hay que escribir el celular completo.
- **Inasistencia**: en el detalle (`ApptCard.tsx`), el botón "No asistió" aparece desde la hora de inicio + 15 min (`START_WINDOW_MIN`). Pasa la cita a `no_asistio`, manda el correo `no_show` y suma `CustomerProfile.counters.noShows`.
  - **No libera** los `SlotLock` del resto de la cita.
  - El contador **no se muestra** en ninguna parte del panel del barbero (solo el admin ve agregados en Estadísticas o Barberos).
- **Ausencias** (`TimeOff`): se crean solo desde **Perfil → Ausencias** (`ProfilePage.tsx`), con fecha y hora desde/hasta y motivo libre de 80 caracteres. El server rechaza solapes con citas activas (409 `time_off_conflict`). En la grilla, una ausencia solo se ve como "falta de ventana": sin etiqueta ni acción.
- **Panel super admin**: "Citas" es una **lista con filtros** + formulario "Nueva cita" (`createAppointment` crea `confirmada`, `source: 'admin'`). **No hay vista de agenda** en el admin. El admin puede registrar inasistencias (`no-show`) y no puede crear ausencias de un barbero.

## Historia
Como **barbero** quiero **reservar tocando un hueco libre, marcar "El cliente no vino" de un toque y bloquear un rato en dos toques**, para **manejar mi día desde el celular entre corte y corte**.
Como **dueño (super admin)** quiero **lo mismo sobre la agenda de cualquier barbero** para **ordenar el local sin pedirle a cada uno que lo haga**.

## Alcance (delta)
**Incluye**
1. **Hueco "Libre · tocar para reservar"**:
   - Las celdas libres de la vista **Día** muestran "Libre · tocar para reservar" y la hora. En Semana y 3 días, por espacio, siguen "+ hh:mm", con `aria-label` "Libre a las hh:mm, tocar para reservar".
   - Las celdas libres consecutivas se **agrupan** visualmente en un solo bloque punteado ("Libre 15:00–17:00"). Tocar dentro elige la media hora tocada.
   - Mismo color de acento `--brass` de "Noir de oficio"; no se usa el verde de SillaLibre.
2. **Hoja "Reservar en este hueco"** (evoluciona InviteSheet), con dos pestañas: **[Reservar] [Bloquear]**.
   - **Cliente**: un buscador "Busca por nombre o celular" sobre los clientes que ya tuvieron cita en WS Style (de `Appointment.customerSnapshot` + `User`). Muestra hasta 8 resultados con nombre, celular enmascarado (+56 9 ••• 45 678), última visita y, si tiene, la insignia de inasistencias ("2 no vino").
     - Elegir un resultado completa celular y nombre.
     - "Cliente nuevo" deja escribir celular y nombre como hoy.
   - **Cómo queda la cita**:
     - ( ) **Enviar invitación**: el cliente confirma por link. Es el comportamiento actual (`invitacion_enviada`) y el default.
     - ( ) **Ya está confirmada**: el cliente está aquí o lo acordaron por teléfono. Crea la cita `confirmada` directo (`source: 'pro_direct'`), sin link de confirmación. Si el cliente tiene cuenta y correo, recibe el correo `confirmed`. Si SPEC-53 está activa y tiene opt-in, recibe además la confirmación por WhatsApp.
   - Servicio, duración y domicilio siguen como hoy. Si el servicio no cabe en el hueco: "No alcanza: este hueco es de 30 min y el servicio dura 60".
3. **"El cliente no vino" de un toque**:
   - El botón "No asistió" se renombra **"El cliente no vino"**. Queda visible en el detalle y también como acción rápida directamente sobre el bloque de la cita en la vista Día cuando ya se puede usar (inicio + 15 min, regla actual).
   - Un toque lo registra. Aparece un aviso inferior durante 8 s: "Marcamos que Pedro no vino · [Deshacer]". Si se toca Deshacer, no se envía nada; la petición sale al terminar los 8 s o al cerrar el aviso.
   - **Efectos nuevos** sobre los actuales (estado `no_asistio`, correo y contador):
     - se **liberan los `SlotLock` desde ahora** (redondeado al bloque de 15 min) hasta el fin de la cita, para que ese rato quede libre en la grilla;
     - si existe SPEC-54, se llama al hook de lista de espera con el hueco liberado.
   - **Corrección**: el super admin puede revertir un `no_asistio` de las últimas 48 h a `terminada` ("Sí vino") con motivo obligatorio. Resta 1 al contador y queda en la auditoría. El barbero no puede revertir.
4. **Contador de inasistencias visible**:
   - En el detalle de la cita (barbero y admin), en los resultados del buscador y en el bloque de la grilla (punto o insignia), cuando el cliente tiene ≥ 1: "Inasistencias anteriores: 2".
   - Solo cuenta las de WS Style (`CustomerProfile` del negocio).
   - Para citas sin cuenta (`customerUserId` nulo), se cuentan las `no_asistio` con el mismo `customerSnapshot.phoneE164`.
5. **Bloqueos rápidos** (pestaña [Bloquear] de la hoja, más un botón **[Bloquear]** junto a "+ Invitar cita" en la cabecera de la agenda):
   - Motivo con chips **Almuerzo · Médico · Trámite · Otro**. "Otro" abre un texto opcional de hasta 80 caracteres.
   - Desde: hora del hueco tocado (o la próxima media hora, desde la cabecera).
   - Duración con chips **[30 min] [1 h] [2 h] [Resto del día]**, editables con "Hasta" manual.
   - [Bloquear] crea un `TimeOff` con el motivo y confirma "Listo: de 13:00 a 14:00 no te pueden reservar".
   - Reutiliza `POST /api/pro/time-off` y su validación de conflicto. Ante un 409 se muestran las citas en conflicto, igual que en Perfil.
   - En la grilla, el bloqueo se dibuja como bloque **rayado** con su motivo ("Almuerzo"). Tocarlo ofrece **[Quitar bloqueo]**.
   - Perfil → Ausencias sigue igual, para ausencias largas o de varios días.
6. **Agenda en el panel del super admin**: "Citas" suma un selector **[Lista] [Agenda]**.
   - La vista Agenda muestra **un día**, con **una columna por barbero aprobado**, y reutiliza la grilla del panel del barbero (componente compartido).
   - Tocar un hueco abre la misma hoja: Reservar crea por `createAppointment` (confirmada, como hoy) y Bloquear crea una ausencia para **ese barbero**, por un endpoint admin nuevo que queda en la auditoría.
   - Tocar una cita abre el `ApptSheet` del admin, con "El cliente no vino" y el contador.
   - En móvil (< 700 px) se ve un barbero a la vez, con chips para cambiar.
7. **Autorización y validación**: endpoints nuevos (búsqueda de clientes, crear confirmada, ausencia por admin, revertir no-show) en la matriz de SPEC-34, con el body validado.

**Fuera**
- Fila de clientes sin hora (walk-ins) y "Voy atrasado +10".
- Reprogramar arrastrando bloques (drag & drop).
- Bloqueos recurrentes ("almuerzo todos los días"). Para eso está la disponibilidad semanal del Perfil.
- Cambiar la regla de cuándo se puede marcar la inasistencia (sigue inicio + 15 min).
- Push o PWA.
- Lista de espera (SPEC-54); aquí solo se llama a su hook.

## Reglas de negocio
- **RN-01 Reserva directa.** "Ya está confirmada" exige que la hora esté libre con la disponibilidad real (sin `minLeadMinutes`, como la invitación de hoy), y respeta `SlotLock`. Si el celular es del propio barbero → error `self_invite` (regla actual). No exige que el cliente tenga cuenta.
- **RN-02 Búsqueda.** El barbero solo encuentra clientes que tuvieron alguna cita **con él**; el super admin, cualquier cliente de WS Style. Se necesitan mínimo 3 caracteres o 4 dígitos. Nunca se devuelve el email.
- **RN-03 No vino.** Se mantienen las condiciones: estado `confirmada` y `ahora ≥ inicio + 15 min`. Liberar locks nunca toca horas pasadas ni otras citas.
- **RN-04 Deshacer.** Mientras corre la ventana de 8 s no se envía la petición. Si se cierra la pestaña en ese lapso, el registro se envía con `navigator.sendBeacon`/`keepalive` (asunción 3).
- **RN-05 Bloqueos.** Solo hacia adelante (no se crean en el pasado). "Resto del día" termina en el cierre de la última ventana de trabajo de ese día. Un bloqueo no puede solaparse con citas activas (409 actual).
- **RN-06 Admin sobre barberos.** El super admin puede reservar, bloquear y marcar inasistencias en la agenda de cualquier barbero aprobado. Cada acción registra auditoría y notifica al barbero en su bandeja ("WS Style bloqueó 13:00–14:00: Almuerzo").
- **RN-07 Contador.** El número que se muestra es el contador de WS Style. No se muestra a otros clientes ni en la cuenta del propio cliente.

## Casos borde
- **CB-01** Dos barberos o pestañas reservan el mismo hueco a la vez: una 201 y otra 409 "Esa hora se acaba de ocupar" (índice de `SlotLock`). La hoja recarga los huecos.
- **CB-02** El hueco tocado ya pasó mientras la hoja estaba abierta: "Esa hora ya pasó. Elige otra."
- **CB-03** "El cliente no vino" sobre una cita de 30 min ya terminada en el reloj: se marca igual y no hay locks futuros que liberar.
- **CB-04** El cliente llega tarde justo después del toque: [Deshacer] dentro de los 8 s. Pasado ese plazo, solo el super admin puede corregir ("Sí vino").
- **CB-05** Bloqueo "Resto del día" en un día con citas más tarde: 409, con las citas listadas.
- **CB-06** El buscador encuentra dos clientes con el mismo nombre: se distinguen por el celular enmascarado y la última visita.
- **CB-07** Un cliente nuevo con un celular que ya existe como `User`: se vincula a esa cuenta (regla actual).
- **CB-08** El admin bloquea la agenda de un barbero suspendido: no aparece en la vista (solo los aprobados).
- **CB-09** Grilla en 390 px: la hoja ocupa la pantalla y los chips hacen salto de línea sin scroll horizontal.

## Criterios de aceptación
- **AC-01 Hueco reservable.** En la vista Día, con un seed de un barbero con huecos, se ve "Libre · tocar para reservar". Los huecos consecutivos aparecen agrupados. Tocar 15:30 abre la hoja con 15:30 precargado. Test vitest de la función de agrupación (`pro/util.test.ts`) y captura a 1440 y 390 px.
- **AC-02 Buscador.** `GET` de búsqueda del barbero: devuelve solo sus clientes, enmascara el celular y no trae email; con menos de 3 caracteres → 400. El admin ve todos. Test de server. En el navegador, elegir un resultado completa nombre y celular.
- **AC-03 Ya está confirmada.** Crea `confirmada` con `source: 'pro_direct'`, ocupa los `SlotLock`, manda el correo `confirmed` si hay email y no genera link de invitación. Hora ocupada → 409. Test de server.
- **AC-04 No vino + liberación.** Con el reloj en inicio + 20 min de una cita de 60 min, `no-show`:
  - deja `no_asistio` y suma el contador;
  - borra los locks de inicio + 30 hasta el fin (no los pasados);
  - deja la hora siguiente reservable por la disponibilidad;
  - llama al hook de lista de espera, que es un espía en el test.

  Antes de inicio + 15 → 409 (regla actual). Test de server.
- **AC-05 Deshacer.** En el navegador (:5173), con el reloj del seed preparado, "El cliente no vino" muestra el aviso. [Deshacer] no envía ninguna petición (se verifica en `network_requests`). Sin deshacer, a los 8 s sale y el bloque cambia a "No asistió".
- **AC-06 Corrección admin.** Revertir `no_asistio` → `terminada` dentro de 48 h resta el contador y audita. Después de 48 h → 409. El barbero → 403. Test de server.
- **AC-07 Contador visible.** Un cliente de seed con 2 inasistencias muestra "Inasistencias anteriores: 2" en el detalle del barbero y del admin y en el buscador. Un cliente con 0 no muestra nada. Navegador más test del serializer.
- **AC-08 Bloqueo rápido.** Chips Almuerzo + 1 h desde 13:00 crean un `TimeOff` de 13:00 a 14:00 con motivo "Almuerzo". Se dibuja rayado y etiquetado. [Quitar bloqueo] lo borra. Un conflicto muestra las citas. "Resto del día" termina en el cierre de la ventana. Test de server (cálculo de "resto del día") y navegador.
- **AC-09 Agenda admin.** `/wstyle/admin/citas/` → [Agenda] muestra una columna por barbero aprobado en el día. Reservar en un hueco crea una cita `confirmada` para ese barbero. Bloquear crea una ausencia auditada y notifica al barbero. En 390 px se ve un barbero con chips para cambiar. Navegador más tests de server de los endpoints admin y de la matriz de autorización de SPEC-34.
- **AC-10 Sin regresiones.** "Enviar invitación" sigue funcionando igual: `invitacion_enviada`, link y WhatsApp prellenado. Los tests de `pro.test.js` y `admin.test.js` pasan.
- **AC-11 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde; sin errores de consola en `/wstyle/pro/agenda/` ni en `/wstyle/admin/citas/`.

## Decisiones confirmadas (por el usuario)
- En el panel del barbero (y del admin), los huecos libres se pueden tocar ("Libre · tocar para reservar") y abren la creación de cita para un cliente existente o nuevo (por teléfono y nombre).
- Botón "El cliente no vino" de un toque: estado no-show, libera la hora, dispara la lista de espera de SPEC-54 si existe y el contador de inasistencias por cliente queda visible.
- Bloqueos rápidos con motivos predefinidos (Almuerzo, Médico, Trámite, Otro) y duración rápida.
- Solo se especifica el delta sobre SPEC-33 y SPEC-34.

## Asunciones (pendientes de validar)
1. Desde un hueco, el barbero puede elegir "Enviar invitación" (default, comportamiento actual) o "Ya está confirmada".
2. El buscador del barbero solo muestra a sus propios clientes; el admin ve a todos.
3. "Un toque" = registro inmediato con [Deshacer] durante 8 s, sin diálogo de confirmación.
4. Solo el super admin corrige un "no vino" equivocado, dentro de 48 h.
5. Chips de duración del bloqueo: 30 min, 1 h, 2 h y Resto del día.
6. El admin gana una vista de agenda diaria por barbero dentro de "Citas", sin sección nueva.
7. Las acciones del admin sobre la agenda de un barbero se le notifican en su bandeja.
8. Las celdas libres siguen siendo de 30 min (como hoy), aunque `slotMinutes` sea 15.
