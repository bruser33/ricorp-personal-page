// SPEC-44 — TuApp: los certificados REALES como imagen principal.
//
// Reemplaza las portadas tipográficas de SPEC-42 (mismos nombres de archivo, así
// que no hay rutas nuevas en trayectoria.ts):
//   figma-frames/tuapp-2014-smartcorp-banner.webp  2400×1350  carta-certificado 2014 sobre la foto de la final
//   figma-frames/tuapp-2014-smartcorp-1.webp       1600×1000  foto real de la final (GAM, 10-dic-2014)
//   figma-frames/tuapp-2014-smartcorp-2.webp        900×1950  teléfono con los datos de la carta
//   figma-frames/tuapp-2013-r2d2-banner.webp       2400×1350  "Certificado de Finalistas" 2013 (R2D2)
//   figma-frames/tuapp-2013-r2d2-1.webp            1600×1000  programa del evento final 2013
//   figma-frames/tuapp-2013-r2d2-2.webp             900×1950  teléfono con la lista de finalistas (R2D2 marcado)
//
// Fuentes (Gmail personal, bajadas a ~/Downloads; NO se versionan):
//   TuApp_Certificacion_SmartCorp_Rev1.pdf        correo "Certificacion", TuApp.org, 16-dic-2014
//   20141210_092249.jpg                           foto propia de la final 2014 en el GAM (Drive)
//   certificado finalistas TuApp2013 R2D2.pdf     correo "Certificados" (19-sep-2014), PDF del 16-dic-2013
//   programa_final_TuApp-1.pdf                    mismo correo: programa del evento final 2013 (2 páginas)
//
// Privacidad: al certificado 2013 se le recorta el pie (dirección y teléfono de la
// oficina de TuApp.org). Las firmas quedan a su tamaño original o menor, nunca
// ampliadas. Las cartas no traen RUT ni datos de contacto personales.
//
// Zona segura (SPEC-42): banda del post a 1440 con altoBanner 0.6 muestra y≈225–1125
// y el título del post tapa la parte baja; lo que tiene que leerse (cabecera y
// "CERTIFICA…") va entre y≈230 y y≈760. La tarjeta 16:10 recorta 120 px por lado.
//
// Uso (desde client/; requiere pdftoppm, magick y cwebp en el PATH):
//   PLAYWRIGHT_CORE=/ruta/a/node_modules/playwright-core \
//   CHROMIUM=/ruta/a/chrome-headless-shell \
//   TUAPP_SRC=~/Downloads node scripts/banners-tuapp.mjs [carpeta-de-trabajo]
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir, homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/figma-frames');
const WORK = resolve(process.argv[2] ?? join(tmpdir(), 'banners-tuapp'));
const SRC = resolve(process.env.TUAPP_SRC ?? join(homedir(), 'Downloads'));
mkdirSync(WORK, { recursive: true });

/* ---- Rasterizado de los PDFs y recortes ---- */
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const w = (f) => join(WORK, f);
sh('pdftoppm', ['-r', '300', '-png', join(SRC, 'TuApp_Certificacion_SmartCorp_Rev1.pdf'), w('c14')]); // 2550×3300
sh('pdftoppm', ['-r', '300', '-png', join(SRC, 'certificado finalistas TuApp2013 R2D2.pdf'), w('c13')]); // 4267×3200
sh('pdftoppm', ['-r', '300', '-png', join(SRC, 'programa_final_TuApp-1.pdf'), w('prog')]); // 3300×2550 c/u
// 2014: de la cabecera (logo + fecha) a "sólo 24 grupos lograron ser finalistas".
sh('magick', [w('c14-1.png'), '-crop', '2170x1240+190+50', '+repage', w('c14-carta.png')]);
// 2013: sin el pie con dirección y teléfono ni la fila de auspiciadores.
sh('magick', [w('c13-1.png'), '-crop', '4267x2600+0+0', '+repage', w('c13-cert.png')]);
// 2013: "Grupos finalistas 1ª parte" (columna izquierda de la página 2), hasta NTF.
sh('magick', [w('prog-2.png'), '-crop', '1605x2240+20+0', '+repage', w('prog-finalistas.png')]);

const url = (f) => pathToFileURL(f).href;
const C14 = url(w('c14-carta.png'));
const C13 = url(w('c13-cert.png'));
const PROG = url(w('prog-1.png'));
const FIN = url(w('prog-finalistas.png'));
const FOTO = url(join(SRC, '20141210_092249.jpg'));

/* ---- Sistema visual (el mismo de banners-trayectoria.mjs) ---- */
const FUENTE = resolve(homedir(), 'Library/Fonts/SourceSans3-VariableFont.ttf');
const BASE_CSS = `
@font-face { font-family: 'S3'; font-weight: 200 900;
  src: local('Source Sans 3'), url('${url(FUENTE)}') format('truetype'); }
:root { --bg: #121115; --blue: #343cff; --blue-a: #5158fc; --mag: #994a7b;
  --grad: linear-gradient(135deg, #5158fc 0%, #8a5bd8 50%, #c0649f 100%); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: 'S3', 'Source Sans 3', system-ui, sans-serif; color: #e3e3e3;
  background: var(--bg); overflow: hidden; position: relative; -webkit-font-smoothing: antialiased; }
.grad { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lbl { font-size: 26px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #9d9daa; }
.grano { position: absolute; inset: 0; opacity: .05; pointer-events: none; z-index: 50;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.esquina { position: absolute; top: 104px; font-size: 28px; letter-spacing: .3em; color: rgba(255,255,255,.4); font-weight: 600; z-index: 20; }
.glow { position: absolute; border-radius: 50%; filter: blur(140px); opacity: .4; z-index: 2; }
.papel { position: absolute; z-index: 10; border-radius: 10px; overflow: hidden; background: #fff;
  box-shadow: 0 50px 120px rgba(0,0,0,.7), 0 0 0 1.5px rgba(255,255,255,.25); }
.papel img { display: block; width: 100%; }
`;
const PANEL_CSS = `body { background:
  radial-gradient(70% 80% at 0% 0%, rgba(52,60,255,.32), transparent 60%),
  radial-gradient(70% 80% at 100% 100%, rgba(153,74,123,.32), transparent 60%), #141319; }`;
const TEL_CSS = `
html, body { background: transparent; }
.tel { position: absolute; inset: 0; border-radius: 96px; overflow: hidden; background: #141319;
  box-shadow: inset 0 0 0 14px #050507, inset 0 0 0 16px rgba(255,255,255,.12); }
.pantalla { position: absolute; inset: 14px; border-radius: 82px; overflow: hidden;
  background: radial-gradient(90% 50% at 20% 0%, rgba(52,60,255,.35), transparent 70%),
    radial-gradient(90% 50% at 100% 100%, rgba(153,74,123,.35), transparent 70%), #141319; }
.isla { position: absolute; top: 34px; left: 50%; width: 220px; height: 58px; margin-left: -110px; border-radius: 30px; background: #050507; z-index: 20; }
.lbl { font-size: 30px; }
`;
const telefono = (c) => `<div class="tel"><div class="pantalla">${c}</div><div class="isla"></div></div>`;
const glows = `<div class="glow" style="width:1100px;height:900px;left:-260px;top:-300px;background:var(--blue)"></div>
  <div class="glow" style="width:1100px;height:900px;right:-260px;bottom:-340px;background:var(--mag)"></div>`;

const PIEZAS = [
  /* ===================== TuApp 2014 ===================== */
  {
    // La carta-certificado (cabecera + "CERTIFICA la participación del equipo
    // SmartCorp…" + 97 equipos / 24 finalistas) sobre la foto de la final
    // desenfocada y oscurecida.
    archivo: 'tuapp-2014-smartcorp-banner', w: 2400, h: 1350,
    html: `<div style="position:absolute;inset:-60px;background:#000 url('${FOTO}') 50% 50%/cover;
        filter:blur(16px) brightness(.5) saturate(.85)"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,17,21,.55),rgba(18,17,21,.2) 40%,rgba(18,17,21,.75))"></div>
      ${glows}
      <div class="esquina" style="left:250px">RICORP · TRAYECTORIA</div>
      <div class="esquina" style="right:250px">10 · 12 · 2014</div>
      <div class="papel" style="left:500px;top:220px;width:1400px;transform:rotate(-1.2deg)"><img src="${C14}"></div>
      <div class="grano"></div>`,
  },
  {
    // Foto propia de la final: escenario del GAM con los pendones "TuApp 2014".
    archivo: 'tuapp-2014-smartcorp-1', w: 1600, h: 1000,
    html: `<div style="position:absolute;inset:0;background:#000 url('${FOTO}') 50% 50%/cover;filter:brightness(1.12) contrast(1.04)"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(transparent,rgba(10,9,13,.9))"></div>
      <div style="position:absolute;left:70px;right:70px;bottom:56px;display:flex;justify-content:space-between;align-items:flex-end">
        <div><p class="lbl" style="color:#c9cbff">Final internacional · 10 dic 2014</p>
          <p style="font-size:46px;font-weight:700;color:#fff;margin-top:10px;line-height:1.05">Centro Cultural Gabriela Mistral (GAM)</p></div>
        <p class="lbl">Santiago</p></div>
      <div class="grano"></div>`,
  },
  {
    // Los datos de la carta de TuApp.org (16-dic-2014).
    archivo: 'tuapp-2014-smartcorp-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:30px">
      <p class="lbl">Torneo TuApp 2014</p>
      <p style="font-size:76px;font-weight:700;line-height:1;color:#fff">Final<br><span class="grad">internacional</span></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:10px">
        ${[['97', 'equipos inscritos'], ['7', 'países'], ['+30', 'universidades'], ['24', 'finalistas']].map(([n, t], i) =>
          `<div style="border-radius:40px;padding:34px 30px;${i === 3 ? 'background:linear-gradient(135deg,rgba(81,88,252,.35),rgba(192,100,159,.35));border:1.5px solid rgba(255,255,255,.18)' : 'background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.09)'}">
            <div class="${i === 3 ? '' : 'grad'}" style="font-size:104px;font-weight:700;line-height:1;${i === 3 ? 'color:#fff' : ''}">${n}</div>
            <div style="font-size:32px;color:#d6d6de;margin-top:10px">${t}</div></div>`).join('')}
      </div>
      <p style="font-size:29px;line-height:1.3;color:#b9b9c6;white-space:nowrap">México · Colombia · Ecuador · Perú · Bolivia · Argentina · Chile</p>
      <div style="border-top:1.5px solid rgba(255,255,255,.1);padding-top:28px">
        <p style="font-size:44px;font-weight:600;color:#fff;line-height:1.15">SmartCorp, uno de los 24</p>
        <p style="font-size:32px;color:#9d9daa;margin-top:10px;line-height:1.25">Auditorio Gabriela Mistral · Santiago · 10 dic 2014</p></div>
    </div>`),
  },

  /* ===================== TuApp 2013 ===================== */
  {
    // "Certificado de Finalistas" 2013 del equipo R2D2, sin el pie de contacto.
    archivo: 'tuapp-2013-r2d2-banner', w: 2400, h: 1350,
    html: `<div style="position:absolute;inset:-80px;background:#000 url('${C13}') 50% 30%/cover;
        filter:blur(26px) brightness(.32) saturate(.9)"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(70% 70% at 50% 45%,rgba(18,17,21,.2),rgba(18,17,21,.85))"></div>
      ${glows}
      <div class="esquina" style="left:250px">RICORP · TRAYECTORIA</div>
      <div class="esquina" style="right:250px">11 · 12 · 2013</div>
      <div class="papel" style="left:440px;top:215px;width:1520px;transform:rotate(1deg)"><img src="${C13}"></div>
      <div class="grano"></div>`,
  },
  {
    // Programa del evento final 2013 (página 1 del PDF).
    archivo: 'tuapp-2013-r2d2-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div class="papel" style="left:70px;top:70px;width:1112px;border-radius:16px"><img src="${PROG}"></div>
      <div style="position:absolute;left:1240px;right:60px;top:70px;bottom:70px;display:flex;flex-direction:column;justify-content:center;gap:40px">
        <p class="lbl">Evento final</p>
        ${[['11 dic', '2013'], ['28', 'equipos finalistas'], ['3 + 1', 'minutos por equipo']].map(([n, t]) =>
          `<div><p class="grad" style="font-size:78px;font-weight:700;line-height:1">${n}</p>
          <p style="font-size:30px;color:#d6d6de;margin-top:8px;line-height:1.2">${t}</p></div>`).join('')}
        <p style="font-size:28px;color:#9d9daa;line-height:1.3">Auditorio SOFOFA<br>Santiago de Chile</p>
      </div><div class="grano"></div>`,
  },
  {
    // Lista oficial de finalistas (1ª parte) con la fila de R2D2 marcada.
    archivo: 'tuapp-2013-r2d2-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 44px 90px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <p class="lbl" style="padding-left:20px">Final TuApp 2013</p>
      <div class="papel" style="position:relative;border-radius:34px">
        <img src="${FIN}">
        <div style="position:absolute;left:1%;right:1%;top:${((625 / 2240) * 100).toFixed(2)}%;height:${((120 / 2240) * 100).toFixed(2)}%;
          border-radius:14px;border:5px solid #5158fc;box-shadow:0 0 0 6px rgba(192,100,159,.35)"></div>
      </div>
      <div style="padding:0 20px">
        <p style="font-size:60px;font-weight:700;color:#fff;line-height:1.05">Equipo <span class="grad">R2D2</span></p>
        <p style="font-size:33px;color:#b9b9c6;margin-top:12px;line-height:1.3">Universidad Francisco de Paula Santander · Colombia</p></div>
    </div>`),
  },
];

/* ---------------- Render (un solo Chromium) ---------------- */
const pwPath = process.env.PLAYWRIGHT_CORE ?? 'playwright-core';
const { chromium } = await import(pwPath.startsWith('/') ? pathToFileURL(join(pwPath, 'index.mjs')).href : pwPath);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const solo = process.env.SOLO;
for (const p of PIEZAS) {
  if (solo && !p.archivo.includes(solo)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${p.css ?? ''}</style></head><body>${p.html}</body></html>`;
  const htmlPath = w(`${p.archivo}.html`);
  writeFileSync(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = w(`${p.archivo}.png`);
  await page.screenshot({ path: png, omitBackground: !!p.alfa });
  await page.close();
  const webp = join(OUT, `${p.archivo}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-sharp_yuv', ...(p.alfa ? ['-alpha_q', '100'] : []), png, '-o', webp]);
  console.log(`[tuapp] ${p.archivo}.webp`);
}
await browser.close();
