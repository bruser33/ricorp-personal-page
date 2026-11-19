# SPEC-58 — WS Style: kit de difusión del link de reservas

> Pedido del dueño de WS Style (Joe, GitHub `jhoncamacho017-ai`), 2026-11-18. Las decisiones se tomaron con el usuario. Idea de referencia: "Tu link y tu QR / Tu Kit de Reservas" de SillaLibre (catálogo §2). Se toma la idea, no la marca ni el diseño.

## Estado actual
- El link público de reservas es `https://ricorp.cl/wstyle/reservar/` (`client/public/CNAME` = `ricorp.cl`; `BookingPage.tsx`). Acepta `?servicio=…&barbero=…`, y esa selección sobrevive al login (SPEC-38).
- Las citas guardan `source` (`web | pro_invite | admin`), pero **no guardan de qué canal llegó el cliente** (Instagram, WhatsApp, cartel).
- El panel del super admin (`/wstyle/admin/`, `admin/util.ts`) tiene Inicio, Estadísticas (`StatsPage.tsx`, `server/src/domain/stats.js`) y Configuración. No hay una sección de difusión.
- El barbero tiene `CopyLink.tsx` en su panel para copiar enlaces.
- La identidad "Noir de oficio" ya está en el código: Anton (titulares), Cormorant Italic, Inter, hueso sobre negro y el acento `--brass #B8875A`. El wordmark de WS Style es tipográfico (ver `components/Nav.tsx`).

## Historia
Como **dueño de WS Style** quiero **tener listo un QR, un cartel, una placa para Instagram y textos para compartir mi link de reservas**, para **que la gente reserve sola sin escribirme por WhatsApp**.
Como **dueño**, quiero **saber de dónde vienen las reservas (Instagram, WhatsApp, cartel)** para **saber qué canal me funciona**.

## Alcance
**Incluye**
1. **Sección nueva del panel del super admin, "Difusión"** (`/wstyle/admin/difusion/`), con:
   - **Tu link**: el link de reservas con [Copiar] y [Abrir].
   - **QR suelto**: QR del link con un margen de silencio correcto, descargable en **PNG** (1024×1024) y **SVG**.
   - **Cartel imprimible**: selector **A4 / Carta**. Lleva el wordmark WS STYLE, el titular "RESERVA TU HORA", el QR grande, el link legible ("ricorp.cl/wstyle/reservar") y una línea con el horario o la dirección (desde `site.json`/`Business`). Tiene [Imprimir] (hoja de impresión del navegador con `@page` del tamaño elegido) y [Descargar PDF] o [Descargar PNG] (asunción 3).
   - **Placa para historia de Instagram** 1080×1920 PNG: fondo negro con la textura de la marca, wordmark, titular, QR y link. Deja libres las zonas seguras (aproximadamente 250 px arriba y abajo) para la interfaz de Instagram.
   - **Textos listos para copiar**: mensaje de WhatsApp, texto para la bio de Instagram y texto para un post o historia. Cada uno con [Copiar] y su link con el UTM del canal ya puesto.
2. **Generación en el cliente**: QR, cartel y placa se generan en el navegador (canvas o SVG) con las fuentes de la marca ya cargadas. No hay servicios externos de QR ni llamadas al server para generar imágenes.
3. **Links con UTM**: cada pieza usa su propio origen:
   - QR suelto y cartel → `utm_source=cartel`;
   - placa de Instagram e historia → `instagram_historia`;
   - bio de Instagram → `instagram_bio`;
   - mensaje de WhatsApp → `whatsapp`;
   - [Copiar] de "Tu link" → sin UTM.

   Todos con `utm_medium=kit&utm_campaign=reservas`. El interruptor "Incluir seguimiento (UTM)" viene prendido y, si se apaga, todas las piezas usan el link limpio.
4. **Registro del origen**:
   - la reserva lee `utm_source` al entrar a `/wstyle/reservar/` y lo conserva durante el login (igual que `?servicio=`);
   - al crear la cita se guarda `origin` (texto normalizado, ver RN-03) en la cita;
   - sin UTM → `directo`.
5. **Conteo por origen en Estadísticas**: una tabla "Reservas por origen" en el rango elegido, con origen, reservas creadas y reservas terminadas.

**Fuera**
- Contar visitas o clics sin reserva (no hay analítica de páginas; asunción 5).
- Acortadores de links, dominios propios para el link o links por barbero.
- Video o Reel auto-generado (SillaLibre §15).
- Publicar directo en Instagram o WhatsApp. Solo se copia o descarga; en móvil, opcionalmente, la hoja de compartir del sistema.
- Kit para el panel del barbero (asunción 6).

## Reglas de negocio
- **RN-01 Un solo link base.** Todas las piezas apuntan a `https://ricorp.cl/wstyle/reservar/`. El dominio sale de la configuración del front (no se escribe a mano en cada pieza), para que local muestre `http://127.0.0.1:5173/wstyle/reservar/` y prod el dominio real.
- **RN-02 Legibilidad del QR.** Nivel de corrección de errores M o superior, módulos negros sobre fondo hueso claro (nunca un QR invertido sobre negro) y zona de silencio de al menos 4 módulos. El QR del cartel mide al menos 6 cm impreso. Con UTM, el link sigue siendo corto para no densificar el QR (sin parámetros extra).
- **RN-03 Origen normalizado.** `utm_source` se pasa a minúsculas, se recorta a 40 caracteres y solo admite `[a-z0-9_-]`. Un valor inválido o ausente → `directo`. Los orígenes desconocidos (por ejemplo, `tiktok` puesto a mano) se guardan tal cual y aparecen en la tabla.
- **RN-04 Origen por cita.** Se guarda una sola vez al crear la cita y no cambia después. Las citas `pro_invite` y `admin` quedan con origen vacío y no entran en la tabla (asunción 4).
- **RN-05 Textos.** Español de Chile, sin voseo, tono de la marca. Base editable en el código (no en el panel):
  - WhatsApp: "Hola, ya puedes reservar tu hora en WS Style en línea, en un minuto: <link>";
  - Bio: "Reserva tu hora ↓ <link>";
  - Post: "Elige día, hora y barbero en ricorp.cl/wstyle/reservar".
- **RN-06 Sin datos falsos.** El cartel y la placa solo muestran datos reales del negocio (horario o dirección desde la BD o `site.json`). Si falta un dato, esa línea no se dibuja.
- **RN-07 Acceso.** Solo el super admin ve "Difusión" y el detalle de orígenes. El origen guardado en la cita no se muestra al cliente.

## Flujo principal
1. Joe entra en Panel → Difusión y ve su link con [Copiar].
2. Descarga el QR en SVG para enviarlo a una imprenta. Elige "Cartel A4" → [Imprimir] → lo pega en el espejo del local.
3. Descarga la placa 1080×1920 y la sube como historia con el sticker de enlace. Copia la bio y la pega en Instagram.
4. Un cliente escanea el cartel → entra a `/wstyle/reservar/?utm_source=cartel&…` → inicia sesión → reserva. La cita queda con `origin = cartel`.
5. En Estadísticas, "Reservas por origen" del mes muestra: cartel 4, instagram_bio 7, whatsapp 3, directo 12.

## Casos borde
- **CB-01** El cliente entra con UTM, inicia sesión con Google o Facebook (redirección) y vuelve → el origen se conserva.
- **CB-02** `utm_source=<script>` o un texto de 200 caracteres → se normaliza o queda `directo` (RN-03). Nunca se renderiza como HTML.
- **CB-03** Las fuentes de la marca no terminaron de cargar → la descarga espera a `document.fonts.ready` antes de dibujar. No sale una placa con fuente de sistema.
- **CB-04** Safari iOS: descargar el PNG funciona (blob + enlace, o la hoja de compartir) sin abrir una pestaña en blanco.
- **CB-05** El interruptor de UTM está apagado → todos los QR y textos usan el link limpio; las reservas entran como `directo`.
- **CB-06** Al imprimir el cartel en Carta, el contenido cabe en una página, sin cortes.
- **CB-07** Móvil 390 px: la sección "Difusión" se usa sin scroll horizontal y las vistas previas se ven escaladas.

## Criterios de aceptación
Tests de client con vitest y de server con `node --test` contra la BD de test real. Navegador en `http://127.0.0.1:5173/wstyle/admin/difusion/` a 1440×900 y 390×844.

- **AC-01 Links.** Una función pura arma el link por pieza con el UTM correcto y sin UTM cuando el interruptor está apagado. Usa el origen base configurado (local o prod). Test vitest.
- **AC-02 QR válido.** El QR generado (PNG y SVG) se decodifica de vuelta al link exacto, incluido el UTM (test vitest con un decodificador de QR sobre el canvas o el SVG). Zona de silencio ≥ 4 módulos.
- **AC-03 Descargas.** En el navegador, [PNG] y [SVG] del QR, [Descargar] de la placa (1080×1920 exactos) y del cartel descargan archivos con nombre `wstyle-qr.png`, `wstyle-qr.svg`, `wstyle-historia.png` y `wstyle-cartel-a4.pdf` (o el PNG equivalente). Se verifican sus dimensiones.
- **AC-04 Impresión.** La vista de impresión del cartel en A4 y en Carta cabe en una página (emulación de `print` en Playwright: un solo salto de página). Captura de cada tamaño.
- **AC-05 Textos.** Cada [Copiar] pone en el portapapeles el texto de RN-05 con su link y UTM. Se muestra "Copiado" por 2 s.
- **AC-06 Origen en la cita.** Crear una cita web después de entrar con `?utm_source=Instagram_Bio` guarda `origin = instagram_bio`; sin UTM → `directo`; un valor inválido → `directo`. El origen sobrevive a la puerta de sesión (vitest de la persistencia de la selección + test de server del campo). Las citas `admin` no guardan origen.
- **AC-07 Estadísticas.** Con citas de seed de orígenes mixtos, el endpoint de estadísticas devuelve el conteo por origen en el rango (creadas y terminadas), y la tabla se ve en `StatsPage`. Test de server + navegador.
- **AC-08 Acceso.** Client y barber → 403 en los endpoints nuevos. La sección no aparece en el menú de otros roles. Test de server.
- **AC-09 Identidad visual.** Captura de la placa y del cartel: solo la paleta de la marca (negro, hueso, `--brass`), Anton en el titular y el QR oscuro sobre claro. Sin errores de consola.
- **AC-10 Gates.** `cd client && npx tsc -b --noEmit && npm run lint && npm run build && npm test` y `cd server && npm test` en verde.

## Decisiones confirmadas (por el usuario)
- En el panel admin: QR del link de reservas descargable en PNG y SVG, cartel imprimible (A4/Carta) con logo + QR + texto, placa para historia de Instagram (1080×1920) y textos listos para copiar (WhatsApp, Instagram, bio).
- Todo se genera en el cliente con la identidad de WS Style.
- El link lleva UTM opcional para medir de dónde vienen las reservas, con un conteo simple por origen en Estadísticas.

## Asunciones (detalles menores, pendientes de validar)
1. El kit vive en una sección nueva "Difusión" del panel del super admin, no dentro de Configuración.
2. Los textos base están en el código (no editables desde el panel). Si Joe quiere cambiarlos, se ajustan en una spec chica.
3. El cartel se descarga como PDF si la librería es liviana. Si no, como PNG a 300 dpi, más [Imprimir] del navegador.
4. Solo se mide el origen de reservas web. Las citas creadas por el barbero o el admin no cuentan.
5. No se cuentan visitas ni escaneos sin reserva. La métrica es "reservas por origen".
6. El barbero no tiene kit propio. Si se quiere un link por barbero (`?barbero=`), queda para otra spec.
7. La placa no incluye foto del local ni del barbero: solo tipografía, textura y QR, para no depender de imágenes.
