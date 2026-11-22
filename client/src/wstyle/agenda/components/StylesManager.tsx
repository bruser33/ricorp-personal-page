import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError } from '../api';
import { ACCEPT_ATTR, assetUrl, checkPhotoFile, stylesPanel, usePrivateImage, type PanelStyle, type StylesPanel } from '../styles';
import { Notice, Spinner } from './ui';

// SPEC-59: gestión del catálogo de estilos. El super admin (Panel → Estilos) ve, ordena y modera todos; el barbero
// (Perfil → Mis estilos) sube y edita solo los suyos (RN-08: el server lo exige igual).

type Msg = { tone: 'ok' | 'error'; text: string } | null;
const errText = (e: unknown) => (e instanceof ApiError && e.status ? e.message : 'No pudimos guardar. Inténtalo de nuevo.');

/* Foto del panel: un estilo oculto no es público, se pide con la sesión. */
function PanelPhoto({ style }: { style: PanelStyle }) {
  const priv = usePrivateImage(style.active ? null : style.photoUrl);
  const src = style.active ? assetUrl(style.photoUrl) : priv.url;
  return <span className="st-card__img">{src ? <img src={src} alt={style.name} loading="lazy" /> : null}</span>;
}

function StyleRow({ style, panel, admin, first, last, busy, onUpdate, onRemove, onMove }: {
  style: PanelStyle; panel: StylesPanel; admin: boolean; first: boolean; last: boolean; busy: boolean;
  onUpdate: (patch: Partial<{ name: string; category: string; serviceIds: string[]; active: boolean }>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(style.name);
  const [confirm, setConfirm] = useState(false);
  const services = panel.services.filter((s) => s.category === style.category);
  return (
    <li className={`st-row${style.active ? '' : ' is-hidden'}`} data-style-row={style.id}>
      <PanelPhoto style={style} />
      <div className="st-row__body">
        <form className="st-row__name" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== style.name) onUpdate({ name: name.trim() }); }}>
          <label className="ag-sr" htmlFor={`st-name-${style.id}`}>Nombre</label>
          <input id={`st-name-${style.id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== style.name) onUpdate({ name: name.trim() }); }} />
        </form>
        <label className="st-row__field">
          <span>Categoría</span>
          <select value={style.category} disabled={busy} onChange={(e) => onUpdate({ category: e.target.value, serviceIds: [] })} data-style-category="">
            {panel.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        {services.length > 1 && (
          <details className="st-row__services">
            <summary>{style.serviceIds.length ? `Solo para: ${style.serviceIds.map((id) => panel.services.find((s) => s.id === id)?.name ?? id).join(', ')}` : 'Para todos los servicios de la categoría'}</summary>
            {services.map((s) => (
              <label key={s.id} className="st-check">
                <input type="checkbox" checked={style.serviceIds.includes(s.id)} disabled={busy}
                  onChange={(e) => onUpdate({ serviceIds: e.target.checked ? [...style.serviceIds, s.id] : style.serviceIds.filter((x) => x !== s.id) })} />
                {s.name}
              </label>
            ))}
          </details>
        )}
        {admin && <p className="ag-fine">Subida por {style.uploadedBy}</p>}
        <div className="st-row__actions">
          {admin && <button type="button" className="ag-link" disabled={busy || first} onClick={() => onMove(-1)} aria-label={`Subir ${style.name}`}>↑</button>}
          {admin && <button type="button" className="ag-link" disabled={busy || last} onClick={() => onMove(1)} aria-label={`Bajar ${style.name}`}>↓</button>}
          <button type="button" className="ag-link" disabled={busy} onClick={() => onUpdate({ active: !style.active })} data-toggle-style="">{style.active ? 'Ocultar' : 'Mostrar'}</button>
          {confirm ? (
            <>
              <span>¿Eliminar esta foto?</span>
              <button type="button" className="ag-link" disabled={busy} onClick={onRemove}>Sí, eliminar</button>
              <button type="button" className="ag-link" onClick={() => setConfirm(false)}>No</button>
            </>
          ) : <button type="button" className="ag-link" disabled={busy} onClick={() => setConfirm(true)}>Eliminar</button>}
        </div>
        {!style.active && <p className="ag-fine">Oculta: no aparece al reservar.</p>}
      </div>
    </li>
  );
}

export default function StylesManager({ admin }: { admin: boolean }) {
  const client = useMemo(() => stylesPanel(admin ? '/api/admin/styles' : '/api/pro/styles'), [admin]);
  const [panel, setPanel] = useState<StylesPanel | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('barberia');
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoadErr(false);
    client.list().then(setPanel, () => setLoadErr(true));
  }, [client]);
  useEffect(() => {
    const t = setTimeout(load);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<StylesPanel>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      setPanel(await fn());
      if (ok) setMsg({ tone: 'ok', text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    const max = panel?.limits.perUpload ?? 12;
    if (list.length > max) return setMsg({ tone: 'error', text: `Puedes subir hasta ${max} fotos a la vez.` });
    const bad = list.map((f) => [f, checkPhotoFile(f)] as const).find(([, p]) => p);
    if (bad) return setMsg({ tone: 'error', text: `"${bad[0].name}": ${bad[1]}` });
    setMsg(null);
    setFiles(list);
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!files.length) return setMsg({ tone: 'error', text: 'Elige al menos una foto.' });
    const ok = await run(() => client.upload(files, { category, name: name.trim() || undefined }), `${files.length === 1 ? 'Foto subida' : `${files.length} fotos subidas`}. Ya aparecen al reservar.`);
    if (ok) { setFiles([]); setName(''); }
  }

  if (loadErr) return <Notice tone="error">No pudimos cargar los estilos. <button type="button" className="ag-link" onClick={load}>Reintentar</button></Notice>;
  if (!panel) return <Spinner label="Cargando estilos…" />;

  const items = filter ? panel.items.filter((s) => s.category === filter) : panel.items;
  const move = (s: PanelStyle, dir: -1 | 1) => {
    const ids = panel.items.map((x) => x.id);
    const i = ids.indexOf(s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => client.reorder(ids));
  };

  return (
    <div className="st-manager" data-styles-manager={admin ? 'admin' : 'pro'}>
      <form className="st-upload" onSubmit={upload} noValidate>
        <p className="ag-muted">Sube fotos de trabajos para inspirar al cliente cuando reserva. Se comprimen solas (sin datos de ubicación). Hasta {panel.limits.perUpload} a la vez, 5 MB cada una.</p>
        <div className="st-upload__row">
          <button type="button" className="btn btn--ghost" onClick={() => input.current?.click()} disabled={busy}>{files.length ? `${files.length} foto${files.length === 1 ? '' : 's'} elegida${files.length === 1 ? '' : 's'}` : 'Elegir fotos'}</button>
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="ag-sr" tabIndex={-1} aria-label="Elegir fotos de estilos" onChange={pick} data-styles-input="" />
          <label className="st-row__field">
            <span>Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {panel.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className="st-row__field">
            <span>Nombre (opcional)</span>
            <input value={name} maxLength={60} placeholder="Low fade texturizado" onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn--primary" disabled={busy || !files.length}>{busy ? 'Subiendo…' : 'Subir'}</button>
        </div>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="st-filter">
        <label className="st-row__field">
          <span>Ver</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            {panel.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        {admin && <p className="ag-fine">{panel.limits.activeCount} de {panel.limits.maxActive} estilos activos.</p>}
      </div>
      {items.length === 0 ? <p className="ag-muted">{admin ? 'Aún no hay estilos.' : 'Aún no subes estilos.'}</p> : (
        <ul className="st-list">
          {items.map((s, i) => (
            <StyleRow key={`${s.id}-${s.name}`} style={s} panel={panel} admin={admin} busy={busy} first={i === 0} last={i === items.length - 1}
              onUpdate={(patch) => run(() => client.update(s.id, patch), patch.active === false ? 'Foto oculta: ya no aparece al reservar.' : patch.active ? 'Foto visible otra vez.' : 'Guardado.')}
              onRemove={() => run(() => client.remove(s.id), 'Foto eliminada.')}
              onMove={(dir) => move(s, dir)} />
          ))}
        </ul>
      )}
    </div>
  );
}
