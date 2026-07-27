#!/usr/bin/env bash
# tsc-check-on-edit.sh — PostToolUse (Edit|Write|MultiEdit).
# Si Claude edita un .ts/.tsx del client, corre `tsc -b --noEmit` como early signal.
# NO bloquea (exit 0 siempre); solo imprime warnings al transcript vía stderr.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT=$(cat 2>/dev/null || echo '{}')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$FILE_PATH" in
  "$ROOT"/client/*.ts|"$ROOT"/client/*.tsx|"$ROOT"/client/src/*) ;;
  *) exit 0 ;;
esac

cd "$ROOT/client" 2>/dev/null || exit 0
OUT=$(timeout 30 npx -y tsc -b --noEmit 2>&1)
RC=$?
if [ "$RC" -ne 0 ]; then
  { echo "[tsc-check] tsc reportó errores tras editar $FILE_PATH:"; printf '%s\n' "$OUT" | tail -20; } >&2
fi
exit 0
