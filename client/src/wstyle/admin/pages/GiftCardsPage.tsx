import { useState, type FormEvent } from 'react';
import { agenda, ApiError, type CatalogService } from '../../agenda/api';
import { Field, Notice } from '../../agenda/components/ui';
import { clp, dayMonthTime, fieldMessage } from '../../agenda/util';
import { admin, type GiftCardDetail, type GiftCardRow } from '../api';
import { Loaded, Pill, ReasonForm } from '../components/common';
import { useLoad } from '../hooks';
import '../../gift/gift.css';

const STATUS: [string, string][] = [['pendiente_pago', 'Por pagar'], ['activa', 'Activas'], ['usada', 'Usadas'], ['vencida', 'Vencidas'], ['anulada', 'Anuladas']];
const TONE: Record<string, 'ok' | 'wait' | 'warn' | 'off'> = { activa: 'ok', pendiente_pago: 'wait', usada: 'off', vencida: 'warn', anulada: 'off' };
const METHOD: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta (POS)' };
const MOVEMENT: Record<string, string> = { emision: 'Emisión', activacion: 'Pago aprobado', canje: 'Canje en cita', reversion: 'Devolución', anulacion: 'Anulación', extension: 'Extensión', reembolso: 'Reembolso de la compra' };
const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
const what = (g: Pick<GiftCardRow, 'kind' | 'service'>) => (g.kind === 'servicio' ? `Servicio · ${g.service?.name ?? ''}` : 'Monto');

// Panel → Gift cards (SPEC-60): contadores, listado con búsqueda y filtros, detalle con movimientos y acciones.
export default function GiftCardsPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(location.search).get('id'));
  const [issuing, setIssuing] = useState(false);
  const list = useLoad(() => admin.giftCards({ q: term, status }), `${term}|${status}`);
  return (
    <>
      <div className="adm-head">
        <h1 className="ag-h1">Gift cards</h1>
        <button type="button" className="btn btn--primary" onClick={() => { setIssuing(true); setOpenId(null); }} data-issue="">Emitir</button>
      </div>
      <p className="adm-lead">Tarjetas vendidas en línea o en el local. El saldo baja al reservar y vuelve si la cita se cae.</p>
      {issuing && <IssueForm onDone={(g) => { setIssuing(false); if (g) { setOpenId(g.id); list.reload(); } }} />}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={() => list.reload()} />}
      <Loaded state={list} label="Cargando gift cards…">
        {(d) => (
          <>
            <ul className="adm-cards gc-counters" data-counters="">
              {STATUS.map(([k, l]) => (
                <li key={k}><button type="button" className={`adm-card gc-counter${status === k ? ' is-selected' : ''}`} onClick={() => setStatus(status === k ? '' : k)} aria-pressed={status === k}>
                  <span className="adm-card__n" data-count={k}>{d.counters[k] ?? 0}</span><span className="adm-card__l">{l}</span>
                </button></li>
              ))}
            </ul>
            <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }} role="search">
              <Field label="Buscar por código o nombre" value={q} onChange={setQ} placeholder="WS-7KQ4 o Valentina" />
              <button className="btn btn--ghost">Buscar</button>
              {(term || status) && <button type="button" className="ag-link" onClick={() => { setQ(''); setTerm(''); setStatus(''); }}>Limpiar</button>}
            </form>
            {!d.online && <p className="ag-fine">La venta en línea está apagada{d.settings.onlineEnabled ? ' (falta configurar Mercado Pago)' : ''}: actívala en Configuración.</p>}
            {d.items.length === 0 ? <div className="pro-empty"><p>No hay gift cards{status || term ? ' con ese filtro' : ' todavía'}.</p></div> : (
              <div className="adm-table-wrap">
                <table className="adm-table" data-list="gift-cards">
                  <thead><tr><th>Código</th><th>De → Para</th><th>Tipo</th><th>Monto</th><th>Saldo</th><th>Vence</th><th>Estado</th><th>Origen</th></tr></thead>
                  <tbody>
                    {d.items.map((g) => (
                      <tr key={g.id} data-gift={g.code}>
                        <td><button type="button" className="ag-link gc-code" onClick={() => { setOpenId(g.id); setIssuing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{g.code}</button></td>
                        <td>{g.from} → {g.to}</td>
                        <td>{what(g)}</td>
                        <td>{clp.format(g.amountCLP)}</td>
                        <td data-balance="">{clp.format(g.balanceCLP)}</td>
                        <td>{date(g.expiresAt)}</td>
                        <td><Pill tone={TONE[g.status] ?? 'off'}>{g.statusLabel}{g.blocked ? ' · bloqueada' : ''}</Pill></td>
                        <td>{g.origin === 'online' ? 'En línea' : `Local · ${METHOD[g.localMethod ?? ''] ?? ''}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Loaded>
      <GiftSettings />
    </>
  );
}

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useLoad(() => admin.giftCard(id), id);
  const [mode, setMode] = useState<'void' | 'extend' | 'resend' | null>(null);
  const [months, setMonths] = useState('3');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  async function run(fn: () => Promise<GiftCardDetail | { ok: boolean; to: string }>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if ('code' in r) st.setData(r);
      setMode(null);
      setMsg({ tone: 'ok', text: 'to' in r ? `Correo enviado a ${r.to}.` : ok });
      onChanged();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo.' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ag-card gc-detail" aria-label="Detalle de la gift card" data-gift-detail="">
      <Loaded state={st} label="Cargando…">
        {(g) => (
          <>
            <div className="adm-head">
              <h2 className="ag-h2"><span className="gc-code">{g.code}</span> <Pill tone={TONE[g.status] ?? 'off'}>{g.statusLabel}</Pill></h2>
              <button type="button" className="ag-link" onClick={onClose}>Cerrar</button>
            </div>
            <dl className="adm-dl">
              <div><dt>De → Para</dt><dd>{g.from} → {g.to}</dd></div>
              <div><dt>Tipo</dt><dd>{what(g)}</dd></div>
              <div><dt>Monto · Saldo</dt><dd>{clp.format(g.amountCLP)} · <strong>{clp.format(g.balanceCLP)}</strong></dd></div>
              <div><dt>Vence</dt><dd>{date(g.expiresAt)}</dd></div>
              <div><dt>Origen</dt><dd>{g.origin === 'online' ? `En línea${g.pricing ? ` · pagó ${clp.format(g.pricing.totalCLP)}` : ''}${g.payment.mpPaymentId ? ` · MP ${g.payment.mpPaymentId}` : ''}` : `Local · ${METHOD[g.localMethod ?? ''] ?? ''}`}</dd></div>
              {g.buyerEmail && <div><dt>Correo</dt><dd>{g.buyerEmail}{g.mailedAt ? ` · enviado ${dayMonthTime(g.mailedAt)}` : ''}</dd></div>}
              {g.message && <div><dt>Mensaje</dt><dd>{g.message}</dd></div>}
              {g.unusableReason && <div><dt>No se puede usar</dt><dd data-reason="">{g.unusableReason}</dd></div>}
            </dl>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            {mode === 'void' ? (
              <ReasonForm label="Motivo de la anulación" cta="Anular gift card" danger busy={busy} onCancel={() => setMode(null)} onSubmit={(reason) => run(() => admin.voidGiftCard(g.id, reason), 'Gift card anulada.')} />
            ) : mode === 'extend' ? (
              <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); run(() => admin.extendGiftCard(g.id, Number(months)), 'Vencimiento extendido.'); }}>
                <Field label="Extender (meses)" inputMode="numeric" value={months} onChange={setMonths} />
                <button className="btn btn--primary" disabled={busy}>Extender</button>
                <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Volver</button>
              </form>
            ) : mode === 'resend' ? (
              <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); run(() => admin.resendGiftCard(g.id, email.trim() || undefined), ''); }}>
                <Field label="Correo" type="email" value={email} placeholder={g.buyerEmail ?? 'correo@ejemplo.cl'} onChange={setEmail} />
                <button className="btn btn--primary" disabled={busy}>Enviar</button>
                <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Volver</button>
              </form>
            ) : (
              <div className="ag-actions ag-actions--wrap">
                {g.status !== 'pendiente_pago' && <a className="btn btn--ghost" href={`/wstyle/regalo/?t=${encodeURIComponent(g.token)}`} target="_blank" rel="noopener">Ver o descargar tarjeta</a>}
                {g.status !== 'pendiente_pago' && <button type="button" className="btn btn--ghost" onClick={() => setMode('resend')}>Reenviar correo</button>}
                {['activa', 'vencida', 'usada'].includes(g.status) && <button type="button" className="btn btn--ghost" onClick={() => setMode('extend')}>Extender vencimiento</button>}
                {g.status !== 'anulada' && <button type="button" className="btn btn--danger" onClick={() => setMode('void')}>Anular</button>}
              </div>
            )}
            <h3 className="ag-h3">Movimientos</h3>
            <ul className="adm-audit" data-list="movements">
              {g.movements.map((m, i) => (
                <li key={i}><div className="adm-audit__head"><span className="adm-audit__what">{MOVEMENT[m.kind] ?? m.kind}{m.amountCLP ? ` · ${m.amountCLP > 0 ? '+' : '−'}${clp.format(Math.abs(m.amountCLP))}` : ''}</span><span className="adm-audit__when">{dayMonthTime(m.at)}</span></div>{m.reason && <p className="adm-audit__sum">{m.reason}</p>}</li>
              ))}
            </ul>
            {g.appointments.length > 0 && (
              <>
                <h3 className="ag-h3">Citas donde se usó</h3>
                <ul className="adm-audit">
                  {g.appointments.map((a) => (
                    <li key={a.id}><a href={`/wstyle/admin/citas/?id=${encodeURIComponent(a.id)}`}>{dayMonthTime(a.startsAt)} · {a.customer} · {a.service}</a> · {clp.format(a.amountCLP)}{a.giftStatus === 'revertida' ? ' (devuelto)' : ''}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Loaded>
    </section>
  );
}

function IssueForm({ onDone }: { onDone: (g: GiftCardDetail | null) => void }) {
  const services = useLoad(() => agenda.catalog().then((c) => c.services), 'services');
  const [kind, setKind] = useState<'monto' | 'servicio'>('monto');
  const [amount, setAmount] = useState('20000');
  const [serviceId, setServiceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setErrors({});
    try {
      const g = await admin.issueGiftCard({ kind, amountCLP: kind === 'monto' ? Number(amount.replace(/\D/g, '')) : undefined, serviceId: kind === 'servicio' ? serviceId : undefined, from: from.trim(), to: to.trim(), message: message.trim(), email: email.trim() || undefined, localMethod: method });
      onDone(g);
    } catch (e2) {
      if (e2 instanceof ApiError && Object.keys(e2.fields).length) setErrors(Object.fromEntries(Object.entries(e2.fields).map(([k, v]) => [k, k === 'amountCLP' ? 'Entre $5.000 y $200.000.' : k === 'localMethod' ? 'Elige cómo se cobró.' : fieldMessage(v)])));
      else setErr(e2 instanceof ApiError ? e2.message : 'No se pudo emitir.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ag-card gc-issue" onSubmit={submit} noValidate data-issue-form="">
      <h2 className="ag-h2">Emitir gift card (venta en el local)</h2>
      <fieldset className="gc-tabs">
        <legend className="ag-sr">Tipo</legend>
        <label className={`ag-option ag-radio${kind === 'monto' ? ' is-selected' : ''}`}><input type="radio" checked={kind === 'monto'} onChange={() => setKind('monto')} /><span className="ag-option__name">Un monto</span></label>
        <label className={`ag-option ag-radio${kind === 'servicio' ? ' is-selected' : ''}`}><input type="radio" checked={kind === 'servicio'} onChange={() => setKind('servicio')} /><span className="ag-option__name">Un servicio</span></label>
      </fieldset>
      {kind === 'monto' ? <Field label="Monto (CLP)" inputMode="numeric" value={amount} onChange={setAmount} error={errors.amountCLP} />
        : (
          <div className={`ag-field${errors.serviceId ? ' has-error' : ''}`}>
            <label htmlFor="gc-issue-svc">Servicio</label>
            <select id="gc-issue-svc" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Elige un servicio</option>
              {(services.data ?? ([] as CatalogService[])).map((s) => <option key={s.id} value={s.id}>{s.name} · {clp.format(s.priceCLP)}</option>)}
            </select>
            {errors.serviceId && <p className="ag-field__error" role="alert">{errors.serviceId}</p>}
          </div>
        )}
      <Field label="De" value={from} maxLength={40} onChange={setFrom} error={errors.from} />
      <Field label="Para" value={to} maxLength={40} onChange={setTo} error={errors.to} />
      <Field label="Mensaje (opcional, 140)" value={message} maxLength={140} onChange={setMessage} error={errors.message} />
      <Field label="Correo para enviarla (opcional)" type="email" value={email} onChange={setEmail} error={errors.email} />
      <div className={`ag-field${errors.localMethod ? ' has-error' : ''}`}>
        <label htmlFor="gc-issue-method">Forma de cobro</label>
        <select id="gc-issue-method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Elige…</option>
          {Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {errors.localMethod && <p className="ag-field__error" role="alert">{errors.localMethod}</p>}
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="ag-actions ag-actions--wrap">
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Emitiendo…' : 'Emitir'}</button>
        <button type="button" className="btn btn--ghost" onClick={() => onDone(null)}>Cancelar</button>
      </div>
    </form>
  );
}

// Ajustes (SPEC-60 §8): vender en línea (apagado por defecto) y vigencia por defecto. También en Configuración.
export function GiftSettings() {
  const st = useLoad(() => admin.settings(), 'gift-settings');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  return (
    <section className="ag-card gc-settings" aria-labelledby="gc-settings-h" data-gift-settings="">
      <h2 className="ag-h2" id="gc-settings-h">Ajustes de gift cards</h2>
      <Loaded state={st} label="Cargando…">
        {(s) => {
          const g = s.giftCards ?? { onlineEnabled: false, validityMonths: 12 };
          const save = async (body: { onlineEnabled?: boolean; validityMonths?: number }) => {
            setMsg(null);
            try {
              st.setData(await admin.saveSettings({ giftCards: body }));
              setMsg({ tone: 'ok', text: 'Guardado.' });
            } catch (e) {
              setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo guardar.' });
            }
          };
          return (
            <>
              <label className="ag-check">
                <input type="checkbox" checked={g.onlineEnabled} onChange={(e) => save({ onlineEnabled: e.target.checked })} data-gift-online="" />
                <span>Vender gift cards en línea{!s.mercadoPago.ready ? ' (necesita Mercado Pago configurado)' : ''}</span>
              </label>
              <form className="adm-inline" onSubmit={(e) => { e.preventDefault(); const n = Number(new FormData(e.currentTarget).get('months')); save({ validityMonths: n }); }}>
                <div className="ag-field">
                  <label htmlFor="gc-validity">Vigencia por defecto (meses)</label>
                  <input id="gc-validity" name="months" inputMode="numeric" defaultValue={String(g.validityMonths)} />
                </div>
                <button className="btn btn--ghost">Guardar vigencia</button>
              </form>
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            </>
          );
        }}
      </Loaded>
    </section>
  );
}
