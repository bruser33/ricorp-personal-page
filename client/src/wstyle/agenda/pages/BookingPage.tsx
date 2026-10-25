import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { agenda, ApiError, auth, type Appointment, type Catalog, type Quote, type Slot } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import Calendar, { TimeChips } from '../components/Calendar';
import Shell from '../components/Shell';
import { Field, MotoIcon, Notice, Spinner, Unavailable } from '../components/ui';
import {
  addDays, buildIcs, clMobile, clp, dayMonthTime, fieldMessage, loadSelection, localDate, longDay, MAX_NOTE, prettyPhone,
  saveSelection, selectionFromQuery, selectionToQuery, type Selection,
} from '../util';

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS = ['Servicio', 'Día y hora', 'Dónde', 'Confirmar'];
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

function initialSelection(): Selection {
  // La URL manda (vuelta de Facebook, link desde la landing ?servicio= / ?barbero=); lo demás sale del sessionStorage.
  const fromUrl = selectionFromQuery(location.search);
  const stored = loadSelection();
  const fresh = Object.keys(fromUrl).length > 0 && (fromUrl.serviceId !== stored.serviceId || (fromUrl.startsAt && fromUrl.startsAt !== stored.startsAt));
  return fresh ? { ...(fromUrl.serviceId === stored.serviceId ? stored : {}), ...fromUrl } : { ...stored, ...fromUrl };
}

// /wstyle/reservar/: el flujo de reserva (SPEC-32, 4 pasos + confirmación). Agendar exige sesión, pero el registro
// o login ocurre DENTRO del paso 4 sin perder la selección.
export default function BookingPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [load, setLoad] = useState<'loading' | 'waking' | 'error' | 'ready'>('loading');
  const [sel, setSel] = useState<Selection>(initialSelection);
  const [step, setStep] = useState<Step>(1);
  const [today, setToday] = useState(() => localDate(Date.now()));
  const [month, setMonth] = useState(() => {
    const d = sel.date ?? localDate(Date.now());
    return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) };
  });
  const [avail, setAvail] = useState<Map<string, Slot[]> | null>(null);
  const [slotPros, setSlotPros] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [addrErr, setAddrErr] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [accept, setAccept] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [done, setDone] = useState<{ appt: Appointment; mailOk?: boolean } | null>(null);
  const idem = useRef(newKey());
  const authedInFlow = useRef(false);
  const restored = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const service = catalog?.services.find((s) => s.id === sel.serviceId) ?? null;
  const pros = useMemo(() => (catalog && service ? catalog.professionals.filter((p) => p.serviceIds.includes(sel.serviceId!)) : []), [catalog, service, sel.serviceId]);
  const pro = sel.professionalId && sel.professionalId !== 'any' ? pros.find((p) => p.id === sel.professionalId) ?? null : null;
  const homePros = (sel.professionalId === 'any' ? pros : pro ? [pro] : []).filter((p) => p.homeService && service?.homeServiceAllowed !== false);
  const mode = sel.mode ?? 'shop';
  const lastDay = catalog ? addDays(today, catalog.business.settings.horizonDays) : addDays(today, 30);
  const user = session.user;

  const update = useCallback((patch: Partial<Selection>) => setSel((s) => ({ ...s, ...patch })), []);
  useEffect(() => { saveSelection(sel); }, [sel]);

  // Catálogo con "Despertando la agenda…" (CB-15).
  const selRef = useRef(sel);
  useEffect(() => { selRef.current = sel; }, [sel]);
  const fetchCatalog = useCallback(() => {
    setLoad('loading');
    agenda.catalog(() => setLoad('waking')).then((c) => {
      setCatalog(c);
      setLoad('ready');
      // Paso inicial según lo que ya venía elegido (vuelta de Facebook / recarga), una sola vez.
      if (restored.current) return;
      restored.current = true;
      const cur = selRef.current;
      const svc = c.services.find((x) => x.id === cur.serviceId);
      const okPro = cur.professionalId === 'any' || c.professionals.some((p) => p.id === cur.professionalId);
      if (!svc) { setSel((x) => ({ ...x, serviceId: undefined, startsAt: undefined })); return; }
      if (cur.professionalId && okPro) setStep(cur.startsAt ? (cur.mode === 'home' && !cur.address ? 3 : 4) : 2);
    }, () => setLoad('error'));
  }, []);
  useEffect(() => {
    const t = setTimeout(fetchCatalog);
    return () => clearTimeout(t);
  }, [fetchCatalog]);

  // Horas libres del mes visible (recalcula al cambiar servicio, barbero o modo).
  useEffect(() => {
    if (!catalog || !sel.serviceId || !sel.professionalId || step < 2) return;
    let alive = true;
    const first = `${month.y}-${String(month.m).padStart(2, '0')}-01`;
    const last = addDays(`${month.m === 12 ? month.y + 1 : month.y}-${String((month.m % 12) + 1).padStart(2, '0')}-01`, -1);
    const from = first < today ? today : first;
    const to = last > lastDay ? lastDay : last;
    Promise.resolve().then(() => alive && setAvail(null));
    if (from > to) { Promise.resolve().then(() => alive && setAvail(new Map())); return () => { alive = false; }; }
    agenda.availability({ service: sel.serviceId, professional: sel.professionalId, from, to, mode })
      .then((r) => { if (alive) setAvail(new Map(r.days.map((d) => [d.date, d.slots]))); })
      .catch(() => { if (alive) { setAvail(new Map()); setNotice('No pudimos cargar las horas. Revisa tu conexión y vuelve a intentarlo.'); } });
    return () => { alive = false; };
  }, [catalog, sel.serviceId, sel.professionalId, mode, month, today, lastDay, step]);

  // Si al volver (Facebook / recarga) la hora ya no está libre: paso 2 con el resto intacto.
  useEffect(() => {
    if (step !== 4 || !avail || !sel.startsAt || !sel.date) return;
    const day = avail.get(sel.date);
    if (!day) return;
    const slot = day.find((s) => s.startsAt === sel.startsAt);
    if (slot) { Promise.resolve().then(() => setSlotPros(slot.professionalIds)); return; }
    Promise.resolve().then(() => {
      setNotice(authedInFlow.current || fbReturn ? 'Esa hora se ocupó mientras creabas tu cuenta. Elige otra.' : 'Esa hora ya no está disponible. Elige otra.');
      setSel((s) => ({ ...s, startsAt: undefined }));
      setStep(2);
    });
  }, [avail, step, sel.startsAt, sel.date, fbReturn]);

  useEffect(() => { heading.current?.focus(); }, [step]);

  // ─── Acciones de cada paso
  const pickService = (id: string) => { update({ serviceId: id, startsAt: undefined }); setQuote(null); };
  const pickPro = (id: string) => { update({ professionalId: id, startsAt: undefined }); setQuote(null); };
  const pickDay = (date: string) => update({ date, startsAt: undefined });
  const pickSlot = (s: Slot) => { update({ startsAt: s.startsAt }); setSlotPros(s.professionalIds); setNotice(null); };

  async function continueFromWhere() {
    if (mode === 'shop') return setStep(4);
    if (!quote) return setQuoteErr('Calcula el domicilio para ver el total.');
    // A domicilio la hora ocupa además el traslado: se revisa que siga libre con ese margen.
    setBusy(true);
    try {
      const r = await agenda.availability({ service: sel.serviceId!, professional: sel.professionalId!, from: sel.date!, to: sel.date!, mode: 'home' });
      const slot = r.days[0]?.slots.find((s) => s.startsAt === sel.startsAt);
      if (!slot) {
        setNotice('A domicilio esa hora no alcanza (se suma el traslado). Elige otra hora.');
        update({ startsAt: undefined });
        setStep(2);
        return;
      }
      setSlotPros(slot.professionalIds);
      setStep(4);
    } catch {
      setQuoteErr('No pudimos revisar la hora. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function calcQuote(e: FormEvent) {
    e.preventDefault();
    const a = sel.address ?? { street: '', commune: '', details: '' };
    const errs = { street: a.street.trim() ? undefined : fieldMessage('required'), commune: a.commune.trim() ? undefined : fieldMessage('required') };
    setAddrErr(errs);
    setQuote(null);
    setQuoteErr(null);
    if (errs.street || errs.commune) return;
    setBusy(true);
    try {
      setQuote(await agenda.quote({ serviceId: sel.serviceId!, professionalId: sel.professionalId!, address: a }));
    } catch (err) {
      setQuoteErr(err instanceof ApiError && err.status ? err.message : 'No pudimos calcular el domicilio. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const homeQuote = quote ? quote.professionals.find((p) => slotPros.length === 0 || slotPros.includes(p.id)) ?? quote.professionals[0] : null;
  const surcharge = mode === 'home' && homeQuote ? homeQuote.surchargeCLP : 0;
  const total = (service?.priceCLP ?? 0) + surcharge;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    const errs: Record<string, string | undefined> = {};
    const needPhone = !user.phone;
    if (needPhone && !clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    if ((sel.note ?? '').length > MAX_NOTE) errs.note = fieldMessage('too_long');
    if (!accept) errs.acceptPolicies = 'Debes aceptar las políticas para agendar.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await agenda.create({
        serviceId: sel.serviceId, professionalId: sel.professionalId, startsAt: sel.startsAt, mode,
        address: mode === 'home' ? sel.address : undefined, phone: needPhone ? phone : undefined, note: sel.note ?? '',
        acceptPolicies: accept, paymentMethod: 'local', idempotencyKey: idem.current, website,
      });
      if (!r.appointment) { setSubmitError('No pudimos agendar. Inténtalo de nuevo.'); return; }
      setDone({ appt: r.appointment, mailOk: r.mailOk });
      setSel({});
      setStep(5);
    } catch (err) {
      idem.current = newKey();
      if (!(err instanceof ApiError) || err.status === 0) { setSubmitError('No pudimos conectar con la agenda. Tus datos siguen aquí: inténtalo de nuevo.'); return; }
      if (err.status === 429) { setSubmitError('Demasiados intentos de reserva desde esta conexión. Espera unos minutos e inténtalo de nuevo.'); return; }
      if (err.status === 401) { session.setUser(null); setSubmitError('Tu sesión venció. Entra de nuevo para agendar; tu selección sigue aquí.'); return; }
      if (err.code === 'slot_taken' || err.code === 'slot_unavailable') {
        setNotice(authedInFlow.current ? 'Esa hora se ocupó mientras creabas tu cuenta. Elige otra.' : err.code === 'slot_taken' ? 'Esa hora se acaba de ocupar. Elige otra.' : err.message);
        update({ startsAt: undefined });
        setMonth((m) => ({ ...m }));
        setStep(2);
        return;
      }
      if (err.code === 'out_of_range' || err.code === 'address_not_found') { setQuote(null); setQuoteErr(err.message); setStep(3); return; }
      if (Object.keys(err.fields).length) { setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, k === 'acceptPolicies' ? 'Debes aceptar las políticas para agendar.' : fieldMessage(v)]))); return; }
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ─── Render
  if (load !== 'ready' || !catalog) {
    return (
      <Shell user={user} current="reservar">
        <h1 className="ag-h1">Reserva tu hora</h1>
        {load === 'error' ? <Unavailable whatsapp={whatsapp} onRetry={() => { setToday(localDate(Date.now())); fetchCatalog(); }} />
          : <Spinner label={load === 'waking' ? 'Despertando la agenda…' : 'Cargando la agenda…'} />}
      </Shell>
    );
  }

  if (step === 5 && done) return <Shell user={user} current="reservar"><Success appt={done.appt} mailOk={done.mailOk} /></Shell>;

  const proName = sel.professionalId === 'any' ? 'Sin preferencia' : pro?.name ?? '';
  const policies = catalog.business.policies ?? [];
  const returnTo = `/wstyle/reservar/?${selectionToQuery(sel)}`;
  const where = mode === 'home' ? quote?.formatted ?? sel.address?.street ?? '' : [catalog.business.address?.street, catalog.business.address?.city].filter(Boolean).join(', ');

  return (
    <Shell user={user} current="reservar">
      <h1 className="ag-h1">Reserva tu hora</h1>
      <ol className="ag-steps" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="ag-steps__n">{i + 1}</span><span className="ag-steps__l">{label}</span>
          </li>
        ))}
      </ol>
      <div className="ag-layout">
        <section className="ag-card ag-stepcard" aria-labelledby="ag-step-title">
          {step === 1 && (
            <>
              <h2 className="ag-h2" id="ag-step-title" tabIndex={-1} ref={heading}>Servicio y barbero</h2>
              <fieldset className="ag-options">
                <legend>¿Qué te hacemos?</legend>
                {catalog.services.map((s) => (
                  <button key={s.id} type="button" className={`ag-option${sel.serviceId === s.id ? ' is-selected' : ''}`} aria-pressed={sel.serviceId === s.id} onClick={() => pickService(s.id)}>
                    <span>
                      <span className="ag-option__name">{s.name}</span>
                      <span className="ag-option__meta">{clp.format(s.priceCLP)} · dura ~{s.durationMin} min</span>
                    </span>
                  </button>
                ))}
              </fieldset>
              {service && (
                <fieldset className="ag-options ag-options--pros">
                  <legend>¿Con quién?</legend>
                  {pros.length === 0 && <p className="ag-muted">Por ahora nadie atiende este servicio en línea. Escríbenos por WhatsApp.</p>}
                  {pros.map((p) => (
                    <button key={p.id} type="button" className={`ag-option ag-pro${sel.professionalId === p.id ? ' is-selected' : ''}`} aria-pressed={sel.professionalId === p.id} onClick={() => pickPro(p.id)}>
                      <span className="ag-pro__avatar" aria-hidden="true">{p.photo ? <img src={p.photo} alt="" /> : p.name.charAt(0)}</span>
                      <span>
                        <span className="ag-option__name">{p.name} {p.homeService && <span className="ag-tag" title="Hace domicilio"><MotoIcon /><span className="ag-sr">Hace domicilio</span></span>}</span>
                        {p.specialty && <span className="ag-option__meta">{p.specialty}</span>}
                      </span>
                    </button>
                  ))}
                  {pros.length > 1 && (
                    <button type="button" className={`ag-option ag-pro${sel.professionalId === 'any' ? ' is-selected' : ''}`} aria-pressed={sel.professionalId === 'any'} onClick={() => pickPro('any')}>
                      <span className="ag-pro__avatar" aria-hidden="true">✶</span>
                      <span><span className="ag-option__name">Sin preferencia</span><span className="ag-option__meta">Te asignamos al que tenga la hora libre</span></span>
                    </button>
                  )}
                </fieldset>
              )}
              <div className="ag-actions">
                <button type="button" className="btn btn--primary" disabled={!service || !sel.professionalId || !(sel.professionalId === 'any' || pro)} onClick={() => { setNotice(null); setStep(2); }}>Continuar</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="ag-h2" id="ag-step-title" tabIndex={-1} ref={heading}>Día y hora</h2>
              {notice && <Notice tone="error">{notice}</Notice>}
              <Calendar year={month.y} month={month.m} today={today} lastDay={lastDay} slotsByDay={avail} selected={sel.date}
                onSelect={pickDay} onMonth={(y, m) => setMonth({ y, m })} />
              {sel.date && avail && (
                <div className="ag-daytimes">
                  <h3 className="ag-h3">Selecciona la hora · {longDay(sel.date)}</h3>
                  <TimeChips slots={avail.get(sel.date) ?? []} selected={sel.startsAt} onSelect={pickSlot} label={`Horas libres del ${longDay(sel.date)}`} />
                </div>
              )}
              <div className="ag-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>Volver</button>
                <button type="button" className="btn btn--primary" disabled={!sel.startsAt} onClick={() => setStep(3)}>Continuar</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="ag-h2" id="ag-step-title" tabIndex={-1} ref={heading}>¿Dónde te atendemos?</h2>
              <fieldset className="ag-options">
                <legend className="ag-sr">Lugar</legend>
                <label className={`ag-option ag-radio${mode === 'shop' ? ' is-selected' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'shop'} onChange={() => { update({ mode: 'shop' }); setQuote(null); setQuoteErr(null); }} />
                  <span><span className="ag-option__name">En el local</span><span className="ag-option__meta">{[catalog.business.address?.street, catalog.business.address?.city].filter(Boolean).join(', ')}</span></span>
                </label>
                {homePros.length > 0 && (
                  <label className={`ag-option ag-radio${mode === 'home' ? ' is-selected' : ''}`}>
                    <input type="radio" name="mode" checked={mode === 'home'} onChange={() => update({ mode: 'home' })} />
                    <span><span className="ag-option__name">A domicilio <MotoIcon /></span><span className="ag-option__meta">Recargo desde {clp.format(Math.min(...homePros.map((p) => p.homeService!.surchargeCLP)))}</span></span>
                  </label>
                )}
              </fieldset>
              {mode === 'home' && (
                <form className="ag-address" onSubmit={calcQuote} noValidate>
                  <Field label="Calle y número" autoComplete="address-line1" value={sel.address?.street ?? ''} error={addrErr.street}
                    onChange={(v) => { update({ address: { street: v, commune: sel.address?.commune ?? '', details: sel.address?.details ?? '' } }); setQuote(null); }} />
                  <Field label="Comuna" autoComplete="address-level2" value={sel.address?.commune ?? ''} error={addrErr.commune}
                    onChange={(v) => { update({ address: { street: sel.address?.street ?? '', commune: v, details: sel.address?.details ?? '' } }); setQuote(null); }} />
                  <Field label="Depto / indicaciones (opcional)" value={sel.address?.details ?? ''} maxLength={120}
                    onChange={(v) => update({ address: { street: sel.address?.street ?? '', commune: sel.address?.commune ?? '', details: v } })} />
                  <button className="btn btn--ghost" disabled={busy}>Calcular domicilio</button>
                </form>
              )}
              {quoteErr && <Notice tone="error">{quoteErr}</Notice>}
              {mode === 'home' && quote && homeQuote && (
                <dl className="ag-breakdown" data-breakdown="">
                  <div><dt>Servicio</dt><dd>{clp.format(service!.priceCLP)}</dd></div>
                  <div><dt>Domicilio ({quote.distanceKm.toLocaleString('es-CL')} km)</dt><dd>{clp.format(homeQuote.surchargeCLP)}</dd></div>
                  <div className="ag-breakdown__total"><dt>Total</dt><dd>{clp.format(homeQuote.totalCLP)}</dd></div>
                </dl>
              )}
              <div className="ag-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>Volver</button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={continueFromWhere}>Continuar</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="ag-h2" id="ag-step-title" tabIndex={-1} ref={heading}>Tu cuenta y pago</h2>
              {welcome && <Notice tone="ok">{welcome}</Notice>}
              {!user ? (
                <>
                  <Notice>Para agendar necesitas una cuenta. Tu selección se mantiene.</Notice>
                  {submitError && <Notice tone="error">{submitError}</Notice>}
                  <AuthPanel facebook={session.facebook} returnTo={returnTo} fbReturn={fbReturn} beforeFacebook={() => saveSelection(sel)}
                    onAuthed={(u, info) => {
                      authedInFlow.current = true;
                      session.setUser(u);
                      setSubmitError(null);
                      setWelcome(info.created ? `¡Listo, ${u.name.split(' ')[0]}! Te enviamos un correo para confirmar tu email.` : `Hola de nuevo, ${u.name.split(' ')[0]}.`);
                    }} />
                </>
              ) : !user.roles.includes('client') ? (
                <div>
                  <p>Tu cuenta es de barbero o administración. Para reservar para ti, agrega el perfil de cliente.</p>
                  <button type="button" className="btn btn--primary" onClick={async () => session.setUser(await auth.addClientRole())}>Agendar como cliente</button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <p className="ag-muted">Agendando como <strong>{user.name}</strong> · {user.email} (<button type="button" className="ag-link" onClick={() => session.logout()}>¿no eres tú? Cerrar sesión</button>)</p>
                  {!user.emailVerified && !welcome && (
                    <Notice>Aún no confirmas tu correo. Puedes agendar igual; <button type="button" className="ag-link" onClick={() => auth.resendVerification()}>reenviar el link</button>.</Notice>
                  )}
                  {user.phone ? <p className="ag-muted">Celular: {prettyPhone(user.phone)}</p>
                    : <Field label="Celular" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={phone} onChange={(v) => { setPhone(v); setErrors((e) => ({ ...e, phone: undefined })); }} error={errors.phone} hint="Para avisarte si cambia algo." />}
                  <div className={`ag-field${errors.note ? ' has-error' : ''}`}>
                    <label htmlFor="ag-note">Nota para el barbero (opcional)</label>
                    <textarea id="ag-note" rows={3} maxLength={MAX_NOTE + 50} value={sel.note ?? ''} onChange={(e) => { update({ note: e.target.value }); if (e.target.value.length <= MAX_NOTE) setErrors((x) => ({ ...x, note: undefined })); }}
                      aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? 'ag-note-err' : 'ag-note-count'} />
                    <p className="ag-field__hint" id="ag-note-count">{(sel.note ?? '').length}/{MAX_NOTE}</p>
                    {errors.note && <p className="ag-field__error" id="ag-note-err" role="alert">{errors.note}</p>}
                  </div>
                  <fieldset className="ag-options ag-pay">
                    <legend>Forma de pago</legend>
                    <label className="ag-option ag-radio is-selected">
                      <input type="radio" name="pay" checked readOnly />
                      <span><span className="ag-option__name">Pagar en el local</span><span className="ag-option__meta">{policies.find((p) => /pago/i.test(p.title))?.text ?? 'Efectivo, débito o crédito.'}</span></span>
                    </label>
                  </fieldset>
                  <div className={`ag-field ag-check${errors.acceptPolicies ? ' has-error' : ''}`}>
                    <label>
                      <input type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); setErrors((x) => ({ ...x, acceptPolicies: undefined })); }} aria-invalid={errors.acceptPolicies ? true : undefined} aria-describedby={errors.acceptPolicies ? 'ag-pol-err' : undefined} />
                      <span>Acepto las políticas del local{policies.length ? `: ${policies.map((p) => p.title).join(', ')}` : ''}. <a href="/wstyle/#politicas" target="_blank" rel="noopener">Leer</a></span>
                    </label>
                    {errors.acceptPolicies && <p className="ag-field__error" id="ag-pol-err" role="alert">{errors.acceptPolicies}</p>}
                  </div>
                  {/* Honeypot: invisible para personas (RN-14). */}
                  <div className="ag-hp" aria-hidden="true"><label>Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" /></label></div>
                  {submitError && <Notice tone="error">{submitError}</Notice>}
                  <div className="ag-actions">
                    <button type="button" className="btn btn--ghost" onClick={() => setStep(3)}>Volver</button>
                    <button className="btn btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Agendando…' : 'Agendar cita'}</button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        <aside className="ag-card ag-summary" aria-label="Resumen de tu reserva">
          <h2 className="ag-h3">Tu reserva</h2>
          <dl>
            <div><dt>Servicio</dt><dd>{service ? `${service.name} · ${clp.format(service.priceCLP)}` : '—'}</dd></div>
            <div><dt>Barbero</dt><dd>{proName || '—'}</dd></div>
            <div><dt>Fecha y hora</dt><dd>{sel.startsAt ? `${longDay(localDate(sel.startsAt))}, ${dayMonthTime(sel.startsAt).split(', ')[1]}` : '—'}</dd></div>
            <div><dt>Dónde</dt><dd>{step >= 3 ? (mode === 'home' ? `A domicilio${where ? ` · ${where}` : ''}` : `En el local · ${where}`) : '—'}</dd></div>
            <div className="ag-summary__total"><dt>Total</dt><dd>{service ? clp.format(total) : '—'}</dd></div>
          </dl>
        </aside>
      </div>
    </Shell>
  );
}

function Success({ appt, mailOk }: { appt: Appointment; mailOk?: boolean }) {
  const url = `${location.origin}/wstyle/cita/?id=${appt.id}`;
  const ics = useMemo(() => {
    const body = buildIcs({ id: appt.id, startsAt: appt.startsAt, endsAt: appt.endsAt, title: `${appt.service.name} · WS Style`, location: appt.location.address ?? 'WS Style', url });
    return URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  }, [appt, url]);
  useEffect(() => () => URL.revokeObjectURL(ics), [ics]);
  return (
    <section className="ag-card ag-success" aria-labelledby="ag-ok">
      <h1 className="ag-h1" id="ag-ok" data-success="">NUEVA CITA — esperando confirmación de {appt.professional.name} — {dayMonthTime(appt.startsAt)}</h1>
      <p className="ag-muted">{appt.service.name} · {appt.location.kind === 'home' ? `A domicilio · ${appt.location.address}` : 'En el local'} · Total {clp.format(appt.pricing.totalCLP)}</p>
      <p>Te avisaremos por correo cuando {appt.professional.name} la confirme.</p>
      {mailOk === false && <Notice>No pudimos enviarte el correo. Guarda este link de tu cita: <a href={url}>{url}</a></Notice>}
      <div className="ag-actions ag-actions--wrap">
        <a className="btn btn--primary" href={`/wstyle/cita/?id=${appt.id}`}>Ver mi cita</a>
        <a className="btn btn--ghost" href="/wstyle/cuenta/mis-citas/">Mis citas</a>
        <a className="btn btn--ghost" href={ics} download="cita-ws-style.ics">Agregar al calendario</a>
        {appt.whatsapp && <a className="btn btn--ghost" href={appt.whatsapp} target="_blank" rel="noopener">Escribir al barbero por WhatsApp</a>}
      </div>
    </section>
  );
}
