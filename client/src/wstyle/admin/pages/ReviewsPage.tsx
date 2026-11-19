import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { dayMonthTime } from '../../agenda/util';
import { reviewDate, starsLabel, starsText } from '../../reviews';
import { admin, type AdminReview } from '../api';
import { Loaded, Pill } from '../components/common';
import { useLoad } from '../hooks';

const TABS: [string, string][] = [['', 'Todas'], ['visible', 'Visibles'], ['hidden', 'Ocultas']];
const RATINGS: [string, string][] = [['', 'Todas las estrellas'], ['5', '5 estrellas'], ['4', '4 estrellas'], ['3', '3 estrellas'], ['2', '2 estrellas'], ['1', '1 estrella']];

// Reseñas (SPEC-52 RN-09): se publican solas; acá el super admin las revisa y oculta las inapropiadas (motivo opcional,
// solo interno) o las vuelve a mostrar. Cada acción queda en la auditoría. No hay borrado definitivo.
export default function ReviewsPage() {
  const params = new URLSearchParams(location.search);
  const [status, setStatus] = useState('');
  const [rating, setRating] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hiding, setHiding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const focus = params.get('id');
  const list = useLoad(() => admin.reviews({ status, rating, q: query, page }), `${status}|${rating}|${query}|${page}`);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function act(r: AdminReview, action: 'hide' | 'show', reason = '') {
    setBusy(r.id);
    setMsg(null);
    try {
      if (action === 'hide') await admin.hideReview(r.id, reason);
      else await admin.showReview(r.id);
      setHiding(null);
      setMsg({ tone: 'ok', text: action === 'hide' ? `Ocultaste la reseña de ${r.author}: ya no se ve en el inicio.` : `La reseña de ${r.author} vuelve a verse en el inicio.` });
      await list.reload();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo guardar. Inténtalo de nuevo.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="ag-h1">Reseñas</h1>
      <p className="adm-lead">Se publican al instante en el inicio. Si una no corresponde, ocúltala: deja de verse y de contar en el promedio.</p>
      <div className="adm-toolbar">
        <div className="adm-tabs" role="tablist" aria-label="Estado">
          {TABS.map(([k, l]) => (
            <button key={k || 'all'} type="button" role="tab" aria-selected={status === k} className={`ag-chip${status === k ? ' is-selected' : ''}`} onClick={() => { setStatus(k); setPage(1); }}>
              {l}{k && list.data ? ` (${list.data.counts[k as 'visible' | 'hidden']})` : ''}
            </button>
          ))}
        </div>
        <div className="ag-field adm-search">
          <label htmlFor="adm-rv-stars" className="ag-sr">Estrellas</label>
          <select id="adm-rv-stars" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }}>
            {RATINGS.map(([k, l]) => <option key={k || 'all'} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="ag-field adm-search">
          <label htmlFor="adm-rv-q" className="ag-sr">Buscar reseña</label>
          <input id="adm-rv-q" type="search" placeholder="Buscar por cliente o texto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Loaded state={list} label="Cargando reseñas…">
        {(d) => d.items.length === 0 ? (
          <div className="pro-empty"><p>{query || rating || status ? 'No hay reseñas con esos filtros.' : 'Aún no hay reseñas. Llegan cuando un cliente atendido la deja desde su cuenta.'}</p></div>
        ) : (
          <>
            <ul className="adm-reviews" data-list="reviews">
              {d.items.map((r) => (
                <li key={r.id} className={`adm-review${r.status === 'hidden' ? ' is-hidden' : ''}${focus === r.id ? ' is-focus' : ''}`} data-review={r.id}>
                  <div className="adm-review__head">
                    <span className="adm-review__stars" aria-label={starsLabel(r.rating)}><span aria-hidden="true">{starsText(r.rating)}</span></span>
                    {r.status === 'hidden' ? <Pill tone="off">Oculta</Pill> : <Pill tone="ok">Visible</Pill>}
                  </div>
                  <p className="adm-review__text">“{r.comment}”</p>
                  <p className="adm-review__meta">
                    <strong>{r.author}</strong>{r.customer.name && r.customer.name !== r.author ? ` (${r.customer.name}${r.customer.email ? ` · ${r.customer.email}` : ''})` : ''} · {r.service}{r.professional ? ` con ${r.professional}` : ''} · {reviewDate(r.createdAt)}
                  </p>
                  {r.hidden && (
                    <p className="adm-review__hidden">
                      {r.hidden.by === 'account_deleted' ? 'Oculta porque el cliente eliminó su cuenta' : `Oculta${r.hidden.at ? ` el ${dayMonthTime(r.hidden.at)}` : ''}${r.hidden.reason ? ` · Motivo: ${r.hidden.reason}` : ''}`}
                    </p>
                  )}
                  {hiding === r.id ? (
                    <HideForm busy={busy === r.id} onCancel={() => setHiding(null)} onSubmit={(reason) => act(r, 'hide', reason)} />
                  ) : (
                    <div className="ag-actions ag-actions--wrap">
                      {r.status === 'visible' && <button type="button" className="btn btn--ghost" disabled={busy === r.id} onClick={() => { setMsg(null); setHiding(r.id); }}>Ocultar</button>}
                      {r.status === 'hidden' && r.hidden?.by !== 'account_deleted' && <button type="button" className="btn btn--ghost" disabled={busy === r.id} onClick={() => act(r, 'show')}>Mostrar</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {d.pages > 1 && (
              <nav className="adm-pager" aria-label="Páginas">
                <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <span>Página {d.page} de {d.pages}</span>
                <button type="button" className="btn btn--ghost" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
              </nav>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}

// Ocultar: el motivo es opcional y solo lo ve el panel (nunca el cliente ni la landing).
function HideForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(reason.trim()); };
  return (
    <form className="adm-reason" onSubmit={submit}>
      <div className="ag-field">
        <label htmlFor="adm-rv-reason">Motivo (opcional, solo interno)</label>
        <textarea id="adm-rv-reason" rows={2} maxLength={200} value={reason} placeholder="Ej.: lenguaje ofensivo" onChange={(e) => setReason(e.target.value)} autoFocus />
      </div>
      <div className="ag-actions ag-actions--wrap">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Ocultando…' : 'Ocultar reseña'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}
