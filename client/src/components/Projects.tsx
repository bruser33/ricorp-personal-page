import './Projects.css';

const projects = [
  {
    name: 'Haru',
    type: 'App development',
    img: import.meta.env.BASE_URL + 'figma-frames/ricorp-d-frame-02.png',
    desc:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
  },
];

export function Projects() {
  return (
    <section id="about" className="projects">
      <div className="container">
        <div className="project-list">
          {projects.map((p) => (
            <article key={p.name} className="project-item" aria-label={`${p.name} — ${p.type}`}>
              <div className="project-media">
                <img src={p.img} alt={`${p.name} — ${p.type}`} />
              </div>
              <div className="project-card">
                <p className="project-desc">{p.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
