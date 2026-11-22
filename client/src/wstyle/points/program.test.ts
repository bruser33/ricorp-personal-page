import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadProgram } from './program';

describe('SPEC-57 AC-10 bloque de la landing', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('solo con el programa activo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true }), { status: 200 })));
    expect(await loadProgram('http://api')).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })));
    expect(await loadProgram('http://api')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await loadProgram('http://api')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await loadProgram('http://api')).toBe(false);
  });
});
