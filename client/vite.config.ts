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
    // Force the minifier to keep the UNPREFIXED `backdrop-filter`. With the
    // default target esbuild collapses `backdrop-filter` + `-webkit-` down to
    // the `-webkit-` variant only, which current Chromium no longer supports
    // (CSS.supports('-webkit-backdrop-filter',...) === false) → the header
    // blur silently dies. Targeting browsers that ship the unprefixed
    // property keeps it in the output.
    cssTarget: ['chrome100', 'safari16', 'firefox100', 'edge100'],
    // Multi-página: la home (index.html) y la landing W Style (wstyle/index.html → ricorp.cl/wstyle/).
    // Cada entrada tiene su propio JS/CSS: three.js y el código de wstyle no entran en el bundle de la home.
    // El HTML de wstyle se prerenderiza después del build (scripts/prerender-wstyle.mjs).
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        wstyle: resolve(import.meta.dirname, 'wstyle/index.html'),
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
