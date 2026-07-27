---
description: Levanta backend (Express :4000) y frontend (Vite :5173) en background para la página personal RICORP. Uso. /start
allowed-tools: Bash
---

# /start — levantar servicios locales (RICORP)

Repo: `/home/pedrorico/Documentos/pedrorico/ricorp-personal-page`. Un solo repo (client + server).

## 1. ¿Ya hay algo corriendo?
```bash
ss -lntp 2>/dev/null | grep -E ':4000|:5173' | head -5
```
- Ambos ocupados → "Ya corriendo". Solo uno → levantá el que falta.

## 2. Backend (Express :4000)
- Requiere Mongo local en `:27017` (o `MONGO_URI` en `server/.env`). Si falta `.env`,
  `cp server/.env.example server/.env`.
- Background (`run_in_background: true`):
  ```
  cd /home/pedrorico/Documentos/pedrorico/ricorp-personal-page/server && npm run dev > /tmp/ricorp-back.log 2>&1
  ```
- Guardá el BashID.

## 3. Frontend (Vite :5173)
- Background (`run_in_background: true`):
  ```
  cd /home/pedrorico/Documentos/pedrorico/ricorp-personal-page/client && npm run dev > /tmp/ricorp-front.log 2>&1
  ```
- Guardá el BashID.

## 4. Resumen (tras ~5-8s)
- Logs `/tmp/ricorp-back.log` y `/tmp/ricorp-front.log`; BashIDs.
- Front: `http://127.0.0.1:5173` · Back health: `http://127.0.0.1:4000/api/health`.
- Si `npm i` no se corrió aún en client/server, hacelo primero.

No uses timeouts largos en las llamadas de background.
