import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { BoletaForm } from '../../agenda/components/CollectFields';
import { Notice, Spinner, Unavailable } from '../../agenda/components/ui';
import { clp, longDay } from '../../agenda/util';
import { useLoad, useToday } from '../../admin/hooks';
import { monthLabel, monthOf, shiftMonth } from '../../admin/util';
import { BACKING_LABEL, BACKING_TONE, payments, STATUS_TONE, type PaymentRow } from '../../payments';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';

// /wstyle/pro/pagos/ (SPEC-37, asunción 4): el barbero ve solo los pagos de SUS citas, sin totales del local ni
// comisiones, y registra el N° de la boleta SII de lo que cobró en el local.
export default function PaymentsPage({ ctx }: { ctx: ProCtx }) {
  const { me, setMe } = ctx;
  const today = useToday();
  const [range, setRange] = useState(() => monthOf(today));
  const list = useLoad(() => payments.proList(range), `${range.from}|${range.to}`);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ id: string; tone: 'ok' | 'error'; text: string } | null>(null);

  async function save(p: PaymentRow, n: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await payments.proBoleta(p.appointmentId, n);
      list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id && r.payment ? r.payment : x)) } : d));
      setOpen(null);
      setMsg({ id: p.id, tone: 'ok', text: `Boleta N° ${r.payment.boletaNumber} registrada.` });
    } catch (e) {
      setMsg({ id: p.id, tone: 'error', text: e instanceof ApiError ? e.message : 'No pudimos guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProShell tab="pagos" operative unread={me?.unread ?? 0} onUnreadChange={(n) => me && setMe({ ...me, unread: n })}>
      <h1 className="ag-h1">Mis pagos</h1>
      <div className="adm-month pro-pay-month">
        <button type="button" className="pro-icon-btn" aria-label="Mes anterior" onClick={() => setRange(monthOf(shiftMonth(range.from, -1)))}>‹</button>
        <span className="adm-month__label" aria-live="polite">{monthLabel(range.from)}</span>
        <button type="button" className="pro-icon-btn" aria-label="Mes siguiente" onClick={() => setRange(monthOf(shiftMonth(range.from, 1)))}>›</button>
      </div>
      <p className="ag-muted">Los pagos de tus citas y su comprobante. Si cobraste en el local y emitiste la boleta en la app del SII, registra aquí su número.</p>
      {list.error && !list.data ? <Unavailable whatsapp={ctx.whatsapp} onRetry={list.reload} />
        : !list.data ? <Spinner label="Cargando tus pagos…" />
        : list.data.items.length === 0 ? <div className="pro-empty"><p>No tienes pagos este mes.</p></div>
        : (
          <ul className="pro-pay-list" data-list="pro-payments">
            {list.data.items.map((p) => (
              <li key={p.id} className="pro-pay" data-payment={p.id} data-backing={p.backing ?? ''}>
                <div className="pro-pay__top">
                  <span className="pro-pay__who"><strong>{p.customer.name}</strong> · {p.service.name}</span>
                  <span className="pro-pay__amount">{clp.format(p.amountCLP)}</span>
                </div>
                <p className="pro-pay__meta">
                  {longDay(p.localDate)} · {p.methodLabel}{' '}
                  <span className={`ag-pill ag-pill--${STATUS_TONE[p.status]}`}>{p.statusLabel}</span>{' '}
                  {p.backing && <span className={`ag-pill ag-pill--${BACKING_TONE[p.backing]}`}>{BACKING_LABEL[p.backing]}{p.boletaNumber ? ` N° ${p.boletaNumber}` : ''}</span>}
                </p>
                {msg?.id === p.id && <Notice tone={msg.tone}>{msg.text}</Notice>}
                {p.canRegisterBoleta && (open === p.id
                  ? <BoletaForm initial={p.boletaNumber ?? ''} busy={busy} onSubmit={(n) => save(p, n)} onCancel={() => setOpen(null)} />
                  : <button type="button" className="ag-link" onClick={() => { setMsg(null); setOpen(p.id); }}>{p.boletaNumber ? 'Corregir N° de boleta' : 'Registrar N° de boleta'}</button>)}
              </li>
            ))}
          </ul>
        )}
    </ProShell>
  );
}
