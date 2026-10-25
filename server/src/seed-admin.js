/* Primer super admin (SPEC-34 RN-01). Lo llama index.js al arrancar y `npm run seed:admin`.

   - Si ya existe un super admin activo: no hace nada (no crea otro ni pisa su contraseña,
     aunque cambie SUPERADMIN_EMAIL — CB-02).
   - Si faltan SUPERADMIN_EMAIL o SUPERADMIN_PASSWORD: no crea nada y avisa en el log (CB-01).
   - Si no: crea la cuenta con la contraseña hasheada (o agrega el rol a la cuenta que ya
     usa ese correo, sin tocar una contraseña existente).
   Nunca hay endpoint público para volverse super admin. */
import { pathToFileURL } from 'node:url';
import { User } from './models/index.js';
import { hashPassword } from './lib/session.js';
import { isEmail, normEmail, passwordProblem } from './lib/validate.js';

export async function ensureSuperAdmin({ env = process.env, logger = console } = {}) {
  const existing = await User.findOne({ roles: 'superadmin', status: 'active' }, { email: 1 }).lean();
  if (existing) return { created: false, reason: 'exists', email: existing.email };
  /* SUPERADMIN_EMAIL admite varios separados por coma (avisos de SPEC-33): la cuenta es el primero. */
  const email = normEmail(String(env.SUPERADMIN_EMAIL || '').split(',')[0]);
  const password = String(env.SUPERADMIN_PASSWORD || '');
  if (!email || !password) {
    logger.warn('[admin] sin SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD en server/.env: no hay super admin y /wstyle/admin/ muestra "Panel no configurado"');
    return { created: false, reason: 'unconfigured' };
  }
  if (!isEmail(email)) {
    logger.warn('[admin] SUPERADMIN_EMAIL no es un correo válido: no se crea el super admin');
    return { created: false, reason: 'invalid_email' };
  }
  if (passwordProblem(password, email)) {
    logger.warn('[admin] SUPERADMIN_PASSWORD es débil (mínimo 8 caracteres, con letras y números): no se crea el super admin');
    return { created: false, reason: 'weak_password' };
  }
  const user = await User.findOne({ email, status: 'active' });
  if (user) {
    if (!user.roles.includes('superadmin')) user.roles.push('superadmin');
    const identity = user.identities.find((i) => i.provider === 'email');
    if (!identity) user.identities.push({ provider: 'email', providerUserId: email, passwordHash: await hashPassword(password) });
    else if (!identity.passwordHash) identity.passwordHash = await hashPassword(password);
    user.emailVerified = true;
    await user.save();
    logger.log(`[admin] ${email} ahora es super admin (cuenta existente)`);
    return { created: true, email, reused: true };
  }
  await User.create({
    email,
    emailVerified: true,
    name: 'Administrador WS Style',
    roles: ['superadmin'],
    identities: [{ provider: 'email', providerUserId: email, passwordHash: await hashPassword(password) }],
  });
  logger.log(`[admin] super admin creado: ${email} (se recomienda cambiar la contraseña en el primer ingreso)`);
  return { created: true, email };
}

/* CLI: npm run seed:admin */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await import('dotenv/config');
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal');
  await User.syncIndexes();
  const out = await ensureSuperAdmin();
  console.log('[seed:admin]', out.created ? `listo: ${out.email}` : out.reason === 'exists' ? `ya existe un super admin (${out.email}); no se cambia nada` : `sin crear (${out.reason})`);
  await mongoose.disconnect();
}
