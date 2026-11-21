import { describe, expect, it } from 'vitest';
import { blendFade, makeMask, newDesign, type Height, type View } from './photo';

describe('Espejo WS', () => {
  const width = 12;
  const pixels = new Uint8Array(width * width);
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) pixels[y * width + x] = 255;
  const mask = makeMask(pixels, width, width)!;
  function render(view: View, level: Height, closeness: number) {
    const target = new Uint8ClampedArray(width * width * 4).fill(30);
    blendFade(target, width, mask, [160, 110, 85], view, level, closeness);
    return (x: number, y: number) => target[4 * (y * width + x)];
  }
  it('ignora zonas vacías y calcula los límites reales del cabello', () => {
    expect(makeMask(new Uint8Array(144), 12, 12)).toBeNull();
    expect(mask).toMatchObject({ left: 1, right: 10, top: 1, bottom: 10 });
  });
  it('preserva los píxeles fuera del cabello y la coronilla', () => {
    const at = render('left', 'Alto', 1);
    expect(at(0, 10)).toBe(30);
    expect(at(5, 1)).toBe(30);
    expect(at(8, 10)).toBeGreaterThan(100);
  });
  it('separa la altura del degradado de lo que se corta al ras', () => {
    expect(render('left', 'Alto', .5)(8, 6)).toBeGreaterThan(render('left', 'Bajo', .5)(8, 6));
    expect(render('left', 'Medio', 1)(8, 9)).toBeGreaterThan(render('left', 'Medio', 0)(8, 9));
  });
  it('conserva el centro frontal al rebajar los laterales', () => {
    expect(render('front', 'Alto', 1)(5, 9)).toBe(30);
    expect(render('front', 'Alto', 1)(1, 9)).toBeGreaterThan(30);
  });
  it('separa los trazos por lateral, opción y sesión', () => {
    const a = newDesign('Bajo'), b = newDesign('Medio');
    a.lines.left.push({ points: [{ x: .7, y: .3 }], width: .012 });
    expect(b.lines.left).toHaveLength(0);
    expect(a.lines.right).toHaveLength(0);
    expect(newDesign('Bajo').lines.left).toHaveLength(0);
  });
});

describe('composición del corte con IA', () => {
  it('preserva los píxeles de la foto fuera del cabello, incluido el canal alfa', async () => {
    const { blendHair } = await import('./aiSheet');
    const original = new Uint8ClampedArray([12, 34, 56, 255, 2, 4, 6, 255, 0, 0, 0, 255]);
    blendHair(original, new Uint8ClampedArray(12).fill(200), new Uint8Array([0, 255, 128]));
    expect([...original]).toEqual([12, 34, 56, 255, 200, 200, 200, 255, 100, 100, 100, 255]);
  });
});
