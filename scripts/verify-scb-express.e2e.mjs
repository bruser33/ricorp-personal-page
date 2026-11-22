// Verificación en navegador de SPEC-49: AC1, AC3, AC4, AC5, AC6, AC8, AC9 en runtime.
// Uso: PW_DIR=<carpeta con node_modules/playwright> [PW_CHROME=<ejecutable>] node scripts/verify-scb-express.e2e.mjs
// El repo no trae Playwright como dependencia; PW_DIR apunta a una instalación local.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "client/public");
const require = createRequire(process.env.PW_DIR ? join(process.env.PW_DIR, "noop.js") : import.meta.url);
const { chromium } = require("playwright");

const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try { const body = await readFile(join(pub, p)); res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end("404"); }
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const BASE = `http://127.0.0.1:${server.address().port}/scb-express/`;
const VIEWS = ["login", "seguimiento", "dashboard", "nueva", "ordenes", "etiqueta", "rutas", "reporte", "clientes", "documentos"];

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const page = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  // Google Fonts no es parte del AC: se bloquea para que la prueba no dependa de la red
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", e => p.errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts\.g|ERR_FAILED/.test(m.text() + (m.location().url || ""))) p.errs.push(m.text()); });
  return p;
};

try {
  // AC1 sitio sin errores + secciones con contenido
  const s = await page();
  await s.goto(BASE, { waitUntil: "load" });
  check(await s.evaluate(() => document.querySelectorAll("video").length) === 0, "AC7 hay <video> en el sitio");
  const secs = await s.evaluate(() => ["hero", "servicios", "plataforma", "como-funciona", "cobertura", "cotizar"].map(id => [id, (document.getElementById(id)?.innerText || "").trim().length]));
  for (const [id, n] of secs) check(n > 80, `AC1 la sección #${id} está vacía`);
  check(await s.locator("footer").count() === 1, "AC1 falta el footer");

  // AC2 el logo azul no tiene rojo y sí azul (se mira el contenido, no el nombre)
  const px = await s.evaluate(async () => {
    const out = {};
    for (const f of ["logo-scb-azul.png", "marca-scb-azul.png"]) {
      const img = new Image(); img.src = "img/" + f; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
      let red = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const [r, gg, b] = [d[i], d[i + 1], d[i + 2]]; if (r > 150 && gg < 90 && b < 70) red++; if (b > 150 && r < 80) blue++; }
      out[f] = { red, blue };
    }
    return out;
  });
  for (const [f, v] of Object.entries(px)) check(v.red === 0 && v.blue > 1000, `AC2 ${f} no es azul (${v.red} px rojos, ${v.blue} azules)`);

  // AC4 pestañas: ≥4, el clic cambia aria-selected, panel y captura cargada
  const tabs = s.locator("#plataforma [role=tab]");
  const nt = await tabs.count();
  check(nt >= 4, `AC4 hay ${nt} pestañas`);
  for (let i = 0; i < nt; i++) {
    await tabs.nth(i).click();
    const st = await s.evaluate(i => {
      const t = document.querySelectorAll("#plataforma [role=tab]")[i], panel = document.getElementById(t.getAttribute("aria-controls"));
      const img = panel.querySelector("img"); img.loading = "eager";
      return { sel: t.getAttribute("aria-selected"), vis: !panel.hidden, others: [...document.querySelectorAll("#plataforma [role=tabpanel]")].filter(p => !p.hidden).length, src: img.getAttribute("src") };
    }, i);
    await s.waitForFunction(i => { const img = document.querySelectorAll("#plataforma [role=tabpanel]")[i].querySelector("img"); return img.complete && img.naturalWidth > 0; }, i, { timeout: 5000 }).catch(() => check(false, `AC4 la captura de la pestaña ${i + 1} no carga`));
    check(st.sel === "true" && st.vis && st.others === 1 && /img\/plataforma-/.test(st.src), `AC4 la pestaña ${i + 1} no muestra su captura`);
  }
  // teclado
  await tabs.nth(0).focus(); await s.keyboard.press("ArrowRight");
  check(await tabs.nth(1).getAttribute("aria-selected") === "true", "AC4 las flechas no cambian de pestaña");

  // AC3 el input del hero lleva al seguimiento con esa OD
  await s.fill("#od-input", "0004 8213 84"); await s.press("#od-input", "Enter");
  await s.waitForURL(/plataforma\/#\/seguimiento\?od=0004821384/, { timeout: 5000 }).catch(() => {});
  check(/#\/seguimiento\?od=0004821384/.test(s.url()), `AC3 el hero no lleva al seguimiento (url ${s.url()})`);
  check(/0004 8213 84/.test(await s.locator("#pub-od").innerText().catch(() => "")), "AC3 el seguimiento no muestra la OD buscada");
  check(!s.errs.length, `AC1 errores en el sitio: ${s.errs.join(" | ")}`);
  check(await s.evaluate(() => document.querySelectorAll("video").length) === 0, "AC7 hay <video> en el DOM del seguimiento");

  // AC5 cada vista navegable, solo una visible, mismos tokens que el sitio
  const tokSite = await (async () => { const p = await page(); await p.goto(BASE); const t = await p.evaluate(() => ["--azul", "--navy", "--display", "--body"].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim())); await p.close(); return t; })();
  const a = await page();
  for (const v of VIEWS) {
    await a.goto(BASE + "plataforma/#/" + v, { waitUntil: "load" });
    const vis = await a.evaluate(() => [...document.querySelectorAll("[data-view]")].filter(e => !e.hidden && e.offsetParent !== null).map(e => e.dataset.view));
    check(vis.length === 1 && vis[0] === v, `AC5 en #/${v} se ven: ${vis.join(",") || "ninguna"}`);
    check(await a.evaluate(() => document.querySelectorAll("video").length) === 0, `AC7 hay <video> en #/${v}`);
  }
  const tokApp = await a.evaluate(() => ["--azul", "--navy", "--display", "--body"].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()));
  check(JSON.stringify(tokApp) === JSON.stringify(tokSite), `AC5 tokens distintos: sitio ${tokSite} vs plataforma ${tokApp}`);
  // navegación por el menú (hashchange)
  await a.goto(BASE + "plataforma/#/dashboard"); await a.click('[data-nav="rutas"]'); await a.waitForTimeout(200);
  check(await a.locator('[data-view="rutas"]').isVisible(), "AC5 el menú no navega");
  check(!a.errs.length, `AC1 errores en la plataforma: ${a.errs.join(" | ")}`);

  // AC3 el seguimiento es coherente con el estado: una OD en ruta no muestra foto de entrega; una inexistente avisa
  await a.goto(BASE + "plataforma/#/seguimiento?od=4821391", { waitUntil: "load" });
  const enRuta = await a.evaluate(() => ({ st: document.getElementById("pub-state").innerText, proof: !document.getElementById("pub-proof").hidden, last: document.querySelectorAll("#pub-steps .done").length }));
  check(/En ruta/.test(enRuta.st) && !enRuta.proof && enRuta.last < 4, `AC3 una OD en ruta se muestra como entregada (${JSON.stringify(enRuta)})`);
  await a.goto(BASE + "plataforma/#/seguimiento?od=12345", { waitUntil: "load" });
  check(await a.locator("#pub-missing").isVisible() && !(await a.locator("#pub-proof").isVisible()), "AC3 una OD inexistente no avisa que no existe");
  // filas de órdenes con teclado → drawer; Escape devuelve el foco
  await a.goto(BASE + "plataforma/#/ordenes", { waitUntil: "load" });
  await a.locator("#od-table tr[data-od]").first().focus(); await a.keyboard.press("Enter"); await a.waitForTimeout(350);
  check(await a.evaluate(() => document.getElementById("drawer").classList.contains("open") && !document.getElementById("drawer").inert), "AC5 la orden no se abre con teclado");
  await a.fill("#e-r", "-5"); await a.click("#edit-form .btn-azul");
  check(await a.locator("#drawer .err").isVisible(), "AC5 el drawer acepta bultos recibidos negativos");
  await a.keyboard.press("Escape"); await a.waitForTimeout(350);
  check(await a.evaluate(() => document.activeElement?.matches("#od-table tr[data-od]")), "AC5 al cerrar el drawer el foco no vuelve a la fila");
  // el foco queda dentro del drawer; guardar persiste todo y devuelve el foco a la fila
  await a.locator("#od-table tr[data-od]").first().focus(); await a.keyboard.press("Enter"); await a.waitForTimeout(350);
  for (let i = 0; i < 25; i++) await a.keyboard.press("Tab");
  check(await a.evaluate(() => document.getElementById("drawer").contains(document.activeElement)), "AC5 el foco se escapa del drawer con Tab");
  const od0 = await a.locator("#od-table tr[data-od]").first().getAttribute("data-od");
  await a.selectOption('#edit-form select[name="estado"]', "NO ENTREGADO"); await a.click("#edit-form .btn-azul"); await a.waitForTimeout(350);
  check(await a.evaluate(od => document.activeElement?.matches(`#od-table tr[data-od="${od}"]`), od0), "AC5 tras Guardar el foco no vuelve a la fila");
  check(/NO ENTREGADO/.test(await a.locator(`#od-table tr[data-od="${od0}"]`).innerText()), "AC5 el estado editado no se guarda");
  // crear orden → queda registrada, su etiqueta y su seguimiento existen
  await a.goto(BASE + "plataforma/#/nueva", { waitUntil: "load" });
  await a.fill('#od-form [name=destino]', "Talca"); await a.fill('#od-form [name=destinatario]', "Bodega Prueba"); await a.fill('#od-form [name=direccion]', "Calle 1 #2");
  await a.fill('#od-form [name=bultos]', "2"); await a.click('#od-form .btn-azul'); await a.waitForTimeout(1100);
  const nuevo = await a.evaluate(() => ({ h: location.hash, n: document.querySelectorAll("#labels .label").length, t: document.getElementById("labels").innerText, qr: document.querySelector("#labels svg.qr")?.dataset.qr }));
  check(/#\/etiqueta\?od=\d+/.test(nuevo.h) && nuevo.n === 2 && /Bodega Prueba/.test(nuevo.t) && /TALCA|Talca/.test(nuevo.t), `AC6 la orden nueva no genera sus etiquetas (${JSON.stringify(nuevo).slice(0, 160)})`);
  await a.evaluate(u => { location.hash = u.split("#")[1]; }, nuevo.qr || "#/x"); await a.waitForTimeout(300);
  check(!(await a.locator("#pub-missing").isVisible()) && /creada/i.test(await a.locator("#pub-state").innerText()), "AC3 el QR de la orden nueva no abre su seguimiento");
  // etiqueta de una OD inexistente no mezcla datos de otra
  await a.goto(BASE + "plataforma/#/etiqueta?od=12345", { waitUntil: "load" });
  check(await a.locator("#labels .label").count() === 0 && /no encontrada/i.test(await a.locator("#labels").innerText()), "AC6 una OD inexistente imprime etiquetas con datos de otra orden");
  // parámetros de URL raros no rompen la etiqueta
  await a.goto(BASE + "plataforma/#/etiqueta?od=abc&b=xyz&d=constructor", { waitUntil: "load" });
  const raro = await a.evaluate(() => document.getElementById("labels").innerText);
  check(!/NaN|function|undefined/.test(raro), `AC6 parámetros inválidos rompen la etiqueta`);

  // AC6 etiquetas 100×150, 1/N…N/N, barras y QR distintos
  for (const n of [1, 3, 12]) {
    await a.evaluate(n => { const o = ORDERS.find(x => x.od === 4821384); o.bultos = n; location.hash = "#/etiqueta?od=4821384&r=" + n; }, n); await a.waitForTimeout(150);
    const L = await a.evaluate(() => [...document.querySelectorAll("#labels .label")].map(l => { const r = l.getBoundingClientRect(); return { w: r.width, h: r.height, t: l.innerText, bc: l.querySelector("svg.barcode")?.innerHTML || "", qr: (l.querySelector("svg.qr path")?.getAttribute("d") || "").length > 200 && /#\/seguimiento\?od=\d+/.test(l.querySelector("svg.qr")?.dataset.qr || "") }; }));
    check(L.length === n, `AC6 con ${n} bultos hay ${L.length} etiquetas`);
    L.forEach((l, i) => {
      check(new RegExp(`BULTO ${i + 1} / ${n}`).test(l.t), `AC6 etiqueta ${i + 1} no dice BULTO ${i + 1} / ${n}`);
      check(Math.abs(l.w - 377.95) < 3 && Math.abs(l.h - 566.93) < 3, `AC6 la etiqueta mide ${l.w.toFixed(0)}×${l.h.toFixed(0)} px, no 100×150 mm`);
      check(l.bc.length > 200 && l.qr, `AC6 etiqueta ${i + 1} sin código de barras o sin QR al seguimiento`);
    });
    if (n > 1) check(new Set(L.map(l => l.bc)).size === n, "AC6 los códigos de barras de cada bulto no son distintos");
  }

  // AC8 sin scroll horizontal a 390 px
  const m = await page({ viewport: { width: 390, height: 844 } });
  for (const u of ["", ...VIEWS.map(v => "plataforma/#/" + v)]) {
    await m.goto(BASE + u, { waitUntil: "load" }); await m.waitForTimeout(120);
    const w = await m.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(w[0] <= w[1], `AC8 scroll horizontal en /${u || "(sitio)"}: ${w[0]} > ${w[1]}`);
  }

  // menú móvil: con el menú abierto, tocar un enlace navega
  await m.goto(BASE + "plataforma/#/ordenes", { waitUntil: "load" });
  await m.click("#menu-btn"); await m.waitForTimeout(350);
  await m.click('#side a[data-nav="rutas"]', { timeout: 3000 }).catch(() => {});
  await m.waitForTimeout(250);
  check(/#\/rutas/.test(m.url()) && await m.locator('[data-view="rutas"]').isVisible(), "AC8 el menú móvil de la plataforma no navega al tocar un enlace");
  await m.goto(BASE, { waitUntil: "load" }); await m.click("#burger"); await m.click('#mnav a[href="#cobertura"]');
  check(!(await m.locator("#mnav").isVisible()), "AC8 el menú móvil del sitio no se cierra al elegir un enlace");

  // AC9 reduced motion: sin animaciones corriendo, el hero no cambia con el scroll
  const r = await page({ reducedMotion: "reduce" });
  await r.goto(BASE, { waitUntil: "load" });
  await r.evaluate(() => scrollTo(0, 600)); await r.waitForTimeout(250);
  const rm = await r.evaluate(() => ({ anims: document.getAnimations().filter(x => x.playState === "running" && x.effect?.getTiming().duration > 0.01).length, p: getComputedStyle(document.getElementById("sky")).getPropertyValue("--p").trim(), hidden: [...document.querySelectorAll(".reveal")].filter(e => getComputedStyle(e).opacity !== "1").length }));
  check(rm.anims === 0, `AC9 hay ${rm.anims} animaciones corriendo con reduced-motion`);
  check(rm.p === "" || rm.p === "0", `AC9 el hero cambia con el scroll (--p=${rm.p})`);
  check(rm.hidden === 0, `AC9 quedan ${rm.hidden} bloques ocultos esperando el reveal`);
  const drawerAnims = async opts => {
    const q = await page(opts);
    await q.goto(BASE + "plataforma/#/ordenes", { waitUntil: "load" });
    await q.locator("#od-table tr[data-od]").first().focus(); await q.keyboard.press("Enter"); await q.waitForTimeout(30);
    const n = await q.evaluate(() => document.getAnimations().length); await q.close(); return n;
  };
  const conMov = await drawerAnims({}), sinMov = await drawerAnims({ reducedMotion: "reduce" });
  check(conMov > 0, "AC9 control: el drawer no anima ni siquiera sin reduced-motion (chequeo vacuo)");
  check(sinMov === 0, `AC9 la plataforma anima con reduced-motion (${sinMov})`);
} catch (e) {
  fails.push("e2e se cayó: " + e.message.split("\n")[0]);
} finally {
  await browser.close(); server.close();
}
if (fails.length) { console.error("✗ SPEC-49 e2e\n- " + fails.join("\n- ")); process.exit(1); }
console.log("✓ SPEC-49 e2e OK (AC1 AC3 AC4 AC5 AC6 AC8 AC9)");
