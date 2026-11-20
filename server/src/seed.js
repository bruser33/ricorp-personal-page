/* Seed de la agenda (SPEC-32) e importación de la carta (SPEC-34 RN-06).

   Desde SPEC-34 la carta y el horario viven en la BD (los edita el super admin): el seed
   los importa de client/public/wstyle/content/{services,site}.json SOLO la primera vez
   (idempotente por `id`: un servicio que ya existe no se toca, y el horario solo se
   escribe si el negocio es nuevo). Nombre, contacto y políticas siguen saliendo de
   site.json en cada corrida (el panel no edita textos de la landing).

   Uso: `npm run seed` (negocio + carta + barberos de demostración) o
   `npm run seed:catalog` (solo negocio y carta). BD de MONGO_URI. */
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
  ServiceCategory,
  DEFAULT_CATEGORY,
  User,
} from './models/index.js';
import { DEFAULTS_MIGRATION, ensurePlatformDefaults } from './domain/pricing.js';

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

/* Filas de site.json → entradas de Business.hours (un día puede tener varias filas = varios rangos). */
export function hoursFromSite(site) {
  const byDay = new Map();
  for (const h of site.hours || []) {
    for (const d of expandDayCodes(h.dayCodes)) {
      if (!byDay.has(d)) byDay.set(d, []);
      if (h.opens && h.closes) byDay.get(d).push({ weekday: d, opens: h.opens, closes: h.closes });
    }
  }
  return [1, 2, 3, 4, 5, 6, 7].flatMap((d) => (byDay.get(d)?.length ? byDay.get(d) : [{ weekday: d, opens: null, closes: null }]));
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

/* SPEC-51: services.json es { categories, services }. Se acepta también el formato antiguo (un array de servicios,
   sin categorías: todo cae en "Barbería"). */
export function normalizeCatalogJson(raw) {
  if (Array.isArray(raw)) return { categories: [], services: raw };
  return { categories: Array.isArray(raw?.categories) ? raw.categories : [], services: Array.isArray(raw?.services) ? raw.services : [] };
}

/* SPEC-51 RN-04: categorías por slug. Si existen no se tocan (nombre/nota/orden los edita el super admin). "Barbería"
   siempre existe: es la categoría de los servicios sin categoría (RN-01). */
async function importCategories(business, categories = []) {
  const list = categories.filter((c) => c?.id && c?.name);
  if (!list.some((c) => c.id === DEFAULT_CATEGORY.slug)) list.unshift({ id: DEFAULT_CATEGORY.slug, name: DEFAULT_CATEGORY.name, note: '' });
  const bySlug = new Map();
  for (const [i, c] of list.entries()) {
    const doc = await ServiceCategory.findOneAndUpdate(
      { businessId: business._id, slug: c.id },
      { $setOnInsert: { businessId: business._id, slug: c.id, name: c.name, note: c.note || '', order: i } },
      { upsert: true, new: true }
    );
    bySlug.set(c.id, doc);
  }
  return bySlug;
}

/* SPEC-34 RN-06 + SPEC-51 RN-04: negocio + categorías + carta + horario desde los JSON. Idempotente por `id`/slug:
   lo que ya existe no se toca (precio, duración, nombre, activo/archivado editados en el panel se respetan). */
export async function importCatalog({ site, services, categories = [], slug = 'ws-style', location = [-70.6506, -33.4378], fees = null }) {
  const business = await Business.findOneAndUpdate(
    { slug },
    {
      $set: {
        slug,
        name: site.name || 'WS Style',
        address: site.contact?.address || {},
        contact: { whatsapp: site.contact?.whatsapp || '', phone: site.contact?.phone || '' },
        policies: (site.policies || []).map((p) => ({ title: p.title, text: p.text })),
      },
      $setOnInsert: { timezone: 'America/Santiago', currency: 'CLP', location: { type: 'Point', coordinates: location }, hours: hoursFromSite(site) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const carta = await importCarta(business, { services, categories });
  /* SPEC-38 RN-09: administración 10 % y Mercado Pago 3,19 % + IVA por defecto (idempotente). `fees`
     fija valores exactos (lo usan los tests heredados, que siembran 0 % para aislar sus montos). */
  if (fees) {
    await PlatformSettings.updateOne(
      { key: 'default' },
      { $set: { defaultPlatformFeeRate: fees.platformFeeRate ?? 0, paymentFeeRate: fees.paymentFeeRate ?? 0, paymentFeeVat: fees.paymentFeeVat ?? true, appliedDefaults: [DEFAULTS_MIGRATION] } },
      { upsert: true }
    );
  } else await ensurePlatformDefaults();
  return { business, ...carta };
}

/* SPEC-51: categorías + servicios de la carta (sin tocar los datos del negocio). Idempotente por slug. */
export async function importCarta(business, { services = [], categories = [] } = {}) {
  const cats = await importCategories(business, categories);
  const fallbackCat = cats.get(DEFAULT_CATEGORY.slug);
  const svcDocs = [];
  const inserted = [];
  let created = 0;
  for (const [i, s] of services.entries()) {
    if (!s?.id) continue;
    const before = await Service.exists({ businessId: business._id, slug: s.id });
    const doc = await Service.findOneAndUpdate(
      { businessId: business._id, slug: s.id },
      {
        $setOnInsert: {
          businessId: business._id,
          slug: s.id,
          name: s.name,
          description: s.description,
          priceCLP: Number(s.priceCLP),
          durationMin: Number(s.durationMin),
          active: true,
          order: i,
          homeServiceAllowed: s.homeServiceAllowed !== false,
          categoryId: (cats.get(s.category) ?? fallbackCat)._id,
        },
      },
      { upsert: true, new: true }
    );
    if (!before) {
      created++;
      inserted.push(doc);
    }
    svcDocs.push(doc);
  }
  /* RN-04: solo los servicios sin categoría (datos anteriores a SPEC-51) pasan a "Barbería". */
  await Service.updateMany({ businessId: business._id, categoryId: null }, { $set: { categoryId: fallbackCat._id } });
  /* Asunción 3: los servicios creados en ESTA corrida se enlazan a los barberos aprobados (upsert, sin duplicados).
     Los que ya existían no se re-enlazan: así no se deshace un "desmarcar" del barbero (CB-09). */
  if (inserted.length) {
    const approved = await Membership.find({ businessId: business._id, status: 'approved' }, { professionalId: 1 }).lean();
    for (const m of approved) {
      for (const s of inserted) await ProfessionalService.updateOne({ businessId: business._id, professionalId: m.professionalId, serviceId: s._id }, {}, { upsert: true });
    }
  }
  return { services: svcDocs, categories: [...cats.values()], created };
}

/* SPEC-51: la carta nueva se carga UNA vez al arrancar el server (Render no corre `npm run seed:catalog`). Queda
   marcada en PlatformSettings.appliedDefaults: correrla de nuevo no hace nada, así no revive un servicio o una
   categoría que Joe borre después. Solo si el negocio ya existe; no toca nombre, contacto ni horario. */
export const CARTA_MIGRATION = 'spec51-carta';
export async function ensureCartaMigration({ slug = 'ws-style', content } = {}) {
  const business = await Business.findOne({ slug });
  if (!business) return { applied: false, reason: 'no_business' };
  if (await PlatformSettings.exists({ key: 'default', appliedDefaults: CARTA_MIGRATION })) return { applied: false, reason: 'done' };
  const { services, categories } = content ?? readContent();
  const r = await importCarta(business, { services, categories });
  await PlatformSettings.updateOne({ key: 'default' }, { $addToSet: { appliedDefaults: CARTA_MIGRATION } }, { upsert: true });
  return { applied: true, created: r.created, services: r.services.length, categories: r.categories.length };
}

export async function seedBusiness({ site, services, categories = [], pros = DEMO_PROS, slug = 'ws-style', location = [-70.6506, -33.4378], fees = null }) {
  const { business, services: svcDocs } = await importCatalog({ site, services, categories, slug, location, fees });
  const proDocs = [];
  for (const [i, p] of pros.entries()) {
    let user = await User.findOne({ email: p.email });
    if (!user) user = await User.create({ email: p.email, emailVerified: true, name: p.displayName, phoneE164: p.phone, roles: ['barber'], identities: [] });
    const pro = await Professional.findOneAndUpdate(
      { userId: user._id },
      { userId: user._id, displayName: p.displayName, specialty: p.specialty, phone: p.phone, email: p.email, homeService: p.homeService, status: 'active', bio: p.bio || 'Barbero de demostración', photos: p.photos || [] },
      { upsert: true, new: true }
    );
    /* $setOnInsert: re-correr el seed no re-aprueba a un barbero que el admin suspendió. */
    await Membership.updateOne({ businessId: business._id, professionalId: pro._id }, { $setOnInsert: { status: p.membershipStatus || 'approved', order: i } }, { upsert: true });
    await AvailabilityRule.deleteMany({ businessId: business._id, professionalId: pro._id });
    if (p.rules?.length) await AvailabilityRule.insertMany(p.rules.map((r) => ({ ...r, businessId: business._id, professionalId: pro._id })));
    for (const s of svcDocs) {
      if (p.services && !p.services.includes(s.slug)) continue;
      await ProfessionalService.updateOne({ businessId: business._id, professionalId: pro._id, serviceId: s._id }, {}, { upsert: true });
    }
    proDocs.push(pro);
  }
  return { business, services: svcDocs, pros: proDocs };
}

export function readContent(dir = resolve(import.meta.dirname, '../../client/public/wstyle/content')) {
  return {
    site: JSON.parse(readFileSync(resolve(dir, 'site.json'), 'utf8')),
    ...normalizeCatalogJson(JSON.parse(readFileSync(resolve(dir, 'services.json'), 'utf8'))),
  };
}

/* CLI */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  for (const m of [Business, ServiceCategory, Service, Professional, Membership, ProfessionalService, AvailabilityRule, User]) await m.syncIndexes();
  if (process.argv.includes('--catalog')) {
    const { business, services, categories, created } = await importCatalog(readContent());
    console.log(`[seed] ${business.name}: carta con ${categories.length} categorías y ${services.length} servicios (${created} nuevos; los existentes no se tocan)`);
  } else {
    const { business, services, pros } = await seedBusiness(readContent());
    console.log(`[seed] ${business.name}: ${services.length} servicios, ${pros.length} barberos de demostración`);
  }
  await mongoose.disconnect();
}
