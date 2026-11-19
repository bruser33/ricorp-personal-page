import { flushNoShow, undoNoShow, UNDO_MS, usePendingNoShow } from '../undo';

// Aviso inferior "Marcamos que Pedro no vino · [Deshacer]". Va una vez por panel (ProShell / AdminShell).
export function UndoHost() {
  const p = usePendingNoShow();
  if (!p) return null;
  const first = p.name.trim().split(/\s+/)[0] || 'el cliente';
  return (
    <div className="pro-undo" role="status" aria-live="polite" data-undo={p.id}>
      <span>Marcamos que {first} no vino</span>
      <button type="button" className="pro-undo__btn" onClick={undoNoShow}>Deshacer</button>
      <button type="button" className="pro-undo__close" aria-label="Cerrar aviso" onClick={flushNoShow}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      <i className="pro-undo__bar" style={{ animationDuration: `${UNDO_MS}ms` }} aria-hidden="true" />
    </div>
  );
}
