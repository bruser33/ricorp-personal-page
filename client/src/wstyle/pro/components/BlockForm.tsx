import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { localDate, localTime } from '../../agenda/util';
import type { ProAppointment } from '../api';
import type { BookingAdapter } from '../booking';
import { nextHalfHour } from '../util';

const REASONS = ['Almuerzo', 'Médico', 'Trámite', 'Otro'] as const;
const DURATIONS: { key: string; label: string; min: number | null }[] = [
  { key: '30', label: '30 min', min: 30 },
  { key: '60', label: '1 h', min: 60 },
  { key: '120', label: '2 h', min: 120 },
  { key: 'rest', label: 'Resto del día', min: null },
];
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const LAST = 23 * 60 + 45; // último bloque de 15 min del día
// Desde la cabecera: la próxima media hora si es de ese mismo día; si no (otro día o pasada la medianoche), 13:00.
function defaultFrom(date: string, startsAt: string | null) {
  if (startsAt) return localTime(startsAt);
  const next = nextHalfHour(Date.now());
  return localDate(next) === date ? localTime(next) : '13:00';
}

// SPEC-55 bloqueos rápidos: motivo (Almuerzo · Médico · Trámite · Otro) + desde + duración (o "Hasta" a mano).
// Crea una ausencia (TimeOff) con el mismo endpoint de Perfil → Ausencias y su validación de conflicto (409).
export default function BlockForm({ date, startsAt, adapter, onDone, onClose }: {
  date: string;
  startsAt: string | null;
  adapter: BookingAdapter;
  onDone: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [other, setOther] = useState('');
  const [from, setFrom] = useState(() => defaultFrom(date, startsAt));
  const [dur, setDur] = useState<string | null>('60');
  const [to, setTo] = useState(() => toTime(Math.min(toMin(defaultFrom(date, startsAt)) + 60, LAST)));
  const [err, setErr] = useState<string | null>(null);
  const [clash, setClash] = useState<ProAppointment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function pickDur(d: (typeof DURATIONS)[number]) {
    setDur(d.key);
    if (d.min) setTo(toTime(Math.min(toMin(from) + d.min, LAST)));
  }
  function changeFrom(v: string) {
    setFrom(v);
    const d = DURATIONS.find((x) => x.key === dur);
    if (v && d?.min) setTo(toTime(Math.min(toMin(v) + d.min, LAST)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setClash(null);
    if (!reason) { setErr('Elige un motivo.'); return; }
    if (!from) { setErr('Indica desde qué hora.'); return; }
    const rest = dur === 'rest';
    if (!rest && (!to || toMin(to) <= toMin(from))) { setErr('"Hasta" tiene que ser después de "Desde".'); return; }
    setBusy(true);
    try {
      const text = reason === 'Otro' ? (other.trim() ? `Otro: ${other.trim()}` : 'Otro') : reason;
      const r = await adapter.addTimeOff({ fromDate: date, fromTime: from, ...(rest ? { restOfDay: true } : { toDate: date, toTime: to }), reason: text.slice(0, 80), quick: true });
      const range = `de ${localTime(r.timeOff.startsAt)} a ${localTime(r.timeOff.endsAt)}`;
      setDone(adapter.who === 'admin' ? `Listo: ${range} no le pueden reservar${adapter.barberName ? ` a ${adapter.barberName}` : ''}` : `Listo: ${range} no te pueden reservar`);
      onDone();
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === 'time_off_conflict') {
        setErr(e2.message);
        setClash((e2.data.appointments as ProAppointment[]) ?? []);
      } else setErr(e2 instanceof ApiError && e2.status ? e2.message : 'No pudimos conectar con la agenda. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <Notice tone="ok">{done}</Notice>
        <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Listo</button></div>
      </>
    );
  }

  return (
    <form className="pro-block-form" onSubmit={submit} noValidate>
      <fieldset className="ag-options">
        <legend>Motivo</legend>
        <div className="ag-times">
          {REASONS.map((r) => <button key={r} type="button" className={`ag-chip${reason === r ? ' is-selected' : ''}`} aria-pressed={reason === r} onClick={() => { setReason(r); setErr(null); }}>{r}</button>)}
        </div>
      </fieldset>
      {reason === 'Otro' && (
        <div className="ag-field">
          <label htmlFor="pro-block-other">¿Cuál? (opcional)</label>
          <input id="pro-block-other" maxLength={73} value={other} onChange={(e) => setOther(e.target.value)} />
        </div>
      )}
      <div className="pro-block-form__times">
        <div className="ag-field"><label htmlFor="pro-block-from">Desde</label><input id="pro-block-from" type="time" step={900} value={from} onChange={(e) => changeFrom(e.target.value)} /></div>
        <div className="ag-field"><label htmlFor="pro-block-to">Hasta</label><input id="pro-block-to" type="time" step={900} value={dur === 'rest' ? '' : to} disabled={dur === 'rest'} placeholder="Cierre"
          onChange={(e) => { setTo(e.target.value); setDur(null); }} /></div>
      </div>
      <fieldset className="ag-options">
        <legend>Duración</legend>
        <div className="ag-times">
          {DURATIONS.map((d) => <button key={d.key} type="button" className={`ag-chip${dur === d.key ? ' is-selected' : ''}`} aria-pressed={dur === d.key} onClick={() => pickDur(d)}>{d.label}</button>)}
        </div>
      </fieldset>
      {err && <Notice tone="error">{err}</Notice>}
      {clash && clash.length > 0 && (
        <ul className="pro-clash" aria-label="Citas en conflicto">
          {clash.map((a) => <li key={a.id}>{localTime(a.startsAt)} · {a.customer?.name} · {a.service.name}</li>)}
        </ul>
      )}
      <button className="btn btn--primary ag-wide" disabled={busy}>{busy ? 'Bloqueando…' : 'Bloquear'}</button>
    </form>
  );
}
