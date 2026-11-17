# SPEC-49 — W Style: el barbero en el hero con fuego persistente

> Pedido del dueño de W Style vía el usuario (2026-11-17): "que aparezca él, como en la página de ricorp.cl, con fuego atrás que se mantenga, combinado con el recorrido 3D, todo con armonía; nivel sitio de 10 mil dólares". Concepto aprobado por el usuario: `~/Desktop/wstyle-hero/retrato-fuego-v1.png`.

## Historia
Como dueño de W Style, quiero aparecer en el hero de mi web con fuego detrás, para que la gente me conozca y me relacione con la marca. Como visitante, quiero que eso se sienta parte de la misma película del local (recorrido 3D) y no un pegote.

## Estado actual
- Hero: `client/src/wstyle/App.tsx` `<Section id="hero" className="panel--hero">` con titular, lead, concepto, precio y [Reservar]; detrás, la película (`canvas#seq`, `SequencePlayer`, 150 frames) + `FilmFx` (viñeta, grano, letterbox) + `.shade` (degradado izquierdo para el texto).
- Dirección de arte "Noir de oficio" (`~/Projects/barberia-3d/docs/direccion-de-arte.md`): negro cálido `--ink #0E0D0C`, un solo acento `--brass #B8875A`, nada de naranja saturado; Anton + Cormorant Italic + Inter.
- Material nuevo: retrato del dueño recortado con alfa (`client/public/wstyle/hero/barbero.webp` 1100 px, `barbero-sm.webp` 640 px), generado con ChatGPT a partir de su foto (permiso del cliente) y recortado con IS-Net. Tiene luz de contorno cobre.

## Alcance
- **Incluye:**
  1. Capa `HeroFire` (nuevo componente) fija detrás del retrato: fuego procedural en WebGL (shader de llamas con ruido fbm/domain warping) recoloreado a ámbar → cobre → latón, sobre negro, mezclado con `screen`; sin video ni dependencias nuevas.
  2. Capa de **brasas** (canvas 2D, partículas que suben, parpadean y se apagan) que **persiste durante todo el recorrido** con densidad variable: plena en el hero, mínima en las secciones de película, sube de nuevo en "Tu trono".
  3. **Retrato** del dueño a la derecha en desktop (texto a la izquierda, como hoy) y al pie centrado en móvil, con base fundida a negro, grano y viñeta compartidos con la película.
  4. **Transición al recorrido**: en el primer ~15 % del scroll el retrato baja de escala/opacidad y se funde, el fuego se apaga dejando las brasas y entra la película.
  5. Fallbacks: `prefers-reduced-motion` → imagen fija del fuego (primer frame del shader pintado una vez) y sin brasas animadas; sin WebGL → degradado radial cobre estático; móvil → shader a media resolución y ≤ 60 brasas.
- **Fuera:** cambiar textos, secciones, la secuencia 3D o el diseño de los paneles; video de fuego de Blender (queda como mejora posible si el shader no convence).

## Reglas de negocio
1. El retrato nunca tapa el titular ni el CTA [Reservar] (desktop: el retrato ocupa la mitad derecha; móvil: queda bajo el CTA o detrás con opacidad que mantenga contraste ≥ 4.5:1 del texto).
2. El fuego usa la paleta de la marca: el tono más saturado no supera el naranja cobre `#C2622D` y los brillos van a hueso `#EDE6DA`; prohibido naranja puro `#FF7A00`-like.
3. El fuego "se mantiene": siempre hay brasas visibles en algún punto del recorrido (densidad mínima > 0) salvo con reduced-motion.
4. Rendimiento: el shader corre a ≤ 0.5× resolución del viewport y pausa cuando el hero sale de vista; el recorrido 3D no empeora (M1 desfase de SPEC-30 sin regresión > 5 %).
5. Peso agregado ≤ 300 KB (retrato + código).

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** En scroll 0 se ven el retrato del dueño y el fuego animado detrás (dos capturas separadas por 500 ms difieren en la zona del fuego).
- **AC-02** El titular, el lead y [Reservar] no se superponen con el rect del retrato en desktop; en móvil su contraste es ≥ 4.5:1.
- **AC-03** Al hacer scroll hasta "El local", la opacidad del retrato es 0 y la del fuego ≤ 0.1; las brasas siguen visibles (canvas con píxeles no negros).
- **AC-04** En "Tu trono" la densidad de brasas es mayor que en "El oficio".
- **AC-05** Con `prefers-reduced-motion: reduce` no hay requestAnimationFrame del fuego ni de las brasas; se ve una imagen fija.
- **AC-06** Sin errores de consola; `npm run build`, `npm run lint` y `vitest` en verde; los tests de W Style existentes pasan.
- **AC-07** Desplegado en ricorp.cl/wstyle/ (merge + Pages verde). (El video recorrido se canceló por pedido del usuario, 2026-11-17.)
