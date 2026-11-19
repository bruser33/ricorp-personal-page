#!/usr/bin/env bash
# Mueve una issue en el board #2 "WS Style — Specs".
# Uso: board.sh <numero_issue> <Todo|Ready|In Progress|Done> [--solo-si-esta]
#   --solo-si-esta: no agrega la issue al board si todavía no está (solo la mueve).
# Necesita GH_PROJECT_TOKEN (secreto PROJECT_TOKEN: PAT clásico de bruser33 con scope `project`);
# el GITHUB_TOKEN de Actions no puede tocar proyectos de usuario. Sin token no hace nada.
set -euo pipefail

N="$1"; STATUS="$2"; SOLO_SI_ESTA="${3:-}"
if [ -z "${GH_PROJECT_TOKEN:-}" ]; then
  echo "board: sin PROJECT_TOKEN, no se toca el board"; exit 0
fi
export GH_TOKEN="$GH_PROJECT_TOKEN"

PROJECT=PVT_kwHOAP4BNs4BsQ4r
FIELD=PVTSSF_lAHOAP4BNs4BsQ4rzhqf0wg
OWNER="${GITHUB_REPOSITORY%/*}"; REPO="${GITHUB_REPOSITORY#*/}"

LINE=$(gh api graphql \
  -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){id projectItems(first:20){nodes{id project{id}}}}}}' \
  -f o="$OWNER" -f r="$REPO" -F n="$N" \
  --jq ".data.repository.issue | [.id, ([.projectItems.nodes[] | select(.project.id==\"$PROJECT\") | .id][0] // \"-\")] | @tsv")
ISSUE_ID=$(printf '%s' "$LINE" | cut -f1)
ITEM=$(printf '%s' "$LINE" | cut -f2)

if [ "$ITEM" = "-" ]; then
  if [ "$SOLO_SI_ESTA" = "--solo-si-esta" ]; then echo "board: #$N no está en el board"; exit 0; fi
  ITEM=$(gh api graphql \
    -f query='mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}' \
    -f p="$PROJECT" -f c="$ISSUE_ID" --jq .data.addProjectV2ItemById.item.id)
fi

OPTION=$(gh api graphql \
  -f query='query($f:ID!){node(id:$f){... on ProjectV2SingleSelectField{options{id name}}}}' \
  -f f="$FIELD" --jq ".data.node.options[] | select(.name==\"$STATUS\") | .id")
if [ -z "$OPTION" ]; then echo "board: no existe la columna '$STATUS'"; exit 1; fi

gh api graphql \
  -f query='mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}' \
  -f p="$PROJECT" -f i="$ITEM" -f f="$FIELD" -f o="$OPTION" >/dev/null
echo "board: #$N → $STATUS"
