---
description: Resuelve UN requerimiento de la página personal RICORP con el patrón orquestador completo (Explore → Plan → Implement → panel Verifier multi-voto → Playwright), iterando hasta verde. Uso. /resolver <issue #N | path PROMPT_NIVEL_10 | descripción>
---

Sos el **orquestador de un requerimiento** de la página personal `bruser33/ricorp-personal-page`.
Resolvés UN requerimiento de punta a punta, iterando hasta cumplir los criterios de aceptación.
Delegás a subagentes especializados para mantener tu contexto limpio.

## Input
`$ARGUMENTS`: número de issue, path a un `PROMPT_NIVEL_10_*.md`, o descripción. Cargá el
enunciado completo primero (issue body con `gh issue view N` — repo por defecto, o el archivo).

## AISLAMIENTO
Cuenta **bruser33**, repo **bruser33/ricorp-personal-page**. Nunca ordename. Los issues se
leen/crean SOLO en este repo (sin `-R` o con `-R bruser33/ricorp-personal-page`).

## Pipeline (un ciclo, repetir hasta verde)

### 1. Explore + Diagnóstico
Mapeá la cadena de ejecución y la causa raíz grounded (`archivo:línea`) en `client/src/**` o
`server/src/**`. Para exploración amplia, delegá a un subagente `Explore`. Salida: bloque de diagnóstico.

### 2. Plan (subagente `planner`)
Pasá el diagnóstico + el enunciado. Recibís estrategia mínima, orden test-first y riesgo de
regresión. **No** código todavía.

### 3. Implement (subagente `implementer`, o inline si es chico)
Ejecutá el plan: tests RED → fix GREEN → refactor.
> **Effort-scaling:** cambio de 1 componente → inline; feature media → 1 implementer.

### 4. Panel Verifier (multi-voto, en paralelo)
Lanzá 3 subagentes `verifier` EN PARALELO (un mensaje, 3 tool calls), cada uno con una lente:
`correctness`, `regresion`, `test-quality`. Necesitás **≥2 de 3 APROBAR**. Si <2, recogé los
gaps concretos y volvé al paso 3.

### 5. Playwright (subagente `playwright-verifier`, si hay UI)
Confirmá los AC visuales/funcionales en `http://127.0.0.1:5173` leyendo el DOM. Si falla,
volvé al paso 3 con el delta esperado vs observado.

### 6. Cierre
Cuando panel ≥2/3 + Playwright PASA + verificación (tsc/build/tests) verde:
- Resumí qué cambió (archivos, verificación, AC cumplidos).
- **NO** commitees ni abras PR sin OK humano explícito (salvo que el usuario lo pidió en `$ARGUMENTS`).

## Loop autónomo (COMBINADO POR DEFECTO)
El patrón orquestador (QUÉ pasa en una pasada) y `/loop` (CUÁNDO se repite) se combinan:
1. Al arrancar: `echo "<comando>" > .claude/queue/.verify-gate` (activa el Stop hook que impide
   terminar hasta que pase). Default: `cd client && npx tsc -b --noEmit`.
2. Corré el pipeline (pasos 1-5). Iterá implementación↔verificación hasta verde.
3. Si una pasada no alcanza, programá la siguiente con `ScheduleWakeup` (o el usuario corre `/loop /resolver ...`).
4. Al cerrar: `rm .claude/queue/.verify-gate`.
> Solo desactivá el modo combinado si el usuario pide explícitamente "una sola pasada / sin loop".

## Restricciones DURAS (mecanizadas)
- **Local primero, prod solo con tu indicación.** `safety-guard.sh` bloquea deploy/push-a-main.
  Para habilitar prod, el USUARIO crea `.claude/queue/.prod-ok` (vos NO lo creás).
- No mocks contra la BD real en integration. Verificar en el navegador, no solo asumir.
- Una línea de log por paso/fase. Español.
