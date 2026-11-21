import { canvasOf, fadePhoto, paintLines, views, viewLabels, type Design, type Photo, type View } from './photo';
export function exportReference(photos: Partial<Record<View, Photo>>, design: Design) {
  const present = views.filter(v => photos[v]);
  const w = 720, row = 760;
  const sheet = canvasOf(w, 108 + row * present.length);
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#151310'; ctx.fillRect(0, 0, w, sheet.height);
  ctx.fillStyle = '#e8c6a0'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('Espejo WS', 24, 54);
  ctx.font = '24px sans-serif'; ctx.fillText('Degradado ' + design.height.toLowerCase() + ' · Simulación', 24, 91);
  present.forEach((v, i) => {
    const photo = photos[v]!;
    const ref = canvasOf(photo.image.width, photo.image.height);
    const drawing = ref.getContext('2d')!;
    drawing.drawImage(fadePhoto(photo, v, design.height, design.closeness), 0, 0);
    paintLines(drawing, design.lines[v], photo.tone);
    const scale = Math.min((w - 48) / ref.width, (row - 72) / ref.height);
    const top = 108 + row * i;
    ctx.fillStyle = '#f1e9dc'; ctx.font = '26px sans-serif'; ctx.fillText(viewLabels[v], 24, top + 39);
    ctx.drawImage(ref, (w - ref.width * scale) / 2, top + 54, ref.width * scale, ref.height * scale);
  });
  const a = document.createElement('a');
  a.download = 'espejo-ws-referencia.jpg'; a.href = sheet.toDataURL('image/jpeg', 0.9); a.click();
}
