import { useState } from 'react';
import { dayMonthTime } from '../../agenda/util';
import { admin } from '../api';
import { Loaded } from '../components/common';
import { useLoad } from '../hooks';
import { AUDIT_LABEL } from '../util';

const FILTERS: [string, string][] = [['', 'Todo'], ['barber.', 'Barberos'], ['appointment', 'Citas'], ['service.', 'Carta'], ['schedule.', 'Horario'], ['settings.', 'Configuración']];

// Registro de auditoría (RN-09): solo lectura. Quién, cuándo, qué y antes/después.
export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const log = useLoad(() => admin.audit(page, action), `${page}|${action}`);
  return (
    <>
      <h1 className="ag-h1">Auditoría</h1>
      <p className="adm-lead">Todo lo que se hace desde este panel queda registrado. Solo lectura.</p>
      <div className="adm-tabs" role="tablist" aria-label="Filtrar">
        {FILTERS.map(([k, l]) => <button key={k || 'all'} type="button" role="tab" aria-selected={action === k} className={`ag-chip${action === k ? ' is-selected' : ''}`} onClick={() => { setAction(k); setPage(1); }}>{l}</button>)}
      </div>
      <Loaded state={log} label="Cargando el registro…">
        {(d) => d.items.length === 0 ? <div className="pro-empty"><p>Aún no hay acciones registradas.</p></div> : (
          <>
            <ul className="adm-audit" data-list="audit">
              {d.items.map((x) => (
                <li key={x.id}>
                  <div className="adm-audit__head">
                    <span className="adm-audit__what">{AUDIT_LABEL[x.action] ?? x.action}</span>
                    <span className="adm-audit__when">{dayMonthTime(x.at)}</span>
                  </div>
                  <p className="adm-audit__sum">{x.summary}</p>
                  <p className="adm-audit__who">{x.actor}</p>
                  {(x.before != null || x.after != null) && (
                    <details>
                      <summary>Antes / después</summary>
                      <div className="adm-audit__diff">
                        <pre aria-label="Antes">{x.before == null ? '—' : JSON.stringify(x.before, null, 2)}</pre>
                        <pre aria-label="Después">{x.after == null ? '—' : JSON.stringify(x.after, null, 2)}</pre>
                      </div>
                    </details>
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
