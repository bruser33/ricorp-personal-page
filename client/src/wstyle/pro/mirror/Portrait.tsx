import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { fadePhoto, paintLines, paintStroke, type Design, type Photo, type Point, type Stroke, type View } from './photo';

export type Tool = 'ver' | 'dibujar' | 'mover' | 'zona' | 'tono';
type Props = {
  photo: Photo; view: View; design: Design; label: string; tool?: Tool; width?: number; hideLines?: boolean;
  outline?: Point[]; onPoint?: (point: Point) => void; onLines?: (lines: Stroke[]) => void;
};
export default function Portrait({ photo, view, design, label, tool = 'ver', width = 0.012, hideLines = false, outline, onPoint, onLines }: Props) {
  const base = useMemo(() => fadePhoto(photo, view, design.height, design.closeness), [photo, view, design.height, design.closeness]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lines = design.lines[view];
  const gesture = useRef<{ id: number; start: Point; points: Point[]; at: number } | null>(null);
  const [preview, setPreview] = useState<Stroke[] | null>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.drawImage(tool === 'zona' || tool === 'tono' ? photo.image : base, 0, 0);
    if (!hideLines && tool !== 'zona' && tool !== 'tono') paintLines(ctx, preview ?? lines, photo.tone);
    if (tool === 'zona' && outline?.length) {
      paintStroke(ctx, outline, 0.006, '#61ecdb');
      ctx.fillStyle = '#61ecdb';
      for (const p of outline) {
        ctx.beginPath(); ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, Math.max(3, ctx.canvas.width * .007), 0, 2 * Math.PI); ctx.fill();
      }
    }
  }, [photo, base, lines, preview, hideLines, tool, outline]);
  function point(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (tool === 'ver' || e.button !== 0 || gesture.current) return;
    const p = point(e);
    if (tool === 'zona' || tool === 'tono') { onPoint?.(p); return; }
    let at = -1;
    if (tool === 'mover') {
      let closest = 0.09 * Math.min(photo.image.width, photo.image.height);
      lines.forEach((line, i) => line.points.forEach(q => {
        const distance = Math.hypot((q.x - p.x) * photo.image.width, (q.y - p.y) * photo.image.height);
        if (distance <= closest) { closest = distance; at = i; }
      }));
      if (at < 0) return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, start: p, points: [p], at };
  }
  function update(e: PointerEvent<HTMLCanvasElement>, end: boolean) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const p = point(e);
    let next: Stroke[];
    if (tool === 'mover') {
      const original = lines[g.at];
      if (!original) return;
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      next = lines.map((line, i) => i !== g.at ? line : { ...line, points: line.points.map(q => ({ x: q.x + dx, y: q.y + dy })) });
    } else {
      g.points.push(p);
      next = [...lines, { width, points: [...g.points] }];
    }
    if (end) { gesture.current = null; setPreview(null); onLines?.(next); }
    else setPreview(next);
  }
  return <canvas className={'mirror-photo' + (tool === 'ver' ? '' : ' is-editing')} ref={canvas} width={photo.image.width} height={photo.image.height}
    role="img" aria-label={label} onPointerDown={down} onPointerMove={e => update(e, false)}
    onPointerUp={e => update(e, true)} onPointerCancel={() => { gesture.current = null; setPreview(null); }} />;
}
