# SPEC-59 — WS Style: fotos de estilos al reservar

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18. Las decisiones se tomaron con el usuario. Idea de referencia: "Reservá tu look / Tu catálogo de estilos" de SillaLibre (catálogo §10), **sin la prueba con IA**.

## Estado actual
- La reserva (`/wstyle/reservar/`, `agenda/pages/BookingPage.tsx`) tiene 4 pasos: Servicio y barbero → Día y hora → ¿Dónde te atendemos? → Confirmar. Después viene la confirmación. Es necesario iniciar sesión antes del paso 1 (SPEC-38).
- La cita (`Appointment`) guarda `note` (texto libre) pero ninguna imagen.
- **Ya existe una tubería de fotos** (`server/src/lib/photos.js`, SPEC-33 RN-17):
  - `multer` en memoria con límite de 5 MB;
  - valida el tipo por la firma de bytes (`sniffImage`: jpeg/png/webp);
  - `sharp` → WebP de 800 px, `rotate()` según EXIF;
  - guarda en **GridFS** (bucket `photos`) porque el disco de Render free es efímero;
  - sirve en `GET /api/wstyle/photos/:id` (público).
- Los servicios tienen categoría desde SPEC-51 (Barbería, Decoloración capilar, Ondulación permanente y Tratamientos capilares).
- El barbero ve el detalle de la cita en su panel (`pro/components/ApptSheet.tsx`) y el admin en `admin/components/ApptSheet.tsx`.

## Historia
Como **cliente que reserva**, quiero **elegir una foto del estilo que quiero, o subir la mía**, para **que el barbero sepa exactamente qué busco antes de que llegue**.
Como **dueño o barbero**, quiero **subir fotos de nuestros trabajos ordenadas por servicio o categoría** para **inspirar al cliente y lucir lo que hacemos**.
Como **dueño**, quiero **poder quitar cualquier foto** para **que no quede nada inapropiado**.

## Alcance
**Incluye**
1. **Catálogo de estilos** en la BD. Cada estilo tiene:
   - foto (GridFS);
   - nombre corto ("Low fade texturizado");
   - categoría (de SPEC-51) y, opcionalmente, servicios específicos;
   - quién la subió, orden, activo/oculto y fecha.
2. **Gestión del catálogo**:
   - Panel del super admin → sección nueva "Estilos": subir (una o varias), editar nombre y categoría o servicios, reordenar, ocultar/mostrar y eliminar cualquier foto;
   - panel del barbero → "Mis estilos": subir y editar **sus** fotos, ocultarlas o eliminarlas. No puede tocar las de otros.
3. **Paso opcional en la reserva, "Tu estilo"**, después de "Servicio y barbero" (o integrado al paso de confirmación, asunción 1):
   - grilla de estilos activos filtrada por la categoría del servicio elegido, con [Ver todos];
   - el cliente puede elegir **una** foto del catálogo como referencia;
   - y/o **subir una foto propia** (JPG, PNG o WebP, hasta 5 MB; HEIC ver asunción 4);
   - y/o escribir una nota corta (reutiliza `note`).

   Las opciones [Decido en la barbería] u [Omitir] dejan seguir sin nada.
4. **En la cita**: se guardan la referencia al estilo del catálogo (id + nombre congelado) y/o el id de la foto subida por el cliente. Lo ven:
   - el resumen de confirmación y la página de la cita del cliente (con miniatura);
   - la ficha de la cita en el panel del barbero (miniatura que se abre en grande);
   - la ficha de la cita en el panel del admin.
5. **Almacenamiento y compresión**: se reutiliza `photos.js`:
   - GridFS en local y en prod (Render), el mismo código y ningún archivo en el disco del server;
   - compresión a WebP (lado mayor 1200 px para estilos y 1000 px para fotos de clientes, **sin recorte cuadrado**, asunción 6), calidad ~80;
   - se quitan los metadatos EXIF (incluida la ubicación GPS);
   - los documentos de Mongo guardan solo el id del archivo, nunca el binario.
6. **Privacidad de la foto del cliente**: no es pública. Se sirve por un endpoint autenticado que solo responde al dueño de la cita, a su barbero y al super admin.
7. **Moderación**:
   - el super admin puede quitar cualquier foto del catálogo y cualquier foto de cliente de una cita. Esta queda como "Foto quitada por el local" y se borra de GridFS;
   - cada acción queda en `AuditLog`.
8. **Limpieza**: las fotos de clientes de citas finalizadas hace más de 90 días se borran de GridFS con la misma tarea periódica que ya corre (holds/reconcile), dejando la marca "Foto expirada" (asunción 7).

**Fuera**
- Prueba de estilo con IA, sugerencias por forma de cara o filtros.
- Precio o tiempo extra por estilo (SillaLibre "Tiempo y precio extra por imagen").
- Galería pública de estilos en la landing (asunción 8).
- Varias fotos por cita (máximo una del catálogo + una propia).
- Almacenamiento en S3, Cloudinary u otro externo.

## Reglas de negocio
- **RN-01 Opcional.** Elegir o subir una foto nunca es obligatorio. Sin foto, la reserva funciona igual que hoy.
- **RN-02 Validación de la subida.**
  - Tipo validado por contenido (`sniffImage` + decodificación con sharp), no por la extensión.
  - Máximo 5 MB de entrada y 40 MP.
  - Archivo inválido → 400 "Esa imagen no se pudo leer. Prueba con un JPG o PNG".
  - Más de 5 MB → 413 "La foto pesa más de 5 MB".
- **RN-03 Cuándo se sube la foto del cliente.**
  - Se sube al elegirla (antes de confirmar) y queda **provisional**, ligada al usuario.
  - Al crear la cita, se asocia a ella.
  - Las provisionales sin cita después de 24 h se borran.
  - Un usuario no puede tener más de 5 provisionales a la vez (limita el abuso).
- **RN-04 Visibilidad.**
  - Fotos del catálogo activas → públicas.
  - Ocultas → solo panel.
  - Fotos de cliente → solo el dueño de la cita, el barbero asignado y el super admin. Cualquier otro → 404 (sin revelar si existe).
- **RN-05 Referencia congelada.** La cita guarda el nombre del estilo elegido. Si después se oculta o se borra el estilo, la cita muestra el nombre y "Foto ya no disponible".
- **RN-06 Catálogo por servicio.**
  - Un estilo con servicios específicos aparece solo para esos servicios.
  - Un estilo sin servicios aparece para todos los de su categoría.
  - Orden: el `order` del panel y luego el más nuevo primero.
- **RN-07 Límites del catálogo.** Hasta 200 estilos activos por negocio y 12 por subida.
- **RN-08 Permisos del barbero.** El barbero edita, oculta y borra solo los estilos que subió. El super admin, todos.
- **RN-09 Cambio de la foto en la cita.** Mientras la cita no esté en un estado final, el cliente puede cambiar o quitar su referencia desde la página de su cita. Al quitar o reemplazar su foto propia, la anterior se borra de GridFS.
- **RN-10 Cuenta eliminada.** Al eliminar la cuenta (`User.status = deleted`), se borran sus fotos de cliente.

### Autorización (se suma a la matriz de SPEC-34)
| Acción | Anónimo | client | barber | superadmin |
|---|---|---|---|---|
| Ver estilos activos y sus fotos | ✓ | ✓ | ✓ | ✓ |
| Subir foto de referencia propia / cambiarla en su cita | 401 | ✓ | ✓ (como cliente) | ✓ (como cliente) |
| Ver la foto de cliente de una cita | 401 | solo la suya | solo sus citas | ✓ |
| Subir, editar, ocultar o borrar estilos | 401 | 403 | solo los propios | ✓ |
| Quitar la foto de cliente de una cita (moderación) | 401 | 403 | 403 | ✓ |

## Flujo principal
1. Joe sube 8 fotos de degradados en Panel → Estilos, categoría "Barbería", y una de platinado en "Decoloración capilar".
2. Pedro reserva "Corte", elige día y hora, y en "Tu estilo" ve los 8 degradados. Elige "Low fade texturizado" y además sube su propia foto. Confirma.
3. El resumen muestra "Estilo: Low fade texturizado" con 2 miniaturas.
4. El barbero abre la cita en su panel y toca la miniatura → ve la foto en grande.
5. Joe ve una foto de cliente inapropiada → [Quitar foto] → la cita muestra "Foto quitada por el local" y queda el registro de auditoría.

## Casos borde
- **CB-01** El cliente sube un PDF renombrado a `.jpg` → 400 (validación por contenido).
- **CB-02** Foto de 12 MB del celular → 413 antes de procesar. El front avisa por tamaño antes de subir.
- **CB-03** Foto con EXIF de rotación → se ve derecha. Con GPS → los metadatos no quedan en el WebP.
- **CB-04** El cliente sube una foto y abandona la reserva → la provisional se borra a las 24 h.
- **CB-05** Otro cliente pide la URL de la foto de una cita ajena → 404.
- **CB-06** El servicio elegido no tiene estilos en su categoría → el paso muestra solo [Subir tu foto] y [Decido en la barbería], sin grilla vacía.
- **CB-07** Se cae la subida (red) → mensaje "No pudimos subir la foto. Puedes reintentar o seguir sin foto"; la reserva no se bloquea.
- **CB-08** El estilo elegido se oculta entre que el cliente lo elige y confirma → la cita se crea igual con el nombre congelado (RN-05).
- **CB-09** Móvil 390 px: la grilla es de 2 columnas, el visor a pantalla completa se cierra con Escape o tocando fuera, y no hay scroll horizontal.
- **CB-10** Lectores de pantalla: cada estilo tiene `alt` con su nombre; la selección es un radio group con foco visible.

## Diseño ("Noir de oficio")
- Grilla de fotos con esquinas rectas, filete fino hueso y, en la seleccionada, el borde `--brass` con el check en versalitas "ELEGIDO".
- Los nombres de los estilos van en Inter versalitas bajo la foto. Sin sombras de color ni etiquetas tipo "IA".
- La miniatura en la ficha del barbero es de 64 px y el visor tiene fondo negro al 92 %.

## Criterios de aceptación
Tests de server con `node --test` contra la BD de test real (`pagina_personal_test`). Tests de client con vitest. Navegador en `http://127.0.0.1:5173/wstyle/reservar/` y en los paneles, a 1440×900 y 390×844.

- **AC-01 Subida y compresión.** Subir un JPG de 4000×3000 con EXIF de rotación y GPS guarda un WebP de lado mayor ≤ 1200 (estilo) o ≤ 1000 (cliente), sin recorte, bien orientado y sin EXIF. El documento de Mongo guarda solo el id. Test de server.
- **AC-02 Validación.** Un PDF disfrazado → 400; un archivo de 5 MB + 1 byte → 413; una imagen corrupta → 400. Test de server.
- **AC-03 Catálogo.** El endpoint público devuelve solo los estilos activos, filtrados por servicio y categoría según RN-06 y ordenados. Los ocultos no aparecen. Test de server.
- **AC-04 Permisos.**
  - El barbero A no puede editar ni borrar estilos del barbero B (403).
  - La foto de cliente: dueño, barbero asignado y super admin → 200; otro cliente, otro barbero o anónimo → 404 o 401.
  - Se extiende la matriz de autorización de SPEC-34.

  Test de server.
- **AC-05 Reserva con referencia.** Crear una cita con un estilo del catálogo y una foto propia provisional → la cita guarda ambos y la provisional queda asociada. Crear sin foto → igual que hoy. Una provisional sin cita a las 24 h (reloj simulado) → borrada de GridFS. Test de server.
- **AC-06 Moderación y limpieza.**
  - [Quitar foto] del admin borra el archivo de GridFS, marca la cita y audita.
  - Las fotos de citas finalizadas hace más de 90 días se borran con la tarea periódica.
  - Al eliminar una cuenta se borran sus fotos.

  Test de server.
- **AC-07 Flujo en el navegador.** Con estilos de seed:
  - se reserva un corte eligiendo un estilo y subiendo una foto (Playwright `setInputFiles`);
  - la confirmación muestra las miniaturas;
  - en `/wstyle/pro/` la ficha de la cita muestra la foto y el visor abre y cierra con Escape.

  Capturas a 1440 y 390 px, sin errores de consola.
- **AC-08 Panel.** El super admin sube 3 fotos a la vez, cambia la categoría de una, la oculta y verifica que deja de verse en la reserva. Navegador.
- **AC-09 Sin estilos.** Con un servicio cuya categoría no tiene estilos, el paso no muestra una grilla vacía (CB-06). Vitest + navegador.
- **AC-10 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. El flujo de reserva existente (tests de SPEC-32/38) pasa sin foto.

## Decisiones confirmadas (por el usuario)
- Joe y los barberos suben un catálogo de fotos de estilos, por servicio o categoría.
- Al reservar, el cliente puede elegir una foto como referencia y/o subir la suya (opcional, con límite de tamaño y formato). El barbero la ve en el detalle de la cita.
- Almacenamiento de imágenes en local y en prod (Render) sin binarios grandes en Mongo, con compresión. Moderación: el admin puede quitar fotos.
- Sin "prueba con IA".

## Asunciones (detalles menores, pendientes de validar)
1. "Tu estilo" es un bloque opcional dentro del paso 1, después de elegir servicio y barbero (no un paso numerado nuevo), para no alargar la reserva. Si queda pesado en móvil, pasa a ser el paso 4 "Confirmar".
2. Una foto del catálogo + una foto propia como máximo por cita.
3. El límite es de 5 MB, igual que las fotos del barbero.
4. HEIC (fotos de iPhone) se acepta solo si sharp del servidor lo decodifica. Si no, el front pide elegir "Más compatible" o una captura. En la práctica, iOS convierte a JPEG al subir desde el navegador.
5. GridFS sigue siendo el almacenamiento: los WebP comprimidos pesan ~100–250 KB en chunks de GridFS, no en el documento. Si el volumen crece, se migra a un almacenamiento de objetos en otra spec.
6. Las fotos de estilos y de clientes no se recortan cuadradas (a diferencia de las fotos de perfil del barbero). La grilla las muestra con `object-fit: cover`.
7. Las fotos de clientes se borran 90 días después de finalizada la cita. Las del catálogo no vencen.
8. No hay galería pública de estilos en la landing; el catálogo se ve solo al reservar.
9. El barbero no puede quitar la foto que subió el cliente; solo el super admin modera.
