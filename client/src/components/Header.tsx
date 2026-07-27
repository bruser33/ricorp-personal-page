import { useState, useEffect } from 'react';
import { useLang } from '../i18n';
import './Header.css';

export function Header() {
  const [open, setOpen] = useState(false);
  const { lang, toggle, t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <button className="lang" onClick={toggle}>
            {lang}
          </button>
          <a href="#home" className="brand">
            <span className="brand-r">R</span>ICORP
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
        <div className="mobile-overlay" role="dialog" aria-modal="true">
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
      )}
    </>
  );
}
