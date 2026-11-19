import { useEffect, useState } from 'react';
import { Notice, Spinner } from '../../agenda/components/ui';
import { addDays, localDate, longDay } from '../../agenda/util';
import { pro, type ProAppointment, type TimeOff } from '../api';
import AgendaGrid, { type GridCol } from '../components/AgendaGrid';
import type { SheetMode } from '../components/ApptCard';
import ApptSheet from '../components/ApptSheet';
import InviteSheet, { type SheetTab } from '../components/InviteSheet';
import ProShell from '../components/ProShell';
import OffSheet from '../components/OffSheet';
import type { ProCtx } from '../ctx';
import { scheduleNoShow, usePendingNoShow } from '../undo';
import { useAgendaRange } from '../useAgenda';
import { useMobile } from '../useMobile';
import { shortDay, visibleDays, type AgendaView } from '../util';

// /wstyle/pro/agenda/ — vista día / semana (en móvil, 3 días que se deslizan): bloques por cliente en su hora, línea
// de "ahora", tocar una cita → detalle con Mover / Cancelar; tocar un hueco → Invitar cita con esa hora (RN-13).
export default function AgendaPage({ ctx }: { ctx: ProCtx }) {
  const { me, setMe } = ctx;
  const mobile = useMobile();
  const [clientToday] = useState(() => localDate(Date.now()));
  const [anchor, setAnchor] = useState(clientToday);
  const [pick, setPick] = useState<AgendaView | null>(null);
  const view: AgendaView = pick === 'day' ? 'day' : mobile ? '3days' : 'week';
  const dates = visibleDays(anchor, view);
  const { data, error, reload, replace } = useAgendaRange(dates[0], dates.at(-1)!);
  const [sheet, setSheet] = useState<{ appt: ProAppointment; mode: SheetMode } | null>(null);
  const [invite, setInvite] = useState<{ date: string; startsAt: string | null; gap?: number; tab: SheetTab } | null>(null);
  const [off, setOff] = useState<TimeOff | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState(() => new URLSearchParams(location.search).get('cita'));
  const pending = usePendingNoShow();

  const now = data ? Date.parse(data.now) : 0;
  const today = data?.today ?? clientToday;
  const cols: GridCol[] = (data?.days ?? []).map((d) => ({
    key: d.date, date: d.date, label: shortDay(d.date), ariaLabel: longDay(d.date), isToday: d.date === today, day: d, offs: data?.timeOffs ?? [],
  }));

  // SPEC-55: "El cliente no vino" de un toque; la petición sale a los 8 s si no se deshace.
  function markNoShow(a: ProAppointment) {
    setFlash(null);
    scheduleNoShow<ProAppointment>({
      id: a.id, name: a.customer.name, path: `/api/pro/appointments/${encodeURIComponent(a.id)}/no-show`,
      onDone: (x) => { replace(x); reload(); },
      onError: (m) => { setFlash(m); reload(); },
    });
  }

  // ?cita=<id> (desde una notificación): abre su detalle una vez cargada la agenda.
  useEffect(() => {
    if (!openId || !data) return;
    const a = data.days.flatMap((d) => d.appointments).find((x) => x.id === openId);
    Promise.resolve().then(() => { if (a) setSheet({ appt: a, mode: 'detail' }); setOpenId(null); });
  }, [openId, data]);

  const step = view === 'week' ? 7 : 1;
  const move = (n: number) => setAnchor((d) => addDays(d, n * step));
  const label = view === 'day' ? longDay(dates[0]) : `${shortDay(dates[0])} – ${shortDay(dates.at(-1)!)}`;

  return (
    <ProShell tab="agenda" operative unread={me?.unread ?? 0} onUnreadChange={(n) => me && setMe({ ...me, unread: n })}
      onOpenAppointment={(id) => { const a = data?.days.flatMap((d) => d.appointments).find((x) => x.id === id); if (a) setSheet({ appt: a, mode: 'detail' }); }}>
      <div className="pro-agenda-head">
        <h1 className="ag-h1">Agenda</h1>
        <div className="pro-views" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'day'} onClick={() => setPick('day')}>Día</button>
          <button type="button" aria-pressed={view !== 'day'} onClick={() => setPick(null)}>{mobile ? '3 días' : 'Semana'}</button>
        </div>
      </div>
      <div className="pro-agenda-nav">
        <button type="button" className="ag-cal__nav" aria-label="Anterior" onClick={() => move(-1)}>‹</button>
        <p className="pro-agenda-nav__label" aria-live="polite">{label}</p>
        <button type="button" className="ag-cal__nav" aria-label="Siguiente" onClick={() => move(1)}>›</button>
        <button type="button" className="btn btn--ghost pro-today-btn" onClick={() => setAnchor(today)}>Hoy</button>
        <button type="button" className="btn btn--primary pro-invite-btn" onClick={() => setInvite({ date: dates[0] < today ? today : dates[0], startsAt: null, tab: 'book' })}>+ Invitar cita</button>
        <button type="button" className="btn btn--ghost pro-block-btn" onClick={() => setInvite({ date: dates[0] < today ? today : dates[0], startsAt: null, tab: 'block' })}>Bloquear</button>
      </div>
      {error && <Notice tone="error">{error} <button type="button" className="ag-link" onClick={reload}>Reintentar</button></Notice>}
      {!data && !error && <Spinner label="Cargando tu agenda…" />}
      {flash && <Notice tone="error">{flash}</Notice>}
      {data && (
        <AgendaGrid cols={cols} now={now} wide={view === 'day'} pendingId={pending?.id ?? null} onSwipe={move}
          onFree={(c, startsAt, gap) => setInvite({ date: c.date, startsAt, gap, tab: 'book' })}
          onAppt={(_c, a) => setSheet({ appt: a, mode: 'detail' })}
          onOff={(_c, o) => setOff(o)}
          onNoShow={(_c, a) => markNoShow(a)} />
      )}
      <ul className="pro-legend" aria-label="Colores">
        <li><i className="pro-block--pendiente" />Por confirmar</li>
        <li><i className="pro-block--confirmada" />Confirmada</li>
        <li><i className="pro-block--invitacion_enviada" />Invitación enviada</li>
        <li><i className="pro-block--propuesta_cambio" />Esperando al cliente</li>
        <li><i className="pro-block--en_curso" />En curso</li>
        <li><i className="pro-block--terminada" />Terminada</li>
        <li><i className="pro-off" />Bloqueado</li>
      </ul>

      {sheet && <ApptSheet appt={sheet.appt} mode={sheet.mode} today={today} onChange={replace} reload={reload} onClose={() => { setSheet(null); reload(); }} />}
      {invite && data && (
        <InviteSheet services={data.services} homeService={data.professional.homeService} date={invite.date} startsAt={invite.startsAt} today={today}
          tab={invite.tab} gapMin={invite.gap ?? 0} onClose={() => { setInvite(null); reload(); }} onCreated={() => {}} onBlocked={reload} />
      )}
      {off && <OffSheet off={off} remove={() => pro.removeTimeOff(off.id)} onClose={() => setOff(null)} onRemoved={() => { setOff(null); reload(); }} />}
    </ProShell>
  );
}
