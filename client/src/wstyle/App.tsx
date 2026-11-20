import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildChapters, headTexts, jsonLd, str, type Content } from './content';
import { bookingLabel, bookingLink, clp, ctaLinks, ext, fromPrice, isDemo, isWhatsAppUrl } from './links';
import { useContent } from './hooks/useContent';
import { useScrollCamera } from './hooks/useScrollCamera';
import { useReveal } from './hooks/useReveal';
import { useMotion } from './hooks/useMotion';
import { useFilmDim } from './hooks/useFilmDim';
import { useReviews } from './hooks/useReviews';
import { hasVisibleReviews } from './reviews';
import Nav from './components/Nav';
import ProgressDots from './components/ProgressDots';
import Section from './components/Section';
import Services from './components/Services';
import Location, { Footer } from './components/Location';
import RicorpBadge from './components/RicorpBadge';
import Loader from './components/Loader';
import Booking from './components/Booking';
import Stat from './components/Stat';
import Icon from './components/Icons';
import FilmFx, { Marquee } from './components/FilmFx';
import HeroFire from './components/HeroFire';
import HeroNav from './components/HeroNav';
import { heroItems, nextIndex, normalizeSlides, prevIndex, resolveIndex, PORTRAIT_ID } from './heroSlides';
import Embers from './components/Embers';
import { Barbers, DemoStrip, Membership, Policies, Reviews } from './components/Extras';
import PointsTeaser from './components/PointsTeaser';
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
  // SPEC-52: las reseñas llegan de la API después de montar; su capítulo se suma (o no) sin dejar huecos.
  const reviews = useReviews();
  const hasReviews = hasVisibleReviews(reviews.data);
  const layoutKey = useMemo(() => ({ content, hasReviews }), [content, hasReviews]);
  useReveal([layoutKey]);
  useMotion(loaderDone, layoutKey);
  useFilmDim([layoutKey]);
  // SPEC-27: con la URL cargada con #ancla el navegador salta antes de tener el contenido final (sin prerender, o con
  // alturas que cambian al leer los JSON): al salir el loader se vuelve a anclar (respeta el scroll-margin-top).
  useEffect(() => {
    if (!loaderDone || location.hash.length < 2) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [loaderDone]);

  const site = content?.site ?? {}, services = content?.services ?? [];
  const poweredBy = content?.config?.poweredBy !== false;   // la marca de agua solo se apaga con false literal
  const name = str(site.name), h = site.headlines ?? {}, copy = site.copy ?? {};
  const links = ctaLinks(site);
  const booking = bookingLink(site), bookLabel = bookingLabel(site), from = fromPrice(services);
  const city = str(site.contact?.address?.city);
  const demo = isDemo(site);

  // SPEC-61: pantallas del inicio (barbero + tomas de site.json → hero.slides). Las que fallan al cargar se saltan;
  // si falla la que se está mostrando, se vuelve al barbero (nunca en blanco: el barbero siempre está).
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [slideId, setSlideId] = useState(PORTRAIT_ID);
  const [armed, setArmed] = useState(false);
  const slides = useMemo(() => normalizeSlides(content?.site ?? {}).filter((s) => !broken.has(s.id)), [content, broken]);
  const items = useMemo(() => heroItems(slides), [slides]);
  const slideIdx = resolveIndex(items, slideId);
  const go = (i: number) => { setArmed(true); setSlideId(items[i].id); };
  const arm = useCallback(() => setArmed(true), []);
  const onBroken = useCallback((id: string) => setBroken((b) => new Set(b).add(id)), []);

  // Capítulos numerados sin huecos (D4): 01… en el orden en que se publican (content.ts → buildChapters).
  const chapters = useMemo(() => buildChapters(content?.site ?? {}, hasReviews), [content, hasReviews]);
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
      {/* SPEC-49: fuego + retrato sobre la película y bajo el grano/viñeta; las brasas sobre el sombreado y bajo el texto. */}
      <HeroFire name={name ?? ''} slides={slides} active={items[slideIdx].id} armed={armed} onBroken={onBroken} />
      <FilmFx />
      <Loader name={name} progress={progress} done={loaderDone} poweredBy={poweredBy} />
      <div className={`shade${scrolled ? '' : ' is-top'}`} aria-hidden="true"></div>
      <Embers />
      <div className="progress" aria-hidden="true"><span className="progress__bar" ref={progressBar}></span></div>
      <Nav name={name} booking={booking} scrolled={scrolled} />
      {demo && <DemoStrip />}
      <ProgressDots chapters={chapters} />
      <main ref={main} className={demo ? 'is-demo' : undefined}>
        <Section id="hero" className="panel--hero" label={city ? `Barbería · ${city}` : 'Barbería'} headline={h.hero} copy={str(site.slogan)}>
          {str(site.concept) && <p className="concept reveal">{site.concept}</p>}
          <div className="hero__cta reveal" data-own-cta="">
            {from && <p className="hero__from" data-from-price="">{from.label} desde <strong>{clp.format(from.price)}</strong></p>}
            {booking && <a className="btn btn--primary" data-cta="hero-booking" href={booking} {...ext(booking)}>Reservar</a>}
          </div>
          <HeroNav index={slideIdx} count={items.length} caption={items[slideIdx].caption}
            onPrev={() => go(prevIndex(slideIdx, items.length))} onNext={() => go(nextIndex(slideIdx, items.length))} onArm={arm} />
          {/* SPEC-28: en compacto el hint va centrado al pie con una flecha que late; se desvanece al empezar a scrollear. */}
          <p className={`hint reveal${scrolled ? ' is-gone' : ''}`} aria-hidden="true">Desliza para recorrer el local<span className="hint__arrow"></span></p>
        </Section>
        <Section id="reyes" className="panel--copy" label={lab('reyes')} headline={h.reyes} copy={copy.reyes}>
          <Stat stat={site.stat} />
        </Section>
        <Section id="linea" className="panel--copy" label={lab('linea')} headline={h.linea} copy={copy.linea} />
        <Section id="afilado" className="panel--copy" label={lab('afilado')} headline={h.afilado} copy={copy.afilado} />
        <Section id="trono" className="panel--copy" label={lab('trono')} headline={h.trono} copy={copy.trono}>
          {/* SPEC-26: el primario reserva (bookingLink); WhatsApp y Llamar quedan como secundarios. El ghost de WhatsApp
              solo se omite si el primario ya es ese mismo wa.me (en demo ambos van al contacto y se muestran). */}
          <div className="ctas reveal" data-own-cta="">
            {booking && <a className="btn btn--primary" data-cta="booking" href={booking} {...ext(booking)}>{bookLabel}</a>}
            {links.whatsapp && !(booking === links.whatsapp && isWhatsAppUrl(booking)) && <a className="btn btn--ghost" data-cta="whatsapp" href={links.whatsapp} target="_blank" rel="noopener"><Icon name="whatsapp" />WhatsApp</a>}
            {links.tel && <a className="btn btn--ghost" data-cta="tel" href={links.tel} {...ext(links.tel)}><Icon name="phone" />Llamar</a>}
          </div>
        </Section>
        <Marquee words={(site.marquee ?? []).filter((w): w is string => !!str(w))} />
        <Section id="servicios" className="panel--wide" label={lab('servicios')} headline={h.servicios} copy={copy.servicios}>
          <Services services={services} categories={content?.categories} />
        </Section>
        <Membership site={site} booking={booking} label={lab('membresia')} />
        <Barbers site={site} booking={booking} label={lab('barberos')} />
        <Reviews data={hasReviews ? reviews.data : null} label={lab('resenas')} onMore={reviews.more} loadingMore={reviews.loadingMore} />
        {/* SPEC-57: "Junta puntos con cada corte" dentro de Antes de venir (asunción 11); solo con el programa activo. */}
        <Policies site={site} label={lab('politicas')} giftCards={content?.giftCardsOnline === true} extra={<PointsTeaser />} />
        <Section id="llega" className="panel--last" label={lab('llega')} headline={h.llega} copy={copy.llega}
          after={<Footer name={name} poweredBy={poweredBy} />}>
          <Location site={site} links={links} />
        </Section>
      </main>
      <Booking booking={booking} watch={chapters} />
      {poweredBy && <RicorpBadge watch={chapters} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
