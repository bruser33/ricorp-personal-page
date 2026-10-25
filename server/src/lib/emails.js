import { breakdownLines, feesIncluded } from '../domain/pricing.js';
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

export function linkGoogleMail({ name, url }) {
  const subject = 'Confirma que quieres entrar con Google · WS Style';
  return { subject, template: 'gg_link_email', ...layout(subject, [`Hola ${name || ''}`.trim() + ',', 'Alguien quiso entrar con Google a la cuenta de WS Style de este correo. Si fuiste tú, confírmalo con este link (vale 24 horas): tu cuenta quedará con Google como forma de entrar. Si no, ignora este correo.'], [['Confirmar y vincular Google', url]]) };
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
  /* SPEC-33 */
  invited: (b) => `${b} te agendó una cita`,
  finished: 'Gracias por venir',
  no_show: 'Registramos una inasistencia',
  /* SPEC-35 */
  payment_incomplete: 'Tu reserva no se completó',
  refunded: (_b, appt) => `Te devolvimos ${money(appt.pricing?.totalCLP)}`,
};
const money = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const BARBER_SUBJECTS = {
  new: 'Nueva cita por confirmar',
  client_accepted: 'El cliente aceptó el cambio',
  client_countered: 'El cliente propuso otra hora',
  client_cancelled: 'El cliente canceló la cita',
  /* SPEC-33 */
  invite_confirmed: 'El cliente confirmó la invitación',
  invite_expired: 'La invitación expiró',
  /* SPEC-34 */
  admin_cancelled: 'WS Style canceló una cita',
  admin_booked: 'WS Style te agendó una cita',
  reassigned_to_you: 'Te reasignaron una cita',
  reassigned_away: 'Tu cita fue reasignada a otro barbero',
};
export const BARBER_EVENT_TITLE = BARBER_SUBJECTS;

export function appointmentMail({ kind, to, appt, when, proposalWhen, url, waUrl, cancelledBy, reason }) {
  const barber = appt.professionalSnapshot?.displayName || 'tu barbero';
  const client = appt.customerSnapshot?.name || 'Cliente';
  const service = appt.serviceSnapshot?.name || 'Servicio';
  const where = appt.location?.kind === 'home' ? `A domicilio: ${appt.location?.address?.formatted || appt.location?.address?.street || ''}` : 'En el local';
  /* SPEC-35 RN-04: la cita pagada en línea lo dice en cada correo. */
  const paidOnline = appt.payment?.method === 'online' && appt.payment?.status === 'pagado';
  const total = `Total: ${money(appt.pricing?.totalCLP)}${paidOnline ? ' · Pagado en línea' : ''}`;
  let subject;
  const lines = [];
  if (to === 'client') {
    const s = CLIENT_SUBJECTS[kind];
    subject = (typeof s === 'function' ? s(barber, appt) : s) + ' · WS Style';
    if (kind === 'received') lines.push(`NUEVA CITA — esperando confirmación de ${barber}.`);
    if (kind === 'proposal') lines.push(`${barber} propone cambiar tu cita: antes ${when} » ahora ${proposalWhen}.`, 'Puedes aceptar, proponer otra hora o cancelar desde la página de tu cita.');
    if (kind === 'cancelled') lines.push(`Cancelada por ${cancelledBy}${reason ? `. Motivo: ${reason}` : ''}.`);
    if (kind === 'expired') lines.push(`${barber} no alcanzó a confirmar a tiempo, así que la hora se liberó. Puedes reservar otra.`);
    if (kind === 'invited') lines.push(`${barber} te agendó una cita. Confírmala desde el link (el pago es en el local, en efectivo).`);
    if (kind === 'finished') lines.push(`Gracias por atenderte con ${barber}. ¡Te esperamos de vuelta!`);
    if (kind === 'no_show') lines.push(`${barber} registró que no llegaste a tu cita. Si fue un error, escríbenos por WhatsApp.`);
    if (kind === 'payment_incomplete') lines.push('No recibimos el pago a tiempo, así que la hora se liberó. Puedes reservar de nuevo cuando quieras.');
    if (kind === 'refunded') lines.push(`Te devolvimos ${money(appt.pricing?.totalCLP)} en el mismo medio con que pagaste en Mercado Pago. Según tu banco, puede tardar unos días en verse.`);
  } else {
    subject = BARBER_SUBJECTS[kind] + ' · WS Style';
    lines.push(`Cliente: ${client}`);
    if (kind === 'client_cancelled' && reason) lines.push(`Motivo: ${reason}`);
    if (kind === 'invite_expired') lines.push('No la confirmó a tiempo y la hora quedó libre.');
    if (kind === 'admin_cancelled' && reason) lines.push(`Motivo: ${reason}`);
  }
  lines.push(`${service} · ${when}`, where);
  /* SPEC-38: desglose. El cliente ve una sola "Tarifa de servicio"; el barbero, además, su parte. */
  const bd = breakdownLines(appt.pricing || {}, service);
  if (bd.lines.length > 1) for (const l of bd.lines) lines.push(`${l.label}: ${money(l.amountCLP)}${l.hint ? ` (${l.hint})` : ''}`);
  lines.push(total);
  if (to === 'barber' && feesIncluded(appt.pricing)) lines.push(`Tu parte (servicio${appt.pricing?.surchargeCLP ? ' + domicilio' : ''}): ${money(appt.pricing.barberCLP ?? bd.lines[0].amountCLP)}`);
  const links = [['Ver la cita', url]];
  if (waUrl) links.push([to === 'client' ? `Escribir a ${barber} por WhatsApp` : `Escribir a ${client} por WhatsApp`, waUrl]);
  return { subject, template: `${to}_${kind}`, ...layout(subject.replace(' · WS Style', ''), lines, links) };
}

/* ─── Cuenta del barbero (SPEC-33 / SPEC-34) */
export function proReceivedMail({ name, url }) {
  const subject = 'Recibimos tu solicitud · WS Style';
  return { subject, template: 'pro_received', ...layout('Recibimos tu solicitud', [`Hola ${name || ''}`.trim() + ',', 'Gracias por querer trabajar con WS Style. Completa tu perfil (fotos, servicios y horario): lo revisamos y te avisamos por correo cuando esté aprobado.'], [['Ir a mi panel', url]]) };
}

export function proNewForAdminMail({ name, email, phone, url }) {
  const subject = `Nuevo barbero por aprobar: ${name} · WS Style`;
  return { subject, template: 'admin_pro_new', ...layout(`Nuevo barbero por aprobar: ${name}`, [`Correo: ${email || '—'}`, `Celular: ${phone || '—'}`, 'Su perfil queda pendiente hasta que lo apruebes.'], [['Revisar', url]]) };
}

export function proSubmittedForAdminMail({ name, url }) {
  const subject = `Perfil listo para revisar: ${name} · WS Style`;
  return { subject, template: 'admin_pro_submitted', ...layout(`Perfil listo para revisar: ${name}`, ['Completó fotos, servicios y horario y lo envió a revisión.'], [['Revisar', url]]) };
}

export function proApprovedMail({ name, url }) {
  const subject = '¡Bienvenido a WS Style!';
  return { subject, template: 'pro_approved', ...layout(subject, [`Hola ${name || ''}`.trim() + ',', 'Tu perfil fue aprobado: desde ahora apareces en la reserva en línea y puedes manejar tu agenda.'], [['Abrir mi panel', url]]) };
}

export function proRejectedMail({ name, reason, url }) {
  const subject = 'Tu perfil no fue aprobado · WS Style';
  return { subject, template: 'pro_rejected', ...layout('Tu perfil no fue aprobado', [`Hola ${name || ''}`.trim() + ',', reason ? `Motivo: ${reason}` : 'Por ahora no podemos sumarte al equipo.'], [['Ver mi panel', url]]) };
}

export function proSuspendedMail({ name, reason, url }) {
  const subject = 'Tu perfil fue suspendido · WS Style';
  return { subject, template: 'pro_suspended', ...layout('Tu perfil fue suspendido', [`Hola ${name || ''}`.trim() + ',', 'Mientras esté suspendido no recibes reservas nuevas.', ...(reason ? [`Motivo: ${reason}`] : [])], [['Ver mi panel', url]]) };
}

/* ─── Super admin (SPEC-34 RN-10) */
export function adminAlertMail({ title, body, url, kind }) {
  const subject = `${title} · WS Style`;
  return { subject, template: `admin_${kind}`, ...layout(title, body ? [body] : [], [['Abrir el panel', url]]) };
}

export function reassignedMail({ appt, when, url, from, to }) {
  const subject = 'Cambió el barbero de tu cita · WS Style';
  return {
    subject,
    template: 'client_reassigned',
    ...layout('Cambió el barbero de tu cita', [`${from} no podrá atenderte; tu cita queda con ${to}.`, `${appt.serviceSnapshot?.name || 'Servicio'} · ${when}`, 'La hora y el precio no cambian.'], [['Ver la cita', url]]),
  };
}
