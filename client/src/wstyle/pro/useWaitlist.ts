import { useCallback, useEffect, useState } from 'react';
import type { WaitlistApi, WaitlistRange } from './api';

// SPEC-54: lista de espera del rango visible. Si falla, queda en null (los chips simplemente no aparecen).
export function useWaitlist(source: WaitlistApi, from: string, to: string) {
  const [data, setData] = useState<WaitlistRange | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    source.list(from, to).then((r) => { if (alive) setData(r); }, () => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [source, from, to, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, reload };
}
