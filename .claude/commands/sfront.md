---
description: Verifica si el frontend (Vite :5173) está sirviendo la app RICORP. Usa HTTP como señal primaria.
allowed-tools: Bash
---

# /sfront — estado del frontend (RICORP)

## Pasos
1. **Puerto escuchando:**
   ```
   ss -lntp 2>/dev/null | grep ':5173' | head -1 || echo NO_ESCUCHA
   ```
   - Si `NO_ESCUCHA` → *"Front no está corriendo en :5173. Levántalo con /start."* y terminá.

2. **Polling por HTTP 200 con HTML real (máx 120s, pasos 4s):**
   ```
   STATE=TIMEOUT
   for i in $(seq 1 30); do
     BODY=$(curl -s --max-time 4 http://127.0.0.1:5173/ 2>/dev/null)
     if echo "$BODY" | grep -qi '<title>RICORP</title>'; then STATE=LISTO; break; fi
     if grep -qiE "error|failed to compile|✘ \[ERROR\]" /tmp/ricorp-front.log 2>/dev/null; then STATE=ERROR; break; fi
     sleep 4
   done
   echo "STATE=$STATE"; echo "---"; tail -8 /tmp/ricorp-front.log 2>/dev/null
   ```

3. **Respondé según `STATE`:**
   - `LISTO` → *"✅ Front sirviendo en :5173. Refrescá el navegador (Ctrl+R)."*
   - `ERROR` → *"❌ Error de compilación. Ver /tmp/ricorp-front.log"* + últimas 20 líneas.
   - `TIMEOUT` → *"⏳ Aún compilando — esperá y corré de nuevo."*

## Notas
- Vite arranca rápido (~1-3s) y hace HMR. Tras editar `src/**`, HTTP 200 sirve lo último; refrescá el navegador.
