/* Fotos de perfil del barbero (SPEC-33 RN-17, asunción 9): se recortan cuadradas,
   se pasan a WebP ~800 px y se guardan en GridFS (el disco de Render free es
   efímero). El tipo se valida por CONTENIDO (firma de bytes + decodificación), no
   por la extensión ni el Content-Type que manda el navegador. */
import mongoose from 'mongoose';
import sharp from 'sharp';
import multer from 'multer';

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

/* SPEC-59: estilos (1200 px) y fotos de clientes (1000 px), lado mayor y SIN recorte. */
export const STYLE_PHOTO_SIDE = 1200;
export const CLIENT_PHOTO_SIDE = 1000;
export const MAX_INPUT_PIXELS = 40_000_000;

/* Buffer original → WebP. Por defecto cuadrado de 800 (foto del barbero); con `maxSide`
   se ajusta el lado mayor sin recortar ni agrandar. sharp NO copia los metadatos (EXIF,
   GPS) salvo que se pida `withMetadata`: el WebP sale limpio. `rotate()` aplica la
   orientación EXIF antes de descartarla. Lanza { code: 'invalid_image' } si no es una
   imagen válida. */
export async function optimize(buf, { maxSide = null } = {}) {
  if (!sniffImage(buf)) throw Object.assign(new Error('not an image'), { code: 'invalid_image' });
  try {
    const img = sharp(buf, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (maxSide) img.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
    else img.resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'attention' });
    return await img.webp({ quality: 80 }).toBuffer();
  } catch {
    throw Object.assign(new Error('corrupt image'), { code: 'invalid_image' });
  }
}

export async function storePhoto(buf, meta = {}, opts = {}) {
  const webp = await optimize(buf, opts);
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

/* Documento del archivo en GridFS (con su `metadata.kind`) o null. */
export async function photoFile(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id))) return null;
  const [file] = await bucket().find({ _id: new mongoose.Types.ObjectId(String(id)) }).limit(1).toArray();
  return file || null;
}

export const notFoundPhoto = (res) => res.status(404).json({ ok: false, error: 'not_found' });

/* Envía un archivo ya resuelto. `restricted` = fotos de clientes u ocultas: sin caché pública. */
export function streamPhoto(file, res, { restricted = false } = {}) {
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': restricted ? 'private, no-store' : 'public, max-age=31536000, immutable',
    'Content-Length': String(file.length),
  });
  bucket().openDownloadStream(file._id).on('error', () => res.end()).pipe(res);
}

/* GET /api/wstyle/photos/:id — público (la foto principal la muestra la reserva). Las fotos
   de clientes (SPEC-59 RN-04) nunca salen por acá. */
export async function sendPhoto(id, res, { allow = null } = {}) {
  const file = await photoFile(id);
  if (!file) return notFoundPhoto(res);
  const kind = file.metadata?.kind;
  if (kind === 'client') return notFoundPhoto(res);
  if (allow) {
    const verdict = await allow(file);
    if (!verdict) return notFoundPhoto(res);
    return streamPhoto(file, res, { restricted: verdict === 'restricted' });
  }
  streamPhoto(file, res);
}

/* SPEC-59: middleware de subida en memoria con el límite de 5 MB por archivo. Los errores de
   multer se traducen a 413/400 con el mensaje de RN-02 (no a un 500 genérico). */
export function imageUpload({ field, max = 1 }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: max, fields: 10 } });
  const run = max === 1 ? upload.single(field) : upload.array(field, max);
  return (req, res, next) =>
    run(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'photo_too_large', message: 'La foto pesa más de 5 MB', maxBytes: MAX_PHOTO_BYTES });
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ ok: false, error: 'too_many_photos', message: `Puedes subir hasta ${max} foto${max === 1 ? '' : 's'} a la vez.`, max });
      next(err);
    });
}
