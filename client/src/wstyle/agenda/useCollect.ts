import { useState } from 'react';
import { boletaProblem, parseBoleta, type LocalMethod } from '../payments';

// Estado + validación del formulario de cobro (el server revalida).
export function useCollect() {
  const [method, setMethod] = useState<LocalMethod | ''>('');
  const [boleta, setBoleta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const check = () => {
    if (!method) { setError('Elige cómo pagó.'); return null; }
    const p = boletaProblem(boleta);
    if (p) { setError(p); return null; }
    setError(null);
    return { localMethod: method, boletaNumber: boleta.trim() ? parseBoleta(boleta) : undefined };
  };
  return { method, setMethod: (m: LocalMethod) => { setMethod(m); setError(null); }, boleta, setBoleta: (v: string) => { setBoleta(v); setError(null); }, error, setError, check };
}
