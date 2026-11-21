import { canvasOf, views, type Photo, type View } from './photo';

export type Sources = Record<View, Photo>;
export type Result = Record<View, HTMLCanvasElement>;
export type Scope = View | 'all';
const column = 512, height = 1024;

function frame(photo: Photo, index: number) {
  const scale = Math.min(column / photo.image.width, height / photo.image.height);
  const w = Math.round(photo.image.width * scale), h = Math.round(photo.image.height * scale);
  return { x: column * index + Math.floor((column - w) / 2), y: Math.floor((height - h) / 2), w, h };
}

function maskCanvas(photo: Photo) {
  const layer = canvasOf(photo.image.width, photo.image.height);
  const ctx = layer.getContext('2d')!;
  const pixels = ctx.createImageData(layer.width, layer.height);
  const mask = photo.mask!.data;
  for (let i = 0; i < mask.length; i++) pixels.data[4 * i + 3] = mask[i];
  ctx.putImageData(pixels, 0, 0);
  return layer;
}

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('No pudimos preparar las fotos.')), 'image/png'));
}

export async function prepareSheet(photos: Sources, base: Result | null, scope: Scope) {
  const image = canvasOf(column * 3, height), mask = canvasOf(column * 3, height);
  const ctx = image.getContext('2d')!, alpha = mask.getContext('2d')!;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, image.width, height);
  alpha.fillRect(0, 0, mask.width, height);
  alpha.globalCompositeOperation = 'destination-out';
  views.forEach((view, index) => {
    const photo = photos[view], { x, y, w, h } = frame(photo, index);
    ctx.drawImage(base?.[view] ?? photo.image, x, y, w, h);
    if (scope === 'all' || scope === view) alpha.drawImage(maskCanvas(photo), x, y, w, h);
  });
  return Promise.all([png(image), png(mask)]);
}

export function blendHair(original: Uint8ClampedArray, edited: Uint8ClampedArray, hair: Uint8Array) {
  for (let i = 0; i < hair.length; i++) {
    if (!hair[i]) continue;
    const weight = hair[i] / 255;
    for (let k = 4 * i; k < 4 * i + 3; k++) original[k] += weight * (edited[k] - original[k]);
  }
}

export async function unpackSheet(blob: Blob, photos: Sources, base: Result | null, scope: Scope): Promise<Result> {
  const image = new Image(), url = URL.createObjectURL(blob);
  try {
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== column * 3 || image.naturalHeight !== height) throw Error('La IA devolvió otro encuadre. Conservamos la versión anterior.');
    const result = {} as Result;
    views.forEach((view, index) => {
      const photo = photos[view], source = base?.[view] ?? photo.image;
      if (scope !== 'all' && scope !== view) { result[view] = source; return; }
      const canvas = canvasOf(source.width, source.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const { x, y, w, h } = frame(photo, index);
      ctx.drawImage(source, 0, 0);
      const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
      blendHair(original.data, ctx.getImageData(0, 0, canvas.width, canvas.height).data, photo.mask!.data);
      ctx.putImageData(original, 0, 0);
      result[view] = canvas;
    });
    return result;
  } finally { URL.revokeObjectURL(url); }
}
