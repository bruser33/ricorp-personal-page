import { useState } from 'react';
import './Header.css';

export function Header() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<'eng' | 'esp'>('eng');

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <button
            className="lang"
            onClick={() => setLang(lang === 'eng' ? 'esp' : 'eng')}
          >
            {lang === 'eng' ? 'esp' : 'eng'}
          </button>
          <a href="#home" className="brand">RICORP</a>
          <nav className="nav-desktop">
            <a href="#about">About</a>
            <a href="#news">NEWS</a>
            <a href="#contact">CONTACT</a>
          </nav>
          <button
            className="hamburger"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <span className="hamburger-r">R</span>
            <span className="hamburger-label">ME<br />NU</span>
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
            <a href="#home">Home</a>
            <a href="#contact">Contact</a>
            <a href="#news">News</a>
            <a href="#about">About</a>
          </nav>
          <button
            className="overlay-lang"
            onClick={() => setLang(lang === 'eng' ? 'esp' : 'eng')}
          >
            {lang === 'eng' ? 'español' : 'english'}
          </button>
        </div>
      )}
    </>
  );
}
