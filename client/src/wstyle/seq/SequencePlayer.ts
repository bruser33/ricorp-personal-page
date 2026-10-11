// SPEC-13/15: reproductor de la secuencia pre-renderizada en Blender (public/wstyle/seq/<formato>/NNNN.webp) como
// fondo. Puerto TS de barberia-3d/site/seq.js.
// - Carga progresiva: primero los 7 frames ancla (progreso real para la pantalla de carga), luego los de la ventana
//   alrededor del frame actual, priorizando los más cercanos. Mientras un frame no está se dibuja el más cercano ya
//   cargado.
// - Memoria acotada (PR #9 ronda 4, R1): decodificados como máximo las anclas + una ventana de ±WINDOW frames
//   alrededor del frame actual; los demás se liberan y se vuelven a pedir al volver (150 frames hd decodificados en
//   un móvil DPR 3 son ~860 MB y iOS mata la pestaña).
// - Canvas 2D a pantalla completa con ajuste "cover".
// - Si falla un ancla de la variante hd se reintenta con la sd; si el manifest o un ancla sd falla (404, decode) o el
//   manifest no responde en MANIFEST_TIMEOUT ms, create() devuelve null y el sitio cae al 3D en tiempo real.
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
    // allSettled: si un ancla falla (404/decode) no quedan promesas rechazadas sin manejar.
    const rs = await Promise.allSettled(m.anchorFrames.map((n) => p.load(n).then(() => onProgress(++done, m.anchorFrames.length))));
    if (rs.some((r) => r.status === 'rejected')) {
      p.dispose();
      // R2: un ancla hd rota no tira la secuencia: se reintenta con la variante sd antes de caer al 3D.
      if (variant === 'hd') return SequencePlayer.start({ ...o, forceSd: true });
      return null;
    }
    if (!reduced) p.startBackground();
    return p;
  }

  readonly ctx: CanvasRenderingContext2D;
  readonly count: number; readonly total: number; readonly size: [number, number];
  readonly anchorFrames: number[];
  readonly imgs = new Map<number, HTMLImageElement>();   // decodificados retenidos (anclas + ventana)
  private seen = new Set<number>();                       // frames distintos cargados alguna vez
  private center = NaN;                                   // centro de la ventana de retención
  private failed = new Set<number>();
  private inflight = new Set<number>();
  private disposed = false;
  cur = NaN;          // frame fraccional suavizado
  wanted = 1;
  shown = 0;          // frame efectivamente dibujado (puede ser un vecino si el pedido no cargó)
  dirty = true;

  private readonly canvas: HTMLCanvasElement;
  private readonly dir: string;
  private readonly reduced: boolean;
  readonly format: 'desktop' | 'mobile';
  readonly variant: Variant;

  constructor(canvas: HTMLCanvasElement, dir: string, m: SeqVariant, reduced: boolean, format: 'desktop' | 'mobile', variant: Variant) {
    this.canvas = canvas; this.dir = dir; this.reduced = reduced; this.format = format; this.variant = variant;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.count = m.available; this.total = m.count; this.size = m.size; this.anchorFrames = m.anchorFrames;
  }

  get loaded() { return this.seen.size; }
  get retained() { return this.imgs.size; }

  // Ventana de retención: anclas siempre; el resto solo a ±WINDOW del frame actual.
  static readonly WINDOW = 20;
  private keep(n: number) {
    const c = Number.isFinite(this.center) ? this.center : this.wanted;
    return this.anchorFrames.includes(n) || Math.abs(n - c) <= SequencePlayer.WINDOW;
  }
  private release(img: HTMLImageElement) { img.src = ''; }   // suelta el bitmap decodificado
  private evict(center: number) {
    this.center = center;
    for (const [n, img] of this.imgs) if (!this.keep(n)) { this.release(img); this.imgs.delete(n); }
  }

  load(n: number): Promise<HTMLImageElement> {
    const have = this.imgs.get(n);
    if (have) return Promise.resolve(have);
    this.inflight.add(n);
    const img = new Image();
    img.decoding = 'async';
    img.src = `${this.dir}${pad(n)}.webp`;
    return img.decode().then(() => {
      this.inflight.delete(n);
      if (this.disposed) return img;
      this.seen.add(n);
      if (!this.keep(n)) { this.release(img); return img; }   // el usuario ya se fue de esa zona
      this.imgs.set(n, img);
      if (Math.abs(n - this.wanted) < Math.abs(this.shown - this.wanted)) this.dirty = true;   // hay uno más cercano
      return img;
    }, (e) => { this.inflight.delete(n); this.failed.add(n); throw e; });
  }

  // Carga progresiva REAL (PR #9 D12): después de las anclas, SOLO la ventana alrededor del frame actual (primero 1 de
  // cada 5, después el resto, los más cercanos antes). Si no hay nada que bajar, vuelve a mirar en un rato (el usuario
  // pudo haber scrolleado).
  startBackground(concurrency = 4) {
    const pending = () => {
      const c = Number.isFinite(this.cur) ? this.cur : this.wanted;
      const want = (n: number) => !this.imgs.has(n) && !this.failed.has(n) && !this.inflight.has(n);
      const coarse: number[] = [], near: number[] = [];
      for (let n = Math.max(1, Math.round(c) - SequencePlayer.WINDOW); n <= Math.min(this.count, Math.round(c) + SequencePlayer.WINDOW); n++) if (want(n)) {
        ((n - 1) % 5 === 0 ? coarse : near).push(n);
      }
      const pool = coarse.length ? coarse : near;
      return pool.sort((a, b) => Math.abs(a - c) - Math.abs(b - c));
    };
    const next = (): void => {
      if (this.disposed) return;
      const n = pending()[0];
      if (n == null) { this.idle = setTimeout(next, 200); return; }
      this.load(n).catch(() => {}).finally(next);
    };
    for (let k = 0; k < concurrency; k++) next();
  }
  private idle: ReturnType<typeof setTimeout> | undefined;

  // Frame cargado más cercano a n.
  nearest(n: number) {
    if (this.imgs.has(n)) return n;
    for (let d = 1; d < this.count; d++) {
      if (this.imgs.has(n - d)) return n - d;
      if (this.imgs.has(n + d)) return n + d;
    }
    return 0;
  }

  // wanted: frame fraccional para el scroll actual. k: factor de suavizado del frame (1 = sin suavizar).
  update(wanted: number, k: number) {
    this.wanted = wanted;
    if (!Number.isFinite(this.cur) || this.reduced) this.cur = wanted;
    else { this.cur += (wanted - this.cur) * k; if (Math.abs(wanted - this.cur) < .01) this.cur = wanted; }
    const at = Math.min(this.count, Math.max(1, Math.round(this.cur)));
    if (at !== this.center) this.evict(at);
    const n = this.nearest(at);
    if (n !== this.shown || this.dirty) { this.draw(n); return true; }
    return false;
  }

  get settled() { return this.cur === this.wanted && this.shown === this.nearest(Math.round(this.wanted)) && !this.dirty; }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.dirty = true;
  }

  draw(n: number) {
    const img = this.imgs.get(n); if (!img) return;
    const cw = this.canvas.width, ch = this.canvas.height, [fw, fh] = this.size;
    const s = Math.max(cw / fw, ch / fh), w = fw * s, h = fh * s;
    this.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    this.shown = n; this.dirty = false;
  }

  dispose() { this.disposed = true; clearTimeout(this.idle); for (const img of this.imgs.values()) this.release(img); this.imgs.clear(); }
}
