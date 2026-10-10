import { Fragment } from 'react';

// Titular cinético: cada palabra va en su propia máscara para revelarla por tramo con GSAP (useMotion).
// El texto del elemento (textContent) sigue siendo exactamente el del JSON; aria-label con la frase completa para que
// lectores de pantalla (y el HTML crudo) no la lean partida.
export default function Headline({ as: H, text, field }: { as: 'h1' | 'h2'; text: string; field: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <H className="kinetic" data-field={field} aria-label={text}>
      {words.map((w, i) => <Fragment key={i}><span className="kinetic__mask"><span className="kinetic__word">{w}</span></span>{i < words.length - 1 ? ' ' : ''}</Fragment>)}
    </H>
  );
}
