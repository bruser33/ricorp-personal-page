# SPEC-18 — Noticias / trayectoria como vista superpuesta desde el navbar

> Pedido del usuario (2026-10-12), puntos 5 y 7:
> 5) En noticias haré un timeline de mi trayectoria, pero al dar clic en una noticia no pasa nada; debería tener la misma animación que el slider.
> 7) Quitar las noticias del scroll y dejarlas como acceso por clic en el navbar superior.
> Referencia: video, tramo 56–64 s (portada + timeline) y 26–36 s (animación del modal del slider).

## Historia
Como visitante, quiero abrir la trayectoria desde "news" en el navbar y, al tocar un hito, verlo en detalle con la misma animación de los proyectos.

## Alcance
- **Incluye:** sacar `<News />` del scroll del home; vista superpuesta a pantalla completa que se abre desde el link `news`/`noticias` del navbar (escritorio y mobile); cerrar con X, Escape y botón atrás del navegador; clic en cualquier hito (portada o fila) abre un modal de detalle con la **misma animación** que el modal de Proyectos (crece desde el rect de la tarjeta); quitar el CTA "Ver todos" que apunta a sí mismo.
- **Fuera:** contenido real de la trayectoria (lo carga el usuario en `data/trayectoria.ts`); hito W Style (SPEC-20); API `/api/news` (se mantiene el fallback actual).

## Estado actual (código)
- `client/src/App.tsx:197-215`: `News` es la última sección (`#news`), con parada del blob y snap.
- `client/src/components/News.tsx`: portada sticky (`:118-140`), `<ol class="news-timeline">` (`:143-185`), CTA a `#news` (`:187-190`), `<Footline />` (`:196`). Sin handler de clic en los hitos.
- `client/src/components/Header.tsx:51-55` y mobile `:91-96`: `news` → `#news` (ancla).
- Modal animado de Proyectos: `Projects.tsx:662-756` (`openProject`, `:242`).

## Reglas de negocio
1. El home termina en Contacto; Noticias no es alcanzable haciendo scroll.
2. La vista se abre con una transición (fade/slide) y bloquea el scroll del fondo; tiene su propio scroll interno.
3. La URL refleja el estado con `#news` (deep link abre la vista; "atrás" la cierra).
4. El modal de detalle reutiliza el componente/animación de Proyectos (extraerlo a un componente compartido, no duplicarlo). Muestra imagen, fecha, título, descripción y enlace si existe.
5. Sin `<Footline>` dentro de la vista (las políticas viven al pie de contacto, SPEC-17).

## Casos borde
- Hito sin imagen: el modal abre desde la fila de texto, sin hero de imagen.
- Escape con el modal de detalle abierto cierra solo el modal; un segundo Escape cierra la vista.
- Foco atrapado dentro de la vista/modal y devuelto al link del navbar al cerrar (a11y).
- Mobile: el panel mobile del navbar se cierra al abrir la vista.

## Criterios de aceptación
- **AC-01** Haciendo scroll hasta el final del home no aparece ningún hito de la trayectoria.
- **AC-02** Clic en `news` del navbar (escritorio y mobile 390 px) → vista visible con la portada y la timeline; `location.hash === '#news'`.
- **AC-03** Cargar `/#news` directo abre la vista; `history.back()` la cierra.
- **AC-04** Clic en la portada y en una fila de la timeline → modal visible cuya animación parte del rect de esa tarjeta (primer frame con la escala/posición de la tarjeta, como en Proyectos).
- **AC-05** Escape cierra modal y luego vista; el scroll del body queda restaurado.
- **AC-06** El modal de Proyectos sigue funcionando igual (sin regresión).
- **AC-07** `npm run build` y `npm run lint` verdes.

## Decisiones confirmadas
- ✔ Vista superpuesta sin salir del home (no una ruta `/news`). (usuario, 2026-10-12)
- ✔ Misma animación que el modal del slider.

## Asunciones pendientes de validar
- El link del navbar mantiene la etiqueta actual ("news"/"noticias").
- Se quita el CTA "Ver todos".
