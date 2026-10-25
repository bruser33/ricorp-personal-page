import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { agenda, ApiError, type Catalog } from '../../agenda/api';
import { Field, Notice, StatusPill } from '../../agenda/components/ui';
import { addDays, clMobile, clp, isEmail, localDate, localTime, longDay, prettyPhone } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { admin, downloadCsv, type AdminAppointment, type ApptFilters } from '../api';
import ApptSheet from '../components/ApptSheet';
import { Loaded } from '../components/common';
import { useLoad, useToday } from '../hooks';
import { paymentLabel, STATUS_OPTIONS } from '../util';

const PAY_OPTIONS: [string, string][] = [
  ['', 'Todos los pagos'],
  ['local:pendiente', 'En el local · por cobrar'],
  ['local:cobrado', 'En el local · cobrado'],
  ['local:pago_pendiente', 'Terminó sin cobrar'],
  ['online:pagado', 'En línea · pagado'],
  [':reembolso_pendiente', 'Reembolso pendiente'],
];

// Citas (RN-03): todas las de todos los barberos, con filtros, acciones por cita, agendar por teléfono y CSV.
export default function AppointmentsPage() {
  const today = useToday();
  const init = useMemo(() => {
    const p = new URLSearchParams(location.search);
    const rango = p.get('rango');
    const pago = p.get('pago');
    return {
      from: rango === 'hoy' ? today : p.get('desde') ?? (pago || p.get('estado') ? '' : today),
      to: rango === 'hoy' ? today : p.get('hasta') ?? (pago || p.get('estado') ? '' : addDays(today, 6)),
      status: p.get('estado') ?? '',
      pay: pago ? `:${pago}` : '',
    };
  }, [today]);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [pro, setPro] = useState('');
  const [status, setStatus] = useState(init.status);
  const [pay, setPay] = useState(init.pay);
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const barbers = useLoad(() => admin.barbers(''), 'barbers');

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let alive = true;
    agenda.catalog().then((c) => { if (alive) setCatalog(c); }, () => {});
    return () => { alive = false; };
  }, []);

  const [pm, ps] = pay.split(':');
  const filters: ApptFilters = { from, to, professional: pro, status, paymentMethod: pm || undefined, paymentStatus: ps || undefined, mode, q: query };
  const key = JSON.stringify(filters);
  const list = useLoad(() => admin.appointments(filters), key);

  const quick = (f: string, t: string) => { setFrom(f); setTo(t); };
  async function exportCsv() {
    setCsvErr(null);
    try {
      const blob = await downloadCsv(filters);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `citas-wstyle-${from || 'todas'}${to && to !== from ? `_${to}` : ''}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setCsvErr(e instanceof ApiError ? e.message : 'No pudimos exportar');
    }
  }
  const update = (a: AdminAppointment) => list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === a.id ? a : x)) } : d));

  return (
    <>
      <div className="adm-title-row">
        <h1 className="ag-h1">Citas</h1>
        <div className="ag-actions ag-actions--wrap">
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>Nueva cita</button>
          <button type="button" className="btn btn--ghost" onClick={exportCsv}>Exportar CSV</button>
        </div>
      </div>
      {csvErr && <Notice tone="error">{csvErr}</Notice>}
      <form className="adm-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filtros de citas">
        <div className="adm-tabs">
          <button type="button" className={`ag-chip${from === today && to === today ? ' is-selected' : ''}`} onClick={() => quick(today, today)}>Hoy</button>
          <button type="button" className={`ag-chip${from === addDays(today, 1) && to === addDays(today, 1) ? ' is-selected' : ''}`} onClick={() => quick(addDays(today, 1), addDays(today, 1))}>Mañana</button>
          <button type="button" className={`ag-chip${from === today && to === addDays(today, 6) ? ' is-selected' : ''}`} onClick={() => quick(today, addDays(today, 6))}>7 días</button>
          <button type="button" className={`ag-chip${!from && !to ? ' is-selected' : ''}`} onClick={() => quick('', '')}>Todas</button>
        </div>
        <div className="adm-filters__grid">
          <div className="ag-field"><label htmlFor="f-from">Desde</label><input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="ag-field"><label htmlFor="f-to">Hasta</label><input id="f-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ag-field"><label htmlFor="f-pro">Barbero</label>
            <select id="f-pro" value={pro} onChange={(e) => setPro(e.target.value)}>
              <option value="">Todos</option>
              {(barbers.data?.items ?? []).filter((b) => b.status === 'approved' || b.status === 'suspended').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="ag-field"><label htmlFor="f-st">Estado</label>
            <select id="f-st" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="ag-field"><label htmlFor="f-pay">Pago</label>
            <select id="f-pay" value={pay} onChange={(e) => setPay(e.target.value)}>{PAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="ag-field"><label htmlFor="f-mode">Lugar</label>
            <select id="f-mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Local y domicilio</option><option value="shop">En el local</option><option value="home">A domicilio</option></select>
          </div>
          <div className="ag-field adm-filters__q"><label htmlFor="f-q">Cliente</label><input id="f-q" type="search" placeholder="Nombre, celular o correo" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      </form>
      <Loaded state={list} label="Cargando citas…">
        {(d) => d.items.length === 0 ? <div className="pro-empty"><p>No hay citas con estos filtros.</p></div> : (
          <>
            <p className="ag-muted adm-count">{d.items.length} {d.items.length === 1 ? 'cita' : 'citas'}{d.truncated ? ' (se muestran las primeras 500; acota el rango)' : ''}</p>
            <ul className="adm-rows adm-rows--appts" data-list="appointments">
              {d.items.map((a, i) => {
                const day = localDate(a.startsAt);
                const showDay = i === 0 || localDate(d.items[i - 1].startsAt) !== day;
                return (
                  <li key={a.id}>
                    {showDay && <h2 className="adm-day">{longDay(day)}</h2>}
                    <button type="button" className="adm-row adm-row--appt" onClick={() => setOpen(a.id)} data-appt={a.id}>
                      <span className="adm-row__time">{localTime(a.startsAt)}</span>
                      <span className="adm-row__main">
                        <span className="adm-row__title">{a.customer.name}</span>
                        <span className="adm-row__meta">{a.service.name} · {a.professional.name}{a.location.kind === 'home' ? ' · A domicilio' : ''}</span>
                        <span className="adm-row__meta">{prettyPhone(a.customer.phone)}</span>
                      </span>
                      <span className="adm-row__side">
                        <StatusPill status={a.status} label={a.statusLabel} />
                        <span className="adm-row__meta">{clp.format(a.pricing.totalCLP)} · {paymentLabel(a.payment)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Loaded>
      {open && <ApptSheet id={open} onClose={() => setOpen(null)} onChanged={update} />}
      {creating && <NewAppointment catalog={catalog} onClose={() => setCreating(false)} onCreated={(a) => { setCreating(false); setOpen(a.id); list.reload(); }} />}
    </>
  );
}

// Agendar a nombre de un cliente que llamó por teléfono: queda confirmada (RN-03).
function NewAppointment({ catalog, onClose, onCreated }: { catalog: Catalog | null; onClose: () => void; onCreated: (a: AdminAppointment) => void }) {
  const today = useToday();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [service, setService] = useState('');
  const [pro, setPro] = useState('any');
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<{ startsAt: string; label: string; professionalIds: string[] }[] | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pros = (catalog?.professionals ?? []).filter((p) => !service || p.serviceIds.includes(service));

  useEffect(() => {
    if (!service || !date) return;
    let alive = true;
    Promise.resolve().then(() => { if (alive) { setSlots(null); setStartsAt(''); } });
    agenda.availability({ service, professional: pro, from: date, to: date, mode: 'shop' }).then(
      (r) => { if (alive) setSlots(r.days.find((d) => d.date === date)?.slots ?? []); },
      () => { if (alive) setSlots([]); },
    );
    return () => { alive = false; };
  }, [service, pro, date]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (name.trim().length < 2) errs.name = 'Escribe el nombre del cliente.';
    if (!clMobile(phone)) errs.phone = 'Ingresa un celular chileno: +56 9 XXXX XXXX.';
    if (email && !isEmail(email)) errs.email = 'Revisa el correo.';
    if (!service) errs.service = 'Elige un servicio.';
    if (!startsAt) errs.startsAt = 'Elige una hora.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    const slot = slots?.find((s) => s.startsAt === startsAt);
    setBusy(true);
    setErr(null);
    try {
      onCreated(await admin.createAppointment({ name, phone, email: email || undefined, serviceId: service, professionalId: pro === 'any' ? slot?.professionalIds[0] : pro, startsAt, note }));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'No pudimos agendar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Nueva cita" onClose={onClose} wide>
      <form className="adm-form" onSubmit={submit} noValidate>
        <p className="ag-muted">Para un cliente que llamó o escribió. Queda confirmada y, si das su correo, le llega el aviso.</p>
        <div className="adm-form__grid">
          <Field label="Nombre del cliente" value={name} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} autoComplete="off" />
          <Field label="Celular" type="tel" value={phone} placeholder="+56 9 1234 5678" onChange={(v) => { setPhone(v); setErrors((x) => ({ ...x, phone: undefined })); }} error={errors.phone} />
          <Field label="Correo (opcional)" type="email" value={email} onChange={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
          <div className={`ag-field${errors.service ? ' has-error' : ''}`}>
            <label htmlFor="n-svc">Servicio</label>
            <select id="n-svc" value={service} onChange={(e) => { setService(e.target.value); setErrors((x) => ({ ...x, service: undefined })); }}>
              <option value="">Elige…</option>
              {(catalog?.services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {clp.format(s.priceCLP)}</option>)}
            </select>
            {errors.service && <p className="ag-field__error" role="alert">{errors.service}</p>}
          </div>
          <div className="ag-field">
            <label htmlFor="n-pro">Barbero</label>
            <select id="n-pro" value={pro} onChange={(e) => setPro(e.target.value)}>
              <option value="any">El primero libre</option>
              {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="ag-field"><label htmlFor="n-date">Día</label><input id="n-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        {service && (
          <fieldset className={`adm-slots${errors.startsAt ? ' has-error' : ''}`}>
            <legend>Hora</legend>
            {slots === null ? <p className="ag-loading" role="status"><span className="ag-spinner" aria-hidden="true" />Buscando horas…</p>
              : slots.length === 0 ? <p className="ag-muted">Sin horas libres ese día.</p>
              : <div className="ag-times">{slots.map((s) => <button key={s.startsAt} type="button" className={`ag-chip${startsAt === s.startsAt ? ' is-selected' : ''}`} aria-pressed={startsAt === s.startsAt} onClick={() => { setStartsAt(s.startsAt); setErrors((x) => ({ ...x, startsAt: undefined })); }}>{s.label}</button>)}</div>}
            {errors.startsAt && <p className="ag-field__error" role="alert">{errors.startsAt}</p>}
          </fieldset>
        )}
        <div className="ag-field"><label htmlFor="n-note">Nota (opcional)</label><textarea id="n-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="ag-actions ag-actions--wrap">
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Agendando…' : 'Agendar cita'}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Sheet>
  );
}
