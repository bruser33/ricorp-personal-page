import { useSyncExternalStore } from 'react';
import { api, API_BASE, ApiError } from '../agenda/api';

// SPEC-55 RN-04: "El cliente no vino" de un toque con [Deshacer] durante 8 s. La petición NO sale mientras corre la
// ventana: sale al terminar los 8 s, al cerrar el aviso o —si se cierra la pestaña— con fetch keepalive.
// Store global (panel del barbero y del admin): un aviso a la vez; si se marca otra, la anterior se envía ya.
export const UNDO_MS = 8000;

interface Pending<T> {
  id: string;
  name: string;
  path: string;
  onDone: (r: T) => void;
  onError: (msg: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pending: Pending<unknown> | null = null;
let snapshot: { id: string; name: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = pending ? { id: pending.id, name: pending.name } : null;
  listeners.forEach((l) => l());
};

async function send(p: Pending<unknown>) {
  try {
    p.onDone(await api(p.path, { method: 'POST', body: {} }));
  } catch (e) {
    p.onError(e instanceof ApiError && e.status ? e.message : 'No pudimos registrar la inasistencia. Inténtalo de nuevo.');
  }
}

// Envía ya la que está pendiente (al terminar los 8 s o al cerrar el aviso).
export function flushNoShow() {
  const p = pending;
  if (!p) return;
  clearTimeout(p.timer);
  pending = null;
  emit();
  void send(p);
}

export function undoNoShow() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending = null;
  emit();
}

export function scheduleNoShow<T>(o: { id: string; name: string; path: string; onDone: (r: T) => void; onError: (msg: string) => void }) {
  flushNoShow();
  pending = { ...o, onDone: o.onDone as (r: unknown) => void, timer: setTimeout(flushNoShow, UNDO_MS) };
  emit();
}

// Si se cierra la pestaña dentro de la ventana, el registro igual sale (keepalive sobrevive a la descarga).
if (typeof window !== 'undefined') {
  const sendNow = () => {
    const p = pending;
    if (!p) return;
    clearTimeout(p.timer);
    pending = null;
    try {
      // Sin Content-Type JSON: así es una petición "simple" (sin preflight CORS), que sí sale al cerrar la pestaña.
      void fetch(API_BASE + p.path, { method: 'POST', credentials: 'include', keepalive: true });
    } catch {
      /* el navegador no lo permitió: nada más que hacer */
    }
  };
  window.addEventListener('pagehide', sendNow);
  // En el celular, pasar a otra app y que el sistema mate el navegador no siempre dispara pagehide.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sendNow(); });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePendingNoShow() {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}
