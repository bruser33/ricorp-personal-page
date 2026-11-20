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
  // SPEC-61: pantallas extra del inicio (la 1 es siempre el barbero). Ver heroSlides.ts.
  hero?: { slides?: { id?: string; src?: string; srcSm?: string; alt?: string; caption?: string }[] };
  stat?: { value?: string; label?: string; note?: string };
  marquee?: string[];
  booking?: { provider?: string; url?: string };
  plans?: { id: string; name: string; subtitle: string; price: number; perks: string[] }[];
  membership?: { name?: string; priceCLP?: unknown; period?: string; perks?: string[]; note?: string };
  // Bloque que solo se publica con datos reales (enabled:true); mientras tanto no se muestra relleno. Las reseñas ya no
  // viven acá: salen de la BD (SPEC-52, reviews.ts).
  barbers?: { enabled?: boolean; items?: { name?: string; role?: string; instagram?: string; bookingUrl?: string }[] };
  demo?: boolean | string;   // true o "true" (editado a mano) ⇒ modo demostración
  policies?: { title?: string; text?: string }[];
}
export interface Service { id?: string; name?: string; description?: string; priceCLP?: unknown; durationMin?: unknown; category?: string; homeServiceAllowed?: boolean }
// SPEC-51: categoría de la carta (Barbería, Decoloración capilar…). `note` va una vez bajo el título del grupo.
export interface Category { id?: string; name?: string; note?: string }
export interface Config { poweredBy?: boolean }
// giftCardsOnline (SPEC-60): viene del catálogo de la API; sin API (o apagada) no hay enlace "Regala WS Style".
export interface Content { site: SiteContent; services: Service[]; categories?: Category[]; config: Config; giftCardsOnline?: boolean }

// services.json es { categories, services } (SPEC-51). Se acepta también el formato antiguo (array de servicios).
export function normalizeServicesJson(raw: unknown): { services: Service[]; categories: Category[] } {
  if (Array.isArray(raw)) return { services: raw, categories: [] };
  const o = (raw ?? {}) as { services?: unknown; categories?: unknown };
  return { services: Array.isArray(o.services) ? o.services : [], categories: Array.isArray(o.categories) ? o.categories : [] };
}

// SPEC-51 RN-01/02/03: grupos de la carta en el orden de las categorías; dentro de cada grupo, el orden de llegada
// (el `order` de la BD). Un servicio sin categoría (o con una desconocida) cae en "Barbería". Las categorías sin
// servicios no se muestran. Genérico: lo usan la landing, la reserva y los paneles.
export const DEFAULT_CATEGORY = { id: 'barberia', name: 'Barbería', note: '' } as const;
export interface CategoryGroup<T> { id: string; name: string; note: string; items: T[] }
export function groupByCategory<T extends { category?: string | null }>(services: T[], categories: Category[] | null | undefined): CategoryGroup<T>[] {
  const cats = (Array.isArray(categories) ? categories : []).filter((c): c is Category & { id: string } => !!c && !!str(c.id));
  const groups = new Map<string, CategoryGroup<T>>();
  for (const c of cats) if (!groups.has(c.id)) groups.set(c.id, { id: c.id, name: str(c.name) ?? c.id, note: str(c.note) ?? '', items: [] });
  if (!groups.has(DEFAULT_CATEGORY.id)) {
    const rest = [...groups.entries()];
    groups.clear();
    groups.set(DEFAULT_CATEGORY.id, { ...DEFAULT_CATEGORY, items: [] });
    for (const [k, v] of rest) groups.set(k, v);
  }
  for (const s of services) {
    const key = s.category && groups.has(s.category) ? s.category : DEFAULT_CATEGORY.id;
    groups.get(key)!.items.push(s);
  }
  return [...groups.values()].filter((g) => g.items.length);
}

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

// Capítulos numerados sin huecos (D4): 01… en el orden en que se publican. Barberos con enabled y datos; "Lo que dicen"
// solo si la API trae reseñas visibles (SPEC-52 RN-11); los apagados no dejan hueco en la numeración.
export interface Chapter { id: string; label: string; num: string }
export function buildChapters(site: SiteContent, hasReviews: boolean): Chapter[] {
  const showBarbers = !!site.barbers?.enabled && (site.barbers.items ?? []).some((b) => str(b?.name));
  const list: [string, string, boolean][] = [
    ['hero', 'Inicio', true], ['reyes', 'El local', true], ['linea', 'El oficio', true], ['afilado', 'El espejo', true], ['trono', 'Tu trono', true],
    ['servicios', 'La carta', true], ['membresia', 'Membresía', !!site.plans?.length || !!str(site.membership?.name)], ['barberos', 'Los barberos', showBarbers],
    ['resenas', 'Lo que dicen', hasReviews], ['politicas', 'Antes de venir', (site.policies ?? []).some((p) => str(p?.title))], ['llega', 'Llega', true],
  ];
  let n = 0;
  return list.filter(([, , on]) => on).map(([id, label]) => ({ id, label, num: id === 'hero' ? '' : `${String(++n).padStart(2, '0')} — ${label}` }));
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
  return { site, ...normalizeServicesJson(services), config: cfg ?? {} };
}

// ─── Carta y horario desde la API (SPEC-34 RN-06). La BD es la fuente de verdad en runtime: al cargar, la landing
// pide GET /api/wstyle/catalog y reemplaza lo prerenderizado (servicios activos, horario y contacto). Si la API falla
// o tarda más de 4 s, se queda con el JSON estático (fallback) sin mostrar ningún error (CB-07).
export const CATALOG_TIMEOUT_MS = 4000;
export interface LandingCatalog {
  categories?: { id: string; name: string; note?: string }[];
  services: { id: string; name: string; description?: string; priceCLP: number; durationMin: number; category?: string }[];
  business: {
    hoursRows?: Hours[];
    contact?: { whatsapp?: string | null; phone?: string | null };
    // SPEC-60: el enlace "Regala WS Style" solo aparece si la venta en línea está activa.
    giftCards?: { online?: boolean };
  };
}

// Mezcla pura (probada en content.test.ts): la carta de la BD reemplaza a la del JSON; el horario solo si la BD trae
// filas; del contacto solo teléfono y WhatsApp (dirección, mapa y textos siguen en site.json, asunción 9).
export function mergeCatalog(content: Content, catalog: LandingCatalog | null): Content {
  if (!catalog || !Array.isArray(catalog.services)) return content;
  // Una API anterior a SPEC-51 no conoce la carta agrupada publicada.
  const legacyCatalog = !Array.isArray(catalog.categories) && Boolean(content.categories?.length);
  const services: Service[] = legacyCatalog ? content.services : catalog.services.map((s) => ({ id: s.id, name: s.name, description: s.description ?? '', priceCLP: s.priceCLP, durationMin: s.durationMin, ...(s.category ? { category: s.category } : {}) }));
  const categories = Array.isArray(catalog.categories) ? catalog.categories : content.categories;
  const site: SiteContent = { ...content.site };
  const rows = catalog.business?.hoursRows;
  if (Array.isArray(rows) && rows.some((h) => h && str(h.days))) site.hours = rows;
  const c = catalog.business?.contact;
  if (c && (str(c.phone) || str(c.whatsapp))) {
    site.contact = { ...(site.contact ?? {}), ...(str(c.phone) ? { phone: c.phone as string } : {}), ...(str(c.whatsapp) ? { whatsapp: c.whatsapp as string } : {}) };
  }
  return { ...content, site, services, categories, giftCardsOnline: catalog.business?.giftCards?.online === true };
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
