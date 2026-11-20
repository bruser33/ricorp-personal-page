// SPEC-54: lista de espera. Etiquetas y llamadas compartidas por la reserva, "Mis citas" y los paneles.
import { agenda, ApiError, type Slot, type WaitlistEntry, type WaitPref } from './api';

export const PREF_LABEL: Record<WaitPref, string> = {
  all: 'Todo el día',
  am: 'Mañana (antes de 14:00)',
  pm: 'Tarde (desde 14:00)',
};
export const PREFS: WaitPref[] = ['all', 'am', 'pm'];

// Estados con los que todavía se puede salir de la lista.
export const ACTIVE_WAIT = ['waiting', 'notified'];

export const WAIT_TONE: Record<string, 'wait' | 'ok' | 'warn' | 'off'> = { waiting: 'wait', notified: 'warn', booked: 'ok', ended: 'off', removed: 'off' };

export type JoinResult =
  | { kind: 'done'; entry: WaitlistEntry }
  | { kind: 'slots'; slots: Slot[] }                 // CB-10: se acaba de liberar una hora
  | { kind: 'error'; status: number; code: string; message: string };

// Anotarse: traduce la respuesta del server a lo que muestra la tarjeta (los mensajes vienen listos del server).
export async function joinWaitlist(body: { date: string; serviceId: string; professionalId: string; pref: WaitPref }): Promise<JoinResult> {
  try {
    const r = await agenda.joinWaitlist(body);
    return { kind: 'done', entry: r.entry };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status === 0) return { kind: 'error', status: 0, code: 'network', message: 'No pudimos conectar con la agenda. Inténtalo de nuevo.' };
    if (e.code === 'slots_available') return { kind: 'slots', slots: Array.isArray(e.data.slots) ? (e.data.slots as Slot[]) : [] };
    return { kind: 'error', status: e.status, code: e.code, message: e.message };
  }
}
