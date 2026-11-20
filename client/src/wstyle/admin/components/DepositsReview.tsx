import { useEffect, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { clp, dayMonthTime } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { admin, fetchReceipt, type DepositRow, type DepositView } from '../api';
import { REJECT_REASONS } from '../deposit';
import { Loaded, Pill } from './common';
import { useLoad } from '../hooks';

// Pagos → "Pagos por confirmar" (SPEC-56 §6): señas con comprobante para revisar contra la cuenta, y señas por
// devolver (§9). Confirmar o rechazar queda en la auditoría (lo escribe el server).
export default function DepositsReview({ onCounts }: { onCounts?: (c: { review: number; refund: number }) => void }) {
  const [view, setView] = useState<DepositView>('review');
  const list = useLoad(() => admin.deposits(view), view);
  const [open, setOpen] = useState<DepositRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const counts = list.data?.counts;
  useEffect(() => { if (counts) onCounts?.(counts); }, [counts, onCounts]);

  const done = (text: string) => {
    setOpen(null);
    setMsg(text);
    list.reload();
  };

  return (
    <div className="adm-deposits" data-deposits="">
      <div className="adm-tabs adm-tabs--sub" role="tablist" aria-label="Señas">
        <button type="button" role="tab" aria-selected={view === 'review'} className={`ag-chip${view === 'review' ? ' is-selected' : ''}`} onClick={() => setView('review')}>Por revisar{counts ? ` (${counts.review})` : ''}</button>
        <button type="button" role="tab" aria-selected={view === 'refund'} className={`ag-chip${view === 'refund' ? ' is-selected' : ''}`} onClick={() => setView('refund')}>Por devolver{counts ? ` (${counts.refund})` : ''}</button>
        <button type="button" role="tab" aria-selected={view === 'all'} className={`ag-chip${view === 'all' ? ' is-selected' : ''}`} onClick={() => setView('all')}>Todas</button>
      </div>
      {msg && <Notice tone="ok">{msg}</Notice>}
      <Loaded state={list} label="Cargando señas…">
        {(d) => d.items.length === 0
          ? <div className="pro-empty"><p>{view === 'review' ? 'No hay señas por revisar.' : view === 'refund' ? 'No hay señas por devolver.' : 'Todavía no hay señas.'}</p></div>
          : (
            <div className="adm-table-wrap pay-table-wrap">
              <table className="adm-table pay-table" data-table="deposits">
                <thead><tr><th scope="col">Cliente</th><th scope="col">Servicio</th><th scope="col">Barbero</th><th scope="col">Cita</th><th scope="col">Monto</th><th scope="col">Referencia</th><th scope="col">{view === 'refund' ? 'Estado' : 'Subido'}</th></tr></thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.appointmentId} data-deposit={r.appointmentId} data-status={r.status}>
                      <th scope="row" data-label="Cliente"><button type="button" className="ag-link pay-open" onClick={() => { setMsg(null); setOpen(r); }}>{r.customer.name || 'Cliente'}</button></th>
                      <td data-label="Servicio">{r.service.name}</td>
                      <td data-label="Barbero">{r.professional.name}</td>
                      <td data-label="Cita">{dayMonthTime(r.startsAt)}{r.started && r.status === 'en_revision' ? <span className="adm-table__sub">Ya empezó: el barbero ve "Seña sin revisar"</span> : null}</td>
                      <td data-label="Monto" className="pay-num">{clp.format(r.amountCLP)}</td>
                      <td data-label="Referencia"><code>{r.reference}</code></td>
                      <td data-label={view === 'refund' ? 'Estado' : 'Subido'}>{view === 'review' ? (r.uploadedAt ? dayMonthTime(r.uploadedAt) : '—') : <Pill tone={r.status === 'confirmada' ? 'ok' : r.status === 'por_devolver' ? 'warn' : r.status === 'en_revision' || r.status === 'por_pagar' ? 'wait' : 'off'}>{r.statusLabel}</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Loaded>
      {open && <DepositSheet row={open} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}

function Receipt({ row }: { row: DepositRow }) {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!row.receiptAvailable) return;
    let alive = true;
    let url: string | null = null;
    fetchReceipt(row.appointmentId).then((f) => { url = f.url; if (alive) setFile(f); else URL.revokeObjectURL(f.url); }, (e) => alive && setErr(e instanceof ApiError ? e.message : 'No pudimos abrir el comprobante'));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [row.appointmentId, row.receiptAvailable]);
  if (!row.receiptAvailable) return <p className="ag-muted">Sin comprobante disponible.</p>;
  if (err) return <Notice tone="error">{err}</Notice>;
  if (!file) return <p className="ag-muted">Cargando el comprobante…</p>;
  const pdf = file.type === 'application/pdf';
  return (
    <div className="adm-receipt" data-receipt={pdf ? 'pdf' : 'image'}>
      {pdf
        ? <object data={file.url} type="application/pdf" className="adm-receipt__pdf" aria-label="Comprobante en PDF"><p>Tu navegador no muestra PDF aquí.</p></object>
        : <button type="button" className={`adm-receipt__img${zoom ? ' is-zoom' : ''}`} onClick={() => setZoom(!zoom)} aria-label={zoom ? 'Achicar el comprobante' : 'Ampliar el comprobante'}><img src={file.url} alt={`Comprobante de ${row.customer.name}`} /></button>}
      <a className="ag-link" href={file.url} download={`comprobante-${row.reference}.${pdf ? 'pdf' : 'webp'}`}>Descargar</a>
    </div>
  );
}

function DepositSheet({ row, onClose, onDone }: { row: DepositRow; onClose: () => void; onDone: (text: string) => void }) {
  const [mode, setMode] = useState<'view' | 'reject'>('view');
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = row.checklist;

  async function run(action: 'confirm' | 'reject' | 'refunded') {
    if (action === 'reject' && (!code || (code === 'otro' && !text.trim()))) { setErr(code === 'otro' ? 'Escribe el motivo.' : 'Elige el motivo del rechazo.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await admin.reviewDeposit(row.appointmentId, action, action === 'reject' ? { reasonCode: code, reasonText: text.trim() } : {});
      onDone(action === 'confirm' ? `Seña ${row.reference} confirmada. Le avisamos al cliente.` : action === 'reject' ? `Seña ${row.reference} rechazada: la hora quedó libre y le avisamos al cliente.` : `Seña ${row.reference} marcada como devuelta.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Seña ${row.reference}`} onClose={onClose} wide>
      <div className="adm-deposit-detail" data-deposit-detail={row.appointmentId}>
        <p className="adm-appt__status"><Pill tone={row.status === 'en_revision' ? 'wait' : row.status === 'confirmada' ? 'ok' : row.status === 'por_devolver' ? 'warn' : 'off'}>{row.statusLabel}</Pill></p>
        <div className="adm-deposit-detail__grid">
          <Receipt row={row} />
          <div>
            <p className="ag-deposit__label">Revisa en tu cuenta</p>
            <ul className="adm-checklist" data-checklist="">
              <li>Monto <strong>{clp.format(c.amountCLP)}</strong></li>
              <li>Referencia <strong>{c.reference}</strong></li>
              <li>A la cuenta <strong>…{c.accountLast4}</strong>{c.bank ? ` (${c.bank})` : ''}</li>
            </ul>
            <dl className="adm-dl">
              <dt>Cliente</dt><dd>{row.customer.name}{row.customer.phone ? ` · ${row.customer.phone}` : ''}</dd>
              <dt>Cita</dt><dd>{row.service.name} con {row.professional.name} · {row.when}</dd>
              {row.uploadedAt && <><dt>Subido</dt><dd>{dayMonthTime(row.uploadedAt)}</dd></>}
              {row.rejectReason && <><dt>Motivo</dt><dd>{row.rejectReason}</dd></>}
            </dl>
          </div>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        {row.status === 'en_revision' && mode === 'view' && (
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run('confirm')} data-deposit-confirm="">✓ Confirmar seña</button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setMode('reject')}>✕ Rechazar</button>
          </div>
        )}
        {(row.status === 'en_revision' || row.status === 'confirmada') && mode === 'reject' && (
          <form className="adm-reason" onSubmit={(e) => { e.preventDefault(); run('reject'); }}>
            <fieldset className="adm-radio-row">
              <legend>Motivo del rechazo</legend>
              {REJECT_REASONS.map(([k, l]) => (
                <label key={k} className={`ag-chip${code === k ? ' is-selected' : ''}`}><input type="radio" name="dep-rej" checked={code === k} onChange={() => { setCode(k); setErr(null); }} /> {l}</label>
              ))}
            </fieldset>
            {code === 'otro' && (
              <div className="ag-field"><label htmlFor="dep-rej-t">¿Qué pasó?</label><input id="dep-rej-t" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></div>
            )}
            <p className="ag-fine">{row.status === 'confirmada' ? 'La seña ya estaba confirmada: quedará "por devolver" y la cita se cancela.' : 'Rechazar cancela la cita y libera la hora.'}</p>
            <div className="ag-actions ag-actions--wrap">
              <button type="submit" className="btn btn--danger" disabled={busy}>{busy ? 'Guardando…' : 'Rechazar seña'}</button>
              <button type="button" className="btn btn--ghost" onClick={() => setMode('view')}>Volver</button>
            </div>
          </form>
        )}
        {row.status === 'confirmada' && mode === 'view' && <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={() => setMode('reject')}>Rechazar (fue un error)</button></div>}
        {row.status === 'por_devolver' && (
          <div className="ag-actions ag-actions--wrap">
            <p className="ag-muted">Transfiere {clp.format(row.amountCLP)} de vuelta al cliente desde tu banco y luego márcala.</p>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run('refunded')}>Marcar devuelta</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
