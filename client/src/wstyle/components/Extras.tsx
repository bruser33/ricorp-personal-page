import { toCLP } from '../lib';
import { clp } from '../links';
import { str, type SiteContent } from '../content';
import { Extra } from './Section';
import './Extras.css';

// Paneles de venta (SPEC-15 AC-08, PR #9 D1/D5). Todo sale de site.json. Barberos y reseñas solo se publican con
// enabled:true (no se muestra relleno); la carta y la membresía quedan cubiertas por la franja de demostración.

export function Reviews({ site, label }: { site: SiteContent; label: string }) {
  const r = site.reviews, items = (r?.items ?? []).filter((x) => x && str(x.text));
  if (!r?.enabled || !items.length) return null;
  return (
    <Extra id="resenas" label={label} title="LO QUE DICEN.">
      <div className="reviews reveal">
        {items.map((x, i) => (
          <figure className="review" key={i}>
            <div className="review__stars" aria-label={`${x.rating ?? 5} de 5`}>{'★'.repeat(Math.max(0, Math.min(5, x.rating ?? 5)))}</div>
            <blockquote>{x.text}</blockquote>
            {str(x.author) && <figcaption>{x.author}{str(r.source) && <span> · {r.source}</span>}</figcaption>}
          </figure>
        ))}
      </div>
    </Extra>
  );
}

export function Barbers({ site, booking, label }: { site: SiteContent; booking: string | null; label: string }) {
  const list = (site.barbers?.items ?? []).filter((b) => b && str(b.name));
  if (!site.barbers?.enabled || !list.length) return null;
  return (
    <Extra id="barberos" label={label} title="QUIÉN TE ATIENDE.">
      <div className="barbers reveal">
        {list.map((b, i) => {
          const agenda = str(b.bookingUrl) ?? booking;
          return (
            <article className="barber" key={i}>
              <div className="barber__mono" aria-hidden="true">{b.name!.trim().charAt(0)}</div>
              <div>
                <h3>{b.name}</h3>
                {str(b.role) && <p>{b.role}</p>}
                <p className="barber__links">
                  {agenda && <a href={agenda} target="_blank" rel="noopener">Agendar con {b.name}</a>}
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

// Membresía protagonista (D5): ancho completo, precio grande en Cormorant a la izquierda, beneficios a la derecha,
// filete latón superior.
export function Membership({ site, booking, label }: { site: SiteContent; booking: string | null; label: string }) {
  const m = site.membership; const price = toCLP(m?.priceCLP);
  if (!m || !str(m.name)) return null;
  return (
    <Extra id="membresia" label={label} title="CLUB MENSUAL.">
      <article className="member reveal">
        <div className="member__main">
          <h3>{m.name}</h3>
          {Number.isFinite(price) && <p className="member__price"><span>{clp.format(price)}</span> al {m.period || 'mes'}</p>}
          {str(m.note) && <p className="member__note">{m.note}</p>}
          {booking && <a className="btn btn--primary" href={booking} target="_blank" rel="noopener">Quiero el club</a>}
        </div>
        <ul>{(m.perks ?? []).filter(str).map((p, i) => <li key={i}>{p}</li>)}</ul>
      </article>
    </Extra>
  );
}

export function Policies({ site, label }: { site: SiteContent; label: string }) {
  const list = (site.policies ?? []).filter((p) => p && str(p.title) && str(p.text));
  if (!list.length) return null;
  return (
    <Extra id="politicas" label={label} title="ANTES DE VENIR.">
      <dl className="policies reveal">
        {list.map((p, i) => <div key={i}><dt>{p.title}</dt><dd>{p.text}</dd></div>)}
      </dl>
    </Extra>
  );
}

// Franja de demostración (D1): discreta, bajo el header, mientras site.json tenga demo:true.
export function DemoStrip() {
  return <p className="demo-strip" data-demo-banner="">Versión de demostración · precios y datos de ejemplo</p>;
}
