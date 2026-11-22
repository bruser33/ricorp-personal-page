import { describe, expect, test } from 'vitest';
import { adjustProblems, costLabel, costProblem, newKey, normalizeCode, ptsLabel, redeemState, redemptionLine, signed, stockProblem } from './util';

describe('SPEC-57 puntos (funciones puras)', () => {
  test('etiquetas de puntos', () => {
    expect(ptsLabel(1)).toBe('1 punto');
    expect(ptsLabel(130)).toBe('130 puntos');
    expect(ptsLabel(1200)).toBe('1.200 puntos');
    expect(signed(15)).toBe('+15');
    expect(signed(-120)).toBe('−120');
    expect(costLabel(120)).toBe('120 PTS');
  });

  test('AC-08 botón Canjear: "Te faltan 70" con saldo 130 y producto de 200', () => {
    expect(redeemState(130, { costPoints: 200, soldOut: false })).toEqual({ kind: 'short', missing: 70, label: 'Te faltan 70' });
    expect(redeemState(130, { costPoints: 120, soldOut: false })).toEqual({ kind: 'ok' });
    expect(redeemState(500, { costPoints: 120, soldOut: true }).kind).toBe('sold_out');
    expect(redeemState(-10, { costPoints: 5, soldOut: false }).kind).toBe('negative');
  });

  test('código de retiro', () => {
    expect(normalizeCode('ws 7kq4m9')).toBe('WS-7KQ4M9');
    expect(normalizeCode('7KQ4M9')).toBe('WS-7KQ4M9');
    expect(normalizeCode('WS-7KQ4M0')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });

  test('estado del canje para el cliente', () => {
    expect(redemptionLine({ status: 'pendiente_retiro', deliveredAt: null, cancelledAt: null, cancelReason: null })).toBe('Por retirar en el local');
    expect(redemptionLine({ status: 'entregado', deliveredAt: '2026-11-18T18:00:00Z', cancelledAt: null, cancelReason: null })).toBe('Entregado el 18 nov 2026');
    expect(redemptionLine({ status: 'anulado', deliveredAt: null, cancelledAt: '2026-11-18T18:00:00Z', cancelReason: 'Sin stock físico' })).toMatch(/Sin stock físico/);
  });

  test('validaciones del panel', () => {
    expect(costProblem('120')).toBeNull();
    expect(costProblem('0')).not.toBeNull();
    expect(costProblem('1,5')).not.toBeNull();
    expect(stockProblem('')).toBeNull();
    expect(stockProblem('-1')).not.toBeNull();
    expect(adjustProblems('10', 'Regalo de cumpleaños')).toEqual({});
    expect(adjustProblems('0', 'abc')).toEqual({ points: expect.any(String), reason: expect.any(String) });
    expect(adjustProblems('-5', 'Corrección')).toEqual({});
  });

  test('clave de idempotencia distinta por confirmación', () => {
    expect(newKey()).not.toBe(newKey());
  });
});
