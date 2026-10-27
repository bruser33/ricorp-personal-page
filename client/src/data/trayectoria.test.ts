import { describe, expect, it } from 'vitest';
import { hitosOrdenados, trayectoria, type HitoTrayectoria } from './trayectoria';

/* SPEC-41: los hitos reales que eran cortos llevan un post del mismo largo que
   W Style / Haru / Invasión UFPS (5 párrafos, 400–700 palabras). */
const IDS_EXTENDIDOS = [
  'workana-freelancer',
  'youtube-proyectos-informaticos',
  'tuapp-2014-smartcorp',
  'tuapp-2013-r2d2',
  // SPEC-46: banca y logística.
  'banco-de-chile-3it',
  'banco-security-pagos',
  'cargo-ex-logistica',
  'trabajo-actual-2025',
] as const;

const hito = (id: string): HitoTrayectoria => {
  const h = trayectoria.find((x) => x.id === id);
  if (!h) throw new Error(`No existe el hito ${id}`);
  return h;
};

const palabras = (texto: string) => texto.split(/\s+/).filter(Boolean).length;

describe('SPEC-41 · escritos de la Trayectoria con largo de post', () => {
  describe.each(IDS_EXTENDIDOS)('%s', (id) => {
    const h = hito(id);
    const parrafos = h.parrafos ?? [];

    it('AC1: tiene 5 párrafos y entre 400 y 700 palabras en total', () => {
      expect(parrafos).toHaveLength(5);
      const total = parrafos.reduce((n, p) => n + palabras(p), 0);
      expect(total).toBeGreaterThanOrEqual(400);
      expect(total).toBeLessThanOrEqual(700);
    });

    it('AC1: conserva la descripcion corta (tarjeta / fallback)', () => {
      expect(h.descripcion?.trim().length ?? 0).toBeGreaterThan(0);
    });

    it('AC2: cada párrafo termina en punto o "!" y el último cierra con ¡…!', () => {
      for (const p of parrafos) expect(p.trim()).toMatch(/[.!]$/);
      expect(parrafos.at(-1)).toMatch(/¡[^!]+!/);
    });
  });

  /* AC3: los nombres de clientes de Workana no se publican (TyC + privacidad).
     No sabemos (ni queremos guardar) los nombres, así que se controla al revés:
     toda palabra con mayúscula que NO abre una oración tiene que ser una
     tecnología/lugar conocido; un nombre propio nuevo hace fallar el test. Y las
     citas de reseñas solo pueden ser las que ya estaban en `descripcion`. */
  describe('AC3: Workana sin nombres de clientes', () => {
    const h = hito('workana-freelancer');
    const texto = (h.parrafos ?? []).join(' ');
    const PERMITIDAS = new Set([
      'Workana', 'Latinoamérica', 'Android', 'iOS', 'Three.js', 'JavaScript', 'Avanzado',
      'React', 'Native', 'Angular', 'DevSkiller', 'Chile', 'Colombia', 'YouTube', 'Unity', 'Node',
    ]);

    it('no aparece ningún nombre propio fuera de la lista de tecnologías/lugares', () => {
      const sueltas: string[] = [];
      // Palabras con mayúscula precedidas por algo que no es inicio de oración.
      const re = /(?<![.!?¡¿"(:]\s)(?<!^)(?<=\s)([A-ZÁÉÍÓÚÑ][\p{L}.]*[\p{L}])/gu;
      for (const m of texto.matchAll(re)) if (!PERMITIDAS.has(m[1])) sueltas.push(m[1]);
      expect(sueltas).toEqual([]);
    });

    it('las citas de reseñas son solo las que ya estaban en la descripcion', () => {
      const citas = [...texto.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const c of citas) expect(h.descripcion).toContain(c);
    });
  });
});

/* SPEC-46 AC1/AC2: los tres hitos de banca y logística van entre Haru e
   Invasión UFPS (más nuevo arriba), con banner propio y 2 mockups, y no
   entran al slider de Proyectos. */
describe('SPEC-46 · banca y logística', () => {
  const ids = hitosOrdenados().map((h) => h.id);
  const pos = (id: string) => ids.indexOf(id);

  it('AC1: Haru > Banco de Chile > Banco Security > Cargo Ex > Invasión UFPS', () => {
    const orden = ['haru', 'banco-de-chile-3it', 'banco-security-pagos', 'cargo-ex-logistica', 'tesis-invasion-ufps'];
    for (const id of orden) expect(pos(id)).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < orden.length; i++) expect(pos(orden[i - 1])).toBeLessThan(pos(orden[i]));
  });

  it.each(['banco-de-chile-3it', 'banco-security-pagos', 'cargo-ex-logistica'])('AC2: %s abre en modo post con banner y 2 mockups', (id) => {
    const h = hito(id);
    expect(h.imagen).toBe(`figma-frames/${id}-banner.webp`);
    expect(h.mockups).toEqual([`figma-frames/${id}-1.webp`, `figma-frames/${id}-2.webp`]);
    expect(h.destacado).toBeFalsy();
  });
});
