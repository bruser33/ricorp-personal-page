#!/usr/bin/env bash
# stop-verifier.sh — Stop hook.
#
# Loop autónomo "iterar hasta verde": si el marker .claude/queue/.verify-gate existe,
# bloquea el fin de turno mientras la verificación falle, devolviendo el output como
# feedback para que Claude siga corrigiendo. Claude Code hace override automático tras
# 8 bloqueos consecutivos.
#
# SEGURO POR DEFECTO: sin el marker no hace nada (sesiones normales no se molestan).
#   Activar:   touch .claude/queue/.verify-gate
#   Desactivar: rm   .claude/queue/.verify-gate
# El contenido del marker (opcional) define el comando; vacío usa el default.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT/.claude/queue/.verify-gate"

INPUT="$(cat)"
if printf '%s' "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

[ -f "$GATE" ] || exit 0

CMD="$(tr -d '\r' < "$GATE" | head -1)"
if [ -z "$CMD" ]; then
  # Default: el client tipa y compila. (Cuando haya tests, poné el comando en el marker.)
  CMD="cd $ROOT/client && npx tsc -b --noEmit"
fi

OUT="$(bash -lc "$CMD" 2>&1)"
RC=$?

if [ "$RC" -ne 0 ]; then
  {
    echo "[stop-verifier] Verificación FALLÓ (rc=$RC). No termines: corrige y reintenta."
    echo "Comando: $CMD"
    echo "----- últimas líneas -----"
    printf '%s\n' "$OUT" | tail -40
  } >&2
  exit 2
fi

echo "[stop-verifier] Verificación OK ($CMD)." >&2
exit 0
