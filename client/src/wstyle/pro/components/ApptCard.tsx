import { useState } from 'react';
import { MotoIcon, Notice, StatusPill } from '../../agenda/components/ui';
import { clp, localTime } from '../../agenda/util';
import type { ProAppointment } from '../api';
import { useProActions } from '../useActions';
import CopyLink from './CopyLink';

export type SheetMode = 'detail' | 'move' | 'cancel' | 'reject';

const Icon = {
  route: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M12 21s-6-5.6-6-10.5A6 6 0 0 1 18 10.5C18 15.4 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  phone: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" /></svg>,
  wa: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4 20l1.2-3.6A8 8 0 1 1 8 19z" /><path fill="currentColor" d="M9 8.5c.3-.6.6-.6.9-.6h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.6l-.4.5c-.1.1-.1.3 0 .5.5.9 1.3 1.6 2.2 2.1.2.1.4.1.5 0l.5-.5c.2-.2.4-.2.6-.1l1.4.7c.2.1.3.3.3.5v.4c0 .4-.2.8-.6 1-.5.3-1.2.4-1.9.2-2.2-.7-4-2.4-4.8-4.6-.3-.9-.2-1.7.3-2.2Z" /></svg>,
};

// Tarjeta de "Agenda para hoy" (RN-07, RN-10, RN-15): hora, cliente, servicio, estado; moto + dirección + km si es a
// domicilio; Cómo llegar / Llamar / WhatsApp; y la acción que toca según el estado.
export default function ApptCard({ appt, now, onChange, onOpen, reload }: {
  appt: ProAppointment;
  now: number;
  onChange: (a: ProAppointment) => void;
  onOpen: (a: ProAppointment, mode?: SheetMode) => void;
  reload: () => void;
}) {
  const { busy, msg, run } = useProActions(onChange, reload);
  const [askPaid, setAskPaid] = useState(false);
  const home = appt.location.kind === 'home';
  const s = appt.status;
  const can = (a: string) => appt.actions.includes(a);
  const startOpens = Date.parse(appt.startOpensAt);
  const final = ['terminada', 'cancelada', 'expirada', 'no_asistio'].includes(s);
  return (
    <article className={`pro-card pro-card--${s}${s === 'pendiente' ? ' is-highlight' : ''}`} data-appt={appt.id} aria-label={`${localTime(appt.startsAt)} ${appt.customer.name}`}>
      <div className="pro-card__time">
        <span className="pro-card__hour">{localTime(appt.startsAt)}</span>
        <span className="pro-card__end">{localTime(appt.endsAt)}</span>
      </div>
      <div className="pro-card__main">
        <div className="pro-card__top">
          <h3 className="pro-card__name">{appt.customer.name}</h3>
          <StatusPill status={s} label={s === 'propuesta_cambio' ? 'Esperando respuesta del cliente' : appt.statusLabel} />
        </div>
        <p className="pro-card__service">{appt.service.name} · {appt.service.durationMin} min · {clp.format(appt.pricing.totalCLP)}</p>
        {home ? (
          <p className="pro-card__where" data-home="">
            <MotoIcon /> <span>{appt.location.address}</span>
            {appt.location.distanceKm !== undefined && <span className="pro-card__km">{appt.location.distanceKm.toLocaleString('es-CL')} km</span>}
          </p>
        ) : (
          <p className="pro-card__where pro-card__where--shop">En el local</p>
        )}
        {appt.note && <p className="pro-card__note">“{appt.note}”</p>}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {!final && (
          <div className="pro-card__contact">
            {home && appt.mapsUrl && <a className="pro-chip" href={appt.mapsUrl} target="_blank" rel="noopener" data-maps="">{Icon.route}Cómo llegar</a>}
            {appt.telUrl && <a className="pro-chip" href={appt.telUrl} data-tel="">{Icon.phone}Llamar</a>}
            {appt.whatsapp && <a className="pro-chip" href={appt.whatsapp} target="_blank" rel="noopener">{Icon.wa}WhatsApp</a>}
          </div>
        )}

        {askPaid ? (
          <div className="pro-paid" role="group" aria-label="¿Cobraste?">
            <p>¿Cobraste {clp.format(appt.pricing.totalCLP)}?</p>
            <div className="pro-card__actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={async () => { if (await run(appt.id, 'finish', { collected: true })) setAskPaid(false); }}>Sí</button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={async () => { if (await run(appt.id, 'finish', { collected: false })) setAskPaid(false); }}>No, queda pendiente</button>
            </div>
          </div>
        ) : (
          <div className="pro-card__actions">
            {can('confirm') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(appt.id, 'confirm', {}, 'Cita confirmada. Le avisamos al cliente.')}>Confirmar</button>}
            {can('propose') && s === 'pendiente' && <button type="button" className="btn btn--ghost" onClick={() => onOpen(appt, 'move')}>Proponer otra hora</button>}
            {can('reject') && <button type="button" className="btn btn--ghost" onClick={() => onOpen(appt, 'reject')}>Rechazar</button>}
            {s === 'confirmada' && (
              <button type="button" className="btn btn--primary" disabled={busy || !can('start')} aria-describedby={can('start') ? undefined : `start-${appt.id}`}
                onClick={() => run(appt.id, 'start')}>Iniciar</button>
            )}
            {s === 'confirmada' && !can('start') && now < startOpens && <span className="pro-card__hint" id={`start-${appt.id}`}>Desde las {localTime(appt.startOpensAt)}</span>}
            {can('no_show') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => run(appt.id, 'no_show')}>No asistió</button>}
            {can('finish') && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setAskPaid(true)}>Terminar</button>}
            {s === 'invitacion_enviada' && appt.invite?.whatsappUrl && <a className="btn btn--ghost" href={appt.invite.whatsappUrl} target="_blank" rel="noopener">Reenviar por WhatsApp</a>}
            {s === 'invitacion_enviada' && appt.invite && <CopyLink url={appt.invite.url} label="Copiar link" />}
            <button type="button" className="ag-link pro-card__more" onClick={() => onOpen(appt)}>Ver detalle</button>
          </div>
        )}
      </div>
    </article>
  );
}
