# SPEC-20 — W Style en el slider de Proyectos y en la trayectoria

> Pedido del usuario (2026-10-12), punto 8: "rellena un espacio del slider y el último de las noticias con la página que hice, W Style; pon información detallada. El reel lo subiré después cuando entre en Instagram".

## Historia
Como visitante, quiero ver W Style como proyecto real en el slider y en la trayectoria, con detalle de qué se hizo y un enlace a verla.

## Alcance
- **Incluye:** un hito nuevo en `client/src/data/trayectoria.ts` con `destacado: true` (así aparece en el slider Y en la trayectoria) que **reemplaza un placeholder** ("Project 2"); imagen de card a partir de un frame de la secuencia de Blender (`client/public/wstyle/seq/desktop-hd/NNNN.webp` → exportar a `figma-frames/wstyle-*.webp` en proporción de card); 2 mockups (escritorio y móvil); descripción detallada; enlace a `/wstyle/`; campo opcional para el reel de Instagram que **no se renderiza** mientras esté vacío.
- **Fuera:** subir el reel (lo hace el usuario después); cambios a la página W Style.

## Contenido (borrador, en español; editable en trayectoria.ts)
- **Título:** W Style · **Etiqueta:** Web design + 3D · **Fecha:** 2026-10
- **Descripción (detalle del modal):** Landing inmersiva para la barbería W Style, en Santiago. El recorrido es una secuencia renderizada en Blender que avanza con el scroll, con dirección de arte "Noir de oficio". Incluye carta de servicios con precios en CLP (corte, corte + barba, perfilado, lavado + masaje, limpieza facial), membresía Club W, reserva por WhatsApp, horario y ubicación. Hecha en React + TypeScript + Vite, con HTML prerenderizado para SEO, variantes HD para escritorio y móvil, y respaldo en three.js. Publicada en ricorp.cl/wstyle.
- **Enlace:** `/wstyle/` (misma pestaña o nueva: nueva pestaña).

## Reglas de negocio
1. El modal de Proyectos (y el de la trayectoria, SPEC-18) muestra un botón/enlace "Ver sitio" cuando el hito tiene `enlace`.
2. Nuevo campo opcional `reel?: string` (URL de Instagram) documentado en el comentario de cabecera de `trayectoria.ts`; vacío → no se muestra nada.
3. Peso de la imagen de card ≤ 300 KB (webp).

## Criterios de aceptación
- **AC-01** El slider muestra una card "W Style" (con imagen) y ya no muestra "Project 2".
- **AC-02** Abrir la card muestra la descripción detallada y el enlace a `/wstyle/` (funciona en dev: responde 200).
- **AC-03** La trayectoria contiene el hito W Style (fecha 2026-10).
- **AC-04** Sin `reel`, el DOM no contiene elementos de Instagram; con un `reel` de prueba, aparece el enlace.
- **AC-05** `npm run build` y `npm run lint` verdes; imagen ≤ 300 KB.

## Decisiones confirmadas
- ✔ Un solo hito `destacado` cubre "un espacio del slider" y "una noticia".

## Asunciones pendientes de validar
- Reemplaza "Project 2" (placeholder). Como la trayectoria ordena por fecha, W Style (2026-10) sale como el hito **más nuevo** (portada), no al final.
- Coordinar con SPEC-18: si el modal compartido ya existe, usarlo; si no, el enlace se agrega al modal de Proyectos.
