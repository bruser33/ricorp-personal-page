# SPEC-36 — Video tutorial de WS Style: registrarse, agendar y pagar, y operar como barbero

> Pedido del usuario (2026-10-25), redefinido: en vez de un comercial, un **video tutorial** horizontal "para enseñar a otros a usar la aplicación, paso a paso y bien explicado", con voz de mujer latina y sin voz robótica al pronunciar "WS Style".

## Historia
Como dueño de ricorp.cl, quiero un video tutorial de WS Style que muestre paso a paso, sobre la app real, cómo se registra un cliente, cómo agenda y paga una cita, y cómo se registra y trabaja un barbero, narrado por una voz femenina latina natural, para que cualquier cliente o barbero nuevo aprenda a usar la aplicación sin ayuda.

## Estado actual / referencias
- Patrón de producción (solo **lectura**): el comercial anterior hecho en local (`guion.json` con `voz`, `sub`, `t`, `plano`; `scripts/voz.py`; `scripts/montaje.py`; `escenas/`). **No se escribe nada en ese directorio.**
- Reel existente de la marca: `~/Projects/barberia-3d/clip/` (`README.md`, `COMO-SE-HIZO-EL-REEL.txt`, `LICENCIAS.md`, `scripts/voz.py`, `scripts/capture.mjs`, `scripts/montage.py`). Ya resolvió pronunciación con texto fonético ("Dábliu Stáil"), música CC0, ducking, subtítulos quemados y cierre "Powered by ricorp.cl".
- Herramientas locales: `ffmpeg` en `/opt/homebrew/bin/ffmpeg`. **No hay ASR instalado** (ni `whisper`, `whisper-cpp` ni `faster_whisper`): hay que instalar uno local.
- Dependencias funcionales (deben estar funcionando en local antes de grabar): **SPEC-32** (agendamiento), **SPEC-35** (pagos Mercado Pago sandbox), y las specs de **registro de clientes con cuenta + login con Facebook**, **registro y aprobación de barberos por super admin** y **panel del barbero** (las que correspondan entre 24–35). Si alguna no existe todavía, el capítulo afectado queda bloqueado y se reporta.

## Alcance
- **Incluye:**
  1. Proyecto nuevo en `~/Projects/barberia-3d/clip-tutorial/` (guion, scripts, capturas, salidas, licencias, README).
  2. Guion por capítulos con tiempos, planos y texto de voz/subtítulo.
  3. Grabación de pantalla de la app **local** funcionando, con datos ficticios, en 16:9.
  4. Recursos de tutorial: título de capítulo en pantalla, resaltado del elemento donde se hace clic (cursor visible + halo/zoom), pausas para leer.
  5. Voz `es-US-PalomaNeural` vía `edge-tts` con 3–4 variantes fonéticas de "WS Style", validadas por ASR local.
  6. Música CC0 suave (baja, con ducking), subtítulos quemados, mezcla a −14 LUFS, cierre "Powered by ricorp.cl".
  7. Capítulos navegables: archivo de capítulos (marcas de tiempo) para YouTube y metadatos de capítulos en el MP4.
  8. `LICENCIAS.md` con cada insumo y la nota sobre edge-tts.
- **Fuera:** versión vertical 9:16; publicar en redes; voz humana; pagos reales (solo sandbox); login con Instagram; capítulo del super admin como tutorial propio (solo aparece la aprobación como paso del barbero); cambios funcionales a la app (los fallos se reportan contra su spec).

## Estructura del guion (borrador, estimado 3–6 min)
0. **Intro (≈15 s):** toma 3D de WS Style + "En este tutorial aprenderás a reservar y pagar tu cita, y si eres barbero, a recibir clientes en WS Style". Índice de los 3 capítulos en pantalla.
1. **Capítulo 1 — Registrarse como cliente (≈45–60 s):**
   1a. Con email: abrir registro → nombre, email, contraseña → aceptar términos → verificación/confirmación → sesión iniciada.
   1b. Con Facebook: botón "Continuar con Facebook" → diálogo de Meta (cuenta de prueba) → vuelta a la app con sesión iniciada.
2. **Capítulo 2 — Agendar una cita (≈90–120 s):** elegir servicio → elegir barbero → fecha y hora disponibles → domicilio opcional (dirección + **recargo** visible en el total) → método de pago: **Mercado Pago (sandbox)** o **pagar en el local** → confirmación en pantalla y notificación (correo/aviso) de la reserva. Se muestran ambas ramas de pago (una completa, la otra en un plano corto).
3. **Capítulo 3 — Registrarse como barbero y usar su panel (≈90–120 s):** registro de barbero → estado **"pendiente de aprobación"** → (plano corto) el super admin lo aprueba → el barbero configura perfil (foto, bio), servicios y precios, disponibilidad semanal y si atiende a domicilio (zona/recargo) → panel: **agenda de hoy**, abrir una cita, **iniciar** y **terminar** atención.
4. **Cierre (≈10–15 s):** resumen en 3 líneas + "Reserva en WS Style" + "Powered by ricorp.cl".

## Reglas de negocio
1. Formato **16:9, 1920×1080, 30 fps**, H.264 + AAC, MP4.
2. Voz **es-US-PalomaNeural** (edge-tts), ritmo pausado de tutorial (rate entre −10 % y 0 %). En el texto enviado al TTS, "WS Style" va en forma fonética; en subtítulos y títulos siempre aparece **"WS Style"**.
3. **Pronunciación:** generar 3–4 variantes (p.ej. "Dóbleu Ese Stáil", "Dábliu Ése Stáil", "Dóble Ú Ese Stáil", "Dábliu És Stáil"), transcribir cada una con ASR local (whisper.cpp o faster-whisper, modelo ≥ small, idioma es) y registrar si se reconoce "WS Style" o equivalente ("W S Style", "WS Stail", "doble u ese style"). Se entregan las variantes con su resultado y **la elección final la hace el usuario**.
4. **Ritmo de tutorial:** cada capítulo abre con una tarjeta de título (≥ 2 s); cada clic se anticipa con el cursor y se resalta el elemento (halo o zoom) **antes** del clic; tras cada pantalla nueva hay una pausa ≥ 1,5 s antes de la siguiente acción; los campos se escriben a velocidad legible, no pegados de golpe.
5. La narración explica **qué** se hace y **por qué** (p.ej. "el recargo por domicilio se suma al total"), en segunda persona (tú), sin jerga técnica.
6. Todo lo que aparece en pantalla son **datos ficticios**: nombres, emails, teléfonos, direcciones, cuenta de prueba de Facebook (usuario de prueba de la app de Meta), tarjetas de prueba de Mercado Pago. Nunca datos reales, credenciales, tokens ni barras de URL con secretos.
7. Música **CC0 / dominio público**, bajo volumen y con ducking bajo la voz.
8. Loudness integrado **−14 LUFS ±1**, true peak ≤ −1 dBTP.
9. Subtítulos quemados legibles, sin tapar la UI que se está explicando, sincronizados con la voz (desfase ≤ 200 ms).
10. Licencias: edge-tts **no es API oficial**; `LICENCIAS.md` y README indican que para uso comercial se regenera la voz con **Azure Speech** (misma voz, con licencia).
11. Aislamiento: nada se escribe en el directorio del comercial anterior; el tutorial no menciona otros productos.

## Flujo principal
1. Verificar que las specs dependientes funcionan en local; sembrar datos ficticios (barberos, servicios, disponibilidad, 3–5 citas del día) con un script de seed reproducible.
2. Escribir `guion.json` por capítulo (mismo esquema del patrón: `voz`, `sub`, `t`, `plano`, más `capitulo` y `accion`/selector a resaltar).
3. Generar voz con las variantes fonéticas; transcribir con ASR; guardar `pronunciacion.json` con resultados.
4. Grabar cada capítulo con Playwright (viewport 1920×1080, cursor visible, movimientos suaves, resaltado inyectado), un script por capítulo para poder regrabar uno solo.
5. Montaje: tarjetas de capítulo + planos + voz + música con ducking + subtítulos + cierre; capítulos como metadatos y `capitulos.txt` (formato YouTube `mm:ss Título`).
6. Normalizar a −14 LUFS y exportar a `out/`.
7. README con comandos para regenerar todo, un capítulo suelto o cambiar la variante fonética; `LICENCIAS.md`.

## Casos borde
- Ninguna variante fonética es reconocida por el ASR: se prueban pausa corta entre "WS" y "Style", rate/pitch, y se reporta la mejor con su transcripción.
- Login con Facebook no disponible en local (app de Meta en modo desarrollo sin usuario de prueba, o requiere HTTPS): se graba con túnel HTTPS local o se marca el sub-capítulo 1b como bloqueado; nunca se finge la pantalla de Meta.
- Checkout de Mercado Pago sandbox no carga: se graba hasta donde llegue y se marca el plano como bloqueado; la rama "pagar en el local" se graba completa igual.
- Notificación por correo: se muestra desde un buzón de pruebas local (p.ej. Mailpit/Ethereal), no un correo real.
- Aprobación del super admin: se muestra en un plano corto con una cuenta admin ficticia.
- La UI cambia después de grabar: los scripts de captura usan selectores estables para regrabar con un comando.
- edge-tts falla: reintento; Piper solo como respaldo de pruebas, no para la entrega.

## Criterios de aceptación
- **AC-01** Existe `~/Projects/barberia-3d/clip-tutorial/` con `guion.json`, `scripts/` (seed, voz, captura por capítulo, montaje), `out/`, `README.md` y `LICENCIAS.md`; nada se escribió en el directorio del comercial anterior.
- **AC-02** `out/` contiene un MP4 1920×1080, 30 fps, H.264+AAC, de 3–6 min (`ffprobe`), con metadatos de capítulos, y `out/capitulos.txt` con marcas de tiempo que coinciden (±1 s) con las tarjetas de título.
- **AC-03 Capítulo 1:** se ve el registro de cliente con email (hasta sesión iniciada) y con Facebook (diálogo real de Meta con usuario de prueba, vuelta con sesión iniciada).
- **AC-04 Capítulo 2:** se ve servicio → barbero → fecha/hora → domicilio con recargo reflejado en el total → pago Mercado Pago sandbox completo → confirmación + notificación; y la rama "pagar en el local" hasta su confirmación.
- **AC-05 Capítulo 3:** se ve registro de barbero → estado pendiente → aprobación del super admin → configuración de perfil, servicios, disponibilidad y domicilio → panel con agenda de hoy → iniciar y terminar una cita (cambio de estado visible).
- **AC-06 Ritmo:** cada capítulo abre con tarjeta de título ≥ 2 s; cada clic narrado tiene resaltado visible antes del clic (revisión de 1 fotograma por clic en una muestra de ≥ 10 clics); pausa ≥ 1,5 s tras cada pantalla nueva.
- **AC-07 Voz:** `es-US-PalomaNeural`; hay 3–4 variantes fonéticas de "WS Style" con su transcripción ASR guardada en `pronunciacion.json`, y al menos una se transcribe como "WS Style" o equivalente aceptado.
- **AC-08** Subtítulos y títulos dicen "WS Style" (nunca la forma fonética), quemados y sincronizados (≤ 200 ms).
- **AC-09** Loudness −14 ±1 LUFS y true peak ≤ −1 dBTP (salida de `ffmpeg ebur128`/`loudnorm` guardada).
- **AC-10** Música CC0 con fuente y licencia en `LICENCIAS.md`; ducking bajo la voz.
- **AC-11** El último plano muestra "Powered by ricorp.cl".
- **AC-12** Sin datos reales: revisión de 1 fotograma por plano sin nombres, emails, teléfonos, tarjetas, tokens ni URLs con secretos reales.
- **AC-13** `LICENCIAS.md` y `README.md` incluyen la nota de edge-tts / Azure Speech; el README documenta cómo regenerar todo, un capítulo, y cambiar la variante fonética.

## Decisiones confirmadas
- Es un **video tutorial** (no comercial), paso a paso y bien explicado.
- **16:9 horizontal**; voz **es-US-PalomaNeural** vía edge-tts.
- Capítulos obligatorios: (1) registro de cliente con email y con Facebook; (2) agendar cita: servicio → barbero → fecha/hora → domicilio opcional con recargo → Mercado Pago sandbox o pagar en el local → confirmación/notificación; (3) registro de barbero → pendiente → aprobación del super admin → perfil, servicios, disponibilidad, domicilio → panel (agenda de hoy, iniciar/terminar).
- Ritmo de tutorial: títulos de capítulo, resaltado del clic (cursor/zoom/halo), pausas para leer, subtítulos; duración libre (estimado 3–6 min); datos ficticios.
- Los clientes se registran con cuenta (reemplaza la asunción previa de reservar sin cuenta); login social = **Facebook (Meta Login)**.
- La marca es **WS Style** (SPEC-24). La elección final de la pronunciación la hace el usuario.

## Asunciones pendientes de validar
1. **Instagram no aparece** en el tutorial: Meta cerró la Basic Display API (dic-2024) y no hay login de consumidor con Instagram.
2. Tono: tuteo latino neutro, sin chilenismos, cercano y claro.
3. Se entrega **un video principal** con la variante fonética mejor transcrita + los audios de las otras para escoger.
4. Un solo video con los 3 capítulos (no videos separados por capítulo); los capítulos se navegan por metadatos/`capitulos.txt`.
5. La aprobación del super admin se muestra como plano corto dentro del capítulo 3, no como capítulo propio.
6. La notificación de reserva se muestra como correo en un buzón de pruebas local.
7. Se reutiliza la música CC0 del reel a bajo volumen, o se omite música durante los pasos y solo suena en intro/cierre.
8. Se incluye la toma 3D de WS Style (SPEC-30) solo en intro y cierre.
9. La rama "pagar en el local" se muestra en un plano corto después del flujo completo con Mercado Pago.
