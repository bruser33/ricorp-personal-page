---
description: Genera un PROMPT_NIVEL_10 nuevo para la página personal RICORP desde el template, llenando SOLO lo único del requerimiento. Uso. /nivel10 <descripción corta>
---

Sos el generador de requerimientos NIVEL 10 de la página personal RICORP. Cada doc captura
SOLO lo único del problema; el boilerplate (pipeline orquestador, reglas, harness) vive en
`.claude/` y `CLAUDE.md` y se referencia, no se reescribe.

## Pasos
1. Leé el template en `.claude/templates/nivel10.template.md`.
2. Desde `$ARGUMENTS` (preguntando lo mínimo indispensable si falta scope), llená SOLO las
   secciones 1-5 y 7 con contenido real y específico (client/server de este repo).
3. Sección 6 (Harness): dejala TAL CUAL del template (referencia).
4. **Root-cause grounded**: para la sección 2, explorá el código real (Grep/Read o subagente
   Explore) y cita `archivo:línea`. No inventes.
5. Escribí el archivo como `PROMPT_NIVEL_10_<SLUG>.md` en la raíz del repo.
6. Devolvé un resumen de 3 líneas + el path, y preguntá si lo resuelvo con `/resolver`.

## Reglas
- Conciso y específico: nada de relleno. Si una sección no aplica, "N/A — <por qué>".
- Convertí fechas relativas a absolutas (hoy = fecha del sistema).
- No copies reglas/convenciones en prosa; referencialas (ya están en el harness).
