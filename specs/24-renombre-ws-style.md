# SPEC-24 — La marca se llama "WS Style" (no "W Style")

> Decisión confirmada del usuario (2026-10-25): el nombre de la barbería es **WS Style**. La URL `ricorp.cl/wstyle/` no cambia.

## Historia
Como dueño de la barbería, quiero que el sitio y la tarjeta del portafolio digan "WS Style" en todos lados, para que la marca sea una sola y coincida con el nombre real del negocio.

## Estado actual
- El nombre visible sale de `client/public/wstyle/content/site.json` → `name: "W Style"` (Nav `nav__logo`, Loader `loader__brand`, Footer `© W Style`, `<title>`/`description`/`og:title` vía `headTexts()` en `client/src/wstyle/content.ts`, JSON-LD `BarberShop.name` vía `jsonLd()`), y `headlines.hero: "W STYLE."`.
- `membership.name: "Club W"` (se ve en la sección Membresía).
- `client/wstyle/index.html` usa marcadores (`<!--wstyle-title-->` …) que llena `client/scripts/prerender-wstyle.mjs` desde el mismo JSON: no hay nombre en duro.
- Página personal: `client/src/data/trayectoria.ts` (hito `wstyle-2026`, SPEC-20): `titulo: 'W Style'`, descripción y cuerpo con "W Style" (x3) y "Club W" (x2).
- Comentarios de código con "W Style": `client/src/wstyle/App.tsx`, `lib.ts`, `wstyle.css`, `scene/scene.ts`, `components/Loader.tsx` ("wordmark W STYLE"), `client/vite.config.ts`, `client/src/components/Projects.css`.
- Rasters con la marca horneada: `client/public/figma-frames/wstyle-card.webp`, `wstyle-mockup-desktop.webp`, `wstyle-mockup-mobile.webp` (capturas del sitio con "W STYLE" en el header/hero).

## Alcance
- **Incluye:**
  - `site.json`: `name: "WS Style"`, `headlines.hero: "WS STYLE."`, `membership.name: "Club WS"`.
  - Verificar que `<title>`, `meta description`, `og:title` y JSON-LD (`name`) salen con "WS Style" tanto en el HTML prerenderizado (`npm run build` → `dist/wstyle/index.html`) como tras hidratar.
  - Nav (wordmark), Loader, Footer y cualquier `alt`/`aria-label` que nombre la marca.
  - `trayectoria.ts`: título, descripción y cuerpo del hito ("WS Style", "Club WS"); el `id: 'wstyle-2026'` y las rutas `/wstyle/` NO cambian.
  - Comentarios de código: reemplazar "W Style" → "WS Style" (barato y evita que el próximo grep confunda).
  - Regenerar los 3 rasters de la card/mockups desde el sitio ya renombrado (mismo tamaño, proporción y peso ≤ 300 KB que exige SPEC-20), para que la card del portafolio no muestre el nombre viejo.
- **Fuera:** cambiar la URL `/wstyle/`, nombres de archivos/carpetas/ids (`wstyle-*`, `#wstyle-data`), el render de Blender (`public/wstyle/seq/`), specs históricas (18, 20) y logos/tipografía nueva.

## Reglas de negocio
1. Forma canónica en texto corrido: **WS Style**. En titulares/wordmark en mayúsculas: **WS STYLE**. Membresía: **Club WS**.
2. La única fuente del nombre en la landing es `site.json` (`name`); no se agrega el nombre en duro en componentes.
3. La URL pública sigue siendo `https://ricorp.cl/wstyle/` (el `SITE_URL` del JSON-LD no cambia).

## Flujo principal
1. Visitante abre `/wstyle/` → loader "WS STYLE" → hero "WS STYLE." → header "WS STYLE" → … → footer "© WS Style".
2. Pestaña del navegador y vista previa al compartir: "WS Style — Cortes clásicos…".
3. En ricorp.cl, el slider de Proyectos y la trayectoria muestran la card "WS Style" y su modal habla de "WS Style" y "Club WS".

## Casos borde
- El wordmark en Anton a 390 px: "WS STYLE" es más ancho que "W STYLE"; no debe partirse en dos líneas en el header ni empujar el botón de menú.
- `h1` del hero "WS STYLE." a 390×844 no debe desbordar horizontalmente (`clamp(72px, 15vw, 230px)`).
- Grep falso positivo: "W Style" dentro de "WS Style" no cuenta; usar regex con límite (`\bW Style\b`, `\bW STYLE\b`, `\bClub W\b`).

## Criterios de aceptación (verificar en http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** `grep -rnE "\bW Style\b|\bW STYLE\b|\bClub W\b" client/src client/public/wstyle client/wstyle client/scripts client/vite.config.ts` → 0 resultados.
- **AC-02** En ambos tamaños, el header, el loader, el `h1` del hero y el footer muestran "WS STYLE"/"WS STYLE."/"© WS Style"; la sección Membresía muestra "Club WS".
- **AC-03** `document.title` empieza con "WS Style —"; `meta[property="og:title"]` = "WS Style"; el `<script type="application/ld+json">` tiene `"name":"WS Style"` y `url` = `https://ricorp.cl/wstyle/`.
- **AC-04** Tras `npm run build`, `dist/wstyle/index.html` (sin JS) contiene "WS Style" en `<title>`, `og:title` y JSON-LD, y no contiene "W Style".
- **AC-05** A 390×844 el wordmark del header ocupa una sola línea (altura del `.nav__logo` = una línea) y `document.documentElement.scrollWidth === 390`.
- **AC-06** En `http://127.0.0.1:5173/` el slider y la trayectoria muestran la card "WS Style"; su modal no contiene "W Style" ni "Club W"; el enlace sigue yendo a `/wstyle/` (200).
- **AC-07** Las imágenes `figma-frames/wstyle-card.webp` y mockups muestran "WS STYLE" (inspección visual) y cada una pesa ≤ 300 KB.
- **AC-08** `cd client && npx tsc -b --noEmit && npm run lint && npm run build` verdes.

## Decisiones confirmadas
- ✔ La marca es "WS Style"; la URL `/wstyle/` no cambia.

## Asunciones pendientes de validar
1. La membresía pasa a llamarse "Club WS" (no "WS Club" ni "Club WS Style").
2. "WS" se escribe junto, sin puntos ni espacio ("WS", no "W.S." ni "W S").
3. Se regeneran las 3 imágenes de la card/mockups del portafolio para que no muestren "W STYLE".
4. Si el render de Blender tuviera un letrero con "W", se deja como está (fuera de alcance).
