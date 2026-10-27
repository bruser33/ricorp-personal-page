/* Avisos al super admin (SPEC-34 RN-10): correo + bandeja del panel. Los usan la agenda
   (cita cancelada por el barbero), el registro de barberos (nuevo por aprobar) y el panel
   (barbero suspendido con citas). Nunca rompen el flujo que los origina. */
import { PanelNotification, User } from '../models/index.js';
import { adminAlertMail } from './emails.js';

export function createAdminInbox({ mailer, logger = console, env = {}, frontUrl = 'http://localhost:5173' }) {
  async function emails() {
    const set = new Set(String(env.SUPERADMIN_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    for (const u of await User.find({ roles: 'superadmin', status: 'active' }, { email: 1 }).lean()) if (u.email) set.add(u.email);
    return [...set];
  }

  /* `email: false` → solo bandeja (cuando el correo ya lo manda otro módulo). */
  async function notify({ kind, title, body = '', appointmentId = null, professionalId = null, path = '', email = true }) {
    try {
      const admins = await User.find({ roles: 'superadmin', status: 'active' }, { _id: 1 }).lean();
      if (admins.length) {
        await PanelNotification.insertMany(admins.map((a) => ({ userId: a._id, kind, title, body, appointmentId, professionalId })));
      }
      if (email) {
        const url = `${frontUrl}/wstyle/admin/${path}`;
        for (const to of await emails()) await mailer.send({ to, ...adminAlertMail({ title, body, url, kind }) });
      }
    } catch (err) {
      logger.error('[admin] aviso falló:', err.message);
    }
  }

  return { notify, emails };
}
