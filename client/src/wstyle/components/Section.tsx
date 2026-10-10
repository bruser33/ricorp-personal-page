import { Fragment, type ReactNode } from 'react';
import type { ShotId } from '../content';
import Headline from './Headline';

interface Props {
  id: ShotId; label?: string | null; headline?: string | null; copy?: string | null;
  className?: string; children?: ReactNode; after?: ReactNode; labelField?: string;
}

// Sección a pantalla completa ligada a una toma de cámara (data-shot). h1 en el hero, h2 en el resto.
// label = etiqueta numerada de la narrativa ("01 — El local").
export default function Section({ id, label, headline, copy, className = '', children, after, labelField }: Props) {
  return (
    <section id={id} data-shot={id} className={`panel ${className}`.trim()}>
      <div className="panel__inner">
        {label && <p className="eyebrow reveal" data-field={labelField}>{label}</p>}
        {headline && <Headline as={id === 'hero' ? 'h1' : 'h2'} text={headline} field={`headlines.${id}`} />}
        {copy && <p className="lead reveal" data-field={id === 'hero' ? 'slogan' : `copy.${id}`}>{copy}</p>}
        {children}
      </div>
      {after}
    </section>
  );
}

// Sección intermedia (sin toma de cámara propia: la cámara sigue el tramo entre las secciones vecinas).
export function Extra({ id, label, title, children, className = '' }: { id: string; label: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`panel panel--extra panel--sheet ${className}`.trim()} aria-labelledby={`${id}-title`}>
      <div className="panel__inner">
        <p className="eyebrow reveal">{label}</p>
        <h2 className="kinetic kinetic--sm" id={`${id}-title`} aria-label={title}>{title.split(/\s+/).map((w, i, a) => <Fragment key={i}><span className="kinetic__mask"><span className="kinetic__word">{w}</span></span>{i < a.length - 1 ? ' ' : ''}</Fragment>)}</h2>
        {children}
      </div>
    </section>
  );
}
