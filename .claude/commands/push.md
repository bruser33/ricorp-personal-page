---
description: Pushea la rama actual del repo RICORP a bruser33 (sin force, sin commitear automáticamente). Push a main dispara deploy a Pages y está gateado por safety-guard.
allowed-tools: Bash
---

# /push — push a la rama remota (RICORP)

Repo único: `/home/pedrorico/Documentos/pedrorico/ricorp-personal-page`. Comportamiento seguro:

1. Verificá cuenta activa: `gh auth status` → debe ser **bruser33** (si no, `gh auth switch -u bruser33`).
2. Leé rama actual (`git branch --show-current`).
   - Si es `main`: el push dispara deploy a GitHub Pages y está **bloqueado por `safety-guard`**
     salvo `.claude/queue/.prod-ok`. Pedí confirmación explícita antes.
3. Si hay cambios sin commitear (`git status --porcelain` no vacío), mostralos y **NO** pushees;
   dejá al usuario decidir commit/stash (no commitees automáticamente).
4. Sin upstream → `git push -u origin <rama>`. Con upstream → `git push`.
5. **Nunca** `--force`, `--force-with-lease`, `--no-verify`.
6. Reportá: rama, resultado, y URL del remote si fue exitoso.

Recolección previa:
```
REPO=/home/pedrorico/Documentos/pedrorico/ricorp-personal-page
git -C "$REPO" branch --show-current
git -C "$REPO" status --porcelain
git -C "$REPO" log @{u}..HEAD --oneline 2>/dev/null || echo '(sin upstream)'
```
