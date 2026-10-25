/* TaxDocumentProvider (SPEC-37, alcance 5): quién respalda tributariamente cada venta.

   Fase 1 (gratis, sin certificado ni folios):
   - `voucher`: modelo "No emito boleta cuando recibo un pago electrónico" (Res. SII 176/2020).
     El comprobante de Mercado Pago ES la boleta y MP lo informa al SII. Los pagos en el local
     no tienen voucher: su boleta se emite a mano (app/portal gratuito del SII) y se registra el N°.
   - `manual`: modelo "Siempre emito boleta". Ninguna venta queda respaldada sola; cada pago
     (también los de MP) lleva el N° de la boleta emitida a mano.

   Fase 2: un proveedor con API (LibreDTE, OpenFactura, SimpleFactura, Bsale) implementa la
   misma interfaz (y una cola de emisión); el panel no cambia.

   @typedef {{ channel: 'online' | 'local', mpPaymentId?: string, amountCLP: number, at: Date }} Sale
   @typedef {{ kind: 'voucher_mp' | 'boleta_sii', number: string, provider: string, at: Date }} TaxDoc
   @typedef {object} TaxDocumentProvider
   @property {string} id              valor de SII_TAX_PROVIDER; queda guardado en cada pago (taxModel)
   @property {string} label           nombre para el panel
   @property {string} declaredModel   modelo que hay que tener declarado en el SII
   @property {(sale: Sale) => TaxDoc | null} automaticFor  respaldo automático de la venta (null = queda a mano)
   @property {(sale: Sale) => boolean} acceptsManual       ¿se le puede registrar un N° de boleta? */

/** @type {Record<string, TaxDocumentProvider>} */
export const TAX_DOCUMENT_PROVIDERS = {
  voucher: {
    id: 'voucher',
    label: 'Voucher de Mercado Pago + boleta manual en el local',
    declaredModel: 'No emito boleta cuando recibo un pago electrónico',
    automaticFor: (sale) => (sale.channel === 'online' && sale.mpPaymentId ? { kind: 'voucher_mp', number: String(sale.mpPaymentId), provider: 'voucher', at: sale.at } : null),
    /* Regla 3: nunca una boleta propia sobre un pago con voucher (doble emisión). */
    acceptsManual: (sale) => sale.channel === 'local',
  },
  manual: {
    id: 'manual',
    label: 'Boleta manual en el SII para todas las ventas',
    declaredModel: 'Siempre emito boleta',
    automaticFor: () => null,
    acceptsManual: () => true,
  },
};

export const DEFAULT_TAX_PROVIDER = 'voucher';

/** @returns {TaxDocumentProvider} */
export function createTaxDocumentProvider(env = {}, logger = console) {
  const id = String(env.SII_TAX_PROVIDER || DEFAULT_TAX_PROVIDER).trim().toLowerCase();
  if (Object.hasOwn(TAX_DOCUMENT_PROVIDERS, id)) return TAX_DOCUMENT_PROVIDERS[id];
  logger.warn?.(`[sii] SII_TAX_PROVIDER "${id}" no existe (voucher | manual): se usa "${DEFAULT_TAX_PROVIDER}"`);
  return TAX_DOCUMENT_PROVIDERS[DEFAULT_TAX_PROVIDER];
}

/* Emisor (persona natural, fase 1). El RUT nunca sale del server: el panel solo sabe si está. */
export function emitterInfo(env = {}, provider = TAX_DOCUMENT_PROVIDERS[DEFAULT_TAX_PROVIDER]) {
  const configured = Boolean(String(env.SII_EMITTER_RUT || '').trim());
  return {
    configured,
    label: configured ? 'Emisor configurado' : 'Emisor pendiente',
    name: String(env.SII_EMITTER_NAME || '').trim() || null,
    provider: provider.id,
    providerLabel: provider.label,
    declaredModel: provider.declaredModel,
  };
}
