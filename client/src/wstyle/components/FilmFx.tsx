import './FilmFx.css';

// Tratamiento de "película" sobre el render (dirección "Noir de oficio"): barras de letterbox 2.39:1 que se cierran
// entre tomas y se abren en cada toma (las mueve experience.ts vía --letterbox), grano ≤ 4 % y viñeta.
// Todo va por debajo del texto (z-index de la capa de película) y sin eventos de puntero.
export default function FilmFx() {
  return (
    <div className="film-fx" aria-hidden="true">
      <div className="film-fx__vignette"></div>
      <div className="film-fx__grain"></div>
      <div className="film-fx__bar film-fx__bar--top"></div>
      <div className="film-fx__bar film-fx__bar--bottom"></div>
    </div>
  );
}

// Marquesina lenta en latón entre secciones.
export function Marquee({ words }: { words: string[] }) {
  if (!words.length) return null;
  const line = words.map((w) => `${w.toUpperCase()} · `).join('');
  return (
    // overflow-x: auto (no hidden): el texto que sale de pantalla vive en un contenedor scrolleable, sin desbordar.
    <div className="marquee" aria-hidden="true" tabIndex={-1}>
      <div className="marquee__track"><span>{line}</span><span>{line}</span><span>{line}</span><span>{line}</span></div>
    </div>
  );
}
