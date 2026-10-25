/* Fotos de perfil del barbero (SPEC-33 RN-17, asunción 9): se recortan cuadradas,
   se pasan a WebP ~800 px y se guardan en GridFS (el disco de Render free es
   efímero). El tipo se valida por CONTENIDO (firma de bytes + decodificación), no
   por la extensión ni el Content-Type que manda el navegador. */
import mongoose from 'mongoose';
import sharp from 'sharp';

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_SIZE = 800;
const BUCKET = 'photos';

/* 'jpeg' | 'png' | 'webp' | null según los primeros bytes. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });

/* Buffer original → WebP cuadrado. Lanza { code: 'invalid_image' } si no es una imagen válida. */
export async function optimize(buf) {
  if (!sniffImage(buf)) throw Object.assign(new Error('not an image'), { code: 'invalid_image' });
  try {
    return await sharp(buf, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw Object.assign(new Error('corrupt image'), { code: 'invalid_image' });
  }
}

export async function storePhoto(buf, meta = {}) {
  const webp = await optimize(buf);
  const id = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => {
    const up = bucket().openUploadStreamWithId(id, `${id}.webp`, { metadata: { contentType: 'image/webp', ...meta } });
    up.on('error', reject).on('finish', resolve);
    up.end(webp);
  });
  return String(id);
}

export async function deletePhoto(id) {
  try {
    await bucket().delete(new mongoose.Types.ObjectId(String(id)));
  } catch {
    /* ya no estaba */
  }
}

/* GET /api/wstyle/photos/:id — público (la foto principal la muestra la reserva). */
export async function sendPhoto(id, res) {
  if (!/^[a-f0-9]{24}$/.test(String(id))) return res.status(404).json({ ok: false, error: 'not_found' });
  const _id = new mongoose.Types.ObjectId(String(id));
  const [file] = await bucket().find({ _id }).limit(1).toArray();
  if (!file) return res.status(404).json({ ok: false, error: 'not_found' });
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': String(file.length) });
  bucket().openDownloadStream(_id).on('error', () => res.end()).pipe(res);
}
