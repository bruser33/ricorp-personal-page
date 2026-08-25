/* Lectura en runtime de la coreografía del intro (las custom properties viven en
   index.css). Se lee del CSS en vez de fijar los números acá a propósito:
   retocar la coreografía en el CSS y dejar estos valores viejos no rompe nada de
   forma visible, solo desincroniza en silencio lo que cuelga del intro.
   Los `fallback` que se pasan a readMs NO son la fuente de verdad: son la red
   para cuando la custom property no existe todavía (SSR, o el CSS sin cargar).
   Si divergen del CSS nadie se entera, así que valen como último recurso, no
   como lugar donde editar la coreografía.

   Las custom properties se serializan TAL CUAL se escribieron (el navegador NO
   las normaliza), así que hay que interpretar la unidad a mano: "2820ms" y
   "2.82s" son ambos válidos, y un número pelado se toma como ms — leerlo como
   segundos daría 2.820.000ms. */

const INTRO_MS_MAX = 30_000; // cota de sanidad: nada del intro dura medio minuto

export function readMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  const ms = raw.endsWith('ms') || !raw.endsWith('s') ? n : n * 1000;
  return ms > INTRO_MS_MAX ? fallback : ms;
}

/* Fin del intro del Home = beat B completo (subtítulo + luz asentados), contado
   DESDE el reveal. Lo usan dos cosas distintas:
   · App.tsx, para armar el auto-advance recién cuando el intro terminó.
   · Hero.tsx, para apagar el delay del intro (ver .hero-settled en Hero.css). */
export function introTotalMs(): number {
  return readMs('--intro-beat-b-delay', 2820) + readMs('--intro-beat-b-dur', 1100);
}
