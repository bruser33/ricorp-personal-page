// SPEC-49: brasas que suben, parpadean y se apagan (canvas 2D a pantalla completa). Persisten en todo el recorrido
// con densidad por sección (regla 3: nunca 0 salvo con movimiento reducido).
import { prefersReducedMotion } from './fire';

// Densidad relativa por sección (0…1] sobre el máximo del dispositivo.
const DENSITY: Record<string, number> = { hero: 1, reyes: .2, linea: .16, afilado: .2, trono: .7, servicios: .22, llega: .25 };
export const emberDensity = (sectionId: string | null) => (sectionId && DENSITY[sectionId]) || .12;

interface Ember { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; phase: number; freq: number; tint: number }
export interface EmbersOptions { max: number }
export interface EmbersLoop {
  readonly running: boolean;
  start(): void;
  stop(): void;
  resize(w: number, h: number): void;
  setDensity(d: number): void;
  // Zona de nacimiento: centro horizontal (0…1) y dispersión (0…1); fuera del hero, toda la pantalla.
  setSource(center: number, spread: number): void;
  dispose(): void;
}

// Brasa = halo cobre con núcleo latón/hueso; tres sprites pre-pintados (sin gradientes por frame).
const TINTS: [string, string, string][] = [
  ['rgba(237,230,218,1)', 'rgba(184,135,90,.85)', 'rgba(194,98,45,.0)'],
  ['rgba(184,135,90,1)', 'rgba(194,98,45,.7)', 'rgba(122,59,34,.0)'],
  ['rgba(194,98,45,1)', 'rgba(122,59,34,.6)', 'rgba(122,59,34,.0)'],
];
function sprites(): HTMLCanvasElement[] {
  return TINTS.map(([a, b, c]) => {
    const s = document.createElement('canvas'); s.width = s.height = 32;
    const x = s.getContext('2d')!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, a); g.addColorStop(.3, b); g.addColorStop(1, c);
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return s;
  });
}

export function createEmbers(canvas: HTMLCanvasElement, { max }: EmbersOptions): EmbersLoop {
  const reduced = prefersReducedMotion();
  const ctx = canvas.getContext('2d');
  const pool: Ember[] = [];
  let w = 1, h = 1, dpr = 1, density = 1, srcC = .5, srcS = 1;
  let raf = 0, running = false, last = 0, spawnDebt = 0, disposed = false;
  let tex: HTMLCanvasElement[] | null = null;

  const spawn = (): Ember => {
    // Distribución en campana alrededor de la fuente (suma de dos uniformes).
    const x = (srcC + (Math.random() + Math.random() - 1) * srcS) * w;
    const life = 2.6 + Math.random() * 4;
    return {
      x, y: h + 8 - Math.random() * h * .25, vx: (Math.random() - .5) * 14, vy: -(28 + Math.random() * 62),
      life, age: 0, size: 3 + Math.random() * Math.random() * 8, phase: Math.random() * 6.28, freq: 4 + Math.random() * 9,
      tint: Math.random() < .25 ? 0 : Math.random() < .6 ? 1 : 2,
    };
  };

  const tick = (now: number) => {
    if (!running || !ctx) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : 0); last = now;
    const target = Math.max(1, Math.round(max * density));
    // Las que ya se están apagando (último 40 % de vida) no cuentan: al bajar la densidad el relevo empieza antes de
    // que se apaguen todas y nunca queda la pantalla sin brasas (regla 3).
    let alive = 0;
    for (const e of pool) if (e.age < e.life * .6) alive++;
    // Ritmo de nacimiento ≈ objetivo / vida media: el enjambre llega al objetivo sin oleadas.
    spawnDebt += target * dt / 4.6;
    while (spawnDebt >= 1 && alive < target) {
      spawnDebt--; alive++;
      const i = pool.findIndex((e) => e.age >= e.life);   // reutiliza una muerta; si no hay, crece (tope = max)
      if (i >= 0) pool[i] = spawn(); else if (pool.length < max) pool.push(spawn()); else break;
    }
    if (spawnDebt > 2) spawnDebt = 2;
    tex ??= sprites();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = now / 1000;
    for (const e of pool) {
      if (e.age >= e.life) continue;
      e.age += dt;
      e.x += (e.vx + Math.sin(t * 1.3 + e.phase) * 16) * dt;
      e.y += e.vy * dt; e.vy *= 1 - .08 * dt;
      const k = e.age / e.life;
      const fade = Math.min(1, k * 6) * (1 - k) * (1 - k);
      const flicker = .62 + .38 * Math.sin(t * e.freq + e.phase);
      const a = fade * flicker;
      if (a <= .01) continue;
      const s = e.size * (1 - .45 * k);
      ctx.globalAlpha = a;
      ctx.drawImage(tex[e.tint], e.x - s, e.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  };

  const api: EmbersLoop = {
    get running() { return running; },
    start() {
      if (disposed || reduced || running || !ctx) return;   // movimiento reducido: sin brasas animadas (AC-05)
      running = true; last = 0; raf = requestAnimationFrame(tick);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize(nw: number, nh: number) {
      w = Math.max(1, nw); h = Math.max(1, nh); dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 1.5);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    },
    setDensity(d: number) { density = Math.max(.05, Math.min(1, d)); },
    setSource(c: number, s: number) { srcC = c; srcS = s; },
    dispose() { disposed = true; api.stop(); pool.length = 0; },
  };
  return api;
}
