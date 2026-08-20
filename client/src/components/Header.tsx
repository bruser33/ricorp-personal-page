import { useState, useEffect } from 'react';
import { useLang } from '../i18n';
import { SPLASH_OUTRO_MS } from './Splash';
import './Header.css';

const BASE = import.meta.env.BASE_URL;

/* `introDone` = el logo del splash ya aterrizó en el header. En mobile ese es el
   momento en que el wordmark RICORP se retira y queda solo el botón de menú
   (requerimiento 1); el fade sale con un delay para que ocurra DESPUÉS de que el
   splash se desmonta (ver SPLASH_TOTAL_MS en Splash.tsx), no encima. */
export function Header({ introDone = false }: { introDone?: boolean }) {
  const [open, setOpen] = useState(false);
  const { lang, toggle, t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // El panel se anuncia como dialog modal, así que Escape tiene que cerrarlo —
  // igual que el toque fuera del panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <header
        className={`site-header${scrolled ? ' scrolled' : ''}${introDone ? ' intro-done' : ''}`}
        /* El retiro del wordmark arranca cuando el logo del splash ya se
           desmontó, no antes: el margen sale de la constante de Splash, no de un
           número copiado en el CSS. */
        style={{ ['--brand-exit-delay' as string]: `${SPLASH_OUTRO_MS + 100}ms` }}
      >
        <div className="container header-inner">
          <button className="lang" onClick={toggle}>
            {lang}
          </button>
          <a href="#home" className="brand" aria-label="RICORP">
            <img src={BASE + 'ricorp-logo.svg'} alt="RICORP" className="brand-logo" />
          </a>
          <nav className="nav-desktop">
            <a href="#contact">{t('nav.contact')}</a>
            <a href="#news">{t('nav.news')}</a>
            <a href="#about">{t('nav.about')}</a>
          </nav>
          <button
            className="hamburger"
            aria-label={t('nav.menu')}
            onClick={() => setOpen(true)}
          >
            <span className="hamburger-r">R</span>
            <span className="hamburger-label">
              {t('nav.menu').slice(0, 2)}
              <br />
              {t('nav.menu').slice(2)}
            </span>
          </button>
        </div>
      </header>

      {open && (
        /* El menú es un PANEL centrado, no una capa a pantalla completa
           (requerimiento 8): el wrapper solo posiciona y cierra al tocar fuera;
           todo lo visible vive en .mobile-overlay-panel, que es opaco
           (requerimiento 7). */
        <div className="mobile-overlay" onClick={() => setOpen(false)}>
          <div
            className="mobile-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="overlay-close"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <nav className="overlay-nav" onClick={() => setOpen(false)}>
              <a href="#home">{t('nav.home')}</a>
              <a href="#contact">{t('nav.contact')}</a>
              <a href="#news">{t('nav.news')}</a>
              <a href="#about">{t('nav.about')}</a>
            </nav>
            <button className="overlay-lang" onClick={toggle}>
              {t('lang.switch')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
