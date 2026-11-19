// Dibujo del kit de difusión en canvas (SPEC-58): QR suelto, placa de historia 1080×1920 y cartel A4/Carta a 300 dpi.
// Todo en el navegador, con las fuentes de la marca ya cargadas (CB-03). Solo la paleta de la marca: negro (ink),
// hueso (bone) y latón (brass); el QR siempre oscuro sobre hueso (RN-02).
import { BONE, BRASS, INK, POSTER, POSTER_QR_RATIO, qrMatrix, qrRgba, STORY, type PosterSize } from './difusion';

const FONT_SPECS = ['400 64px Anton', 'italic 500 64px "Cormorant Garamond"', '600 64px Inter', '400 64px Inter'];
const FAMILIES = ['Anton', 'Cormorant Garamond', 'Inter'];

/* CB-03: espera a que las fuentes de la marca estén cargadas. Si alguna no carga (sin red), falla: nunca sale una
   pieza con fuente de sistema. */
export async function ensureBrandFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) throw new Error('fonts');
  await Promise.all(FONT_SPECS.map((s) => document.fonts.load(s).catch(() => [])));
  await document.fonts.ready;
  const loaded = new Set<string>();
  document.fonts.forEach((f) => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); });
  if (!FAMILIES.every((f) => loaded.has(f))) throw new Error('fonts');
}

/* Texto con espaciado entre letras (ctx.letterSpacing no está en todos los Safari). */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
  ctx.textAlign = align;
}

/* Achica la fuente hasta que el texto entre en `max` px. Devuelve el tamaño usado. */
function fit(ctx: CanvasRenderingContext2D, font: (px: number) => string, text: string, size: number, max: number) {
  let px = size;
  ctx.font = font(px);
  while (px > 8 && ctx.measureText(text).width > max) { px -= 2; ctx.font = font(px); }
  return px;
}

/* Grano de película (la textura de la marca, como FilmFx): ruido determinista en un mosaico de 256 px. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, color: [number, number, number], alpha: number) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const t = tile.getContext('2d')!;
  const img = t.createImageData(256, 256);
  let seed = 0x5eed;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    img.data[i] = color[0]; img.data[i + 1] = color[1]; img.data[i + 2] = color[2];
    img.data[i + 3] = Math.round(((seed >>> 24) / 255) * alpha * 255);
  }
  t.putImageData(img, 0, 0);
  const p = ctx.createPattern(tile, 'repeat');
  if (!p) return;
  ctx.save();
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* QR oscuro sobre hueso dentro de un cuadrado de `px` (la zona de silencio queda dentro del cuadrado). */
export function drawQr(ctx: CanvasRenderingContext2D, url: string, x0: number, y0: number, px: number) {
  // Mismo rasterizador que valida difusion.test.ts (qrRgba + jsQR): lo que se descarga es lo que se probó.
  const size = Math.round(px);
  ctx.putImageData(new ImageData(qrRgba(qrMatrix(url), size), size, size), Math.round(x0), Math.round(y0));
}

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/* QR suelto 1024×1024 (PNG). */
export function renderQrPng(url: string, target?: HTMLCanvasElement) {
  const c = target ?? canvasOf(1024, 1024);
  c.width = c.height = 1024;
  drawQr(c.getContext('2d')!, url, 0, 0, 1024);
  return c;
}

const anton = (px: number) => `400 ${px}px Anton`;
const serif = (px: number) => `italic 500 ${px}px "Cormorant Garamond"`;
const inter = (w: 400 | 600) => (px: number) => `${w} ${px}px Inter`;

/* Placa de historia de Instagram 1080×1920: fondo negro con grano y viñeta, wordmark, titular, QR y link.
   Deja libres ~250 px arriba y abajo (interfaz de Instagram). */
export function renderStory(url: string, display: string, target?: HTMLCanvasElement) {
  const { w: W, h: H, safe } = STORY;
  const c = target ?? canvasOf(W, H);
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.3, W / 2, H * 0.45, H * 0.75);
  v.addColorStop(0, 'rgba(14,13,12,0)');
  v.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, [0xed, 0xe6, 0xda], 0.06);

  const top = safe + 70;
  ctx.fillStyle = BONE;
  ctx.font = anton(64);
  spaced(ctx, 'WS STYLE', W / 2, top, 14);
  ctx.fillStyle = BRASS;
  ctx.fillRect(W / 2 - 60, top + 34, 120, 4);

  ctx.fillStyle = BONE;
  const size = fit(ctx, anton, 'RESERVA', 230, W - 180);
  ctx.font = anton(size);
  ctx.fillText('RESERVA', W / 2, top + 72 + size);
  ctx.fillText('TU HORA', W / 2, top + 72 + size * 2);
  const titleEnd = top + 72 + size * 2;

  ctx.fillStyle = BRASS;
  ctx.font = serif(58);
  ctx.fillText('Elige día, hora y barbero.', W / 2, titleEnd + 80);

  const qr = 520;
  const qy = titleEnd + 130;
  ctx.fillStyle = BRASS;
  ctx.fillRect((W - qr) / 2 - 4, qy - 4, qr + 8, qr + 8);
  drawQr(ctx, url, (W - qr) / 2, qy, qr);

  ctx.fillStyle = BONE;
  fit(ctx, inter(600), display, 40, W - 160);
  ctx.fillText(display, W / 2, Math.min(qy + qr + 74, H - safe - 6));
  return c;
}

/* Cartel imprimible a 300 dpi (A4 2480×3508 o Carta 2550×3300). Fondo hueso (ahorra tinta y deja el QR oscuro
   sobre claro), titular en Anton negro y acentos de latón. `lines` = datos reales (horario/dirección) o nada. */
export function renderPoster(size: PosterSize, url: string, display: string, lines: string[], target?: HTMLCanvasElement) {
  const { w: W, h: H } = POSTER[size];
  const c = target ?? canvasOf(W, H);
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = BONE;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, [0x0e, 0x0d, 0x0c], 0.05);
  const m = Math.round(W * 0.05);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 8;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  const inner = W - 4 * m;

  // Medidas primero (el titular se achica si no cabe) y después todo el bloque se centra en el marco.
  ctx.font = anton(330);
  const t = fit(ctx, anton, 'RESERVA TU HORA', 330, inner);
  const qr = Math.floor(W * POSTER_QR_RATIO); // RN-02: ≈ 11 cm a 300 dpi
  const blockH = 170 + 90 + t + 170 + 90 + qr + 140 + lines.length * 100 + 30;
  let y = Math.round(Math.max(m * 2, (H - blockH) / 2)) + 170;

  ctx.fillStyle = INK;
  ctx.font = anton(170);
  spaced(ctx, 'WS STYLE', W / 2, y, 36);
  ctx.fillStyle = BRASS;
  ctx.fillRect(W / 2 - 140, y + 60, 280, 8);

  ctx.fillStyle = INK;
  ctx.font = anton(t);
  y += 90 + t;
  ctx.fillText('RESERVA TU HORA', W / 2, y);

  ctx.fillStyle = BRASS;
  ctx.font = serif(110);
  y += 170;
  ctx.fillText('Escanea y elige día, hora y barbero.', W / 2, y);

  // Coordenadas enteras: sin costuras entre módulos del QR.
  const qx = Math.round((W - qr) / 2);
  const qy = Math.round(y + 90);
  ctx.fillStyle = BRASS;
  ctx.fillRect(qx - 8, qy - 8, qr + 16, qr + 16);
  drawQr(ctx, url, qx, qy, qr);

  y = qy + qr + 140;
  ctx.fillStyle = INK;
  fit(ctx, inter(600), display, 96, inner);
  ctx.fillText(display, W / 2, y);
  for (const line of lines) {
    y += 100;
    fit(ctx, inter(400), line, 64, inner);
    ctx.fillText(line, W / 2, y);
  }
  return c;
}

/* ─── Descargas (AC-03 / CB-04): blob + enlace con `download` (sin pestaña en blanco en Safari iOS). */
export function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png'));
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* Hoja de compartir del sistema (móvil) con el archivo; false si el navegador no la soporta. */
export async function shareFile(blob: Blob, name: string): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file] });
  } catch {
    /* la persona cerró la hoja: no es un error */
  }
  return true;
}
