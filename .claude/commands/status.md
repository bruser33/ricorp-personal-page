---
description: Muestra git status, rama y cuenta gh activa del repo de la página personal RICORP.
allowed-tools: Bash
---

# /status — estado git + cuenta (RICORP)

Ejecutá UN solo Bash:
```
REPO=/home/pedrorico/Documentos/pedrorico/ricorp-personal-page
echo '=== RICORP (bruser33/ricorp-personal-page) ==='
git -C "$REPO" branch --show-current
git -C "$REPO" status --short --branch
echo; echo '=== cuenta gh activa (debe ser bruser33) ==='
gh auth status 2>&1 | grep -E 'Active account|Logged in'
```
Presentalo tal cual. Si no hay cambios, aclaralo con "(limpio)". Si la cuenta activa NO es
`bruser33`, avisá: para operar GitHub, `gh auth switch -u bruser33`.
