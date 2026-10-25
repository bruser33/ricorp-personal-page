import { useEffect, useRef, type ReactNode } from 'react';

// Hoja/diálogo modal con <dialog>: el navegador atrapa el foco, Esc cierra y el foco vuelve al botón que la abrió.
// En móvil se pega abajo (como Styluxe); en escritorio queda centrada.
export default function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (d && !d.open) d.showModal();
    return () => { opener?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={`pro-sheet${wide ? ' pro-sheet--wide' : ''}`} aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="pro-sheet__body">
        <header className="pro-sheet__head">
          <h2 className="pro-sheet__title">{title}</h2>
          <button type="button" className="pro-icon-btn" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
