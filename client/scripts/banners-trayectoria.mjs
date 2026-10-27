// SPEC-42 — Banners e imágenes de los hitos de Trayectoria que no tenían foto.
//
// Genera, para cada hito (youtube-proyectos-informaticos; Workana se rehízo en
// SPEC-45 como "credencial": archivos workana-credencial-{banner,ficha,devskiller}.webp;
// los dos TuApp pasaron en SPEC-44 a scripts/banners-tuapp.mjs, con los certificados reales):
//   figma-frames/<id>-banner.webp  2400×1350 · tarjeta de la grilla + banda del post
//   figma-frames/<id>-1.webp       1600×1000 · figura horizontal del cuerpo del post
//   figma-frames/<id>-2.webp        900×1950 · "teléfono" vertical del cuerpo del post
//
// Composición tipográfica en HTML (paleta y fuente del sitio) capturada con un
// Chromium headless PROPIO (no el Playwright MCP) y exportada a webp con cwebp.
// Todos los datos salen de la descripción del hito en src/data/trayectoria.ts; las
// miniaturas son de la playlist propia de Pedro en YouTube (i.ytimg.com).
//
// Zona segura del banner (todo el TEXTO vive ahí):
//   - banda del post a 1440–1920 px de ancho y 40vh muestra solo el ~40% central
//     del alto (y 405–945 a 1920) y el título del post, en dos líneas, tapa desde
//     y≈760–780 hacia abajo, así que el texto va entre y≈420 y y≈750;
//   - en móvil la banda es casi cuadrada y recorta los costados (a 390 px solo
//     se ve x 420–1980): el texto va centrado dentro de ese ancho;
//   - la tarjeta (16:10) recorta 120 px por lado: las marcas de esquina van a 250 px.
//   Fuera de esa franja solo hay motivo gráfico (miniaturas, marcas, glows).
//
// Uso (desde client/):
//   PLAYWRIGHT_CORE=/ruta/a/node_modules/playwright-core \
//   CHROMIUM=/ruta/a/chrome-headless-shell \
//   node scripts/banners-trayectoria.mjs [carpeta-de-trabajo]
// Requiere cwebp en el PATH. La fuente Source Sans 3 se toma instalada (local())
// o de Google Fonts.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/figma-frames');
const WORK = resolve(process.argv[2] ?? join(tmpdir(), 'banners-trayectoria'));
const THUMBS = join(WORK, 'thumbs');
mkdirSync(THUMBS, { recursive: true });

/* ---- Material propio: la playlist "Proyectos Informaticos" (11 videos) ---- */
const PLAYLIST = [
  ['I8gpO6U7JJg', 'Portal Cargo Ex React - AWS - Node'],
  ['APFCdFAmQ6o', 'App Cargo Ex última milla Android Studio - AWS - Node'],
  ['1Oq8jxT7OgE', 'Proyecto de tesis Unity 3D: Invasión UFPS'],
  ['4gros8lIYQY', 'Eventus 24'],
  ['z4M04sbj8TI', 'Vendifood página web'],
  ['CSVKVoo6Q9k', 'Vendifood aplicación móvil'],
  ['Le9d4FAm-Mc', 'Aplicación trackeo vehicular'],
  ['pBXnT9JW-Ww', 'App móvil Hambai POS'],
  ['J9xcuW9pevY', 'Análisis contable MRCI'],
  ['-xvpktCH-HE', 'Video SmartCorp'],
  ['jbKe_cZcNPE', 'Proyecto Unity 3D: Demo Monopoly'],
];

async function bajarMiniatura(id) {
  const destino = join(THUMBS, `v_${id}.jpg`);
  if (existsSync(destino)) return destino;
  for (const calidad of ['maxresdefault', 'hqdefault']) {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/${calidad}.jpg`);
    if (r.ok) {
      writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      return destino;
    }
  }
  throw new Error(`sin miniatura para ${id}`);
}

const thumb = {};
for (const [id] of PLAYLIST) thumb[id] = pathToFileURL(await bajarMiniatura(id)).href;

/* ---- Sistema visual común ---- */
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
/* Grano sutil para que los degradados no hagan bandas en webp. */
.grano { position: absolute; inset: 0; opacity: .06; pointer-events: none; z-index: 50;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
`;

/* Banner: mismo andamiaje para los cuatro (grilla, márgenes, franja de texto). */
const BANNER_CSS = `
.glow { position: absolute; border-radius: 50%; filter: blur(140px); opacity: .55; }
.marco { position: absolute; inset: 64px; border: 1.5px solid rgba(255,255,255,.07); border-radius: 6px; }
.esquina { position: absolute; font-size: 28px; letter-spacing: .3em; color: rgba(255,255,255,.28); font-weight: 600; }
.centro { position: absolute; left: 420px; right: 420px; top: 392px; height: 390px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 22px; z-index: 10; }
.titular { font-size: 188px; font-weight: 700; line-height: .92; letter-spacing: -0.025em; color: #fff; white-space: nowrap; }
`;

function banner({ fondo = '', titular, kicker, meta, marca }) {
  return `<div class="glow" style="width:1100px;height:900px;left:-200px;top:-260px;background:var(--blue)"></div>
  <div class="glow" style="width:1100px;height:900px;right:-240px;bottom:-320px;background:var(--mag)"></div>
  ${fondo}
  <div class="marco"></div>
  <div class="esquina" style="left:250px;top:104px">RICORP · TRAYECTORIA</div>
  <div class="esquina" style="right:250px;top:104px">${marca}</div>
  <div class="centro">
    <p class="kicker">${kicker}</p>
    <h1 class="titular">${titular}</h1>
    <p class="meta">${meta}</p>
  </div>
  <div class="grano"></div>`;
}

/* Velo que oscurece el centro: el texto queda limpio sobre cualquier motivo. */
const VELO = `<div style="position:absolute;inset:0;z-index:5;background:
  radial-gradient(52% 40% at 50% 46%, rgba(18,17,21,.92) 0%, rgba(18,17,21,.78) 55%, rgba(18,17,21,0) 100%)"></div>`;

/* ---------------- Motivos de cada banner ---------------- */

// Workana (SPEC-45): credencial — cinta y ojal arriba, los dos anillos DevSkiller
// a los costados (fuera de la franja de texto) y una trama de puntos de fondo.
const CRED_CSS = `
.chip { font-size: 32px; font-weight: 600; padding: 14px 28px; border-radius: 999px;
  border: 2px solid rgba(81,88,252,.6); background: rgba(81,88,252,.12); color: #fff; }
`;
function anillo(pct, texto, d) {
  const r = d / 2 - 16, c = 2 * Math.PI * r;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:16px">
    <svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
      <circle cx="${d / 2}" cy="${d / 2}" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="22" fill="none"/>
      <circle cx="${d / 2}" cy="${d / 2}" r="${r}" stroke="url(#an${pct})" stroke-width="22" fill="none" stroke-linecap="round"
        stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${d / 2} ${d / 2})"/>
      <defs><linearGradient id="an${pct}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
      <text x="${d / 2}" y="${d / 2 + d * 0.1}" text-anchor="middle" font-family="S3" font-size="${Math.round(d * 0.3)}" font-weight="700" fill="#fff">${pct}%</text>
    </svg>${texto ? `<p style="font-size:34px;font-weight:600;color:#e3e3e3">${texto}</p>` : ''}</div>`;
}
const motivoCredencial = `
  <div style="position:absolute;inset:0;z-index:1;opacity:.5;
    background-image:radial-gradient(rgba(255,255,255,.2) 2px, transparent 2.6px);background-size:48px 48px;
    -webkit-mask-image:radial-gradient(75% 75% at 50% 50%, #000 25%, transparent 85%)"></div>
  <div style="position:absolute;left:50%;top:-40px;width:150px;height:300px;margin-left:-75px;z-index:2;
    background:linear-gradient(180deg,rgba(81,88,252,.0),rgba(81,88,252,.55));border-radius:0 0 18px 18px"></div>
  <div style="position:absolute;left:50%;top:230px;width:220px;height:40px;margin-left:-110px;z-index:3;border-radius:20px;
    background:#121115;box-shadow:0 0 0 3px rgba(255,255,255,.18)"></div>
  <div style="position:absolute;left:330px;right:330px;top:200px;bottom:120px;z-index:2;border-radius:60px;
    border:2.5px solid rgba(255,255,255,.12);background:linear-gradient(160deg,rgba(81,88,252,.10),rgba(192,100,159,.08))"></div>
  <div style="position:absolute;left:0;top:500px;z-index:2;opacity:.8;transform:translateX(-30px)">${anillo(89, '', 320)}</div>
  <div style="position:absolute;right:0;top:500px;z-index:2;opacity:.8;transform:translateX(30px)">${anillo(85, '', 320)}</div>
  ${'<div style="position:absolute;left:0;right:0;top:1000px;display:flex;justify-content:center;gap:40px;z-index:3">' +
    Array.from({ length: 10 }, (_, i) => `<div style="width:56px;height:56px;border-radius:14px;border:2px solid rgba(81,88,252,.55);background:rgba(81,88,252,${0.1 + i * 0.03})"></div>`).join('') + '</div>'}
  ${VELO}`;

// YouTube: muro de las 11 miniaturas de la playlist, en perspectiva y apagado.
const motivoYoutube = (() => {
  const orden = [...PLAYLIST, ...PLAYLIST].slice(0, 20);
  const tiles = orden.map(([id], i) =>
    `<div style="aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000 url('${thumb[id]}') center/cover;
      opacity:${0.5 + (i % 3) * 0.12};filter:saturate(.7)"></div>`).join('');
  return `<div style="position:absolute;inset:-120px -160px;display:grid;grid-template-columns:repeat(5,1fr);gap:34px;
      transform:rotate(-6deg);z-index:1">${tiles}</div>
    <div style="position:absolute;inset:0;z-index:2;background:rgba(18,17,21,.45)"></div>
    <div style="position:absolute;inset:0;z-index:5;background:
      radial-gradient(48% 42% at 50% 46%, rgba(18,17,21,.96) 0%, rgba(18,17,21,.86) 50%, rgba(18,17,21,.2) 100%)"></div>
    <svg style="position:absolute;left:1120px;top:270px;z-index:6" width="160" height="112" viewBox="0 0 160 112">
      <rect width="160" height="112" rx="30" fill="url(#g)"/><path d="M64 34l42 22-42 22z" fill="#fff"/>
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs></svg>`;
})();

/* ---------------- Figuras (16:10) y teléfonos (vertical) ---------------- */
const PANEL_CSS = `
body { background:
  radial-gradient(70% 80% at 0% 0%, rgba(52,60,255,.32), transparent 60%),
  radial-gradient(70% 80% at 100% 100%, rgba(153,74,123,.32), transparent 60%), #141319; }
.lbl { font-size: 26px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #9d9daa; }
.card { background: rgba(255,255,255,.045); border: 1.5px solid rgba(255,255,255,.08); border-radius: 26px; }
`;
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
const telefono = (contenido) => `<div class="tel"><div class="pantalla">${contenido}</div><div class="isla"></div></div>`;

const PIEZAS = [
  /* ===================== Workana (SPEC-45) ===================== */
  // Ficha/credencial propia: datos del hito (11 años, 10 proyectos, 13
  // calificaciones, certificaciones de la plataforma) + los dos tests DevSkiller
  // del CV 2026 (React.js 89%, Angular 9 85%), rendidos por invitación de Workana.
  {
    archivo: 'workana-credencial-banner', w: 2400, h: 1350, css: BANNER_CSS + CRED_CSS,
    html: banner({
      fondo: motivoCredencial, marca: 'WORKANA · DEVSKILLER',
      kicker: 'Freelancer en Workana · 11 años',
      titular: '<span class="grad">10</span> proyectos',
      meta: '<b>13</b> calificaciones<span class="sep"></span>React.js <b>89%</b><span class="sep"></span>Angular 9 <b>85%</b>',
    }),
  },
  {
    archivo: 'workana-credencial-ficha', w: 1600, h: 1000, css: PANEL_CSS + CRED_CSS,
    html: `<div class="card" style="position:absolute;left:90px;top:130px;bottom:130px;width:600px;padding:0;overflow:hidden">
        <div style="height:150px;background:var(--grad);position:relative">
          <div style="position:absolute;left:50%;top:34px;width:120px;height:22px;margin-left:-60px;border-radius:11px;background:rgba(18,17,21,.55)"></div></div>
        <div style="padding:40px 50px;display:flex;flex-direction:column;gap:26px">
          <p class="lbl">Ficha · Workana</p>
          <p style="font-size:64px;font-weight:700;line-height:1;color:#fff">Pedro Rico</p>
          <p style="font-size:32px;color:#c9c9d2;margin-top:-10px">Apps Android e iOS · Web · Three.js</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:10px;border-top:1.5px solid rgba(255,255,255,.1);padding-top:30px">
            ${[['11', 'años'], ['10', 'proyectos completados'], ['13', 'calificaciones']].map(([n, t]) =>
              `<div><div class="grad" style="font-size:84px;font-weight:700;line-height:1">${n}</div>
              <div style="font-size:26px;color:#b9b9c6;margin-top:8px;line-height:1.15">${t}</div></div>`).join('')}
          </div>
        </div>
      </div>
      <div style="position:absolute;left:760px;right:90px;top:130px;bottom:130px;display:flex;flex-direction:column;gap:30px">
        <div class="card" style="flex:1;padding:38px 44px;display:flex;flex-direction:column;gap:20px">
          <p class="lbl">Tests DevSkiller</p>
          <div style="display:flex;justify-content:space-around;align-items:center;flex:1">
            ${anillo(89, 'React.js', 196)}${anillo(85, 'Angular 9', 196)}
          </div>
        </div>
        <div class="card" style="padding:34px 44px;display:flex;flex-direction:column;gap:22px">
          <p class="lbl">Certificaciones Workana</p>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${['JavaScript Avanzado · 80%', 'React Native', 'Angular'].map((c) => `<span class="chip">${c}</span>`).join('')}
          </div>
        </div>
      </div><div class="grano"></div>`,
  },
  {
    archivo: 'workana-credencial-devskiller', w: 900, h: 1950, css: TEL_CSS + CRED_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 60px 90px;display:flex;flex-direction:column;justify-content:center;gap:40px">
      <p class="lbl">Certificados DevSkiller</p>
      <p style="font-size:44px;line-height:1.2;color:#d6d6de;margin-top:-16px">Tests técnicos que llegaron por invitación de Workana.</p>
      ${[[89, 'React.js'], [85, 'Angular 9']].map(([p, t]) =>
        `<div style="background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.09);border-radius:44px;padding:44px 40px;display:flex;align-items:center;gap:40px">
          ${anillo(p, '', 250)}
          <div><p style="font-size:62px;font-weight:700;color:#fff;line-height:1">${t}</p>
          <p style="font-size:32px;color:#9d9daa;margin-top:14px;letter-spacing:.04em">Puntaje ${p}%</p></div></div>`).join('')}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-top:1.5px solid rgba(255,255,255,.1);padding-top:40px;text-align:center">
        ${[['11', 'años en Workana'], ['10', 'proyectos'], ['13', 'calificaciones']].map(([n, t]) =>
          `<div><div class="grad" style="font-size:96px;font-weight:700;line-height:1">${n}</div>
          <div style="font-size:30px;color:#b9b9c6;margin-top:10px;line-height:1.15">${t}</div></div>`).join('')}
      </div>
    </div>`),
  },

  /* ===================== YouTube ===================== */
  {
    archivo: 'youtube-proyectos-informaticos-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoYoutube, marca: 'YOUTUBE · PLAYLIST',
      kicker: 'Mis entregas, en video',
      titular: '<span style="font-size:150px">Proyectos <span class="grad">Informáticos</span></span>',
      meta: '<b>11</b> videos<span class="sep"></span>apps, web, AWS y Unity 3D',
    }),
  },
  {
    archivo: 'youtube-proyectos-informaticos-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div style="position:absolute;inset:64px 70px;display:flex;flex-direction:column;gap:30px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <p class="lbl">Playlist · Proyectos Informaticos</p><p class="lbl" style="color:#c0649f">11 videos</p></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px 22px">
        ${PLAYLIST.map(([id, t]) => `<div>
          <div style="aspect-ratio:16/9;border-radius:14px;background:#000 url('${thumb[id]}') center/cover;border:1.5px solid rgba(255,255,255,.08)"></div>
          <p style="font-size:21px;line-height:1.2;margin-top:10px;color:#dcdce3;font-weight:500;height:50px;overflow:hidden">${t}</p></div>`).join('')}
        <div style="aspect-ratio:16/9;border-radius:14px;display:flex;align-items:center;justify-content:center;
          background:var(--grad);font-size:34px;font-weight:700;color:#fff">▶ Ver todo</div>
      </div>
    </div><div class="grano"></div>`,
  },
  {
    archivo: 'youtube-proyectos-informaticos-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:140px 48px 60px;display:flex;flex-direction:column;gap:26px">
      <p class="lbl">Proyectos Informaticos</p>
      <p style="font-size:30px;color:#9d9daa;margin-top:-14px">11 videos</p>
      ${PLAYLIST.slice(0, 8).map(([id, t]) => `<div style="display:flex;gap:26px;align-items:center">
        <div style="flex:0 0 300px;aspect-ratio:16/9;border-radius:16px;background:#000 url('${thumb[id]}') center/cover"></div>
        <p style="font-size:33px;line-height:1.2;font-weight:500;color:#ececf1">${t}</p></div>`).join('')}
    </div>`),
  },

];

/* ---------------- Render ---------------- */
const pwPath = process.env.PLAYWRIGHT_CORE ?? 'playwright-core';
const { chromium } = await import(pwPath.startsWith('/') ? pathToFileURL(join(pwPath, 'index.mjs')).href : pwPath);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const solo = process.env.SOLO; // p.ej. SOLO=workana para iterar sobre una pieza

for (const p of PIEZAS) {
  if (solo && !p.archivo.includes(solo)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700&display=block" rel="stylesheet">
    <style>${BASE_CSS}${p.css}</style></head><body>${p.html}</body></html>`;
  const htmlPath = join(WORK, `${p.archivo}.html`);
  writeFileSync(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const png = join(WORK, `${p.archivo}.png`);
  await page.screenshot({ path: png, omitBackground: !!p.alfa });
  await page.close();
  const webp = join(OUT, `${p.archivo}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', p.archivo.endsWith('banner') ? '82' : '84', '-m', '6', '-sharp_yuv', ...(p.alfa ? ['-alpha_q', '100'] : []), png, '-o', webp]);
  console.log(`[banners] ${p.archivo}.webp`);
}
await browser.close();
