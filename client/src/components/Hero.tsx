import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import './Hero.css';

export function Hero({ startAnim }: { startAnim: boolean }) {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.3);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <section id="home" className={`hero ${startAnim ? 'hero-intro' : ''} ${scrolled ? 'hero-scrolled' : ''}`}>
      <div className="container hero-inner">
        <div className="hero-text">
          <h1 className="hero-title">
            {t('hero.title')
              .split('\n')
              .map((line, i, arr) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </span>
              ))}
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
        </div>
        <div className="hero-portrait" aria-hidden="true">
          <img src={import.meta.env.BASE_URL + 'figma-frames/portrait.png'} alt="" />
        </div>
      </div>
    </section>
  );
}
