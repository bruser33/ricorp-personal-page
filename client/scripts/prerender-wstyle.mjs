// Prerender de /wstyle/ (SPEC-15 AC-04): renderiza el árbol React con el contenido por defecto
// (public/wstyle/content/*.json + config.json) y lo inyecta en dist/wstyle/index.html junto con los textos de
// <head> y el contenido usado (#wstyle-data) para que el cliente hidrate sin diferencias. Así el HTML que sirve
// GitHub Pages ya trae los titulares, el nombre y el JSON-LD.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const PUB = resolve(ROOT, 'public/wstyle');
const OUT = resolve(ROOT, 'dist/wstyle/index.html');
const json = (p, fallback) => { try { return JSON.parse(readFileSync(resolve(PUB, p), 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; } };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const content = { site: json('content/site.json'), services: json('content/services.json'), config: json('config.json', {}) };
const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { render } = await vite.ssrLoadModule('/src/wstyle/ssr.tsx');
  const { html, head } = render(content);
  let page = readFileSync(OUT, 'utf8');
  const put = (mark, value) => {
    if (!page.includes(mark)) throw new Error(`prerender: falta el marcador ${mark} en dist/wstyle/index.html`);
    page = page.replace(mark, () => value);
  };
  put('<!--wstyle-title-->', esc(head.title));
  put('<!--wstyle-description-->', esc(head.description));
  put('<!--wstyle-og-title-->', esc(head.ogTitle));
  put('<!--wstyle-app-->', html);
  put('<!--wstyle-data-->', `<script id="wstyle-data" type="application/json">${JSON.stringify(content).replace(/</g, '\\u003c')}</script>`);
  writeFileSync(OUT, page);
  console.log(`[prerender] dist/wstyle/index.html (${(page.length / 1024).toFixed(1)} kB)`);
} finally {
  await vite.close();
}
