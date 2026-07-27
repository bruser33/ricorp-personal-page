#!/usr/bin/env bash
# safety-guard.sh — PreToolUse (matcher Bash).
#
# "Local primero; prod SOLO con tu indicación." Bloquea deploy/prod hasta que VOS
# creés el marker .claude/queue/.prod-ok. Lectura y trabajo local pasan sin preguntar.
#
# Bloquea: gh pr merge, gh workflow run (dispara Pages), gh variable/secret set
# (config de deploy), git push a main (dispara el workflow de Pages), render deploy,
# npm run deploy. Escape (lo decidís VOS): touch .claude/queue/.prod-ok  (y rm al terminar).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT="$(cat)"

CMD="$(printf '%s' "$INPUT" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get("tool_input",{}).get("command","") if d.get("tool_name")=="Bash" else "")
except Exception:
    print("")' 2>/dev/null)"

[ -z "$CMD" ] && exit 0

deny() {
  python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":sys.argv[1]}}))' "$1"
  exit 0
}

if [ ! -f "$ROOT/.claude/queue/.prod-ok" ]; then
  if printf '%s' "$CMD" | grep -qiE 'gh pr merge|gh workflow run|gh (variable|secret) set|npm run deploy|render +deploy|git push[^|;&]*\bmain\b|git push[^|;&]*\bgh-pages\b'; then
    deny "[safety-guard] Acción de PRODUCCIÓN/deploy bloqueada (Pages/Render/push a main). Regla: local primero; prod SOLO con tu indicación. Para habilitar en esta sesión: touch $ROOT/.claude/queue/.prod-ok (y rm al terminar)."
  fi
fi

exit 0
