/* Plantillas de correo (RN-17, RN-21, RN-22). Texto + HTML mínimo; cada correo de
   cita lleva el link a la cita y un wa.me al otro lado prellenado. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(title, lines, links = []) {
  const text = [title, '', ...lines, '', ...links.map(([label, url]) => `${label}: ${url}`), '', 'WS Style'].join('\n');
  const html =
    `<div style="font-family:Inter,Arial,sans-serif;background:#0E0D0C;color:#EDE6DA;padding:24px">` +
    `<h1 style="font-family:Anton,Impact,sans-serif;letter-spacing:.04em;font-weight:400">${esc(title)}</h1>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join('') +
    links.map(([label, url]) => `<p><a style="color:#B8875A" href="${esc(url)}">${esc(label)}</a></p>`).join('') +
    `<p style="color:#8E877D">WS Style</p></div>`;
  return { text, html };
}

export const waLink = (phoneE164, text) => (phoneE164 ? `https://wa.me/${String(phoneE164).replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null);

export function verifyEmailMail({ name, url }) {
  const subject = 'Confirma tu correo · WS Style';
  return { subject, template: 'verify_email', ...layout(subject, [`Hola ${name || ''}`.trim() + ',', 'Confirma tu correo para dejar tu cuenta lista. El link vale 24 horas.'], [['Confirmar mi correo', url]]) };
}

export function linkFacebookMail({ name, url }) {
  const subject = 'Confirma que quieres vincular Facebook · WS Style';
  return { subject, template: 'fb_link_email', ...layout(subject, [`Hola ${name || ''}`.trim() + ',', 'Alguien pidió vincular una cuenta de Facebook a tu cuenta de WS Style. Si fuiste tú, confírmalo con este link (vale 24 horas). Si no, ignora este correo.'], [['Vincular Facebook', url]]) };
}

export function resetPasswordMail({ name, url }) {
  const subject = 'Recupera tu contraseña · WS Style';
  return { subject, template: 'reset_password', ...layout(subject, [`Hola ${name || ''}`.trim() + ',', 'Usa este link para crear una contraseña nueva. Vale 1 hora y sirve una sola vez. Si no lo pediste, ignora este correo.'], [['Crear contraseña nueva', url]]) };
}

/* Correos de una cita. `kind` = evento de RN-17; `to` = 'client' | 'barber'. */
const CLIENT_SUBJECTS = {
  received: 'Recibimos tu reserva',
  confirmed: 'Tu cita está confirmada',
  proposal: (b) => `${b} quiere mover tu cita`,
  change_accepted: 'Tu cita quedó en la nueva hora',
  cancelled: 'Tu cita fue cancelada',
  expired: 'Tu reserva expiró',
};
const BARBER_SUBJECTS = {
  new: 'Nueva cita por confirmar',
  client_accepted: 'El cliente aceptó el cambio',
  client_countered: 'El cliente propuso otra hora',
  client_cancelled: 'El cliente canceló la cita',
};

export function appointmentMail({ kind, to, appt, when, proposalWhen, url, waUrl, cancelledBy, reason }) {
  const barber = appt.professionalSnapshot?.displayName || 'tu barbero';
  const client = appt.customerSnapshot?.name || 'Cliente';
  const service = appt.serviceSnapshot?.name || 'Servicio';
  const where = appt.location?.kind === 'home' ? `A domicilio: ${appt.location?.address?.formatted || appt.location?.address?.street || ''}` : 'En el local';
  const total = `Total: $${Number(appt.pricing?.totalCLP || 0).toLocaleString('es-CL')}`;
  let subject;
  const lines = [];
  if (to === 'client') {
    const s = CLIENT_SUBJECTS[kind];
    subject = (typeof s === 'function' ? s(barber) : s) + ' · WS Style';
    if (kind === 'received') lines.push(`NUEVA CITA — esperando confirmación de ${barber}.`);
    if (kind === 'proposal') lines.push(`${barber} propone cambiar tu cita: antes ${when} » ahora ${proposalWhen}.`, 'Puedes aceptar, proponer otra hora o cancelar desde la página de tu cita.');
    if (kind === 'cancelled') lines.push(`Cancelada por ${cancelledBy}${reason ? `. Motivo: ${reason}` : ''}.`);
    if (kind === 'expired') lines.push(`${barber} no alcanzó a confirmar a tiempo, así que la hora se liberó. Puedes reservar otra.`);
  } else {
    subject = BARBER_SUBJECTS[kind] + ' · WS Style';
    lines.push(`Cliente: ${client}`);
    if (kind === 'client_cancelled' && reason) lines.push(`Motivo: ${reason}`);
  }
  lines.push(`${service} · ${when}`, where, total);
  const links = [['Ver la cita', url]];
  if (waUrl) links.push([to === 'client' ? `Escribir a ${barber} por WhatsApp` : `Escribir a ${client} por WhatsApp`, waUrl]);
  return { subject, template: `${to}_${kind}`, ...layout(subject.replace(' · WS Style', ''), lines, links) };
}
