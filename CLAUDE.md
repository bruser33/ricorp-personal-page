# CLAUDE.md — RICORP · página personal (MERN)

Sitio personal MERN. Este repo tiene su propio harness `/owork` (patrón orquestador
autónomo + loop hasta verde), calcado del flujo de OrdenamePay pero **aislado**: no
usa repos de ordename ni su cuenta de GitHub.

## Identidad y aislamiento (REGLA DURA)
- **Cuenta GitHub: `bruser33` (personal).** Todo `gh` (issues, PR, project, workflow,
  variables) y todo push va SOLO a `bruser33/ricorp-personal-page`.
- **PROHIBIDO** tocar cualquier repo/organización de ordename (`OrdenameCL/*`,
  `*ordenamepay*`, `*.ordename.cl`) o crear tickets sobre esta página en ordename.
  El hook `gh-scope-guard.sh` bloquea de forma determinista cualquier `gh` que
  mencione ordename o apunte a un repo distinto de `bruser33/ricorp-personal-page`.
- Commits atribuidos a la identidad personal (`bruser33`), nunca a la cuenta de trabajo.

## Specs y board
- Requerimientos = specs en `specs/NN-<slug>.md` (agente `spec-writer`), publicadas como
  tarjeta SPEC-NN en el **board #1 de bruser33** (`gh project ... 1 --owner bruser33`).
  `/owork specs/NN-*.md` las ejecuta; reemplazan al PROMPT_NIVEL_10.

## Stack y layout
- **client/** — React 19 + TypeScript + Vite. Dev `npm run dev` (**:5173**).
  Build `npm run build` (= `tsc -b && vite build`). Lint `npm run lint`.
- **server/** — Express + Mongoose. Dev `npm run dev` (`node --watch`, **:4000**).
  Start `npm start`. Endpoints: `GET /api/health`, `GET /api/news`, `POST /api/contact`.
- **DB** — MongoDB local `mongodb://127.0.0.1:27017/pagina_personal` (`server/.env`).
- Deploy front → GitHub Pages (push a `main` dispara `.github/workflows/deploy-pages.yml`).
  Deploy back → Render (`render.yaml`).

## Convenciones
- Código en inglés; UI/comentarios en español.
- Client: componentes en `client/src/components/`; assets Figma en `client/public/figma-frames/`.
- Server: respuestas JSON; validar el body de `POST /api/contact`.
- TypeScript estricto en el client: un edit a `.ts/.tsx` dispara `tsc -b --noEmit` como early signal (hook, no bloquea).

## Reglas duras (mecanizadas por hooks)
- **Local primero.** Deploy/prod bloqueados por `safety-guard.sh`: `gh pr merge`,
  `gh workflow run`, `gh variable set`, `git push` a `main`, `render`. Escape que
  creás VOS: `touch .claude/queue/.prod-ok` (y `rm` al terminar).
- **Loop hasta verde**: si existe `.claude/queue/.verify-gate`, el Stop hook no deja
  terminar hasta que la verificación pase. Default: `cd client && npx tsc -b --noEmit`.
  El contenido del marker sobre-escribe el comando (p.ej. cuando haya tests).
- No levantar prod. No mocks contra la BD real en tests de integración. Verificar en
  el navegador local (:5173), no solo asumir.
- Español, una línea de log por fase. Al cerrar, guardá 1 slot de auto-memoria con la
  lección no-obvia del requerimiento.

## Puertos
- Front local: `http://127.0.0.1:5173`  ·  Back local: `http://127.0.0.1:4000`

## Modo GitHub (Claude en GitHub Actions)
Se activa con `@claude` en una issue, comentario o revisión de PR (`.github/workflows/claude.yml`).
Solo pueden activarlo quienes tienen escritura en el repo: **bruser33** (Pedro) y
**jhoncamacho017-ai** (Joe, dueño de WS Style, que trabaja desde el celular y muchas veces dicta).
Si `OWORK_CI=1` estás en el runner: no hay nadie mirando la terminal, todo se conversa en la issue.

**Cómo hablar:** comentarios cortos, en español de Chile, sin jerga técnica (Joe no es programador).
Toda pregunta va con opciones numeradas y letras para responder con el pulgar:
`1A 2C 3: <texto libre>`. Si el texto viene dictado (sin tildes, palabras pegadas), interprétalo
de buena fe y confirma lo dudoso en la misma pregunta.

**Qué hacer según la issue:**
1. **Pedido nuevo sin spec** (Joe dictó una tarea): actúa como el agente `spec-writer`
   (`.claude/agents/spec-writer.md` + skill `spec-clarifier`). Escribe `specs/NN-<slug>.md`
   (NN = siguiente número libre en `specs/`), comenta un resumen de 5–8 líneas + asunciones
   numeradas + las preguntas (todas juntas en UN comentario, cada una con 4 opciones A–D y
   "E: otra, escríbela") y **termina la corrida**. En la siguiente corrida (cuando respondan
   con `@claude …`) aplica las respuestas, actualiza la spec, cambia el título de la issue a
   `SPEC-NN — WS Style: …` y reemplaza su cuerpo por la spec. No implementes hasta que digan
   "hazla", "dale", "ejecútala" o algo parecido.
2. **Issue que ya es una spec** (`SPEC-NN — …`, cuerpo con AC) y piden hacerla: sigue
   `.claude/commands/owork.md` y `.claude/commands/resolver.md` completos (Explore → planner →
   implementer test-first → panel de 3 `verifier` → `playwright-verifier` → /code-review), con
   estos ajustes para el runner:
   - Gate: `cd client && npx tsc -b --noEmit && npx vitest run && npm run lint && cd ../server && npm test`
     (+ `npm run build` en client al final). Mongo ya corre en `localhost:27017` (replica set rs0).
   - Para Playwright, levanta los servers en segundo plano (`npm run dev --prefix server &` y
     `npm run dev --prefix client -- --host 127.0.0.1 &`), espera a que respondan :4000/api/health y
     :5173, y verifica con el MCP `playwright` (headless). Adjunta capturas al PR si el AC es visual.
   - Si falta un insumo (credencial, foto, texto, decisión del dueño): **no lo inventes**. Marca el
     AC como BLOQUEADO, pregunta en la issue con opciones y sigue con el resto.
   - Si te quedas sin turnos o tiempo, deja todo commiteado en la rama y comenta qué quedó hecho y qué falta.
3. **Comentario en un PR** (`@claude` en una revisión): aplica el cambio en la misma rama del PR y
   vuelve a pasar el gate.

**Cierre en GitHub (en este modo SÍ hay commit, push a rama y PR; nunca merge):**
- Rama `claude/issue-<N>-<slug>`, commits en español, push solo a esa rama (jamás a la rama principal).
- PR contra la rama principal con título `SPEC-NN — …` y cuerpo con: qué se hizo, AC uno por uno
  (✅ / ⛔ BLOQUEADO), cómo se verificó, capturas y `Closes #<N>`. Comenta en la issue el link al PR
  con un resumen de 3 líneas.
- Nunca mergear, ni tocar secretos/variables, ni desplegar. El merge lo hace Pedro.
- Board #2 "WS Style — Specs" (project `PVT_kwHOAP4BNs4BsQ4r`, campo Status
  `PVTSSF_lAHOAP4BNs4BsQ4rzhqf0wg`): solo si existe `GH_PROJECT_TOKEN`, usa
  `GH_TOKEN=$GH_PROJECT_TOKEN gh project …` para agregar la issue y moverla (spec nueva → Todo; al
  empezar → In Progress). Si no existe, no toques el board.
