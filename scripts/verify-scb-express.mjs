// Verificación estática de SPEC-49 (sitio SCB Express + plataforma demo).
// Uso: node scripts/verify-scb-express.mjs   → exit 1 si algún AC estático falla.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "client/public/scb-express");
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const read = p => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");

const site = read("index.html");
const app = read("plataforma/index.html");
check(site, "AC1 falta scb-express/index.html");
check(app, "AC5 falta scb-express/plataforma/index.html");

// AC1 secciones
for (const id of ["hero", "servicios", "plataforma", "como-funciona", "cobertura", "cotizar"])
  check(new RegExp(`id="${id}"`).test(site), `AC1 falta la sección #${id}`);
check(/<footer/.test(site), "AC1 falta el footer");

// AC2 logo azul
check(existsSync(join(root, "img/logo-scb-azul.png")), "AC2 falta img/logo-scb-azul.png");
check(!/de2000|rgb\(\s*222\s*,\s*32/i.test(site + app), "AC2 queda el rojo #DE2000");
check(/logo-scb-azul/.test(site) && /logo-scb-azul/.test(app), "AC2 sitio o plataforma no usan el logo azul");

// AC3 input OD → seguimiento
check(/id="od-input"/.test(site) && /plataforma\/[^"']*#\/?seguimiento/.test(site), "AC3 el hero no lleva al seguimiento");

// AC4 capturas referenciadas y existentes
const caps = [...site.matchAll(/img\/(plataforma-[\w-]+\.(?:webp|png|jpg))/g)].map(m => m[1]);
check(caps.length >= 4, `AC4 hay ${caps.length} capturas, se esperan ≥4`);
for (const c of new Set(caps)) check(existsSync(join(root, "img", c)) && statSync(join(root, "img", c)).size > 5000, `AC4 falta o está vacía img/${c}`);
check(/role="tablist"/.test(site), "AC4 la sección plataforma no tiene pestañas");

// AC5 pantallas de la plataforma
for (const r of ["login", "dashboard", "ordenes", "nueva", "etiqueta", "rutas", "reporte", "clientes", "documentos", "seguimiento"])
  check(new RegExp(`data-view="${r}"`).test(app), `AC5 falta la pantalla ${r}`);
const tok = s => (s.match(/--azul:\s*(#[0-9a-f]{6})/i) || [])[1];
check(tok(site) && tok(site) === tok(app), "AC5 sitio y plataforma no comparten el token --azul");

// AC6 etiqueta
check(/100mm 150mm/.test(app), "AC6 la etiqueta no declara @page 100mm 150mm");
check(/BULTO \$\{i \+ 1\} \/ \$\{n\}/.test(app) && /class="qr"/.test(app) && /class="barcode"|"class", "barcode"/.test(app) && /JsBarcode\(/.test(app) && /qrcode\(/.test(app), "AC6 etiqueta sin bulto i/N, QR o código de barras");

// AC7 sin video ni salud
const all = site + app;
check(!/<video|\.mp4|\.webm|createElement\(\s*["'`]video/i.test(all), "AC7 hay video");
// texto visible + JS (textos que se inyectan) + atributos que se leen (alt, placeholder, title, aria-label)
const texto = all.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<(?!script)[^>]*?>/g, t => (t.match(/(?:alt|placeholder|title|aria-label)="[^"]*"/g) || []).join(" "));
const salud = texto.match(/salud|cl[ií]nic|hospital|laborator|m[eé]dic(?!alcourrier)|farmac|pacient/i);
check(!salud, `AC7 menciona salud: «${salud && salud[0]}»`);
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [e.name]);
check(!walk(root).some(f => /\.(mp4|webm|mov|m4v)$/i.test(f)), "AC7 hay archivos de video en scb-express/");

// AC9 reduced motion
check(/prefers-reduced-motion/.test(site) && /prefers-reduced-motion/.test(app), "AC9 falta prefers-reduced-motion");

// JS en línea parsea
for (const [n, h] of [["sitio", site], ["plataforma", app]])
  for (const m of h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (e) { fails.push(`JS de ${n} no parsea: ${e.message}`); }
  }
check(/noindex/.test(site) && /noindex/.test(app), "falta noindex");

if (fails.length) { console.error("✗ SPEC-49\n- " + fails.join("\n- ")); process.exit(1); }
console.log("✓ SPEC-49 verificación estática OK");
