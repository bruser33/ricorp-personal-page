import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { localDate, localTime, longDay } from '../../agenda/util';
import { ACTIVE_WAIT, PREF_LABEL, WAIT_TONE } from '../../agenda/waitlist';
import type { ProWaitEntry, WaitDay, WaitlistApi } from '../api';
import { shortDay } from '../util';
import Sheet from './Sheet';

const stamp = (iso: string) => {
  if (localDate(iso) === localDate(Date.now())) return localTime(iso);
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
};

export const Hourglass = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="M6 3h12M6 21h12M7 3c0 5 4 6 5 9-1 3-5 4-5 9M17 3c0 5-4 6-5 9 1 3 5 4 5 9" />
  </svg>
);

// SPEC-54 §6: chip del encabezado de cada día con la cantidad en espera.
export function WaitlistChip({ date, count, onOpen }: { date: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" className="pro-wait-chip" data-waitlist-chip={date} aria-label={`${count} en lista de espera`} onClick={onOpen}>
      <Hourglass /><span>{count}</span>
    </button>
  );
}

interface Props {
  source: WaitlistApi;
  days: WaitDay[];              // días con gente (uno = hoja de ese día; varios = chips para elegir el día)
  initialDate?: string;
  showProfessional?: boolean;   // admin: muestra el barbero pedido
  onChanged: () => void;        // recargar la lista (chip y hoja)
  onClose: () => void;
}

// Hoja con la lista de espera de un día: nombre, servicio, preferencia, anotado, estado, avisado; [Avisarle] y [Sacar].
export default function WaitlistSheet({ source, days, initialDate, showProfessional = false, onChanged, onClose }: Props) {
  const [date, setDate] = useState(initialDate ?? days[0]?.date ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waLinks, setWaLinks] = useState<Record<string, string>>({});
  const day = days.find((d) => d.date === date) ?? days[0];

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos conectar con la agenda. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }
  // La pestaña se abre en el mismo toque (Safari en iPhone bloquea window.open después de un await) y luego se le da el link.
  const notify = (w: ProWaitEntry) => {
    const tab = window.open('', '_blank');
    return run(w.id, async () => {
      try {
        const r = await source.notify(w.id);
        setWaLinks((x) => ({ ...x, [w.id]: r.waUrl }));
        if (tab) tab.location.href = r.waUrl;
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  };
  const remove = (w: ProWaitEntry) => run(w.id, async () => { await source.remove(w.id); });

  return (
    <Sheet title="Lista de espera" onClose={onClose}>
      {days.length > 1 && (
        <div className="pro-wait-days" role="group" aria-label="Días">
          {days.map((d) => (
            <button key={d.date} type="button" className={`ag-chip${d.date === day?.date ? ' is-selected' : ''}`} aria-pressed={d.date === day?.date} onClick={() => setDate(d.date)} data-waitlist-day={d.date}>
              {shortDay(d.date)} · {d.count}
            </button>
          ))}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!day || !day.entries.length ? <p className="ag-muted">No queda nadie en la lista de este día.</p> : (
        <>
          <p className="ag-muted">{longDay(day.date)} · {day.count} {day.count === 1 ? 'persona esperando' : 'personas esperando'}</p>
          <ul className="pro-notes pro-wait" data-waitlist-list={day.date}>
            {day.entries.map((w) => (
              <li key={w.id} data-waitlist-entry={w.id}>
                <div>
                  <strong>{w.name}</strong>
                  <span>{w.service} · {PREF_LABEL[w.pref] ?? ''}{showProfessional ? ` · ${w.professional}` : ''}</span>
                  <time dateTime={w.createdAt}>anotado {stamp(w.createdAt)}{w.notifiedAt ? ` · avisado ${stamp(w.notifiedAt)}` : ''}</time>
                  <span><span className={`ag-pill ag-pill--${WAIT_TONE[w.status] ?? 'off'}`}>{w.statusLabel}</span></span>
                  {waLinks[w.id] && <a className="ag-link" data-wa-link="" href={waLinks[w.id]} target="_blank" rel="noopener">Abrir WhatsApp de nuevo</a>}
                </div>
                {ACTIVE_WAIT.includes(w.status) && (
                  <div className="pro-wait__actions">
                    <button type="button" className="btn btn--primary" disabled={busy === w.id} onClick={() => notify(w)}>Avisarle</button>
                    <button type="button" className="btn btn--ghost" disabled={busy === w.id} onClick={() => remove(w)}>Sacar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
