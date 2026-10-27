// SPEC-47 — Banner y mockups del hito `trabajo-actual-2025` (mi trabajo actual:
// plataforma de logística integrada con préstamos bancarios, abr-2025 – hoy).
//
// Genera:
//   figma-frames/trabajo-actual-banner.webp  2400×1350 · tarjeta + banda del post
//   figma-frames/trabajo-actual-1.webp       1600×1000 · logística + préstamos y la ruta propuesta
//   figma-frames/trabajo-actual-2.webp        900×1950 · teléfono: el workflow de IA multi-agente
//
// Mismo sistema visual y misma zona segura que scripts/banners-trayectoria.mjs
// (SPEC-42); va en un archivo aparte para no pisar ese generador. Todo es
// composición tipográfica propia: NINGUNA captura, logo ni dato de la empresa;
// solo lo que dice el CV (logística + préstamos, ruta propuesta más rápida,
// stack, Claude Code multi-agente). Sin cifras inventadas.
//
// Uso (desde client/):
//   PLAYWRIGHT_CORE=/ruta/a/node_modules/playwright-core \
//   CHROMIUM=/ruta/a/chrome-headless-shell \
//   node scripts/banners-trabajo-actual.mjs [carpeta-de-trabajo]
// Requiere cwebp en el PATH.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/figma-frames');
const WORK = resolve(process.argv[2] ?? join(tmpdir(), 'banners-trabajo-actual'));
mkdirSync(WORK, { recursive: true });
const ID = 'trabajo-actual';

/* ---- Sistema visual (copiado de banners-trayectoria.mjs) ---- */
const FUENTE = resolve(process.env.HOME ?? '', 'Library/Fonts/SourceSans3-VariableFont.ttf');
const BASE_CSS = `
@font-face {
  font-family: 'S3'; font-weight: 200 900;
  src: local('Source Sans 3'), url('${pathToFileURL(FUENTE).href}') format('truetype');
}
:root {
  --bg: #121115; --fg: #e3e3e3; --muted: #949494;
  --blue: #343cff; --blue-a: #5158fc; --mid: #6e44a4; --mag: #994a7b; --green: #22D886;
  --grad: linear-gradient(135deg, #5158fc 0%, #8a5bd8 50%, #c0649f 100%);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; }
body {
  font-family: 'S3', 'Source Sans 3', system-ui, sans-serif; color: var(--fg);
  background: var(--bg); overflow: hidden; position: relative;
  -webkit-font-smoothing: antialiased;
}
.grad { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.kicker { font-size: 44px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: #b9b9c6; }
.meta { font-size: 46px; font-weight: 400; color: #c9c9d2; letter-spacing: 0.01em; }
.meta b { font-weight: 600; color: #fff; }
.sep { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--blue-a); margin: 0 26px; vertical-align: middle; transform: translateY(-4px); }
.grano { position: absolute; inset: 0; opacity: .06; pointer-events: none; z-index: 50;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
`;
const GRAD_DEFS = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>`;

const BANNER_CSS = `
.glow { position: absolute; border-radius: 50%; filter: blur(140px); opacity: .55; }
.marco { position: absolute; inset: 64px; border: 1.5px solid rgba(255,255,255,.07); border-radius: 6px; }
.esquina { position: absolute; font-size: 28px; letter-spacing: .3em; color: rgba(255,255,255,.28); font-weight: 600; }
.centro { position: absolute; left: 420px; right: 420px; top: 392px; height: 390px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 22px; z-index: 10; }
.titular { font-size: 158px; font-weight: 700; line-height: .92; letter-spacing: -0.025em; color: #fff; white-space: nowrap; }
`;
const VELO = `<div style="position:absolute;inset:0;z-index:5;background:
  radial-gradient(52% 40% at 50% 46%, rgba(18,17,21,.93) 0%, rgba(18,17,21,.8) 55%, rgba(18,17,21,0) 100%)"></div>`;

/* Motivo del banner: un mapa de ruta. Grilla de calles tenue, una ruta
   propuesta que une 9 paradas (curva en degradado) y los pines. */
const PARADAS = [[300, 1080], [520, 860], [430, 560], [760, 330], [1180, 250], [1640, 300], [1960, 520], [1880, 880], [2140, 1100]];
const rutaPath = (pts) => pts.map(([x, y], i) => {
  if (i === 0) return `M${x} ${y}`;
  const [px, py] = pts[i - 1];
  const mx = (px + x) / 2;
  return `C${mx} ${py} ${mx} ${y} ${x} ${y}`;
}).join(' ');
const motivoRuta = `
  <div style="position:absolute;inset:0;z-index:1;opacity:.5;
    background-image:linear-gradient(rgba(255,255,255,.06) 2px, transparent 2px),linear-gradient(90deg, rgba(255,255,255,.06) 2px, transparent 2px);
    background-size:120px 120px;transform:rotate(-8deg) scale(1.3);
    -webkit-mask-image:radial-gradient(75% 75% at 50% 50%, #000 35%, transparent 90%)"></div>
  <svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    <path d="${rutaPath(PARADAS)}" stroke="rgba(255,255,255,.08)" stroke-width="34" stroke-linecap="round"/>
    <path d="${rutaPath(PARADAS)}" stroke="url(#r)" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 26"/>
    ${PARADAS.map(([x, y], i) => `<g transform="translate(${x} ${y})">
      <circle r="${i === 0 || i === PARADAS.length - 1 ? 30 : 20}" fill="${i === 0 ? '#22D886' : 'url(#r)'}" opacity=".9"/>
      <circle r="${i === 0 || i === PARADAS.length - 1 ? 52 : 38}" stroke="rgba(255,255,255,.18)" stroke-width="2.5"/></g>`).join('')}
    ${GRAD_DEFS('r')}
  </svg>
  ${VELO}`;

const bannerHtml = `<div class="glow" style="width:1100px;height:900px;left:-200px;top:-260px;background:var(--blue)"></div>
  <div class="glow" style="width:1100px;height:900px;right:-240px;bottom:-320px;background:var(--mag)"></div>
  ${motivoRuta}
  <div class="marco"></div>
  <div class="esquina" style="left:250px;top:104px">RICORP · TRAYECTORIA</div>
  <div class="esquina" style="right:250px;top:104px">ABR 2025 – HOY</div>
  <div class="centro">
    <p class="kicker">Full Stack Developer · Trabajo actual</p>
    <h1 class="titular">Logística <span class="grad">+ préstamos</span></h1>
    <p class="meta"><b>Angular</b> · <b>React</b> · <b>React Native</b> · <b>Node.js</b><span class="sep"></span>IA con Claude Code</p>
  </div>
  <div class="grano"></div>`;

/* ---- Figura 16:10: la plataforma (logística + préstamos) y la ruta propuesta ---- */
const PANEL_CSS = `
body { background:
  radial-gradient(70% 80% at 0% 0%, rgba(52,60,255,.32), transparent 60%),
  radial-gradient(70% 80% at 100% 100%, rgba(153,74,123,.32), transparent 60%), #141319; }
.lbl { font-size: 26px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #9d9daa; }
.card { background: rgba(255,255,255,.045); border: 1.5px solid rgba(255,255,255,.08); border-radius: 26px; }
`;
const MINI = [[90, 520], [190, 380], [150, 230], [320, 140], [500, 120], [640, 220], [700, 380], [600, 520]];
const figuraHtml = `<div style="position:absolute;inset:80px 90px;display:grid;grid-template-columns:820px 1fr;gap:40px">
    <div class="card" style="position:relative;overflow:hidden;padding:36px 40px">
      <p class="lbl">Ruta propuesta</p>
      <p style="font-size:44px;font-weight:700;color:#fff;margin-top:10px">Más rápida, menos gestión</p>
      <div style="position:absolute;inset:150px 0 0 0;opacity:.55;
        background-image:linear-gradient(rgba(255,255,255,.07) 2px, transparent 2px),linear-gradient(90deg, rgba(255,255,255,.07) 2px, transparent 2px);background-size:80px 80px"></div>
      <svg style="position:absolute;left:40px;top:180px" width="740" height="620" viewBox="0 0 740 620" fill="none">
        <path d="${rutaPath(MINI)}" stroke="rgba(255,255,255,.1)" stroke-width="26" stroke-linecap="round"/>
        <path d="${rutaPath(MINI)}" stroke="url(#m)" stroke-width="9" stroke-linecap="round"/>
        ${MINI.map(([x, y], i) => `<g transform="translate(${x} ${y})"><circle r="26" fill="${i === 0 ? '#22D886' : '#1b1a22'}" stroke="${i === 0 ? '#22D886' : 'url(#m)'}" stroke-width="5"/>
          <text y="10" text-anchor="middle" font-family="S3" font-size="28" font-weight="700" fill="${i === 0 ? '#0d2a1d' : '#fff'}">${i + 1}</text></g>`).join('')}
        ${GRAD_DEFS('m')}
      </svg>
    </div>
    <div style="display:flex;flex-direction:column;gap:28px">
      <p class="lbl">Una sola plataforma</p>
      ${[['Logística', 'Envíos, paradas y la ruta de cada día.', 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01'],
         ['Préstamos bancarios', 'Integrados en la misma operación.', 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18'],
         ['Full stack', 'Angular, React, React Native, Node.js y MySQL.', 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14']].map(([t, d, p]) =>
        `<div class="card" style="padding:30px 32px;display:flex;gap:26px;align-items:center">
          <div style="flex:0 0 84px;height:84px;border-radius:22px;background:linear-gradient(135deg,rgba(81,88,252,.35),rgba(192,100,159,.35));display:flex;align-items:center;justify-content:center">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg></div>
          <div><p style="font-size:40px;font-weight:700;color:#fff;line-height:1.1">${t}</p>
          <p style="font-size:29px;color:#b9b9c6;margin-top:8px;line-height:1.25">${d}</p></div></div>`).join('')}
    </div>
  </div><div class="grano"></div>`;

/* ---- Teléfono vertical: el workflow multi-agente con Claude Code ---- */
const TEL_CSS = `
html, body { background: transparent; }
.tel { position: absolute; inset: 0; border-radius: 96px; overflow: hidden; background: #141319;
  box-shadow: inset 0 0 0 14px #050507, inset 0 0 0 16px rgba(255,255,255,.12); }
.pantalla { position: absolute; inset: 14px; border-radius: 82px; overflow: hidden;
  background: radial-gradient(90% 50% at 20% 0%, rgba(52,60,255,.35), transparent 70%),
    radial-gradient(90% 50% at 100% 100%, rgba(153,74,123,.35), transparent 70%), #141319; }
.isla { position: absolute; top: 34px; left: 50%; width: 220px; height: 58px; margin-left: -110px; border-radius: 30px; background: #050507; z-index: 20; }
.lbl { font-size: 30px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: #9d9daa; }
`;
const PASOS = [
  ['Planifica', 'Un agente arma el plan de la tarea.'],
  ['Implementa', 'Otro escribe el código del plan.'],
  ['Revisa', 'Un revisor lee el cambio con ojos frescos.'],
  ['Prueba en el navegador', 'Se verifica en la app, no se asume.'],
];
const telefonoHtml = `<div class="tel"><div class="pantalla">
  <div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:0">
    <p class="lbl">Desarrollo asistido por IA</p>
    <p style="font-size:78px;font-weight:700;line-height:1;color:#fff;margin:22px 0 56px">Workflows<br><span class="grad">multi-agente</span></p>
    ${PASOS.map(([t, d], i) => `<div style="display:flex;gap:34px;align-items:stretch">
      <div style="flex:0 0 92px;display:flex;flex-direction:column;align-items:center">
        <div style="width:92px;height:92px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700;
          background:var(--grad);color:#fff">${i + 1}</div>
        <div style="flex:1;width:4px;min-height:56px;background:linear-gradient(rgba(81,88,252,.7),rgba(192,100,159,.35))"></div></div>
      <div style="padding:14px 0 50px"><p style="font-size:50px;font-weight:700;color:#fff;line-height:1.08">${t}</p>
        <p style="font-size:34px;color:#b9b9c6;margin-top:10px;line-height:1.25">${d}</p></div></div>`).join('')}
    <div style="display:flex;gap:34px;align-items:center">
      <div style="flex:0 0 92px;height:92px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(34,216,134,.16);border:3px solid #22D886">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#22D886" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg></div>
      <p style="font-size:50px;font-weight:700;color:#22D886">Tarea terminada</p></div>
    <p style="font-size:32px;color:#9d9daa;margin-top:60px;letter-spacing:.04em">Con Claude Code, en el día a día</p>
  </div></div><div class="isla"></div></div>`;

const PIEZAS = [
  { archivo: `${ID}-banner`, w: 2400, h: 1350, css: BANNER_CSS, html: bannerHtml },
  { archivo: `${ID}-1`, w: 1600, h: 1000, css: PANEL_CSS, html: figuraHtml },
  { archivo: `${ID}-2`, w: 900, h: 1950, css: TEL_CSS, html: telefonoHtml, alfa: true },
];

/* ---------------- Render (un solo Chromium) ---------------- */
const pwPath = process.env.PLAYWRIGHT_CORE ?? 'playwright-core';
const { chromium } = await import(pwPath.startsWith('/') ? pathToFileURL(join(pwPath, 'index.mjs')).href : pwPath);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  for (const p of PIEZAS) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${p.css}</style></head><body>${p.html}</body></html>`;
    const htmlPath = join(WORK, `${p.archivo}.html`);
    writeFileSync(htmlPath, html);
    const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = join(WORK, `${p.archivo}.png`);
    await page.screenshot({ path: png, omitBackground: !!p.alfa });
    await page.close();
    const webp = join(OUT, `${p.archivo}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', p.archivo.endsWith('banner') ? '82' : '84', '-m', '6', '-sharp_yuv', ...(p.alfa ? ['-alpha_q', '100'] : []), png, '-o', webp]);
    console.log(`[banners] ${p.archivo}.webp`);
  }
} finally {
  await browser.close();
}
