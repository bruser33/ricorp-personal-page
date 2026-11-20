import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { agenda, ApiError, giftCards, type Catalog, type GiftCardView } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import PriceBreakdown from '../components/PriceBreakdown';
import Shell from '../components/Shell';
import { Field, Notice, Spinner, Unavailable } from '../components/ui';
import { NO_FEES, quote } from '../pricing';
import { clp, fieldMessage } from '../util';
import GiftCardArt from '../../gift/GiftCardArt';
import { shareText, waShareUrl, type CardData } from '../../gift/card';
import { cardPng } from '../../gift/drawCard';

const MAX_NAME = 40;
const MAX_MESSAGE = 140;
const MIN = 5000;
const MAX = 200000;
const QUICK = [10000, 20000, 30000, 50000];
const OFFLINE = 'Por ahora las gift cards se venden en el local';

// /wstyle/regalar/ (SPEC-60): "Regala WS Style". Requiere sesión (como la reserva). Paga con Mercado Pago; al volver
// (?gc=<id>&pago=…) consulta el estado al server (que pregunta a Mercado Pago) y lleva a la tarjeta.
export function GiftBuyPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const user = session.user;
  const params = new URLSearchParams(location.search);
  const returning = params.get('gc');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [load, setLoad] = useState<'loading' | 'waking' | 'error' | 'ready'>('loading');
  const [kind, setKind] = useState<'monto' | 'servicio'>('monto');
  const [amount, setAmount] = useState<number | null>(20000);
  const [other, setOther] = useState('');
  const [serviceId, setServiceId] = useState('');
  // null = todavía no lo tocó: se propone el nombre y el correo de la cuenta.
  const [fromInput, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [emailInput, setEmail] = useState<string | null>(null);
  const [until] = useState(() => new Date(Date.now() + 365 * 864e5).toISOString());
  const from = fromInput ?? user?.name.split(' ')[0] ?? '';
  const email = emailInput ?? user?.email ?? '';
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    agenda.catalog(() => alive && setLoad('waking')).then((c) => { if (alive) { setCatalog(c); setLoad('ready'); } }, () => alive && setLoad('error'));
    return () => { alive = false; };
  }, []);

  const services = catalog?.services ?? [];
  const service = services.find((s) => s.id === serviceId) ?? null;
  const otherValue = Number(other.replace(/\D/g, '')) || 0;
  const value = kind === 'servicio' ? service?.priceCLP ?? 0 : amount ?? otherValue;
  const rates = catalog?.business.pricing ?? NO_FEES;
  const price = useMemo(() => quote(value, 0, rates), [value, rates]);
  const preview: CardData = {
    code: 'WS-XXXX-XXXX', kind, amountCLP: value, service: service ? { name: service.name } : null,
    from: from.trim(), to: to.trim() || 'Alguien especial', message: message.trim(), expiresAt: until,
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string | undefined> = {};
    if (kind === 'monto' && (!Number.isInteger(value) || value < MIN || value > MAX)) errs.amountCLP = `Elige un monto entre ${clp.format(MIN)} y ${clp.format(MAX)}.`;
    if (kind === 'servicio' && !service) errs.serviceId = 'Elige un servicio.';
    if (!from.trim()) errs.from = 'Escribe quién regala.';
    if (!to.trim()) errs.to = 'Escribe para quién es.';
    if (message.length > MAX_MESSAGE) errs.message = fieldMessage('too_long');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = fieldMessage('invalid_email');
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await giftCards.purchase({ kind, amountCLP: kind === 'monto' ? value : undefined, serviceId: kind === 'servicio' ? serviceId : undefined, from: from.trim(), to: to.trim(), message: message.trim(), email: email.trim() });
      location.assign(r.initPoint);
    } catch (err) {
      setBusy(false);
      if (!(err instanceof ApiError) || err.status === 0) { setSubmitError('No pudimos conectar. Inténtalo de nuevo.'); return; }
      if (err.status === 401) { session.setUser(null); return; }
      if (Object.keys(err.fields).length) { setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, fieldMessage(v)]))); return; }
      setSubmitError(err.message);
    }
  }

  const title = <h1 className="ag-h1">Regala WS Style</h1>;
  if (session.status === 'loading' || load === 'loading' || load === 'waking') {
    return <Shell user={user} current="regalar">{title}<Spinner label={load === 'waking' ? 'Despertando la agenda…' : 'Cargando…'} /></Shell>;
  }
  if (session.status === 'offline' || load === 'error') return <Shell user={user} current="regalar">{title}<Unavailable whatsapp={whatsapp} onRetry={() => location.reload()} /></Shell>;
  if (returning) return <Shell user={user} current="regalar">{title}<GiftReturn id={returning} result={params.get('pago')} /></Shell>;
  // AC-10: venta apagada (o sin Mercado Pago) → aviso; el canje de tarjetas activas sigue en la reserva.
  if (!catalog?.business.giftCards?.online) {
    return (
      <Shell user={user} current="regalar">
        {title}
        <div className="ag-card ag-narrow" data-gift-offline="">
          <p>{OFFLINE}.</p>
          <div className="ag-actions ag-actions--wrap">
            {whatsapp && <a className="btn btn--primary" href={whatsapp} target="_blank" rel="noopener">Escríbenos por WhatsApp</a>}
            <a className="btn btn--ghost" href="/wstyle/reservar/">¿Tienes una? Reserva y úsala</a>
          </div>
        </div>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell user={user} current="regalar">
        {title}
        <div className="ag-card ag-narrow" data-gate="">
          <Notice>Para comprar una gift card, primero entra a tu cuenta.</Notice>
          <AuthPanel facebook={session.facebook} google={session.google} returnTo="/wstyle/regalar/" fbReturn={fbReturn} title="Entra o crea tu cuenta" onAuthed={(u) => session.setUser(u)} />
        </div>
      </Shell>
    );
  }
  return (
    <Shell user={user} current="regalar">
      {title}
      <p className="ag-muted">Un monto o un servicio, con tu mensaje. Te llega al correo lista para descargar o mandar por WhatsApp.</p>
      <div className="gc-layout">
        <form className="ag-card" onSubmit={submit} noValidate data-gift-form="">
          <fieldset className="gc-tabs">
            <legend className="ag-sr">Qué regalas</legend>
            <label className={`ag-option ag-radio${kind === 'monto' ? ' is-selected' : ''}`}>
              <input type="radio" name="kind" checked={kind === 'monto'} onChange={() => setKind('monto')} /><span className="ag-option__name">Un monto</span>
            </label>
            <label className={`ag-option ag-radio${kind === 'servicio' ? ' is-selected' : ''}`}>
              <input type="radio" name="kind" checked={kind === 'servicio'} onChange={() => setKind('servicio')} /><span className="ag-option__name">Un servicio</span>
            </label>
          </fieldset>
          {kind === 'monto' ? (
            <div className={`ag-field${errors.amountCLP ? ' has-error' : ''}`}>
              <span id="gc-amount-l">Monto</span>
              <div className="gc-chips" role="group" aria-labelledby="gc-amount-l">
                {QUICK.map((v) => <button key={v} type="button" className="gc-chip" aria-pressed={amount === v} onClick={() => { setAmount(v); setErrors((x) => ({ ...x, amountCLP: undefined })); }}>{clp.format(v)}</button>)}
                <button type="button" className="gc-chip" aria-pressed={amount === null} onClick={() => setAmount(null)}>Otro</button>
              </div>
              {amount === null && <Field label={`Otro monto (${clp.format(MIN)} a ${clp.format(MAX)})`} inputMode="numeric" value={other} onChange={(v) => { setOther(v); setErrors((x) => ({ ...x, amountCLP: undefined })); }} />}
              {errors.amountCLP && <p className="ag-field__error" role="alert">{errors.amountCLP}</p>}
            </div>
          ) : (
            <div className={`ag-field${errors.serviceId ? ' has-error' : ''}`}>
              <label htmlFor="gc-service">Servicio</label>
              <select id="gc-service" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setErrors((x) => ({ ...x, serviceId: undefined })); }}>
                <option value="">Elige un servicio</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {clp.format(s.priceCLP)}</option>)}
              </select>
              {errors.serviceId && <p className="ag-field__error" role="alert">{errors.serviceId}</p>}
            </div>
          )}
          <Field label="De (quien regala)" value={from} maxLength={MAX_NAME} onChange={(v) => { setFrom(v); setErrors((x) => ({ ...x, from: undefined })); }} error={errors.from} />
          <Field label="Para (quien recibe)" value={to} maxLength={MAX_NAME} onChange={(v) => { setTo(v); setErrors((x) => ({ ...x, to: undefined })); }} error={errors.to} />
          <div className={`ag-field${errors.message ? ' has-error' : ''}`}>
            <label htmlFor="gc-msg">Mensaje (opcional)</label>
            <textarea id="gc-msg" rows={3} maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} aria-describedby="gc-msg-count" />
            <p className="ag-field__hint" id="gc-msg-count">{message.length}/{MAX_MESSAGE}</p>
            {errors.message && <p className="ag-field__error" role="alert">{errors.message}</p>}
          </div>
          <Field label="Tu correo (ahí te llega la tarjeta)" type="email" autoComplete="email" value={email} onChange={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
          {value > 0 && (
            <dl className="ag-breakdown" data-breakdown="gift">
              <PriceBreakdown pricing={price} serviceName={kind === 'servicio' ? `Gift card · ${service?.name ?? ''}` : 'Gift card'} />
            </dl>
          )}
          {submitError && <Notice tone="error">{submitError}</Notice>}
          <div className="ag-actions">
            <button className="btn btn--primary" disabled={busy || !(value > 0)} aria-busy={busy}>{busy ? 'Abriendo Mercado Pago…' : `Pagar ${clp.format(price.totalCLP)}`}</button>
          </div>
          <p className="ag-fine">La tarjeta vale 12 meses y se usa al reservar en ricorp.cl/wstyle/reservar.</p>
        </form>
        <div className="gc-preview" aria-label="Vista previa">
          <GiftCardArt card={preview} />
          <p className="ag-fine">Vista previa. El código real llega al pagar.</p>
        </div>
      </div>
    </Shell>
  );
}

// Vuelta de Mercado Pago: el estado lo decide el server (nunca el ?pago=).
function GiftReturn({ id, result }: { id: string; result: string | null }) {
  const [state, setState] = useState<{ status: string; token: string | null; discarded?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    giftCards.status(id).then((s) => {
      if (!alive) return;
      setState(s);
      if (s.token) location.replace(`/wstyle/regalo/?t=${encodeURIComponent(s.token)}`);
    }, (e) => alive && setError(e instanceof ApiError && e.status !== 0 ? e.message : 'No pudimos revisar tu pago.'));
    return () => { alive = false; };
  }, [id, tries]);
  useEffect(() => {
    if (state?.status !== 'pendiente_pago' || tries >= 20 || result === 'failure') return;
    const t = setTimeout(() => setTries((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [state, tries, result]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!state || state.token) return <Spinner label="Confirmando tu pago…" />;
  return (
    <div className="ag-card ag-narrow" data-gift-return={state.status}>
      {result === 'failure' ? <p>El pago no se completó. Puedes intentarlo de nuevo.</p>
        : tries >= 20 ? <p>Tu pago sigue en proceso. Te llegará la tarjeta al correo apenas Mercado Pago lo confirme.</p>
        : <Spinner label="Esperando la confirmación de Mercado Pago…" />}
      {(result === 'failure' || tries >= 20) && !state.discarded && (
        <button type="button" className="btn btn--primary" onClick={async () => location.assign((await giftCards.retry(id)).initPoint)}>Reintentar el pago</button>
      )}
    </div>
  );
}

// /wstyle/regalo/?t=<token>: la tarjeta por su enlace secreto, con [Descargar PNG] y [Compartir].
export function GiftCardPage({ ctx }: { ctx: AgendaCtx }) {
  const t = new URLSearchParams(location.search).get('t') ?? '';
  const [card, setCard] = useState<GiftCardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!t) { Promise.resolve().then(() => alive && setError('No encontramos esta gift card')); return () => { alive = false; }; }
    giftCards.card(t).then((c) => alive && setCard(c), (e) => alive && setError(e instanceof ApiError && e.status !== 0 ? e.message : 'No pudimos cargar la tarjeta.'));
    return () => { alive = false; };
  }, [t]);
  const title = <h1 className="ag-h1">Tu gift card</h1>;
  if (error) return <Shell user={ctx.session.user} current="regalar">{title}<Notice tone="error">{error}</Notice></Shell>;
  if (!card) return <Shell user={ctx.session.user} current="regalar">{title}<Spinner label="Cargando la tarjeta…" /></Shell>;
  const url = card.url || location.href;
  const text = shareText(card, url);
  const filename = `gift-card-ws-style-${card.code}.png`;
  async function download() {
    setBusy(true);
    try {
      const blob = await cardPng(card!);
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    try {
      const blob = await cardPng(card!);
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (navigator.share) { await navigator.share({ text, url }); return; }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    window.open(waShareUrl(text), '_blank', 'noopener');
  }
  return (
    <Shell user={ctx.session.user} current="regalar">
      {title}
      <div className="gc-single" data-gift-page="">
        {card.status !== 'activa' && <Notice tone={card.status === 'usada' ? 'info' : 'error'}>Esta gift card está {card.statusLabel.toLowerCase()}.</Notice>}
        <GiftCardArt card={card} />
        <div className="gc-actions">
          <button type="button" className="btn btn--primary" onClick={download} disabled={busy} aria-busy={busy} data-download="">Descargar PNG</button>
          <button type="button" className="btn btn--ghost" onClick={share}>Compartir</button>
          <a className="btn btn--ghost" href={waShareUrl(text)} target="_blank" rel="noopener">Enviar por WhatsApp</a>
        </div>
        {card.status === 'activa' && <p className="ag-muted">Saldo disponible: {clp.format(card.balanceCLP)} · <a href={`/wstyle/reservar/?giftcard=${encodeURIComponent(card.code)}`}>Reservar con este código</a></p>}
      </div>
    </Shell>
  );
}
