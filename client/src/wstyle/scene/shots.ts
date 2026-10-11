// Medidas supuestas del local (L) y tomas de cámara del recorrido (SHOTS). Puerto TS de barberia-3d/shared/scene.js:
// mismos valores que usó Blender para renderizar la secuencia. Sin dependencias de WebGL (lo usa la matemática de
// cámara también en modo secuencia); la geometría vive en scene.ts y se carga solo en modo 3D.
import { Vector3 } from 'three';

// ─── Medidas SUPUESTAS (metros). Origen = esquina noroeste a nivel de piso.
// x: oeste→este (largo), z: norte→sur (ancho), y: altura. Muro del espejo = norte (z=0).
export const L = {
  largo: 7.0, ancho: 3.6, alto: 2.5,
  vigaX: 5.2,                                   // viga de listones que separa corte | espera
  espejo: { x0: 1.0, x1: 4.0, y0: 1.0, y1: 1.9 },
  meson:  { x0: 0.8, x1: 4.4, alto: 0.85, fondo: 0.42 },
  silla:  { x: 2.4, z: 1.05 },
  lavado: { x0: 1.3, x1: 2.9, z0: 2.0 },        // cubículo contra muro sur, abierto hacia el espejo
  puerta: { z0: 1.35, z1: 2.25, alto: 2.05 },   // muro oeste
  ventana:{ z0: 2.5, z1: 3.4, y0: 1.0, y1: 2.0 },
  acceso: { z0: 1.2, z1: 2.15 },                // muro este (supuesto)
};

// ─── Cámara: vistas y recorrido (guion SPEC-05)
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
export const TOUR = [
  { t: 'Bienvenido',           pos: V(6.7, 1.6, 2.6),  target: V(1.6, 1.2, .9) },
  { t: 'Donde se sientan los reyes', pos: V(4.6, 1.55, 2.5), target: V(2.4, .9, .6) },
  { t: 'Cada línea con intención', pos: V(4.2, 1.5, 2.3), target: V(2.4, .9, .7) },
  { t: 'Sal más afilado',      pos: V(2.4, 1.45, 2.0), target: V(2.4, 1.4, 0) },
  { t: 'Relájate',             pos: V(2.8, 1.55, 1.45), target: V(1.9, .5, 3.2) },
  { t: 'Detrás de escena',     pos: V(2.8, 1.6, 1.4),  target: V(0, 1.1, 2.0) },
  { t: 'Servicios y precios',  pos: V(3.5, 9.5, 1.81), target: V(3.5, 0, 1.8) },
];

// Tomas del sitio (SPEC-05/12). hero y reyes = TOUR[0..1] del blockout; el resto son propias del sitio y
// SUPUESTAS (ver docs/blockout-supuestos.md). `mobile` (opcional) reemplaza la toma en pantallas verticales.
// `up` (opcional, por defecto +y) fija hacia dónde queda "arriba" en pantalla; es obligatorio en las cenitales,
// donde mirar casi en vertical hace que lookAt con +y degenere y la imagen gire de golpe.
// `fov` (opcional) = FOV vertical de esa toma; si falta, el del dispositivo (50° horizontal / 68° vertical).
export interface ShotPose { pos: Vector3; target: Vector3; up?: Vector3; fov?: number }
export interface Shot extends ShotPose { id: string; mobile?: ShotPose }
export const SHOTS: Shot[] = [
  { id: 'hero',      pos: TOUR[0].pos.clone(), target: TOUR[0].target.clone() },
  { id: 'reyes',     pos: TOUR[1].pos.clone(), target: TOUR[1].target.clone() },
  // Primer plano del mesón con productos y herramientas, con el espejo de fondo.
  { id: 'linea',     pos: V(3.9, 1.3, .95),    target: V(3.1, .95, .25) },
  // Espejo + reflejo como foco: la silla de espaldas abajo y su frente reflejado.
  // En vertical la cámara mira un poco hacia arriba para que el espejo quede bajo el texto.
  { id: 'afilado',   pos: V(3.4, 1.5, 1.9),    target: V(2.3, 1.3, .05),
    mobile: { pos: V(3.2, 1.5, 2.2), target: V(2.3, 1.9, .05) } },
  // Silla de frente a 3/4, desde el lado del espejo (oeste), altura de ojos sentado.
  { id: 'trono',     pos: V(1.7, 1.55, .35),   target: V(2.5, .8, 1.3) },
  // Cenital: norte arriba, la planta (con el borde superior de los muros) queda en la mitad derecha sin que la
  // pisen las tarjetas; más baja y con FOV más abierto para acortar el viaje desde/hacia las tomas vecinas.
  // En vertical se gira (oeste arriba: el largo del local en vertical) y se corre hacia abajo, bajo el carrusel.
  { id: 'servicios', pos: V(.25, 9.3, 1.81),   target: V(.25, 0, 1.8), up: V(0, 0, -1), fov: 68,
    mobile: { pos: V(1.76, 8.6, 1.8), target: V(1.75, 0, 1.8), up: V(-1, 0, 0) } },
  // La puerta vidriada del acceso este (supuesta) como protagonista.
  // Alineada con blender/layout.json (misma toma en el render de Blender).
  { id: 'llega',     pos: V(4.4, 1.55, 2.75),  target: V(L.largo, 1.1, (L.acceso.z0 + L.acceso.z1) / 2) },
];
// Tomas efectivas según la orientación de la pantalla.
export type EffectiveShot = ShotPose & { id: string };
export const shotsFor = (portrait: boolean): EffectiveShot[] => SHOTS.map((s) => ({ id: s.id, ...(portrait && s.mobile ? s.mobile : { pos: s.pos, target: s.target, up: s.up, fov: s.fov }) }));
