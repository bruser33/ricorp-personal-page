import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://bruser33.github.io')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.some((a) => origin.startsWith(a))) return cb(null, true);
      cb(new Error('Origin not allowed: ' + origin));
    },
  })
);
app.use(express.json());

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal';

/* Límites de adjuntos. El cliente aplica los mismos (client/src/components/Contact.tsx)
   pero acá se revalidan igual: el front es sugerencia, no autoridad. */
export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB entre todos los archivos

const CONTACT_TO = process.env.CONTACT_TO || 'pedro.luis.rico43@gmail.com';
/* Resend solo deja enviar desde un dominio verificado; `onboarding@resend.dev` es
   el remitente de prueba que la cuenta trae habilitado sin verificar nada. */
const CONTACT_FROM = process.env.CONTACT_FROM || 'RICORP <onboarding@resend.dev>';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/* Asunto FIJO: así los mensajes del sitio se encuentran (y se filtran) en la
   bandeja con una sola búsqueda. Lo que escribió el visitante va en el cuerpo. */
const CONTACT_SUBJECT = 'ricorp.cl contacto';

/* Gmail por SMTP: la vía más simple para que llegue a una casilla personal sin
   verificar un dominio. SMTP_USER es la cuenta Gmail y SMTP_PASS una contraseña
   de aplicación (myaccount.google.com/apppasswords, requiere verificación en dos
   pasos), NO la contraseña normal. Si están las dos vías gana RESEND: el plan
   free de Render bloquea las conexiones SMTP salientes, y Resend va por HTTPS. */
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
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
const DRY_RUN_ALLOWED = !process.env.RENDER;

const upload = multer({
  storage: multer.memoryStorage(),
  /* `fileSize` es POR archivo: corta el stream antes de que un archivo enorme
     ocupe memoria. El tope del total se revisa después sumando los buffers. */
  limits: { files: MAX_FILES, fileSize: MAX_TOTAL_BYTES, fields: 10 },
});

const NewsSchema = new mongoose.Schema(
  { title: String, image: String, featured: Boolean },
  { timestamps: true }
);
const News = mongoose.model('News', NewsSchema);

const ContactSchema = new mongoose.Schema(
  {
    subject: String,
    email: String,
    attachments: [{ filename: String, size: Number, contentType: String }],
  },
  { timestamps: true }
);
const Contact = mongoose.model('Contact', ContactSchema);

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
   413 con mensaje, en vez del 500 genérico del handler de Express. */
function receiveAttachments(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(413).json({ error: 'too many files', maxFiles: MAX_FILES });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'attachments too large', maxTotalBytes: MAX_TOTAL_BYTES });
    }
    next(err);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

app.post('/api/contact', receiveAttachments, async (req, res) => {
  const subject = String(req.body?.subject ?? '').trim();
  const email = String(req.body?.email ?? '').trim();
  if (!subject || !email) return res.status(400).json({ error: 'missing fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid email' });

  const files = req.files ?? [];
  if (files.length > MAX_FILES) {
    return res.status(413).json({ error: 'too many files', maxFiles: MAX_FILES });
  }
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: 'attachments too large', maxTotalBytes: MAX_TOTAL_BYTES });
  }

  const meta = files.map((f) => ({ filename: f.originalname, size: f.size, contentType: f.mimetype }));

  /* Se corta ANTES de guardar en la BD: si no, quedaba registrado un mensaje que
     nunca se envió. */
  if (mailer === 'dry-run' && !DRY_RUN_ALLOWED) {
    console.error('[contact] sin mailer configurado en Render (SMTP_USER/SMTP_PASS o RESEND_API_KEY)');
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
      console.error('[contact] smtp error:', err.message);
      return res.status(502).json({ ok: false, error: 'mail delivery failed' });
    }
    return res.json({ ok: true, dryRun: false, attachments: meta.length });
  }

  /* Sin mailer configurado en local: se loguea y se responde ok con la bandera,
     para probar el formulario sin credenciales (en Render ya cortó arriba con
     503 y la UI muestra el error reintentable en vez de un éxito falso). */
  if (!resend) {
    console.log(`[contact] dry-run — sin SMTP_USER/SMTP_PASS ni RESEND_API_KEY, no se envió correo`);
    console.log(`[contact] to=${CONTACT_TO} replyTo=${email} subject="${mail.subject}"`);
    console.log(`[contact] adjuntos=${meta.length ? meta.map((m) => `${m.filename} (${m.size}B)`).join(', ') : 'ninguno'}`);
    return res.json({ ok: true, dryRun: true, attachments: meta.length });
  }

  try {
    const { error } = await resend.emails.send(mail);
    if (error) {
      console.error('[contact] resend error:', error);
      return res.status(502).json({ ok: false, error: 'mail delivery failed' });
    }
  } catch (err) {
    console.error('[contact] resend threw:', err.message);
    return res.status(502).json({ ok: false, error: 'mail delivery failed' });
  }

  res.json({ ok: true, dryRun: false, attachments: meta.length });
});

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`api on :${PORT}`)))
  .catch((err) => {
    console.error('mongo connect failed, starting api without db:', err.message);
    app.listen(PORT, () => console.log(`api on :${PORT} (no db)`));
  });
