# SPEC-41 — Los escritos de la Trayectoria con el largo de los posts nuevos

> Pedido del usuario (2026-10-27), ítem 4: "los escritos que tenemos publicados tienes que ponerlos del mismo largo que los que
> estamos haciendo basados en mi forma de escribir".

## Historia
Como dueño de ricorp.cl, quiero que cada hito real de mi Trayectoria tenga un texto del mismo largo y con la misma voz que los
posts de W Style, Haru e Invasión UFPS, para que la página se lea pareja y cuente mi historia completa.

## Estado actual
- Posts "largos" (referencia de voz y largo): `wstyle-2026`, `haru`, `tesis-invasion-ufps` en `client/src/data/trayectoria.ts`,
  con `parrafos` de **5 párrafos** (~90–130 palabras cada uno, ~500–600 palabras en total).
- Escritos cortos (un solo `descripcion` de ~80–120 palabras): `workana-freelancer`, `youtube-proyectos-informaticos`,
  `tuapp-2014-smartcorp`, `tuapp-2013-r2d2`.
- La voz de Pedro en esos posts: primera persona del plural al contar el trabajo ("nos propusimos", "construimos"), cálida y concreta,
  datos reales (fechas, lugares, tecnologías, nombres de piezas), sin jerga vacía, y **cierre con una frase entre ¡…!**.

## Alcance
- **Incluye:** agregar `parrafos` (5 párrafos, mismo rango de largo) a los 4 hitos reales cortos, conservando `descripcion`
  (resumen para la tarjeta/fallback). Fuentes de los datos: los comentarios del propio archivo, la `descripcion` actual, y si hace
  falta los correos originales (Gmail de Pedro: TuApp.org 2013–2014) y el perfil público de Workana / la playlist de YouTube.
- **Fuera:** los hitos de relleno (`relleno-*`, "Análisis: …", "Project N"): son placeholder y no se les inventa historia.
  Los 3 posts largos existentes no se tocan.

## Reglas de negocio
1. **No inventar hechos.** Cada dato (fecha, lugar, cifra, nombre, tecnología) sale de una fuente; si no hay fuente, el párrafo se
   escribe sin ese dato. Las fuentes usadas se anotan en el comentario sobre cada hito.
2. Workana: sin nombres de clientes, sin capturas ni logos (TyC); las citas de reseñas solo si ya están en el texto actual.
3. Párrafo 1 = de qué se trata y por qué; 2–4 = cómo fue / qué se hizo / qué se aprendió; 5 = resultado + cierre ¡…!.
4. Español de Chile neutro como los posts existentes ("haces", "te invitamos"), sin voseo.

## Criterios de aceptación
- **AC1** Los 4 hitos tienen `parrafos.length === 5` y entre 400 y 700 palabras en total (test unitario en `client/src`).
- **AC2** Cada párrafo termina en punto o en "!", y el último contiene una exclamación ¡…!.
- **AC3** Ningún nombre de cliente de Workana aparece en el texto.
- **AC4** Abriendo cada hito desde Trayectoria se leen los 5 párrafos (depende de SPEC-39, que hace que Trayectoria use `PostCuerpo`).
- **AC5** `npm test` y `npm run build` en verde.

## Asunciones
1. "Los escritos que tenemos publicados" = los textos de los hitos reales de la Trayectoria que hoy son cortos.
2. "Mismo largo" = 5 párrafos como W Style / Haru / Invasión UFPS.
3. Si un hito no da para 5 párrafos sin inventar, se deja en el máximo honesto (≥ 4) y se reporta.
