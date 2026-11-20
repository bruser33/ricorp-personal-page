import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import GiftCardArt from './GiftCardArt';
import { CARD_H, CARD_W, qrMatrix, reserveUrl, shareText, untilLabel, valueLabel, type CardData } from './card';
import { drawCard, type CanvasLike } from './drawCard';

const card: CardData = {
  code: 'WS-7KQ4-M9TP', kind: 'monto', amountCLP: 20000, service: null,
  from: 'Camila', to: 'Valentina', message: '¡Feliz cumple!', expiresAt: '2027-11-18T15:00:00.000Z',
};

// Contexto 2D falso: registra los textos dibujados (jsdom/node no traen canvas).
function fakeCanvas() {
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, k) {
      if (k === 'fillText') return (t: string) => texts.push(t);
      if (k === 'measureText') return (t: string) => ({ width: t.length * 20 });
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in target) return target[k as string];
      return () => {};
    },
    set(target, k, v) { target[k as string] = v; return true; },
  });
  const canvas = { width: 300, height: 150, getContext: () => ctx } as unknown as CanvasLike;
  return { canvas, texts };
}

describe('gift card (SPEC-60)', () => {
  it('CB-11: el PNG mide 1080×1350 exactos y lleva nombre, monto, código y vencimiento', () => {
    const { canvas, texts } = fakeCanvas();
    drawCard(canvas, card, 'https://ricorp.cl');
    expect([canvas.width, canvas.height]).toEqual([CARD_W, CARD_H]);
    expect([CARD_W, CARD_H]).toEqual([1080, 1350]);
    expect(texts).toContain('Valentina');
    expect(texts).toContain('WS-7KQ4-M9TP');
    expect(texts.some((t) => /20\.000/.test(t))).toBe(true);
    expect(texts.some((t) => /^Válida hasta 18 nov 2027$/.test(t))).toBe(true);
    expect(texts).toContain('De Camila');
  });
  it('QR: matriz cuadrada válida con la URL de reserva y el código', () => {
    const m = qrMatrix(reserveUrl(card.code, 'https://ricorp.cl'));
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((r) => r.length === m.length)).toBe(true);
    expect(reserveUrl(card.code, 'https://ricorp.cl')).toBe('https://ricorp.cl/wstyle/reservar/?giftcard=WS-7KQ4-M9TP');
  });
  it('CB-10: el mensaje se muestra como texto, nunca como HTML', () => {
    const html = renderToStaticMarkup(<GiftCardArt card={{ ...card, message: '<img src=x onerror=alert(1)>' }} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
  it('textos: monto o servicio, vencimiento y mensaje para compartir', () => {
    expect(valueLabel(card)).toMatch(/\$\s?20\.000/);
    expect(valueLabel({ kind: 'servicio', amountCLP: 30000, service: { name: 'Decoloración global' } })).toBe('Decoloración global');
    expect(untilLabel(card.expiresAt)).toBe('Válida hasta 18 nov 2027');
    expect(shareText(card, 'https://ricorp.cl/wstyle/regalo/?t=x')).toMatch(/^Valentina, te regalaron .+ en WS Style \(de Camila\)\. Código WS-7KQ4-M9TP\./);
  });
});
