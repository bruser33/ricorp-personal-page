import { toCLP, toMinutes } from '../lib';
import { clp } from '../links';
import { groupByCategory, str, type Category, type Service } from '../content';
import './Services.css';

// La carta (dirección "Noir de oficio"): una carta de barbería, no tarjetas genéricas. Nombre en versalitas, filete
// de puntos, precio grande en Cormorant itálica y duración. En layout compacto es la misma lista vertical dentro
// del panel graphite (PR #9 D6). Región con nombre y foco para lectores de pantalla. Sin precio o duración válidos
// no se inventa nada: "Consultar".
// SPEC-51: agrupada por categoría (Barbería, Decoloración capilar…): título del grupo, su nota una sola vez y debajo
// sus servicios. Sin categoría → "Barbería" (RN-01); las categorías vacías no se muestran (RN-02).
export default function Services({ services, categories }: { services: Service[]; categories?: Category[] }) {
  const groups = groupByCategory(services.filter((s) => s && str(s.name)), categories);
  return (
    <div className="cards reveal" data-list="services" role="region" aria-label="Servicios" tabIndex={0}>
      {groups.map((g) => (
        <section className="carta-group" data-category={g.id} key={g.id} aria-labelledby={`carta-${g.id}`}>
          <h3 className="carta-group__title" id={`carta-${g.id}`}>{g.name}</h3>
          {g.note && <p className="carta-group__note" data-category-note="">{g.note}</p>}
          {g.items.map((s, i) => {
            const price = toCLP(s.priceCLP), mins = toMinutes(s.durationMin);
            return (
              <article className="card" data-service={s.id ?? ''} key={s.id ?? i}>
                <div className="card__row">
                  <h4 data-svc="name">{s.name}</h4>
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
        </section>
      ))}
    </div>
  );
}
