import { describe, expect, it } from 'vitest';
import { durationProblem, monthOf, priceProblem, publishedDiff, sectionFromPath, servicesJsonText, shiftMonth, weekProblems } from './util';

describe('rutas del panel', () => {
  it('cada sección es una carpeta; lo desconocido cae en el inicio', () => {
    expect(sectionFromPath('/wstyle/admin/')).toBe('inicio');
    expect(sectionFromPath('/wstyle/admin/carta/')).toBe('carta');
    expect(sectionFromPath('/wstyle/admin/estadisticas')).toBe('estadisticas');
    expect(sectionFromPath('/wstyle/admin/cualquiera/')).toBe('inicio');
  });
});

describe('CB-08 diferencias entre el HTML publicado y la BD', () => {
  const current = [
    { id: 'corte', name: 'Corte', priceCLP: 15000, active: true, archived: false },
    { id: 'barba', name: 'Barba', priceCLP: 8000, active: true, archived: false },
    { id: 'nino', name: 'Corte niño', priceCLP: 9000, active: true, archived: false },
    { id: 'viejo', name: 'Viejo', priceCLP: 1000, active: false, archived: true },
  ];
  it('detecta precio distinto, servicio nuevo y servicio que ya no se ofrece', () => {
    const published = [{ id: 'corte', name: 'Corte', priceCLP: 12000 }, { id: 'barba', name: 'Barba', priceCLP: 8000 }, { id: 'lavado', name: 'Lavado', priceCLP: 7000 }];
    expect(publishedDiff(published, current)).toEqual([
      { id: 'corte', name: 'Corte', published: 12000, current: 15000 },
      { id: 'nino', name: 'Corte niño', published: null, current: 9000 },
      { id: 'lavado', name: 'Lavado', published: 7000, current: null },
    ]);
  });
  it('igual → sin diferencias', () => {
    expect(publishedDiff(current.slice(0, 3), current)).toEqual([]);
  });
});

describe('exportar services.json', () => {
  it('mismo formato que el archivo del repo: JSON válido, una línea por servicio, mismas claves', () => {
    const text = servicesJsonText([{ id: 'corte', name: 'Corte "pro"', description: 'Clásico', priceCLP: 12000, durationMin: 40 }, { id: 'barba', name: 'Barba', description: '', priceCLP: 8000, durationMin: 25 }]);
    expect(text.split('\n')[1]).toBe('  { "id": "corte", "name": "Corte \\"pro\\"", "description": "Clásico", "priceCLP": 12000, "durationMin": 40 },');
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(Object.keys(parsed[0])).toEqual(['id', 'name', 'description', 'priceCLP', 'durationMin']);
  });
});

describe('validaciones locales (las mismas del server)', () => {
  it('CB-06 precio entero > 0 y duración 5–240 múltiplo de 5', () => {
    expect(priceProblem('12000')).toBeNull();
    for (const v of ['0', '-5', '12000.5', '12.000', '']) expect(priceProblem(v)).not.toBeNull();
    expect(durationProblem('45')).toBeNull();
    for (const v of ['42', '0', '245', 'x']) expect(durationProblem(v)).not.toBeNull();
  });
  it('horario: cierre después de apertura y sin superposición', () => {
    expect(weekProblems([{ weekday: 1, ranges: [{ opens: '10:00', closes: '14:00' }, { opens: '15:00', closes: '20:00' }] }])).toEqual({});
    expect(weekProblems([{ weekday: 2, ranges: [{ opens: '10:00', closes: '14:00' }, { opens: '13:00', closes: '20:00' }] }])[2]).toMatch(/superponen/);
    expect(weekProblems([{ weekday: 3, ranges: [{ opens: '20:00', closes: '10:00' }] }])[3]).toMatch(/después/);
  });
  it('rangos de mes', () => {
    expect(monthOf('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
  });
});
