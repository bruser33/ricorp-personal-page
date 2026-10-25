// SPEC-13/15/30: reproductor de la secuencia pre-renderizada en Blender (public/wstyle/seq/<formato>/NNNN.webp) como
// fondo. Puerto TS de barberia-3d/site/seq.js, rehecho en SPEC-30 para que el recorrido no se "pegue":
// - Bytes y bitmaps por separado. Cada frame se descarga UNA vez (fetch → Blob, ~40 KB) y el Blob se conserva toda la
//   sesión (la secuencia completa son pocos MB): volver a una zona nunca re-descarga (antes se liberaba el <img> y se
//   volvía a pedir). Lo caro en memoria —el bitmap decodificado (ancho × alto × 4)— sí está acotado.
// - Decodificación fuera del hilo principal: createImageBitmap(blob) decodifica en un hilo del navegador y el
//   ImageBitmap se dibuja sin re-decodificar (un <img> grande puede decodificarse de nuevo dentro de drawImage, en el
//   hilo principal). Respaldo para navegadores sin createImageBitmap (Safari antiguo): <img> desde un blob URL +
//   img.decode(). Se puede forzar el respaldo con ?seqdecode=img para probarlo.
// - Prefetch direccional y jerárquico (schedule.ts): lo inmediato primero; después lo que viene en el sentido y a la
//   velocidad del scroll, repartiendo primero frames gruesos (1 de cada 16, 8, 4, 2) por toda la secuencia, así un
//   scroll rápido siempre tiene un vecino cercano.
// - Ventana de bitmaps adaptable: presupuesto en bytes según dispositivo (bitmapBudget), más ancha hacia donde va el
//   usuario; se libera primero lo que más tardaría en volver a necesitarse (histéresis: solo al pasar el presupuesto).
// - Se dibuja siempre el frame decodificado MÁS CERCANO al pedido (nearestAvailable), nunca un ancla lejana si hay
//   algo más cerca. Sin suavizado propio: el scroll ya viene suavizado (Lenis) y la densidad de frames es alta.
// - Pestaña en segundo plano: no se programa nada; al volver se retoma con la misma concurrencia (sin picos).
// - Un frame que falla (404/decode) queda marcado y se salta al vecino disponible.
// - Si falla un ancla de la variante hd se reintenta con la sd; si el manifest o un ancla sd falla (404, decode) o el
//   manifest no responde en MANIFEST_TIMEOUT ms, create() devuelve null y el sitio cae al 3D en tiempo real.
import { bitmapBudget, decodeTargets, evictionOrder, nearestAvailable, nextFetch } from './schedule';

const pad = (i: number) => String(i).padStart(4, '0');
const MANIFEST_TIMEOUT = 8000;

export interface SeqVariant {
  count: number; available: number; complete: boolean; size: [number, number];
  anchorFrames: number[]; anchorsAvailable: boolean; bytes: number; path: string;
}
// Formato (desktop/mobile): los campos de la variante sd (compatibilidad) + variantes por resolución (sd, hd).
export interface SeqFormat extends SeqVariant { variants?: Record<string, SeqVariant | undefined> }
export type Variant = 'sd' | 'hd';

// Elige la variante por densidad real de píxeles (PR #9 D13): hd solo si está completa y la pantalla la aprovecha
// (ancho físico > 1.15 × el ancho de la sd).
export function pickVariant(f: SeqFormat, cssWidth: number, dpr: number): { name: Variant; v: SeqVariant } {
  const sd = f.variants?.sd ?? f, hd = f.variants?.hd;
  if (hd && hd.complete && hd.anchorsAvailable && cssWidth * dpr > sd.size[0] * 1.15) return { name: 'hd', v: hd };
  return { name: 'sd', v: sd };
}
export interface SeqManifest { formato: string; formats: Record<string, SeqFormat | undefined> }

interface CreateOptions {
  canvas: HTMLCanvasElement; fmt: 'desktop' | 'mobile'; base?: string; reduced?: boolean;
  onProgress?: (done: number, total: number) => void;
  // En layout compacto, si el formato móvil todavía no está (render en curso) se usa desktop (documentado).
  fallbackFmt?: 'desktop' | 'mobile';
}
interface StartOptions extends CreateOptions { base: string; f: SeqFormat; used: 'desktop' | 'mobile'; forceSd?: boolean }
const usable = (f?: SeqVariant) => !!f && f.anchorsAvailable && f.available > 0;

// Manifest con timeout: si el servidor no responde, se aborta y se cae al 3D (no queda el loader colgado).
async function fetchManifest(base: string): Promise<SeqManifest | null> {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), MANIFEST_TIMEOUT);
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache', signal: ac.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// ─── Decodificación
interface Decoded { src: CanvasImageSource; close(): void }
const forceImg = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('seqdecode') === 'img';
export const decoderKind = (): 'bitmap' | 'img' => (typeof createImageBitmap === 'function' && !forceImg() ? 'bitmap' : 'img');
async function decodeBlob(blob: Blob, kind: 'bitmap' | 'img'): Promise<Decoded> {
  if (kind === 'bitmap') {
    const b = await createImageBitmap(blob);
    return { src: b, close: () => b.close() };
  }
  const url = URL.createObjectURL(blob), img = new Image();
  img.decoding = 'async'; img.src = url;
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
  return { src: img, close: () => { img.src = ''; URL.revokeObjectURL(url); } };
}

export class SequencePlayer {
  static async create(o: CreateOptions): Promise<SequencePlayer | null> {
    const base = o.base ?? './seq/', { fmt, fallbackFmt } = o;
    const manifest = await fetchManifest(base);
    if (!manifest) return null;
    let used: 'desktop' | 'mobile' = fmt;
    let f = manifest.formats?.[fmt];
    if (!usable(f) && fallbackFmt && usable(manifest.formats?.[fallbackFmt])) { used = fallbackFmt; f = manifest.formats[fallbackFmt]; }
    // Sin las anclas no hay recorrido: se usa el 3D.
    if (!f || !usable(f)) return null;
    return SequencePlayer.start({ ...o, base, f, used });
  }

  private static async start(o: StartOptions): Promise<SequencePlayer | null> {
    const { canvas, base, f, used, reduced = false, onProgress = () => {} } = o;
    const { name: variant, v: m } = o.forceSd ? { name: 'sd' as const, v: f.variants?.sd ?? f } : pickVariant(f, innerWidth, devicePixelRatio || 1);
    if (!usable(m)) return null;
    const p = new SequencePlayer(canvas, base + m.path.replace(/^seq\//, ''), m, reduced, used, variant);
    let done = 0;
    onProgress(0, m.anchorFrames.length);
    // Las anclas se descargan y decodifican antes de empezar (validan la variante y dan el progreso real del loader).
    // allSettled: si un ancla falla (404/decode) no quedan promesas rechazadas sin manejar.
    const rs = await Promise.allSettled(m.anchorFrames.map((n) => p.fetchFrame(n).then(() => p.decodeFrame(n)).then(() => onProgress(++done, m.anchorFrames.length))));
    if (rs.some((r) => r.status === 'rejected')) {
      p.dispose();
      // R2: un ancla hd rota no tira la secuencia: se reintenta con la variante sd antes de caer al 3D.
      if (variant === 'hd') return SequencePlayer.start({ ...o, forceSd: true });
      return null;
    }
    // reduced-motion: solo las anclas (sin carga masiva en background).
    if (!reduced) p.startBackground();
    return p;
  }

  readonly ctx: CanvasRenderingContext2D;
  readonly count: number; readonly total: number; readonly size: [number, number];
  readonly anchorFrames: number[];
  readonly budget: number;                                  // bitmaps decodificados como máximo
  readonly decoder = decoderKind();
  private readonly blobs = new Map<number, Blob>();         // bytes descargados (toda la sesión)
  private readonly bmps = new Map<number, Decoded>();       // decodificados retenidos (acotado por budget)
  private readonly fetching = new Set<number>();
  private readonly decoding = new Set<number>();
  private readonly failed = new Set<number>();
  private keep = new Set<number>();
  private readonly ac = new AbortController();
  private background = false;
  private disposed = false;
  private pumpAt = NaN;
  private lastT = NaN; private lastWanted = NaN;
  vel = 0;            // frames/s del frame pedido (con signo, suavizado)
  wanted = 1;         // frame (fraccional) pedido por el scroll
  shown = 0;          // frame efectivamente dibujado (el decodificado más cercano al pedido)
  dirty = true;
  fetches = 0;        // requests de frames hechos (diagnóstico: cada frame se pide una vez)
  fetchMs = 300;      // duración media de una descarga de frame (EMA)
  drawMaxMs = 0;      // diagnóstico (M3): lo más caro que tomó un drawImage y una pasada de programación
  pumpMaxMs = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly dir: string;
  private readonly reduced: boolean;
  private readonly fetchConcurrency = 6;   // HTTP/1.1: 6 por host; con 165 ms de latencia 4 no llenan el ancho de banda
  private readonly decodeConcurrency: number;
  readonly format: 'desktop' | 'mobile';
  readonly variant: Variant;

  constructor(canvas: HTMLCanvasElement, dir: string, m: SeqVariant, reduced: boolean, format: 'desktop' | 'mobile', variant: Variant) {
    this.canvas = canvas; this.dir = dir; this.reduced = reduced; this.format = format; this.variant = variant;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.count = m.available; this.total = m.count; this.size = m.size; this.anchorFrames = m.anchorFrames;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const mobile = format === 'mobile' || matchMedia('(pointer: coarse)').matches;
    this.budget = Math.max(this.anchorFrames.length, bitmapBudget({ width: m.size[0], height: m.size[1], mobile, deviceMemory: nav.deviceMemory }));
    this.decodeConcurrency = mobile ? 2 : 3;
    document.addEventListener('visibilitychange', this.onVisible);
  }

  // Diagnóstico (medición SPEC-30): 0 nada, 1 descargando, 2 bytes, 3 decodificando, 4 bitmap listo, -1 falló.
  stateOf(n: number) {
    return this.bmps.has(n) ? 4 : this.decoding.has(n) ? 3 : this.blobs.has(n) ? 2 : this.fetching.has(n) ? 1 : this.failed.has(n) ? -1 : 0;
  }

  get loaded() { return this.blobs.size; }
  get retained() { return this.bmps.size; }
  get retainedBytes() { return this.bmps.size * this.size[0] * this.size[1] * 4; }

  private readonly onVisible = () => { if (!document.hidden) this.pump(); };

  fetchFrame(n: number): Promise<void> {
    if (this.blobs.has(n)) return Promise.resolve();
    this.fetching.add(n); this.fetches++;
    const t0 = performance.now();
    return fetch(`${this.dir}${pad(n)}.webp`, { signal: this.ac.signal })
      .then((r) => { if (!r.ok) throw new Error(`frame ${n}: HTTP ${r.status}`); return r.blob(); })
      .then((b) => {
        this.fetching.delete(n);
        // Tiempo real pedido → bytes (latencia + cola de la conexión): el prefetch apunta a donde estará el usuario
        // cuando llegue la respuesta.
        this.fetchMs += (Math.min(2000, performance.now() - t0) - this.fetchMs) * .2;
        if (!this.disposed) this.blobs.set(n, b);
      },
        (e) => { this.fetching.delete(n); this.failed.add(n); throw e; });
  }

  decodeFrame(n: number): Promise<void> {
    const blob = this.blobs.get(n);
    if (!blob || this.bmps.has(n)) return Promise.resolve();
    this.decoding.add(n);
    return decodeBlob(blob, this.decoder).then((d) => {
      this.decoding.delete(n);
      if (this.disposed) { d.close(); return; }
      // El usuario ya se fue de esa zona y no hay lugar: no se retiene (el presupuesto nunca se pasa).
      if (this.background && !this.keep.has(n) && this.bmps.size >= this.budget) { d.close(); return; }
      this.bmps.set(n, d);
      const at = Math.round(this.wanted);
      if (!this.shown || Math.abs(n - at) < Math.abs(this.shown - at)) this.dirty = true;   // hay uno más cercano
    }, (e) => { this.decoding.delete(n); this.failed.add(n); this.blobs.delete(n); throw e; });
  }

  startBackground() { this.background = true; this.pump(); }

  // Programa descargas y decodificaciones según el frame pedido y la velocidad, y libera lo que sobra.
  private pump() {
    if (this.disposed || document.hidden) return;
    const t0 = performance.now();
    this.schedule();
    this.pumpMaxMs = Math.max(this.pumpMaxMs, performance.now() - t0);
  }
  private schedule() {
    const at = Math.min(this.count, Math.max(1, this.wanted)), vel = this.vel;
    if (this.background) {
      const want = (i: number) => !this.blobs.has(i) && !this.fetching.has(i) && !this.failed.has(i);
      while (this.fetching.size < this.fetchConcurrency) {
        const n = nextFetch(this.count, at, vel, want, this.fetchMs / 1000);
        if (n == null) break;
        this.fetchFrame(n).catch(() => {}).finally(() => this.pump());
      }
    }
    // budget − 1: siempre queda lugar para el frame que se está mostrando (puede no estar entre los deseados).
    const targets = this.reduced ? this.anchorFrames : decodeTargets(this.count, at, vel, this.budget - 1, (i) => this.blobs.has(i) && !this.failed.has(i));
    this.keep = new Set(targets);
    for (const n of targets) {
      if (this.decoding.size >= this.decodeConcurrency) break;
      if (!this.bmps.has(n) && !this.decoding.has(n) && this.blobs.has(n)) this.decodeFrame(n).catch(() => {}).finally(() => this.pump());
    }
    if (this.bmps.size > this.budget) {
      for (const n of evictionOrder(this.bmps.keys(), this.keep, at, vel, this.shown)) {
        if (this.bmps.size <= this.budget) break;
        this.bmps.get(n)!.close(); this.bmps.delete(n);
      }
    }
  }

  // Frame decodificado más cercano a n.
  nearest(n: number) { return nearestAvailable(n, (i) => this.bmps.has(i), this.count, Math.sign(this.vel)); }

  // wanted: frame fraccional para el scroll actual. Devuelve true si dibujó.
  update(wanted: number) {
    const now = performance.now(), dt = (now - this.lastT) / 1000;
    if (dt > 0) {
      // Velocidad del pedido (frames/s) con suavizado exponencial; un salto (navbar) no la dispara sin límite.
      const inst = dt < .5 ? Math.max(-600, Math.min(600, (wanted - this.lastWanted) / dt)) : 0;
      this.vel += (inst - this.vel) * (dt < .5 ? 1 - Math.exp(-dt / .15) : 1);
    }
    this.lastT = now; this.lastWanted = wanted; this.wanted = wanted;
    const at = Math.min(this.count, Math.max(1, Math.round(wanted)));
    if (at !== this.pumpAt) { this.pumpAt = at; this.pump(); }
    const n = this.nearest(at);
    if (n && (n !== this.shown || this.dirty)) { this.draw(n); return true; }
    return false;
  }

  get settled() { return this.shown === this.nearest(Math.min(this.count, Math.max(1, Math.round(this.wanted)))) && !this.dirty; }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.dirty = true;
  }

  draw(n: number) {
    const d = this.bmps.get(n); if (!d) return;
    const t0 = performance.now();
    const cw = this.canvas.width, ch = this.canvas.height, [fw, fh] = this.size;
    const s = Math.max(cw / fw, ch / fh), w = fw * s, h = fh * s;
    this.ctx.drawImage(d.src, (cw - w) / 2, (ch - h) / 2, w, h);
    this.shown = n; this.dirty = false;
    this.drawMaxMs = Math.max(this.drawMaxMs, performance.now() - t0);
  }

  dispose() {
    this.disposed = true;
    this.ac.abort();
    document.removeEventListener('visibilitychange', this.onVisible);
    for (const d of this.bmps.values()) d.close();
    this.bmps.clear(); this.blobs.clear();
  }
}
