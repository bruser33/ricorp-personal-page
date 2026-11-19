import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '../api';
import { assetUrl, ACCEPT_ATTR, checkPhotoFile, styles, usePrivateImage, type Reference, type StyleChoice, type StyleItem } from '../styles';
import { Notice } from './ui';

// SPEC-59: "Tu estilo" en la reserva, miniaturas de la referencia y visor a pantalla completa.
// Diseño "Noir de oficio": esquinas rectas, filete fino hueso, la elegida con borde --brass y "ELEGIDO" en versalitas.

/* Visor a pantalla completa (fondo negro 92 %). Se cierra con Escape, con el botón o tocando fuera de la foto. */
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="st-viewer" role="dialog" aria-modal="true" aria-label={alt} data-viewer="" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <img className="st-viewer__img" src={src} alt={alt} />
      <button type="button" ref={close} className="st-viewer__close" onClick={onClose}>Cerrar</button>
    </div>
  );
}

/* Miniatura que abre el visor. `privatePath` = foto del cliente (exige sesión). */
export function Thumb({ src, privatePath, alt, size = 64 }: { src?: string | null; privatePath?: string | null; alt: string; size?: number }) {
  const priv = usePrivateImage(privatePath ?? null);
  const [open, setOpen] = useState(false);
  const url = privatePath ? priv.url : src ? assetUrl(src) : null;
  if (privatePath && priv.failed) return <span className="st-thumb st-thumb--empty" style={{ width: size, height: size }}>Foto no disponible</span>;
  return (
    <>
      <button type="button" className="st-thumb" style={{ width: size, height: size }} onClick={() => url && setOpen(true)} aria-label={`Ver en grande: ${alt}`} disabled={!url} data-thumb="">
        {url ? <img src={url} alt={alt} /> : <span className="st-thumb__loading" aria-hidden="true" />}
      </button>
      {open && url && <PhotoViewer src={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/* La referencia guardada en la cita: "Estilo: …" + miniaturas (RN-05: si el estilo ya no está, el nombre y un aviso). */
export function ReferenceSummary({ reference, size = 64, title = 'Tu estilo' }: { reference: Reference | null | undefined; size?: number; title?: string }) {
  if (!reference) return null;
  const { style, clientPhoto, clientPhotoNotice } = reference;
  return (
    <div className="st-ref" data-reference="">
      <p className="st-ref__title">{title}</p>
      {style && <p className="st-ref__name">Estilo: <strong>{style.name}</strong>{!style.photoUrl && <span className="ag-muted"> · Foto ya no disponible</span>}</p>}
      <div className="st-ref__thumbs">
        {style?.photoUrl && <Thumb src={style.photoUrl} alt={`Estilo ${style.name}`} size={size} />}
        {clientPhoto && <Thumb privatePath={clientPhoto.url} alt="Foto de referencia del cliente" size={size} />}
      </div>
      {clientPhoto && <p className="ag-fine">{style ? 'Más la foto que subió el cliente.' : 'Foto que subió el cliente.'}</p>}
      {clientPhotoNotice && <p className="ag-muted" data-photo-notice="">{clientPhotoNotice}</p>}
    </div>
  );
}

/* Grilla de estilos como radio group (CB-10: alt con el nombre, foco visible). */
function StyleGrid({ items, value, onPick, label }: { items: StyleItem[]; value: string | null; onPick: (s: StyleItem) => void; label: string }) {
  const name = useId();
  return (
    <fieldset className="st-grid" aria-label={label}>
      <legend className="ag-sr">{label}</legend>
      {items.map((s) => (
        <label key={s.id} className={`st-card${value === s.id ? ' is-selected' : ''}`} data-style={s.id}>
          <input type="radio" name={name} className="ag-sr" checked={value === s.id} onChange={() => onPick(s)} />
          <span className="st-card__img"><img src={assetUrl(s.photoUrl)} alt={s.name} loading="lazy" /></span>
          <span className="st-card__name">{s.name}</span>
          {value === s.id && <span className="st-card__chosen" aria-hidden="true">✓ Elegido</span>}
        </label>
      ))}
    </fieldset>
  );
}

/* Bloque opcional "Tu estilo" (asunción 1: dentro del paso 1, después de servicio y barbero). Nunca bloquea la
   reserva (RN-01): si el catálogo no carga, se puede subir una foto o seguir sin nada. */
export function StylePicker({ serviceId, serviceName, value, onChange, initialItems = null }: {
  serviceId: string; serviceName: string; value: StyleChoice; onChange: (c: StyleChoice) => void;
  /* Para pruebas (render estático): estilos ya cargados. */
  initialItems?: StyleItem[] | null;
}) {
  const [items, setItems] = useState<StyleItem[] | null>(initialItems);
  const [all, setAll] = useState<StyleItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) { setItems(null); setShowAll(false); } });
    styles.list(serviceId).then((r) => { if (alive) setItems(r.items); }, () => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [serviceId]);

  useEffect(() => {
    if (!showAll || all) return;
    let alive = true;
    styles.list().then((r) => { if (alive) setAll(r.items); }, () => { if (alive) setAll([]); });
    return () => { alive = false; };
  }, [showAll, all]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = checkPhotoFile(f);
    if (problem) return setError(problem);
    setError(null);
    setUploading(true);
    try {
      const r = await styles.uploadReference(f);
      const prev = valueRef.current.photo;
      onChange({ ...valueRef.current, photo: { id: r.id, url: r.url, preview: URL.createObjectURL(f) } });
      // Reemplazo antes de confirmar: la provisional anterior no se queda en el server.
      if (prev) styles.discardReference(prev.id).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError && err.status ? err.message : 'No pudimos subir la foto. Puedes reintentar o seguir sin foto.');
    } finally {
      setUploading(false);
    }
  }

  const removePhoto = () => {
    const prev = value.photo;
    onChange({ ...value, photo: null });
    if (prev) styles.discardReference(prev.id).catch(() => {});
  };
  const decideLater = () => {
    removePhoto();
    onChange({ style: null, photo: null });
    setError(null);
  };

  const ids = new Set((items ?? []).map((s) => s.id));
  const others = (all ?? []).filter((s) => !ids.has(s.id));
  const hasStyles = (items?.length ?? 0) > 0;

  return (
    <section className="st-picker" aria-labelledby="st-picker-title" data-style-picker="">
      <h3 className="ag-h3" id="st-picker-title">Tu estilo <span className="ag-muted st-optional">(opcional)</span></h3>
      <p className="ag-muted">{hasStyles ? `Elige una foto de referencia para tu ${serviceName.toLowerCase()} o sube la tuya. Así tu barbero sabe qué buscas.` : 'Si tienes una foto del estilo que buscas, súbela. Así tu barbero sabe qué buscas.'}</p>
      {items === null && <p className="ag-muted" role="status">Cargando estilos…</p>}
      {/* CB-06: sin estilos para este servicio no se muestra una grilla vacía. */}
      {hasStyles && <StyleGrid items={items!} value={value.style?.id ?? null} onPick={(s) => onChange({ ...value, style: s })} label={`Estilos para ${serviceName}`} />}
      {hasStyles && !showAll && <button type="button" className="ag-link st-all" onClick={() => setShowAll(true)}>Ver todos</button>}
      {showAll && all === null && <p className="ag-muted" role="status">Cargando…</p>}
      {showAll && others.length > 0 && (
        <>
          <p className="st-sub">Otros estilos</p>
          <StyleGrid items={others} value={value.style?.id ?? null} onPick={(s) => onChange({ ...value, style: s })} label="Otros estilos" />
        </>
      )}
      <div className="st-own">
        {value.photo ? (
          <div className="st-own__picked">
            {value.photo.preview ? <Thumb src={value.photo.preview} alt="Tu foto" /> : <Thumb privatePath={value.photo.url} alt="Tu foto" />}
            <span>Tu foto quedó lista.</span>
            <button type="button" className="ag-link" onClick={() => file.current?.click()} disabled={uploading}>Cambiar</button>
            <button type="button" className="ag-link" onClick={removePhoto}>Quitar</button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => file.current?.click()} disabled={uploading} aria-busy={uploading} data-upload-own="">
            {uploading ? 'Subiendo tu foto…' : 'Subir tu foto'}
          </button>
        )}
        <input ref={file} type="file" accept={ACCEPT_ATTR} className="ag-sr" tabIndex={-1} aria-label="Subir tu foto de referencia" onChange={onFile} data-own-input="" />
        <button type="button" className="btn btn--ghost" onClick={decideLater} aria-pressed={!value.style && !value.photo}>Decido en la barbería</button>
      </div>
      <p className="ag-fine">JPG, PNG o WebP, hasta 5 MB. Tu foto solo la ven tu barbero y el local.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

/* RN-09: en la página de la cita el cliente cambia o quita su referencia mientras la cita no termina. */
export function ReferenceEditor({ apptId, serviceId, serviceName, reference, onSaved }: { apptId: string; serviceId: string; serviceName: string; reference: Reference | null; onSaved: (r: Reference | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<StyleChoice>({ style: null, photo: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setChoice({
      style: reference?.style?.id ? { id: reference.style.id, name: reference.style.name, category: '', serviceIds: [], photoUrl: reference.style.photoUrl ?? '' } : null,
      photo: reference?.clientPhoto ? { id: reference.clientPhoto.id, url: reference.clientPhoto.url } : null,
    });
    setError(null);
    setEditing(true);
  };
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const a = await styles.changeReference(apptId, { styleId: choice.style?.id ?? null, clientPhotoId: choice.photo?.id ?? null });
      onSaved((a as unknown as { reference: Reference | null }).reference ?? null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status ? err.message : 'No pudimos guardar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  if (!editing) {
    return <p><button type="button" className="ag-link" onClick={start} data-edit-reference="">{reference ? 'Cambiar o quitar tu foto de referencia' : 'Agregar una foto de referencia'}</button></p>;
  }
  return (
    <div className="st-edit">
      <StylePicker serviceId={serviceId} serviceName={serviceName} value={choice} onChange={setChoice} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="ag-actions">
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>Volver</button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}
