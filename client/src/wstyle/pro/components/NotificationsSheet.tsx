import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../../agenda/components/ui';
import { pro, type PanelNotification } from '../api';
import Sheet from './Sheet';

const when = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

// Notificaciones del panel (RN-16): no leídas destacadas; al abrir se marcan como leídas.
export default function NotificationsSheet({ onClose, onRead, onOpenAppointment }: { onClose: () => void; onRead: () => void; onOpenAppointment?: (id: string) => void }) {
  const [items, setItems] = useState<PanelNotification[] | null>(null);
  const [error, setError] = useState(false);
  const readCb = useRef(onRead);
  useEffect(() => { readCb.current = onRead; }, [onRead]);
  useEffect(() => {
    let alive = true;
    pro.notifications().then((r) => {
      if (!alive) return;
      setItems(r.items);
      if (r.unread) pro.markRead().then(() => readCb.current(), () => {});
    }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  return (
    <Sheet title="Notificaciones" onClose={onClose}>
      {error && <p className="ag-muted">No pudimos cargar las notificaciones.</p>}
      {!items && !error && <Spinner label="Cargando…" />}
      {items && !items.length && <p className="ag-muted">No tienes notificaciones.</p>}
      {items && items.length > 0 && (
        <ul className="pro-notes">
          {items.map((n) => (
            <li key={n.id} className={n.read ? '' : 'is-unread'}>
              <div>
                <strong>{n.title}</strong>
                {n.body && <span>{n.body}</span>}
                <time dateTime={n.createdAt}>{when(n.createdAt)}</time>
              </div>
              {n.appointmentId && onOpenAppointment && (
                <button type="button" className="ag-link" onClick={() => onOpenAppointment(n.appointmentId!)}>Ver cita</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
