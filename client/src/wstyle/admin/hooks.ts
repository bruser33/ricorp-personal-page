import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../agenda/api';
import { localDate } from '../agenda/util';

// Carga con estado (cargando / error reintentable / listo). CB-07: si la API falla, el panel muestra un error con
// "Reintentar" (nunca una pantalla en blanco ni datos inventados).
export function useLoad<T>(fn: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (n === seq.current) { setData(d); setError(null); }
      return d;
    } catch (e) {
      if (n === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, 'error', 'Algo salió mal'));
      return null;
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);
  // `key` resume los parámetros de la carga: si cambia, se vuelve a pedir.
  useEffect(() => {
    Promise.resolve().then(reload);
  }, [key, reload]);
  return { data, setData, error, loading, reload };
}

// Fecha local de hoy (America/Santiago), fija durante la vida del componente.
export function useToday() {
  const [today] = useState(() => localDate(Date.now()));
  return today;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
