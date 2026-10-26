// SPEC-30, caso borde "rotación / resize de móvil": Experience.swapFormat cambia la secuencia desktop↔mobile sin
// recargar la página. Este script lo demuestra en build de producción (vite preview) con CPU 4× y Fast 4G:
//   - un teléfono (DPR 3, táctil) rota vertical ↔ horizontal CYCLES veces (cada giro cruza el layout compacto);
//   - tras cada giro: el formato de la secuencia cambia al del layout nuevo, la página nunca se recarga, el loop de
//     rAF no se congela (hueco máximo entre rAF y long tasks durante el cambio) y el recorrido sigue respondiendo
//     (se hace scroll y el frame mostrado alcanza al pedido, ±2, en ≤ 5 s con Fast 4G);
//   - memoria: bitmaps vivos (createImageBitmap − close) y blob URLs vivos (createObjectURL − revokeObjectURL) nunca
//     pasan el presupuesto de UN reproductor (el viejo se libera), y el heap tras GC no crece > 10 % entre el primer
//     y el último ciclo.
// Uso (desde client/): npm run build && node scripts/verify-swap.mjs [--query '?seqdecode=img'] [--cycles 4]
//   → ../docs/perf/seq-swap[-img].json y capturas en ../docs/perf/capturas/swap-*.jpg
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(CLIENT, '..', 'docs', 'perf');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const QUERY = arg('query', '');
const CYCLES = +arg('cycles', 4);
const port = +arg('port', 4182);
const FAST_4G = { offline: false, latency: 165, downloadThroughput: 9e6 * .9 / 8, uploadThroughput: 1.5e6 * .9 / 8 };
const CATCH_UP_MS = 5000;
const PORTRAIT = { width: 390, height: 844 }, LANDSCAPE = { width: 844, height: 390 };

const INIT = () => {
  const m = window.__sw = { bitmaps: 0, bitmapsPeak: 0, urls: 0, urlsPeak: 0, gaps: [], longtasks: [], lastT: 0, rec: false, loads: 0 };
  const cib = window.createImageBitmap;
  if (cib) {
    window.createImageBitmap = function (...a) {
      return cib.apply(this, a).then((b) => {
        m.bitmaps++; m.bitmapsPeak = Math.max(m.bitmapsPeak, m.bitmaps);
        const close = b.close.bind(b); let closed = false;
        b.close = () => { if (!closed) { closed = true; m.bitmaps--; } close(); };
        return b;
      });
    };
  }
  const cou = URL.createObjectURL, rou = URL.revokeObjectURL;
  URL.createObjectURL = (o) => { m.urls++; m.urlsPeak = Math.max(m.urlsPeak, m.urls); return cou(o); };
  URL.revokeObjectURL = (u) => { m.urls--; return rou(u); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (m.rec) m.longtasks.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch { /* sin soporte */ }
  const loop = (t) => { if (m.rec && m.lastT) m.gaps.push(t - m.lastT); m.lastT = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // Marca de navegación: si la página se recarga, __sw se re-crea y navId cambia.
  m.navId = Math.random();
};

function startPreview() {
  const p = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: CLIENT, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('vite preview no arrancó')), 20000);
    p.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(to); res(p); } });
    p.on('exit', (c) => { clearTimeout(to); rej(new Error('vite preview salió con ' + c)); });
  });
}

const preview = await startPreview();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-precise-memory-info'] });
const result = { generated: new Date().toISOString(), query: QUERY || undefined, cycles: CYCLES, conditions: 'CPU 4× · Fast 4G · vite preview', steps: [], errors: [] };
const tag = QUERY.includes('img') ? '-img' : '';
try {
  const ctx = await browser.newContext({ viewport: PORTRAIT, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => result.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(base + '/wstyle/' + QUERY, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__site && window.__site.ready && window.__site.mode === 'seq', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const navId = await page.evaluate(() => window.__sw.navId);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return +((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(2); };
  const state = () => page.evaluate(() => { const s = window.__site.seq; return { format: s.format, variant: s.variant, decoder: s.decoder, retained: s.retained, budget: s.budget, frame: window.__site.seqFrame, wanted: s.wanted, compact: window.__site.compact, bitmapsLive: window.__sw.bitmaps, urlsLive: window.__sw.urls }; });
  const first = await state();
  result.initial = { ...first, heapMB: await heap() };
  console.log('inicial', JSON.stringify(result.initial));
  for (let c = 0; c < CYCLES * 2; c++) {
    const vp = c % 2 === 0 ? LANDSCAPE : PORTRAIT, want = vp === PORTRAIT ? 'mobile' : 'desktop';
    await page.evaluate(() => { const m = window.__sw; m.gaps = []; m.longtasks = []; m.rec = true; });
    const t0 = Date.now();
    await page.setViewportSize(vp);
    // Espera a que la secuencia nueva esté puesta (anclas descargadas y decodificadas).
    await page.waitForFunction((w) => window.__site.seq && window.__site.seq.format === w, want, { timeout: 60000 });
    const swapMs = Date.now() - t0;
    // ¿Sigue vivo el recorrido? Scroll a la mitad del primer tramo y de vuelta; el frame mostrado debe seguir al pedido.
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const y = Math.round(max * (0.15 + 0.1 * (c % 3)));
    // Recién cambiada, la secuencia nueva solo tiene las anclas: se muestra el frame disponible más cercano y se
    // alcanza al pedido a medida que llegan los bytes. "No congelado" = el mostrado llega a ±2 del pedido (tolerancia
    // de M1) en ≤ CATCH_UP_MS.
    const ts = Date.now();
    await page.evaluate((y) => window.scrollTo(0, y), y);
    const caught = await page.waitForFunction((y) => { const s = window.__site; return scrollY === y && s.seq && s.seq.wanted > 2 && Math.abs(s.seqFrame - Math.round(s.seq.wanted)) <= 2; }, y, { timeout: CATCH_UP_MS, polling: 'raf' }).then(() => true, () => false);
    const catchUpMs = Date.now() - ts;
    await page.waitForFunction(() => window.__site.settled, null, { timeout: 10000 }).catch(() => {});
    // Contabilidad exacta en reposo: bitmaps / blob URLs vivos = frames retenidos por el reproductor actual (ninguno
    // del reproductor anterior ni huérfanos). Se espera a que terminen las decodificaciones en curso (≤ 5 s).
    const balanced = await page.waitForFunction(() => { const q = window.__site.seq, m = window.__sw; return q && (q.decoder === 'img' ? m.urls : m.bitmaps) === q.retained; }, null, { timeout: 5000 }).then(() => true, () => false);
    const after = await state();
    const m = await page.evaluate(() => { const m = window.__sw; m.rec = false; return { maxGap: Math.round(Math.max(0, ...m.gaps)), longtasks: m.longtasks, bitmapsPeak: m.bitmapsPeak, urlsPeak: m.urlsPeak, navId: m.navId }; });
    const shot = path.join(OUT_DIR, 'capturas', `swap${tag}-${c + 1}-${want}.jpg`);
    if (c < 2) await page.screenshot({ path: shot, type: 'jpeg', quality: 70 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    const step = {
      step: c + 1, viewport: `${vp.width}×${vp.height}`, want, ...after, swapMs, scrollY: y,
      followsScroll: caught && Math.abs(after.frame - Math.round(after.wanted)) <= 2, catchUpMs, liveEqualsRetained: balanced,
      reloaded: m.navId !== navId, maxRafGapMs: m.maxGap, longtasks: m.longtasks, bitmapsLivePeak: m.bitmapsPeak, blobUrlsLivePeak: m.urlsPeak,
      heapMB: c % 2 === 1 ? await heap() : undefined, screenshot: c < 2 ? path.relative(path.resolve(CLIENT, '..'), shot) : undefined,
    };
    result.steps.push(step);
    console.log(JSON.stringify(step));
  }
  await ctx.close();
} finally {
  await browser.close();
  preview.kill();
}
const S = result.steps, heaps = S.map((s) => s.heapMB).filter((h) => h != null);
const maxBudget = Math.max(...S.map((s) => s.budget), result.initial.budget);
result.checks = {
  formatFollowsLayout: S.every((s) => s.format === s.want && s.compact === (s.want === 'mobile')),
  noReload: S.every((s) => !s.reloaded),
  followsScroll: S.every((s) => s.followsScroll), catchUpMsMax: Math.max(...S.map((s) => s.catchUpMs)),
  maxRafGapMs: Math.max(...S.map((s) => s.maxRafGapMs)),
  longtasksOver100: S.flatMap((s) => s.longtasks).filter((d) => d > 100).length,
  // Un solo reproductor vivo: nunca más bitmaps que (presupuesto del viejo + anclas del nuevo) durante el cambio y,
  // en reposo, no más que el presupuesto de uno.
  bitmapsLiveAtRestMax: Math.max(...S.map((s) => s.bitmapsLive)),
  liveEqualsRetained: S.every((s) => s.liveEqualsRetained),
  bitmapsLiveAtRestOk: S.every((s) => s.bitmapsLive <= s.budget),
  bitmapsLivePeak: Math.max(...S.map((s) => s.bitmapsLivePeak)), bitmapBudgetMax: maxBudget,
  blobUrlsLiveAtRestOk: S.every((s) => s.urlsLive <= s.budget),
  heapAfterGcMB: heaps, heapGrowthPct: +(100 * (heaps[heaps.length - 1] - heaps[0]) / heaps[0]).toFixed(1),
  errors: result.errors.length,
};
result.checks.pass = result.checks.formatFollowsLayout && result.checks.noReload && result.checks.followsScroll && result.checks.longtasksOver100 === 0
  && result.checks.liveEqualsRetained && result.checks.bitmapsLiveAtRestOk && result.checks.blobUrlsLiveAtRestOk && result.checks.heapGrowthPct <= 10 && result.errors.length === 0;
const out = path.join(OUT_DIR, `seq-swap${tag}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(JSON.stringify(result.checks, null, 1));
console.log('→', out);
process.exit(result.checks.pass ? 0 : 1);
