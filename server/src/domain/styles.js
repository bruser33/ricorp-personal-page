/* SPEC-59: catálogo de estilos y foto de referencia del cliente al reservar.
   - Estilos: fotos de trabajos que suben el super admin y los barberos, por categoría y
     (opcional) por servicio. Activos → públicos; ocultos → solo panel.
   - Foto del cliente: privada (dueño de la cita, su barbero y el super admin). Se sube al
     elegirla (provisional, 24 h) y se asocia a la cita al confirmar.
   Todo se guarda en GridFS con lib/photos.js (WebP, sin EXIF, sin recorte). */
import mongoose from 'mongoose';
import { Appointment, AuditLog, ClientPhoto, FINAL, Professional, Service, Style } from '../models/index.js';
import { HttpError } from '../lib/errors.js';
import { CLIENT_PHOTO_SIDE, deletePhoto, photoFile, STYLE_PHOTO_SIDE, storePhoto } from '../lib/photos.js';
import { cleanName } from '../lib/validate.js';

const { ObjectId } = mongoose.Types;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* Categorías de la carta (SPEC-51). Se identifican por slug. */
export const STYLE_CATEGORIES = [
  { slug: 'barberia', name: 'Barbería' },
  { slug: 'decoloracion', name: 'Decoloración capilar' },
  { slug: 'ondulacion', name: 'Ondulación permanente' },
  { slug: 'tratamientos', name: 'Tratamientos capilares' },
];
const CATEGORY_SLUGS = STYLE_CATEGORIES.map((c) => c.slug);

export const MAX_ACTIVE_STYLES = 200; // RN-07
export const MAX_STYLES_PER_UPLOAD = 12; // RN-07
export const MAX_PROVISIONAL = 5; // RN-03
export const PROVISIONAL_TTL_MS = 24 * HOUR; // RN-03
export const CLIENT_PHOTO_RETENTION_MS = 90 * DAY; // asunción 7
export const MAX_STYLE_NAME = 60;

export const INVALID_IMAGE_MESSAGE = 'Esa imagen no se pudo leer. Prueba con un JPG o PNG';
export const TOO_LARGE_MESSAGE = 'La foto pesa más de 5 MB';

const oid = (s) => (ObjectId.isValid(String(s)) && String(new ObjectId(String(s))) === String(s) ? new ObjectId(String(s)) : null);
const notFound = (what = 'esa foto') => new HttpError(404, 'not_found', `No encontramos ${what}`);
const fieldError = (fields, message = 'Revisa los datos') => new HttpError(400, Object.values(fields)[0], message, { fields });

/* Categoría de un servicio. SPEC-51 agrega la categoría al servicio; mientras tanto (o si
   llega como id) se deduce del slug del servicio (`decoloracion-global` → decoloracion). */
export function serviceCategory(service) {
  const direct = [service?.categorySlug, service?.category?.slug, service?.category].find((v) => typeof v === 'string' && CATEGORY_SLUGS.includes(v));
  if (direct) return direct;
  const slug = String(service?.slug || '');
  return CATEGORY_SLUGS.find((c) => c !== 'barberia' && slug.startsWith(c)) || 'barberia';
}

export const photoPath = (fileId) => `/api/wstyle/photos/${fileId}`;
export const clientPhotoPath = (fileId) => `/api/wstyle/reference-photos/${fileId}`;

/* Error de imagen de lib/photos.js → 400 con el mensaje de RN-02. */
function imageError(err) {
  if (err?.code === 'invalid_image') return new HttpError(400, 'invalid_image', INVALID_IMAGE_MESSAGE);
  return err;
}

/* Al crear la cita: valida la referencia (nada de lo que manda el cliente es autoridad).
   Devuelve el subdocumento `reference` (o undefined) y la foto provisional a asociar. */
export async function resolveReference(b, user, input = {}) {
  const ref = {};
  let photo = null;
  if (input.styleId) {
    const _id = oid(input.styleId);
    /* CB-08: un estilo oculto entre elegirlo y confirmar igual se guarda (nombre congelado). */
    const style = _id ? await Style.findOne({ _id, businessId: b._id }).lean() : null;
    if (!style) throw fieldError({ styleId: 'invalid_style' }, 'Ese estilo ya no está disponible. Elige otro o sigue sin foto.');
    Object.assign(ref, { styleId: style._id, styleName: style.name, stylePhotoId: style.photoId });
  }
  if (input.clientPhotoId) {
    photo = await ClientPhoto.findOne({ fileId: String(input.clientPhotoId), userId: user._id, appointmentId: null });
    if (!photo) throw fieldError({ clientPhotoId: 'invalid_photo' }, 'Tu foto ya no está disponible. Súbela de nuevo o sigue sin foto.');
    ref.clientPhotoId = photo.fileId;
  }
  return { reference: Object.keys(ref).length ? ref : undefined, photo };
}

export async function attachPhoto(photo, apptId) {
  if (!photo) return;
  await ClientPhoto.updateOne({ _id: photo._id, appointmentId: null }, { $set: { appointmentId: apptId } });
}

/* RN-04/RN-05: lo que ve cada rol de la referencia. */
export async function referenceView(appt) {
  const r = appt.reference;
  if (!r || (!r.styleName && !r.clientPhotoId && !r.clientPhotoState)) return null;
  let style = null;
  if (r.styleName) {
    const live = r.styleId ? await Style.findOne({ _id: r.styleId, active: true }, { photoId: 1 }).lean() : null;
    style = { id: r.styleId ? String(r.styleId) : null, name: r.styleName, photoUrl: live ? photoPath(live.photoId) : null };
  }
  const STATE = { removed: 'Foto quitada por el local', expired: 'Foto expirada', deleted: 'Foto eliminada' };
  return {
    style,
    clientPhoto: r.clientPhotoId ? { id: r.clientPhotoId, url: clientPhotoPath(r.clientPhotoId) } : null,
    clientPhotoNotice: !r.clientPhotoId && r.clientPhotoState ? STATE[r.clientPhotoState] : null,
  };
}

export function createStyles({ agenda, pro, clock = Date.now, logger = console }) {
  const isAdmin = (user) => Boolean(user?.roles?.includes('superadmin'));

  async function audit(user, b, action, { entityId = null, summary = '', before = null, after = null } = {}) {
    try {
      await AuditLog.create({ businessId: b?._id, actorUserId: user._id, actorEmail: user.email, action, entity: action.split('.')[0], entityId: entityId ? String(entityId) : null, summary, before, after, at: new Date(clock()) });
    } catch (err) {
      logger.error('[estilos] auditoría falló:', err.message);
    }
  }

  /* Quién edita estilos: super admin (todos) o barbero aprobado (los suyos). */
  async function editor(user) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Tu sesión venció. Inicia sesión para continuar.');
    if (isAdmin(user)) return { b: await agenda.business(), admin: true, professionalId: null };
    if (!user.roles.includes('barber')) throw new HttpError(403, 'forbidden', 'Solo el local y sus barberos pueden subir estilos');
    const { b, pro: me } = await pro.context(user, { operate: true });
    return { b, admin: false, professionalId: me._id };
  }

  async function servicesOf(b) {
    return Service.find({ businessId: b._id }).lean();
  }

  function serialize(s, services, { panel = false } = {}) {
    const bySvc = new Map(services.map((x) => [String(x._id), x]));
    const out = {
      id: String(s._id),
      name: s.name,
      category: s.category,
      serviceIds: (s.serviceIds || []).map((id) => bySvc.get(String(id))?.slug).filter(Boolean),
      photoUrl: photoPath(s.photoId),
    };
    if (panel) Object.assign(out, { active: s.active, order: s.order, professionalId: s.professionalId ? String(s.professionalId) : null, createdAt: s.createdAt?.toISOString?.() });
    return out;
  }

  /* RN-06: ordenados por `order` y luego el más nuevo primero. */
  const sortStyles = (list) => list.sort((a, c) => (a.order ?? 0) - (c.order ?? 0) || new Date(c.createdAt) - new Date(a.createdAt));

  /* ─── Público: GET /api/wstyle/styles?service=<slug|id> */
  async function publicList({ service = '' } = {}) {
    const b = await agenda.business();
    const services = await servicesOf(b);
    let list = await Style.find({ businessId: b._id, active: true }).lean();
    let svc = null;
    if (service) {
      const id = oid(service);
      svc = services.find((x) => (id ? String(x._id) === String(id) : x.slug === String(service))) || null;
      if (!svc) return { categories: STYLE_CATEGORIES, category: null, items: [] };
      const cat = serviceCategory(svc);
      list = list.filter((s) => (s.serviceIds?.length ? s.serviceIds.some((x) => String(x) === String(svc._id)) : s.category === cat));
    }
    return { categories: STYLE_CATEGORIES, category: svc ? serviceCategory(svc) : null, items: sortStyles(list).map((s) => serialize(s, services)) };
  }

  /* ─── Panel: listar */
  async function panelList(user) {
    const { b, admin, professionalId } = await editor(user);
    const filter = { businessId: b._id };
    if (!admin) filter.professionalId = professionalId;
    const [list, services, activeCount] = await Promise.all([Style.find(filter).lean(), servicesOf(b), Style.countDocuments({ businessId: b._id, active: true })]);
    const pros = admin ? await Professional.find({ _id: { $in: list.map((s) => s.professionalId).filter(Boolean) } }, { displayName: 1 }).lean() : [];
    const proName = new Map(pros.map((p) => [String(p._id), p.displayName]));
    return {
      categories: STYLE_CATEGORIES,
      services: services.filter((s) => s.active).map((s) => ({ id: s.slug, name: s.name, category: serviceCategory(s) })),
      limits: { maxActive: MAX_ACTIVE_STYLES, perUpload: MAX_STYLES_PER_UPLOAD, activeCount },
      items: sortStyles(list).map((s) => ({ ...serialize(s, services, { panel: true }), uploadedBy: s.professionalId ? proName.get(String(s.professionalId)) || 'Barbero' : 'WS Style' })),
    };
  }

  async function parseServiceIds(b, raw) {
    if (raw === undefined || raw === null || raw === '') return [];
    let arr = raw;
    if (typeof raw === 'string') {
      try {
        arr = JSON.parse(raw);
      } catch {
        arr = raw.split(',');
      }
    }
    if (!Array.isArray(arr)) throw fieldError({ serviceIds: 'invalid_services' });
    const services = await servicesOf(b);
    const out = [];
    for (const v of arr.map((x) => String(x).trim()).filter(Boolean)) {
      const id = oid(v);
      const svc = services.find((x) => (id ? String(x._id) === String(id) : x.slug === v));
      if (!svc) throw fieldError({ serviceIds: 'invalid_services' }, 'Uno de los servicios no existe');
      if (!out.some((x) => String(x) === String(svc._id))) out.push(svc._id);
    }
    return out;
  }

  function parseCategory(raw, { required = true } = {}) {
    if (raw === undefined && !required) return undefined;
    const c = String(raw ?? '').trim();
    if (!CATEGORY_SLUGS.includes(c)) throw fieldError({ category: 'invalid_category' }, 'Elige una categoría');
    return c;
  }

  function parseName(raw, fallback) {
    const n = cleanName(raw).slice(0, MAX_STYLE_NAME);
    return n || fallback;
  }

  /* ─── Panel: subir (una o varias, RN-07) */
  async function upload(user, files, body = {}) {
    const { b, admin, professionalId } = await editor(user);
    if (!files.length) throw fieldError({ photos: 'required' }, 'Elige al menos una foto');
    if (files.length > MAX_STYLES_PER_UPLOAD) throw new HttpError(400, 'too_many_photos', `Puedes subir hasta ${MAX_STYLES_PER_UPLOAD} fotos a la vez.`, { max: MAX_STYLES_PER_UPLOAD });
    const category = parseCategory(body.category);
    const serviceIds = await parseServiceIds(b, body.serviceIds);
    const active = await Style.countDocuments({ businessId: b._id, active: true });
    if (active + files.length > MAX_ACTIVE_STYLES) throw new HttpError(409, 'too_many_styles', `El catálogo admite hasta ${MAX_ACTIVE_STYLES} estilos activos. Oculta o elimina alguno.`, { max: MAX_ACTIVE_STYLES });
    const label = STYLE_CATEGORIES.find((c) => c.slug === category).name;
    const name = parseName(body.name, label);
    const ids = [];
    try {
      for (const f of files) ids.push(await storePhoto(f.buffer, { kind: 'style', businessId: String(b._id) }, { maxSide: STYLE_PHOTO_SIDE }));
    } catch (err) {
      for (const id of ids) await deletePhoto(id);
      if (err.code === 'invalid_image') {
        const f = files[ids.length];
        throw new HttpError(400, 'invalid_image', INVALID_IMAGE_MESSAGE, { filename: f?.originalname });
      }
      throw err;
    }
    const docs = await Style.insertMany(ids.map((photoId) => ({ businessId: b._id, photoId, name, category, serviceIds, uploadedByUserId: user._id, professionalId, order: 0, active: true })));
    if (admin) await audit(user, b, 'style.upload', { summary: `Subió ${docs.length} estilo(s) en ${label}`, after: { ids: docs.map((d) => String(d._id)) } });
    return panelList(user);
  }

  /* RN-08: el barbero solo toca los suyos (el de otro → 403); el super admin, todos. */
  async function own(user, id) {
    const ctx = await editor(user);
    const _id = oid(id);
    const style = _id ? await Style.findOne({ _id, businessId: ctx.b._id }) : null;
    if (!style) throw notFound('ese estilo');
    if (!ctx.admin && String(style.professionalId || '') !== String(ctx.professionalId)) throw new HttpError(403, 'forbidden', 'Solo puedes editar los estilos que subiste');
    return { ...ctx, style };
  }

  async function update(user, id, body = {}) {
    const { b, admin, style } = await own(user, id);
    const before = { name: style.name, category: style.category, active: style.active, serviceIds: style.serviceIds.map(String), order: style.order };
    if (body.name !== undefined) {
      const n = parseName(body.name, '');
      if (!n) throw fieldError({ name: 'required' }, 'Escribe un nombre');
      style.name = n;
    }
    if (body.category !== undefined) style.category = parseCategory(body.category);
    if (body.serviceIds !== undefined) style.serviceIds = await parseServiceIds(b, body.serviceIds);
    if (body.order !== undefined) {
      const o = Number(body.order);
      if (!Number.isInteger(o) || o < 0 || o > 10_000) throw fieldError({ order: 'invalid_order' });
      style.order = o;
    }
    if (body.active !== undefined) {
      const next = body.active === true || body.active === 'true';
      if (next && !style.active && (await Style.countDocuments({ businessId: b._id, active: true })) >= MAX_ACTIVE_STYLES) {
        throw new HttpError(409, 'too_many_styles', `El catálogo admite hasta ${MAX_ACTIVE_STYLES} estilos activos.`, { max: MAX_ACTIVE_STYLES });
      }
      style.active = next;
    }
    await style.save();
    const after = { name: style.name, category: style.category, active: style.active, serviceIds: style.serviceIds.map(String), order: style.order };
    if (admin || before.active !== after.active) await audit(user, b, before.active !== after.active ? (after.active ? 'style.show' : 'style.hide') : 'style.update', { entityId: style._id, summary: `Estilo "${style.name}"`, before, after });
    return panelList(user);
  }

  /* Reordenar (super admin): la lista de ids en el orden deseado. */
  async function reorder(user, ids) {
    const { b, admin } = await editor(user);
    if (!admin) throw new HttpError(403, 'forbidden', 'Solo el local reordena el catálogo');
    if (!Array.isArray(ids)) throw fieldError({ ids: 'required' });
    const list = ids.map(oid).filter(Boolean);
    await Promise.all(list.map((_id, i) => Style.updateOne({ _id, businessId: b._id }, { $set: { order: i } })));
    await audit(user, b, 'style.reorder', { summary: `Reordenó ${list.length} estilo(s)` });
    return panelList(user);
  }

  async function remove(user, id) {
    const { b, style } = await own(user, id);
    await Style.deleteOne({ _id: style._id });
    await deletePhoto(style.photoId);
    await audit(user, b, 'style.delete', { entityId: style._id, summary: `Eliminó el estilo "${style.name}"`, before: { name: style.name, category: style.category, photoId: style.photoId } });
    return panelList(user);
  }

  /* ¿Puede `user` ver la foto de un estilo oculto? (RN-04: solo el panel). */
  async function canSeeStylePhoto(user, fileId) {
    const style = await Style.findOne({ photoId: String(fileId) }).lean();
    if (!style) return false;
    if (style.active) return 'public';
    if (!user) return false;
    if (isAdmin(user)) return 'restricted';
    const me = await Professional.findOne({ userId: user._id }, { _id: 1 }).lean();
    return me && String(me._id) === String(style.professionalId || '') ? 'restricted' : false;
  }

  /* ─── Foto propia del cliente */
  async function uploadClientPhoto(user, file) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión para subir tu foto');
    if (!file) throw fieldError({ photo: 'required' }, 'Elige una foto');
    const b = await agenda.business();
    const pending = await ClientPhoto.countDocuments({ userId: user._id, appointmentId: null });
    if (pending >= MAX_PROVISIONAL) throw new HttpError(429, 'too_many_pending', 'Ya subiste varias fotos sin terminar la reserva. Termina una o vuelve a intentar mañana.', { max: MAX_PROVISIONAL });
    let fileId;
    try {
      fileId = await storePhoto(file.buffer, { kind: 'client', businessId: String(b._id), userId: String(user._id) }, { maxSide: CLIENT_PHOTO_SIDE });
    } catch (err) {
      throw imageError(err);
    }
    await ClientPhoto.create({ businessId: b._id, userId: user._id, fileId, appointmentId: null, uploadedAt: new Date(clock()) });
    return { id: fileId, url: clientPhotoPath(fileId) };
  }

  async function discardClientPhoto(user, fileId) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    const doc = await ClientPhoto.findOne({ fileId: String(fileId), userId: user._id, appointmentId: null });
    if (!doc) throw notFound();
    await deleteClientPhoto(doc);
    return { ok: true };
  }

  async function deleteClientPhoto(doc) {
    await deletePhoto(doc.fileId);
    await ClientPhoto.deleteOne({ _id: doc._id });
  }

  /* RN-04: dueño de la cita (o de la provisional), barbero asignado y super admin. Otro → false (404). */
  async function canSeeClientPhoto(user, fileId) {
    if (!user) return false;
    const doc = await ClientPhoto.findOne({ fileId: String(fileId) }).lean();
    if (!doc) return false;
    if (String(doc.userId) === String(user._id)) return true;
    if (isAdmin(user)) return true;
    if (!doc.appointmentId) return false;
    const appt = await Appointment.findById(doc.appointmentId, { professionalId: 1, reference: 1 }).lean();
    if (!appt || appt.reference?.clientPhotoId !== String(fileId)) return false;
    return Boolean(await Professional.exists({ _id: appt.professionalId, userId: user._id }));
  }



  /* RN-09: el cliente cambia o quita su referencia mientras la cita no esté en un estado final.
     body.styleId: id | null (quitar) | undefined (sin cambio). Igual body.clientPhotoId. */
  async function changeReference(user, id, body = {}) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    const b = await agenda.business();
    const { appt, role } = await agenda.load(id, user);
    if (role !== 'client') throw new HttpError(403, 'forbidden', 'Solo quien reservó puede cambiar su foto de referencia');
    if (FINAL.includes(appt.status)) throw new HttpError(409, 'invalid_transition', 'Esta cita ya terminó: no se puede cambiar la foto.');
    const cur = appt.reference?.toObject?.() || appt.reference || {};
    const set = {};
    const unset = {};
    let toDelete = null;
    let attach = null;
    if (body.styleId !== undefined) {
      if (body.styleId === null || body.styleId === '') Object.assign(unset, { 'reference.styleId': 1, 'reference.styleName': 1, 'reference.stylePhotoId': 1 });
      else {
        const { reference } = await resolveReference(b, user, { styleId: body.styleId });
        Object.assign(set, { 'reference.styleId': reference.styleId, 'reference.styleName': reference.styleName, 'reference.stylePhotoId': reference.stylePhotoId });
      }
    }
    if (body.clientPhotoId !== undefined && body.clientPhotoId !== cur.clientPhotoId) {
      if (body.clientPhotoId === null || body.clientPhotoId === '') unset['reference.clientPhotoId'] = 1;
      else {
        const { photo } = await resolveReference(b, user, { clientPhotoId: body.clientPhotoId });
        set['reference.clientPhotoId'] = photo.fileId;
        attach = photo;
      }
      unset['reference.clientPhotoState'] = 1;
      set['reference.clientPhotoChangedAt'] = new Date(clock());
      if (cur.clientPhotoId) toDelete = await ClientPhoto.findOne({ fileId: cur.clientPhotoId });
    }
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (Object.keys(update).length) await Appointment.updateOne({ _id: appt._id }, update);
    await attachPhoto(attach, appt._id);
    /* RN-09: al quitar o reemplazar la foto propia, la anterior se borra de GridFS. */
    if (toDelete) await deleteClientPhoto(toDelete);
    return agenda.view(String(appt._id), user);
  }


  /* ─── Moderación (RN-07 del alcance): el super admin quita la foto del cliente. */
  async function moderateRemove(user, id) {
    if (!user) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
    if (!isAdmin(user)) throw new HttpError(403, 'forbidden', 'Solo el local puede quitar fotos');
    const b = await agenda.business();
    const _id = oid(id);
    const appt = _id ? await Appointment.findOne({ _id, businessId: b._id }) : null;
    if (!appt) throw new HttpError(404, 'not_found', 'No encontramos esta cita');
    const fileId = appt.reference?.clientPhotoId;
    if (!fileId) throw new HttpError(409, 'no_photo', 'Esta cita no tiene foto del cliente');
    await Appointment.updateOne({ _id: appt._id }, { $unset: { 'reference.clientPhotoId': 1 }, $set: { 'reference.clientPhotoState': 'removed', 'reference.clientPhotoChangedAt': new Date(clock()) } });
    const doc = await ClientPhoto.findOne({ fileId });
    if (doc) await deleteClientPhoto(doc);
    else await deletePhoto(fileId);
    await audit(user, b, 'appointment.photo_removed', { entityId: appt._id, summary: `Quitó la foto del cliente de la cita de ${appt.customerSnapshot?.name || 'un cliente'}`, before: { clientPhotoId: fileId } });
    return { ok: true };
  }

  /* ─── Limpieza periódica (RN-03, asunción 7). */
  async function runCleanup() {
    const now = clock();
    let provisional = 0;
    let expired = 0;
    const stale = await ClientPhoto.find({ appointmentId: null, uploadedAt: { $lt: new Date(now - PROVISIONAL_TTL_MS) } }).limit(500);
    for (const doc of stale) {
      await deleteClientPhoto(doc);
      provisional++;
    }
    const old = await Appointment.find({ status: { $in: FINAL }, endsAt: { $lt: new Date(now - CLIENT_PHOTO_RETENTION_MS) }, 'reference.clientPhotoId': { $type: 'string' } }, { reference: 1 }).limit(500);
    for (const a of old) {
      const fileId = a.reference.clientPhotoId;
      await Appointment.updateOne({ _id: a._id }, { $unset: { 'reference.clientPhotoId': 1 }, $set: { 'reference.clientPhotoState': 'expired', 'reference.clientPhotoChangedAt': new Date(now) } });
      const doc = await ClientPhoto.findOne({ fileId });
      if (doc) await deleteClientPhoto(doc);
      else await deletePhoto(fileId);
      expired++;
    }
    if (provisional || expired) logger.log?.(`[estilos] limpieza: ${provisional} provisional(es), ${expired} expirada(s)`);
    return { provisional, expired };
  }

  /* RN-10: al eliminar la cuenta se borran sus fotos de cliente. */
  async function onAccountDeleted(user) {
    const docs = await ClientPhoto.find({ userId: user._id });
    for (const doc of docs) await deleteClientPhoto(doc);
    await Appointment.updateMany(
      { customerUserId: user._id, 'reference.clientPhotoId': { $type: 'string' } },
      { $unset: { 'reference.clientPhotoId': 1 }, $set: { 'reference.clientPhotoState': 'deleted', 'reference.clientPhotoChangedAt': new Date(clock()) } }
    );
    return { deleted: docs.length };
  }

  return {
    editor,
    publicList,
    panelList,
    upload,
    update,
    reorder,
    remove,
    canSeeStylePhoto,
    uploadClientPhoto,
    discardClientPhoto,
    canSeeClientPhoto,
    changeReference,
    moderateRemove,
    runCleanup,
    onAccountDeleted,
    photoFile,
  };
}
