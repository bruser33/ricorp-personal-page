#!/usr/bin/env bash
# S3 de pruebas con SeaweedFS (software libre, Apache-2.0) en Docker, para CI y el runner de Claude.
# Los comprobantes de la seña se suben, leen y borran de verdad contra un S3 que SÍ revisa la firma
# (no es un mock). Credenciales solo de CI: no son secretos reales.
# Uso: bash .github/ci/s3-local.sh   → deja S3 en http://localhost:8333 con el bucket $S3_TEST_BUCKET creado.
set -euo pipefail
IMAGE="chrislusf/seaweedfs:4.51"
KEY="${S3_TEST_ACCESS_KEY_ID:-ci-access-key}"
SECRET="${S3_TEST_SECRET_ACCESS_KEY:-ci-secret-key-no-es-real}"
BUCKET="${S3_TEST_BUCKET:-wstyle-receipts-test}"
CONF="$(mktemp -d)/s3.json"
cat > "$CONF" <<JSON
{"identities":[{"name":"ci","credentials":[{"accessKey":"$KEY","secretKey":"$SECRET"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
docker run -d --name s3 -p 8333:8333 -v "$CONF:/etc/seaweedfs/s3.json:ro" "$IMAGE" \
  server -s3 -s3.config=/etc/seaweedfs/s3.json -dir=/data >/dev/null
# Listo = el bucket privado se pudo crear con un PUT firmado (SigV4). 200 = creado, 409 = ya existía.
# Se reintenta: el puerto puede abrir antes de que el gateway S3 esté conectado al filer.
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
    --aws-sigv4 "aws:amz:us-east-1:s3" --user "$KEY:$SECRET" "http://localhost:8333/$BUCKET" || true)
  if [ "$code" = "200" ] || [ "$code" = "409" ]; then
    echo "SeaweedFS S3 listo en :8333 · bucket $BUCKET (HTTP $code)"; exit 0
  fi
  sleep 2
done
echo "SeaweedFS no creó el bucket $BUCKET (último HTTP $code)" >&2
docker logs s3 2>&1 | tail -50 >&2
exit 1
