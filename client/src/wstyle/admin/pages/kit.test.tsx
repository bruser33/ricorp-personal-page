import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DifusionPage from './DifusionPage';
import { StatsView } from './StatsPage';
import type { Stats } from '../api';

// SPEC-58: render estático (sin efectos) de la sección Difusión y de la tabla "Reservas por origen".
const g = globalThis as unknown as { location?: unknown };
let prev: unknown;
beforeAll(() => { prev = g.location; g.location = { origin: 'http://127.0.0.1:5173', pathname: '/wstyle/admin/difusion/', search: '' }; });
afterAll(() => { g.location = prev; });

const UTM = (s: string) => `?utm_source=${s}&amp;utm_medium=kit&amp;utm_campaign=reservas`;

describe('Difusión', () => {
  it('muestra el link limpio, el QR con UTM de cartel y los tres textos con su link', () => {
    const html = renderToStaticMarkup(<DifusionPage />);
    expect(html).toContain('<h1 class="ag-h1">Difusión</h1>');
    expect(html).toContain('data-kit-link="">http://127.0.0.1:5173/wstyle/reservar/</code>');
    expect(html).toContain(`data-qr-url="http://127.0.0.1:5173/wstyle/reservar/${UTM('cartel')}"`);
    expect(html).toContain(`en un minuto: http://127.0.0.1:5173/wstyle/reservar/${UTM('whatsapp')}`);
    expect(html).toContain(`Reserva tu hora ↓ http://127.0.0.1:5173/wstyle/reservar/${UTM('instagram_bio')}`);
    expect(html).toContain('Elige día, hora y barbero en 127.0.0.1:5173/wstyle/reservar');
    expect(html).toContain('Incluir seguimiento (UTM)');
    expect(html).toMatch(/<input type="checkbox" data-utm-toggle="" checked=""/);
    expect(html).toContain('Vista previa del cartel A4');
  });
});

describe('Reservas por origen', () => {
  const base: Stats = {
    from: '2026-11-01', to: '2026-11-30', timezone: 'America/Santiago', total: 0, byStatus: {}, revenue: { totalCLP: 0, onlineCLP: 0, localCLP: 0, pendingCLP: 0 },
    finished: 0, averageTicketCLP: 0, topServices: [], barbers: [], homePct: 0, platformFeeCLP: 0, days: [],
  };
  it('tabla con origen, creadas y terminadas; un origen raro se muestra como texto (CB-02)', () => {
    const html = renderToStaticMarkup(<StatsView s={{ ...base, byOrigin: [{ origin: 'directo', created: 12, finished: 9 }, { origin: 'instagram_bio', created: 7, finished: 5 }, { origin: '<b>x</b>', created: 1, finished: 0 }] }} />);
    expect(html).toContain('Reservas por origen');
    expect(html).toContain('data-origin="instagram_bio"><th scope="row">Instagram (bio)<span class="adm-table__sub">instagram_bio</span></th><td>7</td><td>5</td>');
    expect(html).toContain('Directo (sin link del kit)');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
  it('sin el campo (estadísticas de un barbero) no aparece la tabla', () => {
    expect(renderToStaticMarkup(<StatsView s={base} />)).not.toContain('Reservas por origen');
  });
});
