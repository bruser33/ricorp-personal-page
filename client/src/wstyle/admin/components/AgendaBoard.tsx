import { useMemo, useState } from 'react';
import { addDays, longDay } from '../../agenda/util';
import { Notice } from '../../agenda/components/ui';
import type { ProAppointment, TimeOff } from '../../pro/api';
import type { BookingAdapter } from '../../pro/booking';
import AgendaGrid, { type GridCol } from '../../pro/components/AgendaGrid';
import InviteSheet from '../../pro/components/InviteSheet';
import OffSheet from '../../pro/components/OffSheet';
import { scheduleNoShow, usePendingNoShow } from '../../pro/undo';
import { useMobile } from '../../pro/useMobile';
import { admin, type AdminAgenda, type AdminAppointment } from '../api';
import { useLoad, useToday } from '../hooks';
import { Loaded } from './common';
import ApptSheet from './ApptSheet';

type Barber = AdminAgenda['barbers'][number];
const NO_HOME = { enabled: false, surchargeCLP: 0, radiusKm: 0, travelBufferMin: 0 };

// Lo que cambia cuando reserva / bloquea el super admin sobre la agenda de un barbero (SPEC-55 RN-06).
function adapterFor(b: Barber): BookingAdapter {
  return {
    who: 'admin',
    barberName: b.name,
    search: admin.customers,
    slots: (q) => admin.barberSlots(b.id, { service: q.service, date: q.date }),
    // Reservar = "Nueva cita" del admin (queda confirmada, source 'admin') para ESE barbero.
    book: async (body) => {
      const appointment = await admin.createAppointment({ name: body.name, phone: body.phone, customerRef: body.customerRef, serviceId: body.serviceId, startsAt: body.startsAt, note: body.note, professionalId: b.id });
      return { appointment: appointment as unknown as ProAppointment, whatsappUrl: null, inviteUrl: null, message: null };
    },
    addTimeOff: (body) => admin.addBarberTimeOff(b.id, body),
  };
}

// SPEC-55 AC-09: Citas → [Agenda]: un día, una columna por barbero aprobado (misma grilla que el panel del barbero).
// En móvil (< 700 px) se ve un barbero a la vez, con chips para cambiar.
export default function AgendaBoard() {
  const today = useToday();
  const mobile = useMobile();
  const [date, setDate] = useState(today);
  const [pick, setPick] = useState<string | null>(null);
  const [free, setFree] = useState<{ barber: Barber; startsAt: string; gap: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [off, setOff] = useState<{ barber: Barber; off: TimeOff } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const state = useLoad(() => admin.agenda(date), date);
  const pending = usePendingNoShow();
  const adapters = useMemo(() => new Map((state.data?.barbers ?? []).map((b) => [b.id, adapterFor(b)])), [state.data]);

  return (
    <section className="adm-agenda" aria-label="Agenda del día">
      <div className="pro-agenda-nav">
        <button type="button" className="ag-cal__nav" aria-label="Día anterior" onClick={() => setDate((d) => addDays(d, -1))}>‹</button>
        <p className="pro-agenda-nav__label" aria-live="polite">{longDay(date)}</p>
        <button type="button" className="ag-cal__nav" aria-label="Día siguiente" onClick={() => setDate((d) => addDays(d, 1))}>›</button>
        <button type="button" className="btn btn--ghost pro-today-btn" onClick={() => setDate(today)}>Hoy</button>
      </div>
      {flash && <Notice tone="error">{flash}</Notice>}
      <Loaded state={state} label="Cargando la agenda…">
        {(d) => {
          if (!d.barbers.length) return <div className="pro-empty"><p>No hay barberos aprobados.</p></div>;
          const current = d.barbers.find((b) => b.id === pick) ?? d.barbers[0];
          const shown = mobile ? [current] : d.barbers;
          const cols: GridCol[] = shown.map((b) => ({ key: b.id, date: d.date, label: b.name, ariaLabel: `Agenda de ${b.name}`, isToday: d.date === d.today, day: b.day, offs: b.timeOffs }));
          const barberOf = (c: GridCol) => d.barbers.find((b) => b.id === c.key)!;
          return (
            <>
              {mobile && (
                <div className="adm-tabs adm-agenda__chips" role="group" aria-label="Barbero">
                  {d.barbers.map((b) => <button key={b.id} type="button" className={`ag-chip${b.id === current.id ? ' is-selected' : ''}`} aria-pressed={b.id === current.id} onClick={() => setPick(b.id)}>{b.name}</button>)}
                </div>
              )}
              <AgendaGrid cols={cols} now={Date.parse(d.now)} wide pendingId={pending?.id ?? null}
                onSwipe={mobile ? (dir) => { const i = d.barbers.indexOf(current); setPick(d.barbers[(i + dir + d.barbers.length) % d.barbers.length].id); } : undefined}
                onFree={(c, startsAt, gap) => setFree({ barber: barberOf(c), startsAt, gap })}
                onAppt={(_c, a) => setOpen(a.id)}
                onOff={(c, o) => setOff({ barber: barberOf(c), off: o })}
                onNoShow={(_c, a) => {
                  setFlash(null);
                  scheduleNoShow<AdminAppointment>({ id: a.id, name: a.customer.name, path: `/api/admin/appointments/${encodeURIComponent(a.id)}/no-show`,
                    onDone: () => { state.reload(); }, onError: (m) => { setFlash(m); state.reload(); } });
                }} />
            </>
          );
        }}
      </Loaded>
      {free && adapters.get(free.barber.id) && (
        <InviteSheet services={free.barber.services} homeService={NO_HOME} date={date} startsAt={free.startsAt} today={today} gapMin={free.gap}
          adapter={adapters.get(free.barber.id)!} onClose={() => { setFree(null); state.reload(); }} onCreated={() => {}} onBlocked={() => state.reload()} />
      )}
      {open && <ApptSheet id={open} onClose={() => { setOpen(null); state.reload(); }} onChanged={() => {}} />}
      {off && (
        <OffSheet off={off.off} remove={() => admin.removeBarberTimeOff(off.barber.id, off.off.id)} onClose={() => setOff(null)}
          onRemoved={() => { setOff(null); state.reload(); }} />
      )}
    </section>
  );
}
