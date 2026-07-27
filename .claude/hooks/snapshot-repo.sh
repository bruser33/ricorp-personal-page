#!/bin/bash
# snapshot-repo.sh — UserPromptSubmit. Snapshot del working tree vía `git stash create`
# (no aplica stash; solo crea el commit-snapshot y apendea el hash al stack para /revert).
# Línea: "<epoch_ms> <dir> <hash>". Silencioso siempre.
{
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  TS=$(date +%s%3N)
  STACK="$ROOT/.claude/revert-stack.txt"
  H=$(git -C "$ROOT" stash create 2>/dev/null)
  [ -n "$H" ] && echo "$TS $ROOT $H" >> "$STACK"
} >/dev/null 2>&1
exit 0
