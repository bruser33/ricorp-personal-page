# SPEC-33 — WS Style: registro del barbero y su panel de trabajo (agenda, domicilios, invitar cita)

> Pedido del usuario (2026-10-25): "replica el modelo [de Styluxe] para agendar citas, permitir que un barbero de WS Style se registre y trabaje, hacer domicilios, y el panel administrativo del profesional y del super admin".
> Cambio confirmado (2026-10-25): los barberos también pueden registrarse con **Facebook** además de email; siguen quedando pendientes hasta que el super admin los aprueba.
>
> Esta spec cubre al **barbero**. Usa el modelo `User`/identidades, la disponibilidad y la máquina de estados de SPEC-32. Aprobación → SPEC-34. Pagos → SPEC-35.
> La SPEC-36 (video tutorial) mostrará el registro del barbero: el flujo está escrito paso a paso con los textos de cada pantalla.
> Modo autónomo: lo no confirmado está en "Asunciones pendientes de validar".

## Estado actual
- No existe auth ni panel en el proyecto. `server/src/app.js` exporta `createApp({ env })`; Resend ya configurado; tests con `node --test`.
- `site.json → barbers` tiene barberos de ejemplo (`enabled: false`) que la landing muestra solo con datos reales.
- La landing es estática en Pages (`ricorp.cl/wstyle/`); cada página con URL propia necesita su carpeta en `dist/` (patrón `client/scripts/paginas-spa.mjs`).

## Referencia Styluxe (pantallas "23 vistas_ profesionales") — qué se replica
| Styluxe | En WS Style |
|---|---|
| "Registrarse" (nombre, contraseña, categoría: Estilista/Belleza/Barbería/Manicure) + Google/Facebook/huella | Registro con email o Facebook; categoría fija "Barbería" (el campo existe para Styluxe) |
| "Vanessa, muéstrale al mundo tus habilidades" → "Agregar fotos de perfil" → "Ofrecer servicio" | Onboarding en 3 pasos: fotos → servicios → disponibilidad, con aviso "Tu perfil está en revisión" |
| "Nuevo servicio": nombre, categorías, duración (slider), ¿domicilio?, disponibilidad (horas + días), precio; "Styluxe retiene un 20 %" | Elegir servicios de la carta del local; disponibilidad semanal aparte; domicilio a nivel barbero (recargo + radio); comisión visible si es > 0 |
| Home "Hola Vanessa, Agenda para hoy": tarjetas por hora, moto si es domicilio, dirección, km, "Cómo llegar", "Llamar", "Iniciar"/"Terminar", estados Confirmado / Invitación enviada | Igual, más WhatsApp y "Confirmar" para las pendientes |
| "Agendar" (invitar): celular cliente, nombre, servicio, fecha y hora → "Enviar invitación"; "Tu invitación será enviada por WhatsApp. El método de pago por defecto es Efectivo." | Igual |
| Agenda día / 3 días / semana / mes con bloques por cliente; tocar una cita → Mover / Cancelar; "¿Deseas mover la cita con Carla a las 6 PM?"; tocar un hueco → "Agendar cita" | Igual (mover = propuesta al cliente, SPEC-32 RN-12) |
| "Ruta al cliente" (Google Maps) | Link a Google Maps con destino (sin mapa embebido) |
| Notificaciones / Perfil / Editar perfil (fotos, nombre público, ubicación, "Haces parte de NOMBRE LOCAL", archivar/editar/eliminar servicios, temas de perfil) | Notificaciones en el panel + perfil editable; temas de perfil fuera |
| "Administrar local" (dueño: miembros, estadísticas, contacto, horario) | Es del super admin (SPEC-34) |
| "Métodos de pago" del profesional (cuentas para recibir dinero, "¿Aceptas efectivo?") | Fuera: cobra el local (SPEC-35) y el local define las formas de pago |

Dirección de arte WS Style ("Noir de oficio"), web responsive mobile first (el barbero lo usa en el teléfono).

## Historia
Como **barbero que quiere trabajar con WS Style** quiero **registrarme (con email o Facebook), armar mi perfil, decir qué servicios hago, cuándo trabajo y si voy a domicilio, y manejar mi agenda del día y de la semana**, para **recibir reservas sin coordinar todo por WhatsApp y saber siempre a quién atiendo, dónde y cuándo**.

## Alcance
**Incluye**
- Registro e inicio de sesión del barbero con email + contraseña y con Facebook (mismo `User` de SPEC-32 con rol `barber`); estado `pendiente` hasta aprobación (SPEC-34).
- Onboarding: fotos de perfil, servicios de la carta que hace, disponibilidad semanal, ausencias, domicilio (recargo, radio, margen de traslado).
- Panel en `ricorp.cl/wstyle/pro/`: "Agenda para hoy", agenda día/semana, confirmar, proponer cambio (mover), cancelar, iniciar, terminar, marcar inasistencia, invitar cita por WhatsApp, agendar en un hueco, notificaciones, perfil.
- "Cómo llegar" (Google Maps), "Llamar" (`tel:`), "WhatsApp" (`wa.me`).

**Fuera**
- Aprobación/suspensión y "Administrar local" (SPEC-34). Cobros en línea, cuentas bancarias del barbero, payouts (SPEC-35 / futuro Styluxe).
- Servicios propios con precio libre del barbero (el modelo lo soporta; no se habilita, ver asunciones).
- Mapa embebido, seguimiento en vivo, ruteo, chat, reseñas, temas de perfil, publicidad, Google/Instagram/huella como login.
- App nativa / notificaciones push.

## Reglas de negocio
- **RN-01 Registro.** Campos: nombre (2–60), email, celular chileno (WhatsApp), contraseña (mismas reglas que SPEC-32 RN-20) o Facebook. Categoría `barberia` fija. Aceptar términos. Crea/actualiza un `User` con rol `barber`, un `Professional` y una `Membership` con WS Style en estado `pending`.
- **RN-02 Cuenta existente.** Si el email ya es de un cliente, no se crea otra cuenta: se pide la contraseña (o Facebook) y se **agrega el rol `barber`** a esa misma cuenta.
- **RN-03 Pendiente.** Un barbero `pending` puede entrar, completar su perfil y su disponibilidad, pero **no aparece en la reserva pública ni puede recibir ni invitar citas**. Ve el aviso "Tu perfil está en revisión. Te avisaremos por correo cuando WS Style lo apruebe." Al aprobarse/rechazarse recibe correo (SPEC-34). Rechazado: ve el motivo y no puede operar. Suspendido: no puede entrar al panel operativo (ve el aviso) y no recibe reservas nuevas.
- **RN-04 Servicios.** El barbero marca, de la carta del local, cuáles hace. Precio y duración vienen de la carta (los define el super admin). Debe tener al menos 1 servicio para ser reservable.
- **RN-05 Disponibilidad.** Reglas semanales: por día, uno o más rangos (p.ej. Lun 10:00–14:00 y 15:00–20:00). Solo se pueden marcar horas dentro del horario del local (lo que quede fuera se recorta y se avisa). Ausencias por rango de fechas/horas ("vacaciones", "trámite"). Crear una ausencia que choca con citas activas exige decidir antes qué hacer con ellas (mover o cancelar); no se dejan citas huérfanas.
- **RN-06 Domicilio.** Toggle "Hago domicilio" + recargo fijo en CLP (0–50.000) + radio en km (1–30) + margen de traslado (0–90 min, por defecto 30). Si lo apaga, sus citas a domicilio ya confirmadas se mantienen.
- **RN-07 Confirmar.** Las citas `pendiente` aparecen destacadas con "Confirmar" / "Proponer otra hora" / "Rechazar" (rechazar = cancelar con motivo obligatorio). Ver expiración en SPEC-32 RN-11.
- **RN-08 Mover = proponer.** Mover una cita (arrastrar o "Mover" + elegir hora libre) **no la cambia directamente**: crea una propuesta (SPEC-32 RN-12) y avisa al cliente. Excepción: citas de invitación aún no aceptadas se pueden reprogramar libremente (se reenvía la invitación).
- **RN-09 Cancelar.** Con motivo obligatorio (lista: "Imprevisto personal", "Enfermedad", "Problema con el local", "Otro" + texto). Avisa al cliente por correo y deja link de WhatsApp. Si estaba pagada en línea, queda marcada para reembolso (SPEC-35).
- **RN-10 Iniciar / Terminar.** "Iniciar" se habilita desde 15 min antes del inicio y solo en citas `confirmada`; pasa a `en_curso`. "Terminar" solo en `en_curso`; pasa a `terminada`. Al terminar una cita con pago en el local se pregunta "¿Cobraste $<total>?" (Sí / No → queda "pago pendiente" visible para el super admin).
- **RN-11 Inasistencia.** Desde 15 min después del inicio, una cita `confirmada` se puede marcar `no_asistio`.
- **RN-12 Invitar cita (como Styluxe).** Celular del cliente (obligatorio), nombre, servicio, fecha y hora (solo horas libres), ¿domicilio? (+ dirección). Crea la cita en estado `invitacion_enviada` (ocupa la hora) y abre WhatsApp con el mensaje prellenado: "Hola <nombre>, te agendé <servicio> el <día> a las <hh:mm> en WS Style. Confírmala aquí: <link>". El link lleva a la cita; el cliente entra o crea su cuenta (SPEC-32) y "Confirma" → `confirmada`. Forma de pago por defecto: **en el local (efectivo)**. Si no confirma en 24 h o a 2 h del inicio → `expirada`. Si el celular coincide con un cliente existente, la invitación se asocia a su cuenta y además le llega por correo.
- **RN-13 Agendar en un hueco.** Tocar un hueco libre de la agenda abre "Invitar cita" con fecha y hora ya puestas.
- **RN-14 Lo que ve el barbero.** Solo sus citas y los datos del cliente necesarios para atenderlo (nombre, celular, dirección si es domicilio, nota). Nunca citas de otros barberos ni el email del cliente.
- **RN-15 Distancia y cómo llegar.** Las tarjetas a domicilio muestran ícono de moto, dirección, km (desde el local, como SPEC-32) y "Cómo llegar" → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` (o la dirección codificada si no hay coordenadas), en pestaña nueva.
- **RN-16 Notificaciones del panel.** Lista con no leídas destacadas: nueva cita, cliente aceptó/contrapropuso/canceló, invitación confirmada/expirada, cuenta aprobada/rechazada. También por correo (SPEC-32 RN-17).
- **RN-17 Fotos.** Hasta 4 fotos (JPG/PNG/WebP, ≤ 5 MB cada una); la primera es la principal. Se recortan cuadradas y se guardan optimizadas (WebP ~800 px). Validación de tipo por contenido, no por extensión.

### Registro del barbero, paso a paso (base del video de SPEC-36)
Ruta: `ricorp.cl/wstyle/pro/registro/` (link "¿Eres barbero? Trabaja con nosotros" en el footer de la landing y en `/wstyle/cuenta/`).

**A. Con email**
1. Pantalla "Trabaja en WS Style" → texto "Crea tu perfil de barbero. Lo revisamos y te avisamos por correo." → campo Email → **"Continuar con email"** · debajo **"Continuar con Facebook"**.
2. **"Crear cuenta de barbero"**: Nombre, Celular (WhatsApp), Contraseña (con ojo), casilla "Acepto los términos" → **"Crear cuenta"**. (Si el email ya existe: "Ya tienes una cuenta con este correo. Ingresa tu contraseña para agregar el perfil de barbero." → "Continuar".)
3. Onboarding 1/3 — "<Nombre>, muéstrale al mundo tu trabajo" → **"Agregar fotos"** (hasta 4) → "Siguiente" (se puede saltar).
4. Onboarding 2/3 — "¿Qué servicios haces?" → lista de la carta con casillas (precio y duración visibles) → "Siguiente" (mínimo 1).
5. Onboarding 3/3 — "¿Cuándo trabajas?" → días (Lun…Dom) y rangos de hora; "¿Haces domicilio?" → recargo, radio km, margen de traslado → **"Enviar a revisión"**.
6. Pantalla "Tu perfil está en revisión" + correo "Recibimos tu solicitud". El super admin recibe correo "Nuevo barbero por aprobar: <nombre>".
7. Al aprobarse: correo "¡Bienvenido a WS Style!" con link al panel; el panel ya muestra "Agenda para hoy".

**B. Con Facebook**
1. "Continuar con Facebook" → Facebook pide nombre y correo → "Continuar como <nombre>".
2. Vuelve a "Crear cuenta de barbero" con nombre y email ya completados (email editable solo si Facebook no lo entregó) → falta Celular + términos → "Crear cuenta".
3. Sigue igual que A.3–A.7.

**C. Entrar**: `/wstyle/pro/` sin sesión → "Entrar" (email + contraseña o Facebook, mismo componente de SPEC-32) → panel.

## Flujo principal (barbero aprobado, un día de trabajo)
1. Abre `/wstyle/pro/` → **"Hola <nombre>, Agenda para hoy"**: tarjetas por hora (cliente, servicio, estado, moto + dirección + km si es domicilio; botones Cómo llegar / Llamar / WhatsApp; "Confirmar" en pendientes; "Iniciar" o "Terminar" según estado). Sin citas: "Parece que aún no tienes citas para hoy" + botón "+" (Invitar cita).
2. Campana con contador de no leídas → notificaciones.
3. Pestaña **Agenda**: vista día / semana (en móvil, 3 días deslizable como Styluxe), línea de "ahora", bloques coloreados por estado; tocar una cita → hoja con detalle + Mover / Cancelar; tocar un hueco → Invitar cita con esa hora.
4. **Mover**: elige nueva hora libre → "¿Deseas proponer a <cliente> mover la cita a las <hh:mm>?" → "Proponer" → la cita queda "Esperando respuesta del cliente".
5. Pestaña **Perfil**: fotos, nombre público, servicios, disponibilidad, ausencias, domicilio, "Haces parte de WS Style".

## Casos borde
- **CB-01** Barbero `pending` intenta abrir la agenda o invitar → panel bloqueado con el aviso de revisión; la API responde 403 `not_approved`.
- **CB-02** Barbero suspendido con citas futuras → no puede operar; sus citas las ve el super admin (SPEC-34). Sesión activa al suspender → la siguiente llamada responde 403.
- **CB-03** Disponibilidad fuera del horario del local → se recorta y se avisa "WS Style abre de 10:00 a 20:00 los lunes; ajustamos tu horario."
- **CB-04** Ausencia que choca con citas → "Tienes 3 citas en esas fechas" con lista para mover/cancelar antes de guardar.
- **CB-05** Mover a una hora que se ocupó mientras elegía → 409 y recarga de horas.
- **CB-06** Iniciar fuera de ventana (más de 15 min antes) o sobre una cita no confirmada → botón deshabilitado; API 409.
- **CB-07** Invitar a un celular inválido o a una hora pasada → error en el campo.
- **CB-08** El cliente invitado no tiene WhatsApp / el barbero no tiene WhatsApp en el equipo → además del botón, se muestra "Copiar link de la invitación".
- **CB-09** Dirección del domicilio sin coordenadas → "Cómo llegar" usa la dirección en texto.
- **CB-10** Foto de 12 MB, un PDF renombrado a .jpg, o la 5.ª foto → rechazo con mensaje específico.
- **CB-11** Dos pestañas: confirmar en una y rechazar en otra → la segunda recibe 409 y refresca.
- **CB-12** El barbero quita un servicio de su lista con citas futuras de ese servicio → las citas se mantienen; solo deja de ofrecerse.
- **CB-13** Facebook sin email en el registro de barbero → se pide email y se verifica por correo antes de enviar a revisión.
- **CB-14** Barbero intenta ver una cita de otro barbero (cambiando el id en la URL) → 404.

## Criterios de aceptación
Tests de server con `node --test` contra BD de test real (`pagina_personal_test`, replica set de un nodo, vaciada por suite), mailer en dry-run, cliente HTTP de Facebook inyectado (servicio externo). UI verificada en el navegador en `http://localhost:5173/wstyle/pro/` (mismo host que la API, ver SPEC-32 RN-23).

- **AC-01 Registro de barbero con email.** Crea `User` (rol `barber`, contraseña hasheada), `Professional` y `Membership` `pending`; correo al barbero y al super admin. Email que ya es de un cliente → con la contraseña correcta agrega el rol `barber` a la misma cuenta (un solo `User`); con la incorrecta → 401. Test de server.
- **AC-02 Registro de barbero con Facebook.** Callback válido crea `User` con identidad `facebook` + rol `barber` + `Membership` `pending`; mismo id de Facebook la segunda vez entra a la misma cuenta; `state` inválido no crea nada. Test de server.
- **AC-03 Pendiente no opera.** Con `Membership` `pending`, `rejected` o `suspended`: agenda, invitar, confirmar, iniciar → 403; el barbero no aparece en la disponibilidad pública de SPEC-32. Tras aprobar (helper) → aparece y opera. Test de server.
- **AC-04 Autorización por recurso.** Un barbero solo lee/modifica sus citas; con id ajeno → 404; un cliente llamando endpoints de `/pro` → 403. El JSON de una cita para el barbero no incluye el email del cliente. Test de server.
- **AC-05 Disponibilidad.** Guardar rangos fuera del horario del local los recorta; ausencia que choca con citas activas → 409 con la lista; los cambios se reflejan en las horas libres de SPEC-32. Test de server.
- **AC-06 Domicilio.** Validaciones de recargo (0–50.000), radio (1–30) y margen (0–90); apagar domicilio deja de ofrecerlo en la reserva sin tocar citas existentes. Test de server.
- **AC-07 Acciones sobre citas.** Confirmar, rechazar (motivo obligatorio), proponer cambio, cancelar (motivo), iniciar (solo desde 15 min antes y confirmada), terminar (solo en curso, registra "cobrado sí/no"), inasistencia (desde 15 min después). Transiciones inválidas → 409. Cada una deja historial y dispara el correo correspondiente. Test de server con reloj inyectado.
- **AC-08 Invitar cita.** Crea `invitacion_enviada` ocupando la hora, forma de pago "en el local", y devuelve el link `wa.me` con el mensaje prellenado (celular normalizado, texto codificado). Hora ocupada → 409. Sin confirmación en 24 h → `expirada` y libera la hora. El cliente que confirma queda asociado a la cita. Test de server.
- **AC-09 Fotos.** Acepta hasta 4 imágenes válidas ≤ 5 MB; rechaza tamaño, cantidad y tipo falso (detección por contenido). Test de server.
- **AC-10 Registro en el navegador (insumo del video).** En :5173 se completa el flujo A (email) y el onboarding 1/3–3/3 hasta "Tu perfil está en revisión"; capturas de cada paso en 390 px. Flujo B con Facebook verificado con un usuario tester de la app de Meta en modo desarrollo; sin credenciales en `server/.env` el botón se oculta (documentado).
- **AC-11 Panel en el navegador.** Con un barbero aprobado y citas de seed: "Agenda para hoy" muestra las tarjetas en orden, la moto y la dirección en las de domicilio, "Cómo llegar" abre Google Maps con el destino, "Llamar" es `tel:`; confirmar e iniciar/terminar cambian la tarjeta sin recargar; la vista semana muestra los bloques en su hora; tocar un hueco abre "Invitar cita" con la hora puesta. Capturas 390 px y 1440 px.
- **AC-12 Rutas.** Recargar `/wstyle/pro/`, `/wstyle/pro/registro/`, `/wstyle/pro/agenda/` y `/wstyle/pro/perfil/` funciona en `vite preview` (carpetas en `dist/`).
- **AC-13 Dirección de arte y accesibilidad.** Tokens de `wstyle.css`, foco visible, operable con teclado (mover también tiene alternativa sin arrastrar), contraste AA.
- **AC-14 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` verdes.

## Decisiones confirmadas (por el usuario)
- Registro abierto tipo Styluxe; el barbero queda **pendiente** hasta que el super admin lo aprueba.
- Domicilio: cada barbero define si lo hace, un recargo fijo y su radio en km.
- Diseño: modelo de flujo de Styluxe con la dirección de arte de WS Style, web responsive.
- ✎ El barbero puede registrarse con **email + contraseña o con Facebook** (OAuth en el server, `FB_APP_ID`/`FB_APP_SECRET` en `server/.env`, app de Meta en modo desarrollo con testers hasta App Review). Mismo `User` con roles e identidades vinculables de SPEC-32.
- ✎ Instagram no se ofrece (no viable hoy, ver SPEC-32 RN-25).

## Asunciones pendientes de validar
1. Los servicios del barbero se **eligen de la carta del local** (precio y duración los fija el super admin); el barbero no crea servicios con precio propio.
2. Sesión con cookie `httpOnly` (API en `api.ricorp.cl`, mismo sitio); si no hay subdominio, token en header (ver SPEC-32).
3. Un barbero `pending` puede entrar y completar su perfil, pero no aparece ni recibe citas hasta ser aprobado.
4. Mover una cita confirmada es una **propuesta** que el cliente debe aceptar (como Styluxe), no un cambio directo.
5. Cancelar exige motivo de una lista; el cliente recibe correo con el motivo.
6. "Iniciar" se habilita 15 min antes; "No asistió" 15 min después del inicio.
7. Invitaciones por WhatsApp con pago por defecto en el local; vencen en 24 h sin confirmación.
8. El cliente invitado debe tener (o crear) cuenta para confirmar la invitación, igual que al reservar.
9. Hasta 4 fotos de perfil, ≤ 5 MB cada una; se guardan optimizadas en la BD (GridFS) porque el disco de Render free es efímero.
10. Distancia mostrada = desde el local en línea recta (no desde la ubicación en vivo del barbero).
11. Rango de recargo 0–50.000 CLP, radio 1–30 km, margen de traslado 0–90 min (30 por defecto).
12. El barbero no ve el email del cliente; solo nombre, celular, dirección y nota.
13. Link "¿Eres barbero? Trabaja con nosotros" en el footer de la landing.

## Dependencias
- **SPEC-32**: `User`/identidades/sesión, Facebook Login, disponibilidad, máquina de estados, propuesta de cambio, correos.
- **SPEC-34**: aprobación/rechazo/suspensión, carta y horario del local.
- **SPEC-35**: reembolso al cancelar citas pagadas en línea.
- **SPEC-36**: video tutorial con los flujos A y B de registro.
- App de Meta (cuenta personal de Pedro, nunca de ordename) con usuario tester para probar Facebook en local.
