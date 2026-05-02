import './Projects.css';

const projects = [
  {
    name: 'Haru',
    type: 'App development',
    img: '/figma-frames/ricorp-d-frame-02.png',
    desc:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere.',
  },
  {
    name: 'Aurora',
    type: 'Web platform',
    img: '/figma-frames/ricorp-d-frame-08.png',
    desc:
      'Plataforma web a medida con foco en performance, SEO técnico y diseño centrado en la conversión.',
  },
];

export function Projects() {
  return (
    <section id="about" className="projects">
      <div className="container">
        <h2 className="section-title">Projects</h2>
        <div className="project-list">
          {projects.map((p) => (
            <article key={p.name} className="project-card">
              <div className="project-media">
                <img src={p.img} alt={p.name} />
                <div className="project-overtitle">
                  <h3>{p.name}</h3>
                  <span>{p.type}</span>
                </div>
              </div>
              <p className="project-desc">{p.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
