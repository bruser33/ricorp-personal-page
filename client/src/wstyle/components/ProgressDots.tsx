import './ProgressDots.css';

const DOTS = [['hero', 'Bienvenido'], ['reyes', 'El local'], ['linea', 'El oficio'], ['afilado', 'El resultado'], ['trono', 'Reservar'], ['servicios', 'Servicios y precios'], ['llega', 'Cómo llegar']];

// Puntos laterales: indican la sección activa del recorrido.
export default function ProgressDots({ active }: { active: number }) {
  return (
    <nav className="dots" aria-label="Secciones">
      {DOTS.map(([id, label], i) => <a key={id} href={`#${id}`} aria-label={label} className={i === active ? 'is-active' : undefined}></a>)}
    </nav>
  );
}
