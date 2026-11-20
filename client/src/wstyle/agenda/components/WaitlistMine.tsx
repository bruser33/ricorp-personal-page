import { useCallback, useEffect, useState } from 'react';
import { agenda, ApiError, type WaitlistEntry } from '../api';
import { longDay } from '../util';
import { ACTIVE_WAIT, PREF_LABEL, WAIT_TONE } from '../waitlist';
import { Notice } from './ui';

// SPEC-54 §3: "En lista de espera" dentro de Mis citas. Sin entradas (o si falla la carga) no se muestra nada.
export default function WaitlistMine() {
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => agenda.myWaitlist().then((r) => setEntries(r.entries), () => setEntries([])), []);
  useEffect(() => {
    const t = setTimeout(load);
    return () => clearTimeout(t);
  }, [load]);

  async function leave(id: string) {
    setBusy(id);
    setErr(null);
    try {
      await agenda.leaveWaitlist(id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError && e.status ? e.message : 'No pudimos sacarte de la lista. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  if (!entries?.length) return null;
  return <WaitlistMineView entries={entries} busy={busy} error={err} onLeave={leave} />;
}

export function WaitlistMineView({ entries, busy, error, onLeave }: { entries: WaitlistEntry[]; busy: string | null; error: string | null; onLeave: (id: string) => void }) {
  return (
    <section className="ag-wait-mine" aria-labelledby="ag-wait-mine" data-waitlist-mine="">
      <h2 className="ag-h3" id="ag-wait-mine">En lista de espera</h2>
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="ag-list">
        {entries.map((w) => (
          <li key={w.id} className="ag-item" data-waitlist-entry={w.id}>
            <span className="ag-item__main">
              <strong>{w.service.name}</strong> con {w.professional.name}
              <span className="ag-item__when">{longDay(w.date)} · {PREF_LABEL[w.pref] ?? ''}</span>
            </span>
            <span className="ag-item__side">
              <span className={`ag-pill ag-pill--${WAIT_TONE[w.status] ?? 'off'}`}>{w.statusLabel}</span>
              {ACTIVE_WAIT.includes(w.status) && (
                <button type="button" className="btn btn--ghost" disabled={busy === w.id} onClick={() => onLeave(w.id)}>
                  {busy === w.id ? 'Saliendo…' : 'Salir de la lista'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
