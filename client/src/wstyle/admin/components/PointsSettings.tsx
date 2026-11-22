import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { points, type PointsConfig } from '../../points/api';
import { Loaded } from './common';
import { useLoad } from '../hooks';

// Configuración → Puntos (SPEC-57 §1): interruptor del programa (apagado por defecto) y la tasa "puntos por cada
// $1.000 del servicio". Cambiar la tasa solo afecta a las citas que terminen después (CB-09).
export default function PointsSettings() {
  const st = useLoad(() => points.config(), 'points-config');
  return (
    <section className="adm-section" aria-labelledby="cfg-points" data-section="points-settings">
      <h2 className="ag-h3" id="cfg-points">Puntos</h2>
      <Loaded state={st} label="Cargando el programa de puntos…">{(c) => <Form config={c} onSaved={(n) => st.setData(n)} />}</Loaded>
    </section>
  );
}

function Form({ config, onSaved }: { config: PointsConfig; onSaved: (c: PointsConfig) => void }) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [rate, setRate] = useState(String(config.pointsPer1000));
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lo, hi] = config.limits.pointsPer1000;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(rate);
    if (!/^\d+$/.test(rate.trim()) || n < lo || n > hi) { setErr(`Un entero de ${lo} a ${hi}.`); return; }
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await points.saveConfig({ enabled, pointsPer1000: n }));
      setMsg({ tone: 'ok', text: enabled ? `Programa activo: ${n} ${n === 1 ? 'punto' : 'puntos'} por cada $1.000 del servicio. Aplica a las citas que terminen desde ahora.` : 'Programa apagado: no se suman puntos nuevos; los clientes pueden canjear lo que tienen.' });
    } catch (e2) {
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <p className="ag-muted">El cliente suma puntos cuando se atiende con una reserva hecha en la web. La base es solo el precio del servicio (sin domicilio ni tarifa de servicio). Los productos y los canjes se manejan en <a href="/wstyle/admin/puntos/">Puntos</a>.</p>
      <label className="pro-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-field="points-enabled" /> <span>Programa de puntos activo</span></label>
      <div className={`ag-field adm-num${err ? ' has-error' : ''}`}>
        <label htmlFor="cfg-points-rate">Puntos por cada $1.000 del servicio</label>
        <span className="adm-num__in"><input id="cfg-points-rate" inputMode="numeric" value={rate} onChange={(e) => { setRate(e.target.value); setErr(null); }} aria-invalid={err ? true : undefined} aria-describedby="cfg-points-hint" /><span>pts</span></span>
        <p className="ag-field__hint" id="cfg-points-hint">Con 1: un corte de $10.000 da 10 puntos. Siempre redondea hacia abajo.</p>
        {err && <p className="ag-field__error" role="alert">{err}</p>}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar puntos'}</button>
    </form>
  );
}
