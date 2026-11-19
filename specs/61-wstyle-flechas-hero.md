# SPEC-61 — WS Style: flechas de navegación en el hero con estilo fuego

> Pedido de Joe (dueño de WS Style) vía issue #99 (2026-11-19). Requisito adicional confirmado por Joe
> (comentario de Pedro, 2026-11-19): tras aprobar la implementación, coordinar el despliegue a producción
> para que Joe lo pruebe en la web real, informando URL y estado en la issue.
> **Estado: borrador — esperando respuestas de Joe. No implementar hasta que diga "hazla".**

## Historia
Como dueño de WS Style, quiero flechas a ambos lados del hero (donde aparezco con el fuego detrás) para
que la gente pueda avanzar y retroceder entre lo que muestra la portada, sin perder el look del fuego.

## Estado actual
- Hero: `client/src/wstyle/App.tsx` → `<Section id="hero" className="panel--hero">` con titular, slogan
  y [Reservar]; detrás `HeroFire` (fuego WebGL + brasas + retrato del barbero, SPEC-49).
- **No existe carrusel en el hero**: es un solo panel. Hay que definir qué recorren las flechas (pregunta 1).
- Paleta de marca (SPEC-49): negro cálido `#0E0D0C`, latón `#B8875A`, cobre máx. `#C2622D`, hueso `#EDE6DA`.
- Producción: `https://ricorp.cl/wstyle/` (GitHub Pages, se publica solo al mergear a `main`).

## Alcance
- **Incluye:** dos flechas (izq./der.) simétricas en el hero, con brillo cobre sutil; navegación entre los
  elementos definidos en la pregunta 1; teclado (Tab + Enter/Espacio y ← →), `aria-label` en español,
  foco visible; versión móvil y escritorio; `prefers-reduced-motion` sin animación de brillo ni transición.
- **Fuera:** cambiar la imagen del barbero, el fuego, los textos o el resto de secciones.

## Reglas de negocio
1. Las flechas nunca tapan el rostro/cuerpo del barbero ni el titular, slogan o [Reservar].
2. Colores dentro de la paleta (nada de naranja puro).
3. Con reduced-motion: cambio instantáneo, sin pulso/brillo animado.
4. El fuego y la composición actual del hero se mantienen intactos.

## Criterios de aceptación (http://127.0.0.1:5173/wstyle/ a 1440×900 y 390×844)
- **AC-01** Se ven dos flechas, una a cada lado, a la misma altura y a igual distancia del borde.
- **AC-02** Clic en → avanza y en ← retrocede entre los elementos definidos (comportamiento en los extremos según pregunta 3).
- **AC-03** Los rects de las flechas no se cruzan con el del titular, el slogan ni [Reservar]; tampoco con la cara del barbero.
- **AC-04** Estilo cobre/latón con brillo en hover y anillo de foco visible al navegar con Tab.
- **AC-05** Se puede operar solo con teclado; cada flecha tiene `aria-label` ("Anterior"/"Siguiente") y el cambio se anuncia a lectores de pantalla.
- **AC-06** En móvil las flechas tienen área táctil ≥ 44×44 px y no tapan el contenido.
- **AC-07** Con `prefers-reduced-motion: reduce` no hay animaciones en flechas ni transiciones.
- **AC-08** Sin errores de consola; `tsc`, `vitest`, `lint`, tests del server y `npm run build` en verde.
- **AC-09** Producción: tras aprobación del flujo de revisión (panel verifier + Playwright + /code-review) y
  **merge hecho por Pedro**, el deploy de Pages queda verde y se comenta en la issue la URL
  `https://ricorp.cl/wstyle/` con el estado. La tarea no se cierra hasta que Joe confirme que lo vio en producción.
  (Claude no mergea ni despliega: abre el PR y avisa; Pedro aprueba y publica.)

## Asunciones (a confirmar)
1. Las flechas van centradas en altura del hero, pegadas a los bordes izquierdo y derecho.
2. En móvil se achican y bajan a la altura del barbero, a los costados, sin tapar la cara.
3. Al avanzar, el barbero y el fuego se quedan fijos; cambia solo lo que se navega (pregunta 1).
4. También se puede deslizar con el dedo en móvil.

## Preguntas abiertas
Ver comentario en la issue #99 (preguntas 1–4).
