import { clPhone, toCLP } from './lib';
import { str, type Service, type SiteContent } from './content';

// Destino seguro de los CTA en modo demo (SPEC-31): el teléfono del JSON es ficticio y podría ser de una persona
// real, así que WhatsApp/Llamar/Reservar llevan al contacto de Ricorp en vez de marcarlo o escribirle.
export const DEMO_CONTACT_URL = 'https://ricorp.cl/contacto';

// demo: true o "true" (editado a mano, sin importar mayúsculas ni espacios) ⇒ modo demostración.
export const isDemo = (site: SiteContent) => site.demo === true || String(site.demo).trim().toLowerCase() === 'true';

// Enlaces de CTA desde el JSON. null ⇒ el botón no se muestra (dato faltante o teléfono no reconocido).
// En demo, los botones que existirían con el número real apuntan a DEMO_CONTACT_URL.
export function ctaLinks(site: SiteContent) {
  const c = site.contact ?? {};
  const wa = clPhone(c.whatsapp), tel = clPhone(c.phone);
  const demo = isDemo(site);
  return {
    whatsapp: wa ? (demo ? DEMO_CONTACT_URL : `https://wa.me/${wa}` + (str(c.whatsappText) ? `?text=${encodeURIComponent(c.whatsappText!)}` : '')) : null,
    tel: tel ? (demo ? DEMO_CONTACT_URL : `tel:+${tel}`) : null,
    maps: str(c.mapsUrl),
  };
}

// Link de reserva (regla documentada en docs/direccion-de-arte.md): agenda online (AgendaPro/Reservo) → WhatsApp →
// teléfono. Así el CTA fijo siempre lleva a un canal real; sin ninguno de los tres no se muestra. En demo, sin
// agenda configurada, cae en el destino seguro vía ctaLinks.
export function bookingLink(site: SiteContent) {
  const l = ctaLinks(site);
  return str(site.booking?.url) ?? l.whatsapp ?? l.tel;
}

// Texto del CTA de reserva de "Tu trono" (SPEC-26 regla 4): dice "por WhatsApp" solo si el destino de bookingLink()
// es el WhatsApp de ctaLinks (sin agenda online); con agenda o solo teléfono es "Reservar". null ⇒ sin CTA.
export function bookingLabel(site: SiteContent) {
  const href = bookingLink(site);
  if (!href) return null;
  return !str(site.booking?.url) && href === ctaLinks(site).whatsapp ? 'Reservar por WhatsApp' : 'Reservar';
}

// Precio "desde" para el hero: el del corte si existe ("Corte desde $12.000"); si no, el más bajo de la carta.
export function fromPrice(services: Service[]): { label: string; price: number } | null {
  const corte = services.find((s) => s?.id === 'corte' && Number.isFinite(toCLP(s.priceCLP)));
  if (corte) return { label: 'Corte', price: toCLP(corte.priceCLP) };
  const p = services.map((s) => toCLP(s?.priceCLP)).filter((n) => Number.isFinite(n));
  return p.length ? { label: 'Servicios', price: Math.min(...p) } : null;
}
// Atributos de un enlace externo: tel: abre el marcador en la misma pestaña (con _blank queda una pestaña vacía).
export const ext = (href: string) => (href.startsWith('tel:') ? {} : { target: '_blank', rel: 'noopener' });
export const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
