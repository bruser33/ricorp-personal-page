/* Programa de puntos y canje de productos de WS Style (SPEC-57). Todo es por negocio
   (businessId) y por cliente (userId global). El libro (PointsEntry) solo se inserta:
   no hay endpoint para editar ni borrar movimientos. */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const ENTRY_TYPES = ['ganado', 'canjeado', 'devuelto', 'revertido', 'ajuste'];
export const REDEMPTION_STATUSES = ['pendiente_retiro', 'entregado', 'anulado'];

/* Configuración del programa por negocio. Apagado por defecto (asunción 1). */
const LoyaltySettingsSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    /* RN-02: puntos por cada $1.000 del precio del servicio (entero 0–100). */
    pointsPer1000: { type: Number, default: 1 },
  },
  { timestamps: true }
);
export const LoyaltySettings = model('LoyaltySettings', LoyaltySettingsSchema);

/* Libro de puntos (ledger). El saldo es la suma de `points`. */
const PointsEntrySchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    type: { type: String, enum: ENTRY_TYPES, required: true },
    points: { type: Number, required: true },
    /* Referencia: la cita (ganado / revertido) o el canje (canjeado / devuelto). */
    appointmentId: { type: ObjectId, default: undefined },
    redemptionId: { type: ObjectId, default: undefined },
    reason: String,
    by: { type: String, enum: ['system', 'client', 'barber', 'admin'], default: 'system' },
    byUserId: ObjectId,
    at: { type: Date, required: true },
  },
  { versionKey: false }
);
PointsEntrySchema.index({ businessId: 1, userId: 1, at: -1 });
/* RN-03: como máximo un `ganado` y un `revertido` por cita. */
PointsEntrySchema.index({ appointmentId: 1, type: 1 }, { unique: true, name: 'una_vez_por_cita', partialFilterExpression: { appointmentId: { $type: 'objectId' } } });
/* Un `canjeado` y un `devuelto` por canje. */
PointsEntrySchema.index({ redemptionId: 1, type: 1 }, { unique: true, name: 'una_vez_por_canje', partialFilterExpression: { redemptionId: { $type: 'objectId' } } });
export const PointsEntry = model('PointsEntry', PointsEntrySchema);

/* Saldo en caché (= suma del libro, se actualiza en la misma transacción que cada movimiento).
   Permite el descuento condicional atómico del canje (RN-05: nunca negativo por un canje). */
const PointsWalletSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);
PointsWalletSchema.index({ businessId: 1, userId: 1 }, { unique: true });
export const PointsWallet = model('PointsWallet', PointsWalletSchema);

/* Productos canjeables (RN-09). stock null = sin límite. */
const RewardProductSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    photoId: { type: String, default: null },
    costPoints: { type: Number, required: true },
    stock: { type: Number, default: null },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
RewardProductSchema.index({ businessId: 1, active: 1, order: 1 });
export const RewardProduct = model('RewardProduct', RewardProductSchema);

/* Canje: una unidad de un producto (asunción 9), con nombre y costo congelados. */
const RedemptionSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    product: { name: String, costPoints: Number, photoId: String },
    customer: { name: String, email: String },
    code: { type: String, required: true },
    status: { type: String, enum: REDEMPTION_STATUSES, default: 'pendiente_retiro' },
    idempotencyKey: String,
    deliveredAt: Date,
    deliveredBy: ObjectId,
    cancelledAt: Date,
    cancelledBy: ObjectId,
    cancelReason: String,
  },
  { timestamps: true }
);
/* RN-08: el código es único por negocio. */
RedemptionSchema.index({ businessId: 1, code: 1 }, { unique: true });
RedemptionSchema.index({ businessId: 1, status: 1, createdAt: -1 });
RedemptionSchema.index({ businessId: 1, userId: 1, createdAt: -1 });
/* CB-04: doble clic / dos pestañas con la misma confirmación → un solo canje. */
RedemptionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export const Redemption = model('Redemption', RedemptionSchema);

export const LOYALTY_MODELS = [LoyaltySettings, PointsEntry, PointsWallet, RewardProduct, Redemption];
