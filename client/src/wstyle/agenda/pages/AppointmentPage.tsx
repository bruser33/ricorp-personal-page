import { useCallback, useEffect, useState } from 'react';
import { agenda, ApiError, type Action, type Appointment, type Slot } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import Calendar, { TimeChips } from '../components/Calendar';
import Shell from '../components/Shell';
import { Notice, Spinner, StatusPill, Unavailable } from '../components/ui';
import { addDays, clp, localDate, longDay } from '../util';

const FINAL = ['terminada', 'cancelada', 'expirada', 'no_asistio'];

// /wstyle/cita/?id=<id>: estado de la cita y sus acciones válidas (RN-12, RN-13, RN-16). Requiere sesión del dueño
// (o del barbero asignado / super admin). Otro cliente o id inexistente: "No encontramos esta cita" (CB-12).
export default function AppointmentPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const id = new URLSearchParams(location.search).get('id') ?? '';
  const inv = new URLSearchParams(location.search).get('inv');
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [counter, setCounter] = useState(false);

  const fetchAppt = useCallback(async () => {
    try {
      setAppt(await agenda.get(id, inv));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) setState('notfound');
      else if (e instanceof ApiError && e.status === 401) session.setUser(null);
      else setState('error');
    }
  }, [id, inv, session]);

  const user = session.user;
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(fetchAppt);
    return () => clearTimeout(t);
  }, [user, fetchAppt]);

  async function act(action: Action, body: Record<string, unknown> = {}, okText?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await agenda.act(id, action, body);
      setAppt(next);   // el estado cambia sin recargar (AC-16)
      setCounter(false);
      setConfirmCancel(false);
      if (okText) setMsg({ tone: 'ok', text: okText });
    } catch (e) {
      // CB-14: otra pestaña cambió la cita o la propuesta caducó → estado real + aviso.
      const text = e instanceof ApiError && e.status ? e.message : 'No pudimos conectar con la agenda. Inténtalo de nuevo.';
      setMsg({ tone: 'error', text });
      if (e instanceof ApiError && e.status === 409) await fetchAppt();
    } finally {
      setBusy(false);
    }
  }

  const here = `/wstyle/cita/?id=${encodeURIComponent(id)}${inv ? `&inv=${encodeURIComponent(inv)}` : ''}`;
  if (session.status === 'loading') return <Shell user={null} current="cita"><Spinner label="Cargando tu cita…" /></Shell>;
  if (session.status === 'offline') return <Shell user={null} current="cita"><Unavailable whatsapp={whatsapp} onRetry={() => session.refresh()} /></Shell>;
  if (!user) {
    return (
      <Shell user={null} current="cita">
        <h1 className="ag-h1">Tu cita</h1>
        <div className="ag-card ag-narrow">
          <Notice>Inicia sesión para ver tu cita.</Notice>
          <AuthPanel facebook={session.facebook} returnTo={here} fbReturn={fbReturn} onAuthed={(u) => session.setUser(u)} />
        </div>
      </Shell>
    );
  }
  if (state === 'notfound') {
    return (
      <Shell user={user} current="cita">
        <div className="ag-card ag-narrow" data-state="notfound">
          <h1 className="ag-h2">No encontramos esta cita</h1>
          <p>Puede que el link esté incompleto o que la cita sea de otra cuenta.</p>
          <div className="ag-actions ag-actions--wrap">
            <a className="btn btn--primary" href="/wstyle/cuenta/mis-citas/">Mis citas</a>
            {whatsapp && <a className="btn btn--ghost" href={whatsapp} target="_blank" rel="noopener">Escribir al local por WhatsApp</a>}
          </div>
        </div>
      </Shell>
    );
  }
  if (state === 'error') return <Shell user={user} current="cita"><Unavailable whatsapp={whatsapp} onRetry={fetchAppt} /></Shell>;
  if (!appt) return <Shell user={user} current="cita"><Spinner label="Cargando tu cita…" /></Shell>;

  const can = (a: Action) => appt.actions.includes(a);
  const isClient = appt.role === 'client';
  const open = !FINAL.includes(appt.status);
  return (
    <Shell user={user} current="cita">
      <article className="ag-card ag-appt" aria-labelledby="ag-appt-title">
        <p className="ag-appt__status"><StatusPill status={appt.status} label={appt.status === 'pendiente' ? `Esperando confirmación de ${appt.professional.name}` : appt.statusLabel} /></p>
        <h1 className="ag-h2" id="ag-appt-title">{appt.service.name} con {appt.professional.name}</h1>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {appt.proposal && appt.status === 'propuesta_cambio' ? (
          <div className="ag-proposal" data-proposal="">
            <p>{appt.professional.name} quiere mover tu cita:</p>
            <p className="ag-proposal__swap"><span className="ag-proposal__before"><small>Antes</small><s>{appt.when}</s></span><span aria-hidden="true">»</span><span className="ag-sr">ahora</span><span className="ag-proposal__after"><small>Ahora</small>{appt.proposal.when}</span></p>
          </div>
        ) : (
          <p className="ag-appt__when">{appt.when}</p>
        )}

        <dl className="ag-breakdown">
          <div><dt>Dónde</dt><dd>{appt.location.kind === 'home' ? `A domicilio · ${appt.location.address}` : `En el local · ${appt.location.address}`}</dd></div>
          <div><dt>Servicio</dt><dd>{clp.format(appt.pricing.priceCLP)}</dd></div>
          {appt.pricing.surchargeCLP > 0 && <div><dt>Domicilio</dt><dd>{clp.format(appt.pricing.surchargeCLP)}</dd></div>}
          <div className="ag-breakdown__total"><dt>Total · pago en el local</dt><dd>{clp.format(appt.pricing.totalCLP)}</dd></div>
        </dl>
        {appt.note && <p className="ag-muted">Nota: {appt.note}</p>}

        {isClient && (
          <div className="ag-actions ag-actions--wrap">
            {can('accept') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('accept', {}, 'Listo: tu cita quedó en la nueva hora.')}>Aceptar</button>}
            {can('counter') && <button type="button" className="btn btn--ghost" disabled={busy} aria-expanded={counter} onClick={() => setCounter(!counter)}>Proponer otra hora</button>}
            {can('confirm') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('confirm', {}, 'Cita confirmada.')}>Confirmar</button>}
            {can('cancel') && !confirmCancel && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancelar cita</button>}
            {!can('cancel') && open && appt.status !== 'en_curso' && appt.whatsapp && (
              <a className="btn btn--ghost" href={appt.whatsapp} target="_blank" rel="noopener">Escríbenos por WhatsApp</a>
            )}
            {can('cancel') && appt.whatsapp && <a className="btn btn--ghost" href={appt.whatsapp} target="_blank" rel="noopener">Escribir al barbero</a>}
          </div>
        )}

        {confirmCancel && (
          <div className="ag-confirm" role="group" aria-label="Confirmar cancelación">
            <label htmlFor="ag-reason">Motivo (opcional)</label>
            <input id="ag-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            <div className="ag-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmCancel(false)}>No, volver</button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('cancel', { reason }, 'Cancelaste la cita. La hora quedó libre.')}>Sí, cancelar</button>
            </div>
          </div>
        )}

        {counter && <CounterPicker appt={appt} busy={busy} onPick={(s) => act('counter', { startsAt: s.startsAt }, `Propusiste ${longDay(localDate(s.startsAt))} a las ${s.label}. ${appt.professional.name} tiene que confirmarla.`)} />}

        <p className="ag-fine"><a href="/wstyle/cuenta/mis-citas/">← Mis citas</a></p>
      </article>
    </Shell>
  );
}

// "Proponer otra hora": el mismo calendario del paso 2, con días sin cupo deshabilitados (los bloques de esta misma
// cita no cuentan como ocupados).
function CounterPicker({ appt, busy, onPick }: { appt: Appointment; busy: boolean; onPick: (s: Slot) => void }) {
  const [today] = useState(() => localDate(Date.now()));
  const lastDay = addDays(today, 30);
  const [month, setMonth] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [avail, setAvail] = useState<Map<string, Slot[]> | null>(null);
  const [day, setDay] = useState<string | undefined>();
  const [slot, setSlot] = useState<Slot | null>(null);
  useEffect(() => {
    let alive = true;
    const first = `${month.y}-${String(month.m).padStart(2, '0')}-01`;
    const last = addDays(`${month.m === 12 ? month.y + 1 : month.y}-${String((month.m % 12) + 1).padStart(2, '0')}-01`, -1);
    Promise.resolve().then(() => alive && setAvail(null));
    agenda.availability({ service: appt.service.id, professional: appt.professional.id, from: first < today ? today : first, to: last > lastDay ? lastDay : last, mode: appt.location.kind, appointment: appt.id })
      .then((r) => alive && setAvail(new Map(r.days.map((d) => [d.date, d.slots]))))
      .catch(() => alive && setAvail(new Map()));
    return () => { alive = false; };
  }, [appt, month, today, lastDay]);
  return (
    <div className="ag-counter">
      <h2 className="ag-h3">Elige otra hora</h2>
      <Calendar year={month.y} month={month.m} today={today} lastDay={lastDay} slotsByDay={avail} selected={day} onSelect={(d) => { setDay(d); setSlot(null); }} onMonth={(y, m) => setMonth({ y, m })} />
      {day && avail && <TimeChips slots={avail.get(day) ?? []} selected={slot?.startsAt} onSelect={setSlot} label={`Horas libres del ${longDay(day)}`} />}
      <div className="ag-actions"><button type="button" className="btn btn--primary" disabled={!slot || busy} onClick={() => slot && onPick(slot)}>Proponer esta hora</button></div>
    </div>
  );
}
