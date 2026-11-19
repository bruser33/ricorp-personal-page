import { useEffect, useState } from 'react';
import { ApiError } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import Shell from '../components/Shell';
import { Notice, Spinner, Unavailable } from '../components/ui';
import Sheet from '../../pro/components/Sheet';
import { photoSrc, points, type MyPoints, type PointsProduct, type Redemption } from '../../points/api';
import { costLabel, newKey, ptsLabel, redeemState, redemptionLine, shortDate, signed } from '../../points/util';
import '../../points/points.css';

// /wstyle/cuenta/puntos/ (SPEC-57): saldo, catálogo de productos activos, canje con confirmación y código de retiro,
// "Mis canjes" con su estado e historial de movimientos.
export default function PointsPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const user = session.user;
  const [data, setData] = useState<MyPoints | null>(null);
  const [err, setErr] = useState(false);
  const [confirm, setConfirm] = useState<{ product: PointsProduct; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Redemption | null>(null);

  const load = () => points.mine().then((d) => { setData(d); setErr(false); }, () => setErr(true));
  useEffect(() => {
    if (!user) return;
    let alive = true;
    points.mine().then((d) => { if (alive) setData(d); }, () => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [user]);

  if (session.status === 'loading') return <Shell user={null} current="puntos"><Spinner label="Cargando tus puntos…" /></Shell>;
  if (session.status === 'offline' || err) return <Shell user={user} current="puntos"><Unavailable whatsapp={whatsapp} onRetry={() => { setErr(false); load(); }} /></Shell>;
  if (!user) {
    return (
      <Shell user={null} current="puntos">
        <h1 className="ag-h1">Mis puntos</h1>
        <div className="ag-card ag-narrow">
          <p className="ag-muted">Junta puntos cada vez que te atiendes con una reserva web y canjéalos por productos en el local.</p>
          <AuthPanel facebook={session.facebook} google={session.google} returnTo="/wstyle/cuenta/puntos/" fbReturn={fbReturn} onAuthed={(u) => session.setUser(u)} />
        </div>
      </Shell>
    );
  }

  async function redeem() {
    if (!confirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await points.redeem(confirm.product.id, confirm.key);
      setDone(r.redemption);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos canjear. Inténtalo de nuevo.');
      if (e instanceof ApiError && e.status === 409) load();
    } finally {
      setBusy(false);
    }
  }

  const pending = data?.redemptions.filter((r) => r.status === 'pendiente_retiro') ?? [];
  return (
    <Shell user={user} current="puntos">
      <h1 className="ag-h1">Mis puntos</h1>
      {!data ? <Spinner label="Cargando tus puntos…" /> : (
        <>
          <div className="ag-card" data-points="balance">
            <p className={`pts-balance${data.balance < 0 ? ' is-negative' : ''}`} aria-live="polite">
              <span className="pts-balance__n" data-balance={data.balance}>{new Intl.NumberFormat('es-CL').format(data.balance)}</span>
              <span className="pts-balance__unit">{Math.abs(data.balance) === 1 ? 'punto' : 'puntos'}</span>
            </p>
            {data.balance < 0 && <Notice>Tu saldo quedó negativo por una devolución de dinero. Podrás canjear cuando vuelva a ser positivo.</Notice>}
            <p className="ag-muted">
              {data.program.enabled
                ? 'Sumas puntos cada vez que te atiendes con una reserva hecha en la web. Los canjeas por productos y los retiras en el local.'
                : 'El programa de puntos está en pausa: por ahora no se suman puntos nuevos, pero puedes canjear los que tienes.'}
            </p>
            {done && (
              <div className="pts-done" data-redeemed={done.code}>
                <Notice tone="ok">¡Listo! Canjeaste {done.product.name}. Muestra este código en el local para retirarlo:</Notice>
                <Code code={done.code} />
              </div>
            )}
          </div>

          {pending.length > 0 && (
            <section className="pts-section ag-card" aria-labelledby="pts-mine">
              <h2 className="ag-h2" id="pts-mine">Por retirar</h2>
              <Redemptions list={pending} />
            </section>
          )}

          <section className="pts-section" aria-labelledby="pts-catalog">
            <h2 className="ag-h2" id="pts-catalog">Canjea tus puntos</h2>
            {data.products.length === 0 ? <p className="ag-muted">Pronto habrá productos para canjear.</p> : (
              <ul className="pts-grid" data-list="products">
                {data.products.map((p) => {
                  const st = redeemState(data.balance, p);
                  return (
                    <li key={p.id} className="pts-product" data-product={p.name}>
                      {p.photo ? <img className="pts-product__photo" src={photoSrc(p.photo) ?? ''} alt="" loading="lazy" width={400} height={400} /> : <span className="pts-product__photo pts-product__photo--empty" aria-hidden="true">WS</span>}
                      <div className="pts-product__body">
                        <h3 className="pts-product__name">{p.name}</h3>
                        {p.description && <p className="pts-product__desc">{p.description}</p>}
                        <p className="pts-product__cost">{costLabel(p.costPoints)}</p>
                        {p.stock !== null && !p.soldOut && p.stock <= 5 && <span className="pts-product__stock">Quedan {p.stock}</span>}
                        {st.kind === 'ok'
                          ? <button type="button" className="btn btn--primary" onClick={() => { setError(null); setDone(null); setConfirm({ product: p, key: newKey() }); }}>Canjear</button>
                          : <button type="button" className="btn btn--ghost" disabled aria-disabled="true">{st.label}</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {data.redemptions.some((r) => r.status !== 'pendiente_retiro') && (
            <section className="pts-section ag-card" aria-labelledby="pts-past">
              <h2 className="ag-h2" id="pts-past">Mis canjes</h2>
              <Redemptions list={data.redemptions.filter((r) => r.status !== 'pendiente_retiro')} />
            </section>
          )}

          <section className="pts-section ag-card" aria-labelledby="pts-history">
            <h2 className="ag-h2" id="pts-history">Historial</h2>
            {data.entries.length === 0 ? <p className="ag-muted">Todavía no tienes movimientos. Reserva por la web y suma puntos al atenderte.</p> : (
              <ul className="pts-history" data-list="history">
                {data.entries.map((e) => (
                  <li key={e.id} data-entry={e.type}>
                    <span className="pts-history__main"><strong>{e.label}</strong><span className="pts-history__detail">{e.detail ? `${e.detail} · ` : ''}{shortDate(e.at)}</span></span>
                    <span className={`pts-history__n ${e.points > 0 ? 'is-plus' : 'is-minus'}`}>{signed(e.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {confirm && (
        <Sheet title="Confirmar canje" onClose={() => { if (!busy) { setConfirm(null); setError(null); } }}>
          <p>Vas a usar {ptsLabel(confirm.product.costPoints)} en {confirm.product.name}. ¿Confirmas?</p>
          {data && <p className="ag-muted">Te quedarán {ptsLabel(data.balance - confirm.product.costPoints)}.</p>}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ag-actions ag-actions--wrap">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={redeem}>{busy ? 'Canjeando…' : 'Sí, canjear'}</button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setConfirm(null); setError(null); }}>Volver</button>
          </div>
        </Sheet>
      )}
    </Shell>
  );
}

function Code({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pts-code">
      <span className="pts-code__value" data-code={code}>{code}</span>
      <button type="button" className="btn btn--ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copiado' : 'Copiar'}</button>
    </div>
  );
}

function Redemptions({ list }: { list: Redemption[] }) {
  return (
    <ul className="pts-redemptions" data-list="redemptions">
      {list.map((r) => (
        <li key={r.id} className="pts-redemption" data-redemption={r.code} data-status={r.status}>
          <div className="pts-redemption__top">
            <strong>{r.product.name}</strong>
            <span className={`ag-pill ag-pill--${r.status === 'pendiente_retiro' ? 'wait' : r.status === 'entregado' ? 'ok' : 'off'}`}>{r.statusLabel}</span>
          </div>
          {r.status === 'pendiente_retiro' ? <Code code={r.code} /> : <p className="pts-redemption__meta">Código {r.code}</p>}
          <p className="pts-redemption__meta">{costLabel(r.product.costPoints)} · canjeado el {shortDate(r.createdAt)} · {redemptionLine(r)}</p>
        </li>
      ))}
    </ul>
  );
}
