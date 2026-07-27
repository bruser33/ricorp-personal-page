# PROMPT NIVEL 10 — {{TITULO}}

> **Origen:** {{ORIGEN}} ({{FECHA}}, {{AUTOR}}).
> **Owner:** bruser33 (orquestador autónomo — página personal RICORP).
> **Área:** {{AREA: client / server / infra}} · **Scope:** {{SCOPE}}
> **Branch:** {{BRANCH}}
> **Issue / PR:** {{ISSUE — bruser33/ricorp-personal-page}}
> **Validación:** {{LOCAL_O_PROD}}

---

## 1. Objetivo de aceptación duro
{{Qué ve el usuario al terminar — verificable, medible, sin ambigüedad.}}

## 2. Diagnóstico / estado verificado del código
{{Tabla archivo:línea → qué hace hoy (client/src/** o server/src/**). Root-cause grounded, no hipótesis.}}

## 3. Diseño del fix
{{Cambios concretos y mínimos.}}

## 4. Criterios de aceptación (duros)
- [ ] AC-01:
- [ ] AC-02:
- [ ] AC-03: Cero regresión en {{otros componentes/endpoints}}.

## 5. Tests / verificación
- Client: {{tsc -b, build, o *.test.tsx si aplica}}
- Server: {{prueba de endpoint contra Mongo local}}
- E2E Playwright (si UI): {{pantalla en :5173 + AC visual}}

## 6. Harness (heredado — NO repetir en prosa)
- Pipeline: subagentes `planner` → `implementer` → `verifier` (panel multi-voto) → `playwright-verifier`.
- Guards activos: `safety-guard` (prod/deploy), `gh-scope-guard` (aislamiento ordename),
  `tsc-check-on-edit`, `stop-verifier` si `.verify-gate` activo.
- Reglas: local primero, cuenta bruser33, no mocks BD real, verificar en el navegador.

## 7. Bloqueos / decisiones pendientes
- {{... o "ninguno"}}
