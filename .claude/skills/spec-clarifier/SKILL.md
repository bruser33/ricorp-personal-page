---
name: spec-clarifier
description: Convierte una historia de usuario en una spec completa rellenando los espacios en blanco, lista numerada las asunciones funcionales/no técnicas, y luego refina una a una las que el usuario rechace con preguntas de 4 alternativas + "Otra" y barra de progreso. Úsala cuando el usuario diga "vamos a definir una spec", pase una historia de usuario para especificar, o invoque /spec-clarifier. Termina avisando que está listo para crear la especificación (no la escribe todavía).
---

# spec-clarifier — de historia de usuario a spec sin asunciones ocultas

Objetivo: que ninguna decisión funcional quede inventada en silencio. Claude rellena los huecos, pero **todo lo que asumió queda visible y numerado** para que el usuario lo valide o lo corrija.

Idioma: todo en **español**.

## Fase 1 — Recibir la historia de usuario

- Si el usuario pasó la historia como argumento (`$ARGUMENTS`) o en el mensaje, úsala.
- Si no, pídela en una sola línea y espera.

## Fase 2 — Rellenar los espacios en blanco

1. Si la historia toca un proyecto existente, revisa rápido el código relacionado (Grep/Read, o un subagente `Explore` si es amplio) para que lo que completes se apoye en cómo funciona el sistema hoy y no sea genérico.
2. Arma un **borrador de la spec** breve con estas secciones:
   - **Historia**: Como <rol> quiero <acción> para <beneficio>.
   - **Alcance**: qué incluye y qué queda fuera.
   - **Reglas de negocio**.
   - **Flujo principal** y **casos borde**.
   - **Criterios de aceptación** (verificables, formato AC-01, AC-02…).
3. Luego muestra el **listado numerado de asunciones** que hiciste. Incluye SOLO asunciones **funcionales o no técnicas**: reglas de negocio, roles y permisos, comportamiento visible, textos y mensajes, casos borde, alcance, datos que se muestran, qué pasa ante errores desde el punto de vista del usuario.
   - NO listes decisiones técnicas (nombres de tablas, endpoints, librerías, estructura de código).
   - Cada asunción en una línea, concreta y decidible. Ejemplo: `3. Solo el rol Supervisor puede aprobar; el Cobrador solo ve el estado.`

Formato:

```
## Asunciones (funcionales / no técnicas)
1. ...
2. ...
...

Dime los números de las asunciones que NO te gustan (ej: 2, 5, 7). Si todas están bien, dime "todas ok".
```

Espera la respuesta del usuario.

## Fase 3 — Refinar una a una

Si el usuario responde "todas ok" (o equivalente), salta a la Fase 4.

Si da números: N = cantidad de asunciones rechazadas. Pregunta **una por una, en el orden que dio el usuario**, nunca varias a la vez.

En cada pregunta:

1. Muestra la **barra de progreso** (10 bloques, proporcional a las preguntas ya respondidas):

   ```
   Pregunta 2 de 5  [████░░░░░░] 1 respondida · 4 restantes
   ```

   - Bloques llenos = round(10 × respondidas / N).
   - "restantes" incluye la pregunta actual.

2. Recuerda en una línea la asunción original: `Asunción #5 (original): ...`

3. Haz la pregunta con **4 alternativas nuevas** (distintas de la asunción original y entre sí, todas plausibles para el negocio) y una **quinta opción "Otra"**.
   - Usa la herramienta `AskUserQuestion` con exactamente 4 opciones. Pon la barra de progreso al inicio del texto de la pregunta. La herramienta agrega "Other" automáticamente como quinta opción, y esa opción es la "Otra".
   - Si `AskUserQuestion` no está disponible, muéstralo como texto y espera la respuesta:

     ```
     A) ...
     B) ...
     C) ...
     D) ...
     E) Otra — escribe tu definición
     ```

4. Si el usuario elige "Otra", toma su texto como la nueva definición. Si es ambiguo, haz **una** repregunta corta. Esa repregunta no cuenta en la barra.

5. Guarda la nueva definición y pasa a la siguiente.

Si una respuesta deja inválida otra asunción que el usuario NO había rechazado, avísalo en una línea y agrégala al final de la cola (N aumenta y la barra se recalcula).

## Fase 4 — Cierre

1. Muestra la barra completa: `[██████████] N de N respondidas`.
2. Muestra un resumen de **las definiciones finales**: asunciones aceptadas tal cual + las redefinidas (marcadas con ✎).
3. Termina con exactamente este mensaje:

   > ✅ Ya me encuentro listo para crear la especificación.

NO escribas la spec final ni archivos todavía. Espera la indicación del usuario. Cuando la dé, crea la spec con el borrador + las definiciones finales; si el usuario quiere usar OpenSpec, entrégaselo a `/opsx:propose` incluyendo todas las definiciones confirmadas.

## Reglas

- Nunca agrupes preguntas; siempre una por turno.
- Nunca cambies en silencio una asunción ya confirmada.
- Las 4 alternativas deben ser respuestas reales al problema, no relleno ("depende", "no sé").
- Sé breve: el valor está en las decisiones, no en la prosa.
