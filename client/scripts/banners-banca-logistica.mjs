// SPEC-46 — Banners y mockups de los hitos de banca y logística de Trayectoria.
//
// Genera, para cada hito (cargo-ex-logistica, banco-security-pagos,
// banco-de-chile-3it), igual que scripts/banners-trayectoria.mjs (SPEC-42):
//   figma-frames/<id>-banner.webp  2400×1350 · tarjeta de la grilla + banda del post
//   figma-frames/<id>-1.webp       1600×1000 · figura horizontal del cuerpo del post
//   figma-frames/<id>-2.webp        900×1950 · "teléfono" vertical del cuerpo del post
//
// El motivo de cada banner es el LOGO OFICIAL de la empresa, sin alterar,
// descargado de su sitio público el 2026-10-27 y guardado en scripts/logos-empresas/:
//   cargo-ex.svg                 https://www.cargoex.cl/wp-content/themes/cargoex-theme-v1-0/core/images/svg/CargoEx-Logo.svg
//   banco-security.svg           SVG del encabezado de https://personas.bancosecurity.cl/ (el <img> del sitio es un PNG de 57×50)
//   banco-de-chile-inverse.svg   https://assets.bancochile.cl/uploads/000/033/323/d9ed6331-33ac-42d7-946d-f526194fc5a3/original/bch-inverse.svg
// El de Cargo Ex es azul marino sobre transparente: va sobre una placa blanca para
// que se lea en el fondo oscuro. El de Banco de Chile es su versión "inverse"
// (blanca) oficial, pensada para fondos oscuros.
//
// Datos: CV 2026 (extendido y normal), docs "Cargo Ex", "Banco Security" y "Manual
// de usuario cargoex" del Drive personal. Nada de nombres de personas ni montos.
//
// Zona segura: la misma de SPEC-42 (texto y logo entre y≈420 y y≈750, centrado en
// x 420–1980; marcas de esquina a 250 px).
//
// Uso (desde client/):
//   PLAYWRIGHT_CORE=/ruta/a/node_modules/playwright-core \
//   CHROMIUM=/ruta/a/chrome-headless-shell \
//   node scripts/banners-banca-logistica.mjs [carpeta-de-trabajo]
// Requiere cwebp en el PATH. SOLO=<texto> genera solo las piezas que lo contengan.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/figma-frames');
const WORK = resolve(process.argv[2] ?? join(tmpdir(), 'banners-banca-logistica'));
mkdirSync(WORK, { recursive: true });

const logo = (f) => pathToFileURL(resolve(import.meta.dirname, 'logos-empresas', f)).href;
const LOGO_CARGOEX = logo('cargo-ex.svg');
const LOGO_SECURITY = logo('banco-security.svg');
const LOGO_BCH = logo('banco-de-chile-inverse.svg');

/* ---- Sistema visual común (copiado de banners-trayectoria.mjs) ---- */
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

const BANNER_CSS = `
.glow { position: absolute; border-radius: 50%; filter: blur(140px); opacity: .55; }
.marco { position: absolute; inset: 64px; border: 1.5px solid rgba(255,255,255,.07); border-radius: 6px; }
.esquina { position: absolute; font-size: 28px; letter-spacing: .3em; color: rgba(255,255,255,.28); font-weight: 600; }
.centro { position: absolute; left: 420px; right: 420px; top: 400px; height: 380px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 34px; z-index: 10; }
`;

/* Banner: el logo ocupa el lugar del titular. */
function banner({ fondo = '', logoHtml, kicker, meta, marca, glowA = 'var(--blue)', glowB = 'var(--mag)' }) {
  return `<div class="glow" style="width:1100px;height:900px;left:-200px;top:-260px;background:${glowA}"></div>
  <div class="glow" style="width:1100px;height:900px;right:-240px;bottom:-320px;background:${glowB}"></div>
  ${fondo}
  <div class="marco"></div>
  <div class="esquina" style="left:250px;top:104px">RICORP · TRAYECTORIA</div>
  <div class="esquina" style="right:250px;top:104px">${marca}</div>
  <div class="centro">
    <p class="kicker">${kicker}</p>
    ${logoHtml}
    <p class="meta">${meta}</p>
  </div>
  <div class="grano"></div>`;
}

const VELO = `<div style="position:absolute;inset:0;z-index:5;background:
  radial-gradient(52% 40% at 50% 46%, rgba(18,17,21,.92) 0%, rgba(18,17,21,.78) 55%, rgba(18,17,21,0) 100%)"></div>`;
const DEF_GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>`;

/* ---------------- Motivos ---------------- */

// Cargo Ex: la ruta del envío de punta a punta — portal, etiqueta, bodega,
// aeropuerto, regiones y última milla — como un recorrido punteado con 6 paradas.
const PARADAS = [[250, 1080], [640, 960], [1000, 1120], [1400, 990], [1780, 1110], [2150, 960]];
const motivoCargo = `
  <svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    <path d="M${PARADAS.map(([x, y]) => `${x} ${y}`).join(' L')}" stroke="url(#g)" stroke-width="6" stroke-dasharray="2 22" stroke-linecap="round" opacity=".9"/>
    ${PARADAS.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === PARADAS.length - 1 ? 26 : 18}" fill="${i === PARADAS.length - 1 ? 'url(#g)' : '#1b1a22'}" stroke="rgba(255,255,255,.35)" stroke-width="3"/>`).join('')}
    ${[[330, 230, 0], [560, 300, 1], [1840, 240, 0], [2060, 320, 1], [1980, 170, 1]].map(([x, y, k]) =>
      `<rect x="${x}" y="${y}" width="${k ? 90 : 120}" height="${k ? 70 : 90}" rx="8" stroke="rgba(255,255,255,.16)" stroke-width="3"/>
       <path d="M${x} ${y + (k ? 22 : 28)} H${x + (k ? 90 : 120)}" stroke="rgba(255,255,255,.12)" stroke-width="3"/>`).join('')}
    ${DEF_GRAD}
  </svg>
  ${VELO}`;

// Banco Security: integración uno a uno — un nodo central (el botón de pago)
// unido por rayos a un anillo de bancos, cada uno con su propia conexión.
const motivoSecurity = (() => {
  const n = 16, cx = 1200, cy = 610, rx = 1000, ry = 520;
  const nodos = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  return `<svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="rgba(255,255,255,.08)" stroke-width="2.5"/>
    ${nodos.map(([x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(138,91,216,.28)" stroke-width="2.5" stroke-dasharray="3 14" stroke-linecap="round"/>`).join('')}
    ${nodos.map(([x, y]) => `<rect x="${x - 26}" y="${y - 26}" width="52" height="52" rx="12" fill="#1b1a22" stroke="url(#g)" stroke-width="3"/>
      <path d="M${x - 12} ${y + 1}l8 8 16-17" stroke="rgba(255,255,255,.7)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    ${DEF_GRAD}
  </svg>
  ${VELO}`;
})();

// Banco de Chile: las tres versiones de Java como cifras gigantes y apagadas,
// y abajo una línea continua de servicio que nunca se corta.
const motivoBch = `
  <div style="position:absolute;inset:0;z-index:1;display:flex;justify-content:space-between;align-items:center;padding:0 150px;
    font-size:900px;font-weight:800;line-height:1;letter-spacing:-.04em;color:rgba(255,255,255,.035)">
    <span>8</span><span>9</span><span>11</span></div>
  <svg style="position:absolute;left:0;top:0;z-index:2" width="2400" height="1350" viewBox="0 0 2400 1350" fill="none">
    <!-- Línea horizontal: su caja no tiene alto, así que el degradado va en userSpaceOnUse. -->
    <defs><linearGradient id="h" gradientUnits="userSpaceOnUse" x1="140" y1="0" x2="2260" y2="0"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
    <path d="M140 1110 H2260" stroke="url(#h)" stroke-width="6" stroke-linecap="round" opacity=".85"/>
    ${Array.from({ length: 54 }, (_, i) => `<line x1="${180 + i * 38}" y1="${1090}" x2="${180 + i * 38}" y2="${i % 6 ? 1100 : 1080}" stroke="rgba(255,255,255,${i % 6 ? .12 : .3})" stroke-width="3"/>`).join('')}
    ${[620, 1200, 1780].map((x) => `<circle cx="${x}" cy="1110" r="16" fill="#121115" stroke="url(#g)" stroke-width="5"/>`).join('')}
    ${DEF_GRAD}
  </svg>
  ${VELO}`;

/* ---------------- Figuras (16:10) y teléfonos (vertical) ---------------- */
const PANEL_CSS = `
body { background:
  radial-gradient(70% 80% at 0% 0%, rgba(52,60,255,.32), transparent 60%),
  radial-gradient(70% 80% at 100% 100%, rgba(153,74,123,.32), transparent 60%), #141319; }
.lbl { font-size: 26px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #9d9daa; }
.card { background: rgba(255,255,255,.045); border: 1.5px solid rgba(255,255,255,.08); border-radius: 26px; }
.chip { font-size: 28px; font-weight: 600; padding: 12px 26px; border-radius: 999px; border: 2px solid rgba(81,88,252,.6); background: rgba(81,88,252,.12); color: #e9e9f0; white-space: nowrap; }
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

const ICONOS = {
  portal: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  etiqueta: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
  bodega: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-7h10v7M7 17h10"/>',
  avion: '<path d="M2 16l20-6-20-6 4 6-4 6z"/><path d="M6 10h8"/>',
  region: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  entrega: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 12l2 2 4-4"/>',
};
const icono = (k, size = 54, color = 'rgba(255,255,255,.85)') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[k]}</svg>`;

const PIEZAS = [
  /* ===================== Cargo Ex ===================== */
  {
    archivo: 'cargo-ex-logistica-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoCargo, marca: '2017 – 2019',
      glowA: 'var(--blue)', glowB: '#a2342c',
      kicker: 'Logística y última milla',
      logoHtml: `<div style="background:#fff;border-radius:28px;padding:34px 56px;box-shadow:0 30px 80px rgba(0,0,0,.45)">
        <img src="${LOGO_CARGOEX}" style="display:block;width:760px;height:auto" alt=""></div>`,
      meta: 'Del <b>papel</b> a la informática<span class="sep"></span>Full Stack',
    }),
  },
  {
    archivo: 'cargo-ex-logistica-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div style="position:absolute;inset:80px 90px;display:flex;flex-direction:column;justify-content:center;gap:50px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <p class="lbl">El envío, de punta a punta</p><p class="lbl" style="color:#c0649f">Trackeo total</p></div>
      <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px;position:relative">
        <div style="position:absolute;left:7%;right:7%;top:62px;height:3px;background:linear-gradient(90deg,#5158fc,#c0649f);opacity:.6"></div>
        ${[['portal', 'Portal web', 'El cliente informa sus envíos con un Excel'],
           ['etiqueta', 'Etiqueta', 'Cada caja sale etiquetada de su bodega'],
           ['bodega', 'Bodega', 'Se pickea al entrar y al salir'],
           ['avion', 'Aeropuerto', 'Los envíos viajan a regiones'],
           ['region', 'Regiones', 'Los reciben los agentes de cada región'],
           ['entrega', 'Última milla', 'La app informa la entrega']].map(([k, t, d], i) =>
          `<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;position:relative">
            <div style="width:124px;height:124px;border-radius:50%;display:flex;align-items:center;justify-content:center;
              ${i === 5 ? 'background:var(--grad)' : 'background:#1d1c25;border:2px solid rgba(81,88,252,.6)'}">${icono(k, 58, '#fff')}</div>
            <p style="font-size:32px;font-weight:700;color:#fff;line-height:1.05">${t}</p>
            <p style="font-size:23px;color:#b9b9c6;line-height:1.25">${d}</p></div>`).join('')}
      </div>
      <div class="card" style="padding:30px 38px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <span class="lbl" style="margin-right:12px">Hecho con</span>
        ${['React', 'Redux', 'Node.js', 'AWS EC2', 'Lambda', 'API Gateway', 'Android'].map((c) => `<span class="chip">${c}</span>`).join('')}
      </div>
    </div><div class="grano"></div>`,
  },
  {
    // La app de última milla tal como la describe el manual de usuario.
    archivo: 'cargo-ex-logistica-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 60px 90px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <p class="lbl">App de última milla</p>
      <p style="font-size:84px;font-weight:700;line-height:1;color:#fff">Gestión<br><span class="grad">del día</span></p>
      ${[['Entregados', 'Con huella o sin huella', 'linear-gradient(135deg,rgba(81,88,252,.35),rgba(81,88,252,.12))'],
         ['No entregados', 'Motivo y foto del domicilio', 'rgba(255,255,255,.05)'],
         ['Retiros', 'Bultos y cliente a retirar', 'rgba(255,255,255,.05)']].map(([t, d, bg]) =>
        `<div style="border-radius:40px;padding:38px 42px;background:${bg};border:1.5px solid rgba(255,255,255,.1)">
          <p style="font-size:50px;font-weight:700;color:#fff">${t}</p>
          <p style="font-size:32px;color:#b9b9c6;margin-top:6px">${d}</p></div>`).join('')}
      <div style="border-radius:40px;padding:34px 42px;background:rgba(34,216,134,.1);border:1.5px solid rgba(34,216,134,.45);display:flex;gap:26px;align-items:center">
        <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#22D886" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 01-15.5 6.2M3 12A9 9 0 0118.5 5.8"/><path d="M18.5 2v3.8h-3.8M5.5 22v-3.8h3.8"/></svg>
        <div><p style="font-size:42px;font-weight:700;color:#fff">Sincronizado</p>
        <p style="font-size:29px;color:#b9b9c6;margin-top:4px;line-height:1.2">Sin señal se guarda en el teléfono y se envía al volver internet</p></div></div>
    </div>`),
  },

  /* ===================== Banco Security ===================== */
  {
    archivo: 'banco-security-pagos-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoSecurity, marca: '2019 – 2022',
      glowA: '#6A2E92', glowB: '#232272',
      kicker: 'Pagos en línea',
      // viewBox 359×81 con el bloque de color en los primeros 53,86: la caja
      // recorta solo la franja transparente de abajo, el logo queda intacto.
      logoHtml: `<div style="width:1060px;height:${Math.round(1060 * 53.86 / 359)}px;overflow:hidden;border-radius:4px;box-shadow:0 30px 80px rgba(0,0,0,.5)">
        <img src="${LOGO_SECURITY}" style="display:block;width:1060px;height:auto" alt=""></div>`,
      meta: '<b>99%</b> de éxito<span class="sep"></span>los bancos de Chile, uno a uno',
    }),
  },
  {
    archivo: 'banco-security-pagos-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<svg style="position:absolute;left:100px;top:150px" width="640" height="640" viewBox="0 0 640 640">
        <circle cx="320" cy="320" r="270" stroke="rgba(255,255,255,.08)" stroke-width="46" fill="none"/>
        <circle cx="320" cy="320" r="270" stroke="url(#t)" stroke-width="46" fill="none" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 270 * 0.99).toFixed(1)} 9999" transform="rotate(-88 320 320)"/>
        <defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs>
        <text x="320" y="350" text-anchor="middle" font-family="S3" font-size="170" font-weight="700" fill="#fff">99%</text>
        <text x="320" y="420" text-anchor="middle" font-family="S3" font-size="34" font-weight="600" letter-spacing="7" fill="#9d9daa">DE ÉXITO</text>
      </svg>
      <div style="position:absolute;left:830px;right:90px;top:80px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:30px">
        <p class="lbl">Cada banco, uno a uno</p>
        ${[['1', 'API', 'Cada banco con su propia integración.'],
           ['2', 'Credenciales', 'Accesos y ambientes propios de cada banco.'],
           ['3', 'Certificación', 'Su proceso, antes de salir a producción.']].map(([n, t, d], i) =>
          `<div style="display:flex;gap:28px;align-items:flex-start">
            <div style="flex:0 0 72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;
              ${i === 2 ? 'background:var(--grad);color:#fff' : 'border:2px solid rgba(81,88,252,.7);color:#c9cbff'}">${n}</div>
            <div><p style="font-size:42px;font-weight:600;color:#fff;line-height:1.1">${t}</p>
            <p style="font-size:29px;color:#b9b9c6;margin-top:6px;line-height:1.25">${d}</p></div></div>`).join('')}
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">
          ${['Node.js', '.NET', 'Angular', 'Flutter', 'GraphQL', 'AWS'].map((c) => `<span class="chip">${c}</span>`).join('')}
        </div>
      </div><div class="grano"></div>`,
  },
  {
    // El ritmo del sprint en la banca, del doc "Banco Security" del Drive.
    archivo: 'banco-security-pagos-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <p class="lbl">Así es el sprint en la banca</p>
      <p style="font-size:80px;font-weight:700;line-height:1;color:#fff">La calidad<br><span class="grad">no se negocia</span></p>
      ${[['Planning', 'Un día completo para entender cada tarea antes de empezar'],
         ['Todos los días', 'Un pull request o un avance que se pueda ver'],
         ['Puesta en común', 'Un día y medio antes del cierre, para corregir a tiempo']].map(([k, v]) =>
        `<div style="border-top:1.5px solid rgba(255,255,255,.1);padding-top:28px">
          <p style="font-size:30px;letter-spacing:.2em;text-transform:uppercase;color:#c9cbff;font-weight:600">${k}</p>
          <p style="font-size:44px;font-weight:500;color:#f1f1f4;margin-top:8px;line-height:1.2">${v}</p></div>`).join('')}
      <div style="margin-top:20px;border-radius:40px;padding:38px 44px;background:linear-gradient(135deg,rgba(81,88,252,.28),rgba(192,100,159,.28));border:1.5px solid rgba(255,255,255,.12)">
        <p style="font-size:40px;line-height:1.25;color:#fff;font-weight:500">Botón de pago en línea: <b>99%</b> de éxito en las transacciones mensuales.</p></div>
    </div>`),
  },

  /* ===================== Banco de Chile (3IT) ===================== */
  {
    archivo: 'banco-de-chile-3it-banner', w: 2400, h: 1350, css: BANNER_CSS,
    html: banner({
      fondo: motivoBch, marca: '2023 – 2025',
      glowA: '#1f3fbf', glowB: 'var(--mag)',
      kicker: 'Full Stack en 3IT',
      logoHtml: `<img src="${LOGO_BCH}" style="display:block;width:1100px;height:auto" alt="">`,
      meta: 'Java <b>8 → 9 → 11</b><span class="sep"></span>sin cortar el servicio',
    }),
  },
  {
    archivo: 'banco-de-chile-3it-1', w: 1600, h: 1000, css: PANEL_CSS,
    html: `<div style="position:absolute;inset:80px 90px;display:flex;flex-direction:column;justify-content:center;gap:54px">
      <p class="lbl">La migración de las APIs backend</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px">
        ${[['8', 'Punto de partida'], ['9', 'Primer salto'], ['11', 'Versión final']].map(([v, t], i) =>
          `${i ? '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><path d="M6 30h100M86 10l20 20-20 20" stroke="url(#a)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5158fc"/><stop offset="1" stop-color="#c0649f"/></linearGradient></defs></svg>' : ''}
          <div class="card" style="flex:1;padding:36px 30px;text-align:center;${i === 2 ? 'border-color:rgba(192,100,159,.6);background:rgba(192,100,159,.1)' : ''}">
            <p style="font-size:32px;color:#9d9daa;font-weight:600;letter-spacing:.12em">JAVA</p>
            <p class="${i === 2 ? 'grad' : ''}" style="font-size:150px;font-weight:700;line-height:1;${i === 2 ? '' : 'color:#fff'}">${v}</p>
            <p style="font-size:30px;color:#c9c9d2;margin-top:6px">${t}</p></div>`).join('')}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:32px;font-weight:600;color:#fff">
          <span>Servicio en producción</span><span style="color:#22D886">sin interrupciones</span></div>
        <div style="height:18px;border-radius:9px;background:#22D886;margin-top:16px;opacity:.85"></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        ${['Mejor rendimiento', 'Menos vulnerabilidades', 'Sin dependencias obsoletas'].map((c) => `<span class="chip">${c}</span>`).join('')}
      </div>
    </div><div class="grano"></div>`,
  },
  {
    archivo: 'banco-de-chile-3it-2', w: 900, h: 1950, css: TEL_CSS, alfa: true,
    html: telefono(`<div style="position:absolute;inset:150px 64px 90px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <p class="lbl">De punta a punta</p>
      <p style="font-size:80px;font-weight:700;line-height:1;color:#fff">Cada cambio,<br><span class="grad">probado</span></p>
      ${[['Backend', 'Java 8 / 9 / 11 · Spring · Node.js'], ['Frontend', 'Angular 9 · React'], ['Pruebas', 'JUnit en cada cambio'], ['Librerías', 'Actualizadas o reemplazadas']].map(([k, v]) =>
        `<div style="border-top:1.5px solid rgba(255,255,255,.1);padding-top:26px">
          <p style="font-size:30px;letter-spacing:.2em;text-transform:uppercase;color:#c9cbff;font-weight:600">${k}</p>
          <p style="font-size:46px;font-weight:600;color:#f1f1f4;margin-top:6px;line-height:1.15">${v}</p></div>`).join('')}
      <div style="margin-top:24px;border-radius:40px;padding:38px 44px;background:rgba(34,216,134,.1);border:1.5px solid rgba(34,216,134,.45)">
        <p style="font-size:40px;line-height:1.25;color:#fff;font-weight:500">Sistemas en producción que <b>no podían detenerse</b>.</p></div>
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
