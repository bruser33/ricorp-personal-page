import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import {
  addressLine, displayLink, hoursLine, kitLink, kitText, POSTER, POSTER_QR_RATIO, QR_QUIET, qrLayout, qrMatrix, qrRgba, qrSvg, siteOrigin, type KitPiece,
} from './difusion';
import { normalizeOrigin } from '../agenda/util';

const PROD = 'https://ricorp.cl';
const LOCAL = 'http://127.0.0.1:5173';
const UTM = (s: string) => `?utm_source=${s}&utm_medium=kit&utm_campaign=reservas`;

describe('AC-01 links por pieza', () => {
  it('cada pieza lleva su utm_source; "Tu link" va limpio', () => {
    const want: Record<KitPiece, string> = {
      link: `${PROD}/wstyle/reservar/`,
      qr: `${PROD}/wstyle/reservar/${UTM('cartel')}`,
      cartel: `${PROD}/wstyle/reservar/${UTM('cartel')}`,
      historia: `${PROD}/wstyle/reservar/${UTM('instagram_historia')}`,
      post: `${PROD}/wstyle/reservar/${UTM('instagram_historia')}`,
      bio: `${PROD}/wstyle/reservar/${UTM('instagram_bio')}`,
      whatsapp: `${PROD}/wstyle/reservar/${UTM('whatsapp')}`,
    };
    for (const [piece, url] of Object.entries(want)) expect(kitLink(piece as KitPiece, PROD)).toBe(url);
  });

  it('CB-05 con el interruptor apagado todas usan el link limpio', () => {
    for (const piece of ['link', 'qr', 'cartel', 'historia', 'post', 'bio', 'whatsapp'] as KitPiece[]) expect(kitLink(piece, PROD, false)).toBe(`${PROD}/wstyle/reservar/`);
    expect(kitText('whatsapp', PROD, false)).toBe(`Hola, ya puedes reservar tu hora en WS Style en línea, en un minuto: ${PROD}/wstyle/reservar/`);
  });

  it('RN-01 usa el origen configurado (local o prod), sin barra doble', () => {
    expect(siteOrigin(undefined, LOCAL)).toBe(LOCAL);
    expect(siteOrigin('', LOCAL + '/')).toBe(LOCAL);
    expect(siteOrigin('https://ricorp.cl/', LOCAL)).toBe(PROD);
    expect(kitLink('qr', LOCAL + '/')).toBe(`${LOCAL}/wstyle/reservar/${UTM('cartel')}`);
    expect(displayLink(PROD)).toBe('ricorp.cl/wstyle/reservar');
    expect(displayLink(LOCAL)).toBe('127.0.0.1:5173/wstyle/reservar');
  });

  it('el utm_source de cada pieza es un origen válido (no cae en "directo")', () => {
    for (const piece of ['qr', 'historia', 'bio', 'whatsapp'] as KitPiece[]) {
      const src = new URL(kitLink(piece, PROD)).searchParams.get('utm_source');
      expect(normalizeOrigin(src)).toBe(src);
    }
  });
});

describe('AC-05 textos (RN-05)', () => {
  it('WhatsApp, bio y post con su link', () => {
    expect(kitText('whatsapp', PROD)).toBe(`Hola, ya puedes reservar tu hora en WS Style en línea, en un minuto: ${PROD}/wstyle/reservar/${UTM('whatsapp')}`);
    expect(kitText('bio', PROD)).toBe(`Reserva tu hora ↓ ${PROD}/wstyle/reservar/${UTM('instagram_bio')}`);
    expect(kitText('post', PROD)).toBe('Elige día, hora y barbero en ricorp.cl/wstyle/reservar');
  });
});

describe('AC-02 QR válido', () => {
  const decode = (rgba: Uint8ClampedArray, px: number) => jsQR(rgba, px, px)?.data;

  it('el PNG (1024 px) se decodifica al link exacto, con UTM, y la zona de silencio es ≥ 4 módulos', () => {
    for (const url of [kitLink('qr', PROD), kitLink('historia', PROD), kitLink('qr', LOCAL), kitLink('link', PROD)]) {
      const m = qrMatrix(url);
      expect(decode(qrRgba(m, 1024), 1024)).toBe(url);
      expect(qrLayout(m, 1024).quietModules).toBeGreaterThanOrEqual(QR_QUIET);
    }
  });

  it('RN-02 el link con UTM (el más largo) no pasa de la versión 6 (41 módulos)', () => {
    expect(qrMatrix(kitLink('historia', PROD)).size).toBeLessThanOrEqual(41);
  });

  it('el SVG se decodifica al mismo link y trae 4 módulos de silencio, oscuro sobre hueso', () => {
    const url = kitLink('qr', PROD);
    const m = qrMatrix(url);
    const svg = qrSvg(m);
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    expect(Number(vb[1])).toBe(m.size + 8);
    expect(svg).toContain('fill="#EDE6DA"');
    expect(svg).toContain('<path fill="#0E0D0C"');
    // Rasteriza el <path> del SVG (cuadrados de 1 módulo) y lo decodifica.
    const total = m.size + 8, cell = 10, px = total * cell;
    const on = new Set<string>();
    for (const [, x, y, n] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) for (let i = 0; i < Number(n); i++) on.add(`${Number(x) + i},${y}`);
    expect(on.size).toBeGreaterThan(m.size);
    for (const k of on) {
      const [x, y] = k.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThan(total - 4);
      expect(y).toBeLessThan(total - 4);
    }
    const rgba = new Uint8ClampedArray(px * px * 4);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const v = on.has(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ? 14 : 237;
      const i = (y * px + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
    }
    expect(decode(rgba, px)).toBe(url);
  });

  it('RN-02 el QR del cartel mide al menos 6 cm a 300 dpi', () => {
    // kitDraw.ts dibuja el QR del cartel con POSTER_QR_RATIO del ancho de la hoja (el navegador mide el real, AC-03).
    for (const s of Object.values(POSTER)) expect(Math.floor(s.w * POSTER_QR_RATIO) / 300 * 2.54).toBeGreaterThanOrEqual(6);
  });
});

describe('RN-06 datos del negocio en el cartel', () => {
  it('horario agrupado desde la BD; sin horario → sin línea', () => {
    const r = (opens: string, closes: string) => [{ opens, closes }];
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, ranges: r('10:00', '20:00') }));
    expect(hoursLine([...week, { weekday: 6, ranges: r('10:00', '18:00') }, { weekday: 7, ranges: [] }])).toBe('Lun a Vie 10:00–20:00 · Sáb 10:00–18:00');
    expect(hoursLine([{ weekday: 2, ranges: r('10:00', '14:00') }, { weekday: 4, ranges: r('10:00', '14:00') }])).toBe('Mar 10:00–14:00 · Jue 10:00–14:00');
    expect(hoursLine([])).toBeNull();
    expect(hoursLine([{ weekday: 1, ranges: [] }])).toBeNull();
  });

  it('dirección solo si el sitio no está en demo', () => {
    const contact = { address: { street: 'Av. Providencia 2124, local 7', city: 'Providencia' } };
    expect(addressLine({ demo: true, contact })).toBeNull();
    expect(addressLine({ demo: 'true', contact })).toBeNull();
    expect(addressLine({ demo: false, contact })).toBe('Av. Providencia 2124, local 7, Providencia');
    expect(addressLine({ demo: false, contact: {} })).toBeNull();
    expect(addressLine(null)).toBeNull();
  });
});
