import { useEffect, useState } from 'react';
import { api, API_BASE, ApiError, type Appointment } from './api';

// SPEC-59: catálogo de estilos y foto de referencia del cliente. Las fotos de clientes son privadas: se piden con
// la cookie de sesión (fetch con credentials) y se muestran como blob, así funcionan aunque el navegador bloquee las
// cookies de terceros en un <img> (front en Pages, API en Render).

export interface StyleCategory { slug: string; name: string }
export interface StyleItem { id: string; name: string; category: string; serviceIds: string[]; photoUrl: string }
export interface PanelStyle extends StyleItem { active: boolean; order: number; professionalId: string | null; createdAt?: string; uploadedBy: string }
export interface StylesPanel {
  categories: StyleCategory[];
  services: { id: string; name: string; category: string }[];
  limits: { maxActive: number; perUpload: number; activeCount: number };
  items: PanelStyle[];
}

/* La referencia que se guarda en la cita (lo que devuelve el server). */
export interface Reference {
  style: { id: string | null; name: string; photoUrl: string | null } | null;
  clientPhoto: { id: string; url: string } | null;
  clientPhotoNotice: string | null;
}

/* Lo que el cliente va eligiendo en "Tu estilo" (antes de confirmar). */
export interface StyleChoice {
  style: StyleItem | null;
  photo: { id: string; url: string; preview?: string } | null;
}
export const NO_CHOICE: StyleChoice = { style: null, photo: null };

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export const assetUrl = (u: string) => (u.startsWith('/api/') ? API_BASE + u : u);

/* CB-02: se avisa ANTES de subir (el server igual valida por contenido). */
export function checkPhotoFile(file: Pick<File, 'size' | 'type' | 'name'>): string | null {
  if (file.size > MAX_PHOTO_BYTES) return 'La foto pesa más de 5 MB. Elige otra o una captura de pantalla.';
  const heic = /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (heic) return 'Las fotos HEIC no se pueden subir. En el iPhone elige "Más compatible" o sube una captura.';
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return 'Esa imagen no se pudo leer. Prueba con un JPG o PNG.';
  return null;
}

/* RN-06 en el front: estilos que aplican a un servicio (el server ya filtra; esto sirve para "Ver todos"). */
export function stylesForService(items: StyleItem[], serviceId: string, category: string | null) {
  return items.filter((s) => (s.serviceIds.length ? s.serviceIds.includes(serviceId) : s.category === category));
}

async function upload<T>(path: string, fd: FormData, method = 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, body: fd, credentials: 'include', signal: AbortSignal.timeout(90_000) });
  } catch {
    throw new ApiError(0, 'network', 'No pudimos subir la foto. Puedes reintentar o seguir sin foto.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'No pudimos subir la foto'), data);
  return data as T;
}

export const styles = {
  list: (service?: string) => api<{ categories: StyleCategory[]; category: string | null; items: StyleItem[] }>(`/api/wstyle/styles${service ? `?service=${encodeURIComponent(service)}` : ''}`),
  uploadReference: (file: File) => {
    const fd = new FormData();
    fd.append('photo', file, file.name);
    return upload<{ id: string; url: string }>('/api/wstyle/reference-photo', fd);
  },
  discardReference: (id: string) => api<{ ok: boolean }>(`/api/wstyle/reference-photo/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  changeReference: (apptId: string, body: { styleId?: string | null; clientPhotoId?: string | null }) =>
    api<Appointment>(`/api/wstyle/appointments/${encodeURIComponent(apptId)}/reference`, { method: 'PUT', body }),
};

/* Gestión del catálogo: el admin en /api/admin/styles, el barbero en /api/pro/styles (solo los suyos). */
export function stylesPanel(base: '/api/admin/styles' | '/api/pro/styles') {
  return {
    list: () => api<StylesPanel>(base),
    upload: (files: File[], fields: { category: string; name?: string; serviceIds?: string[] }) => {
      const fd = new FormData();
      fd.append('category', fields.category);
      if (fields.name) fd.append('name', fields.name);
      if (fields.serviceIds?.length) fd.append('serviceIds', JSON.stringify(fields.serviceIds));
      for (const f of files) fd.append('photos', f, f.name);
      return upload<StylesPanel>(base, fd);
    },
    update: (id: string, body: Partial<{ name: string; category: string; serviceIds: string[]; active: boolean; order: number }>) =>
      api<StylesPanel>(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    remove: (id: string) => api<StylesPanel>(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reorder: (ids: string[]) => api<StylesPanel>(`${base}/reorder`, { method: 'POST', body: { ids } }),
  };
}

/* Imagen que exige sesión (foto del cliente, estilo oculto en el panel) → object URL. null mientras carga o si falla. */
export function usePrivateImage(path: string | null | undefined) {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let objectUrl: string | null = null;
    fetch(assetUrl(path), { credentials: 'include' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        if (alive) setState({ path, url: objectUrl, failed: false });
      })
      .catch(() => { if (alive) setState({ path, url: null, failed: true }); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (!path || state?.path !== path) return { url: null, failed: false };
  return { url: state.url, failed: state.failed };
}
