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

// Agenda (SPEC-32, CB-16): las páginas /wstyle/reservar/, /cita/ y /cuenta/… traen un aviso sin JavaScript con el
// link de WhatsApp del local (el mismo wa.me que arma links.ts desde site.json).
const waDigits = (() => {
  let d = String(content.site?.contact?.whatsapp ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = d.slice(1);
  return d.length === 11 && /^56[2-9]/.test(d) ? d : d.length === 9 && /^[2-9]/.test(d) ? '56' + d : null;
})();
const waText = content.site?.contact?.whatsappText;
const wa = waDigits ? `https://wa.me/${waDigits}${waText ? `?text=${encodeURIComponent(waText)}` : ''}` : null;
for (const r of ['reservar', 'cita', 'cuenta', 'cuenta/mis-citas', 'cuenta/recuperar', 'cuenta/confirmar']) {
  const file = resolve(ROOT, `dist/wstyle/${r}/index.html`);
  const html = readFileSync(file, 'utf8');
  if (!html.includes('data-wa href="/wstyle/#llega"')) throw new Error(`prerender: falta el link data-wa en dist/wstyle/${r}/index.html`);
  if (wa) writeFileSync(file, html.replace('data-wa href="/wstyle/#llega"', `data-wa href="${esc(wa)}" target="_blank" rel="noopener"`));
}
console.log(`[prerender] agenda: aviso sin JavaScript ${wa ? 'con WhatsApp' : 'sin WhatsApp (teléfono no reconocido)'}`);
