/* Reseñas de demostración (SPEC-52), SOLO para desarrollo local y la verificación en el navegador:
   - 8 reseñas visibles de 8 clientes demo, cada una sobre su propia cita `terminada`;
   - la clienta "Camila Soto" (camila.demo@wstyle.local / reseña2026) con UNA cita terminada sin reseña, para probar
     "Mis citas → Dejar reseña" y el formulario.

   Uso: `npm run seed` → `npm run seed:reviews-demo`. Idempotente: re-ejecutarlo rehace lo marcado como demo
   (idempotencyKey "demo-review-*"). `npm run seed:reviews-demo -- --limpiar` lo borra (landing sin reseñas). */
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { Appointment, Business, Membership, Professional, Review, Service, User } from './models/index.js';
import { hashPassword } from './lib/session.js';
import { displayName } from './lib/reviewText.js';

const DAY = 24 * 60 * 60 * 1000;
const TAG = 'demo-review';
export const DEMO_REVIEWER = { email: 'camila.demo@wstyle.local', password: 'reseña2026', name: 'Camila Soto Pérez' };

const DEMO = [
  ['Pedro Rico Díaz', 5, 'Excelente degradado, muy buena atención. Llegué sin hora y me hicieron un espacio.'],
  ['María José Pérez', 5, 'Le corté el pelo a mi hijo y quedó feliz. Muy pacientes con los niños.'],
  ['Jorge Fuentes', 4, 'Buen corte y la barba quedó pareja. La música un poco fuerte, pero el ambiente es muy bueno.'],
  ['Matías Lagos', 5, 'El perfilado de barba es de otro nivel. Volveré.'],
  ['Diego Muñoz', 4, 'Puntuales y ordenados. El lavado con masaje vale la pena.'],
  ['Felipe Araya', 5, 'Me explicaron qué corte me quedaba mejor según mi tipo de pelo. Muy profesionales.'],
  ['Tomás Reyes', 3, 'El corte bien, pero tuve que esperar 15 minutos más de lo acordado.'],
  ['Ignacio Vera', 5, 'Mejor barbería del barrio, sin duda. Buena conversación y mejor terminación.'],
];

async function demoUser(email, name, password = null) {
  const set = { email, name, roles: ['client'], emailVerified: true, status: 'active' };
  const user = await User.findOneAndUpdate({ email }, { $set: set }, { upsert: true, new: true });
  if (password && !user.identities.some((i) => i.provider === 'email')) {
    user.identities.push({ provider: 'email', providerUserId: email, passwordHash: await hashPassword(password) });
    await user.save();
  }
  return user;
}

export async function clearReviewsDemo() {
  const appts = await Appointment.find({ idempotencyKey: { $regex: `^${TAG}-` } }, { _id: 1 }).lean();
  await Review.deleteMany({ appointmentId: { $in: appts.map((a) => a._id) } });
  await Appointment.deleteMany({ _id: { $in: appts.map((a) => a._id) } });
  return appts.length;
}

export async function seedReviewsDemo({ now = Date.now() } = {}) {
  const b = await Business.findOne({ slug: 'ws-style' }).lean();
  if (!b) throw new Error('Primero corre `npm run seed`');
  const m = await Membership.findOne({ businessId: b._id, status: 'approved' }).lean();
  const pro = m && (await Professional.findById(m.professionalId).lean());
  if (!pro) throw new Error('No hay barberos aprobados: corre `npm run seed`');
  const services = await Service.find({ businessId: b._id, active: true }).sort({ order: 1 }).lean();
  if (!services.length) throw new Error('No hay servicios en la carta: corre `npm run seed`');
  await clearReviewsDemo();

  const appt = (user, i, ago) => {
    const s = services[i % services.length];
    const end = new Date(now - ago);
    return Appointment.create({
      businessId: b._id,
      professionalId: pro._id,
      customerUserId: user._id,
      customerSnapshot: { name: user.name, email: user.email },
      serviceSnapshot: { serviceId: s._id, slug: s.slug, name: s.name, priceCLP: s.priceCLP, durationMin: s.durationMin },
      professionalSnapshot: { displayName: pro.displayName, phone: pro.phone },
      startsAt: new Date(end.getTime() - s.durationMin * 60 * 1000),
      endsAt: end,
      pricing: { priceCLP: s.priceCLP, totalCLP: s.priceCLP },
      payment: { method: 'local', status: 'cobrado' },
      status: 'terminada',
      history: [{ at: end, from: 'en_curso', to: 'terminada', by: 'barber' }],
      idempotencyKey: `${TAG}-${user.email}-${i}`,
      source: 'web',
    });
  };

  for (const [i, [name, rating, comment]] of DEMO.entries()) {
    const user = await demoUser(`resena${i + 1}.demo@wstyle.local`, name);
    const a = await appt(user, i, (i + 2) * DAY);
    await Review.create({
      businessId: b._id, appointmentId: a._id, userId: user._id, rating, comment,
      authorName: displayName(name), serviceName: a.serviceSnapshot.name, professionalName: pro.displayName,
      status: 'visible', createdAt: new Date(now - (i + 1) * DAY),
    });
  }
  const reviewer = await demoUser(DEMO_REVIEWER.email, DEMO_REVIEWER.name, DEMO_REVIEWER.password);
  const open = await appt(reviewer, 1, 2 * 60 * 60 * 1000);
  return { reviews: DEMO.length, reviewer: DEMO_REVIEWER.email, openAppointment: String(open._id) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  if (process.argv.includes('--limpiar')) {
    console.log(`[seed:reviews-demo] borradas ${await clearReviewsDemo()} citas demo y sus reseñas`);
  } else {
    const out = await seedReviewsDemo();
    console.log(`[seed:reviews-demo] ${out.reviews} reseñas visibles · entra con ${out.reviewer} / ${DEMO_REVIEWER.password} y reseña la cita ${out.openAppointment}`);
    console.log(`[seed:reviews-demo] formulario: http://localhost:5173/wstyle/cuenta/resena/?cita=${out.openAppointment}`);
  }
  await mongoose.disconnect();
}
