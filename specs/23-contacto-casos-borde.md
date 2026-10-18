# SPEC-23 — Formulario de contacto: un mensaje claro por cada error, y pruebas que lo demuestran

> Pedido del usuario (2026-10-18): "necesito que pruebes casos borde de la única funcionalidad que tengo; tenemos que mostrar un mensaje para cada error y demostrar que lo tratamos bien, por ejemplo si selecciona muchos archivos".

## Estado actual
- `client/src/components/Contact.tsx`: valida en el cliente máx. 5 archivos y 10 MB en total (`MAX_FILES`, `MAX_TOTAL_BYTES`), duplicados por nombre+tamaño se ignoran en silencio, `accept` filtra el selector. Cualquier fallo del envío muestra UN mensaje genérico (`contact.error`).
- `server/src/index.js`: `POST /api/contact` valida subject/email, 413 por cantidad/tamaño (multer), 503 sin mailer en Render, 502 si falla Resend/SMTP. El server arranca (connect + listen) al importarse: no se puede testear sin levantarlo.
- No hay tests.

## Criterios de aceptación (cada error con SU mensaje, en esp y eng, visible y anunciado con role="alert")
- **AC-01 Demasiados archivos:** elegir más de 5 (de una vez o sumando) → no se agrega ninguno de la tanda que pasa el tope y se muestra "Puedes adjuntar hasta 5 archivos" (ya existe; mantener y testear).
- **AC-02 Demasiado peso total:** si la suma supera 10 MB → mensaje con el tope (ya existe; testear).
- **AC-03 Un archivo solo demasiado grande:** un archivo > 10 MB → mensaje específico nombrando el archivo.
- **AC-04 Tipo no permitido:** un archivo fuera de `image/*,.pdf,.doc,.docx,.txt,.zip` (p.ej. .exe, .js) → se rechaza ESE archivo con mensaje nombrándolo; los válidos de la tanda sí entran. El server también rechaza tipos no permitidos (400 con código).
- **AC-05 Duplicado:** elegir el mismo archivo otra vez → aviso "Ese archivo ya está adjunto" (hoy se ignora en silencio).
- **AC-06 Archivo vacío (0 bytes):** se rechaza con mensaje.
- **AC-07 Mensaje vacío o solo espacios:** no envía; mensaje junto al campo.
- **AC-08 Mensaje demasiado largo:** límite 5000 caracteres (cliente con contador cerca del tope y server 400 si lo supera).
- **AC-09 Email vacío o inválido** (p.ej. "a@b", "sin-arroba", espacios): mensaje propio (no solo el tooltip nativo del navegador), y el server responde 400 `invalid email`.
- **AC-10 Errores del server con mensaje propio:** 400 (datos inválidos), 413 (adjuntos), 429 (demasiados envíos), 502 (no se pudo entregar el correo), 503 (servicio de correo no configurado) → cada uno con su texto; el botón queda en "Reintentar" cuando reintentar tiene sentido.
- **AC-11 Sin conexión / timeout:** fetch que falla o tarda > 20 s (AbortController) → "Sin conexión… revisa tu internet y reintenta".
- **AC-12 Doble envío:** clics repetidos mientras envía → un solo POST.
- **AC-13 Abuso básico:** rate limit en server (p.ej. 5 envíos por IP cada 10 min → 429) y campo honeypot oculto (si viene lleno → 200 fingido sin enviar correo).
- **AC-14 Pruebas automatizadas que lo demuestran:**
  - Server: `server/src/app.js` exporta la app (index.js solo conecta y escucha) y `node --test` en `server/test/contact.test.js` cubre: ok (dry-run), faltan campos, email inválido, mensaje largo, >5 archivos (413), >10 MB (413), tipo no permitido, archivo vacío, honeypot, rate limit 429, y 503 con RENDER=true sin mailer. Script `npm test` en server.
  - Cliente: lógica de validación extraída a `client/src/lib/contactValidation.ts` (funciones puras) con tests en vitest (`npm test` en client) para AC-01…AC-09; y el mapeo de status HTTP → mensaje (AC-10/11).
- **AC-15** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` verdes.

## Asunciones
- Límite de mensaje 5000 caracteres; rate limit 5/10 min por IP en memoria (Render free: una instancia).
- Textos en el tono del sitio (tú), esp + eng en `i18n.tsx`.
