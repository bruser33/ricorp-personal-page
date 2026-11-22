import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice, Spinner } from '../../agenda/components/ui';
import { dayMonthTime } from '../../agenda/util';
import { admin, type MessageStatus, type WaMessage } from '../api';
import { Loaded, Pill } from '../components/common';
import { useLoad } from '../hooks';

const STATUS_FILTERS: [string, string][] = [
  ['', 'Todos'], ['por_salir', 'Por salir'], ['entregado', 'Entregados'], ['leido', 'Leídos'], ['enviado', 'Enviados'],
  ['fallido', 'No salió'], ['frenado', 'Frenados'], ['no_aplica', 'Ya no aplica'], ['simulado', 'Simulados'],
];
const KIND_FILTERS: [string, string][] = [['', 'Todos los tipos'], ['confirmation', 'Confirmación'], ['reminder', 'Recordatorio']];
const TONE: Record<MessageStatus, 'ok' | 'wait' | 'warn' | 'off'> = {
  por_salir: 'wait', enviando: 'wait', enviado: 'ok', entregado: 'ok', leido: 'ok', simulado: 'off', fallido: 'warn', frenado: 'off', no_aplica: 'off',
};

// SPEC-53: "Mensajes" — los WhatsApp a los clientes, uno por uno: por salir, enviados y los que no salieron. Joe puede
// frenar uno antes de que salga ([No mandarlo]) o reintentar uno que falló por un problema de Meta.
export default function MessagesPage() {
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useLoad(() => admin.messages({ status, kind, q: q.trim(), page: String(page) }), `${status}|${kind}|${q.trim()}|${page}`);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function run(fn: () => Promise<WaMessage>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo. Inténtalo de nuevo.' });
    }
    await list.reload();
  }

  return (
    <>
      <h1 className="ag-h1">Mensajes</h1>
      <p className="adm-lead">Avisos por WhatsApp a los clientes con opt-in: la confirmación de su hora y el recordatorio. El correo sigue saliendo igual. <a href="/wstyle/admin/configuracion/#cfg-wa">Configurar</a></p>
      <Loaded state={list} label="Cargando los mensajes…">
        {(d) => (
          <>
            {d.channel.mode !== 'live' && <Notice tone={d.channel.mode === 'dry-run' ? 'info' : 'error'}>{d.channel.label}.</Notice>}
            <ul className="adm-cards adm-wa-kpis" aria-label="Resumen de mensajes">
              <li><span className="adm-card" data-kpi="pending"><span className="adm-card__n">{d.kpis.pending}</span><span className="adm-card__l">Por salir</span></span></li>
              <li><span className="adm-card" data-kpi="delivered"><span className="adm-card__n">{d.kpis.delivered7d}</span><span className="adm-card__l">Entregados en 7 días</span></span></li>
              <li><span className="adm-card" data-kpi="failed"><span className="adm-card__n">{d.kpis.failed7d}</span><span className="adm-card__l">No salieron en 7 días</span></span></li>
              <li><span className="adm-card" data-kpi="next"><span className="adm-card__n adm-card__n--sm">{d.kpis.nextSendAt ? dayMonthTime(d.kpis.nextSendAt) : '—'}</span><span className="adm-card__l">Próximo envío</span></span></li>
              <li><span className="adm-card adm-card--wide" data-kpi="month"><span className="adm-card__n adm-card__n--sm">{d.kpis.monthSent} enviados este mes</span><span className="adm-card__l">Meta cobra cada plantilla entregada (ref. ≈ US$0,02 c/u)</span></span></li>
            </ul>
          </>
        )}
      </Loaded>

      <section className="adm-section" aria-labelledby="wa-list">
        <h2 className="ag-h3" id="wa-list">Uno por uno</h2>
        <form className="adm-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filtros de mensajes">
          <div className="adm-tabs" role="group" aria-label="Estado">
            {STATUS_FILTERS.map(([k, l]) => <button key={k || 'all'} type="button" className={`ag-chip${status === k ? ' is-selected' : ''}`} aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>)}
          </div>
          <div className="adm-filters__grid">
            <div className="ag-field">
              <label htmlFor="wa-kind">Tipo</label>
              <select id="wa-kind" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>{KIND_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <div className="ag-field">
              <label htmlFor="wa-q">Cliente</label>
              <input id="wa-q" type="search" placeholder="Nombre o celular" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          </div>
        </form>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {list.data && (list.data.items.length === 0 ? (
          <div className="pro-empty"><p>{status || kind || q ? 'No hay mensajes con estos filtros.' : 'Aún no hay mensajes. Aparecen cuando un cliente con WhatsApp activado tiene su hora confirmada.'}</p></div>
        ) : (
          <>
            <ul className="adm-rows adm-wa-list" data-list="messages">
              {list.data.items.map((m) => (
                <li key={m.id} className="adm-wa" data-msg={m.id} data-status={m.status}>
                  <div className="adm-wa__head">
                    <span className="adm-wa__kind">{m.kindLabel}</span>
                    <Pill tone={TONE[m.status]}>{m.statusLabel}</Pill>
                  </div>
                  <p className="adm-row__title">{m.customer} <span className="adm-row__meta">{m.phone}</span></p>
                  <p className="adm-row__meta">{m.service} · {m.professional} · cita el {dayMonthTime(m.apptStartsAt)}</p>
                  <p className="adm-row__meta" data-when="">{whenLabel(m)}</p>
                  {(m.error || m.reason) && <p className="adm-wa__why">{m.status === 'fallido' ? `No salió · ${m.error ?? ''}` : m.error ? `Último intento: ${m.error}` : m.reason}</p>}
                  <div className="adm-row__btns">
                    <button type="button" className="ag-link" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? 'Ocultar mensaje' : 'Ver mensaje'}</button>
                    {m.canStop && <button type="button" className="ag-link" onClick={() => run(() => admin.stopMessage(m.id), `Listo: no se mandará el ${m.kindLabel.toLowerCase()} de ${m.customer}.`)}>No mandarlo</button>}
                    {m.canRetry && <button type="button" className="ag-link" onClick={() => run(() => admin.retryMessage(m.id), 'Listo: vuelve a la cola y sale en el próximo minuto.')}>Reintentar</button>}
                  </div>
                  {open === m.id && <MessageDetail id={m.id} />}
                </li>
              ))}
            </ul>
            {list.data.pages > 1 && (
              <nav className="adm-pager" aria-label="Páginas">
                <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <span>Página {list.data.page} de {list.data.pages}</span>
                <button type="button" className="btn btn--ghost" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
              </nav>
            )}
          </>
        ))}
      </section>
    </>
  );
}

function whenLabel(m: WaMessage) {
  if (m.readAt) return `Salió el ${dayMonthTime(m.sentAt ?? m.readAt)} · leído el ${dayMonthTime(m.readAt)}`;
  if (m.deliveredAt) return `Salió el ${dayMonthTime(m.sentAt ?? m.deliveredAt)} · entregado el ${dayMonthTime(m.deliveredAt)}`;
  if (m.sentAt) return `${m.status === 'simulado' ? 'Simulado' : 'Salió'} el ${dayMonthTime(m.sentAt)}`;
  if (m.status === 'por_salir' || m.status === 'enviando') return `Sale el ${dayMonthTime(m.sendAt)}`;
  return `Iba a salir el ${dayMonthTime(m.sendAt)}`;
}

// Texto final tal como lo ve (o lo verá) el cliente.
function MessageDetail({ id }: { id: string }) {
  const d = useLoad(() => admin.message(id), id);
  if (d.error) return <p className="ag-field__error" role="alert">{d.error.message}</p>;
  if (!d.data) return <Spinner label="Cargando el mensaje…" />;
  return (
    <div className="adm-wa__detail">
      <p className="ag-muted">{d.data.preview ? 'Vista previa con los datos de hoy (el texto final se arma al salir):' : 'Texto enviado:'} <code>{d.data.template}</code></p>
      <WaBubble text={d.data.text ?? ''} />
    </div>
  );
}

// Burbuja de WhatsApp: cuerpo, botón "[Ver o cancelar mi cita]" y pie.
export function WaBubble({ text }: { text: string }) {
  const [body, button, foot] = text.split('\n\n');
  const label = button?.match(/^\[(.+?)\]/)?.[1];
  return (
    <div className="adm-wa-bubble" data-bubble="">
      <p>{body}</p>
      {foot && <p className="adm-wa-bubble__foot">{foot}</p>}
      {label && <span className="adm-wa-bubble__btn" title={button.replace(/^\[.+?\]\s*/, '')}>{label}</span>}
    </div>
  );
}
