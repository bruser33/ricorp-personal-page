import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, auth } from '../../agenda/api';
import AuthPanel from '../../agenda/components/AuthPanel';
import { Field, Notice, PasswordField, Spinner, Unavailable } from '../../agenda/components/ui';
import { clMobile, fieldMessage, isEmail, weakPassword } from '../../agenda/util';
import { pro, type HomeService, type ProMe, type Rule } from '../api';
import { AvailabilityEditor, HomeServiceEditor, PhotosEditor, ServicesEditor } from '../components/Editors';
import { HOME_ERRORS } from '../util';
import { PRIVACY_URL, TERMS_URL } from '../../links';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';
import ReviewState from '../components/ReviewState';

const MESSAGES: Record<string, string> = {
  invalid_name: 'Tu nombre tiene que tener entre 2 y 60 caracteres.',
  acceptTerms: 'Para continuar tienes que aceptar los términos.',
};
const msg = (field: string, code?: string) => (code ? (field === 'acceptTerms' ? MESSAGES.acceptTerms : MESSAGES[code] ?? fieldMessage(code)) : undefined);
const toErrors = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, msg(k, v)]));

const FbIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.4V21h3.1Z" /></svg>;

function Terms({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div className={`ag-field ag-check${error ? ' has-error' : ''}`}>
      <label><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} /> <span>Acepto los <a href={TERMS_URL} target="_blank" rel="noopener">términos</a> y la <a href={PRIVACY_URL} target="_blank" rel="noopener">política de privacidad</a> de WS Style.</span></label>
      {error && <p className="ag-field__error" role="alert">{error}</p>}
    </div>
  );
}

function Frame({ children, step }: { children: ReactNode; step?: number }) {
  return (
    <ProShell tab="registro">
      {step && (
        <ol className="ag-steps pro-steps" aria-label={`Paso ${step} de 3`}>
          {[1, 2, 3].map((n) => (
            <li key={n} className={n < step ? 'is-done' : n === step ? 'is-current' : ''} aria-current={n === step ? 'step' : undefined}>
              <span className="ag-steps__n">{n}/3</span>
            </li>
          ))}
        </ol>
      )}
      <div className="pro-register">{children}</div>
    </ProShell>
  );
}

// /wstyle/pro/registro/ — registro del barbero paso a paso (base del video de SPEC-36): A (email), B (Facebook) y
// el onboarding 1/3 fotos → 2/3 servicios → 3/3 horario y domicilio → "Tu perfil está en revisión".
export default function RegisterPage({ ctx }: { ctx: ProCtx }) {
  const { session, me, meState, setMe, reloadMe, fbReturn, whatsapp } = ctx;
  const user = session.user;
  const [view, setView] = useState<'email' | 'create' | 'existing' | 'check_email'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState(fbReturn?.name ?? '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fbError = fbReturn && ['error', 'no_disponible'].includes(fbReturn.fb) ? 'No se completó el inicio con Facebook. Puedes intentarlo de nuevo o usar tu correo.' : null;

  const edit = (k: string, set: (v: string) => void) => (v: string) => { set(v); setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e)); };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 0) setFormError('No pudimos conectar con la agenda. Revisa tu conexión e inténtalo de nuevo.');
        else if (Object.keys(e.fields).length) {
          setErrors(toErrors(e.fields));
          if (e.fields.phone) setShowPhone(true);
        } else if (e.status === 401 || e.status === 429) setErrors({ password: e.message });
        else setFormError(e.message);
      } else setFormError('Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function afterAuth() {
    const u = await auth.me();
    session.setUser(u);
    await reloadMe();
  }

  if (session.status === 'loading' || (user && (meState === 'loading' || meState === 'idle'))) return <Frame><Spinner label="Cargando…" /></Frame>;
  if (session.status === 'offline' || meState === 'error') return <Frame><Unavailable whatsapp={whatsapp} onRetry={() => (user ? reloadMe() : session.refresh())} /></Frame>;

  /* ─── Sin sesión: A.1 / A.2 / B */
  if (!user) {
    if (fbReturn?.fb === 'vincular' && fbReturn.t) {
      return (
        <Frame>
          <h1 className="ag-h1">Trabaja en WS Style</h1>
          <div className="ag-card ag-narrow"><AuthPanel facebook={session.facebook} returnTo="/wstyle/pro/registro/" fbReturn={fbReturn} onAuthed={(u) => session.setUser(u)} /></div>
        </Frame>
      );
    }
    if (fbReturn?.fb === 'email' && fbReturn.t && view !== 'check_email') {
      const token = fbReturn.t;
      const submitFb = (e: FormEvent) => {
        e.preventDefault();
        const errs: Record<string, string | undefined> = {};
        if (name.trim().length < 2) errs.name = MESSAGES.invalid_name;
        if (!isEmail(email)) errs.email = fieldMessage('invalid_email');
        if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
        if (!terms) errs.acceptTerms = MESSAGES.acceptTerms;
        setErrors(errs);
        if (Object.values(errs).some(Boolean)) return;
        run(async () => {
          const r = await pro.fbRegister({ token, email: email.trim(), phone, name, acceptTerms: true });
          if (r.pending) return setView('check_email');
          setNotice(`Te enviamos un correo a ${email.trim()} para confirmarlo. Hazlo antes de enviar tu perfil a revisión.`);
          await afterAuth();
        });
      };
      return (
        <Frame>
          <h1 className="ag-h1">Crear cuenta de barbero</h1>
          <form className="ag-card ag-narrow" onSubmit={submitFb} noValidate>
            {formError && <Notice tone="error">{formError}</Notice>}
            <p className="ag-muted">Facebook no nos entregó tu correo. Lo necesitamos para avisarte cuando revisemos tu perfil.</p>
            <Field label="Nombre" autoComplete="name" value={name} onChange={edit('name', setName)} error={errors.name} maxLength={60} />
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={edit('email', setEmail)} error={errors.email} />
            <Field label="Celular (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />
            <Terms checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, acceptTerms: undefined })); }} error={errors.acceptTerms} />
            <button className="btn btn--primary ag-wide" disabled={busy}>Crear cuenta</button>
          </form>
        </Frame>
      );
    }
    const submitEmail = (e: FormEvent) => {
      e.preventDefault();
      if (!isEmail(email)) return setErrors({ email: fieldMessage('invalid_email') });
      run(async () => {
        const st = await auth.emailStatus(email.trim());
        setErrors({});
        setPassword('');
        setView(st.exists ? 'existing' : 'create');
      });
    };
    const submitCreate = (e: FormEvent) => {
      e.preventDefault();
      const errs: Record<string, string | undefined> = {};
      if (name.trim().length < 2) errs.name = MESSAGES.invalid_name;
      if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
      if (weakPassword(password, email)) errs.password = fieldMessage('weak_password');
      if (!terms) errs.acceptTerms = MESSAGES.acceptTerms;
      setErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      run(async () => {
        await pro.register({ email: email.trim(), name, phone, password, acceptTerms: true });
        await afterAuth();
      });
    };
    const submitExisting = (e: FormEvent) => {
      e.preventDefault();
      const errs: Record<string, string | undefined> = {};
      if (!password) errs.password = fieldMessage('required');
      if (showPhone && !clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
      if (!terms) errs.acceptTerms = MESSAGES.acceptTerms;
      setErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      run(async () => {
        await pro.register({ email: email.trim(), password, phone: showPhone ? phone : undefined, acceptTerms: true });
        await afterAuth();
      });
    };
    return (
      <Frame>
        {view === 'email' && (
          <>
            <h1 className="ag-h1">Trabaja en WS Style</h1>
            <form className="ag-card ag-narrow" onSubmit={submitEmail} noValidate data-step="email">
              {fbError && <Notice tone="error">{fbError}</Notice>}
              {formError && <Notice tone="error">{formError}</Notice>}
              <p className="pro-lead">Crea tu perfil de barbero. Lo revisamos y te avisamos por correo.</p>
              <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={edit('email', setEmail)} error={errors.email} />
              <button className="btn btn--primary ag-wide" disabled={busy}>Continuar con email</button>
              {session.facebook && (
                <>
                  <p className="ag-or"><span>o</span></p>
                  <a className="btn ag-btn-fb" href={pro.facebookStartUrl()}><FbIcon />Continuar con Facebook</a>
                </>
              )}
              <p className="ag-fine">¿Ya tienes perfil? <a href="/wstyle/pro/">Entrar al panel</a></p>
            </form>
          </>
        )}
        {view === 'create' && (
          <>
            <h1 className="ag-h1">Crear cuenta de barbero</h1>
            <form className="ag-card ag-narrow" onSubmit={submitCreate} noValidate data-step="create">
              {formError && <Notice tone="error">{formError}</Notice>}
              <p className="ag-muted">Con <strong>{email}</strong> · <button type="button" className="ag-link" onClick={() => setView('email')}>cambiar</button></p>
              <Field label="Nombre" autoComplete="name" value={name} onChange={edit('name', setName)} error={errors.name} maxLength={60} />
              <Field label="Celular (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />
              <PasswordField label="Contraseña" autoComplete="new-password" value={password} onChange={edit('password', setPassword)} error={errors.password}
                hint="Mínimo 8 caracteres, con al menos una letra y un número." />
              <Terms checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, acceptTerms: undefined })); }} error={errors.acceptTerms} />
              <button className="btn btn--primary ag-wide" disabled={busy}>Crear cuenta</button>
            </form>
          </>
        )}
        {view === 'existing' && (
          <>
            <h1 className="ag-h1">Crear cuenta de barbero</h1>
            <form className="ag-card ag-narrow" onSubmit={submitExisting} noValidate data-step="existing">
              {formError && <Notice tone="error">{formError}</Notice>}
              <Notice>Ya tienes una cuenta con este correo. Ingresa tu contraseña para agregar el perfil de barbero.</Notice>
              <p className="ag-muted"><strong>{email}</strong> · <button type="button" className="ag-link" onClick={() => setView('email')}>cambiar</button></p>
              <PasswordField label="Contraseña" autoComplete="current-password" value={password} onChange={edit('password', setPassword)} error={errors.password} />
              {showPhone && <Field label="Celular (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />}
              <Terms checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, acceptTerms: undefined })); }} error={errors.acceptTerms} />
              <button className="btn btn--primary ag-wide" disabled={busy}>Continuar</button>
              <p className="ag-fine"><a href="/wstyle/cuenta/recuperar/">¿Olvidaste tu contraseña?</a></p>
            </form>
          </>
        )}
        {view === 'check_email' && (
          <div className="ag-card ag-narrow"><Notice tone="ok">Ese correo ya tiene una cuenta. Te enviamos un link para confirmar que es tuyo y vincular Facebook. Ábrelo y vuelve a entrar con Facebook.</Notice></div>
        )}
      </Frame>
    );
  }

  /* ─── Con sesión, sin perfil de barbero: agregarlo a la misma cuenta (RN-02). */
  if (meState === 'not_barber' || !me) {
    const submitJoin = (e: FormEvent) => {
      e.preventDefault();
      const errs: Record<string, string | undefined> = {};
      if (!user.phone && !clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
      if (!terms) errs.acceptTerms = MESSAGES.acceptTerms;
      setErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      run(async () => { await pro.join({ phone: user.phone ? undefined : phone, acceptTerms: true }); await afterAuth(); });
    };
    return (
      <Frame>
        <h1 className="ag-h1">Trabaja en WS Style</h1>
        <form className="ag-card ag-narrow" onSubmit={submitJoin} noValidate data-step="join">
          {formError && <Notice tone="error">{formError}</Notice>}
          <p>Agrega el perfil de barbero a tu cuenta <strong>{user.email}</strong>. Lo revisamos y te avisamos por correo.</p>
          {!user.phone && <Field label="Celular (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />}
          <Terms checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, acceptTerms: undefined })); }} error={errors.acceptTerms} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Crear perfil de barbero</button>
        </form>
      </Frame>
    );
  }

  /* ─── B.2: volvió de Facebook → nombre y email ya completados; falta celular + términos. */
  if (me.needsCompletion) {
    const submitComplete = (e: FormEvent) => {
      e.preventDefault();
      const n = name || me.professional.displayName;
      const errs: Record<string, string | undefined> = {};
      if (n.trim().length < 2) errs.name = MESSAGES.invalid_name;
      if (!clMobile(phone || user.phone || '')) errs.phone = fieldMessage('invalid_phone');
      if (!terms) errs.acceptTerms = MESSAGES.acceptTerms;
      setErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      run(async () => { await pro.join({ name: n, phone: phone || user.phone || '', acceptTerms: true }); await afterAuth(); });
    };
    return (
      <Frame>
        <h1 className="ag-h1">Crear cuenta de barbero</h1>
        <form className="ag-card ag-narrow" onSubmit={submitComplete} noValidate data-step="complete">
          {formError && <Notice tone="error">{formError}</Notice>}
          <Field label="Nombre" autoComplete="name" value={name || me.professional.displayName} onChange={edit('name', setName)} error={errors.name} maxLength={60} />
          <Field label="Email" type="email" value={user.email ?? ''} onChange={() => {}} readOnly hint="Lo trajimos de Facebook." />
          <Field label="Celular (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone || user.phone || ''} onChange={edit('phone', setPhone)} error={errors.phone} />
          <Terms checked={terms} onChange={(v) => { setTerms(v); setErrors((x) => ({ ...x, acceptTerms: undefined })); }} error={errors.acceptTerms} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Crear cuenta</button>
        </form>
      </Frame>
    );
  }

  if (me.membership.status === 'pending' && !me.membership.submittedAt) {
    return <Onboarding me={me} setMe={setMe} notice={notice} />;
  }
  if (me.membership.status === 'approved') {
    return (
      <Frame>
        <h1 className="ag-h1">Ya eres parte de WS Style</h1>
        <div className="ag-card ag-narrow"><a className="btn btn--primary" href="/wstyle/pro/">Ir a mi agenda</a></div>
      </Frame>
    );
  }
  return <Frame><ReviewState me={me} /></Frame>;
}

/* ─── Onboarding 1/3 → 3/3 */
function Onboarding({ me, setMe, notice }: { me: ProMe; setMe: (m: ProMe) => void; notice: string | null }) {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState(() => me.services.filter((s) => s.selected).map((s) => s.id));
  const [rules, setRules] = useState<Rule[]>(() =>
    me.rules.length ? me.rules : me.business.hours.filter((h) => h.weekday <= 5 && h.opens && h.closes).map((h) => ({ weekday: h.weekday, start: h.opens!, end: h.closes! })),
  );
  const [home, setHome] = useState<HomeService>(me.professional.homeService);
  const [error, setError] = useState<string | null>(null);
  const [homeErrors, setHomeErrors] = useState<Record<string, string | undefined>>({});
  const [adjust, setAdjust] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const first = me.professional.displayName.split(' ')[0];

  const go = (n: number) => { setError(null); setStep(n); requestAnimationFrame(() => document.querySelector<HTMLElement>('.pro-register h1')?.focus()); };

  async function saveServices() {
    if (!services.length) return setError('Elige al menos un servicio.');
    setBusy(true);
    try {
      await pro.setServices(services);
      setMe({ ...me, services: me.services.map((s) => ({ ...s, selected: services.includes(s.id) })) });
      go(3);
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos guardar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function sendToReview() {
    if (!rules.length) return setError('Marca al menos un día y horario de trabajo.');
    setBusy(true);
    setError(null);
    setHomeErrors({});
    try {
      const av = await pro.setAvailability(rules);
      setRules(av.rules);
      setAdjust(av.adjustments);
      try {
        await pro.setHomeService(home);
      } catch (e) {
        if (e instanceof ApiError && Object.keys(e.fields).length) {
          setHomeErrors(Object.fromEntries(Object.keys(e.fields).map((k) => [k, HOME_ERRORS[k]])));
          return;
        }
        throw e;
      }
      setMe(await pro.submit());
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos enviar tu perfil. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame step={step}>
      {notice && <Notice tone="ok">{notice}</Notice>}
      {step === 1 && (
        <section data-step="1">
          <h1 className="ag-h1 pro-h1--long" tabIndex={-1}>{first}, muéstrale al mundo tu trabajo</h1>
          <div className="ag-card">
            <p className="ag-muted">Sube fotos tuyas o de tus cortes. Puedes saltarte este paso y hacerlo después.</p>
            <PhotosEditor photos={me.professional.photos} onChange={(photos) => setMe({ ...me, professional: { ...me.professional, photos } })} />
            <div className="ag-actions">
              {!me.professional.photos.length && <button type="button" className="btn btn--ghost" onClick={() => go(2)}>Saltar por ahora</button>}
              <button type="button" className="btn btn--primary" onClick={() => go(2)}>Siguiente</button>
            </div>
          </div>
        </section>
      )}
      {step === 2 && (
        <section data-step="2">
          <h1 className="ag-h1 pro-h1--long" tabIndex={-1}>¿Qué servicios haces?</h1>
          <div className="ag-card">
            <p className="ag-muted">Elige de la carta de WS Style. El precio y la duración los define el local.</p>
            <ServicesEditor services={me.services} value={services} onChange={(v) => { setServices(v); setError(null); }} error={error} />
            {me.platformFeeRate > 0 && <p className="ag-fine">El cliente paga aparte una tarifa de servicio (administración de la plataforma {Math.round(me.platformFeeRate * 10000) / 100} % + costo de pagos). Tu parte es el precio del servicio más el domicilio.</p>}
            <div className="ag-actions">
              <button type="button" className="btn btn--ghost" onClick={() => go(1)}>Atrás</button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={saveServices}>Siguiente</button>
            </div>
          </div>
        </section>
      )}
      {step === 3 && (
        <section data-step="3">
          <h1 className="ag-h1 pro-h1--long" tabIndex={-1}>¿Cuándo trabajas?</h1>
          <div className="ag-card">
            {error && <Notice tone="error">{error}</Notice>}
            {adjust.map((a) => <Notice key={a}>{a}</Notice>)}
            <AvailabilityEditor value={rules} onChange={(r) => { setRules(r); setError(null); }} hours={me.business.hours} />
            <h2 className="ag-h3">¿Haces domicilio?</h2>
            <HomeServiceEditor value={home} onChange={(h) => { setHome(h); setHomeErrors({}); }} errors={homeErrors} />
            <Notice>Al enviarlo, tu perfil queda en revisión. Te avisaremos por correo cuando WS Style lo apruebe.</Notice>
            <div className="ag-actions">
              <button type="button" className="btn btn--ghost" onClick={() => go(2)}>Atrás</button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={sendToReview}>Enviar a revisión</button>
            </div>
          </div>
        </section>
      )}
    </Frame>
  );
}
