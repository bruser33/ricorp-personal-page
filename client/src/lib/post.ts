import type { HitoTrayectoria } from '../data/trayectoria';

/* Helpers puros del post de un proyecto, compartidos por el slider de
   Proyectos y la página Trayectoria (SPEC-39). Viven fuera de los componentes
   para que los dos lados armen el modal con las MISMAS reglas y para poder
   testearlos sin DOM. */

const BASE = import.meta.env.BASE_URL;

/* En `trayectoria.ts` las rutas se guardan relativas a `client/public`
   ('figma-frames/x.png') para que quien edita ese archivo no tenga que saber
   nada del base path de GitHub Pages. El prefijo se agrega acá. */
export function rutaPublica(ruta: string): string {
  if (/^(https?:)?\/\//.test(ruta) || ruta.startsWith('/')) return ruta;
  return BASE + ruta;
}

/* El título admite un \n forzado (lo usa la línea de tiempo); en las tarjetas,
   en la banda del post y en los textos accesibles se aplana a una sola línea. */
export const tituloPlano = (titulo: string) => titulo.replace(/\n/g, ' ');

/* Lo que se escribe en la tarjeta y en la banda del post (letra muy grande):
   el título corto si lo hay. */
export const tituloTarjeta = (h: HitoTrayectoria) => h.tituloTarjeta ?? tituloPlano(h.titulo);

/* Texto accesible del post/tarjeta. `etiqueta` es opcional: sin ella el rótulo
   es solo el título. */
export const rotulo = (h: HitoTrayectoria) =>
  h.etiqueta ? `${tituloPlano(h.titulo)} — ${h.etiqueta}` : tituloPlano(h.titulo);

/* ¿El modal de la Trayectoria abre este hito como POST (idéntico al del
   slider) o como el detalle simple de siempre (título + fecha + descripción +
   "Ver más")? Post si tiene contenido propio de post: párrafos, mockups,
   videos, o si es un proyecto destacado (entonces existe en el slider y tiene
   que verse igual). Listas vacías no cuentan. */
export function usaModoPost(h: HitoTrayectoria): boolean {
  return (
    !!h.destacado ||
    !!h.parrafos?.length ||
    !!h.mockups?.length ||
    !!(h.videos?.tutorial || h.videos?.reel)
  );
}
