import { useState } from 'react';
import { clp } from '../../agenda/util';
import { admin, type Stats } from '../api';
import { Loaded } from '../components/common';
import { useLoad, useToday } from '../hooks';
import { monthLabel, monthOf, shiftMonth, STATUS_OPTIONS } from '../util';

const pct = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;
const hours = (min: number) => `${Math.round(min / 6) / 10} h`.replace('.', ',');

// Estadísticas (RN-07): rango (por defecto el mes en curso, días en America/Santiago), gráficos simples + tablas.
// Las definiciones de cada número están en server/src/domain/stats.js.
export default function StatsPage() {
  const thisMonth = monthOf(useToday());
  const [range, setRange] = useState(thisMonth);
  const [custom, setCustom] = useState(false);
  const stats = useLoad(() => admin.stats(range.from, range.to), `${range.from}|${range.to}`);
  const isMonth = range.from.endsWith('-01') && monthOf(range.from).to === range.to;

  return (
    <>
      <h1 className="ag-h1">Estadísticas</h1>
      <div className="adm-toolbar adm-range-bar">
        <div className="adm-month">
          <button type="button" className="pro-icon-btn" aria-label="Mes anterior" onClick={() => { setCustom(false); setRange(monthOf(shiftMonth(range.from, -1))); }}>‹</button>
          <span className="adm-month__label" aria-live="polite">{isMonth ? monthLabel(range.from) : `${range.from} a ${range.to}`}</span>
          <button type="button" className="pro-icon-btn" aria-label="Mes siguiente" onClick={() => { setCustom(false); setRange(monthOf(shiftMonth(range.from, 1))); }}>›</button>
        </div>
        <button type="button" className="ag-link" onClick={() => setCustom(!custom)}>{custom ? 'Cerrar' : 'Otro rango'}</button>
        {custom && (
          <div className="adm-filters__grid adm-custom">
            <div className="ag-field"><label htmlFor="st-from">Desde</label><input id="st-from" type="date" value={range.from} onChange={(e) => e.target.value && setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))} /></div>
            <div className="ag-field"><label htmlFor="st-to">Hasta</label><input id="st-to" type="date" min={range.from} value={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></div>
          </div>
        )}
      </div>
      <Loaded state={stats} label="Calculando…">{(s) => <StatsView s={s} />}</Loaded>
    </>
  );
}

function StatsView({ s }: { s: Stats }) {
  const maxDay = Math.max(1, ...s.days.map((d) => d.revenueCLP));
  const maxSvc = Math.max(1, ...s.topServices.map((x) => x.count));
  const statusRows = STATUS_OPTIONS.filter(([k]) => s.byStatus[k]);
  return (
    <div className="adm-stats" data-stats={`${s.from}_${s.to}`}>
      <ul className="adm-cards">
        <li><div className="adm-card adm-card--wide"><span className="adm-card__n" data-kpi="revenue">{clp.format(s.revenue.totalCLP)}</span><span className="adm-card__l">Ingresos (citas terminadas)</span>
          <span className="adm-card__split">En línea {clp.format(s.revenue.onlineCLP)} · En el local {clp.format(s.revenue.localCLP)} · Por cobrar {clp.format(s.revenue.pendingCLP)}</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n">{s.total}</span><span className="adm-card__l">Citas</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n">{clp.format(s.averageTicketCLP)}</span><span className="adm-card__l">Ticket promedio</span></div></li>
        <li><div className="adm-card"><span className="adm-card__n">{pct(s.homePct)}</span><span className="adm-card__l">A domicilio</span></div></li>
        {s.platformFeeCLP > 0 && <li><div className="adm-card"><span className="adm-card__n">{clp.format(s.platformFeeCLP)}</span><span className="adm-card__l">Administración de la plataforma</span></div></li>}
        {/* SPEC-38 RN-19: la otra parte de la tarifa de servicio y lo que ganan los barberos. */}
        {(s.paymentFeeCLP ?? 0) > 0 && <li><div className="adm-card"><span className="adm-card__n">{clp.format(s.paymentFeeCLP ?? 0)}</span><span className="adm-card__l">Costo de pagos cobrado</span></div></li>}
        {(s.barbersCLP ?? 0) > 0 && <li><div className="adm-card"><span className="adm-card__n" data-kpi="barbers">{clp.format(s.barbersCLP ?? 0)}</span><span className="adm-card__l">Parte de los barberos</span></div></li>}
      </ul>

      <section className="adm-section" aria-labelledby="st-days">
        <h2 className="ag-h3" id="st-days">Ingresos por día</h2>
        <div className="adm-chart" role="img" aria-label={`Ingresos por día entre ${s.from} y ${s.to}`}>
          {s.days.map((d) => (
            <span key={d.date} className="adm-chart__col" title={`${d.date}: ${clp.format(d.revenueCLP)} · ${d.appointments} citas`}>
              <span className="adm-chart__bar" style={{ height: `${(d.revenueCLP / maxDay) * 100}%` }} />
              <span className="adm-chart__x">{Number(d.date.slice(8))}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="adm-two">
        <section className="adm-section" aria-labelledby="st-status">
          <h2 className="ag-h3" id="st-status">Citas por estado</h2>
          {statusRows.length === 0 ? <p className="ag-muted">Sin citas en el rango.</p> : (
            <ul className="adm-bars">
              {statusRows.map(([k, label]) => (
                <li key={k}><span className="adm-bars__l">{label}</span><span className="adm-bars__track"><span className="adm-bars__fill" style={{ width: `${(s.byStatus[k] / Math.max(1, s.total)) * 100}%` }} /></span><span className="adm-bars__n">{s.byStatus[k]}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="adm-section" aria-labelledby="st-svc">
          <h2 className="ag-h3" id="st-svc">Servicios más pedidos</h2>
          {s.topServices.length === 0 ? <p className="ag-muted">Sin datos.</p> : (
            <ul className="adm-bars">
              {s.topServices.map((x) => (
                <li key={x.id}><span className="adm-bars__l">{x.name}</span><span className="adm-bars__track"><span className="adm-bars__fill" style={{ width: `${(x.count / maxSvc) * 100}%` }} /></span><span className="adm-bars__n">{x.count}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="adm-section" aria-labelledby="st-barbers">
        <h2 className="ag-h3" id="st-barbers">Por barbero</h2>
        <div className="adm-table-wrap">
          <table className="adm-table" data-table="barbers">
            <thead><tr><th scope="col">Barbero</th><th scope="col">Citas</th><th scope="col">Terminadas</th><th scope="col">Ingresos</th><th scope="col">Ocupación</th><th scope="col">Cancel.</th><th scope="col">Inasist.</th></tr></thead>
            <tbody>
              {s.barbers.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.name}</th>
                  <td>{b.appointments}</td>
                  <td>{b.finished}</td>
                  <td>{clp.format(b.revenueCLP)}</td>
                  <td><span className="adm-occ"><span className="adm-occ__bar"><span style={{ width: `${Math.min(100, b.occupancyPct)}%` }} /></span>{pct(b.occupancyPct)}</span><span className="adm-table__sub">{hours(b.bookedMin)} de {hours(b.availableMin)}</span></td>
                  <td>{b.cancellations}</td>
                  <td>{b.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
