// Kit de difusión del link de reservas (SPEC-58). Funciones puras (probadas en difusion.test.ts): links con UTM por
// pieza, textos listos para copiar, matriz del QR y su SVG, y la línea de horario del cartel. El dibujo en canvas
// está en kitDraw.ts (necesita el navegador).
import qrcode from 'qrcode-generator';
import type { WeekDay } from './api';

/* ─── Links (RN-01, alcance 3) */
export type KitPiece = 'link' | 'qr' | 'cartel' | 'historia' | 'bio' | 'post' | 'whatsapp';
export const BOOKING_PATH = '/wstyle/reservar/';
// Origen de cada pieza (utm_source). "link" = [Copiar] de "Tu link": siempre sin UTM.
export const PIECE_SOURCE: Record<KitPiece, string | null> = {
  link: null,
  qr: 'cartel',
  cartel: 'cartel',
  historia: 'instagram_historia',
  post: 'instagram_historia',
  bio: 'instagram_bio',
  whatsapp: 'whatsapp',
};

/* Origen del sitio (sin barra final): VITE_SITE_URL si está configurado; si no, el del navegador (local muestra
   http://127.0.0.1:5173 y prod https://ricorp.cl). Nunca escrito a mano en cada pieza. */
export function siteOrigin(env: string | undefined, fallback: string): string {
  const v = (env ?? '').trim() || fallback;
  return v.replace(/\/+$/, '');
}

/* AC-01: link de reservas de una pieza. Con UTM: utm_source + utm_medium=kit + utm_campaign=reservas (nada más,
   para no densificar el QR, RN-02). Con el interruptor apagado o para "link": el link limpio. */
export function kitLink(piece: KitPiece, base: string, utm = true): string {
  const url = `${base.replace(/\/+$/, '')}${BOOKING_PATH}`;
  const source = PIECE_SOURCE[piece];
  if (!utm || !source) return url;
  return `${url}?utm_source=${source}&utm_medium=kit&utm_campaign=reservas`;
}

/* El link como se lee impreso: "ricorp.cl/wstyle/reservar" (sin esquema, sin barra final, sin UTM). */
export function displayLink(base: string): string {
  return `${base.replace(/^https?:\/\//, '').replace(/\/+$/, '')}${BOOKING_PATH.replace(/\/$/, '')}`;
}

/* ─── Textos (RN-05). Base en el código, no editable desde el panel (asunción 2). */
export type KitText = 'whatsapp' | 'bio' | 'post';
export const KIT_TEXTS: { key: KitText; label: string; hint: string }[] = [
  { key: 'whatsapp', label: 'Mensaje de WhatsApp', hint: 'Para mandarlo a tus clientes o ponerlo en tu estado.' },
  { key: 'bio', label: 'Bio de Instagram', hint: 'Pega el link en el campo "Enlace" de tu perfil.' },
  { key: 'post', label: 'Post o historia', hint: 'Para el texto de una publicación. En la historia usa el sticker de enlace con el link.' },
];
export function kitText(key: KitText, base: string, utm = true): string {
  if (key === 'whatsapp') return `Hola, ya puedes reservar tu hora en WS Style en línea, en un minuto: ${kitLink('whatsapp', base, utm)}`;
  if (key === 'bio') return `Reserva tu hora ↓ ${kitLink('bio', base, utm)}`;
  return `Elige día, hora y barbero en ${displayLink(base)}`;
}
/* El link que va con cada texto (el post lo lleva en el sticker de la historia). */
export const kitTextLink = (key: KitText, base: string, utm = true) => kitLink(key, base, utm);

/* ─── QR (RN-02): corrección M, zona de silencio de 4 módulos, oscuro sobre hueso. */
export const QR_QUIET = 4;
export const INK = '#0E0D0C';
export const BONE = '#EDE6DA';
export const BRASS = '#B8875A';

export interface QrMatrix { size: number; dark: (row: number, col: number) => boolean }
export function qrMatrix(text: string, level: 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

/* SVG del QR en módulos (escalable, para la imprenta): fondo hueso con la zona de silencio y un solo <path>. */
export function qrSvg(m: QrMatrix, quiet = QR_QUIET): string {
  const total = m.size + quiet * 2;
  let d = '';
  // Un rectángulo por tramo horizontal de módulos oscuros (SVG liviano para la imprenta).
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.dark(r, c)) continue;
      let n = 1;
      while (c + n < m.size && m.dark(r, c + n)) n++;
      d += `M${c + quiet} ${r + quiet}h${n}v1h-${n}z`;
      c += n - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="1024" height="1024" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="${BONE}"/><path fill="${INK}" d="${d}"/></svg>`;
}

/* Geometría del QR dentro de un cuadrado de `px`: módulo entero (bordes nítidos) y el sobrante va a la zona de
   silencio, que nunca baja de 4 módulos. */
export function qrLayout(m: QrMatrix, px: number, quiet = QR_QUIET) {
  const cell = Math.floor(px / (m.size + quiet * 2));
  const offset = Math.floor((px - cell * m.size) / 2);
  return { cell, offset, quietModules: offset / cell };
}

/* Rasteriza el QR a RGBA (sin canvas): la usa el test con un decodificador y sirve de fuente única de la geometría. */
export function qrRgba(m: QrMatrix, px: number): Uint8ClampedArray {
  const { cell, offset } = qrLayout(m, px);
  const out = new Uint8ClampedArray(px * px * 4);
  const ink = [0x0e, 0x0d, 0x0c], bone = [0xed, 0xe6, 0xda];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const r = Math.floor((y - offset) / cell), c = Math.floor((x - offset) / cell);
      const on = y >= offset && x >= offset && r < m.size && c < m.size && m.dark(r, c);
      const [R, G, B] = on ? ink : bone;
      const i = (y * px + x) * 4;
      out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = 255;
    }
  }
  return out;
}

/* ─── Línea de datos del cartel (RN-06): solo datos reales. Horario desde la BD (Horario del panel). */
const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export function hoursLine(week: WeekDay[] | null | undefined): string | null {
  if (!week?.length) return null;
  const key = (d: WeekDay | undefined) => (d?.ranges.length ? d.ranges.map((r) => `${r.opens}–${r.closes}`).join(' y ') : '');
  const byDay = new Map(week.map((d) => [d.weekday, d]));
  const groups: { from: number; to: number; text: string }[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const text = key(byDay.get(wd));
    const last = groups[groups.length - 1];
    if (text && last && last.text === text && last.to === wd - 1) last.to = wd;
    else if (text) groups.push({ from: wd, to: wd, text });
  }
  if (!groups.length) return null;
  return groups.map((g) => `${g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]} a ${DAY_SHORT[g.to]}`} ${g.text}`).join(' · ');
}

/* Dirección del local desde site.json: solo si el sitio NO está en modo demo (en demo los datos son de ejemplo). */
export function addressLine(site: { demo?: unknown; contact?: { address?: { street?: unknown; city?: unknown } } } | null | undefined): string | null {
  if (!site || site.demo === true || String(site.demo).trim().toLowerCase() === 'true') return null;
  const a = site.contact?.address;
  const street = typeof a?.street === 'string' ? a.street.trim() : '';
  const city = typeof a?.city === 'string' ? a.city.trim() : '';
  return street ? (city ? `${street}, ${city}` : street) : null;
}

/* ─── Piezas descargables (AC-03) */
export type PosterSize = 'a4' | 'carta';
// 300 dpi: A4 = 210 × 297 mm, Carta = 8,5 × 11 in.
// printW/printH: tamaño de la imagen en la hoja (un pelo menos que la hoja para que nunca salte a una 2ª página).
export const POSTER: Record<PosterSize, { label: string; w: number; h: number; page: string; printW: string; printH: string }> = {
  a4: { label: 'A4', w: 2480, h: 3508, page: 'A4', printW: '209.5mm', printH: '296.5mm' },
  carta: { label: 'Carta', w: 2550, h: 3300, page: 'letter', printW: '215.4mm', printH: '278.9mm' },
};
// RN-02: el QR del cartel mide el 52 % del ancho de la hoja (≈ 11 cm a 300 dpi, mínimo exigido 6 cm).
export const POSTER_QR_RATIO = 0.52;
export const STORY = { w: 1080, h: 1920, safe: 250 };
export const FILES = { qrPng: 'wstyle-qr.png', qrSvg: 'wstyle-qr.svg', story: 'wstyle-historia.png', poster: (s: PosterSize) => `wstyle-cartel-${s}.png` };

