import { clPhone, toCLP } from './lib';
import { str, type Service, type SiteContent } from './content';

// Enlaces de CTA desde el JSON. null ⇒ el botón no se muestra (dato faltante o teléfono no reconocido).
export function ctaLinks(site: SiteContent) {
  const c = site.contact ?? {};
  const wa = clPhone(c.whatsapp), tel = clPhone(c.phone);
  return {
    whatsapp: wa ? `https://wa.me/${wa}` + (str(c.whatsappText) ? `?text=${encodeURIComponent(c.whatsappText!)}` : '') : null,
    tel: tel ? `tel:+${tel}` : null,
    maps: str(c.mapsUrl),
  };
}

// Link de reserva (regla documentada en docs/direccion-de-arte.md): agenda online (AgendaPro/Reservo) → WhatsApp →
// teléfono. Así el CTA fijo siempre lleva a un canal real; sin ninguno de los tres no se muestra.
export function bookingLink(site: SiteContent) {
  const l = ctaLinks(site);
  return str(site.booking?.url) ?? l.whatsapp ?? l.tel;
}

// Precio "desde" para el hero: el del corte si existe ("Corte desde $12.000"); si no, el más bajo de la carta.
export function fromPrice(services: Service[]): { label: string; price: number } | null {
  const corte = services.find((s) => s?.id === 'corte' && Number.isFinite(toCLP(s.priceCLP)));
  if (corte) return { label: 'Corte', price: toCLP(corte.priceCLP) };
  const p = services.map((s) => toCLP(s?.priceCLP)).filter((n) => Number.isFinite(n));
  return p.length ? { label: 'Servicios', price: Math.min(...p) } : null;
}
export const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
