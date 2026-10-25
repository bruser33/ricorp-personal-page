import { useState } from 'react';
import { Notice, Spinner } from '../../agenda/components/ui';
import { longDay } from '../../agenda/util';
import type { Invitation, ProAppointment } from '../api';
import ApptCard, { type SheetMode } from '../components/ApptCard';
import ApptSheet from '../components/ApptSheet';
import InviteSheet from '../components/InviteSheet';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';
import { useAgendaRange } from '../useAgenda';

const HIDDEN = ['cancelada', 'expirada'];

// /wstyle/pro/ — "Hola <nombre>, Agenda para hoy" (flujo principal 1): tarjetas por hora; sin citas, el aviso y "+".
export default function TodayPage({ ctx }: { ctx: ProCtx }) {
  const { me, setMe } = ctx;
  const { data, error, reload, replace } = useAgendaRange(null, null);
  const [sheet, setSheet] = useState<{ appt: ProAppointment; mode: SheetMode } | null>(null);
  const [invite, setInvite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const now = data ? Date.parse(data.now) : 0;
  const today = data?.days[0];
  const list = (today?.appointments ?? []).filter((a) => !HIDDEN.includes(a.status));
  const first = (me?.professional.displayName ?? '').split(' ')[0];

  async function openById(id: string) {
    const found = data?.days.flatMap((d) => d.appointments).find((a) => a.id === id);
    if (found) return setSheet({ appt: found, mode: 'detail' });
    location.href = `/wstyle/pro/agenda/?cita=${encodeURIComponent(id)}`;
  }

  return (
    <ProShell tab="hoy" operative unread={me?.unread ?? 0} onUnreadChange={(n) => me && setMe({ ...me, unread: n })} onOpenAppointment={openById}>
      <header className="pro-hello">
        <p className="pro-hello__hi">Hola {first},</p>
        <h1 className="ag-h1">Agenda para hoy</h1>
        {data && <p className="pro-hello__date">{longDay(data.today)}</p>}
      </header>
      {toast && <Notice tone="ok">{toast}</Notice>}
      {error && <Notice tone="error">{error} <button type="button" className="ag-link" onClick={reload}>Reintentar</button></Notice>}
      {!data && !error && <Spinner label="Cargando tus citas…" />}
      {data && !list.length && (
        <div className="pro-empty">
          <p>Parece que aún no tienes citas para hoy</p>
          <button type="button" className="pro-fab pro-fab--inline" aria-label="Invitar cita" onClick={() => setInvite(true)}>+</button>
        </div>
      )}
      {data && list.length > 0 && (
        <div className="pro-today">
          {list.map((a) => (
            <ApptCard key={a.id} appt={a} now={now} onChange={replace} reload={reload} onOpen={(appt, mode = 'detail') => setSheet({ appt, mode })} />
          ))}
        </div>
      )}
      {data && list.length > 0 && <button type="button" className="pro-fab" aria-label="Invitar cita" onClick={() => setInvite(true)}>+</button>}

      {sheet && data && (
        <ApptSheet appt={sheet.appt} mode={sheet.mode} today={data.today} onChange={replace} reload={reload} onClose={() => { setSheet(null); reload(); }} />
      )}
      {invite && data && (
        <InviteSheet services={data.services} homeService={data.professional.homeService} date={data.today} today={data.today}
          onClose={() => { setInvite(false); reload(); }}
          onCreated={(inv: Invitation) => setToast(`Invitación para ${inv.appointment.customer.name} creada.`)} />
      )}
    </ProShell>
  );
}
