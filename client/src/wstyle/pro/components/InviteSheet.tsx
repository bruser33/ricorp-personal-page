import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice } from '../../agenda/components/ui';
import { clMobile, clp, fieldMessage, localDate, localTime } from '../../agenda/util';
import type { CustomerHit, HomeService, Invitation, ProService } from '../api';
import { proBooking, searchable, type BookingAdapter } from '../booking';
import BlockForm from './BlockForm';
import CopyLink from './CopyLink';
import Sheet from './Sheet';
import SlotPicker from './SlotPicker';

const MESSAGES: Record<string, string> = {
  past: 'Esa hora ya pasó. Elige otra.',
  self_invite: 'Ese es tu propio celular.',
  invalid_name: 'Escribe el nombre del cliente.',
};
const msgFor = (code?: string) => (code ? MESSAGES[code] ?? fieldMessage(code) : undefined);
const visit = (iso: string | null) =>
  iso ? `Última visita: ${new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: localDate(iso).slice(0, 4) === localDate(Date.now()).slice(0, 4) ? undefined : 'numeric' }).format(new Date(iso))}` : 'Aún sin visitas';

export type SheetTab = 'book' | 'block';

// "Agendar" de Styluxe (SPEC-33 RN-12/13) + SPEC-55: desde un hueco libre se abre "Reservar en este hueco" con dos
// pestañas. [Reservar]: buscador de clientes (o cliente nuevo por celular y nombre) y "Enviar invitación" (el cliente
// confirma por link) o "Ya está confirmada". [Bloquear]: bloqueo rápido con motivo y duración.
export default function InviteSheet({ services, homeService, date: initialDate, startsAt: initialStart, today, onClose, onCreated, adapter = proBooking, tab: initialTab = 'book', gapMin = 0, onBlocked }: {
  services: ProService[];
  homeService: HomeService;
  date: string;
  startsAt?: string | null;
  today: string;
  onClose: () => void;
  onCreated: (inv: Invitation) => void;
  adapter?: BookingAdapter;
  tab?: SheetTab;
  // Minutos libres desde la hora tocada hasta el fin del hueco (para "No alcanza").
  gapMin?: number;
  onBlocked?: () => void;
}) {
  const admin = adapter.who === 'admin';
  const fromGrid = Boolean(initialStart) || initialTab === 'block';
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[] | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState<CustomerHit | null>(null);
  const [confirmed, setConfirmed] = useState(admin);
  // Desde un hueco de 30 min: arranca con el servicio más corto (el que seguro cabe); se puede cambiar.
  const [serviceId, setServiceId] = useState(() =>
    (initialStart ? [...services].sort((a, b) => a.durationMin - b.durationMin)[0] : services[0])?.id ?? '');
  const [missing, setMissing] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [startsAt, setStartsAt] = useState<string | null>(initialStart ?? null);
  const [home, setHome] = useState(false);
  const [street, setStreet] = useState('');
  const [commune, setCommune] = useState('');
  const [details, setDetails] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Invitation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const service = services.find((s) => s.id === serviceId);
  const canHome = !admin && homeService.enabled && service?.homeServiceAllowed !== false;
  const tooLong = Boolean(initialStart && gapMin > 0 && service && service.durationMin > gapMin && startsAt === null && missing);

  // Buscador (RN-02): espera a que se deje de escribir; mínimo 3 letras o 4 dígitos.
  useEffect(() => {
    if (chosen || !searchable(q)) {
      Promise.resolve().then(() => { setHits(null); setSearchErr(null); });
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      adapter.search(q.trim()).then(
        (r) => { if (alive) { setHits(r.items); setSearchErr(null); } },
        (e) => { if (alive) { setHits([]); setSearchErr(e instanceof ApiError && e.status ? e.message : 'No pudimos buscar.'); } },
      );
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, chosen, adapter]);

  function choose(h: CustomerHit) {
    setChosen(h);
    setName(h.name);
    setPhone('');
    setErrors((x) => ({ ...x, phone: undefined, name: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (!chosen && !clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    if (name.trim().length < 2) errs.name = msgFor('invalid_name');
    if (!startsAt) errs.startsAt = 'Elige una hora libre.';
    else if (Date.parse(startsAt) <= Date.now()) errs.startsAt = MESSAGES.past; // CB-02
    if (home && !street.trim()) errs.street = fieldMessage('required');
    if (home && !commune.trim()) errs.commune = fieldMessage('required');
    setErrors(errs);
    if (errs.startsAt === MESSAGES.past) { setStartsAt(null); setReloadKey((k) => k + 1); }
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setFormError(null);
    try {
      const who = chosen ? { customerRef: chosen.ref } : { phone };
      const inv = await adapter.book({ ...who, name, serviceId, startsAt, mode: home ? 'home' : 'shop', address: home ? { street, commune, details } : undefined, note, confirmed });
      setDone(inv);
      onCreated(inv);
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fields).length) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, msgFor(v)])));
        else setFormError(err.message);
        // CB-01: otra pestaña u otro barbero tomó la hora → se recargan las horas libres.
        if (err.status === 409 || err.fields.startsAt === 'past') { setStartsAt(null); setReloadKey((k) => k + 1); }
      } else setFormError('No pudimos conectar con la agenda. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const a = done.appointment;
    return done.inviteUrl ? (
      <Sheet title="Invitación lista" onClose={onClose}>
        <Notice tone="ok">Le guardamos la hora a {a.customer.name}: {a.service.name}, {a.when}.</Notice>
        <p className="ag-muted">Tu invitación será enviada por WhatsApp. El método de pago por defecto es Efectivo.</p>
        <div className="pro-invite-links">
          {done.whatsappUrl && <a className="btn btn--primary" href={done.whatsappUrl} target="_blank" rel="noopener" data-wa-invite="">Enviar por WhatsApp</a>}
          <CopyLink url={done.inviteUrl} />
        </div>
        <p className="ag-fine">Si no la confirma en 24 horas (o 2 horas antes de la cita), la hora se libera.</p>
        <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Listo</button></div>
      </Sheet>
    ) : (
      <Sheet title="Cita confirmada" onClose={onClose}>
        <Notice tone="ok">Listo: {a.customer.name} quedó con {a.service.name}, {a.when}. La cita está confirmada.</Notice>
        <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Listo</button></div>
      </Sheet>
    );
  }

  const title = admin && adapter.barberName ? `Agenda de ${adapter.barberName}` : initialStart ? 'Reservar en este hueco' : fromGrid ? 'Bloquear un rato' : 'Invitar cita';
  return (
    <Sheet title={title} onClose={onClose}>
      {fromGrid && (
        <div className="pro-tabs2" role="tablist" aria-label="¿Qué quieres hacer?">
          <button type="button" role="tab" id="tab-book" aria-controls="panel-book" aria-selected={tab === 'book'} onClick={() => setTab('book')}>Reservar</button>
          <button type="button" role="tab" id="tab-block" aria-controls="panel-block" aria-selected={tab === 'block'} onClick={() => setTab('block')}>Bloquear</button>
        </div>
      )}
      {tab === 'block' ? (
        <div role="tabpanel" id="panel-block" aria-labelledby="tab-block">
          <BlockForm date={initialDate} startsAt={initialStart ?? null} adapter={adapter} onDone={() => onBlocked?.()} onClose={onClose} />
        </div>
      ) : (
        <div role={fromGrid ? 'tabpanel' : undefined} id="panel-book" aria-labelledby={fromGrid ? 'tab-book' : undefined}>
          {formError && <Notice tone="error">{formError}</Notice>}
          {!services.length ? (
            admin ? <Notice>Este barbero aún no elige qué servicios hace.</Notice> : <Notice>Primero elige qué servicios haces en tu <a href="/wstyle/pro/perfil/">perfil</a>.</Notice>
          ) : (
            <form onSubmit={submit} noValidate className="pro-invite">
              <fieldset className="pro-who">
                <legend>Cliente</legend>
                {chosen ? (
                  <div className="pro-hit is-chosen" data-chosen={chosen.ref}>
                    <span className="pro-hit__main"><strong>{chosen.name}</strong><span>{chosen.phoneMasked}</span></span>
                    {chosen.noShows > 0 && <em className="pro-ns">{chosen.noShows} no vino</em>}
                    <button type="button" className="ag-link" onClick={() => { setChosen(null); setName(''); }}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div className="ag-field">
                      <label htmlFor="pro-inv-q">Busca por nombre o celular</label>
                      <input id="pro-inv-q" type="search" autoComplete="off" value={q} placeholder="Ej: Pedro o 5678" onChange={(e) => setQ(e.target.value)} />
                    </div>
                    {searchErr && <p className="ag-field__error" role="alert">{searchErr}</p>}
                    {hits && hits.length === 0 && !searchErr && <p className="ag-muted" role="status">No encontramos clientes con “{q.trim()}”. Agrégalo como cliente nuevo.</p>}
                    {hits && hits.length > 0 && (
                      <ul className="pro-hits" aria-label="Clientes encontrados">
                        {hits.map((h) => (
                          <li key={h.ref}>
                            <button type="button" className="pro-hit" onClick={() => choose(h)} data-hit={h.ref}>
                              <span className="pro-hit__main"><strong>{h.name}</strong><span>{h.phoneMasked} · {visit(h.lastVisit)}</span></span>
                              {h.noShows > 0 && <em className="pro-ns" data-noshows={h.noShows}>{h.noShows} no vino</em>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="pro-who__new">Cliente nuevo</p>
                    <Field label="Celular del cliente" type="tel" autoComplete="off" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={(v) => { setPhone(v); setErrors((x) => ({ ...x, phone: undefined })); }} error={errors.phone} />
                  </>
                )}
                <Field label="Nombre" autoComplete="off" value={name} maxLength={60} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} />
                {chosen && errors.phone && <p className="ag-field__error" role="alert">{errors.phone}</p>}
              </fieldset>
              <div className="ag-field">
                <label htmlFor="pro-inv-service">Servicio</label>
                <select id="pro-inv-service" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStartsAt(initialStart ?? null); setMissing(false); }}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {clp.format(s.priceCLP)}</option>)}
                </select>
              </div>
              {canHome && (
                <div className="ag-field ag-check">
                  <label><input type="checkbox" checked={home} onChange={(e) => { setHome(e.target.checked); setStartsAt(null); }} /> A domicilio (+{clp.format(homeService.surchargeCLP)}, hasta {homeService.radiusKm} km)</label>
                </div>
              )}
              {home && (
                <div className="ag-address">
                  <Field label="Calle y número" value={street} onChange={setStreet} error={errors.street} maxLength={120} />
                  <Field label="Comuna" value={commune} onChange={setCommune} error={errors.commune} maxLength={60} />
                  <Field label="Depto / indicaciones (opcional)" value={details} onChange={setDetails} maxLength={120} />
                </div>
              )}
              <SlotPicker date={date} onDate={(d) => { setDate(d); setStartsAt(null); }} value={startsAt} onPick={(s) => { setStartsAt(s); setErrors((x) => ({ ...x, startsAt: undefined })); }}
                service={serviceId} mode={home ? 'home' : 'shop'} minDate={today} reloadKey={reloadKey} load={adapter.slots}
                onLoaded={(list) => { if (startsAt && !list.some((x) => x.startsAt === startsAt)) { setMissing(true); setStartsAt(null); } }} />
              {tooLong && <p className="pro-warn" role="status">No alcanza: este hueco es de {gapMin} min y el servicio dura {service!.durationMin}. Elige otra hora u otro servicio.</p>}
              {!tooLong && missing && initialStart && <p className="ag-muted" role="status">A las {localTime(initialStart)} no cabe {service?.name ?? 'ese servicio'} ({service?.durationMin} min). Elige otra hora u otro servicio.</p>}
              {initialStart && startsAt === initialStart && <p className="ag-muted">Hora elegida en la agenda: {localTime(initialStart)}.</p>}
              {errors.startsAt && <p className="ag-field__error" role="alert">{errors.startsAt}</p>}
              {admin ? (
                <p className="ag-fine">Queda confirmada. Si el cliente tiene correo, le llega el aviso; el barbero lo ve en su bandeja.</p>
              ) : (
                <fieldset className="ag-options pro-howto">
                  <legend>Cómo queda la cita</legend>
                  <label className={`ag-option${!confirmed ? ' is-selected' : ''}`}>
                    <input type="radio" name="pro-howto" checked={!confirmed} onChange={() => setConfirmed(false)} />
                    <span><strong>Enviar invitación</strong><small>El cliente la confirma con el link que le mandas por WhatsApp.</small></span>
                  </label>
                  <label className={`ag-option${confirmed ? ' is-selected' : ''}`}>
                    <input type="radio" name="pro-howto" checked={confirmed} onChange={() => setConfirmed(true)} />
                    <span><strong>Ya está confirmada</strong><small>El cliente está aquí o lo acordaron por teléfono. Sin link.</small></span>
                  </label>
                </fieldset>
              )}
              <div className="ag-field">
                <label htmlFor="pro-inv-note">Nota (opcional)</label>
                <textarea id="pro-inv-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {!admin && !confirmed && <p className="ag-fine">Tu invitación será enviada por WhatsApp. El método de pago por defecto es Efectivo.</p>}
              <button className="btn btn--primary ag-wide" disabled={busy}>{busy ? 'Guardando…' : admin ? 'Reservar' : confirmed ? 'Reservar confirmada' : 'Enviar invitación'}</button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}
