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
  // "La carta" (SPEC-30): plano cálido y cercano de navajas de barbero sobre el mesón (bandeja de cuero, brocha,
  // toallas; luz cálida rasante propia en Blender). Reemplaza la cenital fría. Las navajas quedan en la mitad derecha
  // (las tarjetas van a la izquierda); en vertical, en la mitad de abajo, bajo el carrusel.
  { id: 'servicios', pos: V(2.1, 1.02, .5),    target: V(1.75, .87, .18), fov: 36,
    mobile: { pos: V(2.0, 1.12, .55), target: V(1.82, .95, .2), fov: 56 } },
  // Final "Llega" (SPEC-30): la fachada de noche desde la calle (letrero WS STYLE retroiluminado, apliques cálidos,
  // poste de barbero). Desde la carta la cámara retrocede mirando el local y sale por el centro de la puerta
  // vidriada (la recta entre ambas poses cruza x = 7 en z ≈ 1.6, y ≈ 1.2: dentro del vano). La fachada queda a la
  // derecha (texto a la izquierda) y algo baja, para que el letrero no quede bajo el header; en vertical, abajo.
  { id: 'llega',     pos: V(11, 1.35, 2.46),   target: V(7.1, 1.9, 3.3),
    mobile: { pos: V(12.4, 1.3, 2.7), target: V(7.1, 2.15, 1.9) } },
];
// Tomas efectivas según la orientación de la pantalla.
export type EffectiveShot = ShotPose & { id: string };
export const shotsFor = (portrait: boolean): EffectiveShot[] => SHOTS.map((s) => ({ id: s.id, ...(portrait && s.mobile ? s.mobile : { pos: s.pos, target: s.target, up: s.up, fov: s.fov }) }));
