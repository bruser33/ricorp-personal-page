import './Hero.css';

export function Hero({ startAnim }: { startAnim: boolean }) {
  return (
    <section id="home" className={`hero ${startAnim ? 'hero-intro' : ''}`}>
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
