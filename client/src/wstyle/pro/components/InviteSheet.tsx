import { useState, type FormEvent } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice } from '../../agenda/components/ui';
import { clMobile, clp, fieldMessage, localTime } from '../../agenda/util';
import type { HomeService, Invitation, ProService } from '../api';
import { pro } from '../api';
import CopyLink from './CopyLink';
import Sheet from './Sheet';
import SlotPicker from './SlotPicker';

const MESSAGES: Record<string, string> = {
  past: 'Esa hora ya pasó. Elige otra.',
  self_invite: 'Ese es tu propio celular.',
  invalid_name: 'Escribe el nombre del cliente.',
};
const msgFor = (code?: string) => (code ? MESSAGES[code] ?? fieldMessage(code) : undefined);

// "Agendar" de Styluxe (RN-12, RN-13): celular, nombre, servicio, fecha y hora libre, ¿domicilio? → la cita queda
// "Invitación enviada" (ocupa la hora) y se abre WhatsApp con el mensaje prellenado. Pago por defecto: en el local.
export default function InviteSheet({ services, homeService, date: initialDate, startsAt: initialStart, today, onClose, onCreated }: {
  services: ProService[];
  homeService: HomeService;
  date: string;
  startsAt?: string | null;
  today: string;
  onClose: () => void;
  onCreated: (inv: Invitation) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
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
  const canHome = homeService.enabled && service?.homeServiceAllowed !== false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    if (name.trim().length < 2) errs.name = msgFor('invalid_name');
    if (!startsAt) errs.startsAt = 'Elige una hora libre.';
    if (home && !street.trim()) errs.street = fieldMessage('required');
    if (home && !commune.trim()) errs.commune = fieldMessage('required');
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setFormError(null);
    try {
      const inv = await pro.invite({ phone, name, serviceId, startsAt, mode: home ? 'home' : 'shop', address: home ? { street, commune, details } : undefined, note });
      setDone(inv);
      onCreated(inv);
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fields).length) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, msgFor(v)])));
        else setFormError(err.message);
        if (err.status === 409) { setStartsAt(null); setReloadKey((k) => k + 1); }
      } else setFormError('No pudimos conectar con la agenda. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet title="Invitación lista" onClose={onClose}>
        <Notice tone="ok">Le guardamos la hora a {done.appointment.customer.name}: {done.appointment.service.name}, {done.appointment.when}.</Notice>
        <p className="ag-muted">Tu invitación será enviada por WhatsApp. El método de pago por defecto es Efectivo.</p>
        <div className="pro-invite-links">
          {done.whatsappUrl && <a className="btn btn--primary" href={done.whatsappUrl} target="_blank" rel="noopener" data-wa-invite="">Enviar por WhatsApp</a>}
          <CopyLink url={done.inviteUrl} />
        </div>
        <p className="ag-fine">Si no la confirma en 24 horas (o 2 horas antes de la cita), la hora se libera.</p>
        <div className="ag-actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Listo</button></div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Invitar cita" onClose={onClose}>
      {formError && <Notice tone="error">{formError}</Notice>}
      {!services.length ? (
        <Notice>Primero elige qué servicios haces en tu <a href="/wstyle/pro/perfil/">perfil</a>.</Notice>
      ) : (
        <form onSubmit={submit} noValidate className="pro-invite">
          <Field label="Celular del cliente" type="tel" autoComplete="off" inputMode="tel" placeholder="+56 9 1234 5678" value={phone} onChange={(v) => { setPhone(v); setErrors((x) => ({ ...x, phone: undefined })); }} error={errors.phone} />
          <Field label="Nombre" autoComplete="off" value={name} maxLength={60} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} />
          <div className="ag-field">
            <label htmlFor="pro-inv-service">Servicio</label>
            <select id="pro-inv-service" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStartsAt(null); setMissing(false); }}>
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
            service={serviceId} mode={home ? 'home' : 'shop'} minDate={today} reloadKey={reloadKey}
            onLoaded={(list) => { if (startsAt && !list.some((x) => x.startsAt === startsAt)) { setMissing(true); setStartsAt(null); } }} />
          {missing && initialStart && <p className="ag-muted" role="status">A las {localTime(initialStart)} no cabe {service?.name ?? 'ese servicio'} ({service?.durationMin} min). Elige otra hora u otro servicio.</p>}
          {initialStart && startsAt === initialStart && <p className="ag-muted">Hora elegida en la agenda: {localTime(initialStart)}.</p>}
          {errors.startsAt && <p className="ag-field__error" role="alert">{errors.startsAt}</p>}
          <div className="ag-field">
            <label htmlFor="pro-inv-note">Nota (opcional)</label>
            <textarea id="pro-inv-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="ag-fine">Tu invitación será enviada por WhatsApp. El método de pago por defecto es Efectivo.</p>
          <button className="btn btn--primary ag-wide" disabled={busy}>Enviar invitación</button>
        </form>
      )}
    </Sheet>
  );
}
