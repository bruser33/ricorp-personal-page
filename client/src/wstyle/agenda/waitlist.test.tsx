import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Calendar from './components/Calendar';
import { WaitlistCardView } from './components/WaitlistCard';
import { WaitlistMineView } from './components/WaitlistMine';
import type { Slot, WaitlistEntry } from './api';
import { joinWaitlist } from './waitlist';
import BookingPage from './pages/BookingPage';
import type { AgendaCtx } from './ctx';

// SPEC-54: lista de espera del lado del cliente (render estático + fetch simulado, sin DOM).
const slot: Slot = { startsAt: '2026-11-21T19:00:00.000Z', label: '16:00', professionalIds: ['b1'] };
const entry: WaitlistEntry = {
  id: 'w1', date: '2026-11-21', service: { id: 'corte', name: 'Corte' }, professional: { id: null, name: 'Cualquiera' },
  pref: 'pm', status: 'waiting', statusLabel: 'Esperando', createdAt: '2026-11-19T15:00:00.000Z', notifiedAt: null,
};
const day = (html: string, date: string) => html.match(new RegExp(`<button[^>]*data-date="${date}"[^>]*>`))?.[0] ?? '';

describe('Calendar: día lleno vs. cerrado (AC-01)', () => {
  const html = renderToStaticMarkup(
    <Calendar year={2026} month={11} today="2026-11-19" lastDay="2026-12-19" selected={undefined} onSelect={() => {}} onMonth={() => {}}
      slotsByDay={new Map([['2026-11-20', [slot]], ['2026-11-21', []], ['2026-11-22', []]])} fullDays={new Set(['2026-11-21'])} />,
  );
  it('el día lleno se puede tocar, dice "Lleno" y se anuncia como lista de espera', () => {
    const b = day(html, '2026-11-21');
    expect(b).toContain('is-full');
    expect(b).not.toContain('disabled');
    expect(b).toContain('Lleno, lista de espera');
    expect(html).toContain('ag-cal__full');
  });
  it('el día cerrado sigue deshabilitado ("Sin disponibilidad")', () => {
    const b = day(html, '2026-11-22');
    expect(b).toContain('disabled');
    expect(b).toContain('is-off');
    expect(b).toContain('Sin disponibilidad');
  });
  it('sin fullDays (lista apagada) el día lleno queda como hoy: deshabilitado', () => {
    const off = renderToStaticMarkup(
      <Calendar year={2026} month={11} today="2026-11-19" lastDay="2026-12-19" onSelect={() => {}} onMonth={() => {}} slotsByDay={new Map([['2026-11-21', []]])} />,
    );
    expect(day(off, '2026-11-21')).toContain('disabled');
    expect(off).not.toContain('is-full');
  });
});

describe('WaitlistCard (AC-02 lado cliente)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const view = (result: Parameters<typeof WaitlistCardView>[0]['result']) => renderToStaticMarkup(
    <WaitlistCardView date="2026-11-21" serviceName="Corte" proName="Carlos" canAny pref="pm" onPref={() => {}} onAny={() => {}} busy={false}
      result={result} onSubmit={() => {}} onPickSlot={() => {}} />,
  );

  it('muestra el texto de la spec, el servicio, el barbero con "Cambiar a Cualquiera" y la preferencia', () => {
    const html = view(null);
    expect(html).toContain('No quedan horas libres este día. ¿Te anotamos en la lista de espera?');
    expect(html).toContain('Ojo: no es una reserva.');
    expect(html).toContain('Cambiar a Cualquiera');
    expect(html).toContain('Tarde (desde 14:00)');
    expect(html).toContain('Anotarme');
    expect(html).not.toMatch(/turno/i);
  });

  it('envía el POST con la preferencia y muestra la confirmación', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entry }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await joinWaitlist({ date: '2026-11-21', serviceId: 'corte', professionalId: 'any', pref: 'pm' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/wstyle\/waitlist$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ date: '2026-11-21', serviceId: 'corte', professionalId: 'any', pref: 'pm' });
    expect(r.kind).toBe('done');
    const html = view(r);
    expect(html).toContain('Listo, estás en la lista de espera del sábado, 21 de noviembre');
    expect(html).toContain('Si no te escribimos, ese día no hubo lugar.');
    expect(html).toContain('/wstyle/cuenta/mis-citas/');
  });

  it('CB-10: "Se acaba de liberar una hora" muestra las horas para elegir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'slots_available', message: 'Se acaba de liberar una hora', slots: [slot] }), { status: 409 })));
    const r = await joinWaitlist({ date: '2026-11-21', serviceId: 'corte', professionalId: 'b1', pref: 'all' });
    expect(r).toEqual({ kind: 'slots', slots: [slot] });
    const html = view(r);
    expect(html).toContain('Se acaba de liberar una hora');
    expect(html).toContain('16:00');
  });

  it('un error del server se muestra con su mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'day_list_full', message: 'La lista de este día está completa' }), { status: 409 })));
    const r = await joinWaitlist({ date: '2026-11-21', serviceId: 'corte', professionalId: 'any', pref: 'all' });
    expect(view(r)).toContain('La lista de este día está completa');
  });
});

describe('Mis citas · En lista de espera', () => {
  it('lista día, servicio, barbero, preferencia y estado; "Salir de la lista" solo en las activas', () => {
    const html = renderToStaticMarkup(
      <WaitlistMineView entries={[entry, { ...entry, id: 'w2', status: 'ended', statusLabel: 'Terminó' }]} busy={null} error={null} onLeave={() => {}} />,
    );
    expect(html).toContain('En lista de espera');
    expect(html).toContain('Corte');
    expect(html).toContain('Cualquiera');
    expect(html).toContain('Tarde (desde 14:00)');
    expect(html).toContain('Esperando');
    expect(html).toContain('Terminó');
    expect(html.match(/Salir de la lista/g)).toHaveLength(1);
  });
});

describe('link "Tomar esta hora" sin sesión (RN-05)', () => {
  const g = globalThis as unknown as { location?: unknown };
  let prev: unknown;
  beforeAll(() => { prev = g.location; g.location = { search: '?espera=tok123', pathname: '/wstyle/reservar/', href: 'http://localhost/wstyle/reservar/?espera=tok123' }; });
  afterAll(() => { g.location = prev; });
  it('la puerta de sesión conserva ?espera= en el returnTo', () => {
    const session = { user: null, setUser: () => {}, status: 'ready', facebook: true, google: true, refresh: async () => null, logout: async () => {} } as unknown as AgendaCtx['session'];
    const html = renderToStaticMarkup(<BookingPage ctx={{ session, whatsapp: null, fbReturn: null }} />);
    expect(html).toContain('data-gate=""');
    expect(html).toContain(`/api/auth/google/start?r=${encodeURIComponent('/wstyle/reservar/?espera=tok123')}`);
  });
});
