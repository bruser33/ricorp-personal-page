import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice } from '../../agenda/components/ui';
import { clp } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { admin, type AdminService, type ExportContent } from '../api';
import { Loaded, Pill } from '../components/common';
import { useLoad } from '../hooks';
import { durationProblem, hoursJsonText, priceProblem, publishedDiff, servicesJsonText, type PriceDiff } from '../util';

// Carta (RN-04): CRUD con validaciones (CB-06), archivar si hay citas, conflicto de versión (CB-09), aviso cuando el
// HTML publicado quedó con otros precios (CB-08) y "Exportar a JSON" (RN-06; el panel no hace commits ni despliega).
export default function ServicesPage() {
  const list = useLoad(() => admin.services(), 'services');
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [diff, setDiff] = useState<PriceDiff[] | null>(null);
  const [exported, setExported] = useState<ExportContent | null>(null);

  // CB-08: compara con el services.json publicado (el que usó el HTML prerenderizado).
  useEffect(() => {
    if (!list.data) return;
    let alive = true;
    fetch('/wstyle/content/services.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then(
      (pub) => { if (alive) setDiff(publishedDiff(Array.isArray(pub) ? pub : [], list.data!.items)); },
      () => { if (alive) setDiff(null); },
    );
    return () => { alive = false; };
  }, [list.data]);

  async function remove(s: AdminService) {
    const verb = s.appointments ? 'archivar' : 'borrar';
    if (!confirm(`¿Seguro que quieres ${verb} "${s.name}"?${s.appointments ? ' Tiene citas: se archiva (deja de ofrecerse) y las citas no cambian.' : ''}`)) return;
    try {
      const r = await admin.removeService(s._id);
      setFlash({ tone: r.unbookableBarbers.length ? 'error' : 'ok', text: `${r.result === 'archived' ? 'Archivado' : 'Borrado'}: ${s.name}.${r.unbookableBarbers.length ? ` Ojo: ${r.unbookableBarbers.join(', ')} ya no ${r.unbookableBarbers.length === 1 ? 'es reservable' : 'son reservables'} (era su único servicio).` : ''}` });
      list.reload();
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo' });
    }
  }

  async function unarchive(s: AdminService) {
    try {
      await admin.updateService(s._id, { archived: false, updatedAt: s.updatedAt });
      setFlash({ tone: 'ok', text: `${s.name} vuelve a ofrecerse.` });
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo' });
    }
    list.reload();
  }

  async function doExport() {
    try {
      setExported(await admin.exportContent());
    } catch (e) {
      setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'No se pudo exportar' });
    }
  }

  function download(name: string, text: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <>
      <div className="adm-title-row">
        <h1 className="ag-h1">Carta</h1>
        <div className="ag-actions ag-actions--wrap">
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>Nuevo servicio</button>
          <button type="button" className="btn btn--ghost" onClick={doExport}>Exportar a JSON</button>
        </div>
      </div>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {!!diff?.length && (
        <div className="ag-notice adm-diff" role="status" data-notice="published-diff">
          <strong>El HTML publicado tiene precios distintos a los actuales. Exporta el JSON para actualizarlo.</strong>
          <ul>{diff.map((d) => <li key={d.id}>{d.name}: publicado {d.published == null ? '—' : clp.format(d.published)} · actual {d.current == null ? 'ya no se ofrece' : clp.format(d.current)}</li>)}</ul>
          <p className="ag-muted">La landing ya muestra los precios actuales (los lee de la API); el JSON solo actualiza el HTML para buscadores.</p>
        </div>
      )}
      <Loaded state={list} label="Cargando la carta…">
        {(d) => (
          <ul className="adm-rows" data-list="services">
            {d.items.map((s) => (
              <li key={s._id}>
                <div className={`adm-row adm-row--svc${s.archived ? ' is-archived' : ''}`} data-service={s.id}>
                  <span className="adm-row__main">
                    <span className="adm-row__title">{s.name}</span>
                    <span className="adm-row__meta">{s.description || 'Sin descripción'}</span>
                    <span className="adm-row__meta">{s.durationMin} min · {s.homeServiceAllowed ? 'También a domicilio' : 'Solo en el local'} · {s.appointments} {s.appointments === 1 ? 'cita' : 'citas'}</span>
                  </span>
                  <span className="adm-row__side">
                    <span className="adm-price">{clp.format(s.priceCLP)}</span>
                    {s.archived ? <Pill tone="off">Archivado</Pill> : !s.active ? <Pill tone="warn">Inactivo</Pill> : <Pill tone="ok">Activo</Pill>}
                    <span className="adm-row__btns">
                      {s.archived ? <button type="button" className="ag-link" onClick={() => unarchive(s)}>Volver a ofrecer</button> : (
                        <>
                          <button type="button" className="ag-link" onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`}>Editar</button>
                          <button type="button" className="ag-link adm-danger-link" onClick={() => remove(s)} aria-label={`${s.appointments ? 'Archivar' : 'Borrar'} ${s.name}`}>{s.appointments ? 'Archivar' : 'Borrar'}</button>
                        </>
                      )}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
      {editing && (
        <ServiceForm service={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setFlash({ tone: msg.startsWith('Ojo') ? 'error' : 'ok', text: msg }); list.reload(); }}
          onStale={() => { setEditing(null); setFlash({ tone: 'error', text: 'Este servicio cambió mientras lo editabas. Recargamos la carta: vuelve a editarlo.' }); list.reload(); }} />
      )}
      {exported && (
        <Sheet title="Exportar a JSON" onClose={() => setExported(null)} wide>
          <div className="adm-export">
            <p>Para que el HTML publicado (buscadores, JSON-LD) quede al día, reemplaza estos archivos en el repo y despliega. El panel no hace commits ni despliega.</p>
            <ol>
              <li><strong>client/public/wstyle/content/services.json</strong> — reemplázalo completo.
                <div className="ag-actions"><button type="button" className="btn btn--primary" onClick={() => download('services.json', servicesJsonText(exported.services))}>Descargar services.json</button></div>
              </li>
              <li><strong>client/public/wstyle/content/site.json</strong> — reemplaza solo la clave <code>"hours"</code> por:
                <textarea className="adm-code" readOnly rows={8} value={hoursJsonText(exported.hours)} onFocus={(e) => e.currentTarget.select()} aria-label="Horario en formato de site.json" />
                <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(hoursJsonText(exported.hours))}>Copiar horario</button></div>
              </li>
            </ol>
          </div>
        </Sheet>
      )}
    </>
  );
}

function ServiceForm({ service, onClose, onSaved, onStale }: { service: AdminService | null; onClose: () => void; onSaved: (msg: string) => void; onStale: () => void }) {
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service ? String(service.priceCLP) : '');
  const [duration, setDuration] = useState(service ? String(service.durationMin) : '30');
  const [home, setHome] = useState(service?.homeServiceAllowed ?? true);
  const [active, setActive] = useState(service?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = { name: name.trim().length < 2 ? 'Escribe el nombre (mínimo 2 letras).' : undefined, price: priceProblem(price) ?? undefined, duration: durationProblem(duration) ?? undefined };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setErr(null);
    const body = { name: name.trim(), description: description.trim(), priceCLP: Number(price), durationMin: Number(duration), homeServiceAllowed: home, active };
    try {
      if (!service) {
        const r = await admin.createService(body);
        onSaved(`Creado: ${r.service.name}.`);
      } else {
        const r = await admin.updateService(service._id, { ...body, updatedAt: service.updatedAt });
        const warn = r.unbookableBarbers.length ? `Ojo: ${r.unbookableBarbers.join(', ')} ya no ${r.unbookableBarbers.length === 1 ? 'es reservable' : 'son reservables'} (era su único servicio activo).` : '';
        onSaved(warn || (service.priceCLP !== r.service.priceCLP ? `Guardado. Las citas ya tomadas mantienen su precio (${clp.format(service.priceCLP)}).` : 'Guardado.'));
      }
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === 'stale') { onStale(); return; }
      if (e2 instanceof ApiError && e2.fields) setErrors({ name: e2.fields.name && 'Revisa el nombre.', price: e2.fields.priceCLP && e2.message, duration: e2.fields.durationMin && e2.message });
      setErr(e2 instanceof ApiError ? e2.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={service ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose}>
      <form className="adm-form" onSubmit={submit} noValidate>
        <Field label="Nombre" value={name} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} maxLength={60} />
        <div className="ag-field"><label htmlFor="s-desc">Descripción</label><textarea id="s-desc" rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="adm-form__grid">
          <Field label="Precio (CLP)" inputMode="numeric" value={price} onChange={(v) => { setPrice(v); setErrors((x) => ({ ...x, price: undefined })); }} error={errors.price} hint="Entero, sin puntos: 12000" />
          <Field label="Duración (min)" inputMode="numeric" value={duration} onChange={(v) => { setDuration(v); setErrors((x) => ({ ...x, duration: undefined })); }} error={errors.duration} hint="5 a 240, múltiplos de 5" />
        </div>
        <label className="pro-check"><input type="checkbox" checked={home} onChange={(e) => setHome(e.target.checked)} /> <span>Se puede a domicilio</span></label>
        <label className="pro-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> <span>Activo (se ofrece en la landing y la reserva)</span></label>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="ag-actions ag-actions--wrap">
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Sheet>
  );
}
