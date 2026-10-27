import { useEffect, useState } from 'react';
import { ApiError } from '../../agenda/api';
import { Notice, StatusPill } from '../../agenda/components/ui';
import { clp, dayMonthTime, prettyPhone } from '../../agenda/util';
import Sheet from '../../pro/components/Sheet';
import { assetUrl } from '../../pro/api';
import { admin, type AdminAppointment, type BarberDetail, type Decision, type MembershipStatus } from '../api';
import ApptSheet from '../components/ApptSheet';
import { Avatar, Loaded, Pill, ReasonForm } from '../components/common';
import { useLoad } from '../hooks';
import { MEMBERSHIP_LABEL, MEMBERSHIP_TONE, WEEKDAY_NAMES } from '../util';

const TABS: { key: MembershipStatus | ''; label: string }[] = [
  { key: 'pending', label: 'Por aprobar' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'suspended', label: 'Suspendidos' },
  { key: 'rejected', label: 'Rechazados' },
  { key: '', label: 'Todos' },
];

// Barberos (RN-02): lista por estado con búsqueda y la ficha con aprobar / rechazar / suspender / reactivar / reabrir.
export default function BarbersPage() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<MembershipStatus | ''>((params.get('estado') as MembershipStatus) || (params.get('ficha') ? '' : 'pending'));
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(params.get('ficha'));
  const list = useLoad(() => admin.barbers(tab, query), `${tab}|${query}`);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <h1 className="ag-h1">Barberos</h1>
      <div className="adm-toolbar">
        <div className="adm-tabs" role="tablist" aria-label="Estado">
          {TABS.map((t) => (
            <button key={t.key || 'all'} type="button" role="tab" aria-selected={tab === t.key} className={`ag-chip${tab === t.key ? ' is-selected' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}{t.key && list.data ? ` (${list.data.counts[t.key] ?? 0})` : ''}
            </button>
          ))}
        </div>
        <div className="ag-field adm-search">
          <label htmlFor="adm-bq" className="ag-sr">Buscar barbero</label>
          <input id="adm-bq" type="search" placeholder="Buscar por nombre, correo o celular" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Loaded state={list} label="Cargando barberos…">
        {(d) => d.items.length === 0 ? (
          <div className="pro-empty"><p>{tab === 'pending' ? 'No hay barberos esperando aprobación.' : 'No hay barberos en esta lista.'}</p></div>
        ) : (
          <ul className="adm-rows" data-list="barbers">
            {d.items.map((b) => (
              <li key={b.id}>
                <button type="button" className="adm-row adm-row--barber" onClick={() => setOpen(b.id)} data-barber={b.name}>
                  <Avatar name={b.name} url={assetUrl(b.photo)} />
                  <span className="adm-row__main">
                    <span className="adm-row__title">{b.name}</span>
                    <span className="adm-row__meta">{[b.email, prettyPhone(b.phone)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="adm-row__side">
                    <Pill tone={MEMBERSHIP_TONE[b.status]}>{MEMBERSHIP_LABEL[b.status]}</Pill>
                    {b.status === 'pending' && <span className="adm-row__meta">{b.submittedAt ? `Enviado ${dayMonthTime(b.submittedAt)}` : 'Perfil incompleto'}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
      {open && <BarberSheet id={open} onClose={() => setOpen(null)} onChanged={() => list.reload()} />}
    </>
  );
}

const DECISION_COPY: Record<Decision, { cta: string; reason?: string; danger?: boolean }> = {
  approve: { cta: 'Aprobar' },
  reject: { cta: 'Rechazar', reason: 'Motivo del rechazo (se le envía por correo)', danger: true },
  suspend: { cta: 'Suspender', reason: 'Motivo de la suspensión (se le envía por correo)', danger: true },
  reactivate: { cta: 'Reactivar' },
  reopen: { cta: 'Reabrir postulación' },
};
const ACTIONS_BY_STATUS: Record<MembershipStatus, Decision[]> = { pending: ['approve', 'reject'], approved: ['suspend'], suspended: ['reactivate'], rejected: ['reopen'] };

function BarberSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const detail = useLoad(() => admin.barber(id), id);
  const [asking, setAsking] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [appt, setAppt] = useState<string | null>(null);

  async function decide(action: Decision, reason = '') {
    setBusy(true);
    setErr(null);
    try {
      const r = await admin.decide(id, action, reason);
      setAsking(null);
      setDone(action === 'suspend' && r.futureAppointments.length
        ? `Quedó suspendido. Tiene ${r.futureAppointments.length} ${r.futureAppointments.length === 1 ? 'cita futura' : 'citas futuras'}: reasígnalas o cancélalas abajo.`
        : `Listo: ${MEMBERSHIP_LABEL[r.membership.status].toLowerCase()}.`);
      await detail.reload();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Algo salió mal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Ficha del barbero" onClose={onClose} wide>
      <Loaded state={detail} label="Cargando la ficha…">
        {(d: BarberDetail) => {
          const p = d.professional;
          const st = d.membership.status;
          const future = d.futureAppointments;
          return (
            <div className="adm-barber" data-status={st}>
              <header className="adm-barber__head">
                <span className="adm-barber__name">{p.displayName}</span>
                <Pill tone={MEMBERSHIP_TONE[st]}>{MEMBERSHIP_LABEL[st]}</Pill>
              </header>
              {d.membership.reason && <p className="ag-muted">Motivo: {d.membership.reason}</p>}
              {done && <Notice tone="ok">{done}</Notice>}
              {err && <Notice tone="error">{err}</Notice>}

              {!asking && (
                <div className="ag-actions ag-actions--wrap">
                  {ACTIONS_BY_STATUS[st].map((a) => (
                    <button key={a} type="button" className={`btn ${DECISION_COPY[a].danger ? 'btn--danger' : 'btn--primary'}`} disabled={busy || (d.self && ['suspend', 'reject'].includes(a))}
                      onClick={() => (DECISION_COPY[a].reason ? setAsking(a) : decide(a))} data-action={a}>
                      {DECISION_COPY[a].cta}
                    </button>
                  ))}
                </div>
              )}
              {asking && <ReasonForm label={DECISION_COPY[asking].reason!} cta={DECISION_COPY[asking].cta} danger busy={busy} onCancel={() => setAsking(null)} onSubmit={(r) => decide(asking, r)} />}

              {future.length > 0 && st === 'suspended' && (
                <div className="ag-notice ag-notice--error" role="alert">Este barbero tiene {future.length} {future.length === 1 ? 'cita futura' : 'citas futuras'}. Reasigna o cancela cada una.</div>
              )}

              <div className="adm-barber__grid">
                <section>
                  <h3 className="ag-h3">Datos</h3>
                  <dl className="adm-dl">
                    <dt>Correo</dt><dd>{p.email ?? '—'}</dd>
                    <dt>Celular</dt><dd>{p.phone ? prettyPhone(p.phone) : '—'}</dd>
                    <dt>Enviado</dt><dd>{d.membership.submittedAt ? dayMonthTime(d.membership.submittedAt) : 'Aún no envía su perfil'}</dd>
                    <dt>Domicilio</dt><dd>{p.homeService.enabled ? `Sí · hasta ${p.homeService.radiusKm} km · recargo ${clp.format(p.homeService.surchargeCLP)}` : 'No'}</dd>
                  </dl>
                  {p.bio && <p className="adm-bio">{p.bio}</p>}
                </section>
                <section>
                  <h3 className="ag-h3">Fotos</h3>
                  {p.photos.length ? (
                    <ul className="adm-photos">{p.photos.map((ph) => <li key={ph.id}><img src={assetUrl(ph.url) ?? ''} alt={`Trabajo de ${p.displayName}`} loading="lazy" /></li>)}</ul>
                  ) : <p className="ag-muted">Sin fotos.</p>}
                </section>
                <section>
                  <h3 className="ag-h3">Servicios</h3>
                  {d.services.some((s) => s.selected) ? (
                    <ul className="adm-tags">{d.services.filter((s) => s.selected).map((s) => <li key={s.id}>{s.name}{!s.active ? ' (inactivo)' : ''}</li>)}</ul>
                  ) : <p className="ag-muted">Aún no elige servicios.</p>}
                </section>
                <section>
                  <h3 className="ag-h3">Disponibilidad</h3>
                  {d.rules.length ? (
                    <ul className="adm-plain">{[1, 2, 3, 4, 5, 6, 7].filter((w) => d.rules.some((r) => r.weekday === w)).map((w) => (
                      <li key={w}><strong>{WEEKDAY_NAMES[w]}</strong> {d.rules.filter((r) => r.weekday === w).map((r) => `${r.start}–${r.end}`).join(', ')}</li>
                    ))}</ul>
                  ) : <p className="ag-muted">Sin horario.</p>}
                </section>
                <section>
                  <h3 className="ag-h3">Métricas</h3>
                  <dl className="adm-dl">
                    <dt>Citas</dt><dd>{d.metrics.appointments} ({d.metrics.finished} terminadas)</dd>
                    <dt>Ingresos</dt><dd>{clp.format(d.metrics.revenueCLP)}</dd>
                    <dt>Cancel. / inasist.</dt><dd>{d.metrics.cancelled} / {d.metrics.noShows}</dd>
                    {d.metrics.month && <><dt>Ocupación del mes</dt><dd>{d.metrics.month.occupancyPct.toLocaleString('es-CL')} %</dd></>}
                  </dl>
                </section>
              </div>

              <section>
                <h3 className="ag-h3">Citas futuras ({future.length})</h3>
                {future.length === 0 ? <p className="ag-muted">No tiene citas futuras.</p> : (
                  <ul className="adm-rows">
                    {future.map((a: AdminAppointment) => (
                      <li key={a.id}>
                        <button type="button" className="adm-row" onClick={() => setAppt(a.id)}>
                          <span className="adm-row__main"><span className="adm-row__title">{a.when}</span><span className="adm-row__meta">{a.customer.name} · {a.service.name}</span></span>
                          <span className="adm-row__side"><StatusPill status={a.status} label={a.statusLabel} /><span className="adm-row__meta">Reasignar o cancelar ›</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {appt && <ApptSheet id={appt} onClose={() => setAppt(null)} onChanged={() => { detail.reload(); }} />}
            </div>
          );
        }}
      </Loaded>
    </Sheet>
  );
}
