import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../agenda/api';
import { pro, type AgendaRange, type ProAppointment } from './api';

// Carga un rango de la agenda del barbero y permite reemplazar una cita sin recargar todo (AC-11).
export function useAgendaRange(from: string | null, to: string | null) {
  const [data, setData] = useState<AgendaRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    pro.agenda(from ?? '', to ?? from ?? '').then(
      (r) => { if (alive) { setData(r); setError(null); } },
      (e) => { if (alive) setError(e instanceof ApiError && e.status ? e.message : 'No pudimos cargar tu agenda.'); },
    );
    return () => { alive = false; };
  }, [from, to, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const replace = useCallback((a: ProAppointment) => {
    setData((d) => {
      if (!d) return d;
      const days = d.days.map((day) => ({ ...day, appointments: day.appointments.map((x) => (x.id === a.id ? a : x)) }));
      return { ...d, days };
    });
  }, []);
  return { data, error, reload, replace };
}
