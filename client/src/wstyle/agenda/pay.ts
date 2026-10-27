// Pago en línea de la cita (SPEC-35): qué mostrar en /wstyle/cita/ según lo que dice el SERVER. El `?pago=` con que
// vuelve el checkout de Mercado Pago solo decide si esperar unos segundos ("Estamos confirmando tu pago…"); nunca
// marca nada como pagado (RN-07 / CB-05).

export type PayView = 'none' | 'due' | 'confirming' | 'failed' | 'paid' | 'refund_pending' | 'refunded' | 'chargeback' | 'expired';
type PayLike = { status: string; payment: { method: string; status: string } };

// `returning`: valor de ?pago= ('approved' | 'pending' | 'failure' | 'error' | null). `waited`: ya se esperó la
// respuesta del server el tiempo razonable sin novedades.
export function payView(appt: PayLike, returning: string | null, waited: boolean): PayView {
  const { method, status } = appt.payment;
  if (method !== 'online') return 'none';
  if (status === 'pagado') return 'paid';
  if (status === 'reembolso_pendiente') return 'refund_pending';
  if (status === 'reembolsado') return 'refunded';
  if (status === 'contracargo') return 'chargeback';
  if (appt.status !== 'pendiente_pago') return appt.status === 'cancelada' || appt.status === 'expirada' ? 'expired' : 'none';
  if (status === 'en_proceso') return 'confirming';
  if (status === 'rechazado') return 'failed';
  const back = returning === 'approved' || returning === 'pending' || returning === 'failure';
  if (back && !waited) return 'confirming';
  if (back && returning === 'failure') return 'failed';
  return 'due';
}

export function payTotalLabel(appt: PayLike): string {
  const { method, status } = appt.payment;
  if (method !== 'online') return 'Total · pago en el local';
  if (status === 'pagado' || status === 'contracargo') return 'Total · pagado en línea';
  if (status === 'reembolsado') return 'Total · reembolsado';
  if (status === 'reembolso_pendiente') return 'Total · por reembolsar';
  return 'Total · a pagar en línea';
}
