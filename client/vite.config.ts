import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Custom apex domain (ricorp.cl) serves from root, so the base is "/".
// The Pages workflow still passes VITE_BASE=/<repo>/ for the old github.io
// subpath; we ignore it here on purpose since the site uses the custom domain.
const base = '/'

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    // three desde sus módulos fuente (ESM sin efectos secundarios): en modo secuencia /wstyle/ solo empaqueta la
    // matemática de cámara (Vector3, Quaternion, PerspectiveCamera…); el renderer WebGL y la escena quedan en el
    // chunk diferido del respaldo 3D. Solo el import exacto 'three' (los addons siguen igual, y también lo usan).
    alias: [{ find: /^three$/, replacement: 'three/src/Three.js' }],
  },
  build: {
    // CSS targets for lightningcss (Vite's CSS minifier). With safari16 in the
    // list it ADDS `-webkit-backdrop-filter` next to the standard property, so
    // the sources must write ONLY `backdrop-filter`: if both are written by
    // hand, lightningcss collapses the pair down to the `-webkit-` one, which
    // current Chromium ignores → no blur in Chrome (PR #9 round 4, B2; checked
    // by barberia-3d/scripts/verify.mjs on dist/assets/*.css).
    cssTarget: ['chrome100', 'safari16', 'firefox100', 'edge100'],
    // Multi-página: la home (index.html) y la landing WS Style (wstyle/index.html → ricorp.cl/wstyle/).
    // Cada entrada tiene su propio JS/CSS: three.js y el código de wstyle no entran en el bundle de la home.
    // El HTML de wstyle se prerenderiza después del build (scripts/prerender-wstyle.mjs).
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        wstyle: resolve(import.meta.dirname, 'wstyle/index.html'),
        // Agenda (SPEC-32): cada ruta es una carpeta real con su index.html (Pages solo sirve carpetas que existen).
        ...Object.fromEntries(
          ['reservar', 'cita', 'cuenta', 'cuenta/mis-citas', 'cuenta/recuperar', 'cuenta/confirmar'].map((r) => [
            `wstyle-${r.replace('/', '-')}`,
            resolve(import.meta.dirname, `wstyle/${r}/index.html`),
          ]),
        ),
        // Panel del barbero (SPEC-33): /wstyle/pro/, /pro/registro/, /pro/agenda/, /pro/pagos/ (SPEC-37) y /pro/perfil/.
        ...Object.fromEntries(
          ['pro', 'pro/registro', 'pro/agenda', 'pro/pagos', 'pro/perfil'].map((r) => [`wstyle-${r.replace('/', '-')}`, resolve(import.meta.dirname, `wstyle/${r}/index.html`)]),
        ),
        // Páginas legales (Política de privacidad y Términos, requeridas por Meta para el inicio con Facebook): HTML
        // prerenderizado en el build (scripts/prerender-wstyle.mjs).
        ...Object.fromEntries(['privacidad', 'terminos'].map((r) => [`wstyle-${r}`, resolve(import.meta.dirname, `wstyle/${r}/index.html`)])),
        // Panel del super admin (SPEC-34): /wstyle/admin/ y una carpeta por sección (recargar funciona). Sin enlace público, noindex.
        ...Object.fromEntries(
          ['admin', ...['barberos', 'citas', 'pagos', 'rendicion', 'carta', 'horario', 'estadisticas', 'configuracion', 'auditoria'].map((s) => `admin/${s}`)].map((r) => [
            `wstyle-${r.replace('/', '-')}`,
            resolve(import.meta.dirname, `wstyle/${r}/index.html`),
          ]),
        ),
      },
      // Chunk explícito para React (compartido por ambas páginas): sin esto el bundler arma un chunk común que
      // mezcla React con la matemática de three y la home terminaría precargándola.
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
          ],
        },
      },
    },
    // El chunk del respaldo 3D (renderer + escena) supera los 500 kB; solo se descarga con ?mode=3d o si falla la
    // secuencia.
    chunkSizeWarningLimit: 750,
  },
})
