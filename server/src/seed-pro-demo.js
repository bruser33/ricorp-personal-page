/* Datos de demostración del panel del barbero (SPEC-33 AC-11), SOLO para desarrollo.
   Deja al primer barbero de demostración (Matías Rojas) con contraseña para entrar a
   /wstyle/pro/ y le crea citas de hoy (y de los próximos días) en distintos estados.

   Uso: `npm run seed` y después `npm run seed:pro-demo` (BD de MONGO_URI).
   Entrar con matias.demo@wstyle.local / demo12345. Re-ejecutarlo rehace las citas demo. */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { Appointment, Business, Membership, Professional, ProfessionalService, Service, SlotLock, User } from './models/index.js';
import { hashPassword } from './lib/session.js';
import { slotsFor } from './domain/availability.js';
import { addDays, wallClock, zonedToUtc } from './domain/time.js';

const MIN = 60 * 1000;
const DEMO_TAG = 'demo-pro';

export async function seedProDemo({ now = Date.now(), email = 'matias.demo@wstyle.local', password = 'demo12345' } = {}) {
  const b = await Business.findOne({ slug: 'ws-style' }).lean();
  if (!b) throw new Error('Primero corre `npm run seed`');
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No existe ${email}: corre \`npm run seed\``);
  const passwordHash = await hashPassword(password);
  const identity = user.identities.find((i) => i.provider === 'email');
  if (identity) identity.passwordHash = passwordHash;
  else user.identities.push({ provider: 'email', providerUserId: email, passwordHash });
  if (!user.roles.includes('barber')) user.roles.push('barber');
  user.emailVerified = true;
  await user.save();
  const pro = await Professional.findOne({ userId: user._id });
  pro.termsAcceptedAt = pro.termsAcceptedAt || new Date(now);
  await pro.save();
  await Membership.updateOne({ businessId: b._id, professionalId: pro._id }, { status: 'approved', submittedAt: new Date(now) });

  /* Clientes demo. */
  const clients = [];
  for (const [name, phone, mail] of [
    ['Carla Díaz', '+56987654321', 'carla.demo@clientes.local'],
    ['Bruno Pérez', '+56976543210', 'bruno.demo@clientes.local'],
    ['Elena Muñoz', '+56965432109', 'elena.demo@clientes.local'],
    ['Tomás Vera', '+56954321098', 'tomas.demo@clientes.local'],
  ]) {
    clients.push(await User.findOneAndUpdate({ email: mail }, { $setOnInsert: { email: mail, name, phoneE164: phone, roles: ['client'], emailVerified: true } }, { upsert: true, new: true }));
  }

  const old = await Appointment.find({ professionalId: pro._id, idempotencyKey: { $regex: `^${DEMO_TAG}-` } }, { _id: 1 }).lean();
  await SlotLock.deleteMany({ appointmentId: { $in: old.map((a) => a._id) } });
  await Appointment.deleteMany({ _id: { $in: old.map((a) => a._id) } });

  const services = Object.fromEntries((await Service.find({ businessId: b._id }).lean()).map((s) => [s.slug, s]));
  for (const s of Object.values(services)) await ProfessionalService.updateOne({ businessId: b._id, professionalId: pro._id, serviceId: s._id }, {}, { upsert: true });
  const shopPoint = b.location?.coordinates || [-70.6506, -33.4378];
  const round15 = (ms) => Math.floor(ms / (15 * MIN)) * 15 * MIN;
  const today = wallClock(now, b.timezone).date;
  const at = (date, time) => zonedToUtc(date, time, b.timezone);
  const next = (n) => addDays(today, n);

  const plan = [
    { start: round15(now - 120 * MIN), svc: 'corte', c: 0, status: 'terminada', note: 'Degradado bajo' },
    { start: round15(now) + 15 * MIN, svc: 'corte-barba', c: 1, status: 'confirmada', home: { street: 'Av. Irarrázaval 2401', commune: 'Ñuñoa', km: 4.6 } },
    { start: round15(now + 75 * MIN), svc: 'corte', c: 2, status: 'pendiente', note: 'Primera vez' },
    { start: round15(now + 150 * MIN), svc: 'barba', c: 3, status: 'invitacion_enviada', invite: true },
    { start: round15(now) + 240 * MIN, svc: 'corte', c: 0, status: 'confirmada', home: { street: 'Av. Italia 1450', commune: 'Providencia', km: 3.2 } },
    { start: at(next(1), '11:00'), svc: 'corte', c: 0, status: 'confirmada' },
    { start: at(next(1), '15:00'), svc: 'corte-barba', c: 2, status: 'pendiente' },
    { start: at(next(2), '12:30'), svc: 'limpieza-facial', c: 1, status: 'confirmada', home: { street: 'Los Leones 1180', commune: 'Providencia', km: 5.9, noCoords: true } },
  ];
  let n = 0;
  for (const p of plan) {
    const s = services[p.svc] || Object.values(services)[0];
    const c = clients[p.c];
    const buffer = p.home ? pro.homeService?.travelBufferMin ?? 30 : 0;
    const surcharge = p.home ? pro.homeService?.surchargeCLP ?? 0 : 0;
    const _id = new mongoose.Types.ObjectId();
    const location = p.home
      ? {
          kind: 'home',
          address: { street: p.home.street, commune: p.home.commune, formatted: `${p.home.street}, ${p.home.commune}` },
          ...(p.home.noCoords ? {} : { point: { type: 'Point', coordinates: [shopPoint[0] + p.home.km / 92.83, shopPoint[1]] } }),
          distanceKm: p.home.km,
          travelBufferMin: buffer,
        }
      : { kind: 'shop', travelBufferMin: 0 };
    await Appointment.create({
      _id,
      businessId: b._id,
      professionalId: pro._id,
      customerUserId: p.invite ? null : c._id,
      customerSnapshot: { name: c.name, phoneE164: c.phoneE164, email: p.invite ? undefined : c.email },
      serviceSnapshot: { serviceId: s._id, slug: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin },
      professionalSnapshot: { displayName: pro.displayName, phone: pro.phone },
      startsAt: new Date(p.start),
      endsAt: new Date(p.start + s.durationMin * MIN),
      location,
      pricing: { priceCLP: s.priceCLP, surchargeCLP: surcharge, totalCLP: s.priceCLP + surcharge, platformFeeRate: 0, platformFeeCLP: 0 },
      payment: { method: 'local', status: p.status === 'terminada' ? 'cobrado' : 'pendiente' },
      note: p.note || undefined,
      idempotencyKey: `${DEMO_TAG}-${n}`,
      status: p.status,
      expiresAt: p.status === 'pendiente' || p.invite ? new Date(Math.max(now + 60 * MIN, p.start - 30 * MIN)) : undefined,
      invite: p.invite ? { token: crypto.randomBytes(18).toString('base64url'), sentAt: new Date(now) } : undefined,
      history: [{ at: new Date(now), from: null, to: p.status, by: p.invite ? 'barber' : 'client' }],
      source: p.invite ? 'pro_invite' : 'web',
    });
    if (!['terminada', 'cancelada', 'expirada', 'no_asistio'].includes(p.status)) {
      await SlotLock.insertMany(slotsFor(p.start, s.durationMin, buffer).map((t) => ({ businessId: b._id, professionalId: pro._id, slotStart: new Date(t), appointmentId: _id, kind: 'main' }))).catch(() => {});
    }
    n++;
  }
  return { email, password, appointments: n };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  const out = await seedProDemo();
  console.log(`[seed:pro-demo] ${out.appointments} citas demo · entra con ${out.email} / ${out.password}`);
  await mongoose.disconnect();
}
