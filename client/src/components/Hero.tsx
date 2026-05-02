import './Hero.css';

export function Hero() {
  return (
    <section id="home" className="hero">
      <div className="container hero-inner">
        <div className="hero-text">
          <h1 className="hero-title">
            Keep it<br />simple.
          </h1>
          <p className="hero-sub">
            <span className="grad-blue">Software {'{development}'}</span>
            <br />
            <span className="grad-purple">and innovation.</span>
          </p>
        </div>
        <div className="hero-portrait" aria-hidden="true">
          <img src={import.meta.env.BASE_URL + 'figma-frames/ricorp-animation-frame-01.png'} alt="" />
        </div>
      </div>
    </section>
  );
}
