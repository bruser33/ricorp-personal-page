import { useState, type FormEvent } from 'react';
import { MotoIcon, Notice, StatusPill } from '../../agenda/components/ui';
import { clp, localDate, localTime, longDay, prettyPhone } from '../../agenda/util';
import type { ProAppointment } from '../api';
import { useProActions } from '../useActions';
import { CANCEL_REASONS } from '../util';
import type { SheetMode } from './ApptCard';
import CopyLink from './CopyLink';
import Sheet from './Sheet';
import SlotPicker from './SlotPicker';

// Detalle de una cita + Mover / Cancelar (RN-08, RN-09). Mover no la cambia: crea una propuesta al cliente (salvo
// una invitación aún no aceptada, que se reprograma y se reenvía). Todo con botones: no hace falta arrastrar.
export default function ApptSheet({ appt: initial, mode: initialMode = 'detail', today, onClose, onChange, reload }: {
  appt: ProAppointment;
  mode?: SheetMode;
  today: string;
  onClose: () => void;
  onChange: (a: ProAppointment) => void;
  reload: () => void;
}) {
  const [appt, setAppt] = useState(initial);
  const [mode, setMode] = useState<SheetMode>(initialMode);
  const [date, setDate] = useState(localDate(initial.startsAt));
  const [pick, setPick] = useState<{ startsAt: string; label: string } | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [resent, setResent] = useState<{ whatsappUrl: string | null; inviteUrl: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const update = (a: ProAppointment) => { setAppt(a); onChange(a); };
  const { busy, msg, setMsg, run } = useProActions(update, () => { reload(); setReloadKey((k) => k + 1); });
  const can = (a: string) => appt.actions.includes(a);
  const home = appt.location.kind === 'home';
  const isInvite = appt.status === 'invitacion_enviada';
  const canMove = can('propose') || can('reschedule');
  const canCancel = can('cancel');

  async function move() {
    if (!pick) return;
    const r = await run(appt.id, isInvite ? 'reschedule' : 'propose', { startsAt: pick.startsAt }, isInvite ? 'Invitación movida. Reenvíala por WhatsApp.' : `Propusimos a ${appt.customer.name} mover la cita. Queda esperando su respuesta.`);
    if (r) {
      if (isInvite && r.inviteUrl) setResent({ whatsappUrl: r.whatsappUrl ?? null, inviteUrl: r.inviteUrl });
      setPick(null);
      setMode('detail');
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault();
    if (!reasonCode) return setReasonErr('Elige un motivo.');
    if (reasonCode === 'otro' && !reasonText.trim()) return setReasonErr('Cuéntanos el motivo.');
    setReasonErr(null);
    const r = await run(appt.id, mode === 'reject' ? 'reject' : 'cancel', { reasonCode, reasonText }, mode === 'reject' ? 'Cita rechazada. Le avisamos al cliente por correo.' : 'Cita cancelada. Le avisamos al cliente por correo.');
    if (r) setMode('detail');
  }

  const title = mode === 'move' ? (isInvite ? 'Mover invitación' : 'Proponer otra hora') : mode === 'cancel' ? 'Cancelar cita' : mode === 'reject' ? 'Rechazar cita' : 'Cita';
  return (
    <Sheet title={title} onClose={onClose}>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {mode === 'detail' && (
        <div className="pro-detail">
          <p className="pro-detail__status"><StatusPill status={appt.status} label={appt.status === 'propuesta_cambio' ? 'Esperando respuesta del cliente' : appt.statusLabel} /></p>
          <p className="ag-appt__when">{longDay(localDate(appt.startsAt))}, {localTime(appt.startsAt)}–{localTime(appt.endsAt)}</p>
          {appt.proposal && <p className="ag-muted">Propuesta: {appt.proposal.when}</p>}
          <dl className="ag-breakdown">
            <div><dt>Cliente</dt><dd>{appt.customer.name}</dd></div>
            {appt.customer.phone && <div><dt>Celular</dt><dd>{prettyPhone(appt.customer.phone)}</dd></div>}
            <div><dt>Servicio</dt><dd>{appt.service.name} · {appt.service.durationMin} min</dd></div>
            <div><dt>Lugar</dt><dd>{home ? <><MotoIcon /> {appt.location.address}{appt.location.distanceKm !== undefined && ` · ${appt.location.distanceKm.toLocaleString('es-CL')} km`}</> : 'En el local'}</dd></div>
            {appt.note && <div><dt>Nota</dt><dd>{appt.note}</dd></div>}
            <div><dt>Pago</dt><dd>{appt.payment.method === 'local' ? 'En el local (efectivo)' : 'En línea'}{appt.payment.status === 'pago_pendiente' ? ' · pendiente' : appt.payment.status === 'cobrado' ? ' · cobrado' : ''}</dd></div>
            <div className="ag-breakdown__total"><dt>Total</dt><dd>{clp.format(appt.pricing.totalCLP)}</dd></div>
          </dl>
          <div className="pro-card__contact">
            {home && appt.mapsUrl && <a className="pro-chip" href={appt.mapsUrl} target="_blank" rel="noopener">Cómo llegar</a>}
            {appt.telUrl && <a className="pro-chip" href={appt.telUrl}>Llamar</a>}
            {appt.whatsapp && <a className="pro-chip" href={appt.whatsapp} target="_blank" rel="noopener">WhatsApp</a>}
          </div>
          {(resent || (isInvite && appt.invite)) && (
            <div className="pro-invite-links">
              {(resent?.whatsappUrl ?? appt.invite?.whatsappUrl) && <a className="btn btn--primary" href={(resent?.whatsappUrl ?? appt.invite?.whatsappUrl)!} target="_blank" rel="noopener">Enviar por WhatsApp</a>}
              <CopyLink url={resent?.inviteUrl ?? appt.invite!.url} />
            </div>
          )}
          <div className="ag-actions">
            {canMove && <button type="button" className="btn btn--ghost" onClick={() => { setMsg(null); setMode('move'); }}>Mover</button>}
            {can('reject') && <button type="button" className="btn btn--ghost" onClick={() => { setMsg(null); setMode('reject'); }}>Rechazar</button>}
            {canCancel && !can('reject') && <button type="button" className="btn btn--ghost" onClick={() => { setMsg(null); setMode('cancel'); }}>Cancelar cita</button>}
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div>
          <p className="ag-muted">{isInvite ? 'La invitación aún no fue aceptada: se mueve directo y se reenvía el link.' : `${appt.customer.name} tiene que aceptar el cambio; mientras tanto la cita sigue en su hora.`}</p>
          <SlotPicker date={date} onDate={(d) => { setDate(d); setPick(null); }} value={pick?.startsAt ?? null} onPick={(startsAt, label) => setPick({ startsAt, label })}
            appointment={appt.id} minDate={today} reloadKey={reloadKey} />
          {pick && (
            <div className="ag-confirm" role="group" aria-label="Confirmar cambio">
              <p>{isInvite ? `¿Mover la invitación de ${appt.customer.name} a las ${pick.label}?` : `¿Deseas proponer a ${appt.customer.name} mover la cita a las ${pick.label}?`}</p>
              <div className="ag-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setPick(null)}>Volver</button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={move}>{isInvite ? 'Mover y reenviar' : 'Proponer'}</button>
              </div>
            </div>
          )}
          {!pick && <p><button type="button" className="ag-link" onClick={() => setMode('detail')}>Volver al detalle</button></p>}
        </div>
      )}

      {(mode === 'cancel' || mode === 'reject') && (
        <form onSubmit={cancel} noValidate>
          <p className="ag-muted">Le avisamos a {appt.customer.name} por correo con el motivo y tu WhatsApp.</p>
          <fieldset className="ag-options">
            <legend>Motivo</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r.code} className={`ag-option ag-radio${reasonCode === r.code ? ' is-selected' : ''}`}>
                <input type="radio" name="reason" value={r.code} checked={reasonCode === r.code} onChange={() => { setReasonCode(r.code); setReasonErr(null); }} />
                <span>{r.label}</span>
              </label>
            ))}
          </fieldset>
          {reasonCode === 'otro' && (
            <div className="ag-field">
              <label htmlFor="pro-reason-text">Cuéntale al cliente qué pasó</label>
              <textarea id="pro-reason-text" rows={2} maxLength={300} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </div>
          )}
          {reasonErr && <p className="ag-field__error" role="alert">{reasonErr}</p>}
          <div className="ag-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setMode('detail')}>Volver</button>
            <button className="btn btn--primary" disabled={busy}>{mode === 'reject' ? 'Rechazar' : 'Cancelar cita'}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
