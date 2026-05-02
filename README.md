# pagina-personal — RICORP

Sitio personal MERN basado en diseño Figma del archivo `Ricorp_D-components` + `Ricorp_animation`.

## Stack

- **Client**: React 18 + TypeScript + Vite
- **Server**: Express + Mongoose
- **DB**: MongoDB

## Run local

```bash
# api
cd server && npm i && cp .env.example .env && npm run dev   # :4000
# web
cd client && npm i && npm run dev                           # :5173
```

## Deploy

- **Frontend** → GitHub Pages (workflow `.github/workflows/deploy-pages.yml`).
  Se publica automáticamente en cada push a `main`.
- **Backend** → no se hospeda en GitHub. Para desplegarlo: Render / Railway / Fly.io.
  Mientras no haya backend público, el frontend usa fallbacks locales (news estática, contact form silencioso).

Variables del client (build time):

| Var | Default | Uso |
|---|---|---|
| `VITE_BASE` | `/` | base path Vite (lo setea el workflow a `/<repo>/`) |
| `VITE_API_URL` | `http://localhost:4000` | URL del backend |

## Estructura

```
.
├── .github/workflows/deploy-pages.yml   # CI deploy
├── client/                              # React + Vite
│   ├── public/figma-frames/             # Capturas de Figma usadas como assets
│   └── src/components/                  # Header, Hero, Projects, News, Contact, Footer
└── server/                              # Express + Mongoose
    └── src/index.js                     # /api/health, /api/news, POST /api/contact
```
