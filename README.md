# pagina-personal — RICORP

Sitio personal MERN basado en archivo Figma `Ricorp_D-components` (key `TZl6wzwquAr7AqQnjdBarS`).

## URLs

- **Frontend en vivo**: https://bruser33.github.io/ricorp-personal-page/
- **Repo**: https://github.com/bruser33/ricorp-personal-page

## Stack

- **Client**: React 18 + TypeScript + Vite, fuente Source Sans Pro (Google Fonts)
- **Server**: Express + Mongoose
- **DB**: MongoDB

## Run local

```bash
# api
cd server && npm i && cp .env.example .env && npm run dev   # :4000
# web
cd client && npm i && npm run dev                            # :5173
```

## Deploy

### Frontend → GitHub Pages (automático)

Workflow `.github/workflows/deploy-pages.yml` se dispara en cada push a `main`.

Variables (build-time) que el workflow lee:

| Var | Origen | Descripción |
|---|---|---|
| `VITE_BASE` | auto = `/<repo>/` | base path para Pages |
| `VITE_API_URL` | GitHub Actions Variable | URL pública del backend Render (sin trailing slash) |

Cuando esté el backend desplegado, configurar la variable con:

```bash
gh variable set VITE_API_URL --body "https://ricorp-api.onrender.com" --repo bruser33/ricorp-personal-page
```

### Backend → Render (1 paso manual)

Hay un blueprint `render.yaml` listo en la raíz. Pasos:

1. Ir a https://render.com/ y entrar con la cuenta de GitHub `bruser33`
2. New → **Blueprint** → conectar repo `ricorp-personal-page`
3. Render detecta `render.yaml` y propone crear el servicio `ricorp-api` (free plan)
4. Setear secret `MONGO_URI` con tu connection string de MongoDB Atlas (free tier en https://cloud.mongodb.com)
5. Apply → Render builda y deploya. URL final: `https://ricorp-api.onrender.com` (o la que asigne)
6. Volver a GitHub: `gh variable set VITE_API_URL --body "<url-de-render>"` (ver arriba)
7. Re-trigger workflow Pages: `gh workflow run "Deploy frontend to GitHub Pages" --repo bruser33/ricorp-personal-page`

CORS está pre-configurado en `server/src/index.js` para permitir `https://bruser33.github.io`.
Si querés agregar otros orígenes, setear `ALLOWED_ORIGINS` en Render (CSV).

## Cómo se generó la maquetación (orquestador autónomo)

1. **Captura visual**: Playwright MCP navega a Figma con sesión persistente, identifica los archivos `Ricorp_D-components` (file key `TZl6wzwquAr7AqQnjdBarS`) y `Ricorp_animation` (`cfoZxVoDIaEvNQVOBNwH01`), recorre frames con `ArrowRight` y los screenshotea
2. **Specs reales**: Personal Access Token de Figma → `GET /v1/files/{key}/nodes` para extraer fontFamily, fontSize, fontWeight, lineHeightPx, fills, gradientStops por capa
3. **Análisis paralelo**: 4 subagentes general-purpose (Hero / Projects+Footer / News / Contact) reciben `Read` access a frames + código actual + render screenshots y emiten reportes con `archivo:línea — antes → después`
4. **Síntesis**: orquestador (main thread) consolida los 4 reportes y aplica edits secuencialmente
5. **Validador**: Playwright vuelve a screenshottear y compara
6. **Deploy**: commit → push → GitHub Actions → Pages

## Specs Figma cacheadas

`~/Desktop/ricorp-figma-work/figma-*.json` — datos de la API (no en repo). Para refrescar:

```bash
curl -sS -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/TZl6wzwquAr7AqQnjdBarS?depth=4" \
  -o ~/Desktop/ricorp-figma-work/figma-d4.json
```

## Estructura

```
.
├── .github/workflows/deploy-pages.yml   # Frontend CI → GitHub Pages
├── render.yaml                          # Backend blueprint → Render
├── client/                              # React + Vite
│   ├── public/figma-frames/             # Screenshots Figma usados como assets
│   └── src/components/                  # Header, Hero, Projects, News, Contact, Footer
└── server/                              # Express + Mongoose
    └── src/index.js                     # /api/health, /api/news, POST /api/contact
```
