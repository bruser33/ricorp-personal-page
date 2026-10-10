import { toCLP, toMinutes } from '../lib';
import { clp } from '../links';
import { str, type Service } from '../content';
import './Services.css';

// La carta (dirección "Noir de oficio"): una carta de barbería, no tarjetas genéricas. Nombre en versalitas, filete
// de puntos, precio grande en Cormorant itálica y duración. En layout compacto es un carrusel horizontal
// accesible (región con foco, flechas). Sin precio o duración válidos no se inventa nada: "Consultar".
export default function Services({ services }: { services: Service[] }) {
  return (
    <div className="cards reveal" data-list="services" role="region" aria-label="Servicios" tabIndex={0}>
      {services.filter((s) => s && str(s.name)).map((s, i) => {
        const price = toCLP(s.priceCLP), mins = toMinutes(s.durationMin);
        return (
          <article className="card" data-service={s.id ?? ''} key={s.id ?? i}>
            <div className="card__row">
              <h3 data-svc="name">{s.name}</h3>
              <span className="card__leader" aria-hidden="true"></span>
              <span data-svc="price">{Number.isFinite(price) ? clp.format(price) : 'Consultar'}</span>
            </div>
            <p className="card__meta">
              {str(s.description) && <span data-svc="description">{s.description}</span>}
              {Number.isFinite(mins) && <span data-svc="duration">{`${mins} min`}</span>}
            </p>
          </article>
        );
      })}
    </div>
  );
}
