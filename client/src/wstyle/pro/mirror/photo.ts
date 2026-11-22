export const viewLabels = { front: 'Frente', left: 'Lateral izquierdo', right: 'Lateral derecho' } as const;
export type View = keyof typeof viewLabels;
export const views = Object.keys(viewLabels) as View[];
export type Point = { x: number; y: number };
export type Tone = [number, number, number];
export type Height = 'Bajo' | 'Medio' | 'Alto';
export type Stroke = { points: Point[]; width: number };
export type Design = { height: Height; closeness: number; lines: Record<View, Stroke[]> };
export const newDesign = (height: Height): Design => ({ height, closeness: 0.7, lines: { front: [], left: [], right: [] } });
export type Mask = { data: Uint8Array; left: number; right: number; top: number; bottom: number };
export type Photo = { image: HTMLCanvasElement; original: ImageData; mask: Mask | null; tone: Tone | null };
export function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
export function makeMask(data: Uint8Array, width: number, height: number): Mask | null {
  let left = width, right = 0, top = height, bottom = 0, count = 0;
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    count++;
  }
  return count > 32 && right > left && bottom > top ? { data, left, right, top, bottom } : null;
}
export async function readPhoto(file: File): Promise<Photo> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Elige una foto de hasta 30 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = canvasOf(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { image: canvas, original: ctx.getImageData(0, 0, canvas.width, canvas.height), mask: null, tone: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function manualMask(photo: Photo, points: Point[]) {
  const { width, height } = photo.image;
  const ctx = canvasOf(width, height).getContext('2d')!;
  ctx.beginPath();
  points.forEach(({ x, y }, i) => i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height));
  ctx.closePath(); ctx.fill();
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[4 * i + 3];
  return makeMask(mask, width, height);
}
export function sampleTone(photo: Photo, point: Point): Tone {
  const { width, height } = photo.image;
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const left = Math.max(0, x - 1), top = Math.max(0, y - 1);
  const sample = photo.image.getContext('2d')!.getImageData(left, top, Math.min(3, width - left), Math.min(3, height - top)).data;
  const sum: Tone = [0, 0, 0];
  for (let i = 0; i < sample.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += sample[i + k];
  return sum.map(value => Math.round(value / (sample.length / 4))) as Tone;
}
export function fadePhoto(photo: Photo, view: View, level: Height, closeness: number) {
  const { image, mask, tone } = photo;
  if (!mask || !tone) return image;
  const { width, height } = image;
  const canvas = canvasOf(width, height);
  const result = new ImageData(new Uint8ClampedArray(photo.original.data), width, height);
  blendFade(result.data, width, mask, tone, view, level, closeness);
  canvas.getContext('2d')!.putImageData(result, 0, 0);
  return canvas;
}
export function blendFade(pixels: Uint8ClampedArray, width: number, mask: Mask, tone: Tone, view: View, level: Height, closeness: number) {
  const start = { Bajo: 0.63, Medio: 0.44, Alto: 0.25 }[level];
  const half = (mask.right - mask.left) / 2;
  const feather = Math.max(1, Math.round((mask.right - mask.left) * .022));
  for (let y = mask.top; y <= mask.bottom; y++) {
    const depth = (y - mask.top) / (mask.bottom - mask.top);
    for (let x = mask.left; x <= mask.right; x++) {
      const i = y * width + x;
      if (!mask.data[i]) continue;
      const side = Math.abs((x - mask.left) / half - 1);
      const sideWeight = view === 'front' ? Math.min(1, Math.max(0, (side - 0.37) * 2.5)) : 1;
      const progress = Math.max(0, Math.min(1, (depth - start) / (1 - start)));
      // Atenuar desde dentro evita que una máscara imprecisa dibuje un borde en la nuca.
      const horizontal = (mask.data[y * width + Math.max(mask.left, x - feather)] + mask.data[y * width + Math.min(mask.right, x + feather)]) / 510;
      const vertical = (mask.data[Math.max(mask.top, y - feather) * width + x] + mask.data[Math.min(mask.bottom, y + feather) * width + x]) / 510;
      const blend = horizontal * vertical * progress * progress * (3 - 2 * progress) * sideWeight * (0.31 + 0.51 * closeness) * mask.data[i] / 255;
      const offset = 4 * i;
      const grain = ((x * 37 + y * 19 + ((x * y) % 31)) % 17) - 8;
      for (let k = 0; k < 3; k++) pixels[offset + k] += (tone[k] + grain - pixels[offset + k]) * blend;
    }
  }
}
export function paintStroke(ctx: CanvasRenderingContext2D, points: Point[], width: number, color: string) {
  if (!points.length) return;
  const { width: w, height: h } = ctx.canvas;
  ctx.lineWidth = width * Math.min(w, h);
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x * w, points[0].y * h);
  for (const p of points.slice(1)) ctx.lineTo(p.x * w, p.y * h);
  ctx.stroke();
}
export function paintLines(ctx: CanvasRenderingContext2D, lines: Stroke[], tone: Tone | null) {
  const color = 'rgb(' + (tone ?? [189, 153, 130]).join(',') + ')';
  for (const line of lines) paintStroke(ctx, line.points, line.width, color);
}
