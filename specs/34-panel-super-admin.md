# SPEC-34 — WS Style: panel del super admin (barberos, citas, carta, horario, estadísticas y pagos)

> Pedido del usuario (2026-10-25): "...y el panel administrativo del profesional y del super admin". Styluxe no tiene pantallas de super admin: esta spec lo define.
>
> El super admin es el dueño de Ricorp / WS Style. Usa el modelo `User` con roles de SPEC-32 (rol `superadmin`). Barbero → SPEC-33. Pagos → SPEC-35.
> Modo autónomo: lo no confirmado está en "Asunciones pendientes de validar".

## Estado actual
- La carta (`client/public/wstyle/content/services.json`) y el horario/contacto/políticas/membresía (`client/public/wstyle/content/site.json`) son **JSON estáticos** que la landing lee y que `client/scripts/prerender-wstyle.mjs` usa para generar el HTML (SEO, JSON-LD `openingHours`). Cambiar un precio hoy = editar el JSON y desplegar.
- No hay auth, roles ni panel. La referencia más cercana en Styluxe es "Administrar local" (miembros, estadísticas, contacto, horario de atención).

## Historia
Como **dueño de WS Style (super admin)** quiero **aprobar a los barberos que se registran, ver y gestionar todas las citas, mantener la carta y el horario del local, ver cómo va el negocio y configurar los pagos**, para **controlar quién atiende en mi nombre y operar el local sin tocar código**.

## Alcance
**Incluye**
- Creación del primer super admin por variables de entorno/seed (sin registro público de super admin).
- Panel en `ricorp.cl/wstyle/admin/` con: Barberos, Citas, Carta, Horario y cierres, Estadísticas, Configuración (pagos, comisión, reglas de agenda), Registro de auditoría.
- Migración de la carta y el horario de JSON estático a la BD, con lectura desde la API y fallback al JSON.
- Matriz de roles y autorización por endpoint para todo el dominio de SPEC-32/33/34/35.

**Fuera**
- Varios locales / multi-negocio (solo diseño en SPEC-32), varios super admins con permisos finos, facturación electrónica (SII), contabilidad, payouts a barberos, exportaciones avanzadas (solo CSV de citas), edición de textos de la landing (copy, titulares, marquee siguen en `site.json`).
- Cualquier pantalla o marca Styluxe.

## Reglas de negocio
- **RN-01 Primer super admin.** Al arrancar (o con `npm run seed:admin`), si no existe ningún `superadmin`, se crea desde `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` de `server/.env` (la contraseña se hashea; se recomienda cambiarla en el primer login). Si las variables no están, no se crea nada y se loguea un aviso. Nunca hay endpoint público para volverse super admin. Opcional: vincular Facebook a esa cuenta desde "Mi cuenta".
- **RN-02 Barberos.** Lista con filtros por estado (`pendiente`, `aprobado`, `rechazado`, `suspendido`) y búsqueda. Ficha: datos, fotos, servicios, disponibilidad, domicilio, citas, métricas.
  - **Aprobar** → puede operar y aparece en la reserva; correo de bienvenida.
  - **Rechazar** → motivo obligatorio (se le envía); puede volver a postular solo si el super admin lo "reabre".
  - **Suspender** → motivo obligatorio; deja de aparecer y de operar. Sus citas futuras **no se cancelan solas**: el panel muestra "Este barbero tiene N citas futuras" con acciones por cita: reasignar a otro barbero aprobado libre en esa hora (avisa al cliente), o cancelar (avisa y marca reembolso si estaba pagada).
  - **Reactivar** → vuelve a aprobado.
- **RN-03 Citas.** Todas las citas, filtros por fecha, barbero, estado, pago (método/estado), domicilio; búsqueda por cliente (nombre/celular/email). Acciones: confirmar, cancelar (motivo), reasignar barbero, proponer cambio, marcar inasistencia, marcar pago en el local como cobrado, crear una cita a nombre de un cliente (por teléfono) y exportar CSV. Toda acción respeta la máquina de estados de SPEC-32.
- **RN-04 Carta.** CRUD de servicios: nombre, descripción, precio CLP (entero > 0), duración (5–240 min, múltiplo de 5), ¿se puede a domicilio?, activo, orden. No se borran servicios con citas: se **archivan** (dejan de ofrecerse y de mostrarse). Cambios de precio no tocan citas existentes (precio congelado, SPEC-32 RN-09).
- **RN-05 Horario y cierres.** Horario semanal del local (por día: cerrado o uno o más rangos) y cierres puntuales (feriados, mantenimiento) con motivo. Reducir el horario o crear un cierre que choca con citas activas exige resolverlas antes (mismo patrón que SPEC-33 RN-05).
- **RN-06 Fuente de verdad de carta y horario.** Pasa a ser la BD. La landing pide `GET /api/wstyle/catalog` (servicios activos + horario + contacto) al cargar y reemplaza lo prerenderizado; si la API falla o tarda > 4 s, se queda con el JSON estático (fallback). Un script de seed importa `services.json` y `site.json → hours` a la BD la primera vez (idempotente por `id`). Botón "Exportar a JSON" en el panel genera los `services.json`/`hours` actuales para pegar en el repo cuando se quiera que el HTML prerenderizado (SEO, JSON-LD) quede al día — el panel **no** hace commits ni despliega.
- **RN-07 Estadísticas** (rango de fechas, por defecto el mes en curso, zona `America/Santiago`): citas por estado; ingresos = suma de totales de citas `terminada` (separando pagado en línea / en el local / pendiente de cobro); ticket promedio; servicios más pedidos; por barbero: citas, ingresos, ocupación (% de su disponibilidad reservada), cancelaciones e inasistencias; % domicilio; comisión de plataforma acumulada (si > 0). Gráficos simples + tabla.
- **RN-08 Configuración.**
  - Pagos (SPEC-35): habilitar "Pagar en línea" (Mercado Pago), habilitar "Pagar en el local", modo `sandbox`/`producción` solo informativo (las credenciales viven en `server/.env`, nunca se escriben desde el panel).
  - Comisión de plataforma % (0–50, por defecto 0 %): se congela en cada cita nueva; cambiarla no afecta citas existentes.
  - Reglas de agenda: anticipación mínima, horizonte, plazo de cancelación del cliente, expiración de pendientes/propuestas/invitaciones, máximo de citas activas por cliente (valores por defecto de SPEC-32/33).
- **RN-09 Auditoría.** Toda acción del super admin (aprobar, suspender, cancelar, reasignar, cambiar precio/horario/config, reembolsar) queda en un registro con quién, cuándo, qué y antes/después. Solo lectura.
- **RN-10 Notificaciones del super admin.** Correo y aviso en el panel: nuevo barbero por aprobar, cita cancelada por barbero, pago aprobado tardío/huérfano o reembolso pendiente (SPEC-35), barbero suspendido con citas.

### Roles y autorización por endpoint
Toda ruta valida sesión y rol **en el server**; el front solo oculta botones. Recursos ajenos responden 404 (no 403) para no revelar que existen.

| Recurso / acción | Anónimo | client | barber (aprobado) | barber (pendiente/suspendido) | superadmin |
|---|---|---|---|---|---|
| Catálogo público, horas libres | ✓ | ✓ | ✓ | ✓ | ✓ |
| Registro / login / Facebook | ✓ | — | — | — | — |
| Crear cita propia, ver/gestionar sus citas | — | ✓ (propias) | — | — | ✓ (todas) |
| Perfil, fotos, servicios, disponibilidad propios | — | — | ✓ | ✓ (sin publicar) | ✓ (de cualquiera) |
| Agenda, confirmar/mover/cancelar/iniciar/terminar, invitar | — | — | ✓ (propias) | ✗ 403 | ✓ (todas) |
| Aprobar/rechazar/suspender barberos | — | — | — | — | ✓ |
| Carta, horario, cierres, configuración | — | — | — | — | ✓ |
| Estadísticas | — | — | ✓ (solo propias) | — | ✓ (todas) |
| Reembolsos (SPEC-35) | — | — | — | — | ✓ |
| Auditoría | — | — | — | — | ✓ |
| Webhook de pagos (SPEC-35) | firma válida | | | | |

## Flujo principal
1. El dueño define `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` en `server/.env`, arranca el server (o `npm run seed:admin`), entra en `/wstyle/admin/` con ese email y contraseña.
2. **Inicio del panel**: tarjetas "Barberos por aprobar (N)", "Citas de hoy", "Pendientes de confirmar", "Reembolsos pendientes", "Ingresos del mes".
3. **Barberos → Por aprobar**: abre la ficha (fotos, servicios, disponibilidad, domicilio) → "Aprobar" o "Rechazar" (motivo) → correo al barbero.
4. **Carta**: edita el precio de "Corte" → guarda → la landing en :5173 muestra el nuevo precio al recargar (desde la API).
5. **Horario**: agrega un cierre "Fiestas Patrias" → esos días quedan "Sin disponibilidad" en la reserva.
6. **Citas**: filtra "hoy", ve todas las citas de todos los barberos; reasigna una cita de un barbero enfermo a otro libre.
7. **Estadísticas**: elige el mes → ve ingresos, ocupación por barbero, servicios top.
8. **Configuración**: activa "Pagar en línea" cuando SPEC-35 esté lista; deja comisión en 0 %.

## Casos borde
- **CB-01** No hay `SUPERADMIN_*` en `.env` → el server arranca igual, sin super admin, con aviso en log; `/wstyle/admin/` muestra "Panel no configurado".
- **CB-02** Ya existe un super admin y cambian `SUPERADMIN_EMAIL` → no se crea un segundo ni se pisa la contraseña existente (el seed solo crea si no hay ninguno).
- **CB-03** Suspender a un barbero con citas hoy → el panel obliga a pasar por la lista de citas afectadas (puede posponer la decisión, pero queda una alerta fija).
- **CB-04** Reasignar a un barbero que no hace ese servicio o no está libre → no aparece en las opciones; si se fuerza, 409.
- **CB-05** Archivar un servicio que el barbero tenía como único → el barbero deja de ser reservable; aviso al super admin.
- **CB-06** Precio 0, negativo, con decimales o duración no múltiplo de 5 → 400 con mensaje.
- **CB-07** API caída → la landing muestra la carta del JSON (fallback) sin error visible; el panel de admin muestra error reintentable.
- **CB-08** JSON estático y BD difieren → manda la BD en runtime; el panel muestra "El HTML publicado tiene precios distintos a los actuales. Exporta el JSON para actualizarlo."
- **CB-09** Dos pestañas del admin editando el mismo servicio → control de versión (`updatedAt`): la segunda recibe 409 "Este servicio cambió mientras lo editabas".
- **CB-10** Estadísticas en un rango que cruza cambio de horario → días calculados en `America/Santiago`, sin perder ni duplicar horas.
- **CB-11** El super admin intenta quitarse el rol a sí mismo o suspender su propia cuenta → bloqueado (siempre debe quedar al menos un super admin).

## Criterios de aceptación
Tests de server con `node --test` contra BD de test real (`pagina_personal_test`, replica set de un nodo), mailer dry-run. Navegador en `http://localhost:5173/wstyle/admin/`.

- **AC-01 Seed del super admin.** Con `SUPERADMIN_EMAIL/PASSWORD` y sin super admins → se crea uno (contraseña hasheada); con uno existente → no crea otro ni cambia su contraseña; sin variables → no crea y loguea aviso. Test de server.
- **AC-02 Matriz de autorización.** Un test recorre **cada endpoint** de la API con cada rol de la tabla (anónimo, client, barber aprobado, barber pendiente, superadmin) y verifica 200/401/403/404 según la matriz. Test de server.
- **AC-03 Ciclo de vida del barbero.** Aprobar, rechazar (motivo obligatorio), suspender (motivo obligatorio), reactivar: cambian la `Membership`, envían el correo y dejan auditoría; un suspendido desaparece de la disponibilidad pública. Suspender con citas futuras las lista sin cancelarlas. Test de server.
- **AC-04 Citas del admin.** Filtros (fecha, barbero, estado, pago) devuelven lo correcto; reasignar valida servicio y disponibilidad del nuevo barbero y mueve los bloques de agenda en la misma transacción; CSV exporta las columnas acordadas. Test de server.
- **AC-05 Carta.** CRUD con validaciones (CB-06); archivar en vez de borrar si hay citas; cambio de precio no altera citas existentes; conflicto de versión → 409. Test de server.
- **AC-06 Horario y cierres.** Un cierre deja esos días sin horas en SPEC-32; reducir horario con citas afectadas → 409 con la lista. Test de server.
- **AC-07 Migración y fallback.** El seed importa `services.json` y `site.json → hours` (idempotente: correrlo dos veces no duplica). `GET /api/wstyle/catalog` devuelve lo de la BD. En el navegador: con API arriba, cambiar un precio en el panel y recargar la landing muestra el nuevo; con API apagada, la landing muestra la carta del JSON sin errores visibles. "Exportar a JSON" produce un archivo con el mismo formato que `services.json`.
- **AC-08 Estadísticas.** Con un seed de citas conocido, los totales (por estado, ingresos por método, ocupación por barbero, servicios top) coinciden con los valores esperados calculados a mano; rango en `America/Santiago`. Test de server.
- **AC-09 Configuración.** Cambiar comisión aplica solo a citas nuevas; deshabilitar "Pagar en línea" la quita del paso 4 de la reserva; las credenciales de pago no se pueden leer ni escribir desde ningún endpoint. Test de server.
- **AC-10 Auditoría.** Cada acción de RN-09 genera un registro con actor, fecha, acción y antes/después; no hay endpoint para editarlos o borrarlos. Test de server.
- **AC-11 Panel en el navegador.** Login como super admin → aprobar un barbero pendiente de seed → aparece en `/wstyle/reservar/`; editar precio; crear cierre; ver estadísticas del mes. Capturas 1440 px y 390 px.
- **AC-12 Rutas.** Recargar `/wstyle/admin/` y sus secciones funciona en `vite preview`; `/wstyle/admin/` no se enlaza desde la landing y lleva `noindex`.
- **AC-13 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` verdes.

## Decisiones confirmadas (por el usuario)
- El super admin aprueba a los barberos (registro abierto, queda pendiente hasta aprobación).
- Pagos con Mercado Pago Checkout Pro; el super admin configura pagos y comisión.
- Diseño WS Style ("Noir de oficio"), web responsive.
- ✎ Modelo `User` con roles (`client`, `barber`, `superadmin`) e identidades vinculables (`email`, `facebook`) de SPEC-32; el super admin es un `User` con rol `superadmin`.

## Asunciones pendientes de validar
1. Hay **un solo super admin** (el dueño), creado desde `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` en `server/.env`.
2. Suspender a un barbero **no cancela** sus citas futuras automáticamente: el admin decide cita por cita (reasignar o cancelar).
3. Un barbero rechazado no puede volver a postular salvo que el admin lo reabra.
4. Carta y horario pasan a la BD; la landing los lee de la API con fallback al JSON, y el panel ofrece "Exportar a JSON" para actualizar el HTML prerenderizado (el panel no despliega).
5. Los servicios con citas se archivan, no se borran.
6. Comisión de plataforma por defecto 0 % para WS Style (configurable 0–50 %).
7. El barbero ve solo sus propias estadísticas.
8. Estadísticas solo en pantalla + CSV de citas; sin reportes PDF ni contabilidad.
9. Textos de la landing (titulares, copy, políticas, membresía) siguen en `site.json`; el panel no los edita.
10. `/wstyle/admin/` sin enlace público y con `noindex`.

## Dependencias
- **SPEC-32** (modelo, máquina de estados, `User`/roles/sesión) y **SPEC-33** (barberos, membresías).
- **SPEC-35** para "Pagar en línea", reembolsos y alertas de pagos.
- **SPEC-24/26**: la landing que pasa a leer la carta desde la API sigue usando la marca y los CTA de esas specs.
- `client/scripts/prerender-wstyle.mjs`: sigue leyendo el JSON (fallback/SEO).
