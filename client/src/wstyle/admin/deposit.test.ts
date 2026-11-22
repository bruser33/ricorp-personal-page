import { describe, expect, it } from 'vitest';
import { isRut } from './deposit';

describe('SPEC-56 RUT', () => {
  it('valida el dígito verificador', () => {
    expect(isRut('11.111.111-1')).toBe(true);
    expect(isRut('12.345.678-5')).toBe(true);
    expect(isRut('76.543.210-3')).toBe(true);
    expect(isRut('76.543.210-K')).toBe(false);
    expect(isRut('abc')).toBe(false);
  });
});
