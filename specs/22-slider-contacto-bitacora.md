# SPEC-22 — Slider que no se detiene + flechas, contacto que envía, Bitácora como pantalla

> Pedido del usuario (2026-10-18), vía /owork:
> 1) el slider está con bug, agregale las flechas de la maqueta, y cuando bajo se detiene: la idea es que se mueva.
> 2) "Empecemos un nuevo proyecto": que siempre se vea el botón de adjuntar, el input del correo igual al del mensaje, y que funcione enviar un correo a pedro.luis.rico43@gmail.com con asunto "ricorp.cl contacto".
> 3) noticias como pantalla, no modal. 4) renombrar noticias con un nombre más atractivo que "historia"/"timeline".
> Agregado: al final de la Bitácora, dos reseñas (Torneo TuApp 2013 y 2014) con el estilo de escritura de Pedro.

## Diagnóstico
- Slider "se detiene al bajar": `autoplayActive` exigía `!hovering`; el carrusel ocupa todo el ancho y el centro de la pantalla, así que tras el scroll el puntero queda encima y el auto-play se congela (reproducido: `--slide` fijo 15 s).
- Slider "con bug": el auto-play transicionaba `4200ms linear` = intervalo; la card nueva se marcaba activa (grande + título) al ARRANCAR el paso y llegaba al centro recién al final → card activa siempre descentrada y título encima de la card anterior.
- Contacto: prod (`ricorp-api.onrender.com/api/health`) responde `mailer: "dry-run"` → el formulario muestra "¡Enviado!" y no sale ningún correo.

## Criterios de aceptación
- **AC-01** Con el puntero encima del carrusel (desktop), el auto-play sigue avanzando un paso cada 4.2 s.
- **AC-02** Cada paso del auto-play desliza ~1.1 s con ease-in-out y descansa con la card activa centrada (±10 px del centro del viewport); el título mostrado corresponde a la card centrada.
- **AC-03** Hay flechas anterior/siguiente visibles a los costados del slider (desktop), accesibles por teclado (aria-label i18n), que mueven ±1 con loop y no disparan arrastre ni abren el detalle.
- **AC-04** El botón "Adjuntar archivos" se ve siempre, aun con el formulario vacío.
- **AC-05** El campo de email usa el mismo pill que el campo del mensaje (mismo fondo, radio, padding, tipografía); el botón enviar va dentro, a la derecha.
- **AC-06** `POST /api/contact` envía a `CONTACT_TO` (default pedro.luis.rico43@gmail.com) con asunto exacto `ricorp.cl contacto`, replyTo = email del visitante, adjuntos incluidos; mailer = Gmail SMTP (SMTP_USER/SMTP_PASS) o Resend.
- **AC-07** En Render sin mailer configurado, el endpoint responde 503 (la UI muestra el error reintentable), nunca un ok falso. En local sin mailer: dry-run ok.
- **AC-08** La Bitácora es una pantalla: con `#bitacora` el home se oculta, el header queda visible, la página usa el scroll de la ventana, no hay X ni trampa de foco ni `role=dialog` en la pantalla; "Volver al inicio" y el botón atrás regresan al home en el scroll donde estaba.
- **AC-09** Nombre: "bitácora"/"Bitácora" (esp) y "logbook"/"Logbook" (eng) en navbar y título. `#news`/`#noticias` viejos abren la Bitácora y se normalizan a `#bitacora`.
- **AC-10** Clic en un hito sigue abriendo el detalle (DetailModal) y Escape cierra solo el detalle.
- **AC-11** Las dos reseñas TuApp aparecen al final de la línea de tiempo (las más antiguas).
- **AC-12** `tsc -b --noEmit`, `npm run lint` y `npm run build` verdes.

## Asunciones (usuario ausente/por confirmar)
- Las flechas NO están en el .fig ni en el video de referencia; se diseñaron con el círculo esmerilado de la X del detalle. **Confirmar con una captura de la maqueta** si existe otro diseño.
- Nombre elegido: Bitácora / Logbook.
- Envío real en prod **BLOQUEADO** hasta cargar en Render `SMTP_USER` + `SMTP_PASS` (contraseña de aplicación de Gmail) o `RESEND_API_KEY`.
