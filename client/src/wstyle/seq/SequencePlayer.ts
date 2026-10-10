// SPEC-13/15: reproductor de la secuencia pre-renderizada en Blender (public/wstyle/seq/<formato>/NNNN.webp) como
// fondo. Puerto TS de barberia-3d/site/seq.js.
// - Carga progresiva: primero los 7 frames ancla (progreso real para la pantalla de carga), luego 1 de cada 5 y luego
//   el resto, siempre priorizando los más cercanos al frame actual. Mientras un frame no está se dibuja el más
//   cercano ya cargado.
// - Canvas 2D a pantalla completa con ajuste "cover".
// - Si el manifest o algún ancla falla (404, decode), create() devuelve null y el sitio cae al 3D en tiempo real.
const pad = (i: number) => String(i).padStart(4, '0');

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

export class SequencePlayer {
  static async create({ canvas, fmt, base = './seq/', reduced = false, onProgress = () => {}, fallbackFmt }: CreateOptions): Promise<SequencePlayer | null> {
    let manifest: SeqManifest;
    try {
      const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return null;
      manifest = await r.json();
    } catch { return null; }
    const usable = (f?: SeqVariant) => !!f && f.anchorsAvailable && f.available > 0;
    let used: 'desktop' | 'mobile' = fmt;
    let f = manifest.formats?.[fmt];
    if (!usable(f) && fallbackFmt && usable(manifest.formats?.[fallbackFmt])) { used = fallbackFmt; f = manifest.formats[fallbackFmt]; }
    // Sin las anclas no hay recorrido: se usa el 3D.
    if (!f || !usable(f)) return null;
    const { name: variant, v: m } = pickVariant(f, innerWidth, devicePixelRatio || 1);
    if (!usable(m)) return null;
    const p = new SequencePlayer(canvas, base + m.path.replace(/^seq\//, ''), m, reduced, used, variant);
    let done = 0;
    onProgress(0, m.anchorFrames.length);
    try {
      // allSettled: si un ancla falla (404/decode) no quedan promesas rechazadas sin manejar y se cae al 3D.
      const rs = await Promise.allSettled(m.anchorFrames.map((n) => p.load(n).then(() => onProgress(++done, m.anchorFrames.length))));
      if (rs.some((r) => r.status === 'rejected')) { p.dispose(); return null; }
    } catch { return null; }
    if (!reduced) p.startBackground();
    return p;
  }

  readonly ctx: CanvasRenderingContext2D;
  readonly count: number; readonly total: number; readonly size: [number, number];
  readonly anchorFrames: number[];
  readonly imgs = new Map<number, HTMLImageElement>();
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

  get loaded() { return this.imgs.size; }

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
      this.imgs.set(n, img);
      if (Math.abs(n - this.wanted) < Math.abs(this.shown - this.wanted)) this.dirty = true;   // hay uno más cercano
      return img;
    }, (e) => { this.inflight.delete(n); this.failed.add(n); throw e; });
  }

  // Carga progresiva REAL (PR #9 D12): después de las anclas, 1 de cada 5; el resto SOLO cerca del frame actual
  // (± NEAR). Si no hay nada que bajar, vuelve a mirar en un rato (el usuario pudo haber scrolleado).
  static readonly NEAR = 10;
  startBackground(concurrency = 4) {
    const pending = () => {
      const c = Number.isFinite(this.cur) ? this.cur : this.wanted;
      const want = (n: number) => !this.imgs.has(n) && !this.failed.has(n) && !this.inflight.has(n);
      const coarse: number[] = [], near: number[] = [];
      for (let n = 1; n <= this.count; n++) if (want(n)) {
        if ((n - 1) % 5 === 0) coarse.push(n);
        else if (Math.abs(n - c) <= SequencePlayer.NEAR) near.push(n);
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
    const n = this.nearest(Math.min(this.count, Math.max(1, Math.round(this.cur))));
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

  dispose() { this.disposed = true; clearTimeout(this.idle); this.imgs.clear(); }
}
