import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import { Resend } from 'resend';

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
  res.json({ ok: true, mongo: mongoose.connection.readyState, mailer: resend ? 'resend' : 'dry-run' });
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

  if (mongoose.connection.readyState === 1) {
    await Contact.create({ subject, email, attachments: meta });
  }

  const mail = {
    from: CONTACT_FROM,
    to: [CONTACT_TO],
    replyTo: email,
    subject: `[ricorp.cl] ${subject}`,
    text: `Nuevo mensaje desde ricorp.cl\n\nAsunto: ${subject}\nEmail: ${email}\nAdjuntos: ${meta.length ? meta.map((m) => `${m.filename} (${m.size} bytes)`).join(', ') : 'ninguno'}\n`,
    html:
      `<p><strong>Nuevo mensaje desde ricorp.cl</strong></p>` +
      `<p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>` +
      `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` +
      `<p><strong>Adjuntos:</strong> ${meta.length ? meta.map((m) => escapeHtml(m.filename)).join(', ') : 'ninguno'}</p>`,
    attachments: files.map((f) => ({ filename: f.originalname, content: f.buffer })),
  };

  /* Sin API key el sitio local tiene que seguir funcionando de punta a punta: se
     loguea el envío y se responde ok con la bandera para que la UI no simule un
     éxito que en producción sería un error real. */
  if (!resend) {
    console.log('[contact] dry-run — sin RESEND_API_KEY, no se envió correo');
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
