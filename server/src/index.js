/* dotenv primero: app.js lee process.env al evaluarse, y los imports ESM se
   evalúan en orden. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
import { ensureSuperAdmin } from './seed-admin.js';
import { ensurePlatformDefaults } from './domain/pricing.js';

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`api on :${PORT}`));
    /* SPEC-34 RN-01: primer super admin desde SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD. */
    ensureSuperAdmin().catch((err) => console.error('[admin] seed del super admin falló:', err.message));
    /* SPEC-38 RN-09: administración 10 % y costo de pagos 3,19 % + IVA por defecto (idempotente: una
       sola vez por BD; después manda lo que configure el admin). */
    ensurePlatformDefaults()
      .then((r) => (r.created || r.migrated) && console.log('[pricing] defaults de SPEC-38 aplicados'))
      .catch((err) => console.error('[pricing] defaults:', err.message));
    /* RN-11/RN-12: expira citas sin confirmar y propuestas sin respuesta. Una sola
       instancia en Render free: un intervalo en proceso basta. */
    const quiet = (label) => (err) => {
      if (err?.code !== 'agenda_unavailable') console.error(label, err.message);
    };
    setInterval(() => {
      app.locals.agenda.runExpirations().catch(quiet('[agenda] expiraciones:'));
      /* SPEC-35 RN-03: citas que esperaban el pago y se les acabó la retención. */
      app.locals.payments.runHolds().catch(quiet('[mp] retención:'));
    }, 60_000).unref();
    /* SPEC-35: conciliación con Mercado Pago al arrancar (Render free "despierta" sin los
       webhooks que llegaron mientras dormía) y cada 5 min mientras esté despierto. */
    const reconcile = () => app.locals.payments.reconcile().catch(quiet('[mp] conciliación:'));
    setTimeout(reconcile, 5_000).unref();
    setInterval(reconcile, 5 * 60_000).unref();
  })
  .catch((err) => {
    console.error('mongo connect failed, starting api without db:', err.message);
    app.listen(PORT, () => console.log(`api on :${PORT} (no db)`));
  });
