import { describe, expect, it } from 'vitest';
import { blockBox, effectiveDay, freeCells, gapFrom, gridRange, groupFree, minutesOfDay, mondayOf, nextHalfHour, offsInDay, visibleDays, WEEKDAYS } from './util';

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

  // SPEC-55 AC-01: huecos consecutivos se agrupan; una cita o una ausencia en medio los separa.
  it('agrupa huecos libres consecutivos y respeta citas y ausencias en medio', () => {
    const day = {
      date: '2026-11-02', shop: { opens: '10:00', closes: '20:00' },
      // Ventanas 12:00–14:00 y 15:00–18:00 (ausencia 14:00–15:00), cita 16:00–16:40.
      windows: [{ startsAt: iso('12:00'), endsAt: iso('14:00') }, { startsAt: iso('15:00'), endsAt: iso('18:00') }],
      appointments: [{ startsAt: iso('16:00'), endsAt: iso('16:40'), status: 'confirmada' }],
    };
    const groups = groupFree(freeCells(day, Date.parse(iso('09:00'))));
    expect(groups.map((g) => g.label)).toEqual(['Libre 12:00–14:00', 'Libre 15:00–16:00', 'Libre 17:00–18:00']);
    expect(groups[0].cells.map((c) => c.label)).toEqual(['12:00', '12:30', '13:00', '13:30']);
    // Tocar 15:30 → quedan 30 min hasta la cita.
    expect(gapFrom(groups, iso('15:30'))).toBe(30);
    expect(gapFrom(groups, iso('12:00'))).toBe(120);
    expect(gapFrom(groups, iso('14:00'))).toBe(0);
    // Un solo hueco y ninguno.
    expect(groupFree([{ startsAt: iso('12:00'), label: '12:00' }]).map((g) => g.label)).toEqual(['Libre 12:00–12:30']);
    expect(groupFree([])).toEqual([]);
  });

  it('ausencias recortadas al día y próxima media hora', () => {
    const offs = [
      { id: 'a', startsAt: iso('13:00'), endsAt: iso('14:00'), reason: 'Almuerzo' },
      { id: 'b', startsAt: iso('18:00', '2026-11-01'), endsAt: iso('12:00', '2026-11-03'), reason: 'Viaje' },
      { id: 'c', startsAt: iso('10:00', '2026-11-05'), endsAt: iso('11:00', '2026-11-05'), reason: '' },
    ];
    const out = offsInDay(offs, '2026-11-02');
    expect(out.map((o) => o.id)).toEqual(['a', 'b']);
    expect(out[1].from).toBe(iso('00:00'));
    expect(out[1].to).toBe(iso('00:00', '2026-11-03'));
    expect(nextHalfHour(Date.parse(iso('13:10')))).toBe(iso('13:30'));
    expect(nextHalfHour(Date.parse(iso('13:30')))).toBe(iso('13:30'));
  });

  it('un "no vino" ocupa solo hasta que se marcó y el resto queda reservable', () => {
    const day = {
      date: '2026-11-02', shop: { opens: '10:00', closes: '20:00' },
      windows: [{ startsAt: iso('12:00'), endsAt: iso('14:00') }],
      appointments: [{ startsAt: iso('12:00'), endsAt: iso('13:00'), status: 'no_asistio', heldUntil: iso('12:30') }],
    };
    const { appointments, forFree } = effectiveDay(day);
    expect(appointments[0].endsAt).toBe(iso('12:30'));
    expect(freeCells(forFree, Date.parse(iso('12:20'))).map((c) => c.label)).toEqual(['12:30', '13:00', '13:30']);
    // Sin heldUntil (cita antigua) se dibuja completa.
    const old = effectiveDay({ ...day, appointments: [{ ...day.appointments[0], heldUntil: null }] });
    expect(old.appointments[0].endsAt).toBe(iso('13:00'));
  });

  it('cambio de hora: el día sin medianoche igual dibuja su parte de una ausencia larga', () => {
    // 6-sep-2026: en Chile el reloj salta de 24:00 a 01:00 (UTC-4 → UTC-3).
    const off = { id: 'x', startsAt: '2026-09-05T16:00:00.000Z', endsAt: '2026-09-07T15:00:00.000Z', reason: 'Viaje' };
    const [part] = offsInDay([off], '2026-09-06');
    expect(part.from).toBe('2026-09-06T04:00:00.000Z');
    expect(part.to).toBe('2026-09-07T03:00:00.000Z');
  });
});
