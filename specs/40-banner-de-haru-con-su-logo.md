# SPEC-40 — Banner de Haru con su logo, al estilo del de Invasión UFPS

> Pedido del usuario (2026-10-27), ítem 2: "en Haru diséñale el banner con el mismo logo, igual que como hiciste con el del videojuego".

## Historia
Como visitante, quiero que el post de Haru abra con un banner propio que muestre su logo completo y centrado,
como el de Invasión UFPS, para reconocer la marca apenas se abre el proyecto.

## Estado actual
- Haru (`client/src/data/trayectoria.ts`, id `haru`) usa `imagen: 'figma-frames/image-7.webp'` (imagen genérica de la maqueta)
  sin `focoBanner` ni `altoBanner`.
- Invasión UFPS: `imagen: 'figma-frames/invasion-ufps-menu-hd.webp'` (HD 2880 px, logo centrado), `altoBanner: 0.6`, `focoBanner: '50% 4%'`.
  Esa es la referencia de cómo debe verse.
- Fuentes de marca de Haru: `~/Downloads/haru-x/HARU` y `~/Downloads/HARU-20261018T112831Z-1-001.zip` (identidad: Montserrat,
  verdes y naranjos, fondos de hojas, lema "Ayuda, Crea, Anuncia, Crece"); `client/public/figma-frames/haru-brand.webp`.

## Alcance
- **Incluye:** componer `client/public/figma-frames/haru-banner-hd.webp` (≥ 2560 px de ancho, apaisada) con el **logo original de Haru**
  (vectorial o el de mayor resolución que exista en las fuentes; nada redibujado a mano si existe el original) centrado sobre un fondo
  de su identidad (verdes/naranjos/hojas); actualizar el hito `haru` con `imagen`, `altoBanner` y `focoBanner` para que el logo entre
  entero con aire en la banda del modal y se lea bien en la tarjeta del slider y de Trayectoria.
- **Fuera:** cambiar textos o mockups de Haru; otros proyectos.

## Reglas de negocio
1. El logo es el de la marca (mismo trazo, mismos colores); solo se escala/recompone, no se rediseña.
2. Sin texto adicional incrustado en la imagen (el título lo pone la página).
3. Peso ≤ 600 KB en webp.
4. No tocar `invasion-ufps-*` ni `wstyle-*`.

## Criterios de aceptación
- **AC1** Al abrir Haru (slider y Trayectoria) la banda muestra el logo completo, centrado horizontalmente y sin recortes, con
  margen visible arriba y abajo (captura a 1440×900 y 390×844).
- **AC2** La tarjeta de Haru en el slider y en la grilla de Trayectoria muestran el banner nuevo sin recortar el logo de forma fea
  (el logo puede quedar parcial en la tarjeta solo si se ve intencional; preferible entero).
- **AC3** La imagen es nítida a sangre en 1440 px (sin artefactos de escalado visibles).
- **AC4** `npm run build` en verde.

## Asunciones
1. "harui" = Haru. "Igual que el videojuego" = mismo tratamiento: banner HD con el logo centrado, banda alta (`altoBanner` ~0.55–0.6).
2. Si el ZIP solo trae el logo en baja resolución, se reescala con el mismo método de la memoria "Subir resolución de ilustraciones"
   (Upscayl/Real-ESRGAN) y se documenta.
