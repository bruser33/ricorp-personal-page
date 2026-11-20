import { useMemo } from 'react';
import { qrMatrix, reserveUrl, untilLabel, valueLabel, type CardData } from './card';
import './gift.css';

// La tarjeta en la página (HTML + SVG). El mensaje se pinta como texto (React lo escapa): nunca como HTML (CB-10).
export function QrSvg({ text, className }: { text: string; className?: string }) {
  const m = useMemo(() => qrMatrix(text), [text]);
  const n = m.length;
  const d = m.flatMap((row, r) => row.map((on, c) => (on ? `M${c + 2} ${r + 2}h1v1h-1z` : ''))).join('');
  return (
    <svg className={className} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="Código QR para reservar con esta gift card" shapeRendering="crispEdges">
      <rect width={n + 4} height={n + 4} fill="#EDE6DA" />
      <path d={d} fill="#0E0D0C" />
    </svg>
  );
}

export default function GiftCardArt({ card }: { card: CardData }) {
  return (
    <figure className="gc-card" data-gift-card="" aria-label={`Gift card de WS Style para ${card.to}`}>
      <div className="gc-card__frame">
        <p className="gc-card__brand">WS STYLE</p>
        <p className="gc-card__for">Un regalo para</p>
        <p className="gc-card__name">{card.to || '—'}</p>
        <p className="gc-card__value" data-gift-value="">{valueLabel(card)}</p>
        {card.message && <p className="gc-card__msg">“{card.message}”</p>}
        {card.from && <p className="gc-card__from">De {card.from}</p>}
        <div className="gc-card__band">
          <div>
            <p className="gc-card__code" data-gift-code="">{card.code}</p>
            <p className="gc-card__until">{untilLabel(card.expiresAt)}</p>
          </div>
          <QrSvg className="gc-card__qr" text={reserveUrl(card.code)} />
        </div>
        <p className="gc-card__how">Reserva con este código en ricorp.cl/wstyle/reservar</p>
      </div>
    </figure>
  );
}
