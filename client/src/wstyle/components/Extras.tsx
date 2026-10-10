import { toCLP } from '../lib';
import { clp } from '../links';
import { str, type SiteContent } from '../content';
import { Extra } from './Section';
import './Extras.css';

// Secciones de la capa rentable (SPEC-15 AC-08). Todo sale de site.json; lo que es de ejemplo se marca visible
// como tal (nunca se presenta como real).

export function Reviews({ site }: { site: SiteContent }) {
  const r = site.reviews, items = (r?.items ?? []).filter((x) => x && str(x.text));
  if (!items.length) return null;
  return (
    <Extra id="resenas" label="07 — Lo que dicen" title="LO QUE DICEN.">
      {r?.placeholder && <p className="placeholder-note reveal">Reseñas de ejemplo: se reemplazan por las de {r.source || 'Google'} al tener la ficha del local.</p>}
      <div className="reviews reveal">
        {items.map((x, i) => (
          <figure className="review" key={i}>
            <div className="review__stars" aria-label={`${x.rating ?? 5} de 5`}>{'★'.repeat(Math.max(0, Math.min(5, x.rating ?? 5)))}</div>
            <blockquote>{x.text}</blockquote>
            {str(x.author) && <figcaption>{x.author}</figcaption>}
          </figure>
        ))}
      </div>
    </Extra>
  );
}

export function Barbers({ site, booking }: { site: SiteContent; booking: string | null }) {
  const list = (site.barbers ?? []).filter((b) => b && str(b.name));
  if (!list.length) return null;
  return (
    <Extra id="barberos" label="06 — Los barberos" title="QUIÉN TE ATIENDE.">
      <div className="barbers reveal">
        {list.map((b, i) => {
          const agenda = str(b.bookingUrl) ?? booking;
          return (
            <article className="barber" key={i}>
              <div className="barber__mono" aria-hidden="true">{b.name!.trim().charAt(0)}</div>
              <div>
                <h3>{b.name}{b.placeholder && <span className="tag">ejemplo</span>}</h3>
                {str(b.role) && <p>{b.role}</p>}
                <p className="barber__links">
                  {agenda && <a href={agenda} target="_blank" rel="noopener">Agendar con {b.placeholder ? 'este barbero' : b.name}</a>}
                  {str(b.instagram) && <a href={b.instagram} target="_blank" rel="noopener">Instagram</a>}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </Extra>
  );
}

export function Membership({ site, booking }: { site: SiteContent; booking: string | null }) {
  const m = site.membership; const price = toCLP(m?.priceCLP);
  if (!m || !str(m.name)) return null;
  return (
    <Extra id="membresia" label="05 — Membresía" title="CLUB MENSUAL.">
      <article className="member reveal">
        <header>
          <h3>{m.name}</h3>
          {Number.isFinite(price) && <p className="member__price"><span>{clp.format(price)}</span> / {m.period || 'mes'}</p>}
        </header>
        <ul>{(m.perks ?? []).filter(str).map((p, i) => <li key={i}>{p}</li>)}</ul>
        {str(m.note) && <p className="member__note">{m.note}</p>}
        {booking && <a className="btn btn--primary" href={booking} target="_blank" rel="noopener">Quiero el club</a>}
      </article>
    </Extra>
  );
}

export function Policies({ site }: { site: SiteContent }) {
  const list = (site.policies ?? []).filter((p) => p && str(p.title) && str(p.text));
  if (!list.length) return null;
  return (
    <Extra id="politicas" label="08 — Antes de venir" title="ANTES DE VENIR.">
      <dl className="policies reveal">
        {list.map((p, i) => <div key={i}><dt>{p.title}</dt><dd>{p.text}</dd></div>)}
      </dl>
    </Extra>
  );
}
