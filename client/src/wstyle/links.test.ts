import { describe, expect, it } from 'vitest';
import { bookingLabel, bookingLink, ctaLinks, DEMO_CONTACT_URL, isDemo } from './links';
import { clPhone } from './lib';
import { jsonLd, type SiteContent } from './content';
import siteJson from '../../public/wstyle/content/site.json';

// SPEC-31: datos de demo verosímiles y CTAs que en demo no contactan al número ficticio.
const site = siteJson as SiteContent;

describe('site.json de demo (SPEC-31)', () => {
  it('no trae los datos delatores', () => {
    const raw = JSON.stringify(site);
    expect(raw).not.toMatch(/Calle\sFalsa|0{4} 0{4}/);
  });
  it('teléfono móvil chileno con formato válido y sin patrones falsos', () => {
    for (const p of [site.contact?.phone, site.contact?.whatsapp]) {
      expect(p).toMatch(/^\+56 9 \d{4} \d{4}$/);
      expect(p).not.toMatch(/0000|1234|5555/);
      expect(clPhone(p)).toMatch(/^569\d{8}$/);
    }
  });
  it('mapsUrl coherente con la dirección', () => {
    const ad = site.contact!.address!;
    const q = encodeURIComponent(`${ad.street}, ${ad.city}`);
    expect(site.contact?.mapsUrl).toBe(`https://www.google.com/maps/search/?api=1&query=${q}`);
  });
  it('sigue en demo', () => expect(isDemo(site)).toBe(true));
  it('JSON-LD publica lo que se muestra', () => {
    const ld = jsonLd(site, 'https://ricorp.cl/wstyle/') as { telephone: string; address: { streetAddress: string } };
    expect(ld.telephone).toBe(site.contact?.phone);
    expect(ld.address.streetAddress).toBe(site.contact?.address?.street);
  });
});

describe('ctaLinks / bookingLink según demo', () => {
  const base: SiteContent = { contact: { phone: '+56 9 6482 3175', whatsapp: '+56 9 6482 3175', whatsappText: 'Hola' } };

  it.each([true, 'true', 'TRUE', ' True '])('demo=%j: WhatsApp, Llamar y Reservar van al destino seguro', (demo) => {
    const s = { ...base, demo } as SiteContent;
    const l = ctaLinks(s);
    expect(l.whatsapp).toBe(DEMO_CONTACT_URL);
    expect(l.tel).toBe(DEMO_CONTACT_URL);
    expect(bookingLink(s)).toBe(DEMO_CONTACT_URL);
    expect(JSON.stringify(l)).not.toMatch(/56964823175/);
  });

  it('demo con booking.url configurado: Reservar va a la agenda', () => {
    const s: SiteContent = { ...base, demo: true, booking: { url: 'https://agenda.example/demo' } };
    expect(bookingLink(s)).toBe('https://agenda.example/demo');
  });

  it('demo sin teléfono reconocido: no inventa botones', () => {
    const s: SiteContent = { demo: true, contact: { phone: 'xx' } };
    expect(ctaLinks(s).tel).toBeNull();
    expect(ctaLinks(s).whatsapp).toBeNull();
  });

  it.each([false, 'false', undefined])('demo=%j: funcionan con el número', (demo) => {
    const s = { ...base, demo } as SiteContent;
    const l = ctaLinks(s);
    expect(l.whatsapp).toBe('https://wa.me/56964823175?text=Hola');
    expect(l.tel).toBe('tel:+56964823175');
    expect(bookingLink(s)).toBe('https://wa.me/56964823175?text=Hola');
  });
});

// SPEC-26: un único destino de reserva; "Reservar por WhatsApp" solo si ese destino es WhatsApp.
describe('bookingLabel (SPEC-26)', () => {
  const real: SiteContent = { ...site, demo: false, booking: {} };
  it('sin agenda y con WhatsApp: "Reservar por WhatsApp" y destino wa.me', () => {
    expect(bookingLink(real)).toMatch(/^https:\/\/wa\.me\//);
    expect(bookingLabel(real)).toBe('Reservar por WhatsApp');
  });
  it('con agenda online: "Reservar" y destino la agenda', () => {
    const s: SiteContent = { ...real, booking: { url: 'https://agenda.example/test' } };
    expect(bookingLink(s)).toBe('https://agenda.example/test');
    expect(bookingLabel(s)).toBe('Reservar');
  });
  it('solo teléfono: "Reservar" con tel:', () => {
    const s: SiteContent = { ...real, contact: { ...real.contact, whatsapp: undefined } };
    expect(bookingLink(s)).toMatch(/^tel:\+569/);
    expect(bookingLabel(s)).toBe('Reservar');
  });
  it('sin ningún canal: null', () => {
    const s: SiteContent = { ...real, contact: {} };
    expect(bookingLink(s)).toBeNull();
    expect(bookingLabel(s)).toBeNull();
  });  // El site.json que se entrega es demo:true con la agenda propia (SPEC-32) en booking.url: en demo también se
  // reserva ahí, porque no contacta a ningún número inventado (SPEC-31). Sin agenda caería en DEMO_CONTACT_URL.
  it('site.json tal cual (demo): "Reservar" con destino la agenda propia', () => {
    expect(isDemo(site)).toBe(true);
    expect(bookingLink(site)).toBe('/wstyle/reservar/');
    expect(bookingLabel(site)).toBe('Reservar');
  });
  it.each([true, 'true'])('demo=%j sin agenda: nunca dice "por WhatsApp"', (demo) => {
    const s = { ...real, demo } as SiteContent;
    expect(bookingLink(s)).toBe(DEMO_CONTACT_URL);
    expect(bookingLabel(s)).toBe('Reservar');
  });
  it('el texto coincide con el esquema del destino', () => {
    for (const s of [site, real, { ...real, booking: { url: 'https://wa.me/56900000001' } } as SiteContent]) {
      const href = bookingLink(s)!;
      expect(bookingLabel(s) === 'Reservar por WhatsApp').toBe(href.startsWith('https://wa.me/'));
    }
  });
});
