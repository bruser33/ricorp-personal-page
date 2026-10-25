import { useState, type FormEvent } from 'react';
import { ApiError, type User } from '../../agenda/api';
import { Notice, PasswordField } from '../../agenda/components/ui';
import { weakPassword } from '../../agenda/util';
import { admin, type RuleKey, type Settings } from '../api';
import { Loaded } from '../components/common';
import { useLoad } from '../hooks';

const RULES: { key: RuleKey; label: string; unit: string; hint: string }[] = [
  { key: 'minLeadMinutes', label: 'Anticipación mínima para reservar', unit: 'min', hint: 'Ej.: 120 = no se puede reservar con menos de 2 horas.' },
  { key: 'horizonDays', label: 'Horizonte de reserva', unit: 'días', hint: 'Hasta cuántos días adelante se puede reservar.' },
  { key: 'cancelUntilMinutes', label: 'Plazo para que el cliente cancele en línea', unit: 'min antes', hint: 'Después de eso solo por WhatsApp.' },
  { key: 'confirmWithinMinutes', label: 'Expiración de pendientes y propuestas', unit: 'min', hint: 'Si el barbero (o el cliente) no responde, la hora se libera.' },
  { key: 'inviteTtlHours', label: 'Vigencia de una invitación del barbero', unit: 'horas', hint: 'Siempre vence a más tardar 2 h antes de la cita.' },
  { key: 'maxActivePerCustomer', label: 'Máximo de citas activas por cliente', unit: 'citas', hint: 'Por cuenta y por celular.' },
];

// Configuración (RN-08): pagos (las credenciales viven en server/.env y nunca pasan por el panel), comisión de
// plataforma (se congela en cada cita nueva) y reglas de agenda. Más "Mi cuenta" (cambiar contraseña).
export default function SettingsPage({ user }: { user: User }) {
  const st = useLoad(() => admin.settings(), 'settings');
  return (
    <>
      <h1 className="ag-h1">Configuración</h1>
      <Loaded state={st} label="Cargando la configuración…">{(s) => <SettingsForm settings={s} onSaved={(n) => st.setData(n)} />}</Loaded>
      <Account user={user} />
    </>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [online, setOnline] = useState(settings.payments.online);
  const [local, setLocal] = useState(settings.payments.local);
  const [fee, setFee] = useState(String(settings.platformFeePercent));
  const [payFee, setPayFee] = useState(String(settings.paymentFeePercent));
  const [payVat, setPayVat] = useState(settings.paymentFeeVat);
  const [rules, setRules] = useState<Record<RuleKey, string>>(() => Object.fromEntries(RULES.map((r) => [r.key, String(settings.rules[r.key])])) as Record<RuleKey, string>);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mp = settings.mercadoPago;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    const feeN = Number(fee.replace(',', '.'));
    const [lo, hi] = settings.limits.platformFeePercent;
    if (!/^\d+([.,]\d{1,2})?$/.test(fee.trim()) || feeN < lo || feeN > hi) errs.fee = `Entre ${lo} y ${hi} %.`;
    const payFeeN = Number(payFee.replace(',', '.'));
    const [plo, phi] = settings.limits.paymentFeePercent;
    if (!/^\d+([.,]\d{1,2})?$/.test(payFee.trim()) || payFeeN < plo || payFeeN > phi) errs.payFee = `Entre ${plo} y ${phi} %, con hasta 2 decimales.`;
    const ruleVals: Partial<Record<RuleKey, number>> = {};
    for (const r of RULES) {
      const [a, b] = settings.limits.rules[r.key];
      const n = Number(rules[r.key]);
      if (!/^\d+$/.test(rules[r.key].trim()) || n < a || n > b) errs[r.key] = `Entre ${a} y ${b}.`;
      else ruleVals[r.key] = n;
    }
    if (!online && !local) errs.payments = 'Deja al menos una forma de pago habilitada.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setMsg(null);
    try {
      const s = await admin.saveSettings({ payments: { online, local }, platformFeePercent: feeN, paymentFeePercent: payFeeN, paymentFeeVat: payVat, rules: ruleVals });
      onSaved(s);
      setMsg({ tone: 'ok', text: 'Configuración guardada. La tarifa nueva aplica solo a las citas que se tomen desde ahora.' });
    } catch (e2) {
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-form adm-settings" onSubmit={submit} noValidate>
      <section className="adm-section" aria-labelledby="cfg-pay">
        <h2 className="ag-h3" id="cfg-pay">Pagos</h2>
        <label className="pro-check"><input type="checkbox" checked={local} onChange={(e) => { setLocal(e.target.checked); setErrors((x) => ({ ...x, payments: undefined })); }} /> <span>Pagar en el local (efectivo, débito o crédito)</span></label>
        <label className="pro-check"><input type="checkbox" checked={online} onChange={(e) => { setOnline(e.target.checked); setErrors((x) => ({ ...x, payments: undefined })); }} /> <span>Pagar en línea (Mercado Pago Checkout Pro)</span></label>
        {errors.payments && <p className="ag-field__error" role="alert">{errors.payments}</p>}
        <p className="adm-mp" data-mp={mp.configured ? mp.mode ?? 'on' : 'off'}>
          {mp.configured
            ? <>Mercado Pago · Configurado: sí · Modo: <strong>{mp.mode === 'sandbox' ? 'prueba' : 'producción'}</strong>.</>
            : <><strong>Mercado Pago no configurado.</strong> Las credenciales se cargan en <code>server/.env</code> (nunca desde el panel); mientras falten, "Pagar en línea" no aparece en la reserva aunque lo habilites.</>}
        </p>
      </section>
      <section className="adm-section" aria-labelledby="cfg-fee">
        <h2 className="ag-h3" id="cfg-fee">Tarifa de servicio</h2>
        <p className="ag-muted">La paga el cliente sobre el servicio (y el domicilio), igual si paga en el local o en línea. Él la ve como una sola línea, "Tarifa de servicio"; aquí y en la rendición van sus dos partes. El barbero gana el servicio más el domicilio.</p>
        <div className={`ag-field adm-num${errors.fee ? ' has-error' : ''}`}>
          <label htmlFor="cfg-fee-in">Administración de la plataforma</label>
          <span className="adm-num__in"><input id="cfg-fee-in" inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); setErrors((x) => ({ ...x, fee: undefined })); }} aria-invalid={errors.fee ? true : undefined} aria-describedby="cfg-fee-hint" /><span>%</span></span>
          <p className="ag-field__hint" id="cfg-fee-hint">0 a {settings.limits.platformFeePercent[1]} % del servicio + domicilio. Se congela en cada cita nueva; cambiarla no toca las citas existentes.</p>
          {errors.fee && <p className="ag-field__error" role="alert">{errors.fee}</p>}
        </div>
        <div className={`ag-field adm-num${errors.payFee ? ' has-error' : ''}`}>
          <label htmlFor="cfg-payfee-in">Comisión de Mercado Pago (costo de pagos)</label>
          <span className="adm-num__in"><input id="cfg-payfee-in" inputMode="decimal" value={payFee} onChange={(e) => { setPayFee(e.target.value); setErrors((x) => ({ ...x, payFee: undefined })); }} aria-invalid={errors.payFee ? true : undefined} aria-describedby="cfg-payfee-hint" /><span>%</span></span>
          <p className="ag-field__hint" id="cfg-payfee-hint">0 a {settings.limits.paymentFeePercent[1]} %. Tarifa de tu cuenta de Mercado Pago (Checkout, dinero al instante: 3,19 %). Se calcula para que después de la comisión te quede el servicio + la administración. 0 = no se cobra.</p>
          {errors.payFee && <p className="ag-field__error" role="alert">{errors.payFee}</p>}
        </div>
        <label className="pro-check"><input type="checkbox" checked={payVat} onChange={(e) => setPayVat(e.target.checked)} /> <span>Cobrar también el IVA (19 %) de la comisión de Mercado Pago</span></label>
      </section>
      <section className="adm-section" aria-labelledby="cfg-rules">
        <h2 className="ag-h3" id="cfg-rules">Reglas de agenda</h2>
        <div className="adm-form__grid">
          {RULES.map((r) => (
            <div key={r.key} className={`ag-field adm-num${errors[r.key] ? ' has-error' : ''}`}>
              <label htmlFor={`cfg-${r.key}`}>{r.label}</label>
              <span className="adm-num__in"><input id={`cfg-${r.key}`} inputMode="numeric" value={rules[r.key]} onChange={(e) => { const v = e.target.value; setRules((x) => ({ ...x, [r.key]: v })); setErrors((x) => ({ ...x, [r.key]: undefined })); }} aria-invalid={errors[r.key] ? true : undefined} /><span>{r.unit}</span></span>
              <p className="ag-field__hint">{r.hint}</p>
              {errors[r.key] && <p className="ag-field__error" role="alert">{errors[r.key]}</p>}
            </div>
          ))}
        </div>
      </section>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
    </form>
  );
}

function Account({ user }: { user: User }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = { current: current ? undefined : 'Escribe tu contraseña actual.', next: weakPassword(next, user.email ?? '') ? 'Mínimo 8 caracteres, con letras y números.' : undefined };
    setErrors(errs);
    if (errs.current || errs.next) return;
    setBusy(true);
    setMsg(null);
    try {
      await admin.changePassword(current, next);
      setCurrent('');
      setNext('');
      setMsg({ tone: 'ok', text: 'Contraseña cambiada.' });
    } catch (e2) {
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="adm-section" aria-labelledby="cfg-me">
      <h2 className="ag-h3" id="cfg-me">Mi cuenta</h2>
      <p className="ag-muted">{user.email}. Si entraste con la contraseña de <code>server/.env</code>, cámbiala aquí.</p>
      <form className="adm-form adm-narrow" onSubmit={submit} noValidate>
        <PasswordField label="Contraseña actual" value={current} onChange={(v) => { setCurrent(v); setErrors((x) => ({ ...x, current: undefined })); }} error={errors.current} autoComplete="current-password" />
        <PasswordField label="Contraseña nueva" value={next} onChange={(v) => { setNext(v); setErrors((x) => ({ ...x, next: undefined })); }} error={errors.next} autoComplete="new-password" />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <button type="submit" className="btn btn--ghost" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </form>
    </section>
  );
}
