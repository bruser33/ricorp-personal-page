# Almacenamiento de los comprobantes de la seña (WS Style)

Los comprobantes de transferencia (SPEC-56) **nunca** van a Mongo: van a un bucket **privado**
compatible con S3 (`server/src/lib/receipts.js`). El código no depende del proveedor:
**cambiar de proveedor = cambiar 5 variables en Render** (`ricorp-api` → Environment).

| Variable | Qué es |
|---|---|
| `RECEIPTS_STORAGE` | `s3` (en Render es obligatorio; `fs` se rechaza porque el disco se borra) |
| `S3_ENDPOINT` | URL del S3 del proveedor (tabla de abajo) |
| `S3_BUCKET` | `wstyle-receipts` |
| `S3_REGION` | `auto` → se deduce del endpoint (B2/AWS). R2 usa `auto` tal cual |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | llave con permiso **solo** sobre ese bucket (leer, escribir, borrar) |

## Proveedores

| Etapa | Proveedor | Costo | `S3_ENDPOINT` |
|---|---|---|---|
| Pruebas en CI y runner de Claude | **SeaweedFS** (software libre, Docker) | gratis | `http://localhost:8333` (`.github/ci/s3-local.sh`) |
| Producción mientras se prueba | **Backblaze B2** | 10 GB gratis, **sin tarjeta** | `https://s3.<región>.backblazeb2.com` (ej. `s3.us-east-005…`) |
| Producción definitiva | **Cloudflare R2** | 10 GB gratis, sin cobro por descarga (pide tarjeta para activar) | `https://<account-id>.r2.cloudflarestorage.com` |

## Pasar de B2 a R2 (cuando esté listo para prod)
1. Cloudflare → R2 → activar (tarjeta) → **Create bucket** `wstyle-receipts` (privado, sin dominio público).
2. R2 → **Manage API tokens** → *Create Account API token* → permiso **Object Read & Write**,
   limitado al bucket `wstyle-receipts`. Copia *Access Key ID* y *Secret Access Key*.
3. Render → `ricorp-api` → Environment: cambia `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` (y `S3_REGION=auto`). Guardar redepliega solo.
4. Comprueba: el panel del dueño deja encender la seña y un comprobante de prueba se sube y se ve.
5. Los comprobantes antiguos quedan en B2 (las citas viejas los apuntan por clave). Si se quiere
   apagar B2, copia antes los objetos con `rclone copy b2:wstyle-receipts r2:wstyle-receipts`
   (misma clave) y recién ahí borra el bucket de B2.

## Pruebas
- `server/test/receipts-storage.test.js`: región por proveedor (siempre) e **ida y vuelta real**
  (subir, leer, borrar, firma inválida rechazada, bucket privado) cuando existe `S3_TEST_ENDPOINT`.
  En CI corre contra SeaweedFS; en un PC sin S3 esa parte se salta.
