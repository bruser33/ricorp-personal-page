---
description: Revierte el working tree del repo RICORP al snapshot justo antes del ÚLTIMO prompt (un paso atrás). No toca commits.
allowed-tools: Bash
---

# /revert — un paso atrás en la conversación (RICORP)

El hook `snapshot-repo.sh` (UserPromptSubmit) guarda un snapshot (`git stash create`) antes de
cada prompt. `/revert` restaura el último y lo saca de la pila. Repetible.

**NO** toca commits — solo tracked files del working tree.

```bash
STACK=/home/pedrorico/Documentos/pedrorico/ricorp-personal-page/.claude/revert-stack.txt
[ ! -s "$STACK" ] && echo 'Nada que revertir' && exit 0
LAST_TS=$(tail -1 "$STACK" | awk '{print $1}')
grep "^$LAST_TS " "$STACK" | while read TS DIR HASH; do
  echo "== revert $DIR → $HASH (ts=$TS) =="
  git -C "$DIR" checkout "$HASH" -- . 2>&1 || true
  git -C "$DIR" status --short
done
grep -v "^$LAST_TS " "$STACK" > "$STACK.tmp" && mv "$STACK.tmp" "$STACK" || : > "$STACK"
echo 'Revert listo.'
```

**Importante**: NO uses `git reset --hard`. Reportá qué se revirtió y `git status --short` final.
