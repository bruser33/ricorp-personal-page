# SPEC-45 — Workana con su ficha y DevSkiller; Haru con slider de imágenes

> Pedido del usuario (2026-10-27), ítem 2.

## Alcance
1. **Workana** (`workana-freelancer`): nuevo banner (`imagen`) y mockups a partir de **la ficha de Workana** (datos del hito: 11 años,
   10 proyectos completados, 13 calificaciones, certificaciones de la plataforma) y de las **certificaciones DevSkiller: React.js 89%
   y Angular 9 85%** (fuente: CV 2026 extendido, `~/Downloads/CV Pedro Rico 2026 - Extendido.pdf`; los tests llegaron por invitación de
   Workana, correos de no-reply@devskiller.com). Diseño propio tipo "ficha/credencial" — los banners actuales de SPEC-42 se reemplazan,
   no se reutilizan. Sin capturas del sitio de Workana ni datos de clientes.
   Además: 1 párrafo de `parrafos` puede mencionar DevSkiller (dato del CV), manteniendo 5 párrafos y el test de SPEC-41.
2. **Haru** (`haru`): campo `galeria` (ya existe: `{ src, pie }[]`, se dibuja con `GaleriaPost` en `Post.tsx`) con **8–12 pantallas**
   de la app recortadas de `~/Downloads/haru-x/HARU` ("44 vistas" y afines), cada una con un pie corto y real (qué muestra).
   Exportadas a `client/public/figma-frames/haru/NN-<slug>.webp` (≤ 250 KB c/u).

## Reglas
- Ninguna imagen repetida entre publicaciones (incluye `haru-brand`, `haru-home`, que ya son mockups de Haru: no repetirlas en la galería).
- No usar Playwright MCP; generar con script propio (headless/PIL). Liviano: la máquina tiene 8 GB y se congela.

## AC
- **AC1** Workana: banner y 2 mockups nuevos (nombres distintos a los de SPEC-42) que muestran los datos de la ficha y los dos puntajes DevSkiller.
- **AC2** Haru: el post muestra un slider con ≥ 8 imágenes y pie en cada una; flechas y swipe funcionan.
- **AC3** Tests (assets, unicidad) y build en verde.
