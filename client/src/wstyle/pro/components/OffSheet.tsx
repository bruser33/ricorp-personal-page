import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { localDate, localTime, longDay } from '../../agenda/util';
import type { TimeOff } from '../api';
import Sheet from './Sheet';

// Tocar un bloqueo de la grilla → [Quitar bloqueo] (SPEC-55). Lo usa también la agenda del admin.
export default function OffSheet({ off, remove, onClose, onRemoved }: { off: TimeOff; remove: () => Promise<unknown>; onClose: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sameDay = localDate(off.startsAt) === localDate(off.endsAt);
  const when = sameDay ? `${longDay(localDate(off.startsAt))}, de ${localTime(off.startsAt)} a ${localTime(off.endsAt)}` : `del ${longDay(localDate(off.startsAt))} ${localTime(off.startsAt)} al ${longDay(localDate(off.endsAt))} ${localTime(off.endsAt)}`;
  return (
    <Sheet title={off.reason || 'Bloqueo'} onClose={onClose}>
      <p>Bloqueado {when}. En ese rato no se puede reservar.</p>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="ag-actions ag-actions--wrap">
        <button type="button" className="btn btn--primary" disabled={busy} data-remove-off={off.id} onClick={async () => {
          setBusy(true);
          setErr(null);
          try { await remove(); onRemoved(); } catch (e) { setErr(e instanceof ApiError && e.status ? e.message : 'No pudimos quitar el bloqueo.'); } finally { setBusy(false); }
        }}>{busy ? 'Quitando…' : 'Quitar bloqueo'}</button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Volver</button>
      </div>
    </Sheet>
  );
}
