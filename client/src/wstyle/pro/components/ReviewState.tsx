import { Notice } from '../../agenda/components/ui';
import type { ProMe } from '../api';

// RN-03: pendiente → "Tu perfil está en revisión"; rechazado → motivo; suspendido → aviso. Ninguno opera.
export default function ReviewState({ me, onLogout }: { me: ProMe; onLogout?: () => void }) {
  const s = me.membership.status;
  return (
    <div className="pro-review" data-membership={s}>
      {s === 'pending' && (
        <>
          <h1 className="ag-h1">Tu perfil está en revisión</h1>
          <div className="ag-card ag-narrow">
            <p>Tu perfil está en revisión. Te avisaremos por correo cuando WS Style lo apruebe.</p>
            {me.emailCheckPending && <Notice>Antes, confirma tu correo con el link que te enviamos a <strong>{me.user.email}</strong>.</Notice>}
            <p className="ag-muted">Mientras tanto puedes seguir editando tus fotos, servicios y horario. Aún no apareces en la reserva en línea ni puedes recibir o invitar citas.</p>
            <div className="ag-actions ag-actions--wrap"><a className="btn btn--ghost" href="/wstyle/pro/perfil/">Editar mi perfil</a></div>
          </div>
        </>
      )}
      {s === 'rejected' && (
        <>
          <h1 className="ag-h1">Tu perfil no fue aprobado</h1>
          <div className="ag-card ag-narrow">
            {me.membership.reason && <Notice tone="error">Motivo: {me.membership.reason}</Notice>}
            <p>Por ahora no puedes trabajar con WS Style desde la plataforma. Si tienes dudas, escríbenos.</p>
          </div>
        </>
      )}
      {s === 'suspended' && (
        <>
          <h1 className="ag-h1">Tu perfil está suspendido</h1>
          <div className="ag-card ag-narrow">
            {me.membership.reason && <Notice tone="error">Motivo: {me.membership.reason}</Notice>}
            <p>Mientras esté suspendido no puedes usar el panel ni recibir reservas nuevas. Tus citas las ve WS Style.</p>
          </div>
        </>
      )}
      {onLogout && <p><button type="button" className="ag-link" onClick={onLogout}>Cerrar sesión</button></p>}
    </div>
  );
}
