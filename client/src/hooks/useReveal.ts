import { useEffect } from 'react';

export function useReveal(active: boolean, threshold = 0.12) {
  useEffect(() => {
    if (!active) return;
    let io: IntersectionObserver | null = null;
    let raf = 0;

    function arm() {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>('.reveal, .reveal-fade, .reveal-scale')
      ).filter((el) => !el.classList.contains('visible'));
      if (!targets.length) return;
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              io?.unobserve(entry.target);
            }
          });
        },
        { threshold, rootMargin: '0px 0px -5% 0px' }
      );
      targets.forEach((el) => io!.observe(el));
    }

    raf = requestAnimationFrame(() => {
      requestAnimationFrame(arm);
    });

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [active, threshold]);
}
