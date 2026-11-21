import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { HttpError, handle } from '../lib/errors.js';

const width = 1536, height = 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 7 * 1024 * 1024, files: 2, fields: 2, parts: 5, fieldSize: 4096 },
}).fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]);

async function cleanPng(file, isMask) {
  try {
    const source = sharp(file.buffer, { limitInputPixels: width * height });
    const meta = await source.metadata();
    if (meta.format !== 'png' || meta.width !== width || meta.height !== height || (isMask && !meta.hasAlpha)) throw Error();
    return await source.png().toBuffer();
  } catch {
    throw new HttpError(400, 'invalid_image', 'Vuelve a preparar las fotos y la zona de cabello.');
  }
}

export function createMirrorRouter({ pro, env, logger, request = fetch }) {
  const r = express.Router();
  const h = fn => handle(fn, logger);
  const active = new Set();
  const key = env.WS_MIRROR_OPENAI_KEY?.trim();
  r.use(h(async (req, res, next) => {
    await pro.context(req.user, { operate: true });
    res.set('Cache-Control', 'no-store');
    next();
  }));
  r.get('/status', (_req, res) => res.json({ enabled: Boolean(key) }));
  r.post('/edit', h(async (req, res) => {
    if (!key) throw new HttpError(503, 'disabled', 'La barbería aún no ha activado la edición con IA.');
    if (req.get('X-WS-Mirror') !== '1') throw new HttpError(400, 'invalid_request', 'Solicitud no válida.');
    const id = String(req.user._id);
    if (active.has(id) || active.size >= 4) throw new HttpError(429, 'busy', 'Hay una edición en curso. Espera un momento.');
    active.add(id);
    const stop = new AbortController();
    const cancel = () => stop.abort();
    res.once('close', cancel);
    try {
      await new Promise((resolve, reject) => upload(req, res, err => err ? reject(new HttpError(400, 'invalid_upload', 'Revisa el formato y tamaño de las fotos.')) : resolve()));
      const prompt = req.body?.prompt;
      if (req.body?.consent !== 'yes') throw new HttpError(400, 'consent', 'El cliente debe autorizar el envío de sus fotos.');
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 800) throw new HttpError(400, 'invalid_prompt', 'Describe el corte en hasta 800 caracteres.');
      const [image, mask] = await Promise.all([cleanPng(req.files?.image?.[0], false), cleanPng(req.files?.mask?.[0], true)]);
      const body = new FormData();
      body.set('model', 'gpt-image-1.5');
      body.set('size', '1536x1024');
      body.set('quality', 'medium');
      body.set('input_fidelity', 'high');
      body.set('output_format', 'png');
      body.set('image[]', new Blob([image], { type: 'image/png' }), 'views.png');
      body.set('mask', new Blob([mask], { type: 'image/png' }), 'hair.png');
      body.set('prompt', [
        'Retouch only the haircut on this exact photographic contact sheet. There are three equal columns: front view, client’s left profile, client’s right profile. Keep every photograph at its original coordinates, scale and framing.',
        'Apply the same physically realistic haircut across the requested views. Preserve identity, hair texture, skin, ears, face, facial hair, lighting, clothes and background. For a refinement retain the existing cut except for the requested detail. No captions, borders or additional people.',
        'Barber’s haircut request: ' + prompt.trim(),
      ].join('\n'));
      const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(180000)]);
      let reply;
      try {
        const upstream = await request('https://api.openai.com/v1/images/edits', {
          method: 'POST', headers: { Authorization: 'Bearer ' + key }, body, signal,
        });
        if (!upstream.ok) throw Error();
        reply = (await upstream.json()).data?.[0]?.b64_json;
        if (typeof reply !== 'string' || !reply) throw Error();
      } catch {
        if (stop.signal.aborted) return;
        throw new HttpError(502, 'edit_failed', 'La IA no devolvió una imagen. Tus fotos y el diseño anterior siguen disponibles.');
      }
      res.type('png').send(Buffer.from(reply, 'base64'));
    } finally {
      res.off('close', cancel);
      active.delete(id);
    }
  }));
  return r;
}
