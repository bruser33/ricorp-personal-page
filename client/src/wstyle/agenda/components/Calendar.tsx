import { useRef, type KeyboardEvent } from 'react';
import type { Slot } from '../api';
import { addDays, longDay, monthGrid, monthLabel, WEEK_LABELS } from '../util';

interface Props {
  year: number;
  month: number;
  today: string;
  lastDay: string;
  slotsByDay: Map<string, Slot[]> | null;   // null = cargando
  selected?: string;
  onSelect: (date: string) => void;
  onMonth: (year: number, month: number) => void;
}

// Calendario mensual como el de Styluxe (semana desde el lunes, LU MA MI JU VI SA DO). Días sin ninguna hora libre:
// en gris con "Sin disponibilidad" (deshabilitados). Flechas del teclado para moverse entre días.
export default function Calendar({ year, month, today, lastDay, slotsByDay, selected, onSelect, onMonth }: Props) {
  const grid = monthGrid(year, month);
  const ref = useRef<HTMLDivElement>(null);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const canPrev = first > today;
  const canNext = addDays(first, 31).slice(0, 7) <= lastDay.slice(0, 7);
  const shift = (n: number) => {
    const m = month + n;
    onMonth(m < 1 ? year - 1 : m > 12 ? year + 1 : year, ((m + 11) % 12) + 1);
  };
  const free = (d: string) => (slotsByDay?.get(d)?.length ?? 0) > 0;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const cur = (e.target as HTMLElement).dataset.date;
    if (!step || !cur) return;
    e.preventDefault();
    for (let d = addDays(cur, step), i = 0; i < 42; d = addDays(d, step), i++) {
      const btn = ref.current?.querySelector<HTMLButtonElement>(`button[data-date="${d}"]:not(:disabled)`);
      if (btn) { btn.focus(); return; }
      if (!d.startsWith(first.slice(0, 7))) return;
    }
  }

  return (
    <div className="ag-cal" ref={ref}>
      <div className="ag-cal__head">
        <button type="button" className="ag-cal__nav" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mes anterior">‹</button>
        <h3 className="ag-cal__month" aria-live="polite">{monthLabel(year, month)}</h3>
        <button type="button" className="ag-cal__nav" onClick={() => shift(1)} disabled={!canNext} aria-label="Mes siguiente">›</button>
      </div>
      <div className="ag-cal__grid" role="group" aria-label={`Días de ${monthLabel(year, month)}`} onKeyDown={onKey} aria-busy={slotsByDay === null}>
        {WEEK_LABELS.map((w) => <span key={w} className="ag-cal__dow" aria-hidden="true">{w}</span>)}
        {grid.map((d, i) => {
          if (!d) return <span key={`e${i}`} className="ag-cal__empty" aria-hidden="true" />;
          const inRange = d >= today && d <= lastDay;
          const ok = inRange && free(d);
          const loading = slotsByDay === null && inRange;
          const n = slotsByDay?.get(d)?.length ?? 0;
          return (
            <button key={d} type="button" data-date={d} className={`ag-cal__day${d === selected ? ' is-selected' : ''}${ok ? '' : ' is-off'}`}
              disabled={!ok} aria-pressed={d === selected}
              aria-label={`${longDay(d)}: ${loading ? 'cargando' : ok ? `${n} ${n === 1 ? 'hora libre' : 'horas libres'}` : 'Sin disponibilidad'}`}
              onClick={() => onSelect(d)}>
              <span className="ag-cal__num">{Number(d.slice(8))}</span>
              {inRange && !loading && !ok && <span className="ag-cal__none" aria-hidden="true">Sin disp.</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimeChips({ slots, selected, onSelect, label }: { slots: Slot[]; selected?: string; onSelect: (s: Slot) => void; label: string }) {
  if (!slots.length) return <p className="ag-muted">Sin disponibilidad este día.</p>;
  return (
    <div className="ag-times" role="group" aria-label={label}>
      {slots.map((s) => (
        <button key={s.startsAt} type="button" className={`ag-chip${s.startsAt === selected ? ' is-selected' : ''}`} aria-pressed={s.startsAt === selected} onClick={() => onSelect(s)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
