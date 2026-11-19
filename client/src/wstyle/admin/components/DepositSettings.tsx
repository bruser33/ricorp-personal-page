import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice } from '../../agenda/components/ui';
import { clp } from '../../agenda/util';
import { admin, type DepositAppliesTo, type DepositSettings } from '../api';
import { Loaded } from './common';
import { useLoad } from '../hooks';
import { isRut } from '../deposit';

// Configuración → "Seña por transferencia" (SPEC-56 §1). Se pide al reservar con pago en el local, a quien el dueño
// decida, con un plazo de 15/30/60 min. No se enciende sin datos bancarios completos ni sin almacenamiento de
// comprobantes (en Render: S3/R2). Los cambios quedan en la auditoría.
export default function DepositSettingsSection() {
  const st = useLoad(() => admin.depositSettings(), 'deposit-settings');
  return (
    <section className="adm-section" aria-labelledby="cfg-sena" data-section="deposit">
      <h2 className="ag-h3" id="cfg-sena">Seña por transferencia</h2>
      <Loaded state={st} label="Cargando la seña…">{(s) => <DepositForm s={s} onSaved={(n) => st.setData(n)} />}</Loaded>
    </section>
  );
}

function DepositForm({ s, onSaved }: { s: DepositSettings; onSaved: (n: DepositSettings) => void }) {
  const [enabled, setEnabled] = useState(s.enabled);
  const [kind, setKind] = useState(s.kind);
  const [fixed, setFixed] = useState(String(s.fixedCLP));
  const [percent, setPercent] = useState(String(s.percent));
  const [appliesTo, setAppliesTo] = useState<DepositAppliesTo>(s.appliesTo);
  const [minutes, setMinutes] = useState(s.minutes);
  const [bank, setBank] = useState({ holder: s.bank.holder, rut: s.bank.rut, bank: s.bank.bank, accountType: s.bank.accountType, accountNumber: s.bank.accountNumber, email: s.bank.email });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const setB = (k: keyof typeof bank) => (v: string) => { setBank((b) => ({ ...b, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const complete = Boolean(bank.holder.trim() && isRut(bank.rut) && bank.bank.trim() && bank.accountType && bank.accountNumber.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bank.email.trim()));
  const blocked = !s.storage.configured ? s.storage.reason ?? 'Falta configurar el almacenamiento de comprobantes.' : !complete ? 'Completa los datos de la cuenta para poder encenderla.' : null;
  const example = kind === 'fixed' ? Number(fixed) || 0 : Math.max(1000, Math.ceil((18000 * (Number(percent) || 0)) / 100 / 100) * 100);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (kind === 'fixed' && (!/^\d+$/.test(fixed) || Number(fixed) < 1000)) errs.fixed = 'Desde $1.000.';
    if (kind === 'percent' && (!/^\d+$/.test(percent) || Number(percent) < 1 || Number(percent) > 100)) errs.percent = 'Entre 1 y 100 %.';
    if (bank.rut.trim() && !isRut(bank.rut)) errs.rut = 'RUT inválido (revisa el dígito verificador).';
    if (bank.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bank.email.trim())) errs.email = 'Correo inválido.';
    if (bank.accountNumber.trim() && !/^[0-9-]{4,30}$/.test(bank.accountNumber.trim())) errs.accountNumber = 'Solo números y guiones.';
    if (enabled && blocked) errs.enabled = blocked;
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await admin.saveDepositSettings({ enabled, kind, fixedCLP: Number(fixed), percent: Number(percent), appliesTo, minutes, bank });
      onSaved(n);
      setMsg({ tone: 'ok', text: n.enabled ? 'Seña guardada y encendida. Aplica a las reservas nuevas; las que ya están en curso conservan sus condiciones.' : 'Seña guardada (apagada).' });
    } catch (e2) {
      if (e2 instanceof ApiError && e2.fields) {
        const map: Record<string, string> = { 'bank.rut': 'rut', 'bank.email': 'email', 'bank.accountNumber': 'accountNumber', fixedCLP: 'fixed', percent: 'percent', enabled: 'enabled' };
        setErrors(Object.fromEntries(Object.keys(e2.fields).map((k) => [map[k] ?? k, e2.message])));
      }
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-form adm-settings adm-deposit" onSubmit={submit} noValidate data-deposit-settings="">
      <label className="pro-check"><input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setErrors((x) => ({ ...x, enabled: undefined })); }} data-deposit-enabled="" /> <span>Pedir seña al reservar</span></label>
      {errors.enabled && <p className="ag-field__error" role="alert">{errors.enabled}</p>}
      {!s.storage.configured && <Notice tone="error">{s.storage.reason}</Notice>}

      <fieldset className="adm-fieldset">
        <legend>Cuánto</legend>
        <div className="adm-radio-row">
          <label className={`ag-chip${kind === 'fixed' ? ' is-selected' : ''}`}><input type="radio" name="dep-kind" checked={kind === 'fixed'} onChange={() => setKind('fixed')} /> Monto fijo</label>
          <label className={`ag-chip${kind === 'percent' ? ' is-selected' : ''}`}><input type="radio" name="dep-kind" checked={kind === 'percent'} onChange={() => setKind('percent')} /> % del servicio</label>
        </div>
        {kind === 'fixed'
          ? <Field label="Monto ($)" inputMode="numeric" value={fixed} onChange={(v) => { setFixed(v.replace(/\D/g, '')); setErrors((x) => ({ ...x, fixed: undefined })); }} error={errors.fixed} hint="Nunca supera el total de la cita." />
          : <Field label="Porcentaje (%)" inputMode="numeric" value={percent} onChange={(v) => { setPercent(v.replace(/\D/g, '')); setErrors((x) => ({ ...x, percent: undefined })); }} error={errors.percent} hint="Sobre servicio + domicilio, redondeado hacia arriba a la centena (mínimo $1.000)." />}
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend>A quién</legend>
        {(Object.entries(s.options.appliesTo) as [DepositAppliesTo, string][]).map(([k, l]) => (
          <label key={k} className="pro-check"><input type="radio" name="dep-who" checked={appliesTo === k} onChange={() => setAppliesTo(k)} /> <span>{l}{k === 'new' ? ' (sin ninguna cita terminada en WS Style)' : ''}</span></label>
        ))}
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend>Plazo para pagarla</legend>
        <div className="adm-radio-row">
          {s.options.minutes.map((m) => (
            <label key={m} className={`ag-chip${minutes === m ? ' is-selected' : ''}`}><input type="radio" name="dep-min" checked={minutes === m} onChange={() => setMinutes(m)} /> {m} min</label>
          ))}
        </div>
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend>Datos para la transferencia</legend>
        <Field label="Titular" value={bank.holder} onChange={setB('holder')} maxLength={80} />
        <Field label="RUT" value={bank.rut} onChange={setB('rut')} error={errors.rut} placeholder="12.345.678-5" />
        <Field label="Banco" value={bank.bank} onChange={setB('bank')} maxLength={60} />
        <div className="ag-field">
          <label htmlFor="dep-type">Tipo de cuenta</label>
          <select id="dep-type" value={bank.accountType} onChange={(e) => setB('accountType')(e.target.value)}>
            <option value="">Elige…</option>
            {Object.entries(s.options.accountTypes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Field label="N° de cuenta" inputMode="numeric" value={bank.accountNumber} onChange={setB('accountNumber')} error={errors.accountNumber} />
        <Field label="Correo para el aviso" type="email" value={bank.email} onChange={setB('email')} error={errors.email} />
      </fieldset>

      <div className="adm-deposit__preview" aria-label="Vista previa de lo que ve el cliente">
        <p className="ag-fine">Vista previa (ejemplo con un servicio de $18.000):</p>
        <p>Para guardar tu hora te pedimos una seña de <strong>{clp.format(example)}</strong> por transferencia. Tendrás {minutes} minutos para pagarla y subir el comprobante. El resto ({clp.format(Math.max(0, 18000 - example))}) lo pagas en el local. <strong>La seña no se devuelve si cancelas o no llegas.</strong></p>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="ag-actions"><button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar seña'}</button></div>
    </form>
  );
}
