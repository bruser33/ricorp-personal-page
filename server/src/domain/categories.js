/* SPEC-51: categorías de la carta vistas desde la landing, la reserva y el panel del barbero.
   RN-01: un servicio sin categoría (o con una que ya no existe) cae en "Barbería".
   RN-02: las categorías van en su `order`; las que no tienen servicios (activos) no se listan. */
import { DEFAULT_CATEGORY, ServiceCategory } from '../models/index.js';

export async function categoriesOf(businessId) {
  return ServiceCategory.find({ businessId }).sort({ order: 1, createdAt: 1 }).lean();
}

/* `services` = los servicios que se van a mostrar. Devuelve las categorías con al menos uno y una función
   servicio → slug de su categoría. */
export function categoryView(categories, services) {
  const byId = new Map(categories.map((c) => [String(c._id), c]));
  const fallback = categories.find((c) => c.slug === DEFAULT_CATEGORY.slug)?.slug ?? DEFAULT_CATEGORY.slug;
  const slugOf = (s) => byId.get(String(s.categoryId))?.slug ?? fallback;
  const used = new Set(services.map(slugOf));
  const list = categories.filter((c) => used.has(c.slug)).map((c) => ({ id: c.slug, name: c.name, note: c.note || '' }));
  /* Sin categoría "Barbería" en la BD (negocio anterior a la migración): se agrega para los huérfanos. */
  if (used.has(fallback) && !list.some((c) => c.id === fallback)) list.unshift({ id: fallback, name: DEFAULT_CATEGORY.name, note: '' });
  return { categories: list, slugOf };
}
