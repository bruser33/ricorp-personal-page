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
  reviews?: { source?: string; placeholder?: boolean; items?: { author?: string; rating?: number; text?: string }[] };
  barbers?: { name?: string; role?: string; instagram?: string; bookingUrl?: string; placeholder?: boolean }[];
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
