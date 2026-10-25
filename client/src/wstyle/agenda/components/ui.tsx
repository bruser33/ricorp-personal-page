import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { STATUS_TONE } from '../util';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: ReactNode;
};

// Campo con etiqueta y su error JUNTO al campo (role="alert", AC-09) enlazado con aria-describedby.
export function Field({ label, value, onChange, error, hint, id, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={`ag-field${error ? ' has-error' : ''}`}>
      <label htmlFor={fid}>{label}</label>
      <input id={fid} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && !error && <p className="ag-field__hint" id={`${fid}-hint`}>{hint}</p>}
      {error && <p className="ag-field__error" id={`${fid}-err`} role="alert">{error}</p>}
    </div>
  );
}

// Contraseña con el "ojo" de mostrar/ocultar (como Styluxe, RN-20).
export function PasswordField(props: InputProps) {
  const [show, setShow] = useState(false);
  const fid = useId();
  const { label, value, onChange, error, hint, ...rest } = props;
  return (
    <div className={`ag-field${error ? ' has-error' : ''}`}>
      <label htmlFor={fid}>{label}</label>
      <div className="ag-password">
        <input id={fid} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} {...rest} />
        <button type="button" className="ag-eye" aria-pressed={show} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            {show && <path stroke="currentColor" strokeWidth="1.6" d="M4 20 20 4" />}
          </svg>
        </button>
      </div>
      {hint && !error && <p className="ag-field__hint" id={`${fid}-hint`}>{hint}</p>}
      {error && <p className="ag-field__error" id={`${fid}-err`} role="alert">{error}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return <div className={`ag-notice ag-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={`ag-pill ag-pill--${STATUS_TONE[status] ?? 'off'}`}>{label}</span>;
}

export function Spinner({ label }: { label: string }) {
  return <p className="ag-loading" role="status"><span className="ag-spinner" aria-hidden="true" />{label}</p>;
}

// CB-15/AC-17: la agenda no responde → error reintentable + "Reservar por WhatsApp" (nunca pantalla en blanco).
export function Unavailable({ whatsapp, onRetry }: { whatsapp: string | null; onRetry: () => void }) {
  return (
    <div className="ag-card ag-unavailable" role="alert">
      <h2 className="ag-h2">La agenda no responde</h2>
      <p>No pudimos conectar con la agenda en línea. Puede estar despertando: inténtalo de nuevo en unos segundos.</p>
      <div className="ag-actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>Reintentar</button>
        <a className="btn btn--ghost" data-cta="whatsapp-fallback" href={whatsapp ?? '/wstyle/'} {...(whatsapp ? { target: '_blank', rel: 'noopener' } : {})}>Reservar por WhatsApp</a>
      </div>
    </div>
  );
}

export const MotoIcon = () => (
  <svg className="ag-moto" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="5.5" cy="16.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18.5" cy="16.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M5.5 16.5 9 10h5l2.5 6.5M14 10l1-3h3M9 10l-1.5-2.5H5" />
  </svg>
);
