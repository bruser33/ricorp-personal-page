import { useEffect, useState, type FormEvent } from 'react';
import { agenda, ApiError, auth, type Appointment } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import Shell from '../components/Shell';
import { Field, Notice, PasswordField, Spinner, StatusPill, Unavailable } from '../components/ui';
import { clMobile, clp, fieldMessage, prettyPhone, weakPassword } from '../util';

// /wstyle/cuenta/: entrar / crear cuenta (sin sesión) o "Mi cuenta" (con sesión).
export function AccountPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const user = session.user;
  const [welcome, setWelcome] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleted = new URLSearchParams(location.search).has('eliminada');

  if (session.status === 'loading') return <Shell user={null} current="cuenta"><Spinner label="Cargando tu cuenta…" /></Shell>;
  if (session.status === 'offline') return <Shell user={null} current="cuenta"><Unavailable whatsapp={whatsapp} onRetry={() => session.refresh()} /></Shell>;

  if (!user) {
    return (
      <Shell user={null} current="cuenta">
        <h1 className="ag-h1">Tu cuenta</h1>
        <div className="ag-card ag-narrow">
          {deleted && <Notice tone="ok">Tu cuenta fue eliminada.</Notice>}
          <AuthPanel facebook={session.facebook} returnTo="/wstyle/cuenta/" fbReturn={fbReturn}
            onAuthed={(u, info) => { session.setUser(u); if (info.created) setWelcome(`¡Listo, ${u.name.split(' ')[0]}! Te enviamos un correo para confirmar tu email.`); }} />
        </div>
      </Shell>
    );
  }

  async function savePhone(e: FormEvent) {
    e.preventDefault();
    if (!clMobile(phone)) return setPhoneErr(fieldMessage('invalid_phone'));
    try {
      session.setUser(await auth.update({ phone }));
      setPhoneErr(undefined);
    } catch (err) {
      setPhoneErr(err instanceof ApiError ? fieldMessage(err.fields.phone) ?? err.message : 'No pudimos guardar. Inténtalo de nuevo.');
    }
  }

  return (
    <Shell user={user} current="cuenta">
      <h1 className="ag-h1">Mi cuenta</h1>
      <div className="ag-card ag-narrow">
        {welcome && <Notice tone="ok">{welcome}</Notice>}
        {!user.phone && (
          <form onSubmit={savePhone} noValidate className="ag-lastdata">
            <h2 className="ag-h3">Un último dato</h2>
            <p className="ag-muted">Tu celular, para avisarte si cambia algo de tu cita.</p>
            <Field label="Celular" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={phone} onChange={setPhone} error={phoneErr} />
            <button className="btn btn--primary">Guardar</button>
          </form>
        )}
        <dl className="ag-breakdown">
          <div><dt>Nombre</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          {user.phone && <div><dt>Celular</dt><dd>{prettyPhone(user.phone)}</dd></div>}
          <div><dt>Entras con</dt><dd>{user.providers.map((p) => (p === 'email' ? 'correo y contraseña' : 'Facebook')).join(' · ')}</dd></div>
        </dl>
        {!user.emailVerified && (
          <Notice>
            Aún no confirmas tu correo.{' '}
            {sent ? 'Te enviamos un link nuevo.' : <button type="button" className="ag-link" onClick={async () => { await auth.resendVerification().catch(() => {}); setSent(true); }}>Reenviar el link</button>}
          </Notice>
        )}
        <div className="ag-actions ag-actions--wrap">
          <a className="btn btn--primary" href="/wstyle/reservar/">Reservar</a>
          <a className="btn btn--ghost" href="/wstyle/cuenta/mis-citas/">Mis citas</a>
          <button type="button" className="btn btn--ghost" onClick={() => session.logout()}>Cerrar sesión</button>
        </div>
        <details className="ag-danger">
          <summary>Eliminar mi cuenta</summary>
          <p>Se borran tus datos personales, se cancelan tus citas futuras y las pasadas quedan como "Cliente eliminado". No se puede deshacer.</p>
          {!confirmDelete ? <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>Quiero eliminarla</button>
            : <button type="button" className="btn btn--primary" onClick={async () => { await auth.remove(); location.assign('/wstyle/cuenta/?eliminada=1'); }}>Sí, eliminar mi cuenta</button>}
        </details>
      </div>
    </Shell>
  );
}

// /wstyle/cuenta/mis-citas/ (flujo D): próximas y pasadas, con estado en color y total.
export function MyAppointmentsPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const user = session.user;
  const [data, setData] = useState<{ upcoming: Appointment[]; past: Appointment[] } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    agenda.mine().then((d) => alive && setData(d), () => alive && setErr(true));
    return () => { alive = false; };
  }, [user]);

  if (session.status === 'loading') return <Shell user={null} current="mis-citas"><Spinner label="Cargando tus citas…" /></Shell>;
  if (session.status === 'offline' || err) return <Shell user={user} current="mis-citas"><Unavailable whatsapp={whatsapp} onRetry={() => location.reload()} /></Shell>;
  if (!user) {
    return (
      <Shell user={null} current="mis-citas">
        <h1 className="ag-h1">Mis citas</h1>
        <div className="ag-card ag-narrow"><AuthPanel facebook={session.facebook} returnTo="/wstyle/cuenta/mis-citas/" fbReturn={fbReturn} onAuthed={(u) => session.setUser(u)} /></div>
      </Shell>
    );
  }
  const list = (items: Appointment[], empty: string) =>
    items.length ? (
      <ul className="ag-list">
        {items.map((a) => (
          <li key={a.id}>
            <a className="ag-item" href={`/wstyle/cita/?id=${a.id}`}>
              <span className="ag-item__main"><strong>{a.service.name}</strong> con {a.professional.name}<span className="ag-item__when">{a.when}</span></span>
              <span className="ag-item__side"><StatusPill status={a.status} label={a.statusLabel} /><span>{clp.format(a.pricing.totalCLP)}</span></span>
            </a>
          </li>
        ))}
      </ul>
    ) : <p className="ag-muted">{empty}</p>;
  return (
    <Shell user={user} current="mis-citas">
      <h1 className="ag-h1">Mis citas</h1>
      {!data ? <Spinner label="Cargando tus citas…" /> : (
        <div className="ag-card">
          <h2 className="ag-h3">Próximas</h2>
          {list(data.upcoming, 'No tienes citas próximas.')}
          <h2 className="ag-h3">Pasadas</h2>
          {list(data.past, 'Aún no hay citas pasadas.')}
          <div className="ag-actions"><a className="btn btn--primary" href="/wstyle/reservar/">Reservar otra hora</a></div>
        </div>
      )}
    </Shell>
  );
}

// /wstyle/cuenta/recuperar/?t=…: contraseña nueva con el link del correo (un solo uso, 1 h). Sin t: pedir el link.
export function RecoverPage({ ctx }: { ctx: AgendaCtx }) {
  const token = new URLSearchParams(location.search).get('t');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [state, setState] = useState<'form' | 'done' | 'expired'>('form');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (weakPassword(password)) return setErr(fieldMessage('weak_password'));
    try {
      await auth.reset(token!, password);
      setState('done');
    } catch (e2) {
      if (e2 instanceof ApiError && (e2.status === 410 || e2.status === 400) && !Object.keys(e2.fields).length) setState('expired');
      else setErr(e2 instanceof ApiError ? fieldMessage(e2.fields.password) ?? e2.message : 'No pudimos conectar. Inténtalo de nuevo.');
    }
  }
  return (
    <Shell user={ctx.session.user} current="cuenta">
      <h1 className="ag-h1">Recuperar contraseña</h1>
      <div className="ag-card ag-narrow">
        {!token ? <AuthPanel facebook={false} returnTo="/wstyle/cuenta/" onAuthed={(u) => { ctx.session.setUser(u); location.assign('/wstyle/cuenta/'); }} title="¿Cuál es tu correo?" />
          : state === 'done' ? <><Notice tone="ok">Listo: cambiaste tu contraseña.</Notice><a className="btn btn--primary" href="/wstyle/cuenta/">Entrar</a></>
          : state === 'expired' ? <><Notice tone="error">El link venció o ya se usó. Pide uno nuevo.</Notice><a className="btn btn--ghost" href="/wstyle/cuenta/recuperar/">Pedir otro link</a></>
          : (
            <form onSubmit={submit} noValidate>
              <PasswordField label="Contraseña nueva" autoComplete="new-password" value={password} onChange={setPassword} error={err} hint="Mínimo 8 caracteres, con al menos una letra y un número." />
              <button className="btn btn--primary ag-wide">Guardar contraseña</button>
            </form>
          )}
      </div>
    </Shell>
  );
}

// /wstyle/cuenta/confirmar/?t=…: "Correo confirmado" (RN-21). También confirma vincular Facebook (CB-20).
export function ConfirmPage({ ctx }: { ctx: AgendaCtx }) {
  const token = new URLSearchParams(location.search).get('t') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'expired' | 'invalid' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    auth.verifyEmail(token).then(() => alive && setState('ok'), (e) => {
      if (!alive) return;
      setState(e instanceof ApiError ? (e.status === 410 ? 'expired' : e.status === 400 ? 'invalid' : 'error') : 'error');
    });
    return () => { alive = false; };
  }, [token]);
  return (
    <Shell user={ctx.session.user} current="cuenta">
      <h1 className="ag-h1">Confirmar correo</h1>
      <div className="ag-card ag-narrow">
        {state === 'loading' && <Spinner label="Confirmando…" />}
        {state === 'ok' && <Notice tone="ok">Correo confirmado.</Notice>}
        {state === 'expired' && <Notice tone="error">El link venció (dura 24 horas). Entra a tu cuenta y pide uno nuevo.</Notice>}
        {state === 'invalid' && <Notice tone="error">Este link no es válido.</Notice>}
        {state === 'error' && <Notice tone="error">No pudimos conectar con la agenda. Recarga la página para intentarlo de nuevo.</Notice>}
        <div className="ag-actions"><a className="btn btn--primary" href="/wstyle/cuenta/">Ir a mi cuenta</a></div>
      </div>
    </Shell>
  );
}
