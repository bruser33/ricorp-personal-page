import { useState, type FormEvent } from 'react';
import { ApiError } from '../agenda/api';
import { Notice, Spinner } from '../agenda/components/ui';
import { useLoad } from '../admin/hooks';
import { points, type Redemption } from './api';
import { costLabel, normalizeCode, shortDate } from './util';
import './points.css';

// "Canjes por entregar" (SPEC-57 §7): la misma lista en el panel del admin y en el del barbero. Búsqueda por código,
// [Marcar entregado] y [Anular] con motivo obligatorio (devuelve los puntos y repone el stock en el server).
export default function RedemptionDesk({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const list = useLoad(() => points.redemptions(active ? { q: active } : { status: 'pendiente_retiro' }), `desk|${active}`);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = headingLevel === 1 ? 'h1' : 'h2';

  function search(e: FormEvent) {
    e.preventDefault();
    setFlash(null);
    const q = query.trim();
    if (q && !normalizeCode(q)) { setFlash({ tone: 'error', text: 'No encontramos ese código. Revisa que tenga 6 letras o números (por ejemplo WS-7KQ4M9).' }); return; }
    setActive(q);
  }

  function replace(r: Redemption) {
    list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === r.id ? r : x)) } : d));
  }

  async function deliver(r: Redemption) {
    setBusy(r.id);
    setFlash(null);
    try {
      const out = await points.deliver(r.id);
      replace(out.redemption);
      setFlash({ tone: 'ok', text: `${r.code} entregado: ${r.product.name}.` });
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No pudimos marcarlo' });
      list.reload();
    } finally {
      setBusy(null);
    }
  }

  async function cancel(r: Redemption) {
    if (!reason.trim()) { setReasonErr('Escribe el motivo.'); return; }
    setBusy(r.id);
    setFlash(null);
    try {
      const out = await points.cancel(r.id, reason.trim());
      replace(out.redemption);
      setCancelling(null);
      setReason('');
      setFlash({ tone: 'ok', text: `${r.code} anulado. Le devolvimos ${costLabel(r.product.costPoints).toLowerCase()} a ${r.customer?.name ?? 'el cliente'}.` });
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No pudimos anularlo' });
      list.reload();
    } finally {
      setBusy(null);
    }
  }

  const items = list.data?.items ?? [];
  return (
    <section className="pts-desk" aria-labelledby="pts-desk-title" data-section="redemption-desk">
      <H className={headingLevel === 1 ? 'ag-h1' : 'ag-h2'} id="pts-desk-title">Canjes por entregar</H>
      <form className="pts-search" onSubmit={search} role="search">
        <div className="ag-field">
          <label htmlFor="pts-code-q">Buscar por código</label>
          <input id="pts-code-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="WS-7KQ4M9" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </div>
        <button className="btn btn--primary">Buscar</button>
        {active && <button type="button" className="btn btn--ghost" onClick={() => { setActive(''); setQuery(''); setFlash(null); }}>Ver todos</button>}
      </form>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {list.error && !list.data ? <Notice tone="error">{list.error.message} <button type="button" className="ag-link" onClick={list.reload}>Reintentar</button></Notice>
        : !list.data ? <Spinner label="Cargando canjes…" />
        : items.length === 0 ? <p className="ag-muted" data-empty="">{active ? 'No encontramos ese código.' : 'No hay canjes por entregar.'}</p>
        : (
          <ul className="pts-redemptions" data-list="desk">
            {items.map((r) => (
              <li key={r.id} className="pts-redemption" data-redemption={r.code} data-status={r.status}>
                <div className="pts-redemption__top">
                  <span className="pts-code__value">{r.code}</span>
                  <span className={`ag-pill ag-pill--${r.status === 'pendiente_retiro' ? 'wait' : r.status === 'entregado' ? 'ok' : 'off'}`}>{r.statusLabel}</span>
                </div>
                <p className="pts-redemption__meta"><strong>{r.product.name}</strong> · {costLabel(r.product.costPoints)}</p>
                <p className="pts-redemption__meta">{r.customer?.name}{r.customer?.email ? ` · ${r.customer.email}` : ''}{r.customer?.deleted ? ' (cuenta eliminada)' : ''} · canjeado el {shortDate(r.createdAt)}</p>
                {r.status === 'entregado' && <p className="pts-redemption__meta">Entregado el {shortDate(r.deliveredAt)}</p>}
                {r.status === 'anulado' && <p className="pts-redemption__meta">Anulado el {shortDate(r.cancelledAt)}{r.cancelReason ? ` — ${r.cancelReason}` : ''}</p>}
                {r.status === 'pendiente_retiro' && (cancelling === r.id ? (
                  <form className="adm-reason" onSubmit={(e) => { e.preventDefault(); cancel(r); }}>
                    <div className={`ag-field${reasonErr ? ' has-error' : ''}`}>
                      <label htmlFor={`pts-reason-${r.id}`}>Motivo de la anulación</label>
                      <input id={`pts-reason-${r.id}`} value={reason} maxLength={300} placeholder="Ej.: Sin stock físico" autoFocus
                        onChange={(e) => { setReason(e.target.value); setReasonErr(null); }} aria-invalid={reasonErr ? true : undefined} aria-describedby={reasonErr ? `pts-reason-${r.id}-err` : undefined} />
                      {reasonErr && <p className="ag-field__error" id={`pts-reason-${r.id}-err`} role="alert">{reasonErr}</p>}
                    </div>
                    <div className="ag-actions ag-actions--wrap">
                      <button className="btn btn--primary" disabled={busy === r.id}>{busy === r.id ? 'Anulando…' : 'Anular y devolver puntos'}</button>
                      <button type="button" className="btn btn--ghost" onClick={() => { setCancelling(null); setReason(''); setReasonErr(null); }}>Volver</button>
                    </div>
                  </form>
                ) : (
                  <div className="ag-actions ag-actions--wrap">
                    <button type="button" className="btn btn--primary" disabled={busy === r.id} onClick={() => deliver(r)}>{busy === r.id ? 'Guardando…' : 'Marcar entregado'}</button>
                    <button type="button" className="btn btn--ghost" onClick={() => { setCancelling(r.id); setReason(''); setReasonErr(null); }}>Anular</button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
