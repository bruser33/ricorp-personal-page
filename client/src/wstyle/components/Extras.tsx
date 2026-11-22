import { toCLP } from '../lib';
import { clp, ctaLinks, ext } from '../links';
import { str, type SiteContent } from '../content';
import { Extra } from './Section';
import { countLabel, formatAverage, hasVisibleReviews, reviewDate, roundHalf, starsLabel, type ReviewsPage } from '../reviews';
import './Extras.css';

// Paneles de venta (SPEC-15 AC-08, PR #9 D1/D5). Salen de site.json; los barberos solo se publican con enabled:true
// (no se muestra relleno). Las reseñas salen de la BD (SPEC-52); la carta y la membresía quedan cubiertas por la franja
// de demostración.

// Cinco estrellas latón (únicas del acento). `value` puede ser medio punto (promedio); el texto lo lee el lector de
// pantalla, las estrellas son decorativas.
export function Stars({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  return (
    <span className={`stars ${className}`.trim()} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={value >= i ? 'stars__s is-on' : value >= i - .5 ? 'stars__s is-half' : 'stars__s'}>★</span>)}
    </span>
  );
}

// "Lo que dicen" (SPEC-52): promedio, cantidad y las reseñas visibles más recientes (6 + "Ver más"). Sin reseñas no se
// renderiza nada (RN-11). El comentario es SIEMPRE texto (nunca HTML); las URL se ven como texto, sin enlace.
export function Reviews({ data, label, onMore, loadingMore = false }: { data: ReviewsPage | null; label: string; onMore?: () => void; loadingMore?: boolean }) {
  if (!hasVisibleReviews(data)) return null;
  const { average, count } = data.summary;
  return (
    <Extra id="resenas" label={label} title="LO QUE DICEN." className="panel--reviews">
      <div className="reviews-summary reveal" data-reviews-summary="">
        <p className="reviews-summary__avg">{formatAverage(average)}</p>
        <div>
          <Stars value={roundHalf(average)} label={`Promedio: ${starsLabel(Number(formatAverage(average).replace(',', '.')))}`} className="stars--lg" />
          <p className="reviews-summary__count">{countLabel(count)}</p>
        </div>
      </div>
      <div className="reviews reveal" data-list="reviews">
        {data.items.map((x) => (
          <figure className="review" key={x.id}>
            <Stars value={x.rating} label={starsLabel(x.rating)} className="review__stars" />
            <blockquote>“{x.comment}”</blockquote>
            <figcaption>{[x.author, x.service, reviewDate(x.createdAt)].filter(Boolean).join(' · ')}</figcaption>
          </figure>
        ))}
      </div>
      {data.hasMore && onMore && (
        <div className="reviews-more">
          <button type="button" className="btn btn--ghost" data-cta="more-reviews" onClick={onMore} disabled={loadingMore} aria-busy={loadingMore || undefined}>
            {loadingMore ? 'Cargando…' : 'Ver más reseñas'}
          </button>
        </div>
      )}
    </Extra>
  );
}

export function Barbers({ site, booking, label }: { site: SiteContent; booking: string | null; label: string }) {
  const list = (site.barbers?.items ?? []).filter((b) => b && str(b.name));
  if (!site.barbers?.enabled || !list.length) return null;
  return (
    <Extra id="barberos" label={label} title="QUIÉN TE ATIENDE.">
      <div className="barbers reveal" data-own-cta="">
        {list.map((b, i) => {
          const agenda = str(b.bookingUrl) ?? booking;
          return (
            <article className="barber" key={i}>
              <div className="barber__mono" aria-hidden="true">{b.name!.trim().charAt(0)}</div>
              <div>
                <h3>{b.name}</h3>
                {str(b.role) && <p>{b.role}</p>}
                <p className="barber__links">
                  {agenda && <a href={agenda} {...ext(agenda)}>Agendar con {b.name}</a>}
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

// Membresía como carnet (SPEC-29 c): tarjeta sólida graphite con borde cobre; encabezado "Club" + nombre, precio
// grande, beneficios en lista y nota + CTA al pie, todo dentro de la tarjeta. Lo que falte en el JSON no deja cajas
// vacías.
export function Membership({ site, booking, label }: { site: SiteContent; booking: string | null; label: string }) {
  if (site.plans?.length) {
    const whatsapp = ctaLinks(site).whatsapp;
    return (
      <Extra id="membresia" label={label} title="PLANES WS STYLE." className="panel--plans">
        <p>Elige tu plan personal · Pago anticipado · 30 días de vigencia</p>
        <div className="plans-grid">
          {site.plans.map(plan => {
            const url = whatsapp ? new URL(whatsapp) : null;
            url?.searchParams.set('text', `Hola, quiero contratar el plan ${plan.name} de WS Style.`);
            return <article className={`ws-plan ws-plan--${plan.id}`} key={plan.id}>
              <p>{plan.subtitle}{plan.id === 'medium' && ' · Recomendado'}</p>
              <h3>{plan.name}</h3>
              <strong>{clp.format(plan.price)}</strong>
              <ul>{plan.perks.map(perk => <li key={perk}>{perk}</li>)}</ul>
              {url && <a className="btn btn--primary" data-own-cta="" href={url.href} {...ext(url.href)}>Quiero {plan.name}</a>}
            </article>;
          })}
        </div>
      </Extra>
    );
  }
  const m = site.membership; const price = toCLP(m?.priceCLP);
  if (!m || !str(m.name)) return null;
  const perks = (m.perks ?? []).filter((p): p is string => !!str(p));
  const note = str(m.note), hasPrice = Number.isFinite(price);
  return (
    <Extra id="membresia" label={label} title="CLUB MENSUAL.">
      <article className={`member reveal${perks.length ? '' : ' member--solo'}`}>
        <header className="member__head">
          <p className="member__kicker">Club</p>
          <h3 className="member__club">{m.name}</h3>
        </header>
        {hasPrice && <p className="member__price"><span>{clp.format(price)}</span> al {m.period || 'mes'}</p>}
        {perks.length > 0 && <ul className="member__perks">{perks.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        {(note || booking) && (
          <footer className="member__foot">
            {note && <p className="member__note">{note}</p>}
            {booking && <a className="btn btn--primary" data-cta="booking" data-own-cta="" href={booking} {...ext(booking)}>Quiero el club</a>}
          </footer>
        )}
      </article>
    </Extra>
  );
}

export function Policies({ site, label, giftCards = false }: { site: SiteContent; label: string; giftCards?: boolean }) {
  const list = (site.policies ?? []).filter((p) => p && str(p.title) && str(p.text));
  if (!list.length) return null;
  return (
    <Extra id="politicas" label={label} title="ANTES DE VENIR.">
      <dl className="policies reveal">
        {list.map((p, i) => <div key={i}><dt>{p.title}</dt><dd>{p.text}</dd></div>)}
      </dl>
      {/* SPEC-60: enlace discreto, solo si la venta de gift cards en línea está activa (AC-10). */}
      {giftCards && <p className="policies__gift reveal"><a href="/wstyle/regalar/" data-gift-link="">Regala WS Style · gift cards</a></p>}
    </Extra>
  );
}

// Franja de demostración (D1): discreta, bajo el header, mientras site.json tenga demo:true. En compacto va el texto
// corto, en una sola línea.
export function DemoStrip() {
  return (
    <p className="demo-strip" data-demo-banner="">
      <span className="demo-strip__long">Versión de demostración · precios y datos de ejemplo</span>
      <span className="demo-strip__short">Demo · datos de ejemplo</span>
    </p>
  );
}
