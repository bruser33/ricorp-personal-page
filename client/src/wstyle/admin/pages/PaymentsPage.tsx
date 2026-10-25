import { useMemo, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { BoletaForm } from '../../agenda/components/CollectFields';
import { Notice } from '../../agenda/components/ui';
import { clp, dayMonthTime } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { BACKING_LABEL, BACKING_TONE, METHOD_FILTERS, payments, STATUS_FILTERS, STATUS_TONE, type PaymentRow, type PaymentsList } from '../../payments';
import { admin } from '../api';
import { Loaded, Pill } from '../components/common';
import TaxNotice from '../components/TaxNotice';
import { useLoad, useToday } from '../hooks';
import { monthLabel, monthOf, shiftMonth } from '../util';

const shortDate = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}`;

// Pagos (SPEC-37): todos los pagos de las citas con su respaldo tributario. Filtros por fecha, barbero, método,
// estado y "sin respaldo"; totales del período arriba; detalle con "registrar N° de boleta" para los cobros del local.
export default function PaymentsPage() {
  const init = useMemo(() => new URLSearchParams(location.search), []);
  const today = useToday();
  const [range, setRange] = useState(() => (init.get('mes') ? monthOf(`${init.get('mes')}-01`) : monthOf(today)));
  const [pro, setPro] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [onlyUnbacked, setOnlyUnbacked] = useState(init.get('respaldo') === 'sin_respaldo');
  const [open, setOpen] = useState<PaymentRow | null>(null);
  const barbers = useLoad(() => admin.barbers(''), 'barbers');
  const filters = { from: range.from, to: range.to, professional: pro, method, status, backing: onlyUnbacked ? 'sin_respaldo' : '' };
  const list = useLoad(() => payments.adminList(filters), JSON.stringify(filters));
  const isMonth = range.from.endsWith('-01') && monthOf(range.from).to === range.to;

  const replace = (p: PaymentRow) => {
    setOpen(p);
    // Los totales cambian (sin respaldo → boleta): se recarga la lista.
    list.reload();
  };

  return (
    <>
      <h1 className="ag-h1">Pagos</h1>
      <TaxNotice warning={list.data?.warning} emitter={list.data?.emitter} />
      <form className="adm-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filtros de pagos">
        <div className="adm-toolbar adm-range-bar">
          <div className="adm-month">
            <button type="button" className="pro-icon-btn" aria-label="Mes anterior" onClick={() => setRange(monthOf(shiftMonth(range.from, -1)))}>‹</button>
            <span className="adm-month__label" aria-live="polite">{isMonth ? monthLabel(range.from) : `${range.from} a ${range.to}`}</span>
            <button type="button" className="pro-icon-btn" aria-label="Mes siguiente" onClick={() => setRange(monthOf(shiftMonth(range.from, 1)))}>›</button>
          </div>
        </div>
        <div className="adm-filters__grid pay-filters">
          <div className="ag-field"><label htmlFor="p-from">Desde</label><input id="p-from" type="date" value={range.from} onChange={(e) => e.target.value && setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))} /></div>
          <div className="ag-field"><label htmlFor="p-to">Hasta</label><input id="p-to" type="date" min={range.from} value={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></div>
          <div className="ag-field"><label htmlFor="p-pro">Barbero</label>
            <select id="p-pro" value={pro} onChange={(e) => setPro(e.target.value)}>
              <option value="">Todos</option>
              {(barbers.data?.items ?? []).filter((b) => b.status !== 'pending').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="ag-field"><label htmlFor="p-method">Método</label>
            <select id="p-method" value={method} onChange={(e) => setMethod(e.target.value)}>{METHOD_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="ag-field"><label htmlFor="p-status">Estado</label>
            <select id="p-status" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <label className="pro-check pay-filters__check"><input type="checkbox" checked={onlyUnbacked} onChange={(e) => setOnlyUnbacked(e.target.checked)} /> <span>Solo sin respaldo</span></label>
        </div>
      </form>
      <Loaded state={list} label="Cargando pagos…">{(d) => <PaymentsView d={d} onOpen={setOpen} />}</Loaded>
      {open && <PaymentSheet row={open} onClose={() => setOpen(null)} onChanged={replace} />}
    </>
  );
}

function PaymentsView({ d, onOpen }: { d: PaymentsList; onOpen: (p: PaymentRow) => void }) {
  const t = d.totals;
  return (
    <>
      {t && (
        <ul className="adm-cards pay-cards" data-totals="">
          <li><div className="adm-card adm-card--wide"><span className="adm-card__n" data-kpi="approved">{clp.format(t.approvedCLP)}</span><span className="adm-card__l">Ventas aprobadas ({t.approvedCount})</span>
            <span className="adm-card__split">Reembolsos {clp.format(t.refundsCLP)} · Ventas netas {clp.format(t.netSalesCLP)}</span></div></li>
          <li><div className="adm-card"><span className="adm-card__n">{clp.format(t.mpFeesCLP)}</span><span className="adm-card__l">Comisiones MP</span><span className="adm-card__split">Neto recibido {clp.format(t.mpNetReceivedCLP)}</span></div></li>
          <li><div className={`adm-card${t.unbacked.count ? ' pay-card--warn' : ''}`}><span className="adm-card__n" data-kpi="unbacked">{t.unbacked.count}</span><span className="adm-card__l">Sin respaldo</span><span className="adm-card__split">{clp.format(t.unbacked.totalCLP)}</span></div></li>
          <li><div className="adm-card"><span className="adm-card__n">{t.porCobrar.count}</span><span className="adm-card__l">Por cobrar</span><span className="adm-card__split">{clp.format(t.porCobrar.totalCLP)}</span></div></li>
          <li><div className="adm-card"><span className="adm-card__n">{clp.format(t.byBacking.voucher_mp)}</span><span className="adm-card__l">Voucher MP</span><span className="adm-card__split">Boleta SII {clp.format(t.byBacking.boleta_sii)}</span></div></li>
        </ul>
      )}
      {d.items.length === 0 ? <div className="pro-empty"><p>No hay pagos con estos filtros.</p></div> : (
        <>
          <p className="ag-muted adm-count">{d.items.length} {d.items.length === 1 ? 'pago' : 'pagos'}</p>
          <div className="adm-table-wrap pay-table-wrap">
            <table className="adm-table pay-table" data-table="payments">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Barbero</th><th scope="col">Servicio</th><th scope="col">Método</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col">Respaldo</th></tr></thead>
              <tbody>
                {d.items.map((p) => (
                  <tr key={p.id} data-payment={p.id} data-status={p.status} data-backing={p.backing ?? ''}>
                    <td data-label="Fecha">{shortDate(p.localDate)}</td>
                    <th scope="row" data-label="Cliente"><button type="button" className="ag-link pay-open" onClick={() => onOpen(p)}>{p.customer.name || 'Cliente'}</button></th>
                    <td data-label="Barbero">{p.professional.name}</td>
                    <td data-label="Servicio">{p.service.name}{p.duplicate ? <span className="adm-table__sub">Pago duplicado</span> : null}</td>
                    <td data-label="Método">{p.methodLabel}</td>
                    <td data-label="Monto" className="pay-num">{clp.format(p.amountCLP)}</td>
                    <td data-label="Estado"><Pill tone={STATUS_TONE[p.status]}>{p.statusLabel}</Pill></td>
                    <td data-label="Respaldo">{p.backing ? <Pill tone={BACKING_TONE[p.backing]}>{BACKING_LABEL[p.backing]}{p.boletaNumber ? ` N° ${p.boletaNumber}` : ''}</Pill> : <span className="ag-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// Detalle de un pago: id MP, estado, monto (con el recargo por domicilio en su línea), comisión, neto recibido,
// neto/IVA estimados y respaldo. "Registrar N° de boleta" solo donde corresponde (regla 3: nunca sobre un voucher MP).
export function PaymentSheet({ row, onClose, onChanged }: { row: PaymentRow; onClose: () => void; onChanged: (p: PaymentRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const p = row;
  async function save(n: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await payments.adminBoleta(p.appointmentId, n);
      setEditing(false);
      setMsg({ tone: 'ok', text: `Boleta N° ${r.payment.boletaNumber} registrada.` });
      onChanged(r.payment);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No pudimos guardar' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Pago" onClose={onClose} wide>
      <div className="pay-detail" data-payment-detail={p.id}>
        <p className="adm-appt__status"><Pill tone={STATUS_TONE[p.status]}>{p.statusLabel}</Pill> {p.backing && <Pill tone={BACKING_TONE[p.backing]}>{BACKING_LABEL[p.backing]}</Pill>}</p>
        <dl className="adm-dl">
          <dt>Fecha</dt><dd>{dayMonthTime(p.date)}</dd>
          <dt>Cliente</dt><dd>{p.customer.name}{p.customer.email ? ` · ${p.customer.email}` : ''}</dd>
          <dt>Cita</dt><dd>{p.service.name} con {p.professional.name} · {dayMonthTime(p.appointment.startsAt)}</dd>
          <dt>Método</dt><dd>{p.methodLabel}</dd>
          {p.mp && <><dt>Pago MP</dt><dd data-mp-id={p.mp.paymentId}>N° {p.mp.paymentId}{p.mp.status ? ` · ${p.mp.status}` : ''}{p.mp.paymentType ? ` · ${p.mp.paymentType}` : ''}</dd></>}
          <dt>Detalle</dt>
          <dd>
            <ul className="pay-lines">
              {p.lines.map((l) => <li key={l.kind + l.label}><span>{l.label}</span><span className="pay-num">{clp.format(l.amountCLP)}</span></li>)}
              <li className="pay-lines__total"><span>Total</span><span className="pay-num" data-amount={p.amountCLP}>{clp.format(p.amountCLP)}</span></li>
            </ul>
          </dd>
          {p.mp && p.mp.feeCLP !== undefined && <>
            <dt>Comisión MP</dt><dd className="pay-num" data-fee={p.mp.feeCLP}>{clp.format(p.mp.feeCLP)}</dd>
            <dt>Neto recibido</dt><dd className="pay-num" data-net={p.mp.netReceivedCLP}>{clp.format(p.mp.netReceivedCLP ?? 0)}</dd>
          </>}
          <dt>Neto / IVA</dt><dd>{clp.format(p.tax.netCLP)} + IVA {clp.format(p.tax.ivaCLP)}{p.tax.estimated ? ' (estimado)' : ''}</dd>
          <dt>Respaldo</dt>
          <dd data-backing={p.backing ?? ''}>
            {p.backing === 'voucher_mp' ? `Voucher de Mercado Pago N° ${p.mp?.paymentId ?? ''} (vale como boleta)`
              : p.backing === 'boleta_sii' ? `Boleta SII N° ${p.boletaNumber}`
              : p.backing === 'sin_respaldo' ? 'Sin respaldo: falta registrar la boleta'
              : 'No aplica (el pago no está aprobado)'}
          </dd>
          {p.refundedAt && <><dt>{p.status === 'contracargo' ? 'Contracargo' : 'Reembolso'}</dt><dd>{dayMonthTime(p.refundedAt)}</dd></>}
        </dl>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {p.canRegisterBoleta && (editing
          ? <BoletaForm initial={p.boletaNumber ?? ''} busy={busy} onSubmit={save} onCancel={() => setEditing(false)} />
          : <div className="ag-actions ag-actions--wrap"><button type="button" className="btn btn--primary" onClick={() => setEditing(true)}>{p.boletaNumber ? 'Corregir N° de boleta' : 'Registrar N° de boleta'}</button></div>)}
        {p.backing === 'voucher_mp' && <p className="ag-muted pay-hint">Este pago ya está respaldado por el voucher de Mercado Pago: no emitas otra boleta (sería doble emisión).</p>}
      </div>
    </Sheet>
  );
}
