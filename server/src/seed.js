/* Seed de la agenda (SPEC-32). Mientras no existan SPEC-33 (registro de barberos) y
   SPEC-34 (carta y horario editables), el negocio, la carta y el horario salen de
   client/public/wstyle/content/*.json y se crean barberos de demostración aprobados.

   Uso: `npm run seed` (BD de MONGO_URI). Idempotente: re-ejecutarlo actualiza. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AvailabilityRule,
  Business,
  Membership,
  PlatformSettings,
  Professional,
  ProfessionalService,
  Service,
  User,
} from './models/index.js';

const CODES = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7 };

/* "Mo-Fr" / "Sa" / "Mo,We" → [1..5] / [6] / [1,3] */
export function expandDayCodes(codes) {
  const out = [];
  for (const part of String(codes || '').split(',')) {
    const [a, b] = part.trim().split('-').map((x) => CODES[x?.trim()]);
    if (!a) continue;
    for (let d = a; d <= (b || a); d++) out.push(d);
  }
  return out;
}

export function hoursFromSite(site) {
  const byDay = new Map();
  for (const h of site.hours || []) for (const d of expandDayCodes(h.dayCodes)) byDay.set(d, { weekday: d, opens: h.opens || null, closes: h.closes || null });
  return [1, 2, 3, 4, 5, 6, 7].map((d) => byDay.get(d) || { weekday: d, opens: null, closes: null });
}

/* Barberos de demostración (marcados como tales en la bio). */
export const DEMO_PROS = [
  {
    displayName: 'Matías Rojas',
    specialty: 'Degradados y navaja',
    email: 'matias.demo@wstyle.local',
    phone: '+56911112222',
    homeService: { enabled: true, surchargeCLP: 3000, radiusKm: 8, travelBufferMin: 30 },
    rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '10:00', end: '19:00' })).concat([{ weekday: 6, start: '10:00', end: '16:00' }]),
  },
  {
    displayName: 'Diego Fuentes',
    specialty: 'Barba y perfilado',
    email: 'diego.demo@wstyle.local',
    phone: '+56933334444',
    homeService: { enabled: false, surchargeCLP: 0, radiusKm: 0, travelBufferMin: 30 },
    rules: [2, 3, 4, 5].map((weekday) => ({ weekday, start: '12:00', end: '20:00' })).concat([{ weekday: 6, start: '10:00', end: '18:00' }]),
  },
];

export async function seedBusiness({ site, services, pros = DEMO_PROS, slug = 'ws-style', location = [-70.6506, -33.4378] }) {
  const business = await Business.findOneAndUpdate(
    { slug },
    {
      slug,
      name: site.name || 'WS Style',
      timezone: 'America/Santiago',
      currency: 'CLP',
      address: site.contact?.address || {},
      location: { type: 'Point', coordinates: location },
      hours: hoursFromSite(site),
      contact: { whatsapp: site.contact?.whatsapp || '', phone: site.contact?.phone || '' },
      policies: (site.policies || []).map((p) => ({ title: p.title, text: p.text })),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const svcDocs = [];
  for (const [i, s] of services.entries()) {
    svcDocs.push(
      await Service.findOneAndUpdate(
        { businessId: business._id, slug: s.id },
        { businessId: business._id, slug: s.id, name: s.name, description: s.description, priceCLP: Number(s.priceCLP), durationMin: Number(s.durationMin), active: true, order: i, homeServiceAllowed: s.homeServiceAllowed !== false },
        { upsert: true, new: true }
      )
    );
  }
  const proDocs = [];
  for (const [i, p] of pros.entries()) {
    let user = await User.findOne({ email: p.email });
    if (!user) user = await User.create({ email: p.email, emailVerified: true, name: p.displayName, phoneE164: p.phone, roles: ['barber'], identities: [] });
    const pro = await Professional.findOneAndUpdate(
      { userId: user._id },
      { userId: user._id, displayName: p.displayName, specialty: p.specialty, phone: p.phone, email: p.email, homeService: p.homeService, status: 'active', bio: p.bio || 'Barbero de demostración', photos: p.photos || [] },
      { upsert: true, new: true }
    );
    await Membership.findOneAndUpdate({ businessId: business._id, professionalId: pro._id }, { status: p.membershipStatus || 'approved', order: i }, { upsert: true });
    await AvailabilityRule.deleteMany({ businessId: business._id, professionalId: pro._id });
    if (p.rules?.length) await AvailabilityRule.insertMany(p.rules.map((r) => ({ ...r, businessId: business._id, professionalId: pro._id })));
    for (const s of svcDocs) {
      if (p.services && !p.services.includes(s.slug)) continue;
      await ProfessionalService.updateOne({ businessId: business._id, professionalId: pro._id, serviceId: s._id }, {}, { upsert: true });
    }
    proDocs.push(pro);
  }
  await PlatformSettings.updateOne({ key: 'default' }, { $setOnInsert: { defaultPlatformFeeRate: 0 } }, { upsert: true });
  return { business, services: svcDocs, pros: proDocs };
}

export function readContent(dir = resolve(import.meta.dirname, '../../client/public/wstyle/content')) {
  return {
    site: JSON.parse(readFileSync(resolve(dir, 'site.json'), 'utf8')),
    services: JSON.parse(readFileSync(resolve(dir, 'services.json'), 'utf8')),
  };
}

/* CLI */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  for (const m of [Business, Service, Professional, Membership, ProfessionalService, AvailabilityRule, User]) await m.syncIndexes();
  const { business, services, pros } = await seedBusiness(readContent());
  console.log(`[seed] ${business.name}: ${services.length} servicios, ${pros.length} barberos de demostración`);
  await mongoose.disconnect();
}
