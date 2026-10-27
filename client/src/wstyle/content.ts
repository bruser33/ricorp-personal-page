// Contenido editable del sitio (public/wstyle/content/*.json + public/wstyle/config.json). El dueño puede dejar
// campos vacíos o mal escritos: todo es opcional y se renderiza solo lo que haya.
export interface Hours { days?: string; dayCodes?: string; opens?: string | null; closes?: string | null }
export interface SiteContent {
  name?: string; slogan?: string;
  headlines?: Record<string, string | undefined>;
  copy?: Record<string, string | undefined>;
  contact?: {
    phone?: string; whatsapp?: string; whatsappText?: string; mapsUrl?: string;
    address?: { street?: string; city?: string; region?: string };
  };
  hours?: Hours[];
  concept?: string;
  stat?: { value?: string; label?: string; note?: string };
  marquee?: string[];
  booking?: { provider?: string; url?: string };
  membership?: { name?: string; priceCLP?: unknown; period?: string; perks?: string[]; note?: string };
  // Bloques que solo se publican con datos reales (enabled:true); mientras tanto no se muestra relleno.
  reviews?: { enabled?: boolean; source?: string; items?: { author?: string; rating?: number; text?: string }[] };
  barbers?: { enabled?: boolean; items?: { name?: string; role?: string; instagram?: string; bookingUrl?: string }[] };
  demo?: boolean | string;   // true o "true" (editado a mano) ⇒ modo demostración
  policies?: { title?: string; text?: string }[];
}
export interface Service { id?: string; name?: string; description?: string; priceCLP?: unknown; durationMin?: unknown }
export interface Config { poweredBy?: boolean }
export interface Content { site: SiteContent; services: Service[]; config: Config }

export const SHOT_IDS = ['hero', 'reyes', 'linea', 'afilado', 'trono', 'servicios', 'llega'] as const;
export type ShotId = (typeof SHOT_IDS)[number];

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const hoursText = (h: Hours) => (h.opens && h.closes ? `${h.opens} – ${h.closes}` : h.opens ? `desde ${h.opens}` : h.closes ? `hasta ${h.closes}` : 'Cerrado');
// openingHours de schema.org se deriva de las mismas filas (única fuente): solo las que tienen dayCodes, apertura y cierre.
export const openingHours = (hours: Hours[]) => hours.filter((h) => h && str(h.dayCodes) && str(h.opens) && str(h.closes)).map((h) => `${h.dayCodes} ${h.opens}-${h.closes}`);
export const validHours = (site: SiteContent): Hours[] => (Array.isArray(site.hours) ? site.hours.filter((h) => h && str(h.days)) : []);

// JSON-LD BarberShop (SEO local) desde site.json; se omiten los campos que falten.
export function jsonLd(site: SiteContent, url: string) {
  const c = site.contact ?? {}, ad = c.address ?? {};
  const address = Object.fromEntries(Object.entries({ streetAddress: str(ad.street), addressLocality: str(ad.city), addressRegion: str(ad.region) }).filter(([, v]) => v));
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'BarberShop', name: str(site.name), description: str(site.slogan), telephone: str(c.phone),
    address: Object.keys(address).length ? { '@type': 'PostalAddress', ...address, addressCountry: 'CL' } : null,
    openingHours: openingHours(validHours(site)), url, hasMap: str(c.mapsUrl),
  };
  for (const k of Object.keys(ld)) if (ld[k] == null) delete ld[k];
  return ld;
}

// Textos de <head> que siguen al nombre del JSON.
export const headTexts = (site: SiteContent) => {
  const name = str(site.name), slogan = str(site.slogan);
  return { title: [name, slogan].filter(Boolean).join(' — '), description: [name, slogan].filter(Boolean).join(': '), ogTitle: name ?? '' };
};

// Carga en runtime (rutas relativas a /wstyle/). config.json es de Ricorp: si falta, valores por defecto.
export async function loadContent(base = './'): Promise<Content> {
  const load = (n: string) => fetch(`${base}content/${n}.json`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`content/${n}.json: HTTP ${r.status}`);
    return r.json();
  });
  const config = fetch(`${base}config.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const [site, services, cfg] = await Promise.all([load('site'), load('services'), config]);
  return { site, services: Array.isArray(services) ? services : [], config: cfg ?? {} };
}

// ─── Carta y horario desde la API (SPEC-34 RN-06). La BD es la fuente de verdad en runtime: al cargar, la landing
// pide GET /api/wstyle/catalog y reemplaza lo prerenderizado (servicios activos, horario y contacto). Si la API falla
// o tarda más de 4 s, se queda con el JSON estático (fallback) sin mostrar ningún error (CB-07).
export const CATALOG_TIMEOUT_MS = 4000;
export interface LandingCatalog {
  services: { id: string; name: string; description?: string; priceCLP: number; durationMin: number }[];
  business: {
    hoursRows?: Hours[];
    contact?: { whatsapp?: string | null; phone?: string | null };
  };
}

// Mezcla pura (probada en content.test.ts): la carta de la BD reemplaza a la del JSON; el horario solo si la BD trae
// filas; del contacto solo teléfono y WhatsApp (dirección, mapa y textos siguen en site.json, asunción 9).
export function mergeCatalog(content: Content, catalog: LandingCatalog | null): Content {
  if (!catalog || !Array.isArray(catalog.services)) return content;
  const services: Service[] = catalog.services.map((s) => ({ id: s.id, name: s.name, description: s.description ?? '', priceCLP: s.priceCLP, durationMin: s.durationMin }));
  const site: SiteContent = { ...content.site };
  const rows = catalog.business?.hoursRows;
  if (Array.isArray(rows) && rows.some((h) => h && str(h.days))) site.hours = rows;
  const c = catalog.business?.contact;
  if (c && (str(c.phone) || str(c.whatsapp))) {
    site.contact = { ...(site.contact ?? {}), ...(str(c.phone) ? { phone: c.phone as string } : {}), ...(str(c.whatsapp) ? { whatsapp: c.whatsapp as string } : {}) };
  }
  return { ...content, site, services };
}

// GET /api/wstyle/catalog con tope de 4 s. null = usar el JSON (API caída, dormida, lenta o sin negocio configurado).
export async function loadCatalog(apiBase: string, timeoutMs = CATALOG_TIMEOUT_MS): Promise<LandingCatalog | null> {
  try {
    const r = await fetch(`${apiBase}/api/wstyle/catalog`, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    if (!r.ok) return null;
    const data = await r.json();
    return data && Array.isArray(data.services) ? (data as LandingCatalog) : null;
  } catch {
    return null;
  }
}
