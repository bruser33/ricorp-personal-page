import { useState } from 'react';
import { clp, dayMonthTime, longDay } from '../../agenda/util';
import { admin } from '../api';
import { Loaded } from '../components/common';
import { useLoad } from '../hooks';

// Inicio del panel (flujo principal, paso 2): tarjetas con lo urgente, alertas fijas (CB-03) y avisos (RN-10).
export default function HomePage({ onUnread }: { onUnread: (n: number) => void }) {
  const ov = useLoad(() => admin.overview(), 'overview');
  const notes = useLoad(() => admin.notifications(), 'notes');
  const [marking, setMarking] = useState(false);

  async function markAll() {
    setMarking(true);
    try {
      await admin.markRead();
      await notes.reload();
      onUnread(0);
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <h1 className="ag-h1">Panel</h1>
      <Loaded state={ov} label="Cargando el panel…">
        {(o) => (
          <>
            <p className="adm-lead">Hoy es {longDay(o.today)}.</p>
            {o.alerts.map((a) => (
              <div key={a.professionalId} className="ag-notice ag-notice--error adm-alert" role="alert">
                <strong>{a.message}.</strong> <a href={`/wstyle/admin/barberos/?ficha=${a.professionalId}`}>Resolver citas</a>
              </div>
            ))}
            <ul className="adm-cards" aria-label="Resumen">
              <li><a className="adm-card" href="/wstyle/admin/barberos/" data-card="pending-barbers"><span className="adm-card__n">{o.cards.pendingBarbers}</span><span className="adm-card__l">Barberos por aprobar</span></a></li>
              <li><a className="adm-card" href="/wstyle/admin/citas/?rango=hoy" data-card="today"><span className="adm-card__n">{o.cards.today}</span><span className="adm-card__l">Citas de hoy</span></a></li>
              <li><a className="adm-card" href="/wstyle/admin/citas/?estado=pendiente" data-card="pending-confirm"><span className="adm-card__n">{o.cards.pendingConfirm}</span><span className="adm-card__l">Pendientes de confirmar</span></a></li>
              <li><a className="adm-card" href="/wstyle/admin/citas/?pago=reembolso_pendiente" data-card="refunds"><span className="adm-card__n">{o.cards.refundsPending}</span><span className="adm-card__l">Reembolsos pendientes</span></a></li>
              <li><a className="adm-card adm-card--wide" href="/wstyle/admin/estadisticas/" data-card="revenue"><span className="adm-card__n">{clp.format(o.cards.monthRevenueCLP)}</span><span className="adm-card__l">Ingresos del mes</span></a></li>
            </ul>
          </>
        )}
      </Loaded>
      <section className="adm-section" aria-labelledby="adm-notes">
        <div className="adm-section__head">
          <h2 className="ag-h3" id="adm-notes">Avisos</h2>
          {!!notes.data?.unread && <button type="button" className="ag-link" disabled={marking} onClick={markAll}>Marcar todo como leído</button>}
        </div>
        <Loaded state={notes} label="Cargando avisos…">
          {(n) => n.items.length === 0 ? <p className="ag-muted">Sin avisos por ahora.</p> : (
            <ul className="adm-notes">
              {n.items.slice(0, 12).map((x) => (
                <li key={x.id} className={x.read ? '' : 'is-unread'}>
                  <p className="adm-notes__t">{x.title}</p>
                  {x.body && <p className="adm-notes__b">{x.body}</p>}
                  <p className="adm-notes__d">{dayMonthTime(x.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Loaded>
      </section>
    </>
  );
}
