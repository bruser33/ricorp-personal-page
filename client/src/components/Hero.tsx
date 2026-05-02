import { useEffect, useState } from 'react';
import './Hero.css';

export function Hero() {
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIntro(true), 100);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <section id="home" className={`hero ${intro ? 'hero-intro' : ''}`}>
      <div className="container hero-inner">
        <div className="hero-text">
          <h1 className="hero-title">
            Keep it<br />simple.
          </h1>
          <p className="hero-sub">
            <span className="grad-blue">Software {'{development}'}</span>
            <br />
            <span className="hero-sub-dim">and innovation.</span>
          </p>
        </div>
        <div className="hero-portrait" aria-hidden="true">
          <img src={import.meta.env.BASE_URL + 'figma-frames/portrait.png'} alt="" />
        </div>
      </div>
    </section>
  );
}
