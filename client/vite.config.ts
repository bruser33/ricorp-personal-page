import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  },
})
