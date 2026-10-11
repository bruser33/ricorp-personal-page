import { useEffect, useState } from 'react';
import './ProgressDots.css';

// Puntos laterales (PR #9 D4): uno por cada sección visible de la página (tomas y paneles), activo según la
// sección que ocupa el centro de la pantalla.
export default function ProgressDots({ chapters }: { chapters: { id: string; label: string }[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = innerHeight / 2;
      let idx = 0;
      chapters.forEach((c, i) => { const e = document.getElementById(c.id); if (e && e.getBoundingClientRect().top <= mid) idx = i; });
      setActive(idx);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update(); addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [chapters]);
  return (
    <nav className="dots" aria-label="Secciones">
      {chapters.map((c, i) => <a key={c.id} href={`#${c.id}`} aria-label={c.label} className={i === active ? 'is-active' : undefined}></a>)}
    </nav>
  );
}
