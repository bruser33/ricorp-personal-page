#!/usr/bin/env bash
# gh-scope-guard.sh — PreToolUse (matcher Bash).
#
# REGLA DURA DE AISLAMIENTO: esta página personal NO puede generar NINGÚN registro
# en ordename. Bloquea de forma determinista cualquier comando `gh`/`git` que:
#   (a) mencione ordename en cualquier forma (OrdenameCL, ordenamepay, ordename.cl), o
#   (b) apunte con -R/--repo a un repo distinto de bruser33/ricorp-personal-page.
#
# También exige que la cuenta gh activa sea la personal (bruser33) para operaciones
# que escriben en GitHub (issue/pr/project/variable/api ... create|edit|comment|close).
#
# PreToolUse corre ANTES del permission-mode: bloquea incluso bajo bypassPermissions.
# Lectura pura (git status/diff/log, curl local) pasa sin molestar.
set -u
ALLOWED_REPO="bruser33/ricorp-personal-page"
ALLOWED_ACCOUNT="bruser33"

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

# (a) Cualquier mención de ordename → bloqueo total, sin escape.
if printf '%s' "$CMD" | grep -qiE 'ordenamecl|ordenamepay|ordename\.cl|[^a-z]ordename[^a-z]|^ordename'; then
  deny "[gh-scope-guard] Bloqueado: este proyecto (página personal) NO puede tocar ordename ni crear tickets ahí. Regla dura de aislamiento."
fi

# (b) gh con -R/--repo distinto del repo personal.
if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z])gh '; then
  REPOARG="$(printf '%s' "$CMD" | grep -oE '(-R|--repo)[= ]+[^ ]+' | head -1 | sed -E 's/^(-R|--repo)[= ]+//')"
  if [ -n "$REPOARG" ] && [ "$REPOARG" != "$ALLOWED_REPO" ]; then
    deny "[gh-scope-guard] gh apunta a '$REPOARG'. Solo se permite $ALLOWED_REPO. Bloqueado."
  fi

  # Operaciones de ESCRITURA en GitHub → exigir cuenta activa = bruser33.
  if printf '%s' "$CMD" | grep -qiE 'gh (issue|pr|project|variable|secret|api|label)[^|;&]*\b(create|edit|comment|close|delete|merge|set|--method (POST|PATCH|PUT|DELETE))'; then
    # La cuenta activa: gh api user usa la cuenta activa y devuelve su login.
    ACTIVE="$(gh api user -q .login 2>/dev/null)"
    if [ -n "$ACTIVE" ] && [ "$ACTIVE" != "$ALLOWED_ACCOUNT" ]; then
      deny "[gh-scope-guard] La cuenta gh activa es '$ACTIVE', no la personal '$ALLOWED_ACCOUNT'. Antes de escribir en GitHub: gh auth switch -u $ALLOWED_ACCOUNT (o gh auth login)."
    fi
  fi
fi

exit 0
