import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { agenda, ApiError, type Appointment } from '../api';
import { bankText, countdown, depositChips, receiptProblem, serverOffset } from '../deposit';
import { clp } from '../util';
import { Notice } from './ui';

// SPEC-56 §2: aviso en el paso "Confirmar y pagar" cuando el local pide seña a este cliente (pago en el local).
export function DepositNotice({ amountCLP, restCLP, minutes, accepted, error, onAccept }: {
  amountCLP: number; restCLP: number; minutes: number; accepted: boolean; error?: string; onAccept: (v: boolean) => void;
}) {
  return (
    <div className="ag-deposit-notice" data-deposit-notice="">
      <p>
        Para guardar tu hora te pedimos una seña de <strong>{clp.format(amountCLP)}</strong> por transferencia. Tendrás {minutes} minutos para pagarla y subir
        el comprobante. El resto ({clp.format(restCLP)}) lo pagas en el local. <strong>La seña no se devuelve si cancelas o no llegas.</strong>
      </p>
      <div className={`ag-field ag-check${error ? ' has-error' : ''}`}>
        <label>
          <input type="checkbox" checked={accepted} onChange={(e) => onAccept(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'ag-dep-err' : undefined} data-deposit-accept="" />
          <span>Entiendo las condiciones de la seña</span>
        </label>
        {error && <p className="ag-field__error" id="ag-dep-err" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="ag-copy" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      } catch {
        /* sin permiso de portapapeles: el texto queda visible para copiarlo a mano */
      }
    }}>{done ? 'Copiado ✓' : label}</button>
  );
}

// SPEC-56 §4: "Deja tu seña" en la página de la cita. Todo lo que dice sale del server (incluida la hora).
export function DepositBox({ appt, onChange, onCancel, busy }: { appt: Appointment; onChange: (a: Appointment) => void; onCancel?: () => void; busy: boolean }) {
  const d = appt.deposit!;
  const [offset] = useState(() => serverOffset(appt.now, Date.now()));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const waiting = appt.status === 'pendiente_sena' && d.status === 'por_pagar';
  const canUpload = appt.actions.includes('deposit_upload');
  const cd = countdown(d.deadlineAt, nowTick, offset);
  const expired = d.status === 'vencida' || (waiting && cd.expired);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!f) { setFile(null); return; }
    const problem = receiptProblem(f);
    if (problem) { setFile(null); setError(problem); e.target.value = ''; return; }
    setFile(f);
    if (f.type.startsWith('image/') && !/heic|heif/i.test(f.type)) setPreview(URL.createObjectURL(f));
  }

  async function send() {
    if (!file || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await agenda.uploadReceipt(appt.id, file);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (input.current) input.current.value = '';
      onChange(r.appointment);
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos enviar el comprobante. Revisa tu conexión y vuelve a intentarlo.');
      if (e instanceof ApiError && e.status === 409) agenda.get(appt.id).then(onChange).catch(() => {});
    } finally {
      setSending(false);
    }
  }

  async function payOnline() {
    setSwitching(true);
    setError(null);
    try {
      await agenda.depositPayOnline(appt.id);
      const co = await agenda.checkout(appt.id);
      location.assign(co.initPoint);
    } catch (e) {
      setSwitching(false);
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos abrir Mercado Pago. Inténtalo de nuevo.');
      agenda.get(appt.id).then(onChange).catch(() => {});
    }
  }

  if (expired) {
    return (
      <section className="ag-pay-box ag-pay-box--error ag-deposit" data-deposit-view="expired" role="alert">
        <h2 className="ag-h3">Se venció el plazo de la seña.</h2>
        <p>No llegó el comprobante antes de las {d.deadlineLabel}, así que liberamos la hora.</p>
        <div className="ag-actions ag-actions--wrap">
          <a className="btn btn--primary" href="/wstyle/reservar/">Reservar de nuevo</a>
          {appt.shopWhatsapp && <a className="btn btn--ghost" href={appt.shopWhatsapp} target="_blank" rel="noopener">Ya pagué: escribir al local</a>}
        </div>
      </section>
    );
  }

  const chips = depositChips(d, appt.status);
  const showChips = !waiting && d.status !== 'anulada';
  const bank = d.bank;
  return (
    <section className="ag-pay-box ag-deposit" data-deposit-view={waiting ? 'due' : d.status}>
      {showChips && (
        <p className="ag-deposit__chips" data-deposit-chips="">
          <span className={`ag-pill ag-pill--${chips.hora.tone}`}>HORA {chips.hora.tone === 'ok' ? '✓' : '·'} {chips.hora.text}</span>
          <span className={`ag-pill ag-pill--${chips.sena.tone}`}>SEÑA {chips.sena.tone === 'ok' ? '✓' : chips.sena.tone === 'wait' ? '⏳' : '·'} {chips.sena.text}</span>
        </p>
      )}
      {waiting && (
        <>
          <h2 className="ag-h3">Deja tu seña</h2>
          <p className="ag-deposit__timer" aria-live="off">Te guardamos la hora hasta las <strong>{d.deadlineLabel}</strong> · quedan <strong data-countdown="">{cd.label}</strong></p>
        </>
      )}
      {d.status === 'rechazada' && <Notice tone="error">No pudimos validar tu seña{d.rejectReason ? `: ${d.rejectReason}` : ''}. La hora se liberó.</Notice>}
      {d.status === 'en_revision' && <p className="ag-muted">Recibimos tu comprobante. WS Style lo revisa y te avisamos por correo. Tu hora está guardada.</p>}
      {d.status === 'confirmada' && <p className="ag-muted">Tu seña de {clp.format(d.amountCLP)} está confirmada. En el local pagas el resto: {clp.format(d.restCLP)}.</p>}
      {d.status === 'por_devolver' && <p className="ag-muted">Como la cita no se hará por el local, te devolveremos la seña de {clp.format(d.amountCLP)} por transferencia.</p>}
      {d.status === 'devuelta' && <p className="ag-muted">Te devolvimos la seña de {clp.format(d.amountCLP)}.</p>}

      {waiting && (
        <dl className="ag-breakdown ag-deposit__amounts">
          <div><dt>Seña a transferir</dt><dd data-deposit-amount="">{clp.format(d.amountCLP)}</dd></div>
          <div><dt>Resto, en el local</dt><dd>{clp.format(d.restIfPaidCLP)}</dd></div>
        </dl>
      )}

      {(waiting || (d.status === 'en_revision' && canUpload)) && d.reference && (
        <div className="ag-deposit__ref">
          <p className="ag-deposit__label">Referencia</p>
          <p className="ag-deposit__code"><span data-deposit-ref="">{d.reference}</span> <CopyButton text={d.reference} /></p>
          <p className="ag-fine">Ponla en el comentario o asunto de la transferencia.</p>
        </div>
      )}

      {waiting && bank && (
        <div className="ag-deposit__bank" data-deposit-bank="">
          <p className="ag-deposit__label">Datos para la transferencia</p>
          <dl>
            {[['Titular', bank.holder], ['RUT', bank.rut], ['Banco', bank.bank], ['Tipo de cuenta', bank.accountTypeLabel], ['N° de cuenta', bank.accountNumber], ['Correo para el aviso', bank.email]].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd><span>{v}</span> <CopyButton text={v} /></dd></div>
            ))}
          </dl>
          <CopyButton text={bankText(bank, d.amountCLP, d.reference ?? '')} label="Copiar todo" />
        </div>
      )}

      {canUpload && (
        <div className="ag-deposit__upload">
          <p className="ag-deposit__label">{waiting ? 'Subir comprobante' : 'Reemplazar el comprobante'}</p>
          <p className="ag-fine">Una captura, una foto o el PDF de la transferencia (hasta 5 MB).</p>
          <input ref={input} id="ag-receipt" type="file" accept="image/*,application/pdf" className="ag-sr" onChange={pick} data-deposit-file="" />
          <div className="ag-actions ag-actions--wrap">
            <label htmlFor="ag-receipt" className="btn btn--ghost" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}>Elegir archivo</label>
            <button type="button" className="btn btn--primary" disabled={!file || sending} onClick={send} data-deposit-send="">{sending ? 'Enviando…' : 'Enviar comprobante'}</button>
          </div>
          {file && <p className="ag-muted" data-deposit-picked="">{file.name}</p>}
          {preview && <img className="ag-deposit__preview" src={preview} alt="Vista previa del comprobante" />}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {waiting && (
        <div className="ag-actions ag-actions--wrap">
          {appt.shopWhatsapp && <a className="btn btn--ghost" href={appt.shopWhatsapp} target="_blank" rel="noopener">Escribir por WhatsApp al local</a>}
          {appt.actions.includes('deposit_pay_online') && <button type="button" className="btn btn--ghost" disabled={switching || busy} onClick={payOnline}>{switching ? 'Abriendo Mercado Pago…' : 'Mejor pagar todo en línea'}</button>}
          {onCancel && appt.actions.includes('cancel') && <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>Cancelar la hora</button>}
        </div>
      )}
    </section>
  );
}
