import { describe, expect, it } from 'vitest';
import { blockBox, freeCells, gridRange, minutesOfDay, mondayOf, visibleDays, WEEKDAYS } from './util';

// Lunes 2 de noviembre de 2026 en America/Santiago (UTC-3 en verano).
const iso = (hhmm: string, date = '2026-11-02') => new Date(`${date}T${hhmm}:00-03:00`).toISOString();

describe('pro/util', () => {
  it('minutos del día en la zona del local', () => {
    expect(minutesOfDay(iso('10:30'))).toBe(630);
    expect(minutesOfDay(iso('00:00'))).toBe(0);
  });

  it('rango de la grilla: del primer horario de apertura al último cierre, con margen para citas fuera', () => {
    const days = [
      { date: '2026-11-02', shop: { opens: '10:00', closes: '20:00' }, windows: [], appointments: [] },
      { date: '2026-11-07', shop: { opens: '10:00', closes: '18:00' }, windows: [], appointments: [] },
    ];
    expect(gridRange(days)).toEqual({ startMin: 600, endMin: 1200 });
    const late = [{ ...days[0], appointments: [{ startsAt: iso('20:15'), endsAt: iso('21:00'), status: 'confirmada' }] }];
    expect(gridRange(late)).toEqual({ startMin: 600, endMin: 1260 });
    expect(gridRange([{ date: '2026-11-08', shop: null, windows: [], appointments: [] }])).toEqual({ startMin: 600, endMin: 1200 });
  });

  it('huecos libres de 30 min: dentro de las ventanas, sin pisar citas activas y desde ahora', () => {
    const day = {
      date: '2026-11-02',
      shop: { opens: '10:00', closes: '20:00' },
      windows: [{ startsAt: iso('12:00'), endsAt: iso('14:00') }],
      appointments: [
        { startsAt: iso('12:30'), endsAt: iso('13:10'), status: 'confirmada' },
        { startsAt: iso('13:30'), endsAt: iso('14:00'), status: 'cancelada' },
      ],
    };
    expect(freeCells(day, Date.parse(iso('09:00'))).map((c) => c.label)).toEqual(['12:00', '13:30']);
    expect(freeCells(day, Date.parse(iso('12:10'))).map((c) => c.label)).toEqual(['13:30']);
  });

  it('caja de un bloque en la grilla', () => {
    expect(blockBox({ startsAt: iso('12:30'), endsAt: iso('13:10') }, 600, 2)).toEqual({ top: 300, height: 80 });
  });

  it('días visibles: día, 3 días o semana (lunes a domingo)', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(visibleDays('2026-11-05', 'day')).toEqual(['2026-11-05']);
    expect(visibleDays('2026-11-05', '3days')).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(visibleDays('2026-11-05', 'week')[0]).toBe('2026-11-02');
    expect(visibleDays('2026-11-05', 'week')).toHaveLength(7);
    expect(WEEKDAYS[0]).toEqual({ n: 1, short: 'Lun', long: 'lunes' });
  });
});
