# SPEC-51 — WS Style: carta nueva con coloración, permanente y tratamientos

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18: "cambiar servicios y precios". Las decisiones se tomaron con el usuario. Las duraciones no las dio Joe: son aproximadas, investigadas, y **Joe las ajusta desde su panel** (Carta).

## Estado actual
- La carta vive en la BD (`Service`, SPEC-34 RN-06) y la landing la pide en `GET /api/wstyle/catalog` (`server/src/domain/agenda.js` `catalog()`); si la API falla o tarda más de 4 s, usa el JSON estático `client/public/wstyle/content/services.json` (`client/src/wstyle/content.ts` `loadCatalog`/`mergeCatalog`). `client/scripts/prerender-wstyle.mjs` genera el HTML (SEO) desde ese JSON.
- `Service` (`server/src/models/index.js`) tiene `slug, name, description, priceCLP, durationMin, homeServiceAllowed, active, order, archivedAt`, pero **no tiene categoría**. La landing (`components/Services.tsx`) muestra una lista plana; la reserva (`agenda/pages/BookingPage.tsx`, paso 1) también.
- Carta actual (5 servicios de barbería, `placeholder: true`): Corte, Corte + barba, Perfilado de barba, Lavado + masaje, Limpieza facial (vapor).
- `server/src/seed.js` `importCatalog` crea los servicios por `slug` con `$setOnInsert` (correrlo dos veces no duplica ni pisa precios editados). Script: `npm run seed:catalog`.
- Un servicio solo se puede reservar si algún barbero aprobado lo ofrece (`ProfessionalService`, SPEC-33 RN-04).
- La agenda bloquea bloques de 15 min (`SlotLock`, índice único `professionalId + slotStart`) por toda la duración del servicio. La validación del admin acepta duraciones de 5 a 240 min, en múltiplos de 5 (SPEC-34 RN-04).

## Historia
Como **dueño de WS Style** quiero **sumar a mi carta los servicios de decoloración, ondulación permanente y tratamientos capilares, agrupados por categoría y con sus precios**, para **ofrecerlos y que la gente los reserve en línea igual que un corte**.
Como **cliente**, quiero **ver la carta ordenada por tipo de servicio** para **encontrar rápido lo que busco y saber cuánto cuesta y cuánto dura**.

## Alcance
**Incluye**
1. **Categoría de servicio** en la BD: cada servicio pertenece a una categoría. Las categorías tienen nombre, nota opcional (texto bajo el título del grupo) y orden.
2. **Migración idempotente** que:
   - crea las 4 categorías: Barbería, Decoloración capilar, Ondulación permanente y Tratamientos capilares;
   - asigna los 5 servicios actuales a "Barbería";
   - crea los 9 servicios nuevos (tabla de abajo);
   - enlaza los servicios nuevos a los barberos aprobados (asunción 3).

   Correrla dos veces no duplica nada ni pisa los cambios que Joe haya hecho después en el panel.
3. **API**: `GET /api/wstyle/catalog` devuelve las categorías (ordenadas, con nota) y la categoría de cada servicio. Los endpoints de la Carta del admin aceptan y validan la categoría.
4. **Panel del super admin → Carta** (`ServicesPage.tsx`):
   - campo "Categoría" (selector) en crear y editar un servicio;
   - lista agrupada por categoría;
   - gestión de categorías: crear, renombrar, editar la nota y reordenar. Una categoría que tiene servicios no se puede borrar;
   - "Exportar a JSON" incluye la categoría.
5. **Landing** (`Services.tsx`, sección "La carta"): los servicios se muestran agrupados. Cada grupo lleva título, nota si la tiene, y debajo sus servicios con el mismo estilo de carta "Noir de oficio" (nombre en versalitas, filete de puntos, precio en Cormorant y duración).
6. **Reserva** (`/wstyle/reservar/`, paso 1): los servicios se eligen agrupados por categoría (mismo orden y nota).
7. **Fallback estático**: `services.json` se actualiza con los 14 servicios y su categoría (más la definición de categorías), para que el prerender SSR y el fallback sin API muestren la carta nueva agrupada.
8. **Duraciones en la agenda**: un servicio de hasta 180 min bloquea toda su duración. No puede empezar si choca con otra cita, ni terminar fuera del horario del barbero o del local.

**Fuera**
- Cambiar precios o textos de los 5 servicios de barbería actuales.
- Precios variables por largo de cabello o "desde $X". Precios por barbero distintos al de la carta (`ProfessionalService.priceCLP` sigue como está).
- Fotos por servicio, paquetes o combos.
- Cambiar titulares, eslogan, marquee o el JSON-LD `BarberShop` (siguen hablando de barbería; ver asunción 8).
- Evaluación previa del cabello como cita separada: es parte del servicio y solo se informa con la nota de la categoría.

## Carta nueva (CLP, duración aproximada)
Fuente de las duraciones: tiempos que publican salones de Santiago en Fresha y AgendaPro (decoloración global 1h30–3h, mechas 1h–3h30, platinado hasta 5–6h). Son un punto de partida: **Joe las ajusta desde Panel → Carta**.

| Categoría | Servicio (slug sugerido) | Descripción | Precio | Duración |
|---|---|---|---|---|
| Barbería | (los 5 actuales, sin cambios) | — | — | — |
| **Decoloración capilar** — nota: "Cada servicio incluye una evaluación previa del cabello." | Global (`decoloracion-global`) | — | $50.000 | 150 min |
| | Bloque de color (`decoloracion-bloque`) | — | $25.000 | 90 min |
| | Superior (`decoloracion-superior`) | — | $40.000 | 120 min |
| | Mechas y puntas (`decoloracion-mechas-puntas`) | — | $45.000 | 150 min |
| | Rubio platinado, beige y ceniza (`decoloracion-platinado`) | — | $50.000 | 180 min |
| | Matización y tonos fantasía (`decoloracion-matizacion`) | — | $30.000 | 60 min |
| | Diseños de color personalizados (`decoloracion-diseno`) | — | $70.000 | 180 min |
| **Ondulación permanente** | Ondulación permanente (`ondulacion-permanente`) | Diseño de rizos y ondas para un estilo con personalidad. | $45.000 | 120 min |
| **Tratamientos capilares** | Tratamientos capilares (`tratamientos-capilares`) | Cuida tu cabello con tratamientos personalizados para mejorar su apariencia y mantenerlo saludable. | $15.000 | 45 min |

Todas las duraciones son múltiplos de 15 (el bloque de agenda) y caben en el máximo de 240 min.

## Reglas de negocio
- **RN-01 Categoría obligatoria.** Todo servicio activo tiene una categoría. Un servicio nuevo creado en el panel trae "Barbería" por defecto. Un servicio sin categoría (datos viejos o API desfasada) se muestra en "Barbería" en la landing y en la reserva.
- **RN-02 Orden.** Los grupos siguen el orden de las categorías (Barbería, Decoloración capilar, Ondulación permanente, Tratamientos capilares) y, dentro de cada grupo, el `order` de cada servicio. Una categoría sin servicios activos no se muestra en la landing ni en la reserva.
- **RN-03 Nota de categoría.** Si la categoría tiene nota, se muestra una vez bajo su título (landing y reserva), no en cada servicio.
- **RN-04 Migración idempotente.**
  - Se identifica por `slug` de categoría y de servicio.
  - Si el registro existe, no se toca: no se pisan precio, duración, nombre ni el estado activo o archivado que Joe haya cambiado.
  - Solo asigna "Barbería" a servicios que no tienen categoría.
  - El enlace barbero↔servicio usa upsert, sin duplicados.
  - Correrla dos veces deja el mismo número de categorías (4), de servicios (14) y de enlaces.
- **RN-05 Duración y agenda.** La reserva bloquea `durationMin` completo (bloques de 15 min). Solo se ofrecen horas de inicio en que todo el servicio cabe en la disponibilidad del barbero, en el horario del local, sin cierres y sin chocar con otra cita que bloquee agenda (`BLOCKING`). Si dos clientes intentan reservar a la vez, el segundo recibe 409 (índice único de `SlotLock`). Lo mismo vale al reasignar, proponer cambio o crear la cita desde el admin.
- **RN-06 Domicilio.** Los servicios nuevos se crean con `homeServiceAllowed = false` (químicos, lavacabezas y tiempos largos). Joe puede cambiarlo en el panel.
- **RN-07 Precio congelado.** Cambiar un precio o una duración desde el panel no altera citas ya creadas (SPEC-32 RN-09, `serviceSnapshot`).
- **RN-08 Fallback coherente.** `services.json` contiene exactamente la carta inicial de la migración (14 servicios + 4 categorías). En runtime manda la BD (SPEC-34 CB-08).
- **RN-09 Auditoría.** Crear, editar o reordenar categorías y cambiar la categoría de un servicio queda en el registro de auditoría (SPEC-34 RN-09).

## Flujo principal
1. Se corre la migración (`npm run seed:catalog` o el script equivalente) → la BD queda con 4 categorías y 14 servicios.
2. Un visitante abre `/wstyle/` → en "La carta" ve "Barbería" con los 5 servicios. Luego "Decoloración capilar" con la nota "Cada servicio incluye una evaluación previa del cabello." y sus 7 servicios. Después "Ondulación permanente" y "Tratamientos capilares", cada uno con su servicio, precio y duración.
3. Toca [Reservar] → paso 1 agrupado igual → elige "Rubio platinado, beige y ceniza" (180 min) → el calendario solo ofrece horas en que caben 3 horas seguidas libres.
4. Joe entra en Panel → Carta, cambia la duración de "Global" a 165 min y su categoría sigue igual → recarga la landing: "165 min".

## Casos borde
- **CB-01** La migración corre sobre una BD donde Joe ya editó el precio de "Global" → el precio editado se mantiene.
- **CB-02** La migración corre con un servicio nuevo ya archivado por Joe → sigue archivado (no se reactiva).
- **CB-03** La API cae → la landing muestra la carta agrupada del JSON (14 servicios) sin error visible.
- **CB-04** Servicio de 180 min con una cita ya tomada de 13:00 a 14:00 → no se ofrece ninguna hora de inicio entre las 10:15 y las 13:45 (todas se superponen). Las 10:00 (termina 13:00) y las 14:00 sí se ofrecen si el resto está libre.
- **CB-05** Servicio de 180 min y el barbero termina a las 20:00 → la última hora ofrecida es 17:00.
- **CB-06** Joe intenta borrar la categoría "Ondulación permanente" con su servicio activo → bloqueado con el mensaje "Mueve o archiva sus servicios antes de borrar la categoría".
- **CB-07** Joe crea una categoría sin servicios → no aparece en la landing hasta que tenga uno activo.
- **CB-08** Categoría inexistente en el body de crear o editar servicio → 400 con mensaje.
- **CB-09** Ningún barbero aprobado ofrece un servicio nuevo (por ejemplo, lo desmarcaron) → se sigue viendo en la carta de la landing. En la reserva aparece, pero sin profesionales disponibles, con el mismo mensaje que hoy para ese caso.
- **CB-10** Móvil 390 px: los títulos de grupo y la nota no desbordan; los nombres largos ("Rubio platinado, beige y ceniza") pasan a dos líneas sin romper el filete ni el precio.

## Criterios de aceptación
Tests de server con `node --test` contra la BD de test real (`pagina_personal_test`) y tests de client con vitest. Navegador en `http://127.0.0.1:5173/wstyle/` a 1440×900 y 390×844.

- **AC-01 Migración.** En una BD con la carta actual, la migración deja 4 categorías y 14 servicios con los precios, duraciones, descripciones y categorías de la tabla. Los 5 de barbería quedan en "Barbería" sin otros cambios. Correrla una segunda vez no cambia los conteos (categorías, servicios, `ProfessionalService`). Test de server.
- **AC-02 Idempotencia sin pisar ediciones.** Después de la migración se cambia el precio de "Global" y se archiva "Bloque de color". Al correrla de nuevo se mantienen el precio editado y el archivo (CB-01, CB-02). Test de server.
- **AC-03 Catálogo.** `GET /api/wstyle/catalog` devuelve las categorías ordenadas con su nota y cada servicio activo con su categoría. Las categorías sin servicios activos no se listan o vienen marcadas como vacías. Test de server.
- **AC-04 Admin.**
  - Crear o editar un servicio con categoría válida → 200. Con una categoría inexistente → 400 (CB-08).
  - Borrar una categoría con servicios → 409 (CB-06).
  - Renombrar una categoría y editar su nota se refleja en el catálogo.
  - Cada acción deja registro de auditoría. "Exportar a JSON" incluye la categoría.

  Test de server.
- **AC-05 Agenda con servicios largos.** Con una cita confirmada de 13:00 a 14:00, la disponibilidad del servicio de 180 min no ofrece ninguna hora de inicio que se superponga con ella. Crear una cita de 180 min que se superpone → 409. Una que termina justo cuando empieza otra → 201. Ninguna hora ofrecida termina después del cierre del barbero (CB-04, CB-05). Test de server.
- **AC-06 Fallback.** `services.json` tiene los 14 servicios y las 4 categorías. `mergeCatalog` conserva la categoría que viene de la API. Test vitest (`content.test.ts`).
- **AC-07 Prerender.** `npm run build` genera `/wstyle/index.html` con los 4 títulos de grupo, la nota de decoloración y los 14 servicios en el HTML estático (se verifica leyendo el archivo generado).
- **AC-08 Landing en el navegador.**
  - Con la API arriba, "La carta" muestra los 4 grupos en orden, la nota bajo "Decoloración capilar" y cada servicio con precio CLP (`$50.000`) y duración (`150 min`).
  - Si la duración se cambia en el panel, se ve al recargar.
  - Con la API apagada se ve lo mismo desde el JSON.
  - Capturas a 1440 px y 390 px sin desborde (CB-10) y sin errores de consola.
- **AC-09 Reserva en el navegador.** En `/wstyle/reservar/`, el paso 1 muestra los servicios agrupados. Al elegir "Rubio platinado, beige y ceniza", el resumen dice 180 min y las horas ofrecidas respetan AC-05.
- **AC-10 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde. Los tests existentes de W Style pasan.

## Decisiones confirmadas (por el usuario)
- Los servicios nuevos **se suman** a la carta de barbería actual; no la reemplazan.
- Se agrupan por categoría: Barbería (los actuales), Decoloración capilar, Ondulación permanente y Tratamientos capilares. Como el modelo no tiene categoría, esta spec la agrega en la BD, la API, el panel del admin, la landing y la reserva.
- Precios en CLP según la lista de Joe ("50 mil" = $50.000). La nota de la categoría Decoloración es "Cada servicio incluye una evaluación previa del cabello.".
- Duraciones aproximadas e investigadas (Fresha/AgendaPro, Santiago): 150, 90, 120, 150, 180, 60 y 180 min para decoloración, 120 para la permanente y 45 para los tratamientos. Joe las ajusta desde su panel.
- La carga es idempotente (migración/seed) y queda también en el JSON estático de fallback para el prerender SSR.
- La duración de cada servicio bloquea la agenda: un servicio de 180 min no puede caer encima de otra cita.

## Asunciones (detalles menores, pendientes de validar)
1. Joe puede crear, renombrar, editar la nota y reordenar categorías desde el panel. Solo se borra una categoría vacía.
2. Los servicios nuevos no se pueden hacer a domicilio (`homeServiceAllowed = false`); Joe puede habilitarlo.
3. La migración enlaza los servicios nuevos a **todos los barberos aprobados** (hoy WS Style es "1 silla"). Cada barbero puede desmarcarlos desde su panel.
4. Los slugs de los servicios nuevos son los de la tabla. Los servicios de decoloración no llevan descripción individual: la nota de la categoría cubre la evaluación previa.
5. Dentro de "Decoloración capilar" el orden es el de la lista de Joe.
6. El precio "desde" del hero (`fromPrice`) sigue calculándose sobre toda la carta, así que no cambia (el mínimo sigue siendo de barbería).
7. El panel del barbero (selección de sus servicios) también muestra los servicios agrupados por categoría; no cambia otra cosa.
8. No se cambian eslogan, marquee, `copy.servicios` ni el JSON-LD `BarberShop`. Si Joe quiere que el texto mencione coloración, se hace en otra spec.
