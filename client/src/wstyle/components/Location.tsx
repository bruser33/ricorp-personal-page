import { hoursText, str, validHours, type SiteContent } from '../content';
import { ext } from '../links';
import Icon from './Icons';
import './Location.css';

interface Props { site: SiteContent; links: { whatsapp: string | null; tel: string | null; maps: string | null } }

// CTA (primero: la acción antes que el dato), horario, dirección y teléfono de la sección "Llega".
// Lo que falta en el JSON no se muestra.
export default function Location({ site, links }: Props) {
  const c = site.contact ?? {}, ad = c.address ?? {};
  const rows = validHours(site);
  const line2 = [str(ad.city), str(ad.region)].filter(Boolean).join(', ');
  const addr = [str(ad.street), line2].filter(Boolean) as string[];
  const phone = str(c.phone);
  return (
    <>
      <div className="ctas reveal" data-own-cta="">
        {links.maps && <a className="btn btn--primary" data-cta="maps" href={links.maps} target="_blank" rel="noopener"><Icon name="pin" />Cómo llegar</a>}
        {links.whatsapp && <a className="btn btn--ghost" data-cta="whatsapp" href={links.whatsapp} target="_blank" rel="noopener"><Icon name="whatsapp" />WhatsApp</a>}
        {links.tel && <a className="btn btn--ghost" data-cta="tel" href={links.tel} {...ext(links.tel)}><Icon name="phone" />Llamar</a>}
      </div>
      <div className="info reveal">
        {rows.length > 0 && (
          <div>
            <h3>Horario</h3>
            <ul className="hours" data-field="hours">
              {rows.map((h, i) => <li key={i}><span>{h.days}</span><span>{hoursText(h)}</span></li>)}
            </ul>
          </div>
        )}
        {(addr.length > 0 || phone) && (
          <div>
            <h3>Dirección</h3>
            {addr.length > 0 && <address data-field="address">{addr.map((t, i) => <span key={i}>{i > 0 && <br />}{t}</span>)}</address>}
            {phone && <p className="phone" data-field-line="">Teléfono: <span data-field="phone">{phone}</span></p>}
          </div>
        )}
      </div>
    </>
  );
}

// Footer de la última sección: nombre + firma Ricorp (si la marca de agua está activa en config.json).
export function Footer({ name, poweredBy }: { name: string | null; poweredBy: boolean }) {
  return (
    <footer className="footer">
      {name && <span>© <span data-field="name">{name}</span></span>}
      {/* SPEC-25: el mismo logo SVG del badge (en "Llega" este es el único crédito Ricorp en pantalla). */}
      {poweredBy && <span data-powered="">Sitio desarrollado por <a className="footer__ricorp" href="https://ricorp.cl" target="_blank" rel="noopener" aria-label="Ricorp (ricorp.cl)"><img src="/wstyle/brand/ricorp-logo.svg" alt="RICORP" width={105} height={24} /></a></span>}
    </footer>
  );
}
