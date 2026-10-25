import { afterEach, describe, expect, it, vi } from 'vitest';
import { takeFacebookParams } from './session';

// Vuelta del inicio social (SPEC-32 Facebook, SPEC-38 Google): lee ?fb= / ?gg= y los limpia de la URL sin tocar la
// selección de la reserva (?servicio=…).
function at(href: string) {
  const replaced: string[] = [];
  vi.stubGlobal('location', new URL(href));
  vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) });
  return replaced;
}

afterEach(() => vi.unstubAllGlobals());

describe('takeFacebookParams', () => {
  it('Google: provider google, conserva la selección y limpia gg/t/email', () => {
    const replaced = at('http://localhost:5173/wstyle/reservar/?servicio=corte&gg=vincular&t=tok&email=ana%40gmail.com');
    expect(takeFacebookParams()).toEqual({ fb: 'vincular', provider: 'google', t: 'tok', email: 'ana@gmail.com', name: null });
    expect(replaced).toEqual(['/wstyle/reservar/?servicio=corte']);
  });

  it('Facebook sigue igual (provider facebook)', () => {
    at('http://localhost:5173/wstyle/cuenta/?fb=error');
    expect(takeFacebookParams()).toMatchObject({ fb: 'error', provider: 'facebook' });
  });

  it('sin parámetros → null', () => {
    at('http://localhost:5173/wstyle/reservar/?servicio=corte');
    expect(takeFacebookParams()).toBeNull();
  });
});
