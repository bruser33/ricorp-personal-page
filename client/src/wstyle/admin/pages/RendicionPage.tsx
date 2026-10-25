import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { clp } from '../../agenda/util';
import { BACKING_LABEL, downloadRendicionCsv, payments, type Backing, type Rendicion } from '../../payments';
import { Loaded, Pill } from '../components/common';
import TaxNotice from '../components/TaxNotice';
import { useLoad, useToday } from '../hooks';
import { monthLabel, shiftMonth } from '../util';

const BUCKETS: Backing[] = ['voucher_mp', 'boleta_sii', 'sin_respaldo'];
const shortDate = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}`;

// Rendición mensual (SPEC-37): ventas por respaldo, neto e IVA (estimados mientras el emisor esté pendiente),
// reembolsos, comisiones de MP y el cuadre de la regla 7, exportable a CSV para revisar el F29. El F29 lo presenta
// el contribuyente en sii.cl con su clave: el panel no lo envía.
export default function RendicionPage() {
  const today = useToday();
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get('mes') ?? today.slice(0, 7));
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const data = useLoad(() => payments.rendicion(month), month);

  async function exportCsv() {
    setCsvErr(null);
    try {
      const blob = await downloadRendicionCsv(month);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rendicion-wstyle-${month}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setCsvErr(e instanceof ApiError ? e.message : 'No pudimos exportar');
    }
  }

  return (
    <>
      <div className="adm-title-row">
        <h1 className="ag-h1">Rendición</h1>
        <button type="button" className="btn btn--ghost" onClick={exportCsv} data-export="rendicion">Exportar CSV</button>
      </div>
      {csvErr && <Notice tone="error">{csvErr}</Notice>}
      <TaxNotice warning={data.data?.warning} emitter={data.data?.emitter} />
      <div className="adm-toolbar">
        <div className="adm-month">
          <button type="button" className="pro-icon-btn" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(`${month}-01`, -1).slice(0, 7))}>‹</button>
          <span className="adm-month__label" aria-live="polite">{monthLabel(`${month}-01`)}</span>
          <button type="button" className="pro-icon-btn" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(`${month}-01`, 1).slice(0, 7))}>›</button>
        </div>
      </div>
      <Loaded state={data} label="Calculando la rendición…">{(r) => <RendicionView r={r} />}</Loaded>
    </>
  );
}

function RendicionView({ r }: { r: Rendicion }) {
  const t = r.totals;
  const est = r.estimated ? ' (estimado)' : '';
  return (
    <div className="pay-rend" data-month={r.month}>
      <ul className="adm-cards pay-cards">
        <li><div className="adm-card adm-card--wide"><span className="adm-card__n" data-kpi="net-sales">{clp.format(t.netSalesCLP)}</span><span className="adm-card__l">Ventas netas del mes</span>
          <span className="adm-card__split">Aprobadas {clp.format(t.approvedCLP)} ({t.approvedCount}) − reembolsos y contracargos {clp.format(t.refundsCLP)} ({t.refundsCount})</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n" data-kpi="net">{clp.format(t.netCLP)}</span><span className="adm-card__l">Neto{est}</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n" data-kpi="iva">{clp.format(t.ivaCLP)}</span><span className="adm-card__l">IVA débito{est}</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n">{clp.format(t.mpFeesCLP)}</span><span className="adm-card__l">Comisiones MP</span><span className="adm-card__split">Neto recibido {clp.format(t.mpNetReceivedCLP)}</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n">{r.porCobrar.count}</span><span className="adm-card__l">Por cobrar</span><span className="adm-card__split">{clp.format(r.porCobrar.totalCLP)} (no suman a ventas)</span></div></li>
      </ul>

      <section className="adm-section" aria-labelledby="rd-backing">
        <h2 className="ag-h3" id="rd-backing">Por respaldo</h2>
        <div className="adm-table-wrap">
          <table className="adm-table" data-table="backing">
            <thead><tr><th scope="col">Respaldo</th><th scope="col">Ventas</th><th scope="col">Emitido</th><th scope="col">Reembolsos</th><th scope="col">Neto</th></tr></thead>
            <tbody>
              {BUCKETS.map((k) => (
                <tr key={k} data-bucket={k}>
                  <th scope="row">{BACKING_LABEL[k]}</th>
                  <td>{r.byBacking[k].count}</td>
                  <td className="pay-num">{clp.format(r.byBacking[k].issuedCLP)}</td>
                  <td className="pay-num">{r.byBacking[k].refundedCLP ? `− ${clp.format(r.byBacking[k].refundedCLP)}` : clp.format(0)}</td>
                  <td className="pay-num">{clp.format(r.byBacking[k].netCLP)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-section" aria-labelledby="rd-cuadre" data-cuadre={r.cuadre.ok ? 'ok' : 'diff'}>
        <div className="adm-section__head">
          <h2 className="ag-h3" id="rd-cuadre">Cuadre</h2>
          <Pill tone={r.cuadre.ok ? 'ok' : 'warn'}>{r.cuadre.ok ? 'Cuadra' : 'Con diferencias'}</Pill>
        </div>
        <p className="pay-cuadre">
          Aprobados − reembolsos = <strong className="pay-num">{clp.format(r.cuadre.approvedMinusRefundsCLP)}</strong> ·
          Voucher MP + Boleta SII + Sin respaldo = <strong className="pay-num">{clp.format(r.cuadre.backedCLP)}</strong>
        </p>
        {r.cuadre.differences.length > 0 && (
          <ul className="pay-diffs" data-list="differences">
            {r.cuadre.differences.map((d) => (
              <li key={d.paymentId + d.reason}><span className="pay-num">{shortDate(d.date)} · {clp.format(d.amountCLP)}</span> — {d.message}</li>
            ))}
          </ul>
        )}
      </section>

      {r.tramos.length > 1 && (
        <section className="adm-section" aria-labelledby="rd-tramos">
          <h2 className="ag-h3" id="rd-tramos">Cambio de modelo en el mes</h2>
          <ul className="pay-tramos">
            {r.tramos.map((x) => <li key={x.model}><strong>{x.label}</strong>: del {shortDate(x.from)} al {shortDate(x.to)} · {x.count} {x.count === 1 ? 'venta' : 'ventas'} · {clp.format(x.totalCLP)}</li>)}
          </ul>
        </section>
      )}

      <section className="adm-section" aria-labelledby="rd-unbacked">
        <h2 className="ag-h3" id="rd-unbacked">Pagos sin respaldo ({r.unbacked.length})</h2>
        {r.unbacked.length === 0 ? <p className="ag-muted">Todas las ventas del mes tienen voucher MP o boleta SII.</p> : (
          <>
            <ul className="pay-diffs" data-list="unbacked">
              {r.unbacked.map((p) => <li key={p.id}>{shortDate(p.localDate)} · {p.customer.name} · {p.methodLabel} · <span className="pay-num">{clp.format(p.amountCLP)}</span></li>)}
            </ul>
            <p><a className="ag-link" href={`/wstyle/admin/pagos/?mes=${r.month}&respaldo=sin_respaldo`}>Registrar sus boletas en Pagos →</a></p>
          </>
        )}
      </section>

      <section className="adm-section pay-f29" aria-labelledby="rd-f29">
        <h2 className="ag-h3" id="rd-f29">Para el F29</h2>
        <p>El SII arma el Registro de Compras y Ventas con los vouchers de Mercado Pago y las boletas electrónicas; esta rendición sirve para revisar que calce antes de presentar el F29 en sii.cl (eso lo haces tú, con tu clave tributaria). Las boletas reembolsadas se anulan con una nota de crédito (tipo 61) en el SII.</p>
      </section>
    </div>
  );
}
