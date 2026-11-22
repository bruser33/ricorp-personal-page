import { useRef, type CSSProperties, type ReactNode } from 'react';
import { localDate, localTime, longDay } from '../../agenda/util';
import { depositTag } from '../../agenda/deposit';
import type { AgendaDay, ProAppointment, TimeOff } from '../api';
import { blockBox, effectiveDay, freeCells, gapFrom, gridRange, groupFree, minutesOfDay, offsInDay } from '../util';

export const PX = 1.2; // px por minuto (72 px la hora)
const HIDDEN = ['cancelada', 'expirada'];

// Una columna de la grilla: un día (panel del barbero) o un barbero en un día (agenda del admin, SPEC-55).
export interface GridCol<A extends ProAppointment = ProAppointment> {
  key: string;
  date: string;
  label: ReactNode;
  ariaLabel: string;
  isToday?: boolean;
  day: Omit<AgendaDay, 'appointments'> & { appointments: A[] };
  offs: TimeOff[];
}

// Grilla de agenda compartida (SPEC-33 + SPEC-55): huecos libres agrupados y tocables ("Libre · tocar para reservar"),
// bloques por cita con su insignia de inasistencias, bloqueos rayados con su motivo, línea de "ahora" y —en la vista
// amplia— la acción rápida "El cliente no vino".
export default function AgendaGrid<A extends ProAppointment>({ cols, now, wide, pendingId, onFree, onAppt, onOff, onNoShow, onSwipe, headExtra, cellMin = 30 }: {
  cols: GridCol<A>[];
  now: number;
  wide: boolean;
  pendingId?: string | null;
  onFree: (col: GridCol<A>, startsAt: string, gapMin: number) => void;
  onAppt: (col: GridCol<A>, a: A) => void;
  onOff: (col: GridCol<A>, off: TimeOff) => void;
  onNoShow?: (col: GridCol<A>, a: A) => void;
  onSwipe?: (dir: 1 | -1) => void;
  /* SPEC-54: algo extra bajo el nombre del día (chip de la lista de espera). */
  headExtra?: (col: GridCol<A>) => ReactNode;
  cellMin?: number;
}) {
  const touch = useRef<number | null>(null);
  const visible = cols.map((c) => {
    const { appointments, forFree } = effectiveDay({ ...c.day, appointments: c.day.appointments.filter((a) => !HIDDEN.includes(a.status)) });
    return { ...c, day: { ...c.day, appointments }, forFree };
  });
  const range = gridRange(visible.length ? visible.map((c) => c.day) : [{ date: '', shop: null, windows: [], appointments: [] }]);
  const height = (range.endMin - range.startMin) * PX;
  const y = (iso: string) => (minutesOfDay(iso) - range.startMin) * PX;
  const nowMin = minutesOfDay(new Date(now).toISOString());

  return (
    <div className={`pro-grid${wide ? ' is-wide' : ''}`} style={{ '--cols': cols.length } as CSSProperties}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null || !onSwipe) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1);
      }}>
      <div className="pro-grid__head">
        <span />
        {visible.map((c) => (
          <span key={c.key} className={`pro-grid__day${c.isToday ? ' is-today' : ''}`}>{c.label}{!c.day.shop && <small>Cerrado</small>}{headExtra?.(c)}</span>
        ))}
      </div>
      <div className="pro-grid__body" style={{ height }}>
        <div className="pro-grid__hours" aria-hidden="true">
          {Array.from({ length: (range.endMin - range.startMin) / 60 + 1 }, (_, i) => (
            <span key={i} style={{ top: i * 60 * PX }}>{String((range.startMin / 60 + i) % 24).padStart(2, '0')}:00</span>
          ))}
        </div>
        {visible.map((c) => {
          const groups = groupFree(freeCells(c.forFree, now, cellMin), cellMin);
          return (
            <div key={c.key} className="pro-grid__col" role="group" aria-label={c.ariaLabel}>
              {c.day.windows.map((w) => {
                const b = blockBox(w, range.startMin, PX);
                return <div key={w.startsAt} className="pro-grid__window" style={{ top: b.top, height: b.height }} aria-hidden="true" />;
              })}
              {groups.map((g) => {
                const top = y(g.startsAt);
                return (
                  <div key={g.startsAt} className="pro-free" style={{ top, height: ((Date.parse(g.endsAt) - Date.parse(g.startsAt)) / 60000) * PX }} data-free-group={g.label}>
                    {wide && g.cells.length > 1 && <span className="pro-free__label" aria-hidden="true">{g.label}</span>}
                    {g.cells.map((cell) => (
                      <button key={cell.startsAt} type="button" className="pro-grid__free" style={{ top: y(cell.startsAt) - top, height: cellMin * PX }}
                        data-free={cell.label} aria-label={`Libre a las ${cell.label}, tocar para reservar${wide ? '' : ` (${longDay(c.date)})`}`}
                        onClick={() => onFree(c, cell.startsAt, gapFrom(groups, cell.startsAt))}>
                        {wide
                          ? <span aria-hidden="true"><b>{cell.label}</b> Libre · tocar para reservar</span>
                          : <span aria-hidden="true">+ {cell.label}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
              {offsInDay(c.offs, c.date).map((o) => {
                const top = Math.max(0, y(o.from));
                const bottom = Math.min(height, localDate(o.to) !== c.date ? height : y(o.to));
                if (bottom <= top) return null;
                const reason = o.reason || 'Bloqueado';
                return (
                  <button key={o.id + o.from} type="button" className="pro-off" style={{ top, height: bottom - top }} data-off={o.id}
                    aria-label={`${reason}: bloqueado de ${localTime(o.startsAt)} a ${localTime(o.endsAt)}. Tocar para quitar el bloqueo`}
                    onClick={() => onOff(c, o)}>
                    <span aria-hidden="true">{reason}</span>
                  </button>
                );
              })}
              {c.day.appointments.map((a) => {
                const b = blockBox(a, range.startMin, PX);
                const pending = pendingId === a.id;
                const quick = wide && onNoShow && a.actions.includes('no_show') && !pending;
                const ns = a.noShows ?? 0;
                /* SPEC-56: etiqueta de la seña ("Seña pendiente", "Seña $X ✓"…). */
                const dep = depositTag(a.deposit, a.status);
                return (
                  <div key={a.id} className="pro-block-wrap" style={{ top: b.top, height: b.height }}>
                    <button type="button" className={`pro-block pro-block--${pending ? 'no_asistio' : a.status}${a.location.kind === 'home' ? ' is-home' : ''}${b.height < 40 ? ' is-short' : ''}`}
                      data-appt={a.id} aria-label={`${localTime(a.startsAt)} ${a.customer.name}, ${a.service.name}, ${pending ? 'marcando que no vino' : a.statusLabel}${ns ? `, ${ns} ${ns === 1 ? 'inasistencia anterior' : 'inasistencias anteriores'}` : ''}${dep ? `, ${dep}` : ''}`}
                      onClick={() => onAppt(c, cols.find((x) => x.key === c.key)?.day.appointments.find((x) => x.id === a.id) ?? a)}>
                      <strong>{a.customer.name}{ns > 0 && <em className="pro-ns" data-noshows={ns}>{ns} no vino</em>}</strong>
                      <span>{localTime(a.startsAt)} · {pending ? 'Marcando que no vino…' : a.status === 'no_asistio' ? 'No asistió' : a.service.name}</span>
                      {dep && <span className="pro-block__dep" data-deposit-tag="">{dep}</span>}
                    </button>
                    {quick && <button type="button" className="pro-quick" data-quick-noshow={a.id} onClick={() => onNoShow!(c, a)}>El cliente no vino</button>}
                  </div>
                );
              })}
              {c.isToday && nowMin >= range.startMin && nowMin <= range.endMin && (
                <div className="pro-grid__now" style={{ top: (nowMin - range.startMin) * PX }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
