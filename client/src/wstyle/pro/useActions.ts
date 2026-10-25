import { useCallback, useState } from 'react';
import { ApiError } from '../agenda/api';
import { pro, type ProAction, type ProAppointment } from './api';

export type Msg = { tone: 'ok' | 'error'; text: string } | null;

// Acciones sobre una cita desde el panel: la tarjeta cambia sin recargar (AC-11). 409 = otra pestaña o el cliente
// ya la cambió (CB-11) o la hora se ocupó (CB-05): aviso + recarga del estado real.
export function useProActions(onChange: (a: ProAppointment) => void, reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = useCallback(async (id: string, action: ProAction, body: Record<string, unknown> = {}, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await pro.act(id, action, body);
      const appt = (r.appointment ?? r) as ProAppointment;
      onChange(appt);
      if (okText) setMsg({ tone: 'ok', text: okText });
      return r;
    } catch (e) {
      const text = e instanceof ApiError && e.status ? e.message : 'No pudimos conectar con la agenda. Inténtalo de nuevo.';
      setMsg({ tone: 'error', text });
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) reload();
      return null;
    } finally {
      setBusy(false);
    }
  }, [onChange, reload]);
  return { busy, msg, setMsg, run };
}
