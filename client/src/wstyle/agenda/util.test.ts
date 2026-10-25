import { describe, expect, it } from 'vitest';
import { buildIcs, clMobile, localDate, localTime, monthGrid, prettyPhone, selectionFromQuery, selectionToQuery, weakPassword } from './util';

describe('agenda/util', () => {
  it('normaliza celulares chilenos a E.164 y rechaza el resto', () => {
    expect(clMobile('+56 9 1234 5678')).toBe('+56912345678');
    expect(clMobile('9 1234 5678')).toBe('+56912345678');
    expect(clMobile('0056912345678')).toBe('+56912345678');
    expect(clMobile('+1 555 0100')).toBeNull();
    expect(clMobile('22123456')).toBeNull();
    expect(prettyPhone('+56912345678')).toBe('+56 9 1234 5678');
  });

  it('contraseña: 8+ caracteres, letra y número, distinta del email', () => {
    expect(weakPassword('clave1234')).toBe(false);
    expect(weakPassword('corta1')).toBe(true);
    expect(weakPassword('sinnumeros')).toBe(true);
    expect(weakPassword('a1b2c3d4@x.cl', 'a1b2c3d4@x.cl')).toBe(true);
  });

  it('el mes empieza el lunes (LU…DO): noviembre 2026 parte en domingo', () => {
    const g = monthGrid(2026, 11);
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(g.filter(Boolean)).toHaveLength(30);
  });

  it('fechas y horas en America/Santiago (24 h)', () => {
    expect(localDate('2026-11-02T02:30:00Z')).toBe('2026-11-01');
    expect(localTime('2026-11-02T15:00:00Z')).toBe('12:00');
  });

  it('la selección hace ida y vuelta por la URL', () => {
    const q = selectionToQuery({ serviceId: 'corte', professionalId: 'any', startsAt: '2026-11-02T15:00:00.000Z', mode: 'home' });
    expect(selectionFromQuery('?' + q)).toEqual({ serviceId: 'corte', professionalId: 'any', startsAt: '2026-11-02T15:00:00.000Z', date: '2026-11-02', mode: 'home' });
  });

  it('.ics con inicio/fin en UTC', () => {
    const ics = buildIcs({ id: 'abc', startsAt: '2026-11-02T15:00:00.000Z', endsAt: '2026-11-02T15:40:00.000Z', title: 'Corte, WS Style', location: 'Calle Falsa 123', url: 'https://ricorp.cl/wstyle/cita/?id=abc' }, new Date('2026-11-01T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261102T150000Z');
    expect(ics).toContain('DTEND:20261102T154000Z');
    expect(ics).toContain('SUMMARY:Corte\\, WS Style');
  });
});
