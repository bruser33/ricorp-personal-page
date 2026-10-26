import { describe, expect, it } from 'vitest';
import { COVER_GAP, bitmapBudget, coverageFrames, decodeTargets, evictionOrder, level, nearestAvailable, nextFetch } from './schedule';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('nearestAvailable', () => {
  it('devuelve el frame pedido si está', () => {
    expect(nearestAvailable(50, (n) => n === 50 || n === 1, 301)).toBe(50);
  });
  it('elige el vecino disponible más cercano y no un ancla lejana', () => {
    const have = new Set([1, 51, 101, 147]);
    expect(nearestAvailable(150, (n) => have.has(n), 301)).toBe(147);
  });
  it('en empate prefiere el lado hacia donde va el usuario', () => {
    const have = new Set([48, 52]);
    expect(nearestAvailable(50, (n) => have.has(n), 301, 1)).toBe(52);
    expect(nearestAvailable(50, (n) => have.has(n), 301, -1)).toBe(48);
  });
  it('0 si no hay nada', () => {
    expect(nearestAvailable(10, () => false, 301)).toBe(0);
  });
});

describe('level (jerarquía grueso → fino)', () => {
  it('1, 17, 33 son del nivel 16; 9 del 8; 5 del 4; 3 del 2; 2 del 1', () => {
    expect([1, 17, 33, 9, 5, 3, 2].map(level)).toEqual([16, 16, 16, 8, 4, 2, 1]);
  });
});

describe('nextFetch', () => {
  it('quieto: primero lo inmediato alrededor del frame actual', () => {
    const got = new Set<number>([100]);
    const order: number[] = [];
    for (let k = 0; k < 4; k++) { const n = nextFetch(301, 100, 0, (i) => !got.has(i))!; order.push(n); got.add(n); }
    for (const n of order) expect(Math.abs(n - 100)).toBeLessThanOrEqual(3);
  });
  it('quieto: los ±6 vecinos completos van antes que la cobertura lejana (el scroll lento arranca sin saltos)', () => {
    const got = new Set<number>([1]);
    const order: number[] = [];
    for (let k = 0; k < 6; k++) { const n = nextFetch(223, 1, 0, (i) => !got.has(i))!; order.push(n); got.add(n); }
    expect(order.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it('en movimiento hacia adelante prioriza lo que viene, no lo que quedó atrás', () => {
    const got = new Set<number>();
    const order: number[] = [];
    for (let k = 0; k < 20; k++) { const n = nextFetch(301, 100, 40, (i) => !got.has(i))!; order.push(n); got.add(n); }
    // Atrás solo entra lo inmediato (±2) y algo de cobertura gruesa (para un cambio de sentido); el resto va adelante.
    const ahead = order.filter((n) => n >= 100).length;
    expect(ahead).toBeGreaterThanOrEqual(14);
  });
  it('en movimiento no gasta conexiones en frames que el usuario pasará antes de que lleguen', () => {
    const got = new Set<number>();
    for (let k = 0; k < 8; k++) { const n = nextFetch(301, 100, 25, (i) => !got.has(i))!; got.add(n); }
    for (const n of got) expect(n).toBeGreaterThan(103);
  });
  it('rápido: cubre a saltos (frames gruesos) lejos antes que rellenar cada frame cercano', () => {
    const got = new Set<number>();
    for (let k = 0; k < 40; k++) { const n = nextFetch(301, 1, 100, (i) => !got.has(i))!; got.add(n); }
    expect(Math.max(...got)).toBeGreaterThan(100);
  });
  it('null cuando no queda nada', () => {
    expect(nextFetch(10, 5, 0, () => false)).toBeNull();
  });
});

describe('decodeTargets', () => {
  it('no más que el presupuesto y siempre incluye el frame pedido si está disponible', () => {
    const t = decodeTargets(301, 120, 0, 10, () => true);
    expect(t.length).toBe(10);
    expect(t).toContain(120);
  });
  it('sesgado hacia el sentido del movimiento', () => {
    const t = decodeTargets(301, 120, 30, 12, () => true);
    expect(t.filter((n) => n > 120).length).toBeGreaterThan(t.filter((n) => n < 120).length);
    const b = decodeTargets(301, 120, -30, 12, () => true);
    expect(b.filter((n) => n < 120).length).toBeGreaterThan(b.filter((n) => n > 120).length);
  });
  it('solo frames con bytes disponibles', () => {
    const t = decodeTargets(301, 50, 0, 8, (n) => n % 2 === 1);
    expect(t.every((n) => n % 2 === 1)).toBe(true);
  });
});

describe('decodeTargets a alta velocidad', () => {
  it('con scroll muy rápido decodifica a saltos (no gasta bitmaps en cada frame) pero incluye el pedido', () => {
    const t = decodeTargets(301, 101, 150, 12, () => true);
    expect(t).toContain(101);
    expect(t.filter((n) => n !== 101).every((n) => (n - 1) % 4 === 0)).toBe(true);
  });
});

describe('nextFetch: cobertura gruesa por delante de la fina', () => {
  it('en scroll normal (25 f/s) los frames 1 de cada 2 se piden mucho más adelante que los finos', () => {
    const got = new Set<number>();
    const order: number[] = [];
    for (let k = 0; k < 60; k++) { const n = nextFetch(301, 50, 25, (i) => !got.has(i))!; order.push(n); got.add(n); }
    const fine = order.filter((n) => n > 50 && (n - 1) % 2 === 1), coarse = order.filter((n) => n > 50 && (n - 1) % 2 === 0);
    expect(Math.max(...coarse)).toBeGreaterThan(Math.max(...fine) * 1.5);
  });
});

describe('evictionOrder', () => {
  it('libera primero lo más lejano y nunca lo que se está mostrando ni lo deseado', () => {
    const retained = range(1, 30);
    const keep = new Set(range(10, 20));
    const ev = evictionOrder(retained, keep, 15, 0, 5);
    expect(ev).not.toContain(5);
    for (const n of keep) expect(ev).not.toContain(n);
    expect(ev[0]).toBe(30);
  });
  it('con movimiento hacia adelante, lo de atrás se libera antes que lo de adelante a igual distancia', () => {
    const ev = evictionOrder([40, 60], new Set(), 50, 30, -1);
    expect(ev[0]).toBe(40);
  });
});

describe('bitmapBudget', () => {
  it('móvil hd (900×1600) queda ≤ 150 MB y con al menos 12 frames', () => {
    const k = bitmapBudget({ width: 900, height: 1600, mobile: true, deviceMemory: 4 });
    expect(k * 900 * 1600 * 4).toBeLessThanOrEqual(150 * 1048576);
    expect(k).toBeGreaterThanOrEqual(12);
  });
  it('desktop sd tiene más margen que móvil', () => {
    expect(bitmapBudget({ width: 1280, height: 720, mobile: false, deviceMemory: 8 })).toBeGreaterThan(bitmapBudget({ width: 900, height: 1600, mobile: true, deviceMemory: 4 }));
  });
});

describe('coverageFrames', () => {
  it('incluye primero, último y anclas, con huecos ≤ 5 (M1 tolera ±2)', () => {
    const A = [1, 40, 79, 118, 157, 201, 301];
    const c = [...coverageFrames(301, A)].sort((a, b) => a - b);
    for (const a of A) expect(c).toContain(a);
    for (let k = 1; k < c.length; k++) expect(c[k] - c[k - 1]).toBeLessThanOrEqual(COVER_GAP);
    expect(c.length).toBeLessThanOrEqual(Math.ceil(300 / COVER_GAP) + A.length);
  });
});

describe('nextFetch: cobertura completa antes que lo fino (AC-02 rápido)', () => {
  const A = [1, 40, 79, 118, 157, 201, 301];
  const C = coverageFrames(301, A), cover = (n: number) => C.has(n);
  it('quieto: tras los ±12 vecinos, baja toda la cobertura (adelante primero) antes de rellenar lo fino', () => {
    const got = new Set<number>(A);
    const order: number[] = [];
    for (let k = 0; k < 80; k++) { const n = nextFetch(301, 1, 0, (i) => !got.has(i), .3, cover)!; order.push(n); got.add(n); }
    const firstFine = order.findIndex((n) => n > 13 && !C.has(n));
    expect([...C].every((n) => got.has(n))).toBe(true);
    expect(order.slice(0, firstFine).filter((n) => n > 13).length).toBe([...C].filter((n) => n > 13 && !A.includes(n)).length);
    const cov = order.filter((n) => n > 13);
    expect(cov.slice(0, 10).every((n, k, a) => k === 0 || n > a[k - 1])).toBe(true);   // de adelante hacia atrás
  });
  it('rápido (≥ 60 f/s): solo pide cobertura, por delante del usuario y la más próxima primero', () => {
    const got = new Set<number>(A);
    const order: number[] = [];
    for (let k = 0; k < 30; k++) { const n = nextFetch(301, 50, 100, (i) => !got.has(i), .3, cover)!; order.push(n); got.add(n); }
    expect(order.every((n) => C.has(n) && n > 50)).toBe(true);
    expect(order.slice(0, 6)).toEqual([84, 89, 94, 99, 104, 109]);   // desde donde estará al llegar la respuesta (50 + 100 × 0.3)
  });
  it('scroll normal (25 f/s) sigue rellenando lo fino cercano', () => {
    const got = new Set<number>();
    for (let k = 0; k < 20; k++) { const n = nextFetch(301, 50, 25, (i) => !got.has(i), .3, cover)!; got.add(n); }
    expect([...got].some((n) => !C.has(n))).toBe(true);
  });
});

describe('decodeTargets con cobertura', () => {
  it('a alta velocidad decodifica los frames de cobertura aunque no sean del nivel del salto', () => {
    const C = coverageFrames(301, [1, 301]);
    const t = decodeTargets(301, 50, 150, 20, (n) => C.has(n), (n) => C.has(n));
    expect(t.length).toBeGreaterThan(5);
  });
});
