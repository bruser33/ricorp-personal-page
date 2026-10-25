import { describe, expect, it } from 'vitest';
import { payView, payTotalLabel } from './pay';

const appt = (status: string, payment: { method: string; status: string }) => ({ status, payment });

describe('agenda/pay (SPEC-35)', () => {
  it('pago en el local: sin panel de pago en línea', () => {
    expect(payView(appt('pendiente', { method: 'local', status: 'pendiente' }), null, false)).toBe('none');
  });

  it('vuelta del checkout: nunca confía en ?pago=, muestra "confirmando" hasta que el server lo diga (AC-08)', () => {
    const waiting = appt('pendiente_pago', { method: 'online', status: 'pendiente' });
    expect(payView(waiting, 'approved', false)).toBe('confirming');
    expect(payView(waiting, 'pending', false)).toBe('confirming');
    expect(payView(waiting, 'failure', false)).toBe('confirming');
    // Pasó el tiempo de espera sin noticias: "approved" no se cree → vuelve a "falta pagar".
    expect(payView(waiting, 'approved', true)).toBe('due');
    expect(payView(waiting, 'failure', true)).toBe('failed');
    expect(payView(waiting, null, false)).toBe('due');
    expect(payView(waiting, 'error', false)).toBe('due');
  });

  it('estados del server: en proceso, rechazado, pagado, reembolsos, vencida', () => {
    expect(payView(appt('pendiente_pago', { method: 'online', status: 'en_proceso' }), null, true)).toBe('confirming');
    expect(payView(appt('pendiente_pago', { method: 'online', status: 'rechazado' }), 'approved', false)).toBe('failed');
    expect(payView(appt('pendiente', { method: 'online', status: 'pagado' }), 'approved', false)).toBe('paid');
    expect(payView(appt('cancelada', { method: 'online', status: 'reembolso_pendiente' }), null, false)).toBe('refund_pending');
    expect(payView(appt('cancelada', { method: 'online', status: 'reembolsado' }), null, false)).toBe('refunded');
    expect(payView(appt('cancelada', { method: 'online', status: 'pendiente' }), null, false)).toBe('expired');
    expect(payView(appt('cancelada', { method: 'online', status: 'rechazado' }), null, false)).toBe('expired');
  });

  it('etiqueta del total según la forma de pago', () => {
    expect(payTotalLabel(appt('pendiente', { method: 'local', status: 'pendiente' }))).toBe('Total · pago en el local');
    expect(payTotalLabel(appt('pendiente', { method: 'online', status: 'pagado' }))).toBe('Total · pagado en línea');
    expect(payTotalLabel(appt('pendiente_pago', { method: 'online', status: 'pendiente' }))).toBe('Total · a pagar en línea');
    expect(payTotalLabel(appt('cancelada', { method: 'online', status: 'reembolsado' }))).toBe('Total · reembolsado');
  });
});
