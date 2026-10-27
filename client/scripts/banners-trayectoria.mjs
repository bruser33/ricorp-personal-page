// SPEC-42 — Banners e imágenes de los hitos de Trayectoria que no tenían foto.
//
// Genera, para cada hito (workana-freelancer, youtube-proyectos-informaticos,
// tuapp-2014-smartcorp, tuapp-2013-r2d2):
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
const SMARTCORP = thumb['-xvpktCH-HE'];

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

// Workana: 10 casillas (proyectos completados) arriba y 13 marcas (calificaciones) abajo.
const motivoWorkana = (() => {
  const casillas = Array.from({ length: 10 }, (_, i) =>
    `<div style="width:120px;height:120px;border-radius:18px;border:2px solid rgba(81,88,252,.55);
      background:rgba(81,88,252,${0.08 + i * 0.025});display:flex;align-items:center;justify-content:center">
      <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg></div>`).join('');
  const marcas = Array.from({ length: 13 }, () =>
    `<svg width="74" height="74" viewBox="0 0 24 24"><path fill="rgba(192,100,159,.55)" d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z"/></svg>`).join('');
  return `<div style="position:absolute;left:0;right:0;top:200px;display:flex;justify-content:center;gap:40px;z-index:2">${casillas}</div>
    <div style="position:absolute;left:0;right:0;top:1000px;display:flex;justify-content:center;gap:52px;z-index:2">${marcas}</div>
    <div style="position:absolute;left:0;right:0;top:1120px;height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)"></div>
    ${VELO}`;
})();

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

// TuApp 2014: escenario del GAM — foco de luz y el reloj de 3 minutos en tres arcos.
const motivoTuapp2014 = `
  <div style="position:absolute;left:50%;top:-200px;width:1500px;height:1700px;transform:translateX(-50%);z-index:1;
    background:conic-gradient(from 165deg at 50% 0%, transparent 0deg, rgba(81,88,252,.22) 12deg, rgba(160,110,230,.16) 30deg, transparent 42deg);"></div>
  <svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    ${[0, 1, 2].map((k) => {
      const r = 600, cx = 1200, cy = 640, a0 = -90 + k * 120 + 4, a1 = -90 + (k + 1) * 120 - 4;
      const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
      const [x0, y0] = p(a0), [x1, y1] = p(a1);
      return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="url(#arc)" stroke-width="10" stroke-linecap="round" opacity="${0.75 - k * 0.15}"/>`;
    }).join('')}
    ${Array.from({ length: 60 }, (_, i) => {
      const a = (i * 6 - 90) * Math.PI / 180, r1 = 640, r2 = i % 5 ? 656 : 676;
      return `<line x1="${1200 + r1 * Math.cos(a)}" y1="${640 + r1 * Math.sin(a)}" x2="${1200 + r2 * Math.cos(a)}" y2="${640 + r2 * Math.sin(a)}" stroke="rgba(255,255,255,${i % 5 ? .14 : .32})" stroke-width="3"/>`;
    }).join('')}
    <defs><linearGradient id="arc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
  </svg>
  ${VELO}`;

// TuApp 2013: la primera final — órbita con siete puntos (los siete ejecutivos
// invitados) alrededor del escenario, y la grilla de puntos del "pitch".
const motivoTuapp2013 = `
  <div style="position:absolute;inset:0;z-index:1;opacity:.55;
    background-image:radial-gradient(rgba(255,255,255,.22) 2px, transparent 2.6px);background-size:56px 56px;
    -webkit-mask-image:radial-gradient(70% 70% at 50% 50%, #000 30%, transparent 85%)"></div>
  <svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    <ellipse cx="1200" cy="625" rx="1020" ry="520" stroke="rgba(255,255,255,.12)" stroke-width="2.5"/>
    <ellipse cx="1200" cy="625" rx="880" ry="440" stroke="rgba(81,88,252,.35)" stroke-width="2.5" stroke-dasharray="4 18" stroke-linecap="round"/>
    ${Array.from({ length: 7 }, (_, i) => {
      const a = (-160 + i * (140 / 6)) * Math.PI / 180;
      return `<circle cx="${1200 + 1020 * Math.cos(a)}" cy="${625 + 520 * Math.sin(a)}" r="16" fill="url(#o)"/>`;
    }).join('')}
    <defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
  </svg>
  ${VELO}`;

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
  /* ===================== Workana ===================== */
  {
    archivo: 'workana-freelancer-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoWorkana, marca: 'WORKANA',
      kicker: 'Freelancer en Workana',
      titular: '<span class="grad">11</span> años',
      meta: '<b>10</b> proyectos completados<span class="sep"></span><b>13</b> calificaciones de clientes',
    }),
  },
  {
    archivo: 'workana-freelancer-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div style="position:absolute;inset:90px 100px;display:flex;flex-direction:column;justify-content:center;gap:46px">
      <p class="lbl">Mi ficha de freelancer</p>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px">
        ${[['11', 'años en Workana'], ['10', 'proyectos completados'], ['13', 'calificaciones']].map(([n, t]) =>
          `<div class="card" style="padding:34px 36px"><div class="grad" style="font-size:120px;font-weight:700;line-height:1">${n}</div>
          <div style="font-size:34px;color:#c9c9d2;margin-top:10px">${t}</div></div>`).join('')}
      </div>
      <div class="card" style="padding:40px 44px;display:flex;flex-direction:column;gap:30px">
        <p class="lbl">Certificaciones</p>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:40px;font-weight:600"><span>JavaScript Avanzado</span><span class="grad">80%</span></div>
          <div style="height:16px;border-radius:8px;background:rgba(255,255,255,.08);margin-top:16px;overflow:hidden">
            <div style="width:80%;height:100%;border-radius:8px;background:var(--grad)"></div></div>
        </div>
        <div style="display:flex;gap:22px">
          ${['React Native', 'Angular'].map((c) => `<span style="font-size:36px;font-weight:600;padding:16px 30px;border-radius:999px;border:2px solid rgba(81,88,252,.6);background:rgba(81,88,252,.12)">${c}</span>`).join('')}
        </div>
      </div>
    </div><div class="grano"></div>`,
  },
  {
    archivo: 'workana-freelancer-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:48px">
      <p class="lbl">Lo que dicen mis clientes</p>
      ${['Su profesionalismo me inspiró confianza y no me equivoqué; definitivamente lo buscaré para otros proyectos.',
        'Muy buen profesional, cumple en las fechas establecidas y con gran responsabilidad.'].map((q) =>
        `<div style="background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.09);border-radius:44px;padding:52px 48px">
          <div class="grad" style="font-size:150px;font-weight:700;line-height:.6;height:70px">“</div>
          <p style="font-size:52px;line-height:1.28;font-weight:500;color:#f1f1f4">${q}</p>
          <p style="font-size:32px;color:#9d9daa;margin-top:30px;letter-spacing:.04em">— Cliente en Workana</p></div>`).join('')}
      <div style="font-size:34px;color:#c9c9d2;text-align:center;margin-top:10px">Apps Android e iOS · Web · Three.js</div>
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

  /* ===================== TuApp 2014 ===================== */
  {
    archivo: 'tuapp-2014-smartcorp-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoTuapp2014, marca: '10 · 12 · 2014',
      kicker: 'Equipo SmartCorp · Finalistas',
      titular: 'Final <span class="grad">TuApp 2014</span>',
      meta: 'Centro Cultural Gabriela Mistral (GAM)<span class="sep"></span>Santiago',
    }),
  },
  {
    archivo: 'tuapp-2014-smartcorp-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div style="position:absolute;left:90px;top:90px;bottom:90px;width:460px;border-radius:30px;overflow:hidden;
        background:#000 url('${SMARTCORP}') 50% 50%/auto 100% no-repeat;box-shadow:0 30px 60px rgba(0,0,0,.5)">
        <div style="position:absolute;left:0;right:0;bottom:0;padding:90px 34px 30px;background:linear-gradient(transparent,rgba(10,9,13,.92));
          font-size:28px;font-weight:600;letter-spacing:.06em;color:#e6e6ee">Video SmartCorp · nov 2014</div></div>
      <div style="position:absolute;left:640px;right:90px;top:90px;bottom:90px;display:flex;flex-direction:column;justify-content:center;gap:24px">
        <p class="lbl">Del video beta a la final</p>
        ${[['1', 'Video beta', 'Enviamos el video de nuestra app funcionando.'],
           ['2', 'Carta de finalistas', 'La confirmación oficial: SmartCorp a la final.'],
           ['3', 'Final en vivo · 10 dic 2014', 'Tres minutos en el GAM, en nuestro propio smartphone.']].map(([n, t, d], i) =>
          `<div style="display:flex;gap:30px;align-items:flex-start">
            <div style="flex:0 0 78px;height:78px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;
              ${i === 2 ? 'background:var(--grad);color:#fff' : 'border:2px solid rgba(81,88,252,.7);color:#c9cbff'}">${n}</div>
            <div><p style="font-size:44px;font-weight:600;color:#fff;line-height:1.1">${t}</p>
            <p style="font-size:32px;color:#b9b9c6;margin-top:8px;line-height:1.25">${d}</p></div></div>`).join('')}
      </div><div class="grano"></div>`,
  },
  {
    // Miniatura real del "Video SmartCorp" de la playlist (1-nov-2014): la app en el teléfono.
    archivo: 'tuapp-2014-smartcorp-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:0;background:#000 url('${SMARTCORP}') 50% 50%/auto 100% no-repeat"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(transparent,rgba(10,9,13,.94) 55%)"></div>
      <div style="position:absolute;left:64px;right:64px;bottom:110px">
        <p class="lbl" style="color:#c9cbff">YouTube · nov 2014</p>
        <p style="font-size:62px;font-weight:700;color:#fff;margin-top:14px;line-height:1.05">Video<br>SmartCorp</p></div>`),
  },

  /* ===================== TuApp 2013 ===================== */
  {
    archivo: 'tuapp-2013-r2d2-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoTuapp2013, marca: '11 · 12 · 2013',
      kicker: 'Equipo R2D2 · Seleccionados',
      titular: 'Final <span class="grad">TuApp 2013</span>',
      meta: 'Torneo Universitario de Apps<span class="sep"></span>Santiago de Chile',
    }),
  },
  {
    archivo: 'tuapp-2013-r2d2-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<svg style="position:absolute;left:110px;top:150px" width="700" height="700" viewBox="0 0 700 700">
        <circle cx="350" cy="350" r="300" stroke="rgba(255,255,255,.08)" stroke-width="44" fill="none"/>
        <circle cx="350" cy="350" r="300" stroke="url(#t)" stroke-width="44" fill="none" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 300 * 0.75 - 70).toFixed(1)} 9999" transform="rotate(${-90 + 6.7} 350 350)"/>
        <circle cx="350" cy="350" r="300" stroke="rgba(34,216,134,.85)" stroke-width="44" fill="none" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 300 * 0.25 - 70).toFixed(1)} 9999" transform="rotate(${-90 + 270 + 6.7} 350 350)"/>
        <defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
        <text x="350" y="380" text-anchor="middle" font-family="S3" font-size="150" font-weight="700" fill="#fff">3 + 1</text>
        <text x="350" y="450" text-anchor="middle" font-family="S3" font-size="40" font-weight="600" letter-spacing="8" fill="#9d9daa">MINUTOS</text>
      </svg>
      <div style="position:absolute;left:900px;right:90px;top:90px;bottom:90px;display:flex;flex-direction:column;justify-content:center;gap:44px">
        <p class="lbl">El formato de la final</p>
        <div><p style="font-size:96px;font-weight:700;line-height:1" class="grad">3 min</p>
          <p style="font-size:38px;color:#d6d6de;margin-top:8px">para mostrar la app</p></div>
        <div><p style="font-size:96px;font-weight:700;line-height:1;color:#22D886">1 min</p>
          <p style="font-size:38px;color:#d6d6de;margin-top:8px">para las preguntas del público</p></div>
      </div><div class="grano"></div>`,
  },
  {
    archivo: 'tuapp-2013-r2d2-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <p class="lbl">Evento final</p>
      <p style="font-size:84px;font-weight:700;line-height:1;color:#fff">Torneo<br>Universitario<br><span class="grad">de Apps 2013</span></p>
      ${[['Equipo', 'R2D2'], ['Fecha', '11 de diciembre de 2013'], ['Lugar', 'Santiago de Chile'], ['Presentación', '3 min de app + 1 min de preguntas']].map(([k, v]) =>
        `<div style="border-top:1.5px solid rgba(255,255,255,.1);padding-top:26px">
          <p style="font-size:28px;letter-spacing:.2em;text-transform:uppercase;color:#9d9daa;font-weight:600">${k}</p>
          <p style="font-size:46px;font-weight:600;color:#f1f1f4;margin-top:6px;line-height:1.15">${v}</p></div>`).join('')}
      <div style="margin-top:30px;border-radius:40px;padding:40px 44px;background:linear-gradient(135deg,rgba(81,88,252,.28),rgba(192,100,159,.28));border:1.5px solid rgba(255,255,255,.12)">
        <p style="font-size:40px;line-height:1.25;color:#fff;font-weight:500">En el público: empresarios, profesores y <b>7 ejecutivos de Google USA</b>.</p></div>
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
