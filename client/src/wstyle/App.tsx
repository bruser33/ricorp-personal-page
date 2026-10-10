import { useEffect, useRef } from 'react';
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
import { Barbers, Membership, Policies, Reviews } from './components/Extras';
import Scene3D from './scene/Scene3D';
import './wstyle.css';

export const SITE_URL = 'https://ricorp.cl/wstyle/';

// Landing de la barbería W Style (SPEC-12/13/15), dirección "Noir de oficio": el render de Blender es la película
// (secuencia ligada al scroll, three.js de respaldo) y la web es la edición (titulares de cartel, etiquetas
// numeradas, paneles sólidos para vender). Todo el texto viene de public/wstyle/content/*.json.
// Las 7 secciones data-shot son las tomas del render; los paneles intermedios avanzan la película hacia la toma
// siguiente (la cámara interpola entre anclas de tomas, ver experience.ts).
export default function App({ initial }: { initial: Content | null }) {
  const { content, loaded } = useContent(initial);
  const seqCanvas = useRef<HTMLCanvasElement>(null);
  const main = useRef<HTMLElement>(null);
  const progressBar = useRef<HTMLSpanElement>(null);
  const { mode, progress, ready, active, scrolled, setRenderer3D } = useScrollCamera({ seqCanvas, main, progressBar, content, contentLoaded: loaded });
  useReveal([content]);
  useMotion(ready);
  useFilmDim([content]);

  const site = content?.site ?? {}, services = content?.services ?? [];
  const poweredBy = content?.config?.poweredBy !== false;   // la marca de agua solo se apaga con false literal
  const name = str(site.name), h = site.headlines ?? {}, copy = site.copy ?? {};
  const links = ctaLinks(site);
  const booking = bookingLink(site), from = fromPrice(services);
  const city = str(site.contact?.address?.city);
  const stat = site.stat;

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
      <Loader name={name} progress={progress} done={ready} />
      <div className="shade" aria-hidden="true"></div>
      <div className="progress" aria-hidden="true"><span className="progress__bar" ref={progressBar}></span></div>
      <Nav name={name} whatsapp={booking} scrolled={scrolled} />
      <ProgressDots active={active} />
      <main ref={main}>
        <Section id="hero" className="panel--hero" label={city ? `Barbería · ${city}` : 'Barbería'} headline={h.hero} copy={str(site.slogan)}>
          {str(site.concept) && <p className="concept reveal">{site.concept}</p>}
          <div className="hero__cta reveal">
            {from && <p className="hero__from" data-from-price="">{from.label} desde <strong>{clp.format(from.price)}</strong></p>}
            {booking && <a className="btn btn--primary" data-cta="hero-booking" href={booking} target="_blank" rel="noopener">Reservar</a>}
          </div>
          <p className="hint reveal" aria-hidden="true">Desliza para recorrer el local</p>
        </Section>
        <Section id="reyes" label="01 — El local" headline={h.reyes} copy={copy.reyes}>
          {stat && str(stat.value) && <p className="stat reveal"><span className="stat__value">{stat.value}</span> <span className="stat__label">{stat.label}</span> {str(stat.note) && <em>{stat.note}</em>}</p>}
        </Section>
        <Section id="linea" label="02 — El oficio" headline={h.linea} copy={copy.linea} />
        <Section id="afilado" label="03 — El espejo" headline={h.afilado} copy={copy.afilado} />
        <Section id="trono" label="04 — Tu trono" headline={h.trono} copy={copy.trono}>
          <div className="ctas reveal">
            {links.whatsapp && <a className="btn btn--primary" data-cta="whatsapp" href={links.whatsapp} target="_blank" rel="noopener">Reservar por WhatsApp</a>}
            {links.tel && <a className="btn btn--ghost" data-cta="tel" href={links.tel}>Llamar</a>}
          </div>
        </Section>
        <Marquee words={(site.marquee ?? []).filter((w): w is string => !!str(w))} />
        <Section id="servicios" className="panel--wide" label="05 — La carta" headline={h.servicios} copy={copy.servicios}>
          <Services services={services} />
        </Section>
        <Membership site={site} booking={booking} />
        <Barbers site={site} booking={booking} />
        <Reviews site={site} />
        <Policies site={site} />
        <Section id="llega" className="panel--last" label="09 — Llega" headline={h.llega} copy={copy.llega}
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
