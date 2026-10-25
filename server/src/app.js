import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { createMailer } from './lib/mailer.js';
import { createNominatimGeocoder } from './lib/geocoder.js';
import { createFacebookClient } from './lib/facebook.js';
import { sessionMiddleware } from './lib/session.js';
import { createAgenda } from './domain/agenda.js';
import { createAuthRouter, LOGIN_LIMIT } from './routes/auth.js';
import { createWstyleRouter } from './routes/wstyle.js';
import { createPro } from './domain/pro.js';
import { createProRouter } from './routes/pro.js';
import { sendPhoto } from './lib/photos.js';
import { createAdminInbox } from './lib/adminInbox.js';
import { createAdmin } from './domain/admin.js';
import { createAdminRouter } from './routes/admin.js';
import { createPayments, WEBHOOK_PATH } from './domain/payments.js';
import { createBilling } from './domain/billing.js';
import { createTaxDocumentProvider } from './lib/taxDocuments.js';
import { handle } from './lib/errors.js';

/* La app SIN listen ni connect: index.js conecta Mongo y escucha, y los tests
   (server/test/contact.test.js) la levantan en un puerto efímero con su
   propia configuración (env, rate limit) sin tocar el server de desarrollo. */

/* Límites. El cliente aplica los mismos (client/src/lib/contactValidation.ts)
   pero acá se revalidan igual: el front es sugerencia, no autoridad. */
export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB entre todos los archivos
export const MAX_MESSAGE_LENGTH = 5000;
/* Mismo criterio que el `accept` del input del cliente. */
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.zip'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Asunto FIJO: así los mensajes del sitio se encuentran (y se filtran) en la
   bandeja con una sola búsqueda. Lo que escribió el visitante va en el cuerpo. */
export const CONTACT_SUBJECT = 'ricorp.cl contacto';

/* Rate limit por IP: 5 envíos cada 10 minutos. En memoria porque Render free
   corre una sola instancia; si algún día hay varias, esto pasa a Mongo/Redis. */
export const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

export function isAcceptedFile(originalname, mimetype) {
  if (String(mimetype || '').startsWith('image/')) return true;
  const name = String(originalname || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/* Ventana deslizante simple: por IP, los timestamps de los últimos envíos.
   `reset()` existe para los tests. */
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  function middleware(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      hits.set(key, recent);
      return res.status(429).json({ ok: false, error: 'too many requests', retryAfter });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  }
  middleware.reset = () => hits.clear();
  return middleware;
}

const NewsSchema = new mongoose.Schema(
  { title: String, image: String, featured: Boolean },
  { timestamps: true }
);
const News = mongoose.models.News || mongoose.model('News', NewsSchema);

const ContactSchema = new mongoose.Schema(
  {
    subject: String,
    email: String,
    attachments: [{ filename: String, size: Number, contentType: String }],
  },
  { timestamps: true }
);
const Contact = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Arma la app. Por defecto lee process.env; los tests pasan su propio `env`
 * (p.ej. sin credenciales de correo, o con RENDER=true) y su `rateLimit`.
 */
/* Rate limit de intentos de reserva por IP (RN-14): mismo patrón que /api/contact. */
export const BOOKING_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

export function createApp({
  env = process.env,
  rateLimit = RATE_LIMIT,
  logger = console,
  /* Agenda y cuentas (SPEC-32). Los tests inyectan reloj, mailer, geocodificador y
     el borde HTTP de Facebook; la BD siempre es real. */
  clock = () => Date.now(),
  agendaMailer: injectedMailer = null,
  geocoder = null,
  facebookFetch = fetch,
  bookingRateLimit = BOOKING_RATE_LIMIT,
  loginLimit = LOGIN_LIMIT,
  /* SPEC-35: "Pagar en línea" se ofrece si hay credenciales de Mercado Pago (MP_ACCESS_TOKEN).
     Los tests pueden forzarlo; por defecto se deduce del env. */
  onlinePayments = null,
  /* Borde HTTP de Mercado Pago (servicio externo): los tests lo simulan; la BD siempre es real. */
  mercadoPagoFetch = fetch,
} = {}) {
  onlinePayments = onlinePayments ?? { ready: Boolean(env.MP_ACCESS_TOKEN) };
  const app = express();
  /* Detrás del proxy de Render: req.ip tiene que ser la IP del visitante (del
     X-Forwarded-For) y no la del proxy, o el rate limit sería uno para todos. */
  app.set('trust proxy', 1);

  const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://bruser33.github.io')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      /* credentials: la sesión de la agenda viaja en una cookie httpOnly. */
      credentials: true,
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.some((a) => origin.startsWith(a))) return cb(null, true);
        cb(new Error('Origin not allowed: ' + origin));
      },
    })
  );
  app.use(express.json());

  const CONTACT_TO = env.CONTACT_TO || 'pedro.luis.rico43@gmail.com';
  /* Resend solo deja enviar desde un dominio verificado; `onboarding@resend.dev` es
     el remitente de prueba que la cuenta trae habilitado sin verificar nada. */
  const CONTACT_FROM = env.CONTACT_FROM || 'RICORP <onboarding@resend.dev>';
  const RESEND_API_KEY = env.RESEND_API_KEY || '';
  const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

  /* Gmail por SMTP: la vía más simple para que llegue a una casilla personal sin
     verificar un dominio. SMTP_USER es la cuenta Gmail y SMTP_PASS una contraseña
     de aplicación (myaccount.google.com/apppasswords, requiere verificación en dos
     pasos), NO la contraseña normal. Si están las dos vías gana RESEND: el plan
     free de Render bloquea las conexiones SMTP salientes, y Resend va por HTTPS. */
  const SMTP_USER = env.SMTP_USER || '';
  const SMTP_PASS = (env.SMTP_PASS || '').replace(/\s+/g, '');
  const smtp =
    SMTP_USER && SMTP_PASS
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: { user: SMTP_USER, pass: SMTP_PASS },
          /* Si el puerto está bloqueado, fallar en segundos y no en minutos. */
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
        })
      : null;
  const mailer = resend ? 'resend' : smtp ? 'smtp' : 'dry-run';

  /* En Render (que define RENDER=true) un dry-run NO puede responder ok: el
     visitante veía "¡Enviado!" y el mensaje no salía a ningún lado. Local sí se
     permite, para poder probar el formulario de punta a punta sin credenciales. */
  const DRY_RUN_ALLOWED = !env.RENDER;

  const upload = multer({
    storage: multer.memoryStorage(),
    /* `fileSize` es POR archivo: corta el stream antes de que un archivo enorme
       ocupe memoria. El tope del total se revisa después sumando los buffers. */
    limits: { files: MAX_FILES, fileSize: MAX_TOTAL_BYTES, fields: 10 },
    /* Tipo no permitido: se corta acá, antes de bufferear el archivo. */
    fileFilter: (_req, file, cb) => {
      if (isAcceptedFile(file.originalname, file.mimetype)) return cb(null, true);
      const err = new Error('file type not allowed');
      err.code = 'FILE_TYPE';
      err.filename = file.originalname;
      cb(err);
    },
  });

  const contactLimiter = createRateLimiter(rateLimit);
  /* Expuesto para los tests (reset entre casos). */
  app.locals.contactLimiter = contactLimiter;

  /* ─── Agenda y cuentas de WS Style (SPEC-32) */
  const frontUrl = (env.FRONT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const agendaMailer = injectedMailer || createMailer({ env, logger });
  const facebook = createFacebookClient({ appId: env.FB_APP_ID, appSecret: env.FB_APP_SECRET, redirectUri: env.FB_REDIRECT_URI, fetchImpl: facebookFetch });
  /* Firma del `state` de OAuth. Sin AUTH_SECRET se genera uno por proceso (un
     reinicio invalida los inicios con Facebook en curso, nada más). */
  const secret = env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
  /* Avisos al super admin (SPEC-34 RN-10): bandeja del panel + correo. */
  const adminInbox = createAdminInbox({ mailer: agendaMailer, logger, env, frontUrl });
  /* SPEC-37: respaldo tributario de cada venta (SII_TAX_PROVIDER = voucher | manual). */
  const taxProvider = createTaxDocumentProvider(env, logger);
  const agenda = createAgenda({
    clock,
    mailer: agendaMailer,
    logger,
    frontUrl,
    geocoder: geocoder || createNominatimGeocoder({ logger }),
    businessSlug: env.BUSINESS_SLUG || 'ws-style',
    adminInbox,
    onlinePayments,
    taxProvider,
  });
  /* Pago en línea (SPEC-35). */
  const payments = createPayments({ agenda, env, clock, logger, adminInbox, frontUrl, fetchImpl: mercadoPagoFetch, taxProvider });
  /* Pagos en el panel y rendición mensual (SPEC-37). */
  const billing = createBilling({ agenda, env, clock, logger, taxProvider });
  const bookingLimiter = createRateLimiter(bookingRateLimit);
  /* Barbero (SPEC-33): registro, perfil y panel. */
  const pro = createPro({ agenda, clock, mailer: agendaMailer, logger, frontUrl, env, adminInbox });
  /* Super admin (SPEC-34). */
  const admin = createAdmin({ agenda, pro, clock, mailer: agendaMailer, logger, frontUrl, env, adminInbox, onlinePayments, payments, billing });
  const authRouter = createAuthRouter({ env, clock, mailer: agendaMailer, logger, facebook, frontUrl, secret, loginLimit, onAccountDeleted: agenda.onAccountDeleted, onBarberFacebook: pro.ensureBarber });
  const withSession = sessionMiddleware({ clock });
  const needsDb = (_req, res, next) =>
    mongoose.connection.readyState === 1 ? next() : res.status(503).json({ ok: false, error: 'db_unavailable' });
  app.use('/api/auth', needsDb, withSession, authRouter);
  app.get('/api/wstyle/photos/:id', needsDb, (req, res) => {
    sendPhoto(req.params.id, res).catch((err) => {
      logger.error('[photos]', err.message);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
    });
  });
  app.use('/api/wstyle', needsDb, withSession, createWstyleRouter({ agenda, payments, logger, bookingLimiter }));
  /* Webhook de Mercado Pago: público (lo llama Mercado Pago, sin Origin ni cookie); la
     autenticidad la da la firma x-signature. */
  app.post(WEBHOOK_PATH, needsDb, handle(async (req, res) => {
    const [status, body] = await payments.webhook(req);
    res.status(status).json(body);
  }, logger));
  app.use('/api/pro', needsDb, withSession, createProRouter({ pro, env, clock, mailer: agendaMailer, logger, frontUrl, loginLimiter: authRouter.loginLimiter, billing }));
  app.use('/api/admin', needsDb, withSession, createAdminRouter({ admin, logger }));
  Object.assign(app.locals, { agenda, pro, admin, payments, billing, agendaMailer, bookingLimiter, loginLimiter: authRouter.loginLimiter });

  app.get('/api/health', (_req, res) => {
    /* 'unconfigured' y no 'dry-run' en Render: ahí sin mailer el envío es un 503,
       y el health tiene que decir eso para que se note desde afuera. */
    res.json({
      ok: true,
      mongo: mongoose.connection.readyState,
      mailer: mailer === 'dry-run' && !DRY_RUN_ALLOWED ? 'unconfigured' : mailer,
    });
  });

  app.get('/api/news', async (_req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json([]);
    const items = await News.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json(
      items.map((i) => ({
        id: String(i._id),
        title: i.title,
        image: i.image,
        featured: !!i.featured,
      }))
    );
  });

  /* Traduce los errores de multer (que llegan como excepción del middleware) a un
     413/400 con mensaje, en vez del 500 genérico del handler de Express. */
  function receiveAttachments(req, res, next) {
    upload.array('files', MAX_FILES)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(413).json({ error: 'too many files', maxFiles: MAX_FILES });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'attachments too large', maxTotalBytes: MAX_TOTAL_BYTES });
      }
      if (err.code === 'FILE_TYPE') {
        return res.status(400).json({ error: 'file type not allowed', filename: err.filename });
      }
      next(err);
    });
  }

  app.post('/api/contact', contactLimiter, receiveAttachments, async (req, res) => {
    /* Honeypot: un humano no ve el campo `website`. Si viene lleno es un bot:
       se le responde un ok creíble y no se envía ni se guarda nada. */
    if (String(req.body?.website ?? '').trim()) {
      logger.log('[contact] honeypot lleno: se descarta sin enviar');
      return res.json({ ok: true, dryRun: false, attachments: (req.files ?? []).length });
    }

    const subject = String(req.body?.subject ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    if (!subject || !email) return res.status(400).json({ error: 'missing fields' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email' });
    if (subject.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'message too long', maxLength: MAX_MESSAGE_LENGTH });
    }

    const files = req.files ?? [];
    if (files.length > MAX_FILES) {
      return res.status(413).json({ error: 'too many files', maxFiles: MAX_FILES });
    }
    const empty = files.find((f) => f.size === 0);
    if (empty) return res.status(400).json({ error: 'empty file', filename: empty.originalname });
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return res.status(413).json({ error: 'attachments too large', maxTotalBytes: MAX_TOTAL_BYTES });
    }

    const meta = files.map((f) => ({ filename: f.originalname, size: f.size, contentType: f.mimetype }));

    /* Se corta ANTES de guardar en la BD: si no, quedaba registrado un mensaje que
       nunca se envió. */
    if (mailer === 'dry-run' && !DRY_RUN_ALLOWED) {
      logger.error('[contact] sin mailer configurado en Render (SMTP_USER/SMTP_PASS o RESEND_API_KEY)');
      return res.status(503).json({ ok: false, error: 'mailer not configured' });
    }

    if (mongoose.connection.readyState === 1) {
      await Contact.create({ subject, email, attachments: meta });
    }

    const mail = {
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      replyTo: email,
      subject: CONTACT_SUBJECT,
      text: `Nuevo mensaje desde ricorp.cl\n\nMensaje: ${subject}\nEmail: ${email}\nAdjuntos: ${meta.length ? meta.map((m) => `${m.filename} (${m.size} bytes)`).join(', ') : 'ninguno'}\n`,
      html:
        `<p><strong>Nuevo mensaje desde ricorp.cl</strong></p>` +
        `<p><strong>Mensaje:</strong> ${escapeHtml(subject)}</p>` +
        `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` +
        `<p><strong>Adjuntos:</strong> ${meta.length ? meta.map((m) => escapeHtml(m.filename)).join(', ') : 'ninguno'}</p>`,
      attachments: files.map((f) => ({ filename: f.originalname, content: f.buffer })),
    };

    if (!resend && smtp) {
      try {
        await smtp.sendMail({
          from: `RICORP <${SMTP_USER}>`,
          to: CONTACT_TO,
          replyTo: email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments: mail.attachments,
        });
      } catch (err) {
        logger.error('[contact] smtp error:', err.message);
        return res.status(502).json({ ok: false, error: 'mail delivery failed' });
      }
      return res.json({ ok: true, dryRun: false, attachments: meta.length });
    }

    /* Sin mailer configurado en local: se loguea y se responde ok con la bandera,
       para probar el formulario sin credenciales (en Render ya cortó arriba con
       503 y la UI muestra el error reintentable en vez de un éxito falso). */
    if (!resend) {
      logger.log(`[contact] dry-run — sin SMTP_USER/SMTP_PASS ni RESEND_API_KEY, no se envió correo`);
      logger.log(`[contact] to=${CONTACT_TO} replyTo=${email} subject="${mail.subject}"`);
      logger.log(`[contact] adjuntos=${meta.length ? meta.map((m) => `${m.filename} (${m.size}B)`).join(', ') : 'ninguno'}`);
      return res.json({ ok: true, dryRun: true, attachments: meta.length });
    }

    try {
      const { error } = await resend.emails.send(mail);
      if (error) {
        logger.error('[contact] resend error:', error);
        return res.status(502).json({ ok: false, error: 'mail delivery failed' });
      }
    } catch (err) {
      logger.error('[contact] resend threw:', err.message);
      return res.status(502).json({ ok: false, error: 'mail delivery failed' });
    }

    res.json({ ok: true, dryRun: false, attachments: meta.length });
  });

  return app;
}

/* La app con la configuración del entorno (la que usa index.js). */
export const app = createApp();
