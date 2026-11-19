import { describe, expect, it } from 'vitest';
import { mergeSelection, normalizeOrigin, selectionFromQuery, selectionToQuery } from './util';

// SPEC-58 AC-06 / RN-03 / CB-01 / CB-02: el origen (utm_source) del link del kit de difusión.
describe('origen de la reserva', () => {
  it('RN-03 se normaliza: minúsculas, [a-z0-9_-], máx. 40; inválido → directo', () => {
    expect(normalizeOrigin('Instagram_Bio')).toBe('instagram_bio');
    expect(normalizeOrigin('tiktok')).toBe('tiktok');
    expect(normalizeOrigin('x'.repeat(200))).toBe('x'.repeat(40));
    for (const bad of [null, undefined, '', '<script>alert(1)</script>', 'a b', 'ñ']) expect(normalizeOrigin(bad)).toBe('directo');
  });

  it('se lee de ?utm_source= y viaja en la URL de vuelta del login (CB-01)', () => {
    expect(selectionFromQuery('?utm_source=Instagram_Bio&utm_medium=kit&utm_campaign=reservas')).toEqual({ origin: 'instagram_bio' });
    expect(selectionFromQuery('?utm_source=%3Cscript%3E')).toEqual({ origin: 'directo' });
    expect(selectionFromQuery('?servicio=corte')).toEqual({ serviceId: 'corte' });
    const q = selectionToQuery({ serviceId: 'corte', professionalId: 'any', origin: 'cartel' });
    expect(selectionFromQuery('?' + q)).toEqual({ serviceId: 'corte', professionalId: 'any', origin: 'cartel' });
  });

  it('sobrevive a la puerta de sesión: el guardado se conserva si la URL no trae origen', () => {
    // Entra por el cartel; elige servicio; vuelve del login (URL con la selección, sin utm porque el link era viejo).
    expect(mergeSelection({ serviceId: 'corte' }, { origin: 'cartel' })).toEqual({ serviceId: 'corte', origin: 'cartel' });
    // Recarga la página con solo el UTM: no se pierde lo ya elegido.
    expect(mergeSelection({ origin: 'cartel' }, { serviceId: 'corte', professionalId: 'b1' })).toEqual({ serviceId: 'corte', professionalId: 'b1', origin: 'cartel' });
    // La URL pisa el origen guardado.
    expect(mergeSelection({ origin: 'whatsapp' }, { origin: 'cartel' })).toEqual({ origin: 'whatsapp' });
    // Sin origen en ningún lado: no se inventa (el server pone "directo").
    expect(mergeSelection({}, {})).toEqual({});
    // Un servicio nuevo en la URL descarta la selección guardada, pero no el origen.
    expect(mergeSelection({ serviceId: 'barba' }, { serviceId: 'corte', professionalId: 'b1', origin: 'cartel' })).toEqual({ serviceId: 'barba', origin: 'cartel' });
  });
});
