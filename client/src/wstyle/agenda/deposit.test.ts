import { describe, expect, it } from 'vitest';
import { bankText, countdown, depositChips, depositTag, receiptProblem, restLine, serverOffset } from './deposit';
import type { Deposit } from './api';

const dep = (over: Partial<Deposit> = {}): Deposit => ({ amountCLP: 5000, status: 'por_pagar', statusLabel: '', deadlineAt: '2026-11-02T15:42:00.000Z', deadlineLabel: '12:42', restCLP: 18000, restIfPaidCLP: 13000, hasReceipt: false, ...over });

describe('SPEC-56 seña', () => {
  it('cuenta regresiva con la hora del server, no la del teléfono', () => {
    const phone = Date.parse('2026-11-02T15:00:00Z');
    // El teléfono está 10 min adelantado: el server dice 14:50 → quedan 52 min, no 42.
    const off = serverOffset('2026-11-02T14:50:00.000Z', phone);
    expect(countdown('2026-11-02T15:42:00.000Z', phone, off).label).toBe('52:00');
    expect(countdown('2026-11-02T15:42:00.000Z', phone + 52 * 60_000 - 2000, off).label).toBe('00:02');
    expect(countdown('2026-11-02T15:42:00.000Z', phone + 60 * 60_000, off).expired).toBe(true);
    expect(countdown('2026-11-02T17:00:00.000Z', phone, 0).label).toBe('2:00:00');
  });

  it('"Copiar todo" con los datos, el monto y la referencia', () => {
    const t = bankText({ holder: 'Joe', rut: '11.111.111-1', bank: 'BancoEstado', accountType: 'rut', accountTypeLabel: 'Cuenta RUT', accountNumber: '123', email: 'a@b.cl' }, 5000, 'WS-K7QM');
    expect(t).toContain('RUT: 11.111.111-1');
    expect(t).toContain('Comentario: WS-K7QM');
    expect(t).toMatch(/Monto: \$\s?5\.000/);
  });

  it('chips, etiqueta de agenda y "Resta por cobrar"', () => {
    expect(depositChips(dep({ status: 'en_revision' }), 'pendiente')).toEqual({ hora: { tone: 'ok', text: 'Guardada' }, sena: { tone: 'wait', text: 'En revisión' } });
    expect(depositTag(dep(), 'pendiente_sena')).toBe('Esperando seña · vence 12:42');
    expect(depositTag(dep({ status: 'en_revision' }), 'pendiente')).toBe('Seña en revisión');
    expect(depositTag(dep({ status: 'confirmada' }), 'confirmada')).toMatch(/^✓ Seña \$\s?5\.000$/);
    expect(restLine(dep({ status: 'confirmada', restCLP: 13000 }))).toMatch(/^Resta por cobrar \$\s?13\.000 \(seña de \$\s?5\.000 ya pagada\)$/);
    expect(restLine(null)).toBeNull();
  });

  it('valida tamaño y tipo antes de subir', () => {
    expect(receiptProblem({ size: 6 * 1024 * 1024, type: 'image/jpeg', name: 'a.jpg' })).toMatch(/5 MB/);
    expect(receiptProblem({ size: 100, type: 'application/x-msdownload', name: 'a.exe' })).toMatch(/captura/);
    expect(receiptProblem({ size: 100, type: '', name: 'IMG_1.HEIC' })).toBeNull();
    expect(receiptProblem({ size: 100, type: 'application/pdf', name: 'c.pdf' })).toBeNull();
  });
});
