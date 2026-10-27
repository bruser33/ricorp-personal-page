import { useRef, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice } from '../../agenda/components/ui';
import { clp } from '../../agenda/util';
import { assetUrl, uploadPhotos, pro, type HomeService, type ProPhoto, type ProService, type Rule } from '../api';
import { WEEKDAYS } from '../util';

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Fotos de perfil (RN-17): hasta 4, la primera es la principal. El navegador avisa antes de subir; el server valida
// de nuevo (tipo por contenido) y las deja cuadradas en WebP.
export function PhotosEditor({ photos, onChange }: { photos: ProPhoto[]; onChange: (p: ProPhoto[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = '';
    if (!files.length) return;
    setError(null);
    if (photos.length + files.length > MAX_PHOTOS) return setError(`Puedes subir hasta ${MAX_PHOTOS} fotos. Quita alguna para agregar otra.`);
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return setError(`"${big.name}" pesa ${(big.size / 1024 / 1024).toFixed(1)} MB. Cada foto puede pesar hasta 5 MB.`);
    const bad = files.find((f) => f.type && !TYPES.includes(f.type));
    if (bad) return setError(`"${bad.name}" no es una foto JPG, PNG o WebP.`);
    setBusy(true);
    try {
      onChange((await uploadPhotos(files)).photos);
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos subir las fotos. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  async function act(fn: () => Promise<{ photos: ProPhoto[] }>) {
    setError(null);
    try {
      onChange((await fn()).photos);
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : 'No pudimos guardar el cambio.');
    }
  }
  return (
    <div className="pro-photos">
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="pro-photos__grid">
        {photos.map((p, i) => (
          <li key={p.id} className="pro-photos__item">
            <img src={assetUrl(p.url) ?? ''} alt={i === 0 ? 'Foto principal' : `Foto ${i + 1}`} width={160} height={160} />
            {i === 0 && <span className="pro-photos__main">Principal</span>}
            <div className="pro-photos__tools">
              {i > 0 && <button type="button" className="ag-link" onClick={() => act(() => pro.mainPhoto(p.id))}>Hacer principal</button>}
              <button type="button" className="ag-link" onClick={() => act(() => pro.removePhoto(p.id))}>Quitar</button>
            </div>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li className="pro-photos__add">
            <button type="button" className="pro-photos__addbtn" disabled={busy} onClick={() => input.current?.click()}>
              <span aria-hidden="true">+</span>{busy ? 'Subiendo…' : 'Agregar fotos'}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} data-photo-input="" />
      <p className="ag-fine">Hasta {MAX_PHOTOS} fotos JPG, PNG o WebP de hasta 5 MB. La primera es la que ven los clientes al reservar.</p>
    </div>
  );
}

// Servicios de la carta del local (RN-04, asunción 1): precio y duración los define WS Style.
export function ServicesEditor({ services, value, onChange, error }: { services: ProService[]; value: string[]; onChange: (v: string[]) => void; error?: string | null }) {
  return (
    <fieldset className="ag-options pro-services">
      <legend>Servicios de la carta</legend>
      {services.map((s) => {
        const on = value.includes(s.id);
        return (
          <label key={s.id} className={`ag-option pro-check${on ? ' is-selected' : ''}`}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])} />
            <span>
              <span className="ag-option__name">{s.name}</span>
              <span className="ag-option__meta">{s.durationMin} min · {clp.format(s.priceCLP)}</span>
            </span>
          </label>
        );
      })}
      {error && <p className="ag-field__error" role="alert">{error}</p>}
    </fieldset>
  );
}

type Hours = { weekday: number; opens: string | null; closes: string | null }[];

// Disponibilidad semanal (RN-05): por día, uno o más rangos. Los días que el local no abre no se pueden marcar; el
// server igual recorta lo que quede fuera y avisa (CB-03).
export function AvailabilityEditor({ value, onChange, hours }: { value: Rule[]; onChange: (r: Rule[]) => void; hours: Hours }) {
  const setDay = (wd: number, ranges: { start: string; end: string }[]) =>
    onChange([...value.filter((r) => r.weekday !== wd), ...ranges.map((r) => ({ weekday: wd, ...r }))].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
  return (
    <div className="pro-avail" role="group" aria-label="Días y horas de trabajo">
      {WEEKDAYS.map((d) => {
        const shop = hours.find((h) => h.weekday === d.n);
        const open = Boolean(shop?.opens && shop?.closes);
        const ranges = value.filter((r) => r.weekday === d.n);
        const on = ranges.length > 0;
        return (
          <div key={d.n} className={`pro-avail__day${on ? ' is-on' : ''}`}>
            <label className="pro-avail__toggle">
              <input type="checkbox" checked={on} disabled={!open} onChange={() => setDay(d.n, on ? [] : [{ start: shop!.opens!, end: shop!.closes! }])} />
              <span className="pro-avail__name">{d.short}</span>
            </label>
            <div className="pro-avail__ranges">
              {!open && <span className="ag-muted">WS Style cerrado</span>}
              {open && !on && <span className="ag-muted">No trabajo</span>}
              {ranges.map((r, i) => (
                <div key={i} className="pro-avail__range">
                  <input type="time" step={900} aria-label={`${d.long}: desde`} value={r.start} min={shop?.opens ?? undefined} max={shop?.closes ?? undefined}
                    onChange={(e) => setDay(d.n, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span aria-hidden="true">–</span>
                  <input type="time" step={900} aria-label={`${d.long}: hasta`} value={r.end} min={shop?.opens ?? undefined} max={shop?.closes ?? undefined}
                    onChange={(e) => setDay(d.n, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <button type="button" className="pro-icon-btn" aria-label={`Quitar rango ${r.start}–${r.end} del ${d.long}`} onClick={() => setDay(d.n, ranges.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {on && ranges.length < 3 && (
                <button type="button" className="ag-link pro-avail__add" onClick={() => setDay(d.n, [...ranges, { start: ranges.at(-1)!.end, end: shop!.closes! }])}>+ Agregar rango</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Domicilio (RN-06): toggle + recargo fijo + radio + margen de traslado.
export function HomeServiceEditor({ value, onChange, errors = {} }: { value: HomeService; onChange: (v: HomeService) => void; errors?: Record<string, string | undefined> }) {
  const num = (k: keyof HomeService, label: string, hint: string, min: number, max: number, step = 1) => (
    <div className={`ag-field${errors[k] ? ' has-error' : ''}`}>
      <label htmlFor={`pro-home-${k}`}>{label}</label>
      <input id={`pro-home-${k}`} type="number" inputMode="numeric" min={min} max={max} step={step} value={String(value[k])}
        aria-invalid={errors[k] ? true : undefined} aria-describedby={`pro-home-${k}-hint`}
        onChange={(e) => onChange({ ...value, [k]: e.target.value === '' ? 0 : Number(e.target.value) })} />
      {errors[k] ? <p className="ag-field__error" id={`pro-home-${k}-hint`} role="alert">{errors[k]}</p> : <p className="ag-field__hint" id={`pro-home-${k}-hint`}>{hint}</p>}
    </div>
  );
  return (
    <div className="pro-home">
      <div className="ag-field ag-check">
        <label><input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked, radiusKm: value.radiusKm || 5 })} /> Hago domicilio</label>
      </div>
      {value.enabled && (
        <div className="pro-home__grid">
          {num('surchargeCLP', 'Recargo por domicilio (CLP)', 'De $0 a $50.000. Se suma al precio del servicio.', 0, 50000, 500)}
          {num('radiusKm', 'Radio (km)', 'De 1 a 30 km desde el local.', 1, 30)}
          {num('travelBufferMin', 'Margen de traslado (min)', 'De 0 a 90 min antes y después de cada domicilio.', 0, 90, 5)}
        </div>
      )}
    </div>
  );
}
