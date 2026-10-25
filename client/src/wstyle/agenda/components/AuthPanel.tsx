import { useState, type FormEvent } from 'react';
import { ApiError, auth, type User } from '../api';
import { clMobile, fieldMessage, isEmail, weakPassword } from '../util';
import { Field, Notice, PasswordField } from './ui';

export interface FacebookReturn { fb: string; t: string | null; email: string | null }

type View =
  | { k: 'email' }
  | { k: 'register' }
  | { k: 'login'; notice?: string }
  | { k: 'forgot' }
  | { k: 'forgot_sent' }
  | { k: 'fb_link'; token: string; email: string }
  | { k: 'fb_email'; token: string }
  | { k: 'check_email' };

const FB_MESSAGES: Record<string, string> = {
  error: 'No se completó el inicio con Facebook. Puedes intentarlo de nuevo o usar tu correo.',
  no_disponible: 'El inicio con Facebook aún no está disponible. Usa tu correo.',
};

interface Props {
  facebook: boolean;
  returnTo: string;                         // a dónde vuelve Facebook (con la selección en la URL)
  fbReturn?: FacebookReturn | null;         // lo que trajo la URL al volver de Facebook
  onAuthed: (user: User, info: { created: boolean; verificationSent?: boolean }) => void;
  beforeFacebook?: () => void;              // guardar la selección antes de salir del sitio
  title?: string;
}

// Registro / inicio de sesión del cliente (flujos A, B y C de SPEC-32), igual dentro de la reserva y en /cuenta/.
// Email primero; según exista o no la cuenta, "Entrar" o "Crear cuenta". Sin Instagram ni Google (RN-25).
export default function AuthPanel({ facebook, returnTo, fbReturn, onAuthed, beforeFacebook, title = '¿Cuál es tu correo?' }: Props) {
  const [view, setView] = useState<View>(() => {
    if (fbReturn?.fb === 'vincular' && fbReturn.t) return { k: 'fb_link', token: fbReturn.t, email: fbReturn.email ?? '' };
    if (fbReturn?.fb === 'email' && fbReturn.t) return { k: 'fb_email', token: fbReturn.t };
    return { k: 'email' };
  });
  const [fbNotice] = useState(() => (fbReturn ? FB_MESSAGES[fbReturn.fb] ?? null : null));
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Al corregir un campo, su error se va (no queda un aviso viejo junto a un dato ya válido).
  const edit = (k: string, set: (v: string) => void) => (v: string) => { set(v); setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e)); };
  const go = (v: View) => { setView(v); setErrors({}); setFormError(null); setPassword(''); };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 0) setFormError('No pudimos conectar con la agenda. Revisa tu conexión e inténtalo de nuevo.');
        else if (Object.keys(e.fields).length) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, fieldMessage(v)])));
        else setFormError(e.message);
      } else setFormError('Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setErrors({ email: fieldMessage('invalid_email') });
    run(async () => {
      const st = await auth.emailStatus(email.trim());
      go(st.exists ? { k: 'login' } : { k: 'register' });
    });
  }

  function submitRegister(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (!name.trim()) errs.name = fieldMessage('required');
    if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    if (weakPassword(password, email)) errs.password = fieldMessage('weak_password');
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    run(async () => {
      try {
        const r = await auth.register({ email: email.trim(), name, phone, password });
        onAuthed(r.user, { created: true, verificationSent: r.verificationSent });
      } catch (err) {
        // CB-19: el email ya tiene cuenta → a "Entrar".
        if (err instanceof ApiError && err.code === 'email_taken') return go({ k: 'login', notice: 'Ya tienes una cuenta con este correo.' });
        throw err;
      }
    });
  }

  function submitLogin(e: FormEvent) {
    e.preventDefault();
    if (!password) return setErrors({ password: fieldMessage('required') });
    run(async () => {
      try {
        onAuthed(await auth.login(email.trim(), password), { created: false });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 429)) return setErrors({ password: err.message });
        throw err;
      }
    });
  }

  function submitForgot(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setErrors({ email: fieldMessage('invalid_email') });
    run(async () => { await auth.forgot(email.trim()); go({ k: 'forgot_sent' }); });
  }

  function submitFbLink(e: FormEvent) {
    e.preventDefault();
    if (view.k !== 'fb_link') return;
    run(async () => {
      try {
        onAuthed((await auth.fbLink(view.token, password)).user, { created: false });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 429)) return setErrors({ password: err.message });
        throw err;
      }
    });
  }

  function submitFbEmail(e: FormEvent) {
    e.preventDefault();
    if (view.k !== 'fb_email') return;
    const errs: Record<string, string | undefined> = {};
    if (!isEmail(email)) errs.email = fieldMessage('invalid_email');
    if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    run(async () => {
      const r = await auth.fbComplete(view.token, email.trim(), phone);
      if (r.user) onAuthed(r.user, { created: true, verificationSent: true });
      else go({ k: 'check_email' });
    });
  }

  const facebookButton = facebook && (
    <a className="btn ag-btn-fb" href={auth.facebookStartUrl(returnTo)} onClick={() => beforeFacebook?.()}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.4V21h3.1Z" /></svg>
      Continuar con Facebook
    </a>
  );

  return (
    <div className="ag-auth">
      {fbNotice && view.k === 'email' && <Notice tone="error">{fbNotice}</Notice>}
      {formError && <Notice tone="error">{formError}</Notice>}

      {view.k === 'email' && (
        <form onSubmit={submitEmail} noValidate>
          <h3 className="ag-h3">{title}</h3>
          <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={edit('email', setEmail)} error={errors.email} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Continuar con email</button>
          {facebookButton && <><p className="ag-or"><span>o</span></p>{facebookButton}</>}
          <p className="ag-fine">Al continuar aceptas los <a href="/wstyle/#politicas">Términos</a> y la <a href="/wstyle/#politicas">Política de privacidad</a>.</p>
        </form>
      )}

      {view.k === 'register' && (
        <form onSubmit={submitRegister} noValidate>
          <h3 className="ag-h3">Crear cuenta</h3>
          <p className="ag-muted">Con <strong>{email}</strong> · <button type="button" className="ag-link" onClick={() => go({ k: 'email' })}>cambiar</button></p>
          <Field label="Nombre" autoComplete="name" value={name} onChange={edit('name', setName)} error={errors.name} maxLength={80} />
          <Field label="Celular" type="tel" autoComplete="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />
          <PasswordField label="Contraseña" autoComplete="new-password" value={password} onChange={edit('password', setPassword)} error={errors.password}
            hint="Mínimo 8 caracteres, con al menos una letra y un número." />
          <button className="btn btn--primary ag-wide" disabled={busy}>Crear cuenta</button>
        </form>
      )}

      {view.k === 'login' && (
        <form onSubmit={submitLogin} noValidate>
          <h3 className="ag-h3">Entrar</h3>
          {view.notice && <Notice>{view.notice}</Notice>}
          <p className="ag-muted">Usando <strong>{email}</strong> · <button type="button" className="ag-link" onClick={() => go({ k: 'email' })}>cambiar</button></p>
          <PasswordField label="Contraseña" autoComplete="current-password" value={password} onChange={edit('password', setPassword)} error={errors.password} />
          <p><button type="button" className="ag-link" onClick={() => go({ k: 'forgot' })}>¿Olvidaste tu contraseña?</button></p>
          <button className="btn btn--primary ag-wide" disabled={busy}>Entrar</button>
        </form>
      )}

      {view.k === 'forgot' && (
        <form onSubmit={submitForgot} noValidate>
          <h3 className="ag-h3">Recuperar contraseña</h3>
          <p className="ag-muted">Te enviaremos un link para crear una contraseña nueva.</p>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={edit('email', setEmail)} error={errors.email} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Enviar link</button>
          <p><button type="button" className="ag-link" onClick={() => go({ k: 'login' })}>Volver</button></p>
        </form>
      )}
      {view.k === 'forgot_sent' && (
        <div>
          <Notice tone="ok">Si existe una cuenta con ese correo, te enviamos un link.</Notice>
          <p><button type="button" className="ag-link" onClick={() => go({ k: 'login' })}>Volver a entrar</button></p>
        </div>
      )}

      {view.k === 'fb_link' && (
        <form onSubmit={submitFbLink} noValidate>
          <h3 className="ag-h3">Vincular Facebook</h3>
          <p>Ya tienes una cuenta con <strong>{view.email}</strong>. Ingresa tu contraseña para vincular Facebook.</p>
          <PasswordField label="Contraseña" autoComplete="current-password" value={password} onChange={edit('password', setPassword)} error={errors.password} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Vincular y entrar</button>
          <p><button type="button" className="ag-link" onClick={() => go({ k: 'email' })}>Usar otro correo</button></p>
        </form>
      )}

      {view.k === 'fb_email' && (
        <form onSubmit={submitFbEmail} noValidate>
          <h3 className="ag-h3">Un último dato</h3>
          <p className="ag-muted">Facebook no nos entregó tu correo. Lo necesitamos para avisarte de tus citas.</p>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={edit('email', setEmail)} error={errors.email} />
          <Field label="Celular" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={phone} onChange={edit('phone', setPhone)} error={errors.phone} />
          <button className="btn btn--primary ag-wide" disabled={busy}>Crear cuenta</button>
        </form>
      )}

      {view.k === 'check_email' && (
        <Notice tone="ok">Ese correo ya tiene una cuenta. Te enviamos un link para confirmar que es tuyo y vincular Facebook. Ábrelo y vuelve a entrar con Facebook.</Notice>
      )}
    </div>
  );
}
