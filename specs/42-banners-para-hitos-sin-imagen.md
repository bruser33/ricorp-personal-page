# SPEC-42 — Banner e imágenes para los hitos de Trayectoria que no tienen

> Pedido del usuario (2026-10-27), ítem 5: "diseñar banner e imágenes para la vista trayectoria para las publicaciones que no la tienen".

## Historia
Como visitante, quiero que cada publicación de la Trayectoria tenga su banner y sus imágenes, para que la grilla se vea completa y
cada post se lea como los de W Style, Haru e Invasión UFPS.

## Estado actual
Hitos sin `imagen` en `client/src/data/trayectoria.ts` (hoy su tarjeta es un bloque de texto, `news-card__media--texto`):
`workana-freelancer`, `youtube-proyectos-informaticos`, `tuapp-2014-smartcorp`, `tuapp-2013-r2d2`. Ninguno tiene `mockups`.

## Alcance
- **Incluye**, por cada uno de los 4 hitos:
  1. Un **banner** apaisado `client/public/figma-frames/<id>-banner.webp` (≥ 2400 px de ancho, ≤ 500 KB) que funcione como
     imagen de la tarjeta de la grilla y como banda del post (fijar `focoBanner`/`altoBanner` si hace falta).
  2. Dos **imágenes** de apoyo para el cuerpo del post (`mockups`: `<id>-1.webp`, `<id>-2.webp`), coherentes con lo que cuenta el hito.
  3. Actualizar el hito con `imagen`, `mockups` (y foco/alto).
- Dirección de arte: misma línea del sitio (fondo oscuro, acentos de la paleta RICORP, tipografía del sitio), composiciones
  tipográficas/gráficas con datos reales del hito (año, lugar, cifra) — tipo "portada editorial".
- Material real permitido si existe: certificados/cartas de TuApp (correos 2013–2014 de Pedro), miniaturas de su propia playlist de YouTube.
- **Fuera:** hitos de relleno; capturas o logos de Workana (TyC); logos de terceros (TuApp, Google, GAM) salvo que vengan en material
  propio de Pedro (p.ej. su certificado).

## Reglas de negocio
1. Generar las imágenes con código reproducible (script en `client/scripts/` o en el scratchpad documentado en el commit),
   con Playwright **headless propio** o PIL — **no usar el Playwright MCP** (lo comparte el resto de las specs en paralelo).
2. Ningún dato inventado en la imagen (mismas fuentes que la descripción del hito).
3. Sin datos personales sensibles (RUT, emails, teléfonos) en lo publicado.
4. Las 4 portadas se ven como una serie (misma grilla, mismos márgenes), pero cada una con un motivo propio.

## Criterios de aceptación
- **AC1** Los 4 hitos tienen `imagen` y `mockups` (2) y los archivos existen en `client/public/figma-frames/`.
- **AC2** En `/trayectoria` ninguna tarjeta queda con `.news-card__media--texto`.
- **AC3** Cada banner pesa ≤ 500 KB y se ve nítido a 1440 px; ninguno trae texto cortado por el encuadre de la tarjeta ni de la banda.
- **AC4** `npm run build` en verde.

## Asunciones
1. "Las publicaciones que no la tienen" = los 4 hitos reales sin `imagen` (los de relleno ya tienen imagen de la maqueta).
2. Diseño gráfico/tipográfico generado, no fotos de stock ni imágenes de IA con personas.
