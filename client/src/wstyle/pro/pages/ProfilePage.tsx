import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../agenda/api';
import { Field, Notice, StatusPill } from '../../agenda/components/ui';
import { clMobile, fieldMessage, localDate, localTime, longDay } from '../../agenda/util';
import { pro, type HomeService, type ProAppointment, type Rule } from '../api';
import ApptSheet from '../components/ApptSheet';
import { AvailabilityEditor, HomeServiceEditor, PhotosEditor, ServicesEditor } from '../components/Editors';
import { HOME_ERRORS } from '../util';
import ProShell from '../components/ProShell';
import type { ProCtx } from '../ctx';

type Msg = { tone: 'ok' | 'error'; text: string } | null;
const errText = (e: unknown) => (e instanceof ApiError && e.status ? e.message : 'No pudimos guardar. Inténtalo de nuevo.');

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ag-card pro-section" aria-labelledby={id}>
      <h2 className="ag-h3" id={id}>{title}</h2>
      {children}
    </section>
  );
}

const MEMBERSHIP: Record<string, string> = { pending: 'En revisión', approved: 'Aprobado', rejected: 'No aprobado', suspended: 'Suspendido' };
const MEMBERSHIP_TONE: Record<string, string> = { pending: 'pendiente', approved: 'confirmada', rejected: 'cancelada', suspended: 'propuesta_cambio' };

// /wstyle/pro/perfil/ — fotos, nombre público, servicios, disponibilidad, ausencias, domicilio y "Haces parte de WS
// Style" (flujo principal 5). Un barbero pendiente también puede editarlo (RN-03).
export default function ProfilePage({ ctx }: { ctx: ProCtx }) {
  const { me, setMe, session } = ctx;
  const [displayName, setDisplayName] = useState(me!.professional.displayName);
  const [phone, setPhone] = useState(me!.professional.phone ?? '');
  const [bio, setBio] = useState(me!.professional.bio);
  const [dataErr, setDataErr] = useState<Record<string, string | undefined>>({});
  const [services, setServices] = useState(() => me!.services.filter((s) => s.selected).map((s) => s.id));
  const [rules, setRules] = useState<Rule[]>(me!.rules);
  const [home, setHome] = useState<HomeService>(me!.professional.homeService);
  const [homeErr, setHomeErr] = useState<Record<string, string | undefined>>({});
  const [adjust, setAdjust] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Record<string, Msg>>({});
  const [off, setOff] = useState({ fromDate: '', fromTime: '', toDate: '', toTime: '', reason: '' });
  const [clash, setClash] = useState<{ text: string; list: ProAppointment[] } | null>(null);
  const [sheet, setSheet] = useState<ProAppointment | null>(null);
  const [today] = useState(() => localDate(Date.now()));
  if (!me) return null;
  const approved = me.membership.status === 'approved';
  const say = (k: string, m: Msg) => setMsgs((x) => ({ ...x, [k]: m }));

  async function saveData(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | undefined> = {};
    if (displayName.trim().length < 2) errs.displayName = 'Entre 2 y 60 caracteres.';
    if (!clMobile(phone)) errs.phone = fieldMessage('invalid_phone');
    setDataErr(errs);
    if (Object.values(errs).some(Boolean)) return;
    try {
      const r = await pro.updateProfile({ displayName, phone, bio });
      setMe({ ...me!, professional: r.professional });
      say('data', { tone: 'ok', text: 'Guardado.' });
    } catch (err) { say('data', { tone: 'error', text: errText(err) }); }
  }
  async function saveServices() {
    if (!services.length) return say('services', { tone: 'error', text: 'Elige al menos un servicio.' });
    try {
      await pro.setServices(services);
      setMe({ ...me!, services: me!.services.map((s) => ({ ...s, selected: services.includes(s.id) })) });
      say('services', { tone: 'ok', text: 'Guardado. Las citas ya tomadas se mantienen.' });
    } catch (err) { say('services', { tone: 'error', text: errText(err) }); }
  }
  async function saveRules() {
    try {
      const r = await pro.setAvailability(rules);
      setRules(r.rules);
      setAdjust(r.adjustments);
      setMe({ ...me!, rules: r.rules });
      say('rules', { tone: 'ok', text: 'Horario guardado.' });
    } catch (err) { say('rules', { tone: 'error', text: errText(err) }); }
  }
  async function saveHome() {
    setHomeErr({});
    try {
      const r = await pro.setHomeService(home);
      setMe({ ...me!, professional: { ...me!.professional, homeService: r.homeService } });
      say('home', { tone: 'ok', text: r.homeService.enabled ? 'Guardado.' : 'Domicilio desactivado. Tus citas a domicilio ya confirmadas se mantienen.' });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setHomeErr(Object.fromEntries(Object.keys(err.fields).map((k) => [k, HOME_ERRORS[k]])));
      else say('home', { tone: 'error', text: errText(err) });
    }
  }
  async function addOff(e: FormEvent) {
    e.preventDefault();
    setClash(null);
    if (!off.fromDate) return say('off', { tone: 'error', text: 'Elige desde qué fecha.' });
    try {
      const r = await pro.addTimeOff({ fromDate: off.fromDate, fromTime: off.fromTime || undefined, toDate: off.toDate || off.fromDate, toTime: off.toTime || undefined, reason: off.reason });
      setMe({ ...me!, timeOffs: [...me!.timeOffs, r.timeOff].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });
      setOff({ fromDate: '', fromTime: '', toDate: '', toTime: '', reason: '' });
      say('off', { tone: 'ok', text: 'Ausencia guardada: esas horas ya no se ofrecen.' });
    } catch (err) {
      // CB-04: choca con citas → la lista para moverlas o cancelarlas antes de guardar.
      if (err instanceof ApiError && err.code === 'time_off_conflict') setClash({ text: err.message, list: (err.data.appointments as ProAppointment[]) ?? [] });
      else say('off', { tone: 'error', text: errText(err) });
    }
  }
  async function removeOff(id: string) {
    try {
      await pro.removeTimeOff(id);
      setMe({ ...me!, timeOffs: me!.timeOffs.filter((t) => t.id !== id) });
    } catch (err) { say('off', { tone: 'error', text: errText(err) }); }
  }

  const fmt = (iso: string) => `${longDay(localDate(iso))} ${localTime(iso)}`;
  const note = (k: string) => (msgs[k] ? <Notice tone={msgs[k]!.tone}>{msgs[k]!.text}</Notice> : null);

  return (
    <ProShell tab="perfil" operative={approved} unread={me.unread} onUnreadChange={approved ? (n) => setMe({ ...me, unread: n }) : undefined}>
      <h1 className="ag-h1">Perfil</h1>
      <div className="pro-profile">
        <Section id="pro-team" title="Haces parte de WS Style">
          <p className="pro-team"><StatusPill status={MEMBERSHIP_TONE[me.membership.status]} label={MEMBERSHIP[me.membership.status]} /> <span>{me.business.name} · Barbería</span></p>
          {me.membership.status === 'pending' && <p className="ag-muted">Tu perfil está en revisión. Te avisaremos por correo cuando WS Style lo apruebe.</p>}
          {me.platformFeeRate > 0 && <p className="ag-fine">El cliente paga aparte una tarifa de servicio (administración de la plataforma {Math.round(me.platformFeeRate * 10000) / 100} % + costo de pagos). Tu parte es el precio del servicio más el domicilio.</p>}
        </Section>

        <Section id="pro-photos" title="Fotos">
          <PhotosEditor photos={me.professional.photos} onChange={(photos) => setMe({ ...me, professional: { ...me.professional, photos } })} />
        </Section>

        <Section id="pro-data" title="Tus datos">
          <form onSubmit={saveData} noValidate>
            {note('data')}
            <Field label="Nombre público" value={displayName} onChange={(v) => { setDisplayName(v); setDataErr({}); }} error={dataErr.displayName} maxLength={60} />
            <Field label="Celular (WhatsApp)" type="tel" inputMode="tel" value={phone} onChange={(v) => { setPhone(v); setDataErr({}); }} error={dataErr.phone} />
            <div className="ag-field">
              <label htmlFor="pro-bio">Sobre ti (opcional)</label>
              <textarea id="pro-bio" rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <button className="btn btn--primary">Guardar</button>
          </form>
        </Section>

        <Section id="pro-services" title="Servicios">
          {note('services')}
          <ServicesEditor services={me.services} value={services} onChange={setServices} />
          <button type="button" className="btn btn--primary" onClick={saveServices}>Guardar servicios</button>
        </Section>

        <Section id="pro-rules" title="¿Cuándo trabajas?">
          {note('rules')}
          {adjust.map((a) => <Notice key={a}>{a}</Notice>)}
          <AvailabilityEditor value={rules} onChange={setRules} hours={me.business.hours} />
          <button type="button" className="btn btn--primary" onClick={saveRules}>Guardar horario</button>
        </Section>

        <Section id="pro-off" title="Ausencias">
          {note('off')}
          {me.timeOffs.length > 0 ? (
            <ul className="ag-list">
              {me.timeOffs.map((t) => (
                <li key={t.id} className="ag-item">
                  <span className="ag-item__main"><strong>{t.reason || 'Ausencia'}</strong><span className="ag-item__when">{fmt(t.startsAt)} → {fmt(t.endsAt)}</span></span>
                  <button type="button" className="ag-link" onClick={() => removeOff(t.id)}>Quitar</button>
                </li>
              ))}
            </ul>
          ) : <p className="ag-muted">No tienes ausencias programadas.</p>}
          <form className="pro-off" onSubmit={addOff} noValidate>
            <div className="pro-off__grid">
              <div className="ag-field"><label htmlFor="off-from">Desde</label><input id="off-from" type="date" min={today} value={off.fromDate} onChange={(e) => setOff({ ...off, fromDate: e.target.value })} /></div>
              <div className="ag-field"><label htmlFor="off-from-t">Hora (opcional)</label><input id="off-from-t" type="time" step={900} value={off.fromTime} onChange={(e) => setOff({ ...off, fromTime: e.target.value })} /></div>
              <div className="ag-field"><label htmlFor="off-to">Hasta</label><input id="off-to" type="date" min={off.fromDate || today} value={off.toDate} onChange={(e) => setOff({ ...off, toDate: e.target.value })} /></div>
              <div className="ag-field"><label htmlFor="off-to-t">Hora (opcional)</label><input id="off-to-t" type="time" step={900} value={off.toTime} onChange={(e) => setOff({ ...off, toTime: e.target.value })} /></div>
            </div>
            <Field label="Motivo (p.ej. vacaciones, trámite)" value={off.reason} onChange={(v) => setOff({ ...off, reason: v })} maxLength={80} />
            {clash && (
              <div className="ag-notice ag-notice--error" role="alert">
                <p>{clash.text}</p>
                <ul className="ag-list">
                  {clash.list.map((a) => (
                    <li key={a.id} className="ag-item">
                      <span className="ag-item__main"><strong>{a.customer.name}</strong><span className="ag-item__when">{a.when} · {a.service.name}</span></span>
                      {approved && <button type="button" className="ag-link" onClick={() => setSheet(a)}>Mover o cancelar</button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn btn--primary">Agregar ausencia</button>
          </form>
        </Section>

        <Section id="pro-home" title="¿Haces domicilio?">
          {note('home')}
          <HomeServiceEditor value={home} onChange={(h) => { setHome(h); setHomeErr({}); }} errors={homeErr} />
          <button type="button" className="btn btn--primary" onClick={saveHome}>Guardar domicilio</button>
        </Section>

        <p><button type="button" className="ag-link" onClick={async () => { await session.logout(); location.href = '/wstyle/pro/'; }}>Cerrar sesión</button></p>
      </div>
      {sheet && (
        <ApptSheet appt={sheet} mode="detail" today={today} onChange={(a) => setClash((c) => (c ? { ...c, list: c.list.map((x) => (x.id === a.id ? a : x)) } : c))}
          reload={() => {}} onClose={() => setSheet(null)} />
      )}
    </ProShell>
  );
}
