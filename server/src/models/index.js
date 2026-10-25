/* Modelo de datos de la agenda (SPEC-32), pensado multi-negocio: WS Style es UN
   Business; todo lo del negocio lleva businessId y sus índices empiezan por él.
   User, Professional y SlotLock son globales a propósito (ver la tabla
   "Modelo de datos y consideraciones para escalar" de la spec). */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const PointSchema = new Schema(
  { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: undefined } },
  { _id: false }
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

/* ─── Negocio */
const BusinessSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: String,
    timezone: { type: String, default: 'America/Santiago' },
    currency: { type: String, default: 'CLP' },
    address: { street: String, city: String, region: String },
    location: PointSchema,
    /* weekday ISO 1..7; opens/closes null = cerrado. */
    hours: [{ _id: false, weekday: Number, opens: String, closes: String }],
    /* Feriados / cierres del local: fechas locales 'YYYY-MM-DD'. */
    closures: [{ _id: false, date: String, reason: String }],
    contact: { whatsapp: String, phone: String },
    policies: [{ _id: false, title: String, text: String }],
    settings: {
      slotMinutes: { type: Number, default: 15 },
      minLeadMinutes: { type: Number, default: 120 },
      horizonDays: { type: Number, default: 30 },
      cancelUntilMinutes: { type: Number, default: 180 },
      confirmWithinMinutes: { type: Number, default: 12 * 60 },
      maxActivePerCustomer: { type: Number, default: 2 },
    },
  },
  { timestamps: true }
);
BusinessSchema.index({ location: '2dsphere' }, { sparse: true });
export const Business = model('Business', BusinessSchema);

/* ─── Profesional: independiente del negocio (en Styluxe trabaja solo o en varios). */
const ProfessionalSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', index: true },
    displayName: { type: String, required: true },
    specialty: String,
    phone: String,
    email: String,
    photos: [String],
    bio: String,
    categories: { type: [String], default: ['barberia'] },
    homeService: {
      enabled: { type: Boolean, default: false },
      surchargeCLP: { type: Number, default: 0 },
      radiusKm: { type: Number, default: 0 },
      travelBufferMin: { type: Number, default: 30 },
    },
    baseLocation: PointSchema,
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);
export const Professional = model('Professional', ProfessionalSchema);

/* Aprobación por negocio. */
const MembershipSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    professionalId: { type: ObjectId, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
MembershipSchema.index({ businessId: 1, professionalId: 1 }, { unique: true });
export const Membership = model('Membership', MembershipSchema);

/* professionalId null = carta del local. `slug` = id de services.json. */
const ServiceSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    professionalId: { type: ObjectId, default: null },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    priceCLP: { type: Number, required: true },
    durationMin: { type: Number, required: true },
    homeServiceAllowed: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
ServiceSchema.index({ businessId: 1, slug: 1 }, { unique: true });
export const Service = model('Service', ServiceSchema);

const ProfessionalServiceSchema = new Schema({
  businessId: { type: ObjectId, required: true },
  professionalId: { type: ObjectId, required: true },
  serviceId: { type: ObjectId, required: true },
  priceCLP: Number,
  durationMin: Number,
});
ProfessionalServiceSchema.index({ businessId: 1, professionalId: 1, serviceId: 1 }, { unique: true });
export const ProfessionalService = model('ProfessionalService', ProfessionalServiceSchema);

const AvailabilityRuleSchema = new Schema({
  businessId: { type: ObjectId, required: true },
  professionalId: { type: ObjectId, required: true },
  weekday: { type: Number, min: 1, max: 7, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
});
AvailabilityRuleSchema.index({ businessId: 1, professionalId: 1, weekday: 1 });
export const AvailabilityRule = model('AvailabilityRule', AvailabilityRuleSchema);

const TimeOffSchema = new Schema({
  businessId: { type: ObjectId, required: true },
  professionalId: { type: ObjectId, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  reason: String,
});
TimeOffSchema.index({ businessId: 1, professionalId: 1, startsAt: 1 });
export const TimeOff = model('TimeOff', TimeOffSchema);

/* ─── Personas: globales (la misma persona en WS Style y en un futuro Styluxe). */
const IdentitySchema = new Schema(
  {
    provider: { type: String, enum: ['email', 'facebook'], required: true },
    providerUserId: String,
    passwordHash: String,
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);
const UserSchema = new Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    name: String,
    phoneE164: String,
    roles: { type: [String], default: ['client'] },
    identities: [IdentitySchema],
    status: { type: String, enum: ['active', 'deleted'], default: 'active' },
    deletedAt: Date,
  },
  { timestamps: true }
);
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index(
  { 'identities.provider': 1, 'identities.providerUserId': 1 },
  { unique: true, partialFilterExpression: { 'identities.providerUserId': { $type: 'string' } } }
);
export const User = model('User', UserSchema);

/* Sesiones y tokens de un solo uso (verificar email, recuperar contraseña,
   vincular Facebook). Solo se guarda el hash del token. */
const AuthTokenSchema = new Schema(
  {
    type: { type: String, enum: ['session', 'verify_email', 'reset_password', 'fb_link', 'fb_email'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: ObjectId, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    data: Schema.Types.Mixed,
  },
  { timestamps: true }
);
AuthTokenSchema.index({ userId: 1, type: 1 });
export const AuthToken = model('AuthToken', AuthTokenSchema);

/* Datos del cliente POR negocio (separados del User global). */
const CustomerProfileSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    notes: String,
    counters: { appointments: { type: Number, default: 0 }, noShows: { type: Number, default: 0 } },
  },
  { timestamps: true }
);
CustomerProfileSchema.index({ businessId: 1, userId: 1 }, { unique: true });
export const CustomerProfile = model('CustomerProfile', CustomerProfileSchema);

/* ─── Citas */
export const STATUSES = [
  'pendiente_pago',
  'pendiente',
  'invitacion_enviada',
  'confirmada',
  'propuesta_cambio',
  'en_curso',
  'terminada',
  'cancelada',
  'expirada',
  'no_asistio',
];
/* Estados que ocupan agenda (RN-02). */
export const BLOCKING = ['pendiente', 'pendiente_pago', 'invitacion_enviada', 'confirmada', 'propuesta_cambio', 'en_curso'];
export const FINAL = ['terminada', 'cancelada', 'expirada', 'no_asistio'];

const AppointmentSchema = new Schema(
  {
    businessId: { type: ObjectId, required: true },
    professionalId: { type: ObjectId, required: true },
    customerUserId: { type: ObjectId, default: null },
    customerSnapshot: { name: String, phoneE164: String, email: String },
    serviceSnapshot: { serviceId: ObjectId, slug: String, name: String, priceCLP: Number, durationMin: Number },
    professionalSnapshot: { displayName: String, phone: String },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    location: {
      kind: { type: String, enum: ['shop', 'home'], default: 'shop' },
      address: { street: String, commune: String, details: String, formatted: String },
      point: PointSchema,
      distanceKm: Number,
      travelBufferMin: { type: Number, default: 0 },
    },
    pricing: {
      priceCLP: Number,
      surchargeCLP: { type: Number, default: 0 },
      totalCLP: Number,
      platformFeeRate: { type: Number, default: 0 },
      platformFeeCLP: { type: Number, default: 0 },
    },
    payment: { method: { type: String, default: 'local' }, status: { type: String, default: 'pendiente' } },
    note: String,
    status: { type: String, enum: STATUSES, required: true },
    /* Pendiente: hasta cuándo puede confirmar el barbero (RN-11). */
    expiresAt: Date,
    proposal: {
      startsAt: Date,
      endsAt: Date,
      by: String,
      fromStatus: String,
      expiresAt: Date,
      createdAt: Date,
    },
    history: [
      {
        _id: false,
        at: { type: Date, required: true },
        from: String,
        to: String,
        by: String,
        byUserId: ObjectId,
        reason: String,
      },
    ],
    source: { type: String, enum: ['web', 'pro_invite', 'admin'], default: 'web' },
    idempotencyKey: String,
  },
  /* optimisticConcurrency: dos pestañas (o cliente y barbero) que cambian la misma
     cita a la vez → la segunda falla con VersionError → 409 (CB-14). */
  { timestamps: true, optimisticConcurrency: true }
);
AppointmentSchema.index({ businessId: 1, professionalId: 1, startsAt: 1 });
AppointmentSchema.index({ businessId: 1, customerUserId: 1, startsAt: -1 });
AppointmentSchema.index({ businessId: 1, status: 1, expiresAt: 1 });
AppointmentSchema.index(
  { customerUserId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
AppointmentSchema.index({ 'location.point': '2dsphere' }, { sparse: true });
export const Appointment = model('Appointment', AppointmentSchema);

/* Bloques de 15 min ocupados. El índice único es la garantía de "sin solapes"
   (RN-05): el profesional no puede estar en dos lugares aunque trabaje para dos negocios. */
const SlotLockSchema = new Schema({
  businessId: { type: ObjectId, required: true },
  professionalId: { type: ObjectId, required: true },
  slotStart: { type: Date, required: true },
  appointmentId: { type: ObjectId, required: true, index: true },
  kind: { type: String, enum: ['main', 'proposal'], default: 'main' },
});
SlotLockSchema.index({ professionalId: 1, slotStart: 1 }, { unique: true });
export const SlotLock = model('SlotLock', SlotLockSchema);

const NotificationSchema = new Schema(
  {
    businessId: ObjectId,
    appointmentId: ObjectId,
    to: String,
    channel: { type: String, default: 'email' },
    template: String,
    status: { type: String, enum: ['sent', 'dry-run', 'failed'] },
    error: String,
  },
  { timestamps: true }
);
export const Notification = model('Notification', NotificationSchema);

const PlatformSettingsSchema = new Schema(
  { key: { type: String, default: 'default', unique: true }, defaultPlatformFeeRate: { type: Number, default: 0 }, paymentProviders: [String] },
  { timestamps: true }
);
export const PlatformSettings = model('PlatformSettings', PlatformSettingsSchema);

export const ALL_MODELS = [
  Business,
  Professional,
  Membership,
  Service,
  ProfessionalService,
  AvailabilityRule,
  TimeOff,
  User,
  AuthToken,
  CustomerProfile,
  Appointment,
  SlotLock,
  Notification,
  PlatformSettings,
];
