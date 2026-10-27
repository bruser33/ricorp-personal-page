# SPEC-32 — WS Style: agendar una cita en línea (cliente), con domicilio y disponibilidad real

> Pedido del usuario (2026-10-25): "Hace tiempo hice una app móvil llamada Styluxe, una app de barberías. Mira sus pantallas y replica el modelo para agendar citas, permitir que un barbero de WS Style se registre y trabaje, hacer domicilios, y el panel administrativo del profesional y del super admin. Considera planificar el modelado a futuro para escalar e integrar esto a un futuro Styluxe (un 'Uber de barberos'), pero SOLO como consideración: no hagas nada de Styluxe."
>
> Cambio confirmado por el usuario (2026-10-25, mismo día): "los clientes ahora se registran con cuenta: email+contraseña y Facebook; agendar exige sesión". Instagram también se pidió: ver "Login social" (no viable hoy).
>
> Esta spec cubre el lado **cliente**: cuenta (registro/login) y agendamiento. También define el **modelo de usuarios e identidades** que reutilizan SPEC-33 (barbero) y SPEC-34 (super admin). Pagos → SPEC-35.
> La SPEC-36 será un video tutorial de estos registros: los flujos de registro están escritos paso a paso, con los textos exactos de cada pantalla.
> Modo autónomo: las asunciones no confirmadas están al final, en "Asunciones pendientes de validar".

## Estado actual
- La landing vive en `client/src/wstyle/` (multi-página Vite, `client/wstyle/index.html`), servida estática en GitHub Pages en `ricorp.cl/wstyle/` con HTML prerenderizado (`client/scripts/prerender-wstyle.mjs`).
- El CTA "Reservar" sale de `bookingLink(site)` en `client/src/wstyle/links.ts`: `site.booking.url` → WhatsApp → teléfono. Hoy `booking.url` está vacío, así que "Reservar" abre WhatsApp. `ext()` abre todo lo que no es `tel:` en pestaña nueva.
- La carta (`client/public/wstyle/content/services.json`) ya trae `id`, `name`, `priceCLP`, `durationMin`; el horario del local está en `site.json → hours` (`dayCodes` schema.org, `opens`/`closes`). Ambos son JSON estáticos con datos de ejemplo (`demo: true`).
- `server/src/app.js` exporta `createApp({ env })` (sin listen/connect) y ya tiene Resend para correo; `server/test/contact.test.js` corre con `node --test`. No hay modelos de agenda, ni auth, ni zona horaria.
- Rutas con URL propia en Pages: `client/scripts/paginas-spa.mjs` copia `index.html` a `dist/<ruta>/index.html` (y a `404.html`) porque Pages no reescribe rutas.

## Referencia Styluxe (pantallas "27 vistas_ clientes") — qué se replica y qué no
| Styluxe | En WS Style |
|---|---|
| Inicio: "Comenzar" → "¿Cuál es tu correo electrónico?" → "Continuar con Email" / Google / Facebook / huella → "Registrarse" (nombre, contraseña) o "Entrar" (contraseña, "Recordar contraseña") | Registro/login del cliente: email primero, luego "Crear cuenta" o "Entrar"; botón "Continuar con Facebook". Google, huella e Instagram fuera (ver asunciones) |
| Perfil del profesional con lista de servicios (precio, "30 min aprox") → "Agendar cita" | Paso 1: elegir servicio de la carta y barbero (o "sin preferencia") |
| "Agendar cita": calendario mensual + "Selecciona la hora" | Paso 2: calendario + **solo horas realmente libres** (no un selector libre de hora/am-pm) |
| "Método de pago" + toggle "¿Este servicio es un Domicilio?" → "Agendar cita" | Paso 3: ¿en el local o a domicilio? (dirección + recargo + total) · Paso 4: datos y forma de pago |
| Tarjeta "NUEVA CITA — esperando confirmación de <barbero>" | Pantalla de éxito con el mismo mensaje y la fecha |
| Notificaciones: "<barbero> quiere mover el servicio de 5 pm a 6 pm" → Modificar / Aceptar | Correo + página de la cita: Aceptar / Proponer otra hora / Cancelar |
| "Modificar": antes » ahora, "Proponer nueva cita", días "Sin disponibilidad" | Igual, con los días sin cupo deshabilitados |
| Búsqueda por mapa, categorías, comentarios/estrellas, chat, métodos de pago guardados, publicidad | **Fuera** (es Styluxe / marketplace; ver sección de escalabilidad) |

Dirección de arte: la de WS Style ("Noir de oficio": negro, hueso, cobre; Anton + Cormorant + Inter), no el amarillo de Styluxe. Web responsive, mobile first.

## Historia
Como **cliente de WS Style** quiero **crear mi cuenta (con email o con Facebook) y reservar una hora con un barbero desde la web, eligiendo servicio, día, hora y si es en el local o a domicilio**, para **no depender de escribir por WhatsApp, saber al tiro cuánto pago y cuándo me atienden, y tener mis citas en un solo lugar**.

## Alcance
**Incluye**
- Cuenta de cliente: registro e inicio de sesión con email + contraseña y con **Facebook Login**; recuperar contraseña por correo; cerrar sesión; "Mis citas".
- Modelo `User` con roles (`client`, `barber`, `superadmin`) e identidades vinculables (`email`, `facebook`), compartido con SPEC-33 y SPEC-34.
- Flujo de reserva en `ricorp.cl/wstyle/reservar/` (4 pasos + confirmación). **Agendar exige sesión**, pero la selección no se pierde: el registro/login se completa dentro del mismo flujo.
- Cálculo de disponibilidad real en el server.
- Domicilio: dirección, validación de radio, recargo y total antes de confirmar.
- Estados de la cita y página de la cita (`/wstyle/cita/?id=<id>`, requiere sesión del dueño de la cita): ver estado, aceptar o contraproponer un cambio del barbero, cancelar.
- Notificaciones por correo (Resend) al cliente y al barbero, y links `wa.me` prellenados.
- Conectar el CTA "Reservar" de la landing con este flujo.
- Modelo de datos pensado para multi-negocio (Styluxe) **solo en diseño**.

**Fuera**
- Panel del barbero, registro y "Invitar cita" (SPEC-33); panel super admin, carta y horario editables (SPEC-34); cobro en línea con Mercado Pago (SPEC-35; acá solo queda el hueco "forma de pago").
- Login con **Instagram** (no viable hoy, ver "Login social"), con **Google** y con huella/passkeys (asunciones pendientes).
- Favoritos, reseñas, chat, búsqueda por mapa, varios locales, publicidad, métodos de pago guardados.
- Envío de WhatsApp automático por API (solo links `wa.me` que la persona toca).
- SMS, push, recordatorios automáticos programados (queda como mejora futura).
- Cualquier código, marca o repo de Styluxe.
- Deploy: todo se valida en local (:5173 / :4000).

## Reglas de negocio
- **RN-01 Zona horaria.** Todo horario se muestra y se interpreta en `America/Santiago`. En la BD se guarda en UTC. Los cambios de horario de verano/invierno de Chile no pueden generar horas duplicadas ni inexistentes (ver casos borde).
- **RN-02 Disponibilidad.** Una hora de inicio `h` del barbero `B` para el servicio `S` está libre si y solo si el bloque `[h, h + duración)` cabe completo dentro de: horario del local de ese día **∩** disponibilidad semanal de `B` **−** bloqueos (feriados del local, ausencias de `B`) **−** citas de `B` que ocupan agenda (estados `pendiente`, `pendiente_pago`, `invitacion_enviada`, `confirmada`, `propuesta_cambio`, `en_curso`).
- **RN-03 Duración.** La duración sale del servicio (`durationMin`). A domicilio se suma un **margen de traslado** antes y después (lo define el barbero, SPEC-33; por defecto 30 min por lado) que ocupa agenda aunque el cliente no lo vea.
- **RN-04 Grilla.** Las horas de inicio ofrecidas van cada 15 min. Anticipación mínima: 2 h desde ahora. Horizonte: 30 días.
- **RN-05 Sin solapes, garantizado por la BD.** Dos reservas simultáneas al mismo barbero y hora: solo una gana; la otra recibe "Esa hora se acaba de ocupar" y vuelve a ver horas frescas. No basta con validar antes de insertar (ver "Concurrencia").
- **RN-06 Barbero.** El cliente elige un barbero aprobado y activo que haga ese servicio, o "Sin preferencia": en ese caso se muestran las horas libres de cualquiera, y al confirmar se asigna el que tenga esa hora libre con menos citas ese día (empate: el primero por orden de la lista).
- **RN-07 Domicilio.** Solo aparece si el barbero elegido (o al menos uno, con "Sin preferencia") hace domicilio. El cliente ingresa dirección (calle y número, comuna, depto/indicaciones opcional). Si la dirección queda fuera del radio en km del barbero (medido desde el local en línea recta), no se permite y se explica. Total = precio del servicio + recargo fijo del barbero. Se muestra el desglose antes de confirmar.
- **RN-08 Cuenta obligatoria para agendar.** Solo un usuario con sesión y rol `client` puede crear una cita. La cuenta aporta nombre y email; el **celular chileno** (`+56 9 XXXX XXXX`, normalizado a E.164) es obligatorio para agendar y se pide la primera vez si la cuenta no lo tiene (Facebook no lo entrega). Nota opcional ≤ 300 caracteres por cita. Aceptación de políticas (las de `site.json → policies`) obligatoria en cada reserva.
- **RN-09 Precio congelado.** La cita guarda una copia del nombre, precio, duración, recargo y total al momento de reservar. Cambios posteriores a la carta no la afectan.
- **RN-10 Estados.** Ver máquina de estados. Toda transición queda registrada (quién, cuándo, desde→hacia, motivo).
- **RN-11 Confirmación del barbero.** Una cita nueva queda `pendiente` ("esperando confirmación de <barbero>") y ocupa la hora. Si el barbero no la confirma dentro de 12 h o antes de que falten 2 h para el inicio (lo que ocurra primero), pasa a `expirada`, libera la hora y se avisa al cliente.
- **RN-12 Propuesta de cambio.** El barbero puede proponer otra fecha/hora (SPEC-33). La cita pasa a `propuesta_cambio`; **la hora original y la propuesta quedan ambas bloqueadas** hasta que el cliente responda. El cliente puede **Aceptar** (pasa a `confirmada` en la nueva hora y se libera la original), **Proponer otra hora** (elige entre horas libres; vuelve a `pendiente` en esa hora y el barbero confirma) o **Cancelar**. Sin respuesta en 12 h o a 2 h de la hora original: la propuesta caduca, se libera la hora propuesta y la cita vuelve a `confirmada` en la hora original si ya lo estaba, o `expirada` si seguía pendiente.
- **RN-13 Cancelación por el cliente.** Desde la página de la cita, hasta 3 h antes del inicio (política "Inasistencias" del sitio). Después de ese plazo el botón se reemplaza por "Escríbenos por WhatsApp".
- **RN-14 Límite antiabuso.** Máx. 2 citas activas futuras por cuenta (y por celular, para que no se esquive con otra cuenta), y rate limit de 5 intentos de reserva por IP cada 10 min (mismo patrón que `/api/contact`). Honeypot en el formulario.
- **RN-15 Forma de pago.** En esta spec solo existe "Pagar en el local" (efectivo/débito/crédito, según la política de pagos). SPEC-35 agrega "Pagar en línea" sin cambiar el resto del flujo.
- **RN-16 Acceso a la cita.** Solo el cliente dueño de la cita (sesión), el barbero asignado y el super admin la ven. El link del correo lleva a `/wstyle/cita/?id=<id>`; sin sesión pide iniciar sesión y vuelve a la cita. Otro cliente con sesión recibe 404 (no se revela que existe).
- **RN-17 Notificaciones.** Correo al cliente: reserva recibida, confirmada, propuesta de cambio, cambio aceptado, cancelada (por quién y motivo), expirada. Correo al barbero: nueva cita, el cliente aceptó/contrapropuso, el cliente canceló. Cada correo incluye el link a la cita y un link `wa.me` al otro lado prellenado. Si el correo falla la cita igual se crea (el envío no es transaccional) y el fallo queda logueado.

### Cuentas, sesión e identidades (compartido con SPEC-33 y SPEC-34)
- **RN-18 Un usuario, varias identidades.** `User` tiene `roles[]` (`client`, `barber`, `superadmin`) e `identities[]` vinculables: `email` (email + hash de contraseña) y `facebook` (id de Facebook de la app). Una misma persona puede ser cliente y barbero con la misma cuenta.
- **RN-19 Email único.** El email (normalizado a minúsculas) identifica la cuenta. Si alguien entra con Facebook y ya existe una cuenta con ese email **verificado**, se vincula Facebook a esa cuenta después de que la persona confirme con su contraseña (no se vincula en silencio). Si Facebook no entrega email, se pide uno y se verifica por correo.
- **RN-20 Contraseña.** Mínimo 8 caracteres, al menos una letra y un número; se rechaza si es igual al email. Se guarda con hash lento (bcrypt/argon2), nunca en claro ni en logs. Mostrar/ocultar con el ojo (como Styluxe).
- **RN-21 Verificación de email.** Al registrarse con email se manda un correo "Confirma tu correo" (link válido 24 h). Se puede reservar sin haberlo confirmado (para no cortar el flujo), pero la cuenta muestra un aviso y el link de confirmar se puede reenviar. Cuentas de Facebook con email entregado por Facebook se consideran verificadas.
- **RN-22 Recuperar contraseña.** "¿Olvidaste tu contraseña?" → correo con link de un solo uso (1 h). La respuesta es siempre la misma exista o no la cuenta ("Si existe una cuenta con ese correo, te enviamos un link").
- **RN-23 Sesión.** Sesión de 30 días renovable; "Cerrar sesión" la invalida en el server. Rate limit de login: 5 intentos fallidos por email cada 15 min → espera. Mensaje de error genérico ("Correo o contraseña incorrectos"). Nota técnica: el front vive en `ricorp.cl` y la API en Render (`*.onrender.com`), otro sitio; Safari y Chrome bloquean cada vez más las cookies de terceros. Recomendado: servir la API en un subdominio propio (`api.ricorp.cl`, Render free admite dominio propio) y usar cookie `httpOnly; Secure; SameSite=Lax` (mismo sitio). En local el front y la API deben usar el **mismo host** (`localhost:5173` → `localhost:4000`; mezclar `127.0.0.1` y `localhost` son sitios distintos y la cookie no viaja); si no se usa subdominio, alternativa: token en header `Authorization` guardado en memoria + refresh. Ver asunciones.
- **RN-24 Login social con Facebook.** OAuth 2.0 **en el server** (Authorization Code con `state` firmado contra CSRF): el navegador va a Facebook, vuelve a `GET /api/auth/facebook/callback`, el server canjea el código con `FB_APP_SECRET`, lee `id`, `name`, `email` del Graph API y crea/vincula el `User`. El secreto nunca llega al cliente. Credenciales en `server/.env`: `FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI`. La app de Meta queda en **modo desarrollo** (solo funciona para administradores/testers agregados en la app) hasta pasar App Review; para `email` y `public_profile` no se requiere revisión avanzada, pero sí poner la app en modo "Live" con política de privacidad y URL de eliminación de datos.
- **RN-25 Login con Instagram: no viable hoy.** Meta cerró la Instagram Basic Display API (4-dic-2024), que era la que permitía "Entrar con Instagram" a cuentas personales. La actual "Instagram API with Instagram Login" solo sirve para cuentas **profesionales (business/creator)** y está pensada para gestionar contenido/mensajes, no para autenticar consumidores. Por eso no se ofrece botón de Instagram; la vía social es Facebook Login. Queda como asunción pendiente revisarlo si Meta cambia la oferta.
- **RN-26 Eliminar cuenta.** El cliente puede pedir eliminar su cuenta desde "Mi cuenta"; se anonimiza (las citas pasadas quedan con "Cliente eliminado") y se cancelan sus citas futuras. Además existe la URL de "eliminación de datos" que exige Meta.

### Registro e inicio de sesión del cliente, paso a paso (base del video de SPEC-36)
Rutas: `/wstyle/cuenta/` (entrar / crear cuenta), `/wstyle/cuenta/mis-citas/`, `/wstyle/cuenta/recuperar/`. También como paso dentro de `/wstyle/reservar/`.

**A. Crear cuenta con email**
1. "Reservar" → (sin sesión) en el paso 4 aparece "Para agendar necesitas una cuenta". O directo en `/wstyle/cuenta/`.
2. Pantalla "¿Cuál es tu correo?" → campo Email → botón **"Continuar con email"**. Debajo: **"Continuar con Facebook"** y el texto "Al continuar aceptas los Términos y la Política de privacidad".
3. El server responde si el email ya tiene cuenta: si no, pantalla **"Crear cuenta"** con: Nombre, Celular (+56 9), Contraseña (con ojo) → **"Crear cuenta"**.
4. Queda con sesión iniciada. Mensaje "¡Listo, <nombre>! Te enviamos un correo para confirmar tu email." y vuelve **automáticamente al punto de la reserva donde estaba**, con servicio, barbero, día y hora intactos.
5. Llega el correo "Confirma tu correo · WS Style" → clic → "Correo confirmado".

**B. Entrar con email (cuenta existente)**
1. "¿Cuál es tu correo?" → email → "Continuar con email".
2. Pantalla **"Entrar"**: "Usando <email>", Contraseña (con ojo), link "¿Olvidaste tu contraseña?" → **"Entrar"**.
3. Error: "Correo o contraseña incorrectos" junto al campo; a los 5 intentos: "Demasiados intentos. Prueba de nuevo en 15 minutos."

**C. Crear cuenta / entrar con Facebook**
1. "Continuar con Facebook" → ventana de Facebook "WS Style quiere acceder a tu nombre y correo" → "Continuar como <nombre>".
2. Vuelve a WS Style. Si es nuevo: pantalla "Un último dato" pidiendo **Celular** (y Email si Facebook no lo entregó) → "Crear cuenta".
3. Si ya existía una cuenta con ese email (creada con contraseña): "Ya tienes una cuenta con <email>. Ingresa tu contraseña para vincular Facebook." → "Vincular y entrar".
4. Si la persona cancela en Facebook: vuelve con "No se completó el inicio con Facebook. Puedes intentarlo de nuevo o usar tu correo."
5. Igual que A.4: vuelve a la reserva sin perder la selección.

**D. Mis citas**: lista de próximas y pasadas (servicio, barbero, fecha, estado con color, total) → clic abre la cita.

La selección en curso se conserva en el navegador (`sessionStorage`, con try/catch) y, en el ida y vuelta a Facebook, dentro del `state` firmado (solo la URL de retorno `/wstyle/reservar/?servicio=…&barbero=…&inicio=…`). Si al volver la hora ya no está libre, se muestra "Esa hora se ocupó mientras creabas tu cuenta" y el paso 2 con el resto de la selección intacta.

### Máquina de estados de la cita
```
                 (SPEC-35, pago en línea)
 [nueva] ──► pendiente_pago ──pago aprobado──► pendiente ──barbero confirma──► confirmada ──barbero inicia──► en_curso ──barbero termina──► terminada
    │                                            │   ▲                            │   ▲
    └──────(pago en el local)───────────────────►┘   │                            │   │
                                                 │   └──cliente contrapropone─┐   │   │
                                                 ▼                            │   ▼   │
                                              expirada          propuesta_cambio ◄─barbero propone (desde pendiente o confirmada)
                                                                   │  cliente acepta ─► confirmada (nueva hora)
 cancelada ◄── cliente (≥3 h antes) | barbero | super admin | pago rechazado/vencido (SPEC-35)
 no_asistio ◄── barbero/super admin, desde confirmada, pasada la hora de inicio + 15 min
 invitacion_enviada ──cliente confirma──► confirmada   (cita creada por el barbero, SPEC-33)
```
Estados finales: `terminada`, `cancelada`, `expirada`, `no_asistio`. Una cita final no cambia más.

### Concurrencia (cómo se garantiza "sin solapes")
- MongoDB no tiene restricción de exclusión por rango. Se usa una colección de **bloques ocupados** (`SlotLock`): por cada cita se insertan sus bloques de 15 min (incluido el margen de traslado) con **índice único `{ professionalId, slotStart }`**. Si cualquier inserción choca con el índice, la reserva falla con 409 y no queda nada a medias.
- La creación de la cita y sus bloques va en una **transacción** (`session.withTransaction`). Las transacciones requieren replica set: el Mongo local de desarrollo y el de tests deben correr como replica set de un nodo (`mongod --replSet rs0` + `rs.initiate()`); Atlas ya lo es. Si el server detecta Mongo standalone, la reserva debe seguir siendo segura gracias al índice único (inserta bloques primero, luego la cita, y compensa borrando bloques si algo falla) y loguea un aviso.
- Mover/cancelar/expirar libera o reemplaza bloques en la misma transacción que cambia el estado.

## Flujo principal
1. En la landing, "Reservar" (hero, nav, sección Reserva, membresía, barberos) lleva a `/wstyle/reservar/` en la **misma pestaña**. Desde la tarjeta de un barbero llega con `?barbero=<id>`; desde la carta con `?servicio=<id>`.
2. **Paso 1 · Servicio y barbero.** Lista de la carta (nombre, precio CLP, "dura ~40 min") → selección. Luego barberos que hacen ese servicio (foto, nombre, especialidad, ícono de moto si hace domicilio) + "Sin preferencia".
3. **Paso 2 · Día y hora.** Calendario mensual (semana inicia lunes, `LU MA MI JU VI SA DO` como Styluxe). Días sin ninguna hora libre en gris con "Sin disponibilidad". Al elegir un día: chips con las horas libres en formato 24 h ("10:15"). Cambiar de barbero o servicio recalcula.
4. **Paso 3 · Dónde.** "En el local" (dirección del local) o "A domicilio" (si aplica): formulario de dirección → el server la ubica, valida radio y devuelve distancia y recargo. Se muestra: Servicio $X · Domicilio $Y · **Total $Z**.
5. **Paso 4 · Tu cuenta y pago.** Sin sesión: aparece el bloque de registro/login (flujos A, B o C de arriba) sin salir del asistente; con sesión: "Agendando como <nombre> · <email> (¿no eres tú? Cerrar sesión)". Celular (si falta en la cuenta), nota, forma de pago ("Pagar en el local"; "Pagar en línea" cuando exista SPEC-35), aceptación de políticas → "Agendar cita". Resumen fijo: servicio, barbero, fecha y hora, dónde, total.
6. Server: verifica la sesión y revalida todo (nada del cliente es autoridad), crea la cita `pendiente` con bloques, responde con su id.
7. **Confirmación.** Pantalla "NUEVA CITA — esperando confirmación de <barbero> — <día> de <mes>, <hh:mm>" + botones "Ver mi cita", "Mis citas", "Agregar al calendario" (.ics) y "Escribir al barbero por WhatsApp". Llega correo al cliente y al barbero.
8. Barbero confirma (SPEC-33) → correo "Tu cita está confirmada". Página de la cita muestra estado y acciones válidas para ese estado.
9. Si el barbero propone mover: correo "<Barbero> quiere mover tu cita" → página de la cita con **antes » ahora** y botones Aceptar / Proponer otra hora / Cancelar (calendario igual al paso 2, con días sin cupo deshabilitados).

## Casos borde
- **CB-01** Dos clientes confirman la misma hora al mismo tiempo → una sola cita; el otro ve "Esa hora se acaba de ocupar. Elige otra." con horas recalculadas.
- **CB-02** Hora que se vuelve inválida mientras el cliente llena el paso 4 (pasó la anticipación mínima, el barbero bloqueó el día) → 409 con mensaje y vuelta al paso 2 conservando los datos ya escritos.
- **CB-03** Servicio largo que no cabe antes del cierre (p.ej. 60 min a las 19:30 con cierre 20:00) → esa hora no se ofrece.
- **CB-04** Día de cambio de horario en Chile (abril: la hora 23:00–23:59 se repite; septiembre: 00:00–00:59 no existe) → no se ofrecen horas inexistentes ni duplicadas; tests con fechas reales de transición.
- **CB-05** Domingo / día cerrado (`opens`/`closes` null) → todo el día "Sin disponibilidad".
- **CB-06** Barbero sin disponibilidad cargada, suspendido o pendiente de aprobación → no aparece en la lista.
- **CB-07** "Sin preferencia" y ningún barbero libre en ese día → día deshabilitado.
- **CB-08** Dirección que no se puede ubicar → "No encontramos esa dirección. Revisa calle, número y comuna." Fuera de radio → "Esta dirección está a 12,4 km; <barbero> va hasta 8 km. Puedes elegir otro barbero o atenderte en el local."
- **CB-09** Celular o email inválido, nombre vacío o solo espacios, contraseña débil, nota > 300 → mensaje junto al campo; el server responde 400 con código por campo.
- **CB-10** Cuenta (o celular) con 2 citas activas futuras → "Ya tienes 2 horas reservadas. Cancela una para tomar otra."
- **CB-19** Registro con un email que ya existe → no se crea otra cuenta; se pasa a "Entrar" ("Ya tienes una cuenta con este correo").
- **CB-20** Facebook sin email (cuenta registrada con teléfono) → se pide email y se verifica por correo antes de vincular a una cuenta existente.
- **CB-21** Facebook devuelve `error=access_denied` o `state` inválido/vencido → mensaje del flujo C.4; nunca se crea sesión con un `state` inválido.
- **CB-22** La app de Meta en modo desarrollo y la persona no es tester → Facebook muestra su propio error; WS Style muestra "El inicio con Facebook aún no está disponible. Usa tu correo." (en local se prueba con un usuario tester).
- **CB-23** La sesión vence a mitad de la reserva → el POST responde 401, se muestra el login en el paso 4 y, al volver, se reintenta con la misma selección.
- **CB-24** Usuario barbero o super admin quiere reservar para sí mismo → permitido solo si su cuenta tiene también rol `client` (se agrega al aceptar "Agendar como cliente"); un barbero no puede reservarse consigo mismo.
- **CB-11** Doble clic en "Agendar cita" → un solo POST (botón deshabilitado + clave de idempotencia por intento).
- **CB-12** Link de cita con id inexistente o de otra persona → página "No encontramos esta cita" con link a "Mis citas" y a WhatsApp del local.
- **CB-13** Cancelar a menos de 3 h → botón oculto; si se fuerza la llamada, 409 "Ya no se puede cancelar en línea".
- **CB-14** El cliente acepta una propuesta cuya hora ya expiró o cuyo estado cambió (otra pestaña) → 409 y la página se recarga con el estado real.
- **CB-15** API caída o lenta (Render free "dormido" tarda en despertar) → estado de carga "Despertando la agenda…" hasta 30 s; después, error con "Reintentar" y alternativa "Reservar por WhatsApp" (`ctaLinks().whatsapp`).
- **CB-16** Sin JavaScript o con el HTML prerenderizado → `/wstyle/reservar/` muestra un aviso y el link de WhatsApp (degradación), nunca una página en blanco.
- **CB-17** Falla el envío de correo → la cita existe igual; la pantalla de éxito muestra el link de la cita para que el cliente lo guarde.
- **CB-18** Cambio de precio o servicio desactivado después de reservar → la cita mantiene precio y nombre congelados (RN-09).

## Criterios de aceptación
Tests de server con `node --test` contra una **BD de test real** (`mongodb://127.0.0.1:27017/pagina_personal_test`, replica set de un nodo, se vacía antes de cada suite; nunca la BD `pagina_personal` de desarrollo). Correo con mailer en dry-run (no se manda nada real). UI verificada en el navegador en `http://127.0.0.1:5173/wstyle/reservar/`.

- **AC-01 Disponibilidad = intersección.** Con un local L–V 10:00–20:00, barbero disponible L–V 12:00–18:00 y una cita 14:00–14:40, para un servicio de 40 min el endpoint de horas del lunes devuelve inicios cada 15 min de 12:00 a 17:20 excepto los que solapan 14:00–14:40 (13:30, 13:45, 14:00, 14:15, 14:30). Test de server.
- **AC-02 Bloqueos y cierre.** Un feriado del local o una ausencia del barbero deja el día sin horas; domingo cerrado devuelve vacío; un servicio de 60 min no ofrece 19:15 si cierra 20:00. Test de server.
- **AC-03 Anticipación y horizonte.** No se ofrecen horas antes de ahora + 2 h ni después de 30 días (reloj inyectable en tests). Test de server.
- **AC-04 Zona horaria.** Las horas se devuelven en `America/Santiago` y se guardan en UTC; en las fechas de transición DST de 2026 y 2027 no hay horas duplicadas ni inexistentes. Test de server con fechas fijas.
- **AC-05 Sin solapes bajo concurrencia.** 20 `POST` simultáneos a la misma hora y barbero → exactamente 1 respuesta 201 y 19 respuestas 409 `slot_taken`; en la BD queda 1 cita y sus bloques. Test de server.
- **AC-06 Estados.** Las transiciones válidas de la máquina de estados funcionan y las inválidas responden 409 `invalid_transition` (p.ej. `terminada → cancelada`, cancelar a < 3 h, aceptar una propuesta ya caducada). Cada transición deja un registro en el historial. Test de server.
- **AC-07 Expiración.** Una cita `pendiente` sin confirmar pasa a `expirada` a las 12 h (o a 2 h del inicio) y libera sus bloques; una propuesta sin respuesta caduca según RN-12. Test de server con reloj inyectado, ejecutando el proceso de expiración.
- **AC-08 Domicilio.** Con barbero de radio 8 km y recargo $3.000: dirección a 5 km → total = precio + 3.000 y la cita ocupa la duración + 30 min de traslado a cada lado; dirección a 12 km → 422 `out_of_range` con la distancia. El geocodificador se inyecta en los tests (es un servicio externo; la BD sigue siendo real). Test de server + navegador (desglose visible antes de confirmar).
- **AC-09 Validación de datos.** Celular no chileno, nota > 300, políticas no aceptadas, honeypot lleno → 400 con código por campo (honeypot: 200 fingido sin crear cita). Sin sesión → 401. Test de server; en el navegador cada error aparece junto a su campo con `role="alert"`.
- **AC-10 Límites.** Tercera cita activa de la misma cuenta o del mismo celular → 409 `too_many_active`; sexto intento por IP en 10 min → 429. Test de server.
- **AC-11 Precio congelado.** Cambiar el precio del servicio después de reservar no cambia el total de la cita. Test de server.
- **AC-12 Propuesta de cambio.** Barbero propone (helper de test) → ambas horas bloqueadas; el cliente dueño acepta → `confirmada` en la nueva hora y la original libre; contrapropone → `pendiente` en la hora elegida. Test de server.
- **AC-13 Acceso a la cita.** Sin sesión → 401; con sesión de otro cliente → 404; dueño, barbero asignado y super admin → 200. Test de server.
- **AC-20 Registro con email.** `POST` registro con email nuevo → 201, `User` con rol `client`, identidad `email`, contraseña hasheada (el hash no es el texto y no aparece en logs ni respuestas), correo "Confirma tu correo" en el mailer dry-run, cookie de sesión `httpOnly`. Email repetido (también con mayúsculas) → 409 `email_taken`; contraseña débil → 400 `weak_password`. Link de confirmación marca `emailVerified`; vencido → 410. Test de server.
- **AC-21 Login y recuperación.** Contraseña correcta → sesión; incorrecta → 401 con mensaje genérico; 6.º intento fallido en 15 min → 429. "Olvidé mi contraseña" responde igual exista o no la cuenta; el link sirve una sola vez y cambia la contraseña; cerrar sesión invalida la sesión en el server. Test de server.
- **AC-22 Registro con Facebook.** Con el cliente HTTP de Facebook inyectado (servicio externo; la BD sigue siendo real): callback con `code` válido y `state` válido crea `User` con identidad `facebook` y email verificado; segundo login con el mismo id de Facebook entra a la misma cuenta; email ya existente con contraseña → no vincula hasta confirmar la contraseña; `state` inválido o `error=access_denied` → no crea sesión y redirige con el mensaje de CB-21; Facebook sin email → pide email. `FB_APP_SECRET` nunca aparece en respuestas ni en el bundle del client (`grep` sobre `client/dist`). Test de server + verificación del build.
- **AC-23 Registro dentro de la reserva (navegador).** En :5173, sin sesión: elegir servicio, barbero, día y hora → en el paso 4 crear cuenta con email (flujo A) → al terminar se vuelve al paso 4 con la misma selección y se agenda. Repetir con "Entrar" (flujo B). Con Facebook se verifica en local con un usuario tester de la app de Meta en modo desarrollo (si no hay credenciales en `server/.env`, el botón se oculta y se documenta). Capturas paso a paso en 390 px (insumo del video de SPEC-36).
- **AC-24 Mis citas.** Con sesión, `/wstyle/cuenta/mis-citas/` lista solo las citas de esa cuenta (próximas y pasadas, con estado). Test de server (filtro por usuario) + navegador.
- **AC-25 Sin Instagram.** No hay botón de Instagram ni Google en la UI; la spec documenta por qué (RN-25). Navegador.
- **AC-14 Correos.** Cada evento de RN-17 genera el correo al destinatario correcto con link a la cita y link `wa.me` (se verifica la salida del mailer dry-run). Si el mailer falla, la cita se crea igual. Test de server.
- **AC-15 Flujo en el navegador.** En :5173, desde el botón "Reservar" de la landing se llega a `/wstyle/reservar/` en la misma pestaña; se completa una reserva de punta a punta (servicio → barbero → día → hora → local → datos) y aparece "esperando confirmación de <barbero>" con la fecha correcta; recargar `/wstyle/reservar/`, `/wstyle/cita/?id=…`, `/wstyle/cuenta/` y `/wstyle/cuenta/mis-citas/` funciona (en `vite preview` también: las carpetas existen en `dist/`). Captura en 390 px y 1440 px.
- **AC-16 Página de la cita.** Con una propuesta pendiente se ve "antes » ahora" y los botones Aceptar / Proponer otra hora / Cancelar; tras aceptar, el estado cambia sin recargar. Navegador.
- **AC-17 Degradación.** Con el server apagado, `/wstyle/reservar/` muestra el error reintentable y el link "Reservar por WhatsApp" (no pantalla en blanco). Navegador.
- **AC-18 Dirección de arte.** Colores y tipografías de WS Style (tokens existentes de `wstyle.css`), sin amarillo Styluxe; controles con foco visible y operables con teclado; contraste AA. Navegador.
- **AC-19 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` verdes.

## Rutas propuestas (GitHub Pages)
- `ricorp.cl/wstyle/reservar/` — flujo de reserva. Parámetros opcionales `?servicio=<id>&barbero=<id>`.
- `ricorp.cl/wstyle/cita/?id=<id>` — una cita (requiere sesión). Se usa **query string** (no `/cita/<id>`) para no depender de reescrituras: Pages solo sirve carpetas que existen.
- `ricorp.cl/wstyle/cuenta/` (entrar / crear cuenta), `/wstyle/cuenta/mis-citas/`, `/wstyle/cuenta/recuperar/?t=…`, `/wstyle/cuenta/confirmar/?t=…`.
- Facebook vuelve a la **API** (`FB_REDIRECT_URI` = `<API>/api/auth/facebook/callback`), que luego redirige al front (`/wstyle/reservar/…` o `/wstyle/cuenta/`). En local: `http://localhost:4000/api/auth/facebook/callback` registrado en la app de Meta (Meta acepta `localhost` en modo desarrollo).
- Cada ruta es una carpeta real en `dist/` (nueva entrada de Vite o copia del `wstyle/index.html` al estilo de `paginas-spa.mjs`). No se usa hash routing: las URLs van en correos y deben ser limpias. El `404.html` actual es una copia de la home de ricorp.cl; no se toca.
- CTA "Reservar": cuando la agenda propia esté activa, `site.json → booking` pasa a `{ "provider": "propio", "url": "/wstyle/reservar/" }`. `bookingLink()` ya prioriza `booking.url`, así que no cambia la regla; sí hay que ajustar `ext()`/los `<a>` para que una URL interna abra en la **misma pestaña** (hoy todo lo que no es `tel:` abre `_blank`). Coordinar con SPEC-26 (dueña de `links.ts`/CTA): si SPEC-26 cambia la firma de `bookingLink`, esta spec se adapta a ella. Mientras la agenda no esté activa (`booking.url` vacío), "Reservar" sigue yendo a WhatsApp.
- API bajo `/api/wstyle/...` (p.ej. disponibilidad, crear cita, ver/gestionar cita, ubicar dirección) y `/api/auth/...` (registro, login, Facebook, sesión). Base `VITE_API_URL`, igual que Contacto.

## Modelo de datos y consideraciones para escalar a Styluxe (solo diseño, no implementar Styluxe)
Objetivo: que WS Style funcione como **un negocio (tenant) dentro de un modelo multi-negocio**, para que un futuro "Uber de barberos" reutilice el dominio sin migraciones dolorosas. Nada de esto crea pantallas, marcas ni repos de Styluxe.

| Entidad | Campos clave | Nota de escalabilidad |
|---|---|---|
| `Business` | `_id`, `slug` (`ws-style`), `name`, `timezone` (`America/Santiago`), `currency` (`CLP`), `address`, `location` (GeoJSON Point), `hours[]`, `closures[]`, `settings` (anticipación, horizonte, plazo de cancelación, expiración) | Hoy existe uno solo. Todas las demás colecciones llevan `businessId` y todos los índices empiezan por él. |
| `Professional` | `_id`, `userId`, `displayName`, `phone`, `photos[]`, `bio`, `categories[]` (`barberia`), `homeService` (`enabled`, `surchargeCLP`, `radiusKm`, `travelBufferMin`), `baseLocation` (Point, opcional), `status` | **Independiente del Business**: en Styluxe un profesional puede trabajar solo, en varios locales o cambiarse. |
| `Membership` | `businessId`, `professionalId`, `role` (`owner`/`admin`/`member`), `status` (`pending`/`approved`/`rejected`/`suspended`) | La aprobación es por negocio, no global. Replica "Haces parte de NOMBRE LOCAL" / "Administrar local" de Styluxe. |
| `Service` | `businessId`, `professionalId` (null = de la carta del local), `name`, `priceCLP`, `durationMin`, `homeServiceAllowed`, `active`, `order` | Soporta carta del local (WS Style) y servicios propios del profesional (Styluxe). |
| `ProfessionalService` | `businessId`, `professionalId`, `serviceId`, overrides opcionales | Qué servicios de la carta hace cada barbero. |
| `AvailabilityRule` / `TimeOff` | `businessId`, `professionalId`, `weekday`, `start`, `end` / rangos de ausencia | |
| `User` | `_id`, `email` (único, minúsculas), `emailVerified`, `name`, `phoneE164`, `roles[]` (`client`/`barber`/`superadmin`), `identities[]` (`{provider: 'email', passwordHash}` · `{provider: 'facebook', providerUserId}`; índice único `{provider, providerUserId}`), `status`, `deletedAt` | **Global, sin `businessId`**: la persona es la misma en WS Style y en un futuro Styluxe. Agregar Google/Apple = otra entrada en `identities`. `superadmin` de plataforma vs. `owner` de un negocio se distinguen (este último vive en `Membership`). |
| `Session` / tokens | `userId`, hash del token, expiración, tipo (`session`/`verify_email`/`reset_password`) | Revocables desde el server. |
| `CustomerProfile` | `businessId`, `userId`, notas del local, contadores (citas, inasistencias) | Datos del cliente **por negocio**, separados del `User` global. |
| `Appointment` | `businessId`, `professionalId`, `customerUserId`, `customerSnapshot` (nombre, celular, email al reservar), `serviceSnapshot`, `startsAt`/`endsAt` (UTC), `location` (`shop`/`home` + dirección + Point + distancia), `pricing` (precio, recargo, total, `platformFeeRate`, `platformFeeCLP`), `payment` (método, estado; SPEC-35), `status`, `history[]`, `proposal`, `source` (`web`/`pro_invite`/`admin`) | `platformFeeRate` se congela por cita. |
| `SlotLock` | `businessId`, `professionalId`, `slotStart`, `appointmentId` | Índice único `{professionalId, slotStart}`: el profesional no puede estar en dos lugares aunque trabaje para dos negocios. |
| `Notification` | destinatario, canal, plantilla, estado de envío | Hoy correo; mañana push/WhatsApp API. |
| `PlatformSettings` | `defaultPlatformFeeRate`, proveedores de pago | Comisión de plataforma **configurable** (Styluxe usaba 20 %); para WS Style por defecto 0 % (asunción). |

Otras consideraciones (documentadas, no implementadas):
- **Geolocalización:** guardar `Point` + índice `2dsphere` desde ya en `Business`, `Professional.baseLocation` y `Appointment.location`, para que "barberos cerca de mí", radio real y ruteo sean consultas y no migraciones.
- **Distancia:** hoy línea recta desde el local; en Styluxe sería desde la ubicación del profesional o por ruta.
- **Pagos marketplace:** cobrar a nombre de cada profesional y retener comisión requiere el modelo marketplace del proveedor (en Mercado Pago, OAuth por vendedor + `marketplace_fee`). No aplica a WS Style (un solo vendedor); ver SPEC-35.
- **Identidad:** `User` único con roles por negocio (`Membership`) permite que un barbero de WS Style sea luego profesional Styluxe con la misma cuenta.
- **API versionable:** rutas bajo `/api/wstyle/...` hoy; el dominio vive en módulos sin "wstyle" en el nombre (servicios de disponibilidad, citas) para poder exponerlos luego como `/api/businesses/:slug/...`.

## Decisiones confirmadas (por el usuario)
- Se replica el **modelo de flujo** de Styluxe (servicio → calendario + hora → pago + ¿domicilio? → "esperando confirmación" → notificaciones con propuesta de cambio Modificar/Aceptar), con la dirección de arte de WS Style ("Noir de oficio"), web responsive (no app nativa).
- Domicilio: cada barbero define si hace domicilio, un recargo fijo y su radio en km; el cliente ingresa la dirección y ve el total antes de confirmar.
- Pagos con Mercado Pago Checkout Pro (SPEC-35), con estado de pago en la cita.
- Styluxe solo como consideración de modelado: no se construye nada de Styluxe.
- ✎ **Los clientes se registran con cuenta** (email + contraseña, o Facebook) y **agendar exige sesión**; el registro se puede completar dentro del flujo de reserva sin perder la selección.
- ✎ Modelo `User` con roles (`client`, `barber`, `superadmin`) e identidades vinculables (`email`, `facebook`), pensado para Styluxe. Credenciales de Facebook en `server/.env` (`FB_APP_ID`, `FB_APP_SECRET`).
- ✎ Instagram se documenta como **no viable hoy** (cierre de Basic Display API, dic-2024; la API actual solo sirve a cuentas business/creator); la vía social es Facebook Login con OAuth en el server y la app en modo desarrollo con testers hasta App Review.

## Asunciones pendientes de validar
1. Login con **Instagram** y con **Google** quedan fuera por ahora (Instagram no viable hoy; Google es gratis y viable, pero no fue pedido): ¿agregar Google como segunda vía social?
2. El cliente puede elegir "Sin preferencia" de barbero y el sistema asigna al que tenga esa hora libre con menos citas ese día.
3. Toda cita nueva espera confirmación del barbero (como Styluxe); si no confirma en 12 h o a 2 h del inicio, expira y se avisa al cliente.
4. Horas de inicio cada 15 min, mínimo 2 h de anticipación, máximo 30 días hacia adelante.
5. A domicilio se bloquean 30 min de traslado antes y después (configurable por barbero); el radio se mide en línea recta desde el local.
6. El cliente cancela en línea hasta 3 h antes (misma política "Inasistencias" del sitio); después, solo por WhatsApp.
7. Ante una propuesta de cambio del barbero el cliente puede aceptar, proponer otra hora o cancelar; sin respuesta en 12 h, la propuesta caduca y se mantiene la hora original.
8. Máximo 2 citas activas futuras por cuenta y por celular.
9. Las horas se muestran en formato 24 h ("16:30"), no am/pm como en Styluxe.
10. Notificaciones solo por correo (Resend) + links de WhatsApp que la persona toca; sin WhatsApp automático, SMS ni recordatorios programados en esta etapa.
11. "Agregar al calendario" (.ics) en la confirmación.
12. Comisión de plataforma para WS Style por defecto 0 % (el campo existe y es configurable por el super admin, SPEC-34).
13. Si la API está "dormida" (Render free), el cliente ve "Despertando la agenda…" hasta 30 s y luego la alternativa de WhatsApp.
14. Ubicación de direcciones con un geocodificador gratuito (p.ej. Nominatim/OpenStreetMap) desde el server; si no la encuentra, no se permite domicilio.
15. Se puede reservar con el email aún sin confirmar (no se corta el flujo); solo se muestra un aviso para confirmarlo.
16. Contraseña mínima: 8 caracteres con al menos una letra y un número.
17. Sesión de 30 días; la API se sirve en `api.ricorp.cl` para que la cookie de sesión sea del mismo sitio (si no, token en header).
18. Si alguien entra con Facebook y ya existe una cuenta con ese email, debe confirmar su contraseña para vincular (no se vincula automáticamente).
19. El cliente puede eliminar su cuenta; sus citas pasadas quedan anonimizadas y las futuras se cancelan.
20. "Huella"/passkeys de Styluxe quedan fuera.

## Dependencias
- **SPEC-24** (marca "WS Style") y **SPEC-26** (CTA/`links.ts`, `bookingLink`): esta spec cambia el destino del CTA solo vía `site.json → booking`.
- **SPEC-33**: barberos aprobados con disponibilidad, confirmar/proponer/iniciar/terminar. Sin barberos aprobados la reserva no tiene a quién asignar (para probar 32 sola, el seed de test crea barberos aprobados).
- **SPEC-34**: carta y horario del local servidos desde la API (mientras tanto, seed desde `services.json` y `site.json`).
- **SPEC-35** depende de esta spec (agrega `pendiente_pago` y "Pagar en línea").
- Infra local: Mongo como replica set de un nodo para transacciones (dev y test).
- Meta for Developers: app de Facebook (cuenta personal de Pedro, nunca de ordename) con Facebook Login, en modo desarrollo, `localhost` como dominio y al menos un usuario tester. Política de privacidad y URL de eliminación de datos publicadas antes de pasarla a "Live".
- **SPEC-36** (video tutorial) usa los flujos A–D de esta spec y los de registro del barbero de SPEC-33.
