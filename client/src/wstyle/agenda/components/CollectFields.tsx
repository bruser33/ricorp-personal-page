import { useId, useState, type FormEvent } from 'react';
import { LOCAL_METHODS, parseBoleta, type LocalMethod } from '../../payments';

// SPEC-37 flujo 2: al marcar "cobrada" una cita en el local se elige cómo se pagó y, si ya se emitió en la app del
// SII, el N° de la boleta (opcional: sin él la venta queda "sin respaldo" y se registra después).
export function CollectFields({ method, onMethod, boleta, onBoleta, error }: {
  method: LocalMethod | '';
  onMethod: (m: LocalMethod) => void;
  boleta: string;
  onBoleta: (v: string) => void;
  error?: string | null;
}) {
  const uid = useId();
  return (
    <div className="pay-collect">
      <fieldset className="pay-collect__methods">
        <legend>¿Cómo pagó?</legend>
        {LOCAL_METHODS.map(([v, l]) => (
          <label key={v} className={`ag-chip${method === v ? ' is-selected' : ''}`}>
            <input type="radio" name={`${uid}-m`} value={v} checked={method === v} onChange={() => onMethod(v)} />
            {l}
          </label>
        ))}
      </fieldset>
      <div className={`ag-field${error ? ' has-error' : ''}`}>
        <label htmlFor={`${uid}-b`}>N° de boleta SII (opcional)</label>
        <input id={`${uid}-b`} inputMode="numeric" autoComplete="off" placeholder="Ej: 1234" value={boleta} onChange={(e) => onBoleta(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={`${uid}-h`} />
        {error ? <p className="ag-field__error" id={`${uid}-h`} role="alert">{error}</p>
          : <p className="ag-field__hint" id={`${uid}-h`}>El folio de la boleta que emitiste en la app o el portal del SII. Si aún no la emites, déjalo vacío y regístralo después.</p>}
      </div>
    </div>
  );
}

// "Registrar N° de boleta" de un pago ya cobrado (panel del admin y del barbero).
export function BoletaForm({ initial = '', busy, onSubmit, onCancel }: { initial?: string; busy?: boolean; onSubmit: (n: string) => void; onCancel?: () => void }) {
  const uid = useId();
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseBoleta(value);
    if (!n) { setErr('Escribe solo el número de folio de la boleta (p.ej. 1234).'); return; }
    onSubmit(n);
  };
  return (
    <form className="pay-boleta" onSubmit={submit} aria-label="Registrar N° de boleta">
      <div className={`ag-field${err ? ' has-error' : ''}`}>
        <label htmlFor={uid}>N° de boleta SII</label>
        <input id={uid} inputMode="numeric" autoComplete="off" placeholder="Ej: 1234" value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }}
          aria-invalid={err ? true : undefined} aria-describedby={err ? `${uid}-e` : undefined} autoFocus />
        {err && <p className="ag-field__error" id={`${uid}-e`} role="alert">{err}</p>}
      </div>
      <div className="ag-actions ag-actions--wrap">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar N° de boleta'}</button>
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel}>Volver</button>}
      </div>
    </form>
  );
}
