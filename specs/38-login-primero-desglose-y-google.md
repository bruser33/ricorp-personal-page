# SPEC-38 — WS Style: iniciar sesión antes de agendar, desglose de cobros "como Uber" (servicio + tarifa de servicio) y login con Google

> Pedido del usuario (2026-10-25): "Haz que para agendar una cita sea necesario primero iniciar sesión, también en el desglose de precios pon el precio del corte, más el costo de mantener las cuentas de pago y el 10 por ciento por administrar la página para el ingeniero" y "Haz login con Google".
>
> Cambio de diseño del usuario (2026-10-25, mismo día): **"como Uber"** — UNA sola línea "Tarifa de servicio" que junta la administración (10 %) y el costo de los pagos, **igual pague en el local o en línea**; el total no cambia al cambiar la forma de pago. Reemplaza la versión anterior de esta spec (línea de procesamiento solo "en línea").
>
> **Enmienda** a SPEC-32 (flujo de reserva, RN-08, RN-25, asunción 1 y 12), SPEC-34 (configuración RN-08), SPEC-35 (RN-02 monto, RN-12 comisión) y SPEC-37 (detalle de la venta y montos de la rendición). Lo que no se menciona acá sigue igual.
> Modo autónomo: las decisiones vienen del orquestador (ver "Decisiones tomadas"); lo que necesita validación externa está en "Pendiente de decidir".

## Estado actual (antes de esta spec)
- `/wstyle/reservar/` muestra los pasos 1–3 sin sesión y pide la cuenta en el **paso 4** ("Tu cuenta y pago"), dentro de `AuthPanel` (email + Facebook). El server ya exige sesión en `POST /api/wstyle/appointments` (401 `unauthorized` en `routes/wstyle.js`).
- Precio de una cita (`agenda.create`): `totalCLP = priceCLP + surchargeCLP`. La comisión de plataforma (`PlatformSettings.defaultPlatformFeeRate`, por defecto **0 %**) se guarda como `pricing.platformFeeCLP` pero **no se cobra** al cliente (SPEC-35 RN-12).
- Mercado Pago cobra su comisión al vendedor; el cliente paga solo el total de la cita.
- Login social: solo Facebook (`/api/auth/facebook/*`). Google estaba fuera (SPEC-32 asunción 1).

## Historia
Como **cliente de WS Style** quiero **entrar a mi cuenta (con correo, Facebook o Google) antes de elegir mi hora y ver exactamente qué pago —el corte y una tarifa de servicio clara, igual pague como pague—**, para **no tener sorpresas al final**; y como **dueño** quiero **que lo que cobra Mercado Pago y el 10 % de administración del ingeniero salgan del cliente y no de la ganancia del barbero**.

## Alcance
**Incluye**
1. Puerta de sesión al inicio de `/wstyle/reservar/` (antes del paso 1). El asistente de 4 pasos solo con sesión.
2. Desglose de cobros en la reserva ("Tu reserva", paso 3 a domicilio y paso 4), en la cita (`/wstyle/cita/`), "Mis citas", los correos de la cita, el panel del barbero y el del super admin (ficha, CSV, pagos/rendición, estadísticas).
3. **Tarifa de servicio** (como Uber) sumada al total del cliente = administración de la plataforma (10 % por defecto) + costo de pagos (comisión de Mercado Pago 3,19 % + IVA con *gross-up*), ambas configurables por el super admin. Igual en el local y en línea.
4. El cliente ve una sola línea; el admin, la rendición y el CSV ven las dos partes por separado.
5. "Continuar con Google" (OAuth 2.0 / OpenID Connect en el server), vinculación por email verificado, en `/wstyle/cuenta/` y dentro de la reserva.
6. Política de privacidad, `server/.env.example` y `render.yaml` con Google.

**Fuera**
- Cambiar los precios de la carta en la landing (siguen "desde $X", el precio del servicio).
- Google para el registro de barberos (`/wstyle/pro/registro/`) y para el panel admin: solo clientes en esta spec.
- One Tap / Google Identity Services en el navegador (todo pasa por el server).
- Desvincular proveedores desde "Mi cuenta" (hoy tampoco existe para Facebook).
- Desplegar: todo se valida en local.

## Reglas de negocio

### Sesión primero (enmienda SPEC-32 flujo principal y RN-08)
- **RN-01 Puerta de sesión.** Sin sesión, `/wstyle/reservar/` muestra "Reserva tu hora" + "Para agendar, primero entra a tu cuenta" + `AuthPanel` (correo, Facebook y Google si están configurados). Los 4 pasos (Servicio · Día y hora · Dónde · Confirmar) aparecen solo con sesión. Mientras se consulta la sesión: "Cargando…"; si la API no responde: el aviso reintentable con WhatsApp (CB-15 de SPEC-32).
- **RN-02 La selección sobrevive al login.** Un deep link (`?servicio=corte&barbero=<id>`) o una selección guardada se conserva: el `returnTo` que viaja firmado en el `state` de Facebook/Google es `/wstyle/reservar/?<selección>` y además se guarda en `sessionStorage` antes de salir del sitio. Al volver con sesión, el asistente abre en el paso que corresponde (servicio elegido → paso 1 con el servicio marcado; servicio + barbero → paso 2; etc.).
- **RN-03 Paso 4 sin "Tu cuenta".** El paso 4 pasa a llamarse **"Confirmar y pagar"**: "Agendando como <nombre> · <email> (¿no eres tú? Cerrar sesión)", celular **solo si la cuenta no tiene** (sigue siendo obligatorio, SPEC-32 RN-08; Google y Facebook no lo entregan), nota, forma de pago, políticas → "Agendar cita" / "Ir a pagar $<total>".
- **RN-04 Sesión vencida a mitad de la reserva.** Si el POST responde 401, la página vuelve a la puerta de sesión **conservando paso y selección**; al entrar de nuevo vuelve al paso 4 (CB-23 de SPEC-32).
- **RN-05 Cuenta sin rol cliente.** Un barbero/admin sin rol `client` ve, en la puerta, "Tu cuenta es de barbero o administración" + "Agendar como cliente" (antes estaba en el paso 4).
- **RN-06 El server sigue siendo la autoridad.** `POST /api/wstyle/appointments` sin sesión → 401 `unauthorized` (ya existía; se agrega test explícito).

### Desglose de cobros "como Uber" (enmienda SPEC-32 RN-07/RN-09, SPEC-34 RN-08, SPEC-35 RN-02/RN-12)
Lo que ve el **cliente** (reserva, cita, "Mis citas", correos), en CLP enteros:

```
Corte ..................... $12.000
Tarifa de servicio ........ $1.721
  administración 10 % + costo de pagos
Total ..................... $13.721
```

Cómo se calcula (las dos partes se guardan por separado en la cita):

| Parte | Cálculo |
|---|---|
| **Servicio** | `priceCLP` de la carta al reservar |
| **Domicilio** (si aplica) | `surchargeCLP` del barbero (existente) |
| Administración de la plataforma | `platformFeeCLP = round(base × %admin)`, con `base = servicio + domicilio` |
| Costo de pagos | `paymentFeeCLP = ceil((base + admin) / (1 − t)) − (base + admin)`, con `t = %MP × 1,19` si "cobrar IVA de la comisión" está activo (si no, `%MP`) |
| **Tarifa de servicio** (lo que ve el cliente) | `serviceFeeCLP = platformFeeCLP + paymentFeeCLP` |
| **Total** | `base + serviceFeeCLP` |

- **RN-07 Redondeo.** Cada parte se redondea una sola vez y el total es la suma. Administración: `Math.round` (.5 hacia arriba). Costo de pagos: hacia arriba (al negocio nunca le llega menos que `base + admin`). Los % se pasan a enteros antes de operar (admin en centésimas de punto: 10 % = 1000; MP en millonésimas: 3,19 % = 31 900; ×1,19 = 37 961) para que server y client den exactamente el mismo número.
- **RN-08 Configuración (super admin, `/wstyle/admin/configuracion/` → "Tarifa de servicio").**
  - "Administración de la plataforma (%)" = el campo existente `platformFeePercent` (`PlatformSettings.defaultPlatformFeeRate`). **Default pasa de 0 % a 10 %.** Límites existentes: 0–50, hasta 2 decimales.
  - **Nuevo** "Comisión de Mercado Pago (%)" = `paymentFeePercent` (`PlatformSettings.paymentFeeRate`), default **3,19 %** (tarifa Checkout del dueño, dinero disponible al instante). Límites 0–10, hasta 2 decimales. 0 = sin costo de pagos.
  - **Nuevo** "Cobrar también el IVA (19 %) de la comisión de Mercado Pago" = `paymentFeeVat`, default **sí**.
  - Validación como el resto: número finito en rango con ≤ 2 decimales, booleano estricto, campos desconocidos → 400; cada cambio queda en la auditoría (antes/después).
- **RN-09 Migración de defaults (idempotente).** Al arrancar el server (`index.js`) y en `npm run seed`, `ensurePlatformDefaults()`:
  - si no existe `PlatformSettings{key:'default'}` lo crea con 10 % / 3,19 % / IVA sí;
  - si existe y **nunca pasó por esta migración** (`appliedDefaults` sin `spec38`): pone `defaultPlatformFeeRate = 0.10` **solo si sigue en 0**, completa `paymentFeeRate`/`paymentFeeVat` si faltan y marca `spec38`;
  - ya marcado no toca nada: si el admin luego pone 0 %, se respeta en cada reinicio.
- **RN-10 El cliente paga la tarifa; el barbero no pierde.** La ganancia del barbero es `servicio + domicilio` (`pricing.barberCLP`), sin descuentos. El panel del barbero dice: "El cliente paga aparte una tarifa de servicio (administración de la plataforma X % + costo de pagos). Tu parte es el precio del servicio más el domicilio." (Antes decía "WS Style retiene un X %".)
- **RN-11 Igual en el local y en línea (decisión del usuario).** La tarifa no depende de la forma de pago: cambiar "Pagar en el local" ↔ "Pagar en línea" en el paso 4 no cambia el total; tampoco "Cambiar a pagar en el local" en la cita (`pay_local`). `pricing.paymentMethod` solo registra la forma elegida.
- **RN-12 Precio congelado (SPEC-32 RN-09).** La cita guarda todas las partes y tasas: `pricing = { priceCLP, surchargeCLP, barberCLP, platformFeeRate, platformFeeCLP, paymentFeeRate, paymentFeeVat, paymentFeeCLP, serviceFeeCLP, paymentMethod, totalCLP, feesIncluded: true }`. Cambiar la configuración después no cambia citas existentes.
- **RN-13 Citas antiguas.** Las citas sin `feesIncluded` (anteriores a esta spec) se muestran como antes (Servicio, Domicilio, Total); su `platformFeeCLP` era un dato interno que el admin ve como "Comisión interna (no cobrada al cliente)".
- **RN-14 Monto de Mercado Pago = total mostrado.** `unit_price` de la preferencia = `pricing.totalCLP`. El webhook acepta solo ese monto (SPEC-35 CB-07).
- **RN-16 Cobro en el local.** El barbero cobra el **total** ("¿Cobraste $13.721?"). La tarifa de servicio la rinde el local a la plataforma; ese traspaso queda fuera del sistema. En el local el "costo de pagos" igual se cobra (es una tarifa uniforme, no un recargo por medio de pago).
- **RN-17 Reembolsos.** Siguen siendo **totales** (SPEC-35 RN-09): se devuelve todo lo pagado, tarifa incluida.
- **RN-18 Respaldo tributario (SPEC-37).** Una sola venta por el total. El detalle de la venta (`saleLines`) tiene hasta 4 líneas: Servicio, Recargo por domicilio, Administración de la plataforma, Costo de pagos; la suma = total. Neto/IVA sobre el total, como hoy. Pagos, rendición y "Por cobrar" usan el total.
- **RN-19 Admin.** Ficha de la cita: servicio, domicilio, **administración** y **costo de pagos** por separado + "Parte del barbero". CSV de citas: columnas `Comisión` (administración), `Procesamiento pago` y `Parte del barbero`. Estadísticas: "Ingresos" = suma de totales; tarjetas "Administración de la plataforma", "Costo de pagos cobrado" y "Parte de los barberos"; por barbero `earningsCLP`.
- **RN-20 Catálogo.** La landing y la carta siguen mostrando el precio del servicio. En la reserva, el resumen "Tu reserva" muestra Servicio, (Domicilio), Tarifa de servicio y Total **desde el paso 1**, y debajo: "El total incluye la tarifa de servicio: la administración de la plataforma (10 %) y el costo de procesar los pagos. Es la misma si pagas en el local o en línea." `GET /api/wstyle/catalog` expone `business.pricing = { platformFeePercent, paymentFeePercent, paymentFeeVat }` para calcular el resumen con la misma fórmula (el server recalcula y manda).
- **RN-21 Invitaciones del barbero y citas creadas por el admin** (SPEC-33/34) llevan la misma tarifa de servicio.

### Ejemplo resuelto (Corte $12.000, configuración por defecto)
| Parte | Monto |
|---|---:|
| Servicio | $12.000 |
| Administración de la plataforma (10 % de $12.000) | $1.200 |
| Costo de pagos | $521 |
| **Tarifa de servicio** (lo que ve el cliente) | **$1.721** |
| **Total** (en el local o en línea) | **$13.721** |

Costo de pagos: tasa efectiva = 3,19 % × 1,19 = 3,7961 %. `ceil(13.200 / (1 − 0,037961)) = ceil(13.200 / 0,962039) = ceil(13.720,85…) = 13.721` → $521. Comprobación: si se paga en línea, Mercado Pago descuenta 13.721 × 3,7961 % = $520,86 (≈ $521) → al negocio le quedan $13.200 = servicio + administración. El barbero gana $12.000; la plataforma $1.200.

A domicilio (Corte $12.000 + domicilio $3.000): base $15.000 · administración $1.500 · costo de pagos $652 · **tarifa de servicio $2.152** · **total $17.152**; el barbero gana $15.000.

### Login con Google (enmienda SPEC-32 RN-18, RN-24 y asunción 1)
- **RN-22 Flujo.** OAuth 2.0 Authorization Code + OpenID Connect **en el server**, igual que Facebook:
  `GET /api/auth/google/start?r=<returnTo>` → cookie `ws_gg_nonce` (httpOnly, 10 min, `SameSite=Lax`) + `state` firmado (`{r, n, exp}`) → `https://accounts.google.com/o/oauth2/v2/auth?client_id&redirect_uri&response_type=code&scope=openid email profile&state&nonce&prompt=select_account`
  → `GET /api/auth/google/callback?code&state` → el server canjea el `code` en `https://oauth2.googleapis.com/token` con `GOOGLE_CLIENT_SECRET` y valida el `id_token`.
- **RN-23 Validación del id_token.** Se recibe directo del token endpoint por TLS (OIDC Core 3.1.3.7: en ese caso la validación TLS reemplaza la de la firma). Se exige: `iss` ∈ {`https://accounts.google.com`, `accounts.google.com`}, `aud` = `GOOGLE_CLIENT_ID`, `exp` > ahora, `sub` presente, `nonce` = la cookie, **`email_verified === true`** y `email` presente. Cualquier fallo → no se crea sesión y se vuelve con `?gg=error`.
- **RN-24 Cuentas.** `User.identities[]` admite `google` (`providerUserId` = `sub`).
  - Ya existe un usuario con esa identidad Google → entra.
  - No existe y el email es nuevo → crea `User` (rol `client`, `emailVerified: true`, nombre de Google) y entra; el celular se pide en el paso 4 / "Mi cuenta" (como Facebook).
  - El email ya tiene cuenta **con contraseña** → no se vincula en silencio: "Ya tienes una cuenta con <email>. Ingresa tu contraseña para vincular Google." (`POST /api/auth/google/link`, mismo límite de intentos que el login).
  - El email ya tiene cuenta **sin contraseña** (solo Facebook) → como Google verificó que la persona controla ese correo, se vincula y entra, y el email queda verificado.
- **RN-25 Configuración.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (prod: `https://api.ricorp.cl/api/auth/google/callback`; local: `http://localhost:<PORT>/api/auth/google/callback`). Sin las tres, `GET /api/auth/config` responde `google: false` y el botón no aparece. El secreto nunca sale del server ni entra al bundle.
- **RN-26 Eliminación de datos.** Google no tiene "callback de eliminación" como Meta: se cubre con "Eliminar mi cuenta" (borra la identidad Google) y con la revocación desde la cuenta de Google (`myaccount.google.com/permissions`). No se guardan tokens de Google (solo el `sub`).
- **RN-27 Mensajes.** `?gg=error` → "No se completó el inicio con Google. Puedes intentarlo de nuevo o usar tu correo."; `?gg=no_disponible` → "El inicio con Google aún no está disponible. Usa tu correo."

## Flujo principal
1. Landing → "Reservar" (o "Reservar" en un servicio → `?servicio=corte`).
2. Sin sesión: puerta "Para agendar, primero entra a tu cuenta" → Correo / Facebook / Google.
3. Con Google: Google → "Elige una cuenta" → vuelve a `/wstyle/reservar/?servicio=corte&gg=nuevo` → asistente en el paso 1 con "Corte" marcado.
4. Pasos 1–3 como hoy; el resumen "Tu reserva" muestra Servicio $12.000, Tarifa de servicio $1.721 (administración 10 % + costo de pagos), Total $13.721 y la nota de RN-20.
5. Paso 4 "Confirmar y pagar": celular si falta, nota, forma de pago. El total **no cambia** al elegir "Pagar en línea"; el botón dice "Ir a pagar $13.721" (o "Agendar cita" en el local).
6. Server recalcula el precio, crea la cita con el desglose congelado; en línea, la preferencia de Mercado Pago es por el mismo total.

## Casos borde
- **CB-01** Deep link + login con Facebook o Google → la selección vuelve intacta (en el `state` y en `sessionStorage`).
- **CB-02** Sesión vence en el paso 4 → puerta de sesión; tras entrar, de vuelta en el paso 4 con todo igual.
- **CB-03** Admin cambia los % mientras el cliente está en el paso 4 → el server usa los valores vigentes al crear y la cita guarda los suyos; la página muestra el total real de la cita en la confirmación y Mercado Pago cobra ese total.
- **CB-04** `paymentFeePercent = 0` → la tarifa es solo la administración; ambos en 0 → no hay línea de tarifa y el total es el servicio.
- **CB-05** Cambio a pagar en el local (`pay_local`) → el total no cambia. Un pago en línea por otro monto → alerta "monto distinto" (SPEC-35 CB-07).
- **CB-06** Google con `email_verified: false` → no crea cuenta ni sesión (`?gg=error`).
- **CB-07** `state` alterado/vencido, sin cookie de nonce, o `nonce` del id_token distinto → no crea sesión (`?gg=error`).
- **CB-08** `error=access_denied` (la persona canceló en Google) → `?gg=error`. Otro error de Google o del token endpoint → `?gg=no_disponible`.
- **CB-09** Google sin configurar → `/api/auth/google/start` redirige con `?gg=no_disponible` y el botón no se muestra.
- **CB-10** Doble migración / dos instancias arrancando → `ensurePlatformDefaults` usa updates condicionados y es idempotente.

## Criterios de aceptación
Server con `node --test` contra Mongo real (replica set, BD `*_test`); Google y Mercado Pago son servicios externos y se simula **solo su borde HTTP** (fetch inyectado). Navegador con Playwright propio contra el stack local.

- **AC-01 Puerta (server).** `POST /api/wstyle/appointments` sin cookie → 401 `unauthorized` y no se crea nada.
- **AC-02 Puerta (client).** Sin sesión, `/wstyle/reservar/?servicio=corte` muestra el `AuthPanel` y ningún paso; con sesión, el asistente con "Corte" marcado (test de componente + navegador).
- **AC-03 Desglose (matemática).** Tests unitarios **iguales en server y client** (mismos vectores): con/sin domicilio; 12.000 → admin 1.200 / pagos 521 / tarifa 1.721 / total 13.721; 15.000 → 1.500 / 652 / 2.152 / 17.152; 18.000 → 20.582; sin IVA → 435; % = 0; redondeo .5 de la administración; el total = suma de las partes; el mismo total en el local y en línea; el costo de pagos deja al negocio ≥ base + admin y es el mínimo que lo logra.
- **AC-04 Cita congelada.** Crear guarda todas las partes y tasas; cambiar los % después no cambia la cita (una nueva sí usa los nuevos). Correo al cliente con "Tarifa de servicio: $1.721 (administración 10 % + costo de pagos)"; al barbero, además, "Tu parte".
- **AC-05 Mercado Pago.** La preferencia de una cita en línea (Corte, configuración por defecto) tiene `unit_price = 13721 = pricing.totalCLP`; un pago por 13.200 no la marca pagada; por 13.721 sí. `pay_local` deja el total en 13.721.
- **AC-06 Configuración.** `GET/PUT /api/admin/settings` con `paymentFeePercent` y `paymentFeeVat`: valores válidos se guardan y auditan; `-1`, `10.01`, `'3'`, `3.199`, `paymentFeeVat: 'si'` → 400 por campo.
- **AC-07 Migración.** `ensurePlatformDefaults` crea los defaults, sube 0 → 10 % una sola vez, respeta un 5 % existente, y después de marcada respeta un 0 % puesto por el admin.
- **AC-08 Google feliz.** Con el token endpoint simulado: `start` deja cookie de nonce y redirige a Google con `scope=openid email profile`, `state` y `nonce`; `callback` crea `User` con identidad `google`, `emailVerified: true`, sesión, y vuelve al `returnTo` con `gg=nuevo`; un segundo login entra a la misma cuenta (`gg=ok`).
- **AC-09 Google rechazos.** `email_verified: false` → sin usuario ni sesión; `state` alterado, nonce de cookie distinto o `nonce` del id_token distinto → sin sesión, `gg=error`; `aud` ajeno → sin sesión; `access_denied` → `gg=error`.
- **AC-10 Google vinculación.** Email existente con contraseña → `gg=vincular` + token; `POST /api/auth/google/link` con contraseña correcta vincula y crea sesión, con incorrecta 401. Email existente solo Facebook → se vincula y entra.
- **AC-11 Secretos.** `GOOGLE_CLIENT_SECRET` no aparece en respuestas, logs de test ni en `client/dist` (grep).
- **AC-12 Navegador.** En el stack local: usuario nuevo → la reserva pide entrar primero → crea cuenta → asistente → Corte → el resumen muestra Corte $12.000 · Tarifa de servicio $1.721 · Total $13.721; al alternar "Pagar en el local" ↔ "Pagar en línea" el total sigue en $13.721 (botón "Ir a pagar $13.721" / "Agendar cita"). Capturas del resumen a 1440 y 390 px.
- **AC-13 Gates.** `cd server && npm test`; `cd client && npm run lint && npm test && npm run build` en verde.

## Decisiones tomadas
Del usuario:
- ✎ **"Como Uber"**: una sola "Tarifa de servicio" para el cliente (administración + costo de pagos), igual en el local y en línea; el admin ve las dos partes.

Del orquestador (2026-10-25):
1. La sesión se pide **antes** del paso 1 (no en el paso 4) y el paso 4 pierde "Tu cuenta" pero conserva el celular cuando falta.
2. La administración es la configuración existente `platformFeePercent`, ahora **cobrada al cliente**, default 10 %, sobre servicio + domicilio.
3. El "costo de mantener las cuentas de pago" = la comisión de Mercado Pago Checkout (3,19 % + IVA, dinero al instante) con *gross-up*; configurable (% e IVA sí/no).
4. La ganancia del barbero no cambia (servicio + domicilio).
5. Redondeo por parte; total = suma.
6. Google con OAuth en el server, verificando el `id_token` recibido por TLS (sin descargar las llaves JWKS), exigiendo `email_verified`.
7. Google se vincula automáticamente solo a cuentas sin contraseña; con contraseña se pide confirmarla (como Facebook).
8. Los tests heredados de SPEC-32…37 siembran comisiones 0 % (aíslan su objetivo y sus montos fijos); los de esta spec usan los defaults reales (10 % / 3,19 % / IVA).

## Pendiente de decidir (NO decidido acá; requiere a una persona)
1. **Ley del Consumidor (Ley 19.496, precio total).** La reserva muestra el total con la tarifa **antes** de agendar (resumen desde el paso 1 y en el paso 4), pero la landing y la carta siguen mostrando "Corte $12.000". Validar con un abogado si eso basta o si la carta debe mostrar el precio final (o una nota "+ tarifa de servicio").
2. **Costo de pagos cobrado también en el local.** Al ser una tarifa uniforme mostrada de antemano, ya no es un recargo por pagar con tarjeta; aun así, en pagos en efectivo el local cobra un "costo de pagos" que no tiene. Confirmar que es aceptable comercialmente (o poner `paymentFeePercent` en 0 y absorberlo).
3. **Tributario (SII).** El 10 % "para el ingeniero" y el costo de pagos se cobran dentro de la misma venta de WS Style y entran en la boleta/voucher por el total. Cómo se le paga después al ingeniero (factura o boleta de honorarios de él al local) y el tratamiento de la tarifa como parte del precio afecto: **validar con un contador**.
4. **Reembolsos.** Se devuelve el total, tarifa incluida; si Mercado Pago no devuelve su comisión, el local la pierde. ¿Devolver menos en algunos casos?
5. **Google Cloud.** Crear el cliente OAuth (tipo "Aplicación web") en la cuenta personal de Pedro, pantalla de consentimiento con la Política de privacidad (`ricorp.cl/wstyle/privacidad/`) y publicar la app (scopes básicos: no requiere revisión de seguridad).

## Dependencias
- SPEC-32, 34, 35, 37 (enmendadas). SPEC-36 (video tutorial) deberá regrabar la reserva: la cuenta ahora va primero.
- Render: variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (`sync: false`).
