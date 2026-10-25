import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BookingPage from './pages/BookingPage';
import type { AgendaCtx } from './ctx';
import type { User } from './api';

// SPEC-38 RN-01/RN-02 (AC-02): /wstyle/reservar/ pide la cuenta ANTES del paso 1 y el deep link viaja en el
// returnTo de Facebook/Google. Render estático (sin efectos): lo que ve la persona al llegar.
const session = (user: User | null, over: Partial<AgendaCtx['session']> = {}): AgendaCtx['session'] => ({
  user, setUser: () => {}, status: 'ready', facebook: true, google: true, refresh: async () => user, logout: async () => {}, ...over,
} as AgendaCtx['session']);
const ctx = (s: AgendaCtx['session']): AgendaCtx => ({ session: s, whatsapp: null, fbReturn: null });
const client: User = { id: 'u1', name: 'Ana Pérez', email: 'ana@clientes.test', emailVerified: true, phone: null, roles: ['client'], providers: ['google'] };

const g = globalThis as unknown as { location?: unknown };
let prev: unknown;
beforeAll(() => { prev = g.location; g.location = { search: '?servicio=corte&barbero=b1', pathname: '/wstyle/reservar/', href: 'http://localhost/wstyle/reservar/?servicio=corte&barbero=b1' }; });
afterAll(() => { g.location = prev; });

describe('puerta de sesión de la reserva', () => {
  it('sin sesión: AuthPanel con correo, Facebook y Google; ningún paso del asistente', () => {
    const html = renderToStaticMarkup(<BookingPage ctx={ctx(session(null))} />);
    expect(html).toContain('data-gate=""');
    expect(html).toContain('Para agendar, primero entra a tu cuenta');
    expect(html).toContain('Continuar con email');
    expect(html).toContain('Continuar con Google');
    expect(html).toContain('Continuar con Facebook');
    expect(html).not.toContain('ag-steps');
    expect(html).not.toContain('Servicio y barbero');
  });

  it('el deep link (?servicio=corte&barbero=b1) viaja en el returnTo de Google y Facebook', () => {
    const html = renderToStaticMarkup(<BookingPage ctx={ctx(session(null))} />);
    const back = encodeURIComponent('/wstyle/reservar/?servicio=corte&barbero=b1');
    expect(html).toContain(`/api/auth/google/start?r=${back}`.replace(/&/g, '&amp;'));
    expect(html).toContain(`/api/auth/facebook/start?r=${back}`.replace(/&/g, '&amp;'));
  });

  it('mientras se consulta la sesión no se muestra nada del asistente', () => {
    const html = renderToStaticMarkup(<BookingPage ctx={ctx(session(null, { status: 'loading' }))} />);
    expect(html).toContain('Cargando…');
    expect(html).not.toContain('data-gate');
  });

  it('barbero sin perfil de cliente: "Agendar como cliente" en la puerta', () => {
    const html = renderToStaticMarkup(<BookingPage ctx={ctx(session({ ...client, roles: ['barber'] }))} />);
    expect(html).toContain('Agendar como cliente');
    expect(html).not.toContain('ag-steps');
  });

  it('con sesión de cliente: sin puerta (el asistente carga la agenda)', () => {
    const html = renderToStaticMarkup(<BookingPage ctx={ctx(session(client))} />);
    expect(html).not.toContain('data-gate');
    expect(html).toContain('Cargando la agenda…');
  });
});
