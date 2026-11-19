import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { agenda, ApiError, type Catalog, type WaitlistOffer } from '../api';
import type { AgendaCtx } from '../ctx';
import { TimeChips } from '../components/Calendar';
import PriceBreakdown from '../components/PriceBreakdown';
import Shell from '../components/Shell';
import { Field, Notice, Spinner } from '../components/ui';
import { NO_FEES, quote as priceQuote } from '../pricing';
import { clMobile, clp, fieldMessage, longDay, prettyPhone } from '../util';
import { PREF_LABEL } from '../waitlist';

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const TAKEN = 'Alguien tomó esta hora antes. Sigues en la lista de espera.';

// SPEC-54 §5: /wstyle/reservar/?espera=<token> (link del aviso). Ya con sesión: paso "Revisar" con servicio, barbero y
// día del aviso, las horas libres compatibles y la forma de pago; la cita se crea por el flujo normal (+ waitlistToken).
export default function WaitlistTake({ ctx, token, catalog }: { ctx: AgendaCtx; token: string; catalog: Catalog }) {
  const { session } = ctx;
  const user = session.user!;
  const [offer, setOffer] = useState<WaitlistOffer | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | undefined>();
  const [phone, setPhone] = useState('');
  const [accept, setAccept] = useState(false);
  const [payPick, setPayPick] = useState<'local' | 'online' | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const idem = useRef(newKey());

  const payments = catalog.business.payments ?? { online: false, local: true };
  const pay: 'local' | 'online' = payPick && payments[payPick] ? payPick : payments.local ? 'local' : 'online';
  const policies = catalog.business.policies ?? [];

  const { setUser } = session;
  const expire = useCallback(() => setUser(null), [setUser]);
  const loadOffer = useCallback(() => {
    agenda.waitlistOffer(token).then((o) => {
      setOffer(o);
      // Sin horas ya se muestra "Alguien tomó esta hora antes…" en la tarjeta: no repetirlo arriba.
      if (!o.slots.length) setNotice(null);
      setStartsAt((cur) => (o.slots.some((s) => s.startsAt === cur) ? cur : o.slots.length === 1 ? o.slots[0].startsAt : undefined));
    }, (e) => {
      if (e instanceof ApiError && e.status === 401) { expire(); return; }
      setFatal(e instanceof ApiError && e.status ? e.message : 'No pudimos conectar con la agenda. Recarga la página para intentarlo de nuevo.');
    });
  }, [token, expire]);
  useEffect(() => {
    const t = setTimeout(loadOffer);
    return () => clearTimeout(t);
  }, [loadOffer]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!offer || busy) return;
    const errs: Record<string, string | undefined> = {};
    const needPhone = !user.phone;
    if (!startsAt) errs.startsAt = 'Elige una hora.';
    if (needPhone && !clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    if (!accept) errs.acceptPolicies = 'Debes aceptar las políticas para agendar.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    setNotice(null);
    try {
      const r = await agenda.create({
        serviceId: offer.service.id, professionalId: offer.professional.id, startsAt, mode: 'shop', note: '',
        phone: needPhone ? phone : undefined, acceptPolicies: accept, paymentMethod: pay, idempotencyKey: idem.current, waitlistToken: token,
      });
      if (r.appointment?.status === 'pendiente_pago') {
        setRedirecting(true);
        try {
          const co = await agenda.checkout(r.id);
          location.assign(co.initPoint);
        } catch {
          location.assign(`/wstyle/cita/?id=${encodeURIComponent(r.id)}&pago=error`);
        }
        return;
      }
      location.assign(`/wstyle/cita/?id=${encodeURIComponent(r.id)}`);
    } catch (err) {
      idem.current = newKey();
      if (!(err instanceof ApiError) || err.status === 0) { setSubmitError('No pudimos conectar con la agenda. Inténtalo de nuevo.'); return; }
      if (err.status === 401) { expire(); return; }
      if (err.code === 'slot_taken' || err.code === 'slot_unavailable') { setNotice(err.code === 'slot_taken' ? err.message || TAKEN : err.message); setStartsAt(undefined); loadOffer(); return; }
      if (Object.keys(err.fields).length) { setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, k === 'acceptPolicies' ? 'Debes aceptar las políticas para agendar.' : fieldMessage(v)]))); return; }
      if ([403, 404, 409, 410].includes(err.status)) { setFatal(err.message); return; }
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const links = (
    <div className="ag-actions ag-actions--wrap">
      <a className="btn btn--primary" href="/wstyle/reservar/">Reservar otra hora</a>
      <a className="btn btn--ghost" href="/wstyle/cuenta/mis-citas/">Mis citas</a>
    </div>
  );

  let body;
  if (fatal) body = <div className="ag-card ag-narrow" data-waitlist-take="error"><Notice tone="error">{fatal}</Notice>{links}</div>;
  else if (!offer) body = <Spinner label="Buscando la hora que se liberó…" />;
  else {
    const price = priceQuote(offer.service.priceCLP, 0, catalog.business.pricing ?? NO_FEES);
    const date = offer.entry.date;
    body = (
      <section className="ag-card ag-narrow" aria-labelledby="ag-wt-title" data-waitlist-take="review">
        <h2 className="ag-h2" id="ag-wt-title">Revisar</h2>
        {notice && <Notice tone="error">{notice}</Notice>}
        <dl className="ag-breakdown">
          <div><dt>Servicio</dt><dd>{offer.service.name}</dd></div>
          <div><dt>Barbero</dt><dd>{offer.professional.name}</dd></div>
          <div><dt>Día</dt><dd>{longDay(date)}</dd></div>
          <div><dt>Te sirve</dt><dd>{PREF_LABEL[offer.entry.pref] ?? '—'}</dd></div>
        </dl>
        {offer.slots.length === 0 ? (
          <><Notice>{TAKEN}</Notice>{links}</>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3 className="ag-h3">{offer.slots.length === 1 ? 'La hora' : 'Elige la hora'}</h3>
            <TimeChips slots={offer.slots} selected={startsAt} onSelect={(s) => { setStartsAt(s.startsAt); setErrors((x) => ({ ...x, startsAt: undefined })); }} label={`Horas libres del ${longDay(date)}`} />
            {errors.startsAt && <p className="ag-field__error" role="alert">{errors.startsAt}</p>}
            {user.phone ? <p className="ag-muted">Celular: {prettyPhone(user.phone)}</p>
              : <Field label="Celular" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={phone} onChange={(v) => { setPhone(v); setErrors((x) => ({ ...x, phone: undefined })); }} error={errors.phone} />}
            <dl className="ag-breakdown" data-breakdown="">
              <PriceBreakdown pricing={price} serviceName={offer.service.name} />
            </dl>
            <fieldset className="ag-options ag-pay">
              <legend>Forma de pago</legend>
              {payments.local && (
                <label className={`ag-option ag-radio${pay === 'local' ? ' is-selected' : ''}`}>
                  <input type="radio" name="pay" value="local" checked={pay === 'local'} onChange={() => setPayPick('local')} />
                  <span><span className="ag-option__name">Pagar en el local</span><span className="ag-option__meta">{policies.find((p) => /pago/i.test(p.title))?.text ?? 'Efectivo, débito o crédito.'}</span></span>
                </label>
              )}
              {payments.online && (
                <label className={`ag-option ag-radio${pay === 'online' ? ' is-selected' : ''}`}>
                  <input type="radio" name="pay" value="online" checked={pay === 'online'} onChange={() => setPayPick('online')} />
                  <span><span className="ag-option__name">Pagar en línea</span><span className="ag-option__meta">Con Mercado Pago (tarjeta de crédito, débito o prepago). Te guardamos la hora 15 minutos mientras pagas.</span></span>
                </label>
              )}
            </fieldset>
            <div className={`ag-field ag-check${errors.acceptPolicies ? ' has-error' : ''}`}>
              <label>
                <input type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); setErrors((x) => ({ ...x, acceptPolicies: undefined })); }} aria-invalid={errors.acceptPolicies ? true : undefined} aria-describedby={errors.acceptPolicies ? 'ag-wt-pol-err' : undefined} />
                <span>Acepto las políticas del local{policies.length ? `: ${policies.map((p) => p.title).join(', ')}` : ''}. <a href="/wstyle/#politicas" target="_blank" rel="noopener">Leer</a></span>
              </label>
              {errors.acceptPolicies && <p className="ag-field__error" id="ag-wt-pol-err" role="alert">{errors.acceptPolicies}</p>}
            </div>
            {submitError && <Notice tone="error">{submitError}</Notice>}
            <div className="ag-actions">
              <a className="btn btn--ghost" href="/wstyle/cuenta/mis-citas/">Mis citas</a>
              <button className="btn btn--primary" disabled={busy || redirecting} aria-busy={busy || redirecting} data-pay={pay}>
                {redirecting ? 'Abriendo Mercado Pago…' : busy ? 'Confirmando…' : pay === 'online' ? `Ir a pagar ${clp.format(price.totalCLP)}` : 'Confirmar cita'}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  return (
    <Shell user={user} current="reservar">
      <h1 className="ag-h1">Tomar la hora que se liberó</h1>
      {body}
    </Shell>
  );
}
