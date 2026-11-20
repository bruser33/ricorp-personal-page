import { useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { admin, type Settings } from '../api';

// SPEC-54 §7: interruptor de la lista de espera (se guarda al tocarlo, aparte del resto de la configuración).
export default function WaitlistSetting({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [on, setOn] = useState(settings.waitlist !== false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setMsg(null);
    setOn(next);
    try {
      const s = await admin.saveSettings({ waitlist: next });
      onSaved(s);
      setMsg({ tone: 'ok', text: next ? 'Lista de espera encendida.' : 'Lista de espera apagada.' });
    } catch (e) {
      setOn(!next);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adm-section" aria-labelledby="cfg-wait" data-settings-waitlist="">
      <h2 className="ag-h3" id="cfg-wait">Lista de espera</h2>
      <label className="pro-check">
        <input type="checkbox" role="switch" checked={on} disabled={busy} aria-checked={on} onChange={(e) => toggle(e.target.checked)} />
        <span>Lista de espera {on ? 'encendida' : 'apagada'}. Encendida: los clientes pueden anotarse en los días llenos y se les avisa si se libera una hora.</span>
      </label>
      <p className="ag-muted">Apagada: los días llenos se ven como hoy (sin disponibilidad) y no se envían avisos. Las personas anotadas se conservan.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </section>
  );
}
