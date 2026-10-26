// SPEC-30: decisiones puras del reproductor de la secuencia (qué descargar, qué decodificar, qué liberar y qué
// mostrar). Sin DOM: se prueban con vitest (schedule.test.ts) y SequencePlayer solo las aplica.
//
// Idea común: "tiempo hasta que se necesite". El frame pedido avanza a `vel` frames/s (con signo); un frame adelante
// en el sentido del movimiento se necesita en |d| / |vel| s; uno de atrás solo si el usuario se da vuelta, así que se
// penaliza. Quieto (|vel| chico) es simétrico.

const MOVING = 2;   // frames/s: por debajo se considera quieto
// Quieto: los ±NEAR vecinos completos primero (≈ 1.6 s de scroll lento en móvil); sin esto la cobertura lejana se
// llevaba la conexión y el primer gesto lento mostraba un frame adelantado o atrasado (M2 en móvil: con ±6 y la
// cobertura completa en reposo, el frame 10 no llegaba a tiempo y quedaba pegado 117 ms, peor que el baseline).
const NEAR = 12;

// Nivel jerárquico de un frame (1-based): 16 para 1, 17, 33…; 8 para 9, 25…; 4, 2 y 1 para el resto. Bajar primero
// los niveles gruesos reparte la cobertura por toda la secuencia (un scroll rápido siempre tiene un vecino a ≤ 2).
export function level(n: number) {
  const i = n - 1;
  for (const s of [16, 8, 4, 2]) if (i % s === 0) return s;
  return 1;
}
// Con la tolerancia de ±2 frames, 1 de cada 4 ya evita el desfase y 1 de cada 2 evita el "pegado": esos niveles
// se piden bastante antes (horizonte 4–16× más lejos) que los frames finos.
const LEVEL_WEIGHT: Record<number, number> = { 16: 64, 8: 48, 4: 32, 2: 6, 1: 1 };
// Cobertura (AC-02 rápido). M1 tolera ±2 frames: con un frame cada ≤ COVER_GAP (5) en TODA la secuencia, el disponible
// más cercano nunca está a más de 2 del pedido. Esos frames ("cobertura") se piden en orden de necesidad (adelante
// primero) y lo fino espera mientras falten: quieto (fuera de ±NEAR) y en scroll rápido (≥ FAST f/s, donde un frame
// fino llega cuando el usuario ya pasó). Medido: con la secuencia densa (301 frames) y el prefetch anterior (gruesos
// por nivel 16/8/4 en toda la secuencia, mezclados con finos cercanos) el rápido daba 18.7 % de desfase en desktop:
// con Fast 4G sobre HTTP/1.1 (6 conexiones × 165 ms de latencia por request) entran ~20 frames/s y no alcanzaban para
// 1 de cada 4 (76 frames) por delante de un scroll de 100 frames/s; 1 de cada 5 (61) sí.
export const COVER_GAP = 5;
const FAST = 60;
const FINE_PENALTY = 1e3;
// Frames de cobertura: anclas + uno cada COVER_GAP entre anclas consecutivas (huecos ≤ COVER_GAP).
export function coverageFrames(count: number, anchors: number[] = []): Set<number> {
  const a = [...new Set([1, count, ...anchors.filter((n) => n >= 1 && n <= count)])].sort((x, y) => x - y), out = new Set(a);
  for (let k = 0; k + 1 < a.length; k++) for (let n = a[k] + COVER_GAP; n < a[k + 1]; n += COVER_GAP) out.add(n);
  return out;
}
const gridCover = (count: number) => (n: number) => (n - 1) % COVER_GAP === 0 || n === count;

// Segundos (relativos) hasta que se necesite el frame n si el pedido está en `at` y se mueve a `vel`.
function timeToNeed(n: number, at: number, vel: number, minSpeed: number) {
  const d = n - at, dist = Math.abs(d);
  const moving = Math.abs(vel) >= MOVING, ahead = !moving || d === 0 || Math.sign(d) === Math.sign(vel);
  return ahead ? dist / Math.max(Math.abs(vel), minSpeed) : dist / Math.max(minSpeed / 2, Math.abs(vel) / 6);
}

// Frame disponible más cercano a n (0 si no hay ninguno). En empate gana el del sentido del movimiento (dir ≥ 0 →
// adelante). Nunca se queda con un ancla lejana si hay algo más cerca.
export function nearestAvailable(n: number, has: (i: number) => boolean, count: number, dir = 0) {
  if (n >= 1 && n <= count && has(n)) return n;
  for (let d = 1; d < count; d++) {
    const a = dir < 0 ? n - d : n + d, b = dir < 0 ? n + d : n - d;
    if (a >= 1 && a <= count && has(a)) return a;
    if (b >= 1 && b <= count && has(b)) return b;
  }
  return 0;
}

// Siguiente frame a descargar (null si no queda nada). `want(n)` = falta y no está en curso ni falló.
// Quieto: lo inmediato (±NEAR) primero. En movimiento se mide desde donde estará el pedido cuando llegue la respuesta
// (at + vel × latency): lo que el usuario ya habrá pasado no vale una conexión (antes se bajaba todo en orden justo
// detrás del scroll y la cobertura gruesa de adelante nunca llegaba). Después, tiempo hasta necesitarlo dividido por
// el peso del nivel jerárquico.
// `cover(n)`: ¿es frame de cobertura? (por defecto la grilla 1, 6, 11…; el reproductor pasa coverageFrames con anclas).
export function nextFetch(count: number, at: number, vel: number, want: (n: number) => boolean, latency = .3, cover = gridCover(count)): number | null {
  const moving = Math.abs(vel) >= MOVING, p = moving ? at + vel * latency : at;
  const coverFirst = moving ? Math.abs(vel) >= FAST : true;
  let best: number | null = null, bestScore = Infinity;
  for (let n = 1; n <= count; n++) {
    if (!want(n)) continue;
    const dist = Math.abs(n - p);
    let score: number;
    if (!moving && dist <= NEAR) score = dist * 1e-3;
    else if (coverFirst) score = timeToNeed(n, p, vel, 10) + (cover(n) ? 0 : FINE_PENALTY);   // cobertura en orden de necesidad
    else score = timeToNeed(n, p, vel, 10) / LEVEL_WEIGHT[level(n)];
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}

// Hasta `budget` frames a tener decodificados (con bytes ya disponibles), ordenados por urgencia.
// Con scroll muy rápido se decodifica a saltos (1 de cada 2 sobre 60 frames/s, 1 de cada 4 sobre 120): cada rAF
// avanza varios frames y la ventana de bitmaps rinde más; el frame pedido siempre entra.
// Los frames de cobertura (`cover`) siempre son candidatos: a alta velocidad es lo que hay descargado.
export function decodeTargets(count: number, at: number, vel: number, budget: number, has: (n: number) => boolean, cover?: (n: number) => boolean): number[] {
  const stride = Math.abs(vel) >= 120 ? 4 : Math.abs(vel) >= 60 ? 2 : 1, here = Math.round(at);
  const c: [number, number][] = [];
  for (let n = 1; n <= count; n++) if (has(n) && (n === here || level(n) >= stride || (stride > 1 && cover?.(n)))) c.push([n, timeToNeed(n, at, vel, 4)]);
  c.sort((a, b) => a[1] - b[1]);
  return c.slice(0, Math.max(0, budget)).map(([n]) => n);
}

// Orden en que conviene liberar bitmaps: fuera de `keep`, nunca el que se muestra; primero el que más tardaría en
// volver a necesitarse.
export function evictionOrder(retained: Iterable<number>, keep: Set<number>, at: number, vel: number, shown: number): number[] {
  return [...retained].filter((n) => n !== shown && !keep.has(n))
    .map((n) => [n, timeToNeed(n, at, vel, 4)] as const)
    .sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// Cuántos frames decodificados se pueden retener: presupuesto de bytes por tipo de dispositivo / bytes por bitmap
// (ancho × alto × 4). Móvil ≤ 120 MB (iOS mata la pestaña bastante antes que desktop); desktop 192–256 MB según
// navigator.deviceMemory. Siempre entre 8 y 64 frames.
export function bitmapBudget({ width, height, mobile, deviceMemory }: { width: number; height: number; mobile: boolean; deviceMemory?: number }) {
  const mem = deviceMemory ?? 4;
  const bytes = (mem <= 2 ? 72 : mobile ? 120 : mem >= 8 ? 256 : 192) * 1048576;
  return Math.min(64, Math.max(8, Math.floor(bytes / (width * height * 4))));
}
