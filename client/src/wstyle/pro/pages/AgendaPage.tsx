import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Notice, Spinner } from '../../agenda/components/ui';
import { addDays, localDate, localTime, longDay } from '../../agenda/util';
import type { AgendaDay, ProAppointment } from '../api';
import type { SheetMode } from '../components/ApptCard';
import ApptSheet from '../components/ApptSheet';
import InviteSheet from '../components/InviteSheet';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';
import { useAgendaRange } from '../useAgenda';
import { blockBox, freeCells, gridRange, minutesOfDay, shortDay, visibleDays, type AgendaView } from '../util';

const PX = 1.2; // px por minuto (72 px la hora)
const MOBILE = '(max-width: 699px)';
const HIDDEN = ['cancelada', 'expirada'];

function useMobile() {
  const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = matchMedia(MOBILE);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

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
  const [invite, setInvite] = useState<{ date: string; startsAt: string | null } | null>(null);
  const [openId, setOpenId] = useState(() => new URLSearchParams(location.search).get('cita'));
  const touch = useRef<number | null>(null);

  const days: AgendaDay[] = useMemo(() => (data?.days ?? []).map((d) => ({ ...d, appointments: d.appointments.filter((a) => !HIDDEN.includes(a.status)) })), [data]);
  const range = gridRange(days.length ? days : [{ date: anchor, shop: null, windows: [], appointments: [] }]);
  const height = (range.endMin - range.startMin) * PX;
  const now = data ? Date.parse(data.now) : 0;
  const today = data?.today ?? clientToday;

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
        <button type="button" className="btn btn--primary pro-invite-btn" onClick={() => setInvite({ date: dates[0] < today ? today : dates[0], startsAt: null })}>+ Invitar cita</button>
      </div>
      {error && <Notice tone="error">{error} <button type="button" className="ag-link" onClick={reload}>Reintentar</button></Notice>}
      {!data && !error && <Spinner label="Cargando tu agenda…" />}
      {data && (
        <div className="pro-grid" style={{ '--cols': dates.length } as CSSProperties}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
          }}>
          <div className="pro-grid__head">
            <span />
            {days.map((d) => (
              <span key={d.date} className={`pro-grid__day${d.date === today ? ' is-today' : ''}`}>{shortDay(d.date)}{!d.shop && <small>Cerrado</small>}</span>
            ))}
          </div>
          <div className="pro-grid__body" style={{ height }}>
            <div className="pro-grid__hours" aria-hidden="true">
              {Array.from({ length: (range.endMin - range.startMin) / 60 + 1 }, (_, i) => (
                <span key={i} style={{ top: i * 60 * PX }}>{String((range.startMin / 60 + i) % 24).padStart(2, '0')}:00</span>
              ))}
            </div>
            {days.map((d) => {
              const cells = freeCells(d, now);
              const items = [
                ...cells.map((c) => ({ kind: 'free' as const, at: c.startsAt, c })),
                ...d.appointments.map((a) => ({ kind: 'appt' as const, at: a.startsAt, a })),
              ].sort((x, y) => x.at.localeCompare(y.at));
              return (
                <div key={d.date} className="pro-grid__col" role="group" aria-label={longDay(d.date)}>
                  {d.windows.map((w) => {
                    const b = blockBox(w, range.startMin, PX);
                    return <div key={w.startsAt} className="pro-grid__window" style={{ top: b.top, height: b.height }} aria-hidden="true" />;
                  })}
                  {items.map((it) => {
                    if (it.kind === 'free') {
                      const top = (minutesOfDay(it.c.startsAt) - range.startMin) * PX;
                      return (
                        <button key={'f' + it.at} type="button" className="pro-grid__free" style={{ top, height: 30 * PX }}
                          aria-label={`Agendar cita el ${longDay(d.date)} a las ${it.c.label}`} onClick={() => setInvite({ date: d.date, startsAt: it.c.startsAt })}>
                          <span aria-hidden="true">+ {it.c.label}</span>
                        </button>
                      );
                    }
                    const a = it.a;
                    const b = blockBox(a, range.startMin, PX);
                    return (
                      <button key={a.id} type="button" className={`pro-block pro-block--${a.status}${a.location.kind === 'home' ? ' is-home' : ''}${b.height < 40 ? ' is-short' : ''}`} style={{ top: b.top, height: b.height }}
                        data-appt={a.id} aria-label={`${localTime(a.startsAt)} ${a.customer.name}, ${a.service.name}, ${a.statusLabel}`}
                        onClick={() => setSheet({ appt: a, mode: 'detail' })}>
                        <strong>{a.customer.name}</strong>
                        <span>{localTime(a.startsAt)} · {a.service.name}</span>
                      </button>
                    );
                  })}
                  {d.date === today && (() => {
                    const m = minutesOfDay(new Date(now).toISOString());
                    if (m < range.startMin || m > range.endMin) return null;
                    return <div className="pro-grid__now" style={{ top: (m - range.startMin) * PX }} aria-hidden="true" />;
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ul className="pro-legend" aria-label="Colores">
        <li><i className="pro-block--pendiente" />Por confirmar</li>
        <li><i className="pro-block--confirmada" />Confirmada</li>
        <li><i className="pro-block--invitacion_enviada" />Invitación enviada</li>
        <li><i className="pro-block--propuesta_cambio" />Esperando al cliente</li>
        <li><i className="pro-block--en_curso" />En curso</li>
        <li><i className="pro-block--terminada" />Terminada</li>
      </ul>

      {sheet && <ApptSheet appt={sheet.appt} mode={sheet.mode} today={today} onChange={replace} reload={reload} onClose={() => { setSheet(null); reload(); }} />}
      {invite && data && (
        <InviteSheet services={data.services} homeService={data.professional.homeService} date={invite.date} startsAt={invite.startsAt} today={today}
          onClose={() => { setInvite(null); reload(); }} onCreated={() => {}} />
      )}
    </ProShell>
  );
}
