import RedemptionDesk from '../../points/RedemptionDesk';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';

// /wstyle/pro/canjes/ (SPEC-57, asunción 7): el barbero busca el código que muestra el cliente y marca el canje
// entregado (o lo anula con motivo). No ajusta saldos ni edita productos.
export default function RedemptionsPage({ ctx }: { ctx: ProCtx }) {
  const { me, setMe } = ctx;
  return (
    <ProShell tab="canjes" operative unread={me?.unread ?? 0} onUnreadChange={(n) => me && setMe({ ...me, unread: n })}>
      <RedemptionDesk headingLevel={1} />
      <p className="ag-muted">El cliente muestra su código de retiro (WS-…). Entrega el producto y márcalo como entregado para que no se entregue dos veces.</p>
    </ProShell>
  );
}
