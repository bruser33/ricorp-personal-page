// SPEC-55: la hoja "Reservar en este hueco" sirve al barbero y al super admin. Lo que cambia entre ambos (a quién
// se le busca, cómo se agenda, dónde se bloquea) va en este adaptador.
import { pro, type CustomerHit, type Invitation, type TimeOff, type TimeOffInput } from './api';
import type { SlotLoader } from './components/SlotPicker';

export interface BookingAdapter {
  who: 'pro' | 'admin';
  // Para el texto de confirmación: "no te pueden reservar" (barbero) / "no le pueden reservar a Juan" (admin).
  barberName?: string;
  search: (q: string) => Promise<{ items: CustomerHit[] }>;
  slots: SlotLoader;
  book: (body: Record<string, unknown>) => Promise<Invitation>;
  addTimeOff: (body: TimeOffInput) => Promise<{ timeOff: TimeOff }>;
}

export const proBooking: BookingAdapter = {
  who: 'pro',
  search: pro.customers,
  slots: pro.slots,
  book: pro.invite,
  addTimeOff: pro.addTimeOff,
};

// Mínimo del buscador (RN-02): 3 letras o 4 dígitos.
export function searchable(q: string) {
  const t = q.trim();
  const digits = t.replace(/\D/g, '');
  const numeric = digits.length > 0 && digits.length === t.replace(/[\s+()-]/g, '').length;
  return numeric ? digits.length >= 4 : t.normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').length >= 3;
}
