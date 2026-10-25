import { useState, type ReactNode } from 'react';
import { ApiError } from '../../agenda/api';
import { Spinner } from '../../agenda/components/ui';
import { initials } from '../hooks';

export function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const offline = error.status === 0 || error.status >= 500 || error.status === 503;
  return (
    <div className="ag-card adm-error" role="alert">
      <h2 className="ag-h2">{offline ? 'La API no responde' : 'No pudimos cargar esto'}</h2>
      <p>{offline ? 'No pudimos conectar con el servidor de la agenda. Puede estar despertando: inténtalo de nuevo en unos segundos.' : error.message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>Reintentar</button>
    </div>
  );
}

// Envoltorio de una sección que depende de una carga.
export function Loaded<T>({ state, label, children }: { state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void }; label: string; children: (d: T) => ReactNode }) {
  if (state.error && !state.data) return <LoadError error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Spinner label={label} />;
  return <>{children(state.data)}</>;
}

// Motivo obligatorio (rechazar, suspender, cancelar): el botón confirma solo con texto.
export function ReasonForm({ label, cta, danger = false, busy, onSubmit, onCancel, placeholder }: {
  label: string; cta: string; danger?: boolean; busy?: boolean; placeholder?: string;
  onSubmit: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="adm-reason" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) { setErr('Escribe el motivo.'); return; } onSubmit(reason.trim()); }}>
      <div className={`ag-field${err ? ' has-error' : ''}`}>
        <label htmlFor="adm-reason">{label}</label>
        <textarea id="adm-reason" rows={3} maxLength={300} value={reason} placeholder={placeholder} onChange={(e) => { setReason(e.target.value); setErr(null); }}
          aria-invalid={err ? true : undefined} aria-describedby={err ? 'adm-reason-err' : undefined} autoFocus />
        {err && <p className="ag-field__error" id="adm-reason-err" role="alert">{err}</p>}
      </div>
      <div className="ag-actions ag-actions--wrap">
        <button type="submit" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} disabled={busy}>{busy ? 'Guardando…' : cta}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Volver</button>
      </div>
    </form>
  );
}

export function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? <img className="adm-avatar" src={url} alt="" width={44} height={44} loading="lazy" /> : <span className="adm-avatar adm-avatar--empty" aria-hidden="true">{initials(name)}</span>;
}

export function Pill({ tone, children }: { tone: 'ok' | 'wait' | 'warn' | 'off'; children: ReactNode }) {
  return <span className={`ag-pill ag-pill--${tone}`}>{children}</span>;
}
