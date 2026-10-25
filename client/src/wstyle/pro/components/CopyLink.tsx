import { useState } from 'react';

// CB-08: si WhatsApp no abre (no está instalado en el equipo), el link se copia y se manda por otro lado.
export default function CopyLink({ url, label = 'Copiar link de la invitación' }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  }
  return (
    <button type="button" className="btn btn--ghost pro-copy" onClick={copy}>
      {done ? '¡Link copiado!' : label}
      <span className="ag-sr" role="status">{done ? 'Link copiado' : ''}</span>
    </button>
  );
}
