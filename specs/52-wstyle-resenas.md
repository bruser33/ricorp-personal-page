# SPEC-52 — WS Style: reseñas de clientes en el inicio

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "agregar un apartado para que las personas den reseñas que se mostrarán al inicio del sitio web". Las decisiones se tomaron con el usuario.

## Estado actual
- La landing (`client/src/wstyle/App.tsx`) tiene un capítulo "Lo que dicen" (`id="resenas"`) que renderiza `Reviews` (`components/Extras.tsx`, estilos en `Extras.css`) desde `site.json → reviews`.
  - Ese bloque está **apagado** (`enabled` ausente o false) y solo tiene textos de ejemplo. La regla actual es "no se muestra relleno".
  - La numeración de capítulos (`chapters`) se salta los capítulos apagados.
- Las citas (`Appointment`, `server/src/models/index.js`) terminan en `terminada` cuando el barbero marca "Terminar" (acción `finish`, `server/src/domain/agenda.js`). Este es el estado "atendida" de esta spec. Otros estados finales: `cancelada`, `expirada` y `no_asistio`.
- Al terminar una cita ya se envía un **correo al cliente** "Gracias por venir" (`notify(b, appt, 'client', 'finished')`, `server/src/lib/emails.js`). No hay envío automático por WhatsApp (solo enlaces `wa.me`).
- El cliente tiene cuenta (`User`, rol `client`) y la página "Mis citas" (`/wstyle/cuenta/mis-citas/`, `agenda/pages/AccountPages.tsx`), con "Próximas" y "Pasadas".
- El panel del super admin (`/wstyle/admin/`, secciones en `admin/util.ts`) tiene registro de auditoría (`AuditLog`).

## Historia
Como **cliente que ya se atendió en WS Style** quiero **dejar una reseña con estrellas y un comentario**, para **contar mi experiencia y ayudar a otros a decidirse**.
Como **visitante**, quiero **ver en el inicio del sitio lo que opinan clientes reales** para **confiar antes de reservar**.
Como **dueño (super admin)** quiero **que las reseñas se publiquen solas y poder ocultar las inapropiadas** para **tener prueba social sin moderar cada una**.

## Alcance
**Incluye**
1. **Modelo de reseña** en la BD, vinculado a una cita `terminada` (una reseña por cita). Guarda:
   - estrellas (1–5) y comentario;
   - nombre a mostrar (nombre de pila + inicial del apellido) y nombre del servicio (copiados al crear la reseña);
   - fecha;
   - estado visible u oculta, con quién la ocultó, cuándo y el motivo.
2. **Invitación a reseñar**:
   - el correo "Gracias por venir" que ya existe suma un botón "Deja tu reseña" con enlace a `/wstyle/cuenta/resena/?cita=<id>`;
   - en "Mis citas → Pasadas", cada cita `terminada` sin reseña muestra "Dejar reseña", y las que ya tienen reseña muestran sus estrellas ("Tu reseña: ★★★★☆").
3. **Formulario de reseña** (`/wstyle/cuenta/resena/`):
   - pide sesión del dueño de la cita;
   - muestra la cita (servicio, barbero, fecha);
   - selector de 1 a 5 estrellas accesible por teclado;
   - comentario con contador de caracteres;
   - botón [Publicar reseña]. Al publicar, confirma "¡Gracias! Tu reseña ya está publicada" con un enlace al inicio.
4. **API**:
   - `POST` para crear una reseña (cliente);
   - `GET` público con el resumen (promedio, cantidad) y las reseñas visibles más recientes, paginadas;
   - endpoints del super admin para listar, ocultar y volver a mostrar.

   Se valida el body en el server y se autoriza por rol (matriz de SPEC-34).
5. **Landing** (`/wstyle/`): el capítulo "Lo que dicen" pasa a alimentarse de la API.
   - Muestra el promedio (por ejemplo "4,8") con estrellas y "N reseñas".
   - Muestra las 6 reseñas visibles más recientes (estrellas, comentario, "Pedro R.", servicio y fecha) y [Ver más reseñas], que carga 6 más.
   - Si no hay reseñas visibles (o la API falla), el capítulo no se muestra y la numeración de capítulos no deja hueco.
6. **Panel del super admin → Reseñas** (sección nueva):
   - lista con filtros (visibles u ocultas, estrellas) y búsqueda por cliente o texto;
   - acciones [Ocultar] (motivo opcional) y [Mostrar];
   - cada acción queda en la auditoría;
   - la tarjeta de Inicio muestra las reseñas nuevas de los últimos 7 días.
7. **Aviso al super admin**: correo por cada reseña nueva (estrellas, texto y enlace al panel para ocultarla), usando `adminAlertMail`.
8. **Sanitización**: el comentario se guarda como texto plano, sin HTML (ver RN-05), y se renderiza solo como texto.

**Fuera**
- Reseñas sin cita atendida, anónimas, o de Google o Instagram.
- Fotos en reseñas, respuestas del dueño a una reseña, "me gusta" o reportes de visitantes.
- Que el cliente edite su reseña (asunción 5).
- Reseñas en el panel del barbero.
- Envío automático por WhatsApp (no existe canal automático en el código).
- `AggregateRating` o `Review` en el JSON-LD (asunción 9).
- Aprobación previa: no hay cola de moderación.

## Reglas de negocio
- **RN-01 Quién puede reseñar.** Solo el cliente dueño de la cita (`customerUserId` = usuario de la sesión) y solo si la cita está `terminada`. Las citas `cancelada`, `expirada`, `no_asistio` o en cualquier estado no final → 409 "Solo puedes reseñar una cita atendida". Una cita sin cuenta asociada (creada por el admin para alguien por teléfono, `customerUserId` null) no se puede reseñar.
- **RN-02 Una por cita.** Hay como máximo una reseña por cita, garantizado por un índice único en la BD. Un segundo intento → 409 "Ya dejaste una reseña para esta cita". Un cliente con varias citas atendidas puede dejar una reseña por cada una.
- **RN-03 Plazo.** Se puede reseñar hasta 60 días después de que terminó la cita. Pasado ese plazo, el botón desaparece y la API responde 409 "El plazo para reseñar esta cita terminó".
- **RN-04 Contenido.**
  - Estrellas: entero de 1 a 5, obligatorio.
  - Comentario: obligatorio, de 10 a 300 caracteres después de sanitizar.

  Cualquier otro campo del body se ignora: el nombre, el servicio y la fecha los pone el server.
- **RN-05 Sanitización.** El server:
  - quita etiquetas HTML y caracteres de control;
  - normaliza espacios (máximo un salto de línea seguido);
  - recorta los bordes.

  Si después de sanitizar quedan menos de 10 caracteres → 400. El front nunca usa `dangerouslySetInnerHTML` con el comentario. Las URL se muestran como texto, sin enlace.
- **RN-06 Nombre a mostrar.** Se arma con `User.name` al crear la reseña: primera palabra + inicial de la última palabra con punto ("Pedro Rico Díaz" → "Pedro D."). Si hay una sola palabra → solo esa ("Pedro"). Si no hay nombre → "Cliente de WS Style". Se guarda en la reseña: cambios posteriores del nombre no la alteran.
- **RN-07 Servicio y fecha.** Se muestra el nombre del servicio de la cita (`serviceSnapshot.name`, el de ese momento) y la fecha de publicación de la reseña en formato corto local ("18 nov 2026", zona `America/Santiago`).
- **RN-08 Publicación inmediata.** La reseña queda visible al crearla, sin aprobación.
- **RN-09 Ocultar y mostrar.** El super admin puede ocultar una reseña (motivo opcional, solo interno) y volver a mostrarla. Una reseña oculta no aparece en la landing ni cuenta para el promedio ni la cantidad. El cliente sigue viendo su reseña en "Mis citas", sin aviso de que está oculta (asunción 6). Ambas acciones se auditan. No hay borrado definitivo desde el panel.
- **RN-10 Resumen público.**
  - Promedio = media de las estrellas de las reseñas visibles, con un decimal y coma decimal ("4,8"), y estrellas redondeadas al medio.
  - Cantidad = número de reseñas visibles ("1 reseña" / "N reseñas").
  - Orden: más reciente primero.
- **RN-11 Sin relleno.** Con 0 reseñas visibles, el capítulo "Lo que dicen" no se renderiza (ni título, ni promedio, ni capítulo numerado). El bloque `reviews` de `site.json` deja de usarse para esta sección (asunción 8).
- **RN-12 Cuenta eliminada.** Si el cliente elimina su cuenta (`User.status = deleted`), sus reseñas se ocultan automáticamente y dejan de contar.
- **RN-13 Abuso.** El endpoint de crear reseña usa un limitador de tasa, igual que la reserva. Los errores no revelan si una cita ajena existe: una cita ajena o inexistente → 404.

### Autorización (se suma a la matriz de SPEC-34)
| Acción | Anónimo | client | barber | superadmin |
|---|---|---|---|---|
| Ver resumen y reseñas visibles | ✓ | ✓ | ✓ | ✓ |
| Crear reseña de una cita propia `terminada` | 401 | ✓ | 404 (no es su cita como cliente) | 404 si no es su cita como cliente |
| Listar todas (incluye ocultas), ocultar, mostrar | 401 | 403 | 403 | ✓ |

## Flujo principal
1. El barbero marca la cita como "Terminar" → el cliente recibe el correo "Gracias por venir" con el botón [Deja tu reseña].
2. El cliente abre el enlace. Si no tiene sesión, inicia sesión y vuelve al formulario. Ve "Corte + barba · con Joe · 18 nov 2026", elige 5 estrellas, escribe "Excelente degradado, muy buena atención." y toca [Publicar reseña].
3. Ve "¡Gracias! Tu reseña ya está publicada". En "Mis citas → Pasadas", esa cita muestra "Tu reseña: ★★★★★".
4. Joe recibe el correo "Nueva reseña: ★★★★★".
5. Un visitante abre `/wstyle/` → el capítulo "Lo que dicen" muestra "5,0 ★★★★★ · 1 reseña" y la tarjeta con estrellas, comentario, "Pedro R. · Corte + barba · 18 nov 2026".
6. Si una reseña es inapropiada, Joe entra en Panel → Reseñas → [Ocultar] → desaparece de la landing y el promedio se recalcula. [Mostrar] la devuelve.

## Casos borde
- **CB-01** Cita `no_asistio`, `cancelada` o `en_curso` → no aparece "Dejar reseña"; si se fuerza por la API → 409.
- **CB-02** Doble envío (doble clic o dos pestañas) → se crea una sola reseña; la segunda recibe 409. En el front, el botón se deshabilita mientras envía.
- **CB-03** Otro usuario abre el enlace de reseña de una cita ajena → 404 "No encontramos esa cita en tu cuenta".
- **CB-04** El comentario trae `<script>alert(1)</script>Muy bueno el corte` → se guarda "Muy bueno el corte" (sin etiquetas). Si el resultado tiene menos de 10 caracteres → 400.
- **CB-05** Comentario de 301 caracteres o más → 400. El contador del front avisa antes de enviar.
- **CB-06** Estrellas 0, 6, 4.5 o "5" como texto que no es entero → 400.
- **CB-07** API de reseñas caída o lenta (más de 4 s) → la landing simplemente no muestra el capítulo, sin error visible ni salto de layout.
- **CB-08** Hay reseñas, pero todas ocultas → el capítulo no se muestra.
- **CB-09** El enlace llega después de 60 días → mensaje "El plazo para reseñar esta cita terminó" y botón a "Mis citas".
- **CB-10** Comentario largo sin espacios (300 caracteres seguidos) → la tarjeta lo corta con `overflow-wrap: anywhere`, sin desbordar en 390 px.
- **CB-11** Nombre con tildes o compuesto ("María José Pérez") → "María P.".
- **CB-12** El servicio se renombra o se archiva después (SPEC-51) → la reseña sigue mostrando el nombre que tenía.

## Diseño (dirección de arte "Noir de oficio")
- El capítulo usa el mismo panel sólido de "Extras" (película atenuada detrás) y el título "LO QUE DICEN." en Anton.
- Promedio grande en Cormorant Italic, estrellas en `--brass #B8875A` (único acento) y texto en hueso. Sin amarillos, naranjos ni iconografía de terceros.
- Tarjetas: estrellas, comentario en Cormorant entre comillas tipográficas, y pie en Inter versalitas: "PEDRO R. · CORTE + BARBA · 18 NOV 2026".
- 3 columnas en desktop, 1 columna en móvil, mismo ritmo que `.reviews` actual. `prefers-reduced-motion` sin animaciones de entrada.
- Estrellas accesibles: `aria-label="5 de 5 estrellas"`. El selector del formulario funciona con teclado (radio group) y tiene foco visible.

## Criterios de aceptación
Tests de server con `node --test` contra la BD de test real (`pagina_personal_test`), con el mailer en dry-run. Tests de client con vitest. Navegador en `http://127.0.0.1:5173/wstyle/` a 1440×900 y 390×844.

- **AC-01 Crear.** El cliente dueño de una cita `terminada` crea una reseña (5 estrellas, comentario válido) → 201. La reseña queda visible, con el nombre a mostrar según RN-06 y `serviceSnapshot.name`. Test de server.
- **AC-02 Elegibilidad.**
  - Cita `cancelada`, `no_asistio`, `expirada`, `confirmada` o `en_curso` → 409.
  - Cita ajena o inexistente → 404.
  - Anónimo → 401.
  - Segunda reseña de la misma cita → 409. Dos POST simultáneos → exactamente una reseña.
  - Fuera de plazo (61 días) → 409.

  Test de server.
- **AC-03 Validación y sanitización.**
  - Estrellas fuera de 1–5 o no enteras → 400.
  - Comentario con menos de 10 o más de 300 caracteres → 400.
  - HTML eliminado (CB-04) y campos extra del body ignorados (por ejemplo, un `author` enviado no se usa).

  Test de server.
- **AC-04 Resumen público.** Con 3 reseñas visibles (5, 4, 4) y 1 oculta (1): el endpoint público devuelve promedio 4,3 y cantidad 3, las reseñas ordenadas de la más reciente a la más antigua, sin la oculta. La respuesta pública no incluye email, teléfono, userId ni motivo de ocultamiento. Test de server.
- **AC-05 Ocultar y mostrar.** Solo el super admin (client y barber → 403). Ocultar quita la reseña del público y del promedio; mostrar la devuelve. Ambas acciones dejan registro de auditoría. Una cuenta eliminada oculta sus reseñas (RN-12). Test de server.
- **AC-06 Invitación.** El correo `client_finished` incluye el enlace `/wstyle/cuenta/resena/?cita=<id>` (test de server sobre el mail en dry-run). En "Mis citas", una cita `terminada` sin reseña muestra "Dejar reseña" y una con reseña muestra sus estrellas (navegador).
- **AC-07 Aviso al admin.** Crear una reseña registra el correo al super admin (`Notification` en dry-run) con las estrellas y el enlace al panel. Test de server.
- **AC-08 Formulario en el navegador.** Con un cliente de seed que tiene una cita `terminada`:
  - se abre el enlace, se eligen estrellas con teclado y se escribe el comentario;
  - el contador marca el límite;
  - [Publicar reseña] muestra la confirmación;
  - recargar la landing muestra la reseña.

  Capturas a 1440 y 390 px.
- **AC-09 Landing sin reseñas.** Con 0 reseñas visibles (o la API de reseñas apagada), el DOM no tiene `#resenas`, la navegación de capítulos no lo lista y la numeración es correlativa. Test vitest del cálculo de capítulos y verificación en el navegador.
- **AC-10 Landing con reseñas.**
  - Con 8 reseñas de seed, se ven el promedio, "8 reseñas" y 6 tarjetas; [Ver más reseñas] muestra las 2 restantes y luego desaparece.
  - En 390 px no hay scroll horizontal (CB-10).
  - Colores del acento = `--brass`.
  - Sin errores de consola.
- **AC-11 SEO y prerender.**
  - `npm run build` + `vite preview`: `/wstyle/index.html` prerenderizado no contiene reseñas falsas ni el texto de ejemplo de `site.json`.
  - El JSON-LD sigue siendo válido (mismo `BarberShop`, sin `aggregateRating`).
  - La hidratación no da errores de mismatch en consola.
- **AC-12 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. Los tests existentes de W Style pasan (incluida la matriz de autorización de SPEC-34 con los endpoints nuevos).

## Decisiones confirmadas (por el usuario)
- Solo pueden reseñar los clientes con una cita **atendida** (`terminada`), una reseña por cita.
- Se invita después de la cita, en la cuenta del cliente y con un enlace. El correo "Gracias por venir" ya existe, así que el enlace va ahí. No hay canal automático de WhatsApp.
- Contenido: 1 a 5 estrellas + comentario corto con límite de caracteres. Se muestra con nombre de pila + inicial del apellido, el servicio y la fecha.
- Se publican **solas al instante**. El super admin puede **ocultarlas** desde su panel y volver a mostrarlas.
- En el inicio de la landing: sección con promedio, cantidad y las reseñas más recientes. **Sin reseñas, la sección no se muestra** (sin relleno falso). Respeta "Noir de oficio" y funciona en móvil.
- Texto sanitizado (sin HTML), body validado en el server, sin romper el SEO ni el prerender.

## Asunciones (detalles menores, pendientes de validar)
1. Comentario obligatorio de 10 a 300 caracteres.
2. Plazo para reseñar: 60 días desde el término de la cita.
3. La fecha que se muestra es la de publicación de la reseña ("18 nov 2026"), no la de la cita.
4. El enlace de reseña exige iniciar sesión con la cuenta dueña de la cita (sin token anónimo).
5. El cliente no puede editar ni borrar su reseña. Para retirarla, se la pide al local y el admin la oculta.
6. El cliente no recibe aviso cuando su reseña se oculta, y la sigue viendo en "Mis citas".
7. La landing muestra 6 reseñas y [Ver más reseñas] carga de a 6. El capítulo queda en su posición actual ("Lo que dicen", entre Barberos y "Antes de venir"), dentro de la página de inicio.
8. El bloque `reviews` de `site.json` (textos de ejemplo) se retira o queda sin uso. La sección depende solo de la BD.
9. No se agrega `aggregateRating` al JSON-LD: Google no muestra estrellas de reseñas propias de un `LocalBusiness`, y las reseñas cargan en runtime.
10. Joe recibe un correo por cada reseña nueva y ve en Inicio del panel cuántas llegaron en los últimos 7 días.
11. No hay filtro automático de groserías. La moderación es reactiva (ocultar).
12. Las reseñas de una cuenta eliminada se ocultan automáticamente.
