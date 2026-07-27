---
description: Ejecuta MI workflow completo de punta a punta sobre un requerimiento de la página personal RICORP — documentar → orquestar (loop + agentes + verificación adversarial + Playwright) → revisar → dejar listo para PR. Uso. /owork <descripción | #issue | path PROMPT_NIVEL_10> [--prod]
---

# /owork — mi workflow orquestador autónomo, en un comando (RICORP)

Punto de entrada único para la **página personal** (`bruser33/ricorp-personal-page`).
Envuelve mis skills, agentes y hooks en el flujo completo, combinando el **patrón
orquestador** con **/loop** (iterar hasta verde) y pidiendo el mínimo de confirmaciones.
Local primero; prod (Pages/Render) solo con mi indicación.

`$ARGUMENTS`: una descripción, un `#issue`, o un path a un `PROMPT_NIVEL_10_*.md`.
Flag opcional `--prod` = autorizo el cierre hacia producción al final (equivale a `.prod-ok`).

## AISLAMIENTO (regla dura, mecanizada)
- Cuenta GitHub **`bruser33`** para todo (`gh`, commits, PR). **NUNCA** ordename.
- `gh-scope-guard.sh` bloquea cualquier `gh`/repo que mencione ordename o apunte a otro repo.
- Cero tickets sobre esta página en ordename. Los issues/PR viven en `bruser33/ricorp-personal-page`.

## Pipeline (todo encadenado, iterando hasta verde)

### 0. Setup
- Verificar cuenta: `gh auth status` → la activa debe ser **bruser33**. Si no,
  `gh auth switch -u bruser33` (o pedirme `! gh auth login`). Fijar identidad de commits
  del repo: `git -C <repo> config user.name bruser33` y `user.email bruser33@users.noreply.github.com`.
- Confirmar back :4000 + front :5173 arriba (si faltan, `/start`).
- Si el requerimiento NO viene como doc, generarlo con **`/nivel10`**.

### 1. Activar el modo combinado (orquestador + /loop)
- `echo "<comando de verificación>" > .claude/queue/.verify-gate` → el Stop hook **no deja
  terminar hasta que pase**. Default del comando: `cd client && npx tsc -b --noEmit`.
- El orquestador hace una pasada; el Stop hook + (si conviene) `/loop` la repiten hasta verde.

### 2. Resolver (delegando a los agentes)
Correr **`/resolver`** con el doc. Internamente:
1. agente `Explore` → causa raíz `archivo:línea` (client/src o server/src).
2. agente **`planner`** → plan mínimo + set de pruebas + riesgo de regresión.
3. agente **`implementer`** → tests RED → fix GREEN → refactor.
4. **panel `verifier` ×3** (correctness / regresión / test-quality) → ≥2 de 3 (verificación adversarial).
5. agente **`playwright-verifier`** → cierra el loop en el navegador local (`http://127.0.0.1:5173`) leyendo el DOM.
> Effort-scaling: cambio de 1 componente → inline + 1 verifier; feature media → pipeline completo.

### 3. Revisar
- **`/code-review`** sobre el diff. Si hay findings, volver al paso 2.

### 4. Cerrar
- `rm .claude/queue/.verify-gate`.
- Resumen: archivos, verificación, AC cumplidos, evidencia Playwright.
- **NO** mergear/deployar sin mi OK. Si pasé `--prod` (o creo `.prod-ok`): commit → `/push`
  → PR con `Closes #N` **en `bruser33/ricorp-personal-page`**. El push a `main` dispara Pages.
- Si no, lo dejo listo y reporto.

## Reglas duras (heredadas, mecanizadas por hooks)
- Todos los agentes en **model: opus**.
- Local primero; deploy (Pages/Render) bloqueado por `safety-guard` salvo `.prod-ok` que creo YO.
- Verificar en el navegador, no solo asumir. TypeScript estricto (hook `tsc-check-on-edit`).
- Al cerrar, guardar 1 **slot de auto-memoria** con la lección no-obvia del requerimiento.
- Español, una línea de log por fase.
