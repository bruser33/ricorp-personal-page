# SPEC-49 · Sitio SCB Express + plataforma con el mismo estilo

## Historia
Como dueño de SCB Express quiero un sitio nuevo, inspirado en Nuvocargo pero con identidad
propia, que presente el servicio y muestre la plataforma de órdenes, etiquetas y seguimiento
que ya usamos (`bruser33/scb-web`), para vender el servicio y la plataforma juntos.

## Asunciones (completadas sin el usuario, revisables)
1. Vive como página estática en `client/public/scb-express/` (igual que los dossiers), con
   `noindex`, para mostrársela al cliente en `ricorp.cl/scb-express/`. No toca el repo `scb-web`.
2. "Azul más representativo": el logo rojo (#DE2000) se recolorea a azul **#1546D1**; la marca
   usa ese azul + navy **#0A1A3D** (el #202156 que ya usa la etiqueta, llevado a azul).
3. Nuvocargo es inspiración, no plantilla: se toma la estructura (hero con input, tarjetas con
   UI real del producto, sección de plataforma, clientes/casos) y se cambia todo lo visible:
   paleta fría azul (no crema/verde), sans grotesca (no serif), hero con la columna de Chile
   en SVG (no camión en nubes).
4. Sin video (lo pidió el cliente): movimiento con SVG/CSS/JS, nada de `<video>` ni mp4.
5. Solo logística, sin discurso de salud (decisión del dossier V).
6. La plataforma es un **demo estático** con datos ficticios que replica las pantallas reales
   de scb-web (login, dashboard, órdenes, nueva OD + carga masiva, etiqueta, control de rutas,
   reporte, clientes, documentos, seguimiento público) con el estilo nuevo. No se conecta a
   medicalcourrierapi.com.
7. Cifras, ciudades y horarios de corte son de ejemplo y se marcan como tales; no se inventan
   clientes con nombre ni testimonios.
8. Teléfono/WhatsApp/correo reales de SCB: **BLOQUEADO** (no los tengo); el formulario de
   cotización queda en modo demo.

## Criterios de aceptación
- AC1 `scb-express/index.html` existe, carga sin errores de consola y tiene las secciones
  hero, servicios, plataforma, cómo funciona, cobertura, cotizar y footer.
- AC2 El logo usado es la versión azul (no queda el rojo #DE2000 en la marca).
- AC3 El hero tiene un input "Número de OD" que lleva al seguimiento de la plataforma demo.
- AC4 La sección plataforma muestra capturas reales de la plataforma demo (archivos en
  `scb-express/img/`), con pestañas para cambiar entre pantallas.
- AC5 `scb-express/plataforma/index.html` tiene todas las pantallas de la asunción 6,
  navegables, con el mismo sistema visual (mismos tokens de color y tipografía).
- AC6 La etiqueta de la plataforma es 100×150 mm, numera los bultos (1/N … N/N) y tiene
  código de barras y QR.
- AC7 Ningún `<video>` ni archivo de video; ninguna mención a salud en el texto, JS ni
  atributos (alt, placeholder, title, aria-label). Excepción explícita: la imagen del logo
  de la marca dice "Courier Medical Express" (nombre de la marca del cliente); no se edita el
  logo sin su aprobación — queda como **pregunta abierta** al cerrar.

## Verificación
- `node scripts/verify-scb-express.mjs` — estática (estructura, archivos, palabras, JS parsea).
- `PW_DIR=<playwright> PW_CHROME=<chrome> node scripts/verify-scb-express.e2e.mjs` — en
  navegador: errores de consola, pestañas, seguimiento coherente con el estado, navegación,
  teclado en órdenes, etiquetas 1/N…N/N de 100×150 con Code 128 y QR reales, 390 px y
  reduced-motion.
- AC8 Responsive: sin scroll horizontal a 390 px de ancho, en el sitio y en la plataforma.
- AC9 Respeta `prefers-reduced-motion`.
