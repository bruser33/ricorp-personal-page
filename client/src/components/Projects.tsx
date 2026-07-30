import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '../i18n';
import './Projects.css';

type Project = {
  id: number;
  title: string;
  tag: string;
  image: string;
  description: string;
  mockups?: string[];
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
    mockups: [BASE + 'figma-frames/project-haru-1.png', BASE + 'figma-frames/project-haru-2.png'],
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
  const { t } = useLang();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const total = projects.length;
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  // Pointer drag ("grab & move the slider" with momentum/force on release).
  const [dragging, setDragging] = useState(false);
  const [dragDX, setDragDX] = useState(0);
  const drag = useRef({ startX: 0, lastX: 0, lastT: 0, vel: 0, moved: false, pointerId: -1 });

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

  // Slide step in px — MUST match the CSS/track transform (46vw card + 24px gap).
  const stepPx = () => window.innerWidth * 0.46 + 24;

  const onPointerDown = (e: React.PointerEvent) => {
    if (expandedSlide !== null) return;
    const d = drag.current;
    d.startX = e.clientX;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    d.vel = 0;
    d.moved = false;
    d.pointerId = e.pointerId;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const d = drag.current;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vel = (e.clientX - d.lastX) / dt; // px per ms
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    setDragDX(dx);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const d = drag.current;
    const dx = e.clientX - d.startX;
    // Momentum: project the release velocity into extra travel ("force").
    const projected = d.vel * 180;
    const rawSlides = -(dx + projected) / stepPx();
    const move = Math.max(-3, Math.min(3, Math.round(rawSlides)));
    setDragging(false);
    setDragDX(0);
    setCurrentSlide((s) => Math.max(0, Math.min(total - 1, s + move)));
    e.currentTarget.releasePointerCapture?.(d.pointerId);
  };

  const expanded = expandedSlide !== null ? projects[expandedSlide] : null;

  /* Arc slide (the designer's "circle" motion): cards ride a convex rim.
     The centred card sits up front & full size; neighbours drop DOWN a parabola
     and shrink/rotate as they slip off to the sides — so advancing makes the
     next card RISE from below into focus ("el siguiente viene desde abajo").
     `center` is fractional so the arc follows the drag 1:1. */
  const step =
    typeof window !== 'undefined' ? window.innerWidth * 0.46 + 24 : 1;
  const center = currentSlide - dragDX / step;
  const arc = (i: number) => {
    const d = i - center; // signed distance in slide units
    const ad = Math.abs(d);
    const dropY = 30 * d * d; // px: 0 at centre → down at the edges
    const rot = -4 * Math.max(-2.2, Math.min(2.2, d)); // slight rim tilt
    const scale = Math.max(0.62, 1 - 0.18 * ad);
    const opacity = Math.max(0, 1 - 0.5 * ad); // ±2 neighbours visible, rest fade
    return {
      transform: `translateY(${dropY.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      opacity,
      zIndex: 100 - Math.round(ad * 10),
    } as React.CSSProperties;
  };

  return (
    <section id="about" className="projects projects-carousel-section">
      <div className="container projects-header">
        <p className="section-label reveal">{t('projects.label')}</p>
      </div>
      <div className="projects-carousel reveal-scale">
        <div
          className={`carousel-viewport${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className={`carousel-track${dragging ? ' is-dragging' : ''}`}
            style={{
              transform: `translateX(calc(50% - 23vw - ${currentSlide} * (46vw + 24px) + ${dragDX}px))`,
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
                  style={arc(i)}
                  onClick={() => {
                    // Suppress the click that follows a drag gesture.
                    if (drag.current.moved) {
                      drag.current.moved = false;
                      return;
                    }
                    if (isActive) openProject(i);
                    else goTo(i);
                  }}
                  aria-hidden={!isActive}
                >
                  <img src={p.image} alt={p.title} draggable={false} />
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

        <div className="carousel-dots" role="tablist" aria-label="Projects pagination">
          {projects.map((p, i) => {
            /* Figma: the dots sit on a convex arc (dome ∩) — apex in the centre,
               dropping down toward both edges. Parabolic offset per position. */
            const mid = (total - 1) / 2;
            const t = mid === 0 ? 0 : (i - mid) / mid; // -1 … 0 … 1
            const dropY = 22 * t * t; // 0px at centre → 22px at the edges
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === currentSlide}
                aria-label={`Go to project ${i + 1}`}
                className={`carousel-dot ${i === currentSlide ? 'is-active' : ''}`}
                style={{ transform: `translateY(${dropY.toFixed(1)}px)` }}
                onClick={() => goTo(i)}
              />
            );
          })}
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
              {expanded.mockups && expanded.mockups.length > 0 ? (
                <div className="project-modal-layout">
                  <div className="project-modal-text-col">
                    <p className="project-modal-text">{expanded.description}</p>
                    <p className="project-modal-text">{expanded.description}</p>
                  </div>
                  <div className="project-modal-mockups-col">
                    {expanded.mockups.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className={`project-modal-mockup mockup-${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="project-modal-text">{expanded.description}</p>
                  <p className="project-modal-text">{expanded.description}</p>
                  <p className="project-modal-text">{expanded.description}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
