import { useEffect, useMemo, useRef, useState } from 'react';
import { headTexts, jsonLd, str, type Content } from './content';
import { bookingLink, clp, ctaLinks, fromPrice } from './links';
import { useContent } from './hooks/useContent';
import { useScrollCamera } from './hooks/useScrollCamera';
import { useReveal } from './hooks/useReveal';
import { useMotion } from './hooks/useMotion';
import { useFilmDim } from './hooks/useFilmDim';
import Nav from './components/Nav';
import ProgressDots from './components/ProgressDots';
import Section from './components/Section';
import Services from './components/Services';
import Location, { Footer } from './components/Location';
import RicorpBadge from './components/RicorpBadge';
import Loader from './components/Loader';
import Booking from './components/Booking';
import FilmFx, { Marquee } from './components/FilmFx';
import { Barbers, DemoStrip, Membership, Policies, Reviews } from './components/Extras';
import Scene3D from './scene/Scene3D';
import './wstyle.css';

export const SITE_URL = 'https://ricorp.cl/wstyle/';

// Landing de la barbería WS Style (SPEC-12/13/15), dirección "Noir de oficio": el render de Blender es la película
// (secuencia ligada al scroll, three.js de respaldo) y la web es la edición (titulares de cartel, etiquetas
// numeradas, paneles sólidos para vender). Todo el texto viene de public/wstyle/content/*.json.
// Las 7 secciones data-shot son las tomas del render; los paneles intermedios avanzan la película hacia la toma
// siguiente (la cámara interpola entre anclas de tomas, ver experience.ts).
export default function App({ initial }: { initial: Content | null }) {
  const { content, loaded } = useContent(initial);
  const seqCanvas = useRef<HTMLCanvasElement>(null);
  const main = useRef<HTMLElement>(null);
  const progressBar = useRef<HTMLSpanElement>(null);
  const { mode, progress, ready, scrolled, setRenderer3D } = useScrollCamera({ seqCanvas, main, progressBar, content, contentLoaded: loaded });
  // Loader con duración mínima de 700 ms (D2): no parpadea aunque los frames ancla lleguen al instante.
  const [minShown, setMinShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMinShown(true), 700); return () => clearTimeout(t); }, []);
  const loaderDone = ready && minShown;
  useReveal([content]);
  useMotion(loaderDone, content);
  useFilmDim([content]);

  const site = content?.site ?? {}, services = content?.services ?? [];
  const poweredBy = content?.config?.poweredBy !== false;   // la marca de agua solo se apaga con false literal
  const name = str(site.name), h = site.headlines ?? {}, copy = site.copy ?? {};
  const links = ctaLinks(site);
  const booking = bookingLink(site), from = fromPrice(services);
  const city = str(site.contact?.address?.city);
  const stat = site.stat;
  const demo = site.demo === true || String(site.demo).trim().toLowerCase() === 'true';

  // Capítulos numerados sin huecos (D4): 01… en el orden en que se publican (barberos/reseñas solo con enabled).
  const chapters = useMemo(() => {
    const site = content?.site ?? {};
    const showBarbers = !!site.barbers?.enabled && (site.barbers.items ?? []).some((b) => str(b?.name));
    const showReviews = !!site.reviews?.enabled && (site.reviews.items ?? []).some((r) => str(r?.text));
    const list: [string, string, boolean][] = [
      ['hero', 'Inicio', true], ['reyes', 'El local', true], ['linea', 'El oficio', true], ['afilado', 'El espejo', true], ['trono', 'Tu trono', true],
      ['servicios', 'La carta', true], ['membresia', 'Membresía', !!str(site.membership?.name)], ['barberos', 'Los barberos', showBarbers],
      ['resenas', 'Lo que dicen', showReviews], ['politicas', 'Antes de venir', (site.policies ?? []).some((p) => str(p?.title))], ['llega', 'Llega', true],
    ];
    let n = 0;
    return list.filter(([, , on]) => on).map(([id, label]) => ({ id, label, num: id === 'hero' ? '' : `${String(++n).padStart(2, '0')} — ${label}` }));
  }, [content]);
  const lab = (id: string) => chapters.find((c) => c.id === id)?.num ?? '';

  // <title>, description y og:title siguen al nombre del JSON (el HTML prerenderizado ya los trae).
  useEffect(() => {
    const s = content?.site ?? {};
    if (!str(s.name)) return;
    const t = headTexts(s);
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.ogTitle);
  }, [content]);

  const ld = JSON.stringify(jsonLd(site, SITE_URL)).replace(/</g, '\\u003c');
  return (
    <>
      <canvas id="seq" ref={seqCanvas} aria-hidden="true" hidden={mode !== 'seq'} />
      <Scene3D active={mode === '3d'} onRenderer={setRenderer3D} />
      <FilmFx />
      <Loader name={name} progress={progress} done={loaderDone} poweredBy={poweredBy} />
      <div className="shade" aria-hidden="true"></div>
      <div className="progress" aria-hidden="true"><span className="progress__bar" ref={progressBar}></span></div>
      <Nav name={name} booking={booking} scrolled={scrolled} />
      {demo && <DemoStrip />}
      <ProgressDots chapters={chapters} />
      <main ref={main} className={demo ? 'is-demo' : undefined}>
        <Section id="hero" className="panel--hero" label={city ? `Barbería · ${city}` : 'Barbería'} headline={h.hero} copy={str(site.slogan)}>
          {str(site.concept) && <p className="concept reveal">{site.concept}</p>}
          <div className="hero__cta reveal">
            {from && <p className="hero__from" data-from-price="">{from.label} desde <strong>{clp.format(from.price)}</strong></p>}
            {booking && <a className="btn btn--primary" data-cta="hero-booking" href={booking} target={booking.startsWith('tel:') ? undefined : '_blank'} rel="noopener">Reservar</a>}
          </div>
          <p className="hint reveal" aria-hidden="true">Desliza para recorrer el local</p>
        </Section>
        <Section id="reyes" label={lab('reyes')} headline={h.reyes} copy={copy.reyes}>
          {stat && str(stat.value) && <p className="stat reveal"><span className="stat__value">{stat.value}</span> <span className="stat__label">{stat.label}</span> {str(stat.note) && <em>{stat.note}</em>}</p>}
        </Section>
        <Section id="linea" label={lab('linea')} headline={h.linea} copy={copy.linea} />
        <Section id="afilado" label={lab('afilado')} headline={h.afilado} copy={copy.afilado} />
        <Section id="trono" label={lab('trono')} headline={h.trono} copy={copy.trono}>
          <div className="ctas reveal">
            {links.whatsapp && <a className="btn btn--primary" data-cta="whatsapp" href={links.whatsapp} target="_blank" rel="noopener">Reservar por WhatsApp</a>}
            {links.tel && <a className="btn btn--ghost" data-cta="tel" href={links.tel}>Llamar</a>}
          </div>
        </Section>
        <Marquee words={(site.marquee ?? []).filter((w): w is string => !!str(w))} />
        <Section id="servicios" className="panel--wide" label={lab('servicios')} headline={h.servicios} copy={copy.servicios}>
          <Services services={services} />
        </Section>
        <Membership site={site} booking={booking} label={lab('membresia')} />
        <Barbers site={site} booking={booking} label={lab('barberos')} />
        <Reviews site={site} label={lab('resenas')} />
        <Policies site={site} label={lab('politicas')} />
        <Section id="llega" className="panel--last" label={lab('llega')} headline={h.llega} copy={copy.llega}
          after={<Footer name={name} poweredBy={poweredBy} />}>
          <Location site={site} links={links} />
        </Section>
      </main>
      <Booking booking={booking} whatsapp={links.whatsapp} />
      {poweredBy && <RicorpBadge />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
