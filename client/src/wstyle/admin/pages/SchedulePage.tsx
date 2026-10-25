import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice, StatusPill } from '../../agenda/components/ui';
import { longDay } from '../../agenda/util';
import { admin, type AdminAppointment, type Closure, type Schedule, type WeekDay } from '../api';
import ApptSheet from '../components/ApptSheet';
import { Loaded } from '../components/common';
import { useLoad, useToday } from '../hooks';
import { WEEKDAY_NAMES, weekProblems } from '../util';

// Horario y cierres (RN-05): horario semanal (cerrado o uno o más rangos por día) y cierres puntuales con motivo.
// Reducir el horario o cerrar días con citas activas → el server responde 409 con la lista y acá se resuelven.
export default function SchedulePage() {
  const sched = useLoad(() => admin.schedule(), 'schedule');
  return (
    <>
      <h1 className="ag-h1">Horario</h1>
      <Loaded state={sched} label="Cargando el horario…">
        {(s) => <ScheduleEditor schedule={s} onSaved={(n) => sched.setData(n)} />}
      </Loaded>
    </>
  );
}

function ScheduleEditor({ schedule, onSaved }: { schedule: Schedule; onSaved: (s: Schedule) => void }) {
  const [week, setWeek] = useState<WeekDay[]>(schedule.week);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<AdminAppointment[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const problems = weekProblems(week);
  const dirty = JSON.stringify(week) !== JSON.stringify(schedule.week);

  const setDay = (wd: number, fn: (d: WeekDay) => WeekDay) => setWeek((w) => w.map((d) => (d.weekday === wd ? fn(d) : d)));

  async function save() {
    if (Object.keys(problems).length) return;
    setBusy(true);
    setMsg(null);
    setConflicts(null);
    try {
      const s = await admin.setHours(week);
      onSaved(s);
      setWeek(s.week);
      setMsg({ tone: 'ok', text: 'Horario guardado. La reserva ya usa el horario nuevo.' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'schedule_conflict') setConflicts((e.data.appointments as AdminAppointment[]) ?? []);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="adm-section" aria-labelledby="adm-week">
        <h2 className="ag-h3" id="adm-week">Horario semanal del local</h2>
        <ul className="adm-week">
          {week.map((d) => {
            const closed = d.ranges.length === 0;
            return (
              <li key={d.weekday} className={`adm-week__day${problems[d.weekday] ? ' has-error' : ''}`} data-weekday={d.weekday}>
                <span className="adm-week__name">{WEEKDAY_NAMES[d.weekday]}</span>
                <label className="pro-check adm-week__closed">
                  <input type="checkbox" checked={closed} onChange={(e) => setDay(d.weekday, (x) => ({ ...x, ranges: e.target.checked ? [] : [{ opens: '10:00', closes: '20:00' }] }))} />
                  <span>Cerrado</span>
                </label>
                <div className="adm-week__ranges">
                  {d.ranges.map((r, i) => (
                    <span key={i} className="adm-range">
                      <input type="time" step={900} aria-label={`${WEEKDAY_NAMES[d.weekday]}: abre`} value={r.opens} onChange={(e) => setDay(d.weekday, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, opens: e.target.value } : y)) }))} />
                      <span aria-hidden="true">a</span>
                      <input type="time" step={900} aria-label={`${WEEKDAY_NAMES[d.weekday]}: cierra`} value={r.closes} onChange={(e) => setDay(d.weekday, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, closes: e.target.value } : y)) }))} />
                      {d.ranges.length > 1 && <button type="button" className="pro-icon-btn adm-range__x" aria-label="Quitar este rango" onClick={() => setDay(d.weekday, (x) => ({ ...x, ranges: x.ranges.filter((_, j) => j !== i) }))}>×</button>}
                    </span>
                  ))}
                  {!closed && d.ranges.length < 3 && (
                    <button type="button" className="ag-link" onClick={() => setDay(d.weekday, (x) => ({ ...x, ranges: [...x.ranges, { opens: x.ranges.at(-1)?.closes ?? '15:00', closes: '20:00' }] }))}>+ Otro rango</button>
                  )}
                  {problems[d.weekday] && <p className="ag-field__error" role="alert">{problems[d.weekday]}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {conflicts && <ConflictList items={conflicts} onOpen={setOpen} />}
        <div className="ag-actions ag-actions--wrap">
          <button type="button" className="btn btn--primary" disabled={busy || !dirty || Object.keys(problems).length > 0} onClick={save}>{busy ? 'Guardando…' : 'Guardar horario'}</button>
          {dirty && <button type="button" className="btn btn--ghost" onClick={() => { setWeek(schedule.week); setConflicts(null); setMsg(null); }}>Descartar cambios</button>}
        </div>
      </section>
      <Closures closures={schedule.closures} onChanged={onSaved} onOpen={setOpen} />
      {open && <ApptSheet id={open} onClose={() => setOpen(null)} onChanged={() => {}} />}
    </>
  );
}

function ConflictList({ items, onOpen }: { items: AdminAppointment[]; onOpen: (id: string) => void }) {
  return (
    <div className="adm-conflicts" role="alert">
      <p><strong>Resuelve estas citas antes de guardar</strong> (reasígnalas, propone otra hora o cancélalas):</p>
      <ul className="adm-rows">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" className="adm-row" onClick={() => onOpen(a.id)}>
              <span className="adm-row__main"><span className="adm-row__title">{a.when}</span><span className="adm-row__meta">{a.customer.name} · {a.service.name} · {a.professional.name}</span></span>
              <span className="adm-row__side"><StatusPill status={a.status} label={a.statusLabel} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Closures({ closures, onChanged, onOpen }: { closures: Closure[]; onChanged: (s: Schedule) => void; onOpen: (id: string) => void }) {
  const today = useToday();
  const [fromDate, setFrom] = useState(today);
  const [toDate, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<AdminAppointment[] | null>(null);

  // Días seguidos con el mismo motivo se muestran como un solo cierre.
  const groups: { ids: string[]; from: string; to: string; reason: string; groupId: string | null }[] = [];
  for (const c of closures) {
    const g = groups.at(-1);
    if (g && c.groupId && g.groupId === c.groupId) { g.ids.push(c.id); g.to = c.date; }
    else groups.push({ ids: [c.id], from: c.date, to: c.date, reason: c.reason, groupId: c.groupId });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setMsg({ tone: 'error', text: 'Escribe el motivo del cierre.' }); return; }
    setBusy(true);
    setMsg(null);
    setConflicts(null);
    try {
      const s = await admin.addClosure({ fromDate, toDate: toDate < fromDate ? fromDate : toDate, reason: reason.trim() });
      onChanged(s);
      setReason('');
      setMsg({ tone: 'ok', text: 'Cierre agregado: esos días quedan sin horas en la reserva.' });
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === 'closure_conflict') setConflicts((e2.data.appointments as AdminAppointment[]) ?? []);
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: string[]) {
    try {
      let s: Schedule | null = null;
      for (const id of ids) s = await admin.removeClosure(id);
      if (s) onChanged(s);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo' });
    }
  }

  return (
    <section className="adm-section" aria-labelledby="adm-closures">
      <h2 className="ag-h3" id="adm-closures">Cierres (feriados, mantención)</h2>
      <form className="adm-form adm-closure-form" onSubmit={add} noValidate>
        <div className="adm-form__grid">
          <div className="ag-field"><label htmlFor="c-from">Desde</label><input id="c-from" type="date" min={today} value={fromDate} onChange={(e) => { setFrom(e.target.value); if (toDate < e.target.value) setTo(e.target.value); }} /></div>
          <div className="ag-field"><label htmlFor="c-to">Hasta</label><input id="c-to" type="date" min={fromDate} value={toDate} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ag-field adm-closure-form__reason"><label htmlFor="c-reason">Motivo</label><input id="c-reason" value={reason} maxLength={80} placeholder="Fiestas Patrias" onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Agregar cierre'}</button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {conflicts && <ConflictList items={conflicts} onOpen={onOpen} />}
      {groups.length === 0 ? <p className="ag-muted">No hay cierres programados.</p> : (
        <ul className="adm-rows" data-list="closures">
          {groups.map((g) => (
            <li key={g.ids[0]}>
              <div className="adm-row">
                <span className="adm-row__main"><span className="adm-row__title">{g.reason || 'Cierre'}</span><span className="adm-row__meta">{g.from === g.to ? longDay(g.from) : `${longDay(g.from)} a ${longDay(g.to)}`}</span></span>
                <span className="adm-row__side"><button type="button" className="ag-link adm-danger-link" onClick={() => remove(g.ids)}>Quitar</button></span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
