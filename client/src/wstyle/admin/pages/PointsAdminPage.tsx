import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice, Spinner } from '../../agenda/components/ui';
import Sheet from '../../pro/components/Sheet';
import { photoSrc, points, type AdminProduct, type CustomerRow, type Ledger } from '../../points/api';
import RedemptionDesk from '../../points/RedemptionDesk';
import { adjustProblems, costLabel, costProblem, ptsLabel, shortDate, signed, stockProblem } from '../../points/util';
import { Loaded, Pill } from '../components/common';
import { useLoad } from '../hooks';
import '../../points/points.css';

// Panel → Puntos (SPEC-57): productos canjeables (crear, editar, activar/desactivar, reordenar), canjes por entregar y
// saldos de clientes (historial, ajuste manual con motivo y reversión de los puntos de una cita). Todo queda en la
// auditoría del server. La configuración del programa está en Configuración → Puntos.
export default function PointsAdminPage() {
  return (
    <>
      <h1 className="ag-h1">Puntos</h1>
      <p className="ag-muted">Activa el programa y define la tasa en <a href="/wstyle/admin/configuracion/">Configuración → Puntos</a>.</p>
      <Products />
      <div className="pts-section"><RedemptionDesk /></div>
      <Customers />
    </>
  );
}

function Products() {
  const list = useLoad(() => points.adminProducts(), 'pts-products');
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ tone: 'ok', text: ok });
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo' });
    }
    list.reload();
  }

  function move(items: AdminProduct[], i: number, d: -1 | 1) {
    const ids = items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => points.reorder(ids), 'Orden guardado.');
  }

  async function remove(p: AdminProduct) {
    if (!confirm(p.redemptions ? `"${p.name}" tiene canjes: no se borra, se desactiva. ¿Seguir?` : `¿Borrar "${p.name}"?`)) return;
    setFlash(null);
    try {
      const r = await points.removeProduct(p.id);
      setFlash({ tone: 'ok', text: r.result === 'deleted' ? `Borrado: ${p.name}.` : `${p.name} tiene canjes: quedó desactivado.` });
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo' });
    }
    list.reload();
  }

  return (
    <section className="pts-section" aria-labelledby="pts-products-title" data-section="reward-products">
      <div className="adm-title-row">
        <h2 className="ag-h2" id="pts-products-title">Productos canjeables</h2>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>Nuevo producto</button>
      </div>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      <Loaded state={list} label="Cargando productos…">
        {(d) => d.items.length === 0 ? <p className="ag-muted">Aún no hay productos. Crea el primero (por ejemplo, una cera o un shampoo) con su foto y su costo en puntos.</p> : (
          <ul className="pts-admin-list" data-list="admin-products">
            {d.items.map((p, i) => (
              <li key={p.id} className={`pts-admin-row${p.active ? '' : ' is-off'}`} data-product={p.name}>
                {p.photo ? <img src={photoSrc(p.photo) ?? ''} alt="" width={56} height={56} loading="lazy" /> : <span className="pts-thumb" aria-hidden="true">WS</span>}
                <span className="pts-admin-row__main">
                  <strong>{p.name}</strong>
                  <span className="ag-muted">{costLabel(p.costPoints)} · {p.stock === null ? 'stock sin límite' : `stock ${p.stock}`} · {p.redemptions} {p.redemptions === 1 ? 'canje' : 'canjes'}</span>
                  <span>{p.active ? <Pill tone="ok">Activo</Pill> : <Pill tone="off">Inactivo</Pill>}</span>
                </span>
                <span className="pts-admin-row__side">
                  <button type="button" className="pro-icon-btn" aria-label={`Subir ${p.name}`} disabled={i === 0} onClick={() => move(d.items, i, -1)}>↑</button>
                  <button type="button" className="pro-icon-btn" aria-label={`Bajar ${p.name}`} disabled={i === d.items.length - 1} onClick={() => move(d.items, i, 1)}>↓</button>
                  <button type="button" className="ag-link" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>Editar</button>
                  <button type="button" className="ag-link" onClick={() => run(() => points.setActive(p.id, !p.active), p.active ? `${p.name} desactivado.` : `${p.name} activo.`)}>{p.active ? 'Desactivar' : 'Activar'}</button>
                  <button type="button" className="ag-link adm-danger-link" onClick={() => remove(p)}>{p.redemptions ? 'Quitar' : 'Borrar'}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); setFlash({ tone: 'ok', text: msg }); list.reload(); }} />}
    </section>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: AdminProduct | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [cost, setCost] = useState(product ? String(product.costPoints) : '');
  const [stock, setStock] = useState(product?.stock == null ? '' : String(product.stock));
  const [active, setActive] = useState(product?.active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = {
      name: name.trim().length < 2 ? 'Escribe el nombre (mínimo 2 letras).' : undefined,
      cost: costProblem(cost) ?? undefined,
      stock: stockProblem(stock) ?? undefined,
      photo: photo && photo.size > 5 * 1024 * 1024 ? 'La foto puede pesar hasta 5 MB.' : undefined,
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setErr(null);
    const fields = { name: name.trim(), description: description.trim(), costPoints: cost.trim(), stock: stock.trim(), active: String(active) };
    try {
      if (product) {
        const r = await points.updateProduct(product.id, fields, photo);
        onSaved(`Guardado: ${r.product.name}. Los canjes ya hechos mantienen su nombre y costo.`);
      } else {
        const r = await points.createProduct(fields, photo);
        onSaved(`Creado: ${r.product.name}.`);
      }
    } catch (e2) {
      if (e2 instanceof ApiError && (e2.code.startsWith('photo') || e2.code === 'invalid_image' || e2.code === 'invalid_upload')) setErrors((x) => ({ ...x, photo: e2.message }));
      setErr(e2 instanceof ApiError ? e2.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form className="adm-form" onSubmit={submit} noValidate>
        <Field label="Nombre" value={name} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} maxLength={80} placeholder="Cera mate" />
        <div className="ag-field"><label htmlFor="p-desc">Descripción</label><textarea id="p-desc" rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="adm-form__grid">
          <Field label="Costo en puntos" inputMode="numeric" value={cost} onChange={(v) => { setCost(v); setErrors((x) => ({ ...x, cost: undefined })); }} error={errors.cost} hint="Entero de 1 a 100.000" />
          <Field label="Stock" inputMode="numeric" value={stock} onChange={(v) => { setStock(v); setErrors((x) => ({ ...x, stock: undefined })); }} error={errors.stock} hint="Vacío = sin límite" />
        </div>
        <div className={`ag-field${errors.photo ? ' has-error' : ''}`}>
          <label htmlFor="p-photo">{product?.photo ? 'Cambiar foto' : 'Foto'}</label>
          <input id="p-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setErrors((x) => ({ ...x, photo: undefined })); }}
            aria-invalid={errors.photo ? true : undefined} aria-describedby={errors.photo ? 'p-photo-err' : 'p-photo-hint'} />
          {!errors.photo && <p className="ag-field__hint" id="p-photo-hint">JPG, PNG o WebP de hasta 5 MB. Se recorta cuadrada.</p>}
          {errors.photo && <p className="ag-field__error" id="p-photo-err" role="alert">{errors.photo}</p>}
        </div>
        <label className="pro-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> <span>Activo (se puede canjear)</span></label>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="ag-actions ag-actions--wrap">
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Sheet>
  );
}

function Customers() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState('');
  const list = useLoad(() => points.customers(active), `pts-customers|${active}`);
  const [open, setOpen] = useState<CustomerRow | null>(null);
  return (
    <section className="pts-section" aria-labelledby="pts-customers-title" data-section="points-customers">
      <h2 className="ag-h2" id="pts-customers-title">Saldos de clientes</h2>
      <form className="pts-search" role="search" onSubmit={(e) => { e.preventDefault(); setActive(q.trim()); }}>
        <div className="ag-field">
          <label htmlFor="pts-cust-q">Buscar cliente por nombre o correo</label>
          <input id="pts-cust-q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <button className="btn btn--primary">Buscar</button>
      </form>
      <Loaded state={list} label="Cargando clientes…">
        {(d) => d.items.length === 0 ? <p className="ag-muted">{active ? 'Sin resultados.' : 'Todavía nadie tiene puntos.'}</p> : (
          <ul className="adm-rows" data-list="points-customers">
            {d.items.map((c) => (
              <li key={c.id}>
                <button type="button" className="adm-row" onClick={() => setOpen(c)}>
                  <span className="adm-row__main"><span className="adm-row__title">{c.name}</span><span className="adm-row__meta">{c.email}</span></span>
                  <span className="adm-row__side"><strong>{ptsLabel(c.balance)}</strong></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
      {open && <CustomerSheet customer={open} onClose={() => { setOpen(null); list.reload(); }} />}
    </section>
  );
}

function CustomerSheet({ customer, onClose }: { customer: CustomerRow; onClose: () => void }) {
  const ledger = useLoad<Ledger>(() => points.ledger(customer.id), `ledger|${customer.id}`);
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ points?: string; reason?: string }>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState('');

  async function adjust(e: FormEvent) {
    e.preventDefault();
    const errs = adjustProblems(pts, reason);
    setErrors(errs);
    if (errs.points || errs.reason) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await points.adjust(customer.id, Number(pts), reason.trim());
      setMsg({ tone: 'ok', text: `Ajuste guardado. Saldo: ${ptsLabel(r.balance)}.` });
      setPts('');
      setReason('');
      ledger.reload();
    } catch (e2) {
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo' });
    } finally {
      setBusy(false);
    }
  }

  async function revert(appointmentId: string) {
    if (!revertReason.trim()) { setMsg({ tone: 'error', text: 'Escribe el motivo de la reversión.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const r = await points.revert(appointmentId, revertReason.trim());
      setMsg({ tone: r.changed ? 'ok' : 'error', text: r.changed ? `Puntos revertidos (${signed(r.points)}). Saldo: ${ptsLabel(r.balance)}.` : 'Esos puntos ya estaban revertidos.' });
      setReverting(null);
      setRevertReason('');
      ledger.reload();
    } catch (e2) {
      setMsg({ tone: 'error', text: e2 instanceof ApiError ? e2.message : 'No se pudo' });
    } finally {
      setBusy(false);
    }
  }

  const reverted = new Set((ledger.data?.entries ?? []).filter((e) => e.type === 'revertido').map((e) => e.appointmentId));
  return (
    <Sheet title={customer.name} onClose={onClose} wide>
      {!ledger.data ? <Spinner label="Cargando su historial…" /> : (
        <>
          <p className="pts-balance"><span className="pts-balance__n">{new Intl.NumberFormat('es-CL').format(ledger.data.balance)}</span><span className="pts-balance__unit">puntos</span></p>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <form className="adm-form" onSubmit={adjust} noValidate>
            <h3 className="ag-h3">Ajuste manual</h3>
            <div className="adm-form__grid">
              <Field label="Puntos (+ suma, − resta)" inputMode="numeric" value={pts} onChange={(v) => { setPts(v); setErrors((x) => ({ ...x, points: undefined })); }} error={errors.points} placeholder="-10" />
              <Field label="Motivo" value={reason} onChange={(v) => { setReason(v); setErrors((x) => ({ ...x, reason: undefined })); }} error={errors.reason} maxLength={200} placeholder="Ej.: corrección de un canje" />
            </div>
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ajuste'}</button>
          </form>
          <h3 className="ag-h3">Historial</h3>
          {ledger.data.entries.length === 0 ? <p className="ag-muted">Sin movimientos.</p> : (
            <ul className="pts-history">
              {ledger.data.entries.map((e) => (
                <li key={e.id} data-entry={e.type}>
                  <span className="pts-history__main">
                    <strong>{e.label}</strong>
                    <span className="pts-history__detail">{e.detail ? `${e.detail} · ` : ''}{shortDate(e.at)}</span>
                    {e.type === 'ganado' && e.appointmentId && !reverted.has(e.appointmentId) && (reverting === e.id ? (
                      <span className="pts-search">
                        <span className="ag-field"><label htmlFor={`rev-${e.id}`}>Motivo de la reversión</label><input id={`rev-${e.id}`} value={revertReason} onChange={(ev) => setRevertReason(ev.target.value)} maxLength={200} autoFocus /></span>
                        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => revert(e.appointmentId!)}>Revertir</button>
                        <button type="button" className="btn btn--ghost" onClick={() => setReverting(null)}>Volver</button>
                      </span>
                    ) : <button type="button" className="ag-link" onClick={() => { setReverting(e.id); setRevertReason(''); }}>Revertir puntos</button>)}
                  </span>
                  <span className={`pts-history__n ${e.points > 0 ? 'is-plus' : 'is-minus'}`}>{signed(e.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
