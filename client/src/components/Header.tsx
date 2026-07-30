import { useState, useEffect } from 'react';
import { useLang } from '../i18n';
import { useView } from '../view';
import type { View } from '../view';
import './Header.css';

const BASE = import.meta.env.BASE_URL;

export function Header() {
  const [open, setOpen] = useState(false);
  const { lang, toggle, t } = useLang();
  const { view, navigate } = useView();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // "Proyectos TI" lives inside the home reel → go home and land on the carousel.
  const go = (e: React.MouseEvent, target: View, scrollTo?: string) => {
    e.preventDefault();
    navigate(target, scrollTo ? { scrollTo } : undefined);
    setOpen(false);
  };

  return (
    <>
      <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <button className="lang" onClick={toggle}>
            {lang}
          </button>
          <a
            href="#/"
            className="brand"
            aria-label="RICORP"
            onClick={(e) => go(e, 'home')}
          >
            <img src={BASE + 'ricorp-logo.svg'} alt="RICORP" className="brand-logo" />
          </a>
          <nav className="nav-desktop">
            <a
              href="#/"
              className={view === 'home' ? 'is-current' : undefined}
              onClick={(e) => go(e, 'home', 'about')}
            >
              {t('nav.projects')}
            </a>
            <a
              href="#/timeline"
              className={view === 'timeline' ? 'is-current' : undefined}
              onClick={(e) => go(e, 'timeline')}
            >
              {t('nav.timeline')}
            </a>
            <a
              href="#/contact"
              className={view === 'contact' ? 'is-current' : undefined}
              onClick={(e) => go(e, 'contact')}
            >
              {t('nav.contact')}
            </a>
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
        <div className="mobile-overlay" role="dialog" aria-modal="true">
          <button
            className="overlay-close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <nav className="overlay-nav">
            <a href="#/" onClick={(e) => go(e, 'home')}>
              {t('nav.home')}
            </a>
            <a href="#/" onClick={(e) => go(e, 'home', 'about')}>
              {t('nav.projects')}
            </a>
            <a href="#/timeline" onClick={(e) => go(e, 'timeline')}>
              {t('nav.timeline')}
            </a>
            <a href="#/contact" onClick={(e) => go(e, 'contact')}>
              {t('nav.contact')}
            </a>
          </nav>
          <button className="overlay-lang" onClick={toggle}>
            {t('lang.switch')}
          </button>
        </div>
      )}
    </>
  );
}
