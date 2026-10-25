// SPEC-30: medición reproducible del recorrido 3D (secuencia de frames de /wstyle/) en build de producción.
//
// Uso (desde client/):
//   npm run build && npm run measure:seq -- --label baseline      → ../docs/perf/seq-baseline.json + .md
//   npm run measure:seq -- --label player [--runs 3] [--only desktop|mobile] [--scenarios normal,rapido]
//   npm run measure:seq -- --compare baseline,player,final        → ../docs/perf/seq-informe.md (tabla antes/después)
//   [--dump <carpeta>]: además guarda las muestras por rAF y los requests de cada corrida (diagnóstico)
// Levanta su propio `vite preview` (127.0.0.1, puerto --port, por defecto 4182) salvo que se pase --url.
// Navegador: Google Chrome instalado (playwright-core, channel 'chrome').
//
// Condiciones (regla 2 de la spec): CPU 4× (CDP Emulation.setCPUThrottlingRate) y red "Fast 4G" del perfil de
// Chrome DevTools (9 Mbps bajada, 1.5 Mbps subida, 165 ms de latencia; mismos números que DevTools/Lighthouse).
// Dispositivos: desktop 1440×900 DPR 1 y móvil 390×844 DPR 3 táctil. Cada corrida es un contexto nuevo (caché fría).
//
// Escenarios (regla 4): scroll scriptado con window.scrollTo en cada requestAnimationFrame (sin smooth-scroll del
// navegador), tras __site.ready + 1.5 s de "lectura" del hero:
//   lento = 0 → final en 30 s · normal = 12 s · rapido = 3 s · salto = clic en el navbar a "Visítanos" y de vuelta
//   al inicio con el logo · vaiven = adelante/atrás 3 veces entre las anclas 2 y 4 (2 s por tramo).
// Más un escenario "memoria" solo para AC-08 (3 recorridos completos de 8 s, heap tras GC después de cada uno).
//
// Métricas (regla 3), muestreadas en cada rAF desde un init script (antes que el loop del sitio, así que lee el
// frame pedido y el mostrado del mismo tick):
//   M1 = % de rAF del tramo de scroll con |mostrado − round(pedido)| > 2.
//   M2 = mayor tiempo continuo (ms) con el frame mostrado quieto mientras el pedido es otro (la racha empieza cuando
//        el pedido se separa del mostrado y termina cuando el mostrado cambia o el pedido vuelve a él); incluye 0.5 s
//        de cola tras el scroll.
//   M3 = long tasks (> 50 ms, PerformanceObserver 'longtask') durante el scroll + cola: cantidad, total, máxima.
//   M4 = ms hasta __site.ready (primer frame dibujado con el contenido aplicado), LCP, y bytes transferidos hasta ese
//        momento (solo la secuencia: manifest + frames; y el total de la página).
//   M5 = pico de JS heap (performance.memory con --enable-precise-memory-info) y pico de bitmaps retenidos
//        (frames decodificados vivos × ancho × alto × 4).
//   Además: requests de frames por URL (AC-09: en vaivén ningún frame se pide por red más de una vez).
import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(CLIENT, '..', 'docs', 'perf');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const FAST_4G = { offline: false, latency: 165, downloadThroughput: 9e6 * .9 / 8, uploadThroughput: 1.5e6 * .9 / 8 };
const CPU_RATE = 4;
const SCENARIOS = ['lento', 'normal', 'rapido', 'salto', 'vaiven'];

// ─── Init script: muestreo por rAF, long tasks, LCP y heap. Corre antes que el código del sitio.
const INIT = () => {
  const m = window.__m = { samples: [], longtasks: [], lcp: 0, readyAt: 0, heapPeak: 0, bitmapsPeak: 0, retainedPeak: 0, rec: false };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* sin soporte */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* sin soporte */ }
  const loop = (t) => {
    const s = window.__site;
    if (s) {
      if (!m.readyAt && s.ready) m.readyAt = t;
      const q = s.seq;
      if (q) {
        const px = q.size[0] * q.size[1] * 4, ret = q.retained;
        m.retainedPeak = Math.max(m.retainedPeak, ret);
        m.bitmapsPeak = Math.max(m.bitmapsPeak, ret * px);
        if (m.rec) m.samples.push([t, q.wanted, s.seqFrame, scrollY, q.wantedState ?? null, q.loaded]);
      }
    }
    if (performance.memory) m.heapPeak = Math.max(m.heapPeak, performance.memory.usedJSHeapSize);
    if (m.drive) m.drive(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

// Conduce el scroll dentro de la página: keyframes [[ms, y], …] interpolados linealmente, un scrollTo por rAF.
async function drive(page, keys) {
  return page.evaluate((keys) => new Promise((done) => {
    const m = window.__m; let t0 = 0;
    m.drive = (t) => {
      if (!t0) t0 = t;
      const e = t - t0;
      let y = keys[keys.length - 1][1];
      for (let i = 1; i < keys.length; i++) if (e <= keys[i][0]) { const [ta, ya] = keys[i - 1], [tb, yb] = keys[i]; y = ya + (yb - ya) * (e - ta) / Math.max(1, tb - ta); break; }
      window.scrollTo(0, Math.round(y));
      if (e >= keys[keys.length - 1][0]) { m.drive = null; done(); }
    };
  }), keys);
}

function metrics(samples, longtasks, t0, t1, tail = 500) {
  const scroll = samples.filter(([t]) => t >= t0 && t <= t1);
  const off = scroll.filter(([, w, s]) => w != null && s != null && Math.abs(s - Math.round(w)) > 2).length;
  const M1 = { pct: scroll.length ? +(100 * off / scroll.length).toFixed(2) : null, samples: scroll.length };
  // Causa del desfase (solo reproductor SPEC-30, que expone el estado del frame pedido): red (sin bytes) o decodificación.
  const offS = scroll.filter(([, w, s]) => w != null && s != null && Math.abs(s - Math.round(w)) > 2);
  if (offS.some((x) => x[4] != null)) M1.cause = { network: offS.filter((x) => x[4] <= 1).length, decode: offS.filter((x) => x[4] === 2 || x[4] === 3).length, other: offS.filter((x) => x[4] === 4 || x[4] === -1).length };
  let maxStuck = 0, runStart = null, prevShown = null;
  for (const [t, w, s] of samples.filter(([t]) => t >= t0 && t <= t1 + tail)) {
    if (s !== prevShown) { runStart = null; prevShown = s; }
    if (Math.round(w) !== s) { if (runStart == null) runStart = t; maxStuck = Math.max(maxStuck, t - runStart); }
    else runStart = null;
  }
  const lt = longtasks.filter(([st, d]) => st + d >= t0 && st <= t1 + tail).map(([, d]) => d);
  const M3 = { count: lt.length, totalMs: Math.round(lt.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...lt)), over100: lt.filter((d) => d > 100).length };
  return { M1, M2: { maxMs: Math.round(maxStuck) }, M3 };
}

async function runScenario(browser, base, device, scenario) {
  const ctx = await browser.newContext({ ...DEVICES[device], reducedMotion: 'no-preference' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  const reqs = new Map(); // requestId → { url, t, bytes, cached }
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t: e.timestamp, wall: e.wallTime, bytes: 0, done: 0, cached: false }));
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cached = true; });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r && (e.response.fromDiskCache || e.response.fromServiceWorker)) r.cached = true; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = e.timestamp; } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(base + '/wstyle/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__m.readyAt > 0, null, { timeout: 120000 });
  // Monotónico de CDP al momento del ready (para cortar los bytes "hasta el primer frame").
  const { result: { value: readyWall } } = await cdp.send('Runtime.evaluate', { expression: 'performance.timeOrigin + window.__m.readyAt' });
  const info = await page.evaluate(() => ({ mode: window.__site.mode, seq: window.__site.seq, max: document.documentElement.scrollHeight - innerHeight, anchors: window.__site.anchors, readyAt: window.__m.readyAt, lcp: window.__m.lcp }));
  // Bytes hasta el ready: requests terminados antes del ready. Los timestamps de CDP son monotónicos (s); se pasan a
  // reloj de pared con el par (timestamp, wallTime) del primer request (la navegación).
  const r0 = [...reqs.values()].reduce((a, r) => (r.t < a.t ? r : a));
  const readyMono = r0.t + (readyWall / 1000 - r0.wall);
  await page.waitForTimeout(1500);

  const max = info.max, A = info.anchors;
  let t0, t1;
  const mark = () => page.evaluate(() => performance.now());
  await page.evaluate(() => { window.__m.rec = true; });
  if (scenario === 'salto') {
    t0 = await mark();
    const compact = device === 'mobile';
    const clickNav = async (sel) => {
      if (compact && sel !== '.nav__logo') { await page.click('.nav-toggle'); await page.waitForTimeout(400); }
      await page.click(sel);
    };
    await clickNav('.nav-links a[href="#llega"]');
    await page.waitForTimeout(2500);
    await clickNav('.nav__logo');
    await page.waitForTimeout(2500);
    t1 = await mark();
  } else {
    const keys = {
      lento: [[0, 0], [30000, max]],
      normal: [[0, 0], [12000, max]],
      rapido: [[0, 0], [3000, max]],
      vaiven: [[0, 0], [2000, A[2]], [4000, A[4]], [6000, A[2]], [8000, A[4]], [10000, A[2]], [12000, A[4]], [14000, A[2]]],
    }[scenario];
    t0 = await mark();
    await drive(page, keys);
    t1 = await mark();
  }
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => ({ cost: window.__site.seq && window.__site.seq.drawMaxMs != null ? [window.__site.seq.drawMaxMs, window.__site.seq.pumpMaxMs] : null, samples: window.__m.samples, longtasks: window.__m.longtasks, heapPeak: window.__m.heapPeak, bitmapsPeak: window.__m.bitmapsPeak, retainedPeak: window.__m.retainedPeak }));
  const res = metrics(m.samples, m.longtasks, t0, t1);
  // Atribución (reproductor SPEC-30): lo más caro que tomó un drawImage y una pasada de programación, en el hilo principal.
  if (m.cost) { res.M3.drawMaxMs = +m.cost[0].toFixed(1); res.M3.scheduleMaxMs = +m.cost[1].toFixed(1); }
  if (arg('dump')) fs.writeFileSync(path.join(arg('dump'), `${device}-${scenario}-${Date.now()}.json`), JSON.stringify({ t0, t1, samples: m.samples, reqs: [...reqs.values()].filter((r) => /\.webp/.test(r.url)).map((r) => [r.url.slice(-9, -5), r.t, r.done]) }));
  const all = [...reqs.values()];
  const seqReqs = all.filter((r) => /\/wstyle\/seq\//.test(r.url));
  const frameReqs = seqReqs.filter((r) => /\.webp(\?|$)/.test(r.url));
  const perUrl = new Map(); for (const r of frameReqs) if (!r.cached) perUrl.set(r.url, (perUrl.get(r.url) || 0) + 1);
  const toReady = (rs) => rs.filter((r) => r.done && r.done <= readyMono).reduce((a, r) => a + r.bytes, 0);
  await ctx.close();
  return {
    ...res,
    M4: { readyMs: Math.round(info.readyAt), lcpMs: Math.round(info.lcp), seqBytesToReady: toReady(seqReqs), totalBytesToReady: toReady(all) },
    M5: { heapPeakMB: +(m.heapPeak / 1048576).toFixed(1), bitmapsPeakMB: +(m.bitmapsPeak / 1048576).toFixed(1), retainedPeak: m.retainedPeak },
    requests: { frames: frameReqs.length, network: [...perUrl.values()].reduce((a, b) => a + b, 0), distinct: perUrl.size, dupUrls: [...perUrl.values()].filter((c) => c > 1).length, seqBytes: seqReqs.reduce((a, r) => a + r.bytes, 0) },
    seq: info.seq && { count: info.seq.count, variant: info.seq.variant, size: info.seq.size, format: info.seq.format, mode: info.mode, maxScroll: max, pxPerFrame: +(max / Math.max(1, info.seq.count - 1)).toFixed(1) },
    errors,
  };
}

// AC-08: 3 recorridos completos (8 s cada uno, ida) con heap tras GC al final de cada uno.
async function runMemory(browser, base, device) {
  const ctx = await browser.newContext(DEVICES[device]);
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  await page.goto(base + '/wstyle/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__site && window.__site.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const heap = [];
  for (let k = 0; k < 3; k++) {
    await drive(page, [[0, 0], [8000, max], [9000, max]]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    heap.push(+(usedSize / 1048576).toFixed(2));
  }
  const peak = await page.evaluate(() => ({ bitmapsPeak: window.__m.bitmapsPeak, retainedPeak: window.__m.retainedPeak }));
  await ctx.close();
  return { heapAfterMB: heap, growthPct: +(100 * (heap[2] - heap[0]) / heap[0]).toFixed(1), bitmapsPeakMB: +(peak.bitmapsPeak / 1048576).toFixed(1), retainedPeak: peak.retainedPeak };
}

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
function aggregate(runs) {
  const pick = (f) => runs.map(f);
  return {
    M1: { pct: median(pick((r) => r.M1.pct)), runs: pick((r) => r.M1.pct), causes: pick((r) => r.M1.cause ?? null) },
    M2: { maxMs: median(pick((r) => r.M2.maxMs)), runs: pick((r) => r.M2.maxMs) },
    M3: { count: median(pick((r) => r.M3.count)), totalMs: median(pick((r) => r.M3.totalMs)), maxMs: Math.max(...pick((r) => r.M3.maxMs)), over100: Math.max(...pick((r) => r.M3.over100)), runs: pick((r) => r.M3.totalMs), ...(runs[0].M3.drawMaxMs != null ? { drawMaxMs: Math.max(...pick((r) => r.M3.drawMaxMs)), scheduleMaxMs: Math.max(...pick((r) => r.M3.scheduleMaxMs)) } : {}) },
    M4: { readyMs: median(pick((r) => r.M4.readyMs)), lcpMs: median(pick((r) => r.M4.lcpMs)), seqBytesToReady: median(pick((r) => r.M4.seqBytesToReady)), totalBytesToReady: median(pick((r) => r.M4.totalBytesToReady)) },
    M5: { heapPeakMB: Math.max(...pick((r) => r.M5.heapPeakMB)), bitmapsPeakMB: Math.max(...pick((r) => r.M5.bitmapsPeakMB)), retainedPeak: Math.max(...pick((r) => r.M5.retainedPeak)) },
    requests: { frames: median(pick((r) => r.requests.frames)), network: median(pick((r) => r.requests.network)), distinct: median(pick((r) => r.requests.distinct)), dupUrls: Math.max(...pick((r) => r.requests.dupUrls)), seqBytes: median(pick((r) => r.requests.seqBytes)) },
    seq: runs[0].seq,
    errors: [...new Set(runs.flatMap((r) => r.errors))],
  };
}

function startPreview(port) {
  const p = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: CLIENT, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('vite preview no arrancó')), 20000);
    p.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(to); res(p); } });
    p.on('exit', (c) => { clearTimeout(to); rej(new Error('vite preview salió con ' + c)); });
  });
}

const fmtB = (b) => b == null ? '—' : b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB';
function summaryMd(r) {
  const L = [`# Recorrido 3D — medición "${r.label}"`, '', `${r.generated} · commit ${r.commit} · CPU ${r.config.cpu}× · red ${r.config.network} · ${r.config.runs} corridas por escenario (mediana; M2/M3 máx = peor corrida)`, ''];
  for (const [dev, d] of Object.entries(r.devices)) {
    const s0 = Object.values(d.scenarios)[0]?.seq;
    L.push(`## ${dev} — ${s0 ? `${s0.count} frames ${s0.format}/${s0.variant} ${s0.size.join('×')}, ${s0.pxPerFrame} px de scroll por frame` : ''}`, '');
    L.push('| escenario | M1 desfase % | M2 pegado ms | M3 long tasks (n / total ms / máx ms) | M4 ready ms | M4 bytes seq hasta ready | M5 heap pico MB | M5 bitmaps pico MB | frames pedidos (red / distintos / repetidos) |', '|---|---|---|---|---|---|---|---|---|');
    for (const [sc, x] of Object.entries(d.scenarios)) {
      L.push(`| ${sc} | ${x.M1.pct} | ${x.M2.maxMs} | ${x.M3.count} / ${x.M3.totalMs} / ${x.M3.maxMs}${x.M3.drawMaxMs != null ? ` (draw ≤ ${x.M3.drawMaxMs} · prog. ≤ ${x.M3.scheduleMaxMs})` : ''} | ${x.M4.readyMs} | ${fmtB(x.M4.seqBytesToReady)} | ${x.M5.heapPeakMB} | ${x.M5.bitmapsPeakMB} | ${x.requests.network} / ${x.requests.distinct} / ${x.requests.dupUrls} |`);
    }
    if (d.memoria) L.push('', `Memoria (3 recorridos): heap tras GC ${d.memoria.heapAfterMB.join(' → ')} MB (${d.memoria.growthPct} %), bitmaps pico ${d.memoria.bitmapsPeakMB} MB (${d.memoria.retainedPeak} frames).`);
    L.push('');
  }
  return L.join('\n');
}

function compare(labels) {
  const R = labels.map((l) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `seq-${l}.json`), 'utf8')));
  const L = [`# Recorrido 3D — antes / después (${labels.join(' → ')})`, '', 'CPU 4× · Fast 4G · build de producción (vite preview) · mediana de corridas. M1 = % de rAF con |mostrado − pedido| > 2 frames; M2 = pegado máximo (ms); M3 = long tasks durante el scroll (cantidad / total ms); M4 = ms hasta el primer frame y bytes de la secuencia hasta ese momento; M5 = pico de bitmaps retenidos (MB) / heap JS (MB).', ''];
  const cell = (f) => R.map((r) => { try { return f(r); } catch { return '—'; } }).join(' → ');
  for (const dev of Object.keys(R[0].devices)) {
    L.push(`## ${dev}`, '', '| escenario | M1 % | M2 ms | M3 n / total ms | M4 ready ms | M4 bytes seq | M5 bitmaps / heap MB |', '|---|---|---|---|---|---|---|');
    for (const sc of Object.keys(R[0].devices[dev].scenarios)) {
      const g = (r) => r.devices[dev].scenarios[sc];
      L.push(`| ${sc} | ${cell((r) => g(r).M1.pct)} | ${cell((r) => g(r).M2.maxMs)} | ${cell((r) => `${g(r).M3.count} / ${g(r).M3.totalMs}`)} | ${cell((r) => g(r).M4.readyMs)} | ${cell((r) => fmtB(g(r).M4.seqBytesToReady))} | ${cell((r) => `${g(r).M5.bitmapsPeakMB} / ${g(r).M5.heapPeakMB}`)} |`);
    }
    L.push('', `Secuencia: ${cell((r) => { const s = Object.values(r.devices[dev].scenarios)[0].seq; return `${s.count} fr ${s.variant} (${s.pxPerFrame} px/fr)`; })}`);
    L.push(`Memoria (3 recorridos, heap tras GC): ${cell((r) => `${r.devices[dev].memoria.heapAfterMB.join('/')} MB, bitmaps ${r.devices[dev].memoria.bitmapsPeakMB} MB`)}`, '');
  }
  const out = path.join(OUT_DIR, 'seq-informe.md');
  fs.writeFileSync(out, L.join('\n') + '\n');
  console.log(L.join('\n'));
  console.log('→', out);
}

// ─── main
if (arg('compare')) { compare(arg('compare').split(',')); process.exit(0); }
const label = arg('label', 'run');
const runs = +arg('runs', 3);
const only = arg('only');
const scenarios = arg('scenarios', SCENARIOS.join(',')).split(',');
const port = +arg('port', 4182);
let preview = null, base = arg('url');
if (!base) { preview = await startPreview(port); base = `http://127.0.0.1:${port}`; }
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-precise-memory-info'] });
const result = {
  label, generated: new Date().toISOString(),
  commit: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: CLIENT }).toString().trim() + (execSync('git status --porcelain -- src public', { cwd: CLIENT }).toString().trim() ? '+cambios' : ''); } catch { return '?'; } })(),
  command: `cd client && npm run build && npm run measure:seq -- --label ${label}`,
  config: { cpu: CPU_RATE, network: 'Fast 4G (9 Mbps / 1.5 Mbps / 165 ms)', runs, dwellMs: 1500, devices: DEVICES },
  devices: {},
};
try {
  for (const dev of Object.keys(DEVICES)) {
    if (only && only !== dev) continue;
    result.devices[dev] = { scenarios: {} };
    for (const sc of scenarios) {
      const rs = [];
      for (let k = 0; k < runs; k++) {
        const r = await runScenario(browser, base, dev, sc);
        console.log(`${dev}/${sc}#${k + 1}: M1 ${r.M1.pct}%${r.M1.cause ? ` (red ${r.M1.cause.network} / dec ${r.M1.cause.decode} / otro ${r.M1.cause.other})` : ''} · M2 ${r.M2.maxMs} ms · M3 ${r.M3.count}/${r.M3.totalMs} ms (máx ${r.M3.maxMs}) · ready ${r.M4.readyMs} ms ${fmtB(r.M4.seqBytesToReady)} · bitmaps ${r.M5.bitmapsPeakMB} MB · frames red ${r.requests.network} (rep ${r.requests.dupUrls})${r.errors.length ? ' · ERR ' + r.errors.join('; ') : ''}`);
        rs.push(r);
      }
      result.devices[dev].scenarios[sc] = aggregate(rs);
    }
    if (!arg('scenarios')) {
      result.devices[dev].memoria = await runMemory(browser, base, dev);
      console.log(`${dev}/memoria:`, JSON.stringify(result.devices[dev].memoria));
    }
  }
} finally {
  await browser.close();
  preview?.kill();
}
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `seq-${label}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
fs.writeFileSync(out.replace(/\.json$/, '.md'), summaryMd(result) + '\n');
console.log('→', out);
