import { clp } from '../util';
import { SERVICE_FEE_LABEL, serviceFeeHint, pct, type PricingView } from '../pricing';

// Desglose de una cita o de la reserva en curso (SPEC-38). El cliente y el barbero ven UNA "Tarifa de servicio"
// (con la explicación debajo); el admin (`split`) ve sus dos partes. Se usa dentro de un <dl className="ag-breakdown">.
export default function PriceBreakdown({ pricing, serviceName, totalLabel = 'Total', split = false, barberShare = false }: {
  pricing: PricingView; serviceName?: string; totalLabel?: string; split?: boolean; barberShare?: boolean;
}) {
  const fee = pricing.feesIncluded ? (pricing.platformFeeCLP ?? 0) + (pricing.paymentFeeCLP ?? 0) : 0;
  return (
    <>
      <div data-line="service"><dt>{serviceName || 'Servicio'}</dt><dd>{clp.format(pricing.priceCLP)}</dd></div>
      {pricing.surchargeCLP > 0 && <div data-line="home"><dt>Domicilio</dt><dd>{clp.format(pricing.surchargeCLP)}</dd></div>}
      {fee > 0 && !split && (
        <div data-line="service-fee" className="ag-breakdown__fee">
          <dt>{SERVICE_FEE_LABEL}<small className="ag-breakdown__hint">{serviceFeeHint(pricing.platformFeePercent ?? 0)}</small></dt>
          <dd>{clp.format(fee)}</dd>
        </div>
      )}
      {fee > 0 && split && (
        <>
          {(pricing.platformFeeCLP ?? 0) > 0 && <div data-line="platform-fee"><dt>Administración de la plataforma ({pct(pricing.platformFeePercent ?? 0)} %)</dt><dd>{clp.format(pricing.platformFeeCLP ?? 0)}</dd></div>}
          {(pricing.paymentFeeCLP ?? 0) > 0 && <div data-line="payment-fee"><dt>Costo de pagos (Mercado Pago {pct(pricing.paymentFeePercent ?? 0)} %{pricing.paymentFeeVat ? ' + IVA' : ''})</dt><dd>{clp.format(pricing.paymentFeeCLP ?? 0)}</dd></div>}
        </>
      )}
      <div className="ag-breakdown__total" data-line="total"><dt>{totalLabel}</dt><dd>{clp.format(pricing.totalCLP)}</dd></div>
      {barberShare && fee > 0 && <div data-line="barber"><dt>Tu parte (servicio{pricing.surchargeCLP > 0 ? ' + domicilio' : ''})</dt><dd>{clp.format(pricing.barberCLP ?? pricing.priceCLP + pricing.surchargeCLP)}</dd></div>}
    </>
  );
}
