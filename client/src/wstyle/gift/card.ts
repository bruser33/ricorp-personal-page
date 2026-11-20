import qrcode from 'qrcode-generator';
import { clp } from '../agenda/util';

// Tarjeta de regalo de WS Style (SPEC-60, diseño "Noir de oficio"). Lo mismo se usa para la vista en la página
// (GiftCardArt) y para el PNG (drawCard): textos, QR y medidas salen de acá.

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardData {
  code: string; kind: 'monto' | 'servicio'; amountCLP: number; service: { name: string } | null;
  from: string; to: string; message: string; expiresAt: string | null;
}

// El QR lleva a la reserva con el código ya puesto (el código va dentro del enlace).
export const reserveUrl = (code: string, origin = typeof location !== 'undefined' ? location.origin : 'https://ricorp.cl') =>
  `${origin}/wstyle/reservar/?giftcard=${encodeURIComponent(code)}`;

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export const valueLabel = (c: Pick<CardData, 'kind' | 'amountCLP' | 'service'>) => (c.kind === 'servicio' ? c.service?.name || 'Un servicio' : clp.format(c.amountCLP));

export function untilLabel(iso: string | null) {
  if (!iso) return '';
  const s = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  return `Válida hasta ${s.replace(/\./g, '').replace(/ de /g, ' ')}`;
}

export const shareText = (c: CardData, url: string) =>
  `${c.to ? `${c.to}, ` : ''}te regalaron ${c.kind === 'servicio' ? c.service?.name || 'un servicio' : clp.format(c.amountCLP)} en WS Style${c.from ? ` (de ${c.from})` : ''}. Código ${c.code}. Míralo aquí: ${url}`;

export const waShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
