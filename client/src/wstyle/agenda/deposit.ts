// Seña por transferencia (SPEC-56): funciones puras de la pantalla "Deja tu seña" (probadas en deposit.test.ts).
import type { Deposit, DepositBank } from './api';
import { clp } from './util';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// La cuenta regresiva usa la hora del SERVER: `offsetMs` = hora del server − hora del teléfono al recibir la cita.
export const serverOffset = (serverNowIso: string | undefined, phoneNow: number) => (serverNowIso ? Date.parse(serverNowIso) - phoneNow : 0);

export function countdown(deadlineIso: string | null | undefined, phoneNow: number, offsetMs: number) {
  if (!deadlineIso) return { msLeft: 0, label: '00:00', expired: true };
  const msLeft = Math.max(0, Date.parse(deadlineIso) - (phoneNow + offsetMs));
  const total = Math.ceil(msLeft / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const label = `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 2, '0')}:${String(s).padStart(2, '0')}`;
  return { msLeft, label, expired: msLeft <= 0 };
}

// "Copiar todo": formato para pegar en la app del banco.
export function bankText(bank: DepositBank, amountCLP: number, reference: string) {
  return [
    `Nombre: ${bank.holder}`,
    `RUT: ${bank.rut}`,
    `Banco: ${bank.bank}`,
    `Tipo de cuenta: ${bank.accountTypeLabel}`,
    `N° de cuenta: ${bank.accountNumber}`,
    `Correo: ${bank.email}`,
    `Monto: ${clp.format(amountCLP)}`,
    `Comentario: ${reference}`,
  ].join('\n');
}

// Chips después de enviar el comprobante: HORA ✓ Guardada · SEÑA ⏳ En revisión / ✓ Confirmada.
export function depositChips(d: Pick<Deposit, 'status'>, apptStatus: string) {
  const alive = !['cancelada', 'expirada', 'no_asistio'].includes(apptStatus);
  const hora = alive ? { tone: 'ok', text: 'Guardada' } : { tone: 'off', text: 'Liberada' };
  const sena =
    d.status === 'confirmada' ? { tone: 'ok', text: 'Confirmada' }
    : d.status === 'en_revision' ? { tone: 'wait', text: 'En revisión' }
    : d.status === 'rechazada' ? { tone: 'off', text: 'Rechazada' }
    : d.status === 'por_devolver' ? { tone: 'warn', text: 'Por devolver' }
    : d.status === 'devuelta' ? { tone: 'off', text: 'Devuelta' }
    : { tone: 'wait', text: 'Por pagar' };
  return { hora, sena };
}

// Validación previa en el teléfono (el server revalida por contenido).
export function receiptProblem(file: { size: number; type: string; name: string }): string | null {
  if (!file.size) return 'El archivo está vacío.';
  if (file.size > MAX_RECEIPT_BYTES) return 'El archivo pesa más de 5 MB. Sube una captura o un PDF más liviano.';
  const okType = /^image\//.test(file.type) || file.type === 'application/pdf' || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
  if (!okType) return 'Sube una captura, una foto o el PDF de la transferencia.';
  return null;
}

// Etiqueta para la agenda del barbero y del admin.
export function depositTag(d: Deposit | null | undefined, apptStatus: string): string | null {
  if (!d) return null;
  if (apptStatus === 'pendiente_sena' && d.status === 'por_pagar') return `Esperando seña${d.deadlineLabel ? ` · vence ${d.deadlineLabel}` : ''}`;
  if (d.status === 'en_revision') return 'Seña en revisión';
  if (d.status === 'confirmada') return `✓ Seña ${clp.format(d.amountCLP)}`;
  if (d.status === 'por_devolver') return `Seña por devolver ${clp.format(d.amountCLP)}`;
  return null;
}

// "¿Cobraste?": lo que queda por cobrar en el local.
export function restLine(d: Deposit | null | undefined): string | null {
  if (!d) return null;
  if (d.status === 'confirmada') return `Resta por cobrar ${clp.format(d.restCLP)} (seña de ${clp.format(d.amountCLP)} ya pagada)`;
  if (d.status === 'en_revision') return `Seña sin revisar: si se confirma, resta ${clp.format(d.restIfPaidCLP)}`;
  return null;
}
