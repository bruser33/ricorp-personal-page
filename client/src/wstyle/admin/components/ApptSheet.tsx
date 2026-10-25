import { useEffect, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice, StatusPill } from '../../agenda/components/ui';
import { clp, dayMonthTime, localDate, localTime, prettyPhone } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { admin, type AdminAppointment } from '../api';
import { PAYMENT_STATUS_LABEL } from '../util';
import { ReasonForm } from './common';

type Mode = null | 'cancel' | 'reject' | 'propose' | 'reassign' | 'finish';

const BY: Record<string, string> = { client: 'Cliente', barber: 'Barbero', admin: 'WS Style', system: 'Sistema' };

// Ficha de una cita para el super admin (RN-03): todo lo que hay que saber + las acciones que permite la máquina de
// estados de SPEC-32 (el server las revalida). Reasignar ofrece solo barberos aprobados, que hacen el servicio y están
// libres a esa hora (CB-04).
export default function ApptSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (a: AdminAppointment) => void }) {
  const [appt, setAppt] = useState<AdminAppointment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const [target, setTarget] = useState('');
  const [when, setWhen] = useState('');
  const [collected, setCollected] = useState(true);
  const [minWhen] = useState(() => `${localDate(Date.now())}T${localTime(Date.now())}`);

  useEffect(() => {
    let alive = true;
    admin.appointment(id).then((a) => { if (alive) setAppt(a); }, (e) => { if (alive) setErr(e instanceof ApiError ? e.message : 'No pudimos cargar la cita'); });
    return () => { alive = false; };
  }, [id]);

  async function run(fn: () => Promise<AdminAppointment>) {
    setBusy(true);
    setErr(null);
    try {
      const a = await fn();
      setAppt(a);
      setMode(null);
      onChanged(a);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Algo salió mal');
    } finally {
      setBusy(false);
    }
  }

  async function openReassign() {
    setMode('reassign');
    setOptions(null);
    setTarget('');
    try {
      const r = await admin.reassignOptions(id);
      setOptions(r.options);
      setTarget(r.options[0]?.id ?? '');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No pudimos cargar los barberos libres');
      setOptions([]);
    }
  }

  if (!appt) return <Sheet title="Cita" onClose={onClose}>{err ? <Notice tone="error">{err}</Notice> : <p className="ag-loading" role="status"><span className="ag-spinner" aria-hidden="true" />Cargando…</p>}</Sheet>;
  const has = (a: string) => appt.actions.includes(a as never);
  const pay = appt.payment ?? { method: 'local', status: 'pendiente' };

  return (
    <Sheet title="Cita" onClose={onClose} wide>
      <div className="adm-appt" data-appt={appt.id}>
        <p className="adm-appt__status"><StatusPill status={appt.status} label={appt.statusLabel} /> <span className="ag-muted">{appt.source === 'admin' ? 'Agendada por WS Style' : appt.source === 'pro_invite' ? 'Invitación del barbero' : 'Reserva web'}</span></p>
        <dl className="adm-dl">
          <dt>Cuándo</dt><dd>{appt.when}</dd>
          <dt>Servicio</dt><dd>{appt.service.name} · {appt.service.durationMin} min</dd>
          <dt>Barbero</dt><dd>{appt.professional.name}</dd>
          <dt>Cliente</dt>
          <dd>
            {appt.customer.name}
            {appt.customer.phone && <> · <a href={`tel:${appt.customer.phone}`}>{prettyPhone(appt.customer.phone)}</a></>}
            {appt.customer.email && <> · <a href={`mailto:${appt.customer.email}`}>{appt.customer.email}</a></>}
          </dd>
          <dt>Lugar</dt><dd>{appt.location.kind === 'home' ? `A domicilio: ${appt.location.address ?? ''}${appt.location.distanceKm != null ? ` (${appt.location.distanceKm} km)` : ''}` : 'En el local'}</dd>
          <dt>Total</dt><dd>{clp.format(appt.pricing.totalCLP)}{appt.pricing.surchargeCLP ? ` (incluye ${clp.format(appt.pricing.surchargeCLP)} de domicilio)` : ''}{appt.pricing.platformFeeCLP ? ` · comisión ${clp.format(appt.pricing.platformFeeCLP)}` : ''}</dd>
          <dt>Pago</dt><dd>{pay.method === 'local' ? 'En el local' : 'En línea'} · {PAYMENT_STATUS_LABEL[pay.status] ?? pay.status}</dd>
          {appt.note && <><dt>Nota</dt><dd>{appt.note}</dd></>}
          {appt.proposal && <><dt>Propuesta</dt><dd>{appt.proposal.when}</dd></>}
        </dl>

        {err && <Notice tone="error">{err}</Notice>}

        {mode === null && (
          <div className="ag-actions ag-actions--wrap adm-appt__actions">
            {has('confirm') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(() => admin.act(id, 'confirm'))}>Confirmar</button>}
            {appt.canReassign && <button type="button" className="btn btn--ghost" disabled={busy} onClick={openReassign}>Reasignar barbero</button>}
            {has('propose') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setMode('propose'); setWhen(''); }}>Proponer cambio</button>}
            {has('start') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => run(() => admin.act(id, 'start'))}>Iniciar</button>}
            {has('finish') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setMode('finish')}>Terminar</button>}
            {has('no_show') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => run(() => admin.act(id, 'no_show'))}>Marcar inasistencia</button>}
            {appt.canCollect && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => run(() => admin.collect(id))}>Marcar cobrado en el local</button>}
            {has('reject') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setMode('reject')}>Rechazar</button>}
            {has('cancel') && <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setMode('cancel')}>Cancelar cita</button>}
          </div>
        )}

        {(mode === 'cancel' || mode === 'reject') && (
          <ReasonForm label={mode === 'cancel' ? 'Motivo de la cancelación (se le envía al cliente)' : 'Motivo del rechazo (se le envía al cliente)'} cta={mode === 'cancel' ? 'Cancelar la cita' : 'Rechazar la cita'}
            danger busy={busy} onCancel={() => setMode(null)}
            onSubmit={(reason) => run(() => admin.act(id, mode, { reason }))} />
        )}

        {mode === 'propose' && (
          <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); if (when) run(() => admin.act(id, 'propose', { startsAt: new Date(when).toISOString() })); }}>
            <div className="ag-field">
              <label htmlFor="adm-when">Nueva hora (se le propone al cliente)</label>
              <input id="adm-when" type="datetime-local" step={900} value={when} onChange={(e) => setWhen(e.target.value)} required
                min={minWhen} />
            </div>
            <div className="ag-actions ag-actions--wrap">
              <button type="submit" className="btn btn--primary" disabled={busy || !when}>Enviar propuesta</button>
              <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Volver</button>
            </div>
          </form>
        )}

        {mode === 'finish' && (
          <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); run(() => admin.act(id, 'finish', pay.method === 'local' ? { collected } : {})); }}>
            {pay.method === 'local' && (
              <label className="pro-check"><input type="checkbox" checked={collected} onChange={(e) => setCollected(e.target.checked)} /> <span>Se cobró en el local</span></label>
            )}
            <div className="ag-actions ag-actions--wrap">
              <button type="submit" className="btn btn--primary" disabled={busy}>Terminar la cita</button>
              <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Volver</button>
            </div>
          </form>
        )}

        {mode === 'reassign' && (
          <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); if (target) run(() => admin.reassign(id, target)); }}>
            {options === null ? <p className="ag-loading" role="status"><span className="ag-spinner" aria-hidden="true" />Buscando barberos libres…</p>
              : options.length === 0 ? <Notice>No hay otro barbero aprobado que haga {appt.service.name} y esté libre el {dayMonthTime(appt.startsAt)}. Puedes proponer otra hora o cancelar.</Notice>
              : (
                <div className="ag-field">
                  <label htmlFor="adm-target">Reasignar a (libres a esa hora y que hacen {appt.service.name})</label>
                  <select id="adm-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <p className="ag-field__hint">Se le avisa al cliente; la hora y el precio no cambian.</p>
                </div>
              )}
            <div className="ag-actions ag-actions--wrap">
              {!!options?.length && <button type="submit" className="btn btn--primary" disabled={busy || !target}>Reasignar</button>}
              <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Volver</button>
            </div>
          </form>
        )}

        <details className="adm-history">
          <summary>Historial ({appt.history.length})</summary>
          <ol>
            {appt.history.map((h, i) => (
              <li key={i}><span className="ag-muted">{dayMonthTime(h.at)}</span> · {BY[h.by] ?? h.by}: {h.from ? `${h.from} → ` : ''}{h.to}{h.reason ? ` — ${h.reason}` : ''}</li>
            ))}
          </ol>
        </details>
      </div>
    </Sheet>
  );
}
