import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm';
import moduleUrl from '/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import wasmUrl from '/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import { canvasOf, makeMask, type Photo, type Tone } from './photo';

// Segmentador multiclase de MediaPipe, convertido a ONNX. Descarga anónima de pesos;
// la imagen se transforma en un tensor y se evalúa siempre en el dispositivo.
const model = 'https://huggingface.co/senty-au/selfie_multiclass_256x256-ONNX/resolve/6db8421a7150ac20558f2c24675078eb3a1a04d0/onnx/model.onnx';
env.wasm.numThreads = 1;
env.wasm.wasmPaths = { mjs: new URL(moduleUrl, location.href).href, wasm: new URL(wasmUrl, location.href).href };
let engine: Promise<InferenceSession> | undefined;
let evaluation = Promise.resolve();
async function prepare() {
  const response = await fetch(model, {
    credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(45_000),
    integrity: 'sha256-NewezZ7n+FBzyZwAAgt/Z1G2lQburPaDvIZl9hF/hbA=',
  });
  if (!response.ok) throw new Error('No se pudo cargar el modelo.');
  return InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'] });
}
export function releaseDetector() {
  const old = engine;
  engine = undefined;
  if (old) void Promise.all([evaluation, old]).then(([, session]) => session.release()).catch(() => {});
}
export async function detectHair(photo: Photo): Promise<Pick<Photo, 'tone' | 'mask'>> {
  const pending = engine ??= prepare();
  let session: InferenceSession;
  try { session = await pending; } catch (e) { if (engine === pending) engine = undefined; throw e; }
  if (engine !== pending) throw new Error('Consulta finalizada.');
  const task = evaluation.then(() => {
    if (engine !== pending) throw new Error('Consulta finalizada.');
    return runPortrait(session, photo);
  });
  evaluation = task.then(() => {}, () => {});
  return task;
}
async function runPortrait(session: InferenceSession, photo: Photo): Promise<Pick<Photo, 'tone' | 'mask'>> {
  const size = 256;
  const ctx = canvasOf(size, size).getContext('2d')!;
  ctx.drawImage(photo.image, 0, 0, size, size);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const rgb = new Float32Array(size * size * 3);
  for (let i = 0; i < size * size; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = rgba[4 * i + k] / 255;
  const input = new Tensor('float32', rgb, [1, size, size, 3]);
  try {
    const outputs = await session.run({ [session.inputNames[0]]: input });
    const output = outputs[session.outputNames[0]];
    try {
      const scores = output.data as Float32Array;
      const low = canvasOf(size, size);
      const lowCtx = low.getContext('2d')!;
      const confidence = lowCtx.createImageData(size, size);
      const channels: number[][] = [[], [], []];
      for (let i = 0; i < size * size; i++) {
        let best = 0;
        for (let k = 1; k < 6; k++) if (scores[6 * i + k] > scores[6 * i + best]) best = k;
        // Confianza en cabello para que los bordes del degradado sigan el contorno.
        let total = 0;
        for (let k = 0; k < 6; k++) total += Math.exp(scores[6 * i + k] - scores[6 * i + best]);
        const probability = Math.exp(scores[6 * i + 1] - scores[6 * i + best]) / total;
        confidence.data[4 * i + 3] = Math.max(0, Math.min(255, (probability - .22) * 340));
        if (best === 3 && i % 7 === 0) for (let k = 0; k < 3; k++) channels[k].push(rgba[i * 4 + k]);
      }
      const { width, height } = photo.image;
      const mask = new Uint8Array(width * height);
      lowCtx.putImageData(confidence, 0, 0);
      const scaled = canvasOf(width, height).getContext('2d')!;
      scaled.drawImage(low, 0, 0, width, height);
      const opacity = scaled.getImageData(0, 0, width, height).data;
      for (let i = 0; i < mask.length; i++) mask[i] = opacity[4 * i + 3] >= 12 ? opacity[4 * i + 3] : 0;
      const tone = channels[0].length ? channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]) as Tone : null;
      return { mask: makeMask(mask, width, height), tone };
    } finally { output.dispose(); }
  } finally { input.dispose(); }
}
