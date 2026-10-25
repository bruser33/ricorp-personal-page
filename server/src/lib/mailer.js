/* Correo de la agenda y de las cuentas (RN-17, RN-21, RN-22). Misma prioridad que
   /api/contact: Resend → SMTP (Gmail) → dry-run. MAIL_DRY_RUN=1 fuerza el dry-run
   (desarrollo y tests): nada sale, y lo "enviado" queda en `outbox` para revisarlo. */
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export function createMailer({ env = process.env, logger = console } = {}) {
  const forceDry = ['1', 'true'].includes(String(env.MAIL_DRY_RUN || '').toLowerCase());
  const from = env.MAIL_FROM || env.CONTACT_FROM || 'WS Style <onboarding@resend.dev>';
  const resend = !forceDry && env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  const smtpPass = (env.SMTP_PASS || '').replace(/\s+/g, '');
  const smtp =
    !forceDry && !resend && env.SMTP_USER && smtpPass
      ? nodemailer.createTransport({ service: 'gmail', auth: { user: env.SMTP_USER, pass: smtpPass }, connectionTimeout: 10_000 })
      : null;
  const mode = resend ? 'resend' : smtp ? 'smtp' : 'dry-run';
  const outbox = [];

  async function send({ to, subject, text, html, template }) {
    if (!to) return { ok: false, status: 'failed', error: 'no recipient' };
    const mail = { from, to: [to], subject, text, html };
    if (mode === 'dry-run') {
      outbox.push({ to, subject, text, html, template, at: new Date() });
      /* Nunca el cuerpo completo en el log: puede llevar links de un solo uso. */
      logger.log(`[mail] dry-run → ${to} · ${subject}`);
      return { ok: true, status: 'dry-run' };
    }
    try {
      if (mode === 'resend') {
        const { error } = await resend.emails.send(mail);
        if (error) throw new Error(error.message || String(error));
      } else {
        await smtp.sendMail({ ...mail, to });
      }
      return { ok: true, status: 'sent' };
    } catch (err) {
      logger.error(`[mail] error → ${to} · ${subject}: ${err.message}`);
      return { ok: false, status: 'failed', error: err.message };
    }
  }

  return { send, outbox, mode };
}
