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
