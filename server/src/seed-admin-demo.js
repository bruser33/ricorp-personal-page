/* Datos de demostración del panel del super admin (SPEC-34 AC-11), SOLO para desarrollo:
   - un barbero PENDIENTE de aprobación (Tomás Vidal) con fotos vacías, servicios y horario,
     ya enviado a revisión;
   - citas terminadas/canceladas de días pasados del mes en curso para las estadísticas;
   - SPEC-37: sus pagos con respaldo para Pagos y Rendición: Mercado Pago (voucher, con
     comisión), cobros en el local (efectivo / transferencia / tarjeta, algunos con N° de
     boleta y otros sin respaldo), un reembolso y alguna terminada sin cobrar.

   Uso: `npm run seed` → `npm run seed:admin` (con SUPERADMIN_* en .env) → `npm run seed:admin-demo`.
   Re-ejecutarlo rehace las citas demo (marcadas con idempotencyKey "demo-admin-*"). */
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { Appointment, AvailabilityRule, Business, Membership, Professional, ProfessionalService, Service, User } from './models/index.js';
import { addDays, wallClock, zonedToUtc } from './domain/time.js';

const MIN = 60 * 1000;
const TAG = 'demo-admin';

/* SPEC-37: pago de la cita demo. Comisión MP aproximada (3,19 % + IVA) solo para mostrar el panel. */
function demoPayment({ status, roll, n, total, startsAt }) {
  const at = new Date(startsAt.getTime() + 45 * MIN);
  const mp = (extra = {}) => {
    const id = String(90000000000 + n);
    const fee = Math.round(total * 0.0319 * 1.19);
    return { method: 'online', status: 'pagado', mpPaymentId: id, mpStatus: 'approved', paidAt: new Date(startsAt.getTime() - 26 * 60 * MIN), mpFeeCLP: fee, mpNetCLP: total - fee, mpPaymentType: 'credit_card', taxModel: 'voucher', taxDoc: { kind: 'voucher_mp', number: id, provider: 'voucher', at: new Date(startsAt.getTime() - 26 * 60 * MIN) }, ...extra };
  };
  if (status === 'cancelada') return n % 2 ? mp({ status: 'reembolsado', mpStatus: 'refunded', refundedAt: new Date(startsAt.getTime() - 2 * 60 * MIN) }) : { method: 'local', status: 'pendiente' };
  if (status !== 'terminada') return { method: 'local', status: 'pendiente' };
  if (roll === 3) return { method: 'local', status: 'pago_pendiente' };
  if (roll === 4 || roll === 5 || roll === 8) return mp();
  const localMethod = ['efectivo', 'transferencia', 'tarjeta'][n % 3];
  const boleta = roll === 6 || roll === 9 ? { taxDoc: { kind: 'boleta_sii', number: String(1000 + n), provider: 'voucher', at } } : {};
  return { method: 'local', status: 'cobrado', collectedAt: at, localMethod, taxModel: 'voucher', ...boleta };
}

export async function seedAdminDemo({ now = Date.now() } = {}) {
  const b = await Business.findOne({ slug: 'ws-style' }).lean();
  if (!b) throw new Error('Primero corre `npm run seed`');
  const services = await Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean();

  /* Barbero pendiente, con el perfil completo y enviado a revisión. */
  const email = 'tomas.vidal.demo@wstyle.local';
  const user = await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, name: 'Tomás Vidal', phoneE164: '+56955556666', roles: ['barber'], emailVerified: true } },
    { upsert: true, new: true }
  );
  const pro = await Professional.findOneAndUpdate(
    { userId: user._id },
    { userId: user._id, displayName: 'Tomás Vidal', phone: '+56955556666', email, bio: 'Barbero de demostración: clásicos y fade.', termsAcceptedAt: new Date(now), homeService: { enabled: false, surchargeCLP: 0, radiusKm: 0, travelBufferMin: 30 } },
    { upsert: true, new: true }
  );
  await Membership.updateOne({ businessId: b._id, professionalId: pro._id }, { status: 'pending', submittedAt: new Date(now), $unset: { reason: 1 } }, { upsert: true });
  await AvailabilityRule.deleteMany({ businessId: b._id, professionalId: pro._id });
  await AvailabilityRule.insertMany([1, 2, 3, 4, 5].map((weekday) => ({ businessId: b._id, professionalId: pro._id, weekday, start: '11:00', end: '19:00' })));
  for (const s of services.slice(0, 3)) await ProfessionalService.updateOne({ businessId: b._id, professionalId: pro._id, serviceId: s._id }, {}, { upsert: true });

  /* Citas pasadas del mes en curso para las estadísticas. */
  await Appointment.deleteMany({ idempotencyKey: { $regex: `^${TAG}-` } });
  const pros = await Professional.find({ _id: { $in: (await Membership.find({ businessId: b._id, status: 'approved' }).lean()).map((m) => m.professionalId) } }).lean();
  const today = wallClock(now, b.timezone).date;
  const first = `${today.slice(0, 7)}-01`;
  const names = [['Carla Díaz', '+56987654321'], ['Bruno Pérez', '+56976543210'], ['Elena Muñoz', '+56965432109'], ['Tomás Vera', '+56954321098'], ['Ignacio Rojas', '+56943210987']];
  let n = 0;
  for (let date = first, i = 0; date < today; date = addDays(date, 1), i++) {
    for (const [j, p] of pros.entries()) {
      for (const time of ['11:00', '13:00', '16:30'].slice(0, 1 + ((i + j) % 3))) {
        const s = services[(i + j + n) % services.length];
        const startsAt = new Date(zonedToUtc(date, time, b.timezone));
        const roll = (i * 7 + j * 3 + n) % 10;
        const status = roll === 0 ? 'cancelada' : roll === 1 ? 'no_asistio' : 'terminada';
        const c = names[(i + n) % names.length];
        await Appointment.create({
          businessId: b._id,
          professionalId: p._id,
          customerSnapshot: { name: c[0], phoneE164: c[1] },
          serviceSnapshot: { serviceId: s._id, slug: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin },
          professionalSnapshot: { displayName: p.displayName, phone: p.phone },
          startsAt,
          endsAt: new Date(startsAt.getTime() + s.durationMin * MIN),
          location: { kind: roll === 2 && p.homeService?.enabled ? 'home' : 'shop', travelBufferMin: 0 },
          pricing: { priceCLP: s.priceCLP, surchargeCLP: 0, totalCLP: s.priceCLP, platformFeeRate: 0, platformFeeCLP: 0 },
          payment: demoPayment({ status, roll, n, total: s.priceCLP, startsAt }),
          status,
          idempotencyKey: `${TAG}-${n}`,
          history: [{ at: startsAt, from: null, to: status, by: 'system', reason: 'Demo' }],
          source: 'web',
        });
        n++;
      }
    }
  }
  return { pending: pro.displayName, appointments: n };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  const out = await seedAdminDemo();
  console.log(`[seed:admin-demo] barbero pendiente: ${out.pending} · ${out.appointments} citas pasadas del mes para estadísticas`);
  await mongoose.disconnect();
}
