import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Spinner } from '../../agenda/components/ui';
import { pro } from '../api';

// Fecha + horas libres del propio barbero. `appointment` = mover esa cita (sus bloques no cuentan como ocupados).
export default function SlotPicker({ date, onDate, value, onPick, service, mode, appointment, minDate, reloadKey = 0, onLoaded }: {
  date: string;
  onDate: (d: string) => void;
  value: string | null;
  onPick: (startsAt: string, label: string) => void;
  service?: string;
  mode?: string;
  appointment?: string;
  minDate: string;
  reloadKey?: number;
  onLoaded?: (slots: { startsAt: string; label: string }[]) => void;
}) {
  const loaded = useRef(onLoaded);
  useEffect(() => { loaded.current = onLoaded; }, [onLoaded]);
  const [slots, setSlots] = useState<{ startsAt: string; label: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!service && !appointment) return;
    Promise.resolve().then(() => { if (alive) { setSlots(null); setError(null); } });
    pro.slots({ service, date, mode, appointment }).then(
      (r) => { if (alive) { setSlots(r.slots); loaded.current?.(r.slots); } },
      (e) => { if (alive) setError(e instanceof ApiError && e.status ? e.message : 'No pudimos cargar las horas.'); },
    );
    return () => { alive = false; };
  }, [date, service, mode, appointment, reloadKey]);
  return (
    <div className="pro-slots">
      <div className="ag-field">
        <label htmlFor="pro-slot-date">Fecha</label>
        <input id="pro-slot-date" type="date" value={date} min={minDate} onChange={(e) => e.target.value && onDate(e.target.value)} />
      </div>
      <fieldset className="ag-options">
        <legend>Hora</legend>
        {error && <p className="ag-field__error" role="alert">{error}</p>}
        {!slots && !error && (service || appointment) && <Spinner label="Buscando horas libres…" />}
        {!service && !appointment && <p className="ag-muted">Elige primero el servicio.</p>}
        {slots && !slots.length && <p className="ag-muted">No tienes horas libres ese día.</p>}
        {slots && slots.length > 0 && (
          <div className="ag-times">
            {slots.map((s) => (
              <button key={s.startsAt} type="button" className={`ag-chip${value === s.startsAt ? ' is-selected' : ''}`} aria-pressed={value === s.startsAt} onClick={() => onPick(s.startsAt, s.label)}>{s.label}</button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
