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

// Link de reserva: la agenda online si está configurada (AgendaPro/Reservo), si no WhatsApp.
export function bookingLink(site: SiteContent) {
  return str(site.booking?.url) ?? ctaLinks(site).whatsapp;
}

// Precio "desde" para el hero: el del corte si existe ("Corte desde $12.000"); si no, el más bajo de la carta.
export function fromPrice(services: Service[]): { label: string; price: number } | null {
  const corte = services.find((s) => s?.id === 'corte' && Number.isFinite(toCLP(s.priceCLP)));
  if (corte) return { label: 'Corte', price: toCLP(corte.priceCLP) };
  const p = services.map((s) => toCLP(s?.priceCLP)).filter((n) => Number.isFinite(n));
  return p.length ? { label: 'Servicios', price: Math.min(...p) } : null;
}
export const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
