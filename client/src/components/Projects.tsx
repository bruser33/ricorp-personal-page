import { useState, useEffect, useCallback, useRef } from 'react';
import './Projects.css';

type Project = {
  id: number;
  title: string;
  tag: string;
  image: string;
  description: string;
};

const BASE = import.meta.env.BASE_URL;

const projects: Project[] = [
  {
    id: 1,
    title: 'Haru',
    tag: 'App development',
    image: BASE + 'figma-frames/image-7.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
  },
  {
    id: 2,
    title: 'Project 2',
    tag: 'Brand identity',
    image: BASE + 'figma-frames/image-1.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Vestibulum feugiat massa nibh justo proin dignissim purus tristique nisl. Faucibus ipsum mauris sed augue dui. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
  },
  {
    id: 3,
    title: 'Project 3',
    tag: 'Web design',
    image: BASE + 'figma-frames/image-4.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quis sed ultrices sed ornare iaculis viverra nec vivamus. Eu ullamcorper sed in dictumst mauris nunc a posuere.',
  },
  {
    id: 4,
    title: 'Project 4',
    tag: 'Illustration',
    image: BASE + 'figma-frames/image-5.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Pulvinar congue sed eu blandit fusce. Lorem vivamus elementum vitae faucibus malesuada dictum diam.',
  },
  {
    id: 5,
    title: 'Project 5',
    tag: 'Product design',
    image: BASE + 'figma-frames/image-6.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Quam faucibus sem sed odio augue lectus cursus ultricies morbi. Eu elit cursus orci justo accumsan sit.',
  },
  {
    id: 6,
    title: 'Project 6',
    tag: 'Editorial',
    image: BASE + 'figma-frames/news-1.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Felis leo eleifend elit urna habitasse integer. Ornare donec vivamus eget facilisi interdum.',
  },
  {
    id: 7,
    title: 'Project 7',
    tag: 'Motion',
    image: BASE + 'figma-frames/news-2.png',
    description:
      'Lorem ipsum dolor sit amet consectetur. Sodales ultrices cursus condimentum hac scelerisque elementum morbi nisl.',
  },
];

export function Projects() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const total = projects.length;
  const touchStartX = useRef<number | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const goTo = useCallback(
    (i: number) => {
      setCurrentSlide(((i % total) + total) % total);
    },
    [total]
  );

  const openProject = useCallback((i: number) => {
    const el = cardRefs.current[i];
    if (el) setOriginRect(el.getBoundingClientRect());
    setExpandedSlide(i);
  }, []);

  const closeProject = useCallback(() => {
    setExpandedSlide(null);
    setOriginRect(null);
  }, []);

  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo]);
  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (expandedSlide !== null) {
        if (e.key === 'Escape') closeProject();
        return;
      }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, expandedSlide, closeProject]);

  useEffect(() => {
    document.body.style.overflow = expandedSlide !== null ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [expandedSlide]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchStartX.current = null;
  };

  const expanded = expandedSlide !== null ? projects[expandedSlide] : null;

  return (
    <section id="about" className="projects projects-carousel-section">
      <div
        className="projects-carousel reveal-scale"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="carousel-prev"
          onClick={prev}
          aria-label="Previous project"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M12.5 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="carousel-viewport">
          <div
            className="carousel-track"
            style={{
              transform: `translateX(calc(50% - 20vw - ${currentSlide} * (40vw + 32px)))`,
            }}
          >
            {projects.map((p, i) => {
              const isActive = i === currentSlide;
              return (
                <article
                  key={p.id}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className={`project-card ${isActive ? 'is-active' : 'is-side'}`}
                  onClick={() => (isActive ? openProject(i) : goTo(i))}
                  aria-hidden={!isActive}
                >
                  <img src={p.image} alt={p.title} />
                  {isActive && (
                    <div className="project-card-overlay">
                      <h3 className="project-title">{p.title}</h3>
                      <span className="project-tag-pill">{p.tag}</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="carousel-next"
          onClick={next}
          aria-label="Next project"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M7.5 4l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="carousel-dots" role="tablist" aria-label="Projects pagination">
          {projects.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === currentSlide}
              aria-label={`Go to project ${i + 1}`}
              className={`carousel-dot ${i === currentSlide ? 'is-active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      {expanded && (
        <div
          className="project-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${expanded.title} — ${expanded.tag}`}
          onClick={closeProject}
        >
          <div
            className="project-modal"
            onClick={(e) => e.stopPropagation()}
            style={
              originRect
                ? ({
                    ['--from-x' as string]: `${originRect.left}px`,
                    ['--from-y' as string]: `${originRect.top}px`,
                    ['--from-w' as string]: `${originRect.width}px`,
                    ['--from-h' as string]: `${originRect.height}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <div className="project-modal-image">
              <img src={expanded.image} alt={expanded.title} />
              <div className="project-modal-image-overlay">
                <h3 className="project-modal-title">{expanded.title}</h3>
                <span className="project-tag-pill">{expanded.tag}</span>
              </div>
              <button
                type="button"
                className="project-modal-close"
                onClick={closeProject}
                aria-label="Close project"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="project-modal-card">
              <p className="project-modal-text">{expanded.description}</p>
              <p className="project-modal-text">{expanded.description}</p>
              <p className="project-modal-text">{expanded.description}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
