import { useState } from 'react';
import type { Slot, WaitPref } from '../api';
import { longDay } from '../util';
import { joinWaitlist, PREF_LABEL, PREFS, type JoinResult } from '../waitlist';
import { TimeChips } from './Calendar';
import { Notice } from './ui';

interface Props {
  date: string;
  service: { id: string; name: string };
  professional: { id: string; name: string };   // id 'any' = Cualquiera
  canAny: boolean;                               // hay más de un barbero para este servicio
  onPickSlot: (slot: Slot, professionalId: string) => void;
  onSessionExpired?: () => void;
}

// SPEC-54 §2: día lleno → en vez de las horas, la tarjeta para anotarse en la lista de espera de ese día.
export default function WaitlistCard({ date, service, professional, canAny, onPickSlot, onSessionExpired }: Props) {
  const [pref, setPref] = useState<WaitPref>('all');
  const [any, setAny] = useState(professional.id === 'any');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [picked, setPicked] = useState<string | undefined>();
  const proId = any ? 'any' : professional.id;

  async function submit() {
    if (busy) return;
    setBusy(true);
    const r = await joinWaitlist({ date, serviceId: service.id, professionalId: proId, pref });
    setBusy(false);
    if (r.kind === 'error' && r.status === 401) onSessionExpired?.();
    setResult(r);
  }

  return (
    <WaitlistCardView date={date} serviceName={service.name} proName={any ? 'Cualquiera' : professional.name} canAny={canAny && !any}
      pref={pref} onPref={setPref} onAny={() => { setAny(true); setResult(null); }} busy={busy} result={result} onSubmit={submit}
      picked={picked} onPickSlot={(s) => { setPicked(s.startsAt); onPickSlot(s, proId); }} />
  );
}

interface ViewProps {
  date: string;
  serviceName: string;
  proName: string;
  canAny: boolean;
  pref: WaitPref;
  onPref: (p: WaitPref) => void;
  onAny: () => void;
  busy: boolean;
  result: JoinResult | null;
  onSubmit: () => void;
  picked?: string;
  onPickSlot: (s: Slot) => void;
}

// Parte visual (sin estado propio): se prueba con render estático.
export function WaitlistCardView({ date, serviceName, proName, canAny, pref, onPref, onAny, busy, result, onSubmit, picked, onPickSlot }: ViewProps) {
  const day = longDay(date);
  if (result?.kind === 'done') {
    return (
      <div className="ag-wait" data-waitlist="done">
        <Notice tone="ok">Listo, estás en la lista de espera del {day}. Si se libera una hora te avisamos. Si no te escribimos, ese día no hubo lugar.</Notice>
        <a className="ag-link" href="/wstyle/cuenta/mis-citas/">Ver en Mis citas</a>
      </div>
    );
  }
  if (result?.kind === 'slots') {
    return (
      <div className="ag-wait" data-waitlist="slots">
        <Notice tone="ok">Se acaba de liberar una hora. Elígela para reservar.</Notice>
        <TimeChips slots={result.slots} selected={picked} onSelect={onPickSlot} label={`Horas libres del ${day}`} />
      </div>
    );
  }
  return (
    <div className="ag-wait" data-waitlist="form">
      <p>No quedan horas libres este día. ¿Te anotamos en la lista de espera? Si se libera una hora te avisamos por correo (y por WhatsApp si lo activaste). Ojo: no es una reserva.</p>
      <dl className="ag-breakdown ag-wait__what">
        <div><dt>Servicio</dt><dd>{serviceName}</dd></div>
        <div>
          <dt>Barbero</dt>
          <dd>{proName}{canAny && <> · <button type="button" className="ag-link" onClick={onAny}>Cambiar a Cualquiera</button></>}</dd>
        </div>
      </dl>
      <fieldset className="ag-options ag-wait__pref">
        <legend>Me sirve</legend>
        {PREFS.map((p) => (
          <label key={p} className={`ag-option ag-radio${pref === p ? ' is-selected' : ''}`}>
            <input type="radio" name="wait-pref" value={p} checked={pref === p} onChange={() => onPref(p)} />
            <span className="ag-option__name">{PREF_LABEL[p]}</span>
          </label>
        ))}
      </fieldset>
      {result?.kind === 'error' && <Notice tone="error">{result.message}</Notice>}
      <button type="button" className="btn btn--primary" disabled={busy} aria-busy={busy} onClick={onSubmit} data-waitlist-join="">
        {busy ? 'Anotando…' : 'Anotarme'}
      </button>
    </div>
  );
}
