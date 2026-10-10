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
      // Chunks explícitos: React (compartido por ambas páginas) y three.js (solo wstyle). Sin esto el bundler arma
      // un chunk común que mezcla ambos y la home terminaría precargando three.js.
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 2 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
          ],
        },
      },
    },
    // three.js (~680 kB, ~170 kB gzip) solo lo descarga /wstyle/.
    chunkSizeWarningLimit: 750,
  },
})
