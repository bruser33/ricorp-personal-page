import { CARD_H, CARD_W, qrMatrix, reserveUrl, untilLabel, valueLabel, type CardData } from './card';

// PNG de la tarjeta (1080×1350 exactos, CB-11), dibujado en el cliente con canvas. Mismo diseño que GiftCardArt.
type Ctx = Pick<CanvasRenderingContext2D, 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'strokeRect' | 'fillText' | 'measureText' | 'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'createRadialGradient'> & { letterSpacing?: string };
export interface CanvasLike { width: number; height: number; getContext(type: '2d'): Ctx | null }

const INK = '#0E0D0C';
const BONE = '#EDE6DA';
const BRASS = '#B8875A';
const MUTED = '#8E877D';
const DISPLAY = 'Anton, Impact, "Arial Narrow", sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const BODY = 'Inter, system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export const CARD_FONTS = [`400 70px ${DISPLAY}`, `italic 500 140px ${SERIF}`, `italic 400 54px ${SERIF}`, `600 32px ${BODY}`];

function wrap(ctx: Ctx, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

// Ajusta el tamaño de la fuente para que `text` quepa en `maxWidth` (nombres largos, servicios largos).
function fit(ctx: Ctx, text: string, font: (px: number) => string, start: number, maxWidth: number, min = 28) {
  let px = start;
  ctx.font = font(px);
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = font(px);
  }
  return px;
}

export function drawCard(canvas: CanvasLike, card: CardData, origin?: string) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas sin contexto 2d');
  const pad = 76;
  const inner = CARD_W - pad * 2;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W * 0.2, 0, 10, CARD_W * 0.2, 0, CARD_W);
  glow.addColorStop(0, 'rgba(184,135,90,0.20)');
  glow.addColorStop(1, 'rgba(184,135,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Textura: líneas diagonales muy tenues.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 2;
  for (let x = -CARD_H; x < CARD_W; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, CARD_H);
    ctx.lineTo(x + CARD_H * 0.47, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, CARD_W - 32, CARD_H - 32);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = BRASS;
  ctx.font = `400 66px ${DISPLAY}`;
  ctx.letterSpacing = '20px';
  ctx.fillText('WS STYLE', pad, pad + 66);
  ctx.letterSpacing = '9px';
  ctx.font = `600 32px ${BODY}`;
  ctx.fillText('UN REGALO PARA', pad, 300);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = BONE;
  fit(ctx, card.to || '—', (px) => `italic 500 ${px}px ${SERIF}`, 140, inner);
  ctx.fillText(card.to || '—', pad, 440);

  const value = valueLabel(card).toUpperCase();
  fit(ctx, value, (px) => `400 ${px}px ${DISPLAY}`, 120, inner);
  ctx.fillText(value, pad, 600);

  let y = 600;
  if (card.message) {
    ctx.font = `italic 400 54px ${SERIF}`;
    ctx.fillStyle = 'rgba(237,230,218,0.86)';
    for (const l of wrap(ctx, `“${card.message}”`, inner, 3)) {
      y += 66;
      ctx.fillText(l, pad, y);
    }
  }
  if (card.from) {
    ctx.font = `500 36px ${BODY}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`De ${card.from}`, pad, y + 74);
  }

  // Banda hueso con el código y el QR (oscuro sobre claro).
  const bandH = 300;
  const bandY = CARD_H - pad - 60 - bandH;
  ctx.fillStyle = BONE;
  ctx.fillRect(pad, bandY, inner, bandH);
  const m = qrMatrix(reserveUrl(card.code, origin));
  const qrSize = 240;
  const cell = Math.floor(qrSize / (m.length + 2));
  const qrPx = cell * (m.length + 2);
  const qx = pad + inner - 30 - qrPx;
  const qy = bandY + (bandH - qrPx) / 2;
  ctx.fillStyle = INK;
  m.forEach((row, r) => row.forEach((on, c) => { if (on) ctx.fillRect(qx + (c + 1) * cell, qy + (r + 1) * cell, cell, cell); }));
  ctx.fillStyle = INK;
  fit(ctx, card.code, (px) => `700 ${px}px ${MONO}`, 66, qx - pad - 60);
  ctx.fillText(card.code, pad + 36, bandY + 150);
  ctx.font = `500 30px ${BODY}`;
  ctx.fillText(untilLabel(card.expiresAt), pad + 36, bandY + 210);

  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${BODY}`;
  ctx.fillText('Reserva con este código en ricorp.cl/wstyle/reservar', CARD_W / 2, CARD_H - pad + 6);
}

// Descarga del PNG (espera las fuentes de la página para que el canvas use Anton y Cormorant).
export async function cardPng(card: CardData): Promise<Blob> {
  await Promise.all(CARD_FONTS.map((f) => document.fonts?.load(f).catch(() => null)));
  const canvas = document.createElement('canvas');
  drawCard(canvas as unknown as CanvasLike, card, location.origin);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}
