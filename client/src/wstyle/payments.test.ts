import { describe, expect, it } from 'vitest';
import { boletaProblem, parseBoleta } from './payments';

describe('SPEC-37 N° de boleta (mismo criterio que el server)', () => {
  it('acepta el folio con o sin prefijo y puntos', () => {
    expect(parseBoleta('1001')).toBe('1001');
    expect(parseBoleta(' N° 1.234 ')).toBe('1234');
    expect(parseBoleta('#0042')).toBe('42');
  });
  it('rechaza lo que no es un folio', () => {
    for (const bad of ['', 'abc', '0', '12a', '-5', '12345678901']) expect(parseBoleta(bad)).toBeNull();
  });
  it('vacío es válido al cobrar (la boleta es opcional)', () => {
    expect(boletaProblem('')).toBeNull();
    expect(boletaProblem('12a')).toMatch(/folio/);
  });
});
