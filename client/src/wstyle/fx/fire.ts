// SPEC-49: fuego procedural detrás del retrato del hero (WebGL 1, sin dependencias).
// Llamas = fbm con domain warping desplazado hacia arriba, recoloreado con la paleta "Noir de oficio":
// negro → madera #7A3B22 → cobre #C2622D (techo de saturación, regla 2) → latón #B8875A → hueso #EDE6DA en los picos.
// El canvas se compone con mix-blend-mode: screen (el negro no aporta) y se dibuja a ≤ 0.5× del viewport (regla 4).

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Scroll al que el hero ya se fundió: el primer 15 % del documento, pero siempre antes de llegar a "El local".
export const heroFadeEnd = (localAnchor: number, maxScroll: number) => Math.max(1, Math.min(.15 * maxScroll, .9 * localAnchor));
export const heroOut = (y: number, end: number) => clamp01(y / Math.max(1, end));

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform float uCx; uniform float uW; uniform float uY0;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2((uv.x - uCx) * uRes.x / uRes.y, uv.y);
  float t = uTime;
  // domain warping: el campo sube y se tuerce; estirado en vertical para que salgan lenguas, no nubes
  vec2 fp = p * vec2(3.4, 1.7);
  vec2 q = vec2(fbm(fp + vec2(0., -t * .55)), fbm(fp + vec2(4.1, -t * .75)));
  float n = fbm(fp + 1.6 * vec2(q.x * 1.4 - .7, q.y) + vec2(0., -t * 1.8));
  n += (noise(fp * 4. + 3. * q + vec2(0., -t * 3.2)) - .5) * .16;   // detalle fino: bordes de llama nítidos
  // envolvente: lenguas a los costados del retrato (detrás de los hombros y la cabeza), pie oscuro y se apagan
  // hacia arriba; el borde exterior se pierde en negro
  float ax = abs(p.x) / uW;
  float hx = max(exp(-pow((ax - .9) / .5, 2.)), .6 * exp(-ax * ax * 1.6));
  float yy = (uv.y - uY0) / (1. - uY0);   // 0 en la base del retrato, 1 arriba
  float hy = smoothstep(.0, .3, yy) * (1. - smoothstep(.25, .95, yy));
  float h = clamp((n - .37) * 4.4 * hx * hy, 0., 1.);
  h *= h * (3. - 2. * h);
  // el brillo máximo solo donde coincide con el detalle fino: hueso en puntas chicas, nunca manchas blancas
  float heat = h * mix(.76, 1., noise(fp * 5. + vec2(0., -t * 4.)));
  vec3 col = mix(vec3(0.), vec3(.478, .231, .133), smoothstep(0., .3, heat));
  col = mix(col, vec3(.761, .384, .176), smoothstep(.25, .6, heat));
  col = mix(col, vec3(.722, .529, .353), smoothstep(.6, .88, heat));
  col = mix(col, vec3(.929, .902, .855), smoothstep(.9, 1., heat));
  gl_FragColor = vec4(col, 1.);
}`;

export interface FxLoop {
  readonly mode: 'gl' | 'static';
  readonly running: boolean;
  start(): void;
  stop(): void;
  resize(w: number, h: number): void;
  dispose(): void;
}
export interface FireOptions {
  scale?: number;            // fracción de la resolución CSS del viewport (≤ .5)
  center?: number;           // centro horizontal del fuego (0…1)
  width?: number;            // semiancho de la envolvente, en altos de pantalla
}

const programs = new WeakMap<HTMLCanvasElement, WebGLProgram>();
const STILL_T = 7.3;         // instante del frame fijo (movimiento reducido): un fuego ya formado

export function createFire(canvas: HTMLCanvasElement, opts: FireOptions = {}): FxLoop & { setShape(center: number, width: number, base?: number): void } {
  const reduced = prefersReducedMotion();
  const scale = Math.min(.5, opts.scale ?? .5);
  let center = opts.center ?? .72, width = opts.width ?? .45, base = 0;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null;
  // El programa se guarda por canvas: React (StrictMode) monta, desmonta y vuelve a montar sobre el mismo canvas,
  // que devuelve el mismo contexto; no se compila dos veces ni se pierde el contexto entre montajes.
  let prog = gl && programs.get(canvas);
  if (gl && !prog) { prog = build(gl); if (prog) programs.set(canvas, prog); }
  if (!gl || !prog) {
    return { mode: 'static', running: false, start() {}, stop() {}, resize() {}, dispose() {}, setShape() {} };
  }
  const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');
  const uCx = gl.getUniformLocation(prog, 'uCx'), uW = gl.getUniformLocation(prog, 'uW'), uY0 = gl.getUniformLocation(prog, 'uY0');
  let raf = 0, running = false, last = 0, time = 0, disposed = false, still = false;

  const draw = (t: number) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t); gl.uniform1f(uCx, center); gl.uniform1f(uW, width); gl.uniform1f(uY0, base);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const tick = (now: number) => {
    if (!running) return;
    time += Math.min(.1, last ? (now - last) / 1000 : 0); last = now;
    draw(time);
    raf = requestAnimationFrame(tick);
  };
  const lost = (e: Event) => { e.preventDefault(); api.stop(); };
  canvas.addEventListener('webglcontextlost', lost);

  const api = {
    mode: 'gl' as const,
    get running() { return running; },
    start() {
      if (disposed) return;
      if (reduced) { if (!still) { still = true; draw(STILL_T); } return; }   // una sola imagen, sin bucle (AC-05)
      if (running) return;
      running = true; last = 0; raf = requestAnimationFrame(tick);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize(w: number, h: number) {
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      if (reduced) still = true;
      draw(reduced ? STILL_T : time);              // redimensionar borra el buffer: se repinta en el acto
    },
    // base = altura (0…1 desde abajo) donde se apoya el retrato: las llamas nacen ahí (en compacto va arriba).
    setShape(c: number, w: number, b = 0) { center = c; width = w; base = Math.min(.8, Math.max(0, b)); if (!running) draw(reduced ? STILL_T : time); },
    dispose() {
      disposed = true; api.stop();
      canvas.removeEventListener('webglcontextlost', lost);
    },
  };
  return api;
}

function build(gl: WebGLRenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  // Un triángulo que cubre la pantalla.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return prog;
}
