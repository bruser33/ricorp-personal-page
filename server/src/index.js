import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
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

const NewsSchema = new mongoose.Schema(
  { title: String, image: String, featured: Boolean },
  { timestamps: true }
);
const News = mongoose.model('News', NewsSchema);

const ContactSchema = new mongoose.Schema(
  { subject: String, email: String },
  { timestamps: true }
);
const Contact = mongoose.model('Contact', ContactSchema);

// Upload en memoria, un solo archivo opcional de hasta 10MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Validación simple de email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROPOSAL_SUBJECT = 'Ricorp Propuesta de proyecto';

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mongo: mongoose.connection.readyState });
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

// Multer envuelto: capturamos sus errores (p.ej. archivo > 10MB) y respondemos
// JSON en vez de dejar que Express emita un 500 con HTML + stack trace.
const uploadFile = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        ok: false,
        error: tooLarge ? 'el archivo supera el máximo de 10MB' : 'archivo inválido',
      });
    }
    next();
  });

app.post('/api/contact', uploadFile, async (req, res) => {
  const { subject = '', email } = req.body ?? {};

  // Validación: email requerido y con formato válido.
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'email inválido o faltante' });
  }

  const file = req.file;

  // Persistir la propuesta si hay DB (no bloquea el envío del correo).
  if (mongoose.connection.readyState === 1) {
    try {
      await Contact.create({ subject, email });
    } catch (err) {
      console.error('[contact] no se pudo guardar en la BD:', err.message);
    }
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  const to = process.env.PROPOSAL_TO_EMAIL || 'pedro.luis.rico43@gmail.com';

  // Degradación local: sin credenciales SMTP no se intenta conectar.
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('[contact] SMTP no configurado, correo omitido');
    return res.json({ ok: true, delivered: false });
  }

  const attachments = file
    ? [{ filename: file.originalname, content: file.buffer, contentType: file.mimetype }]
    : [];

  const bodyText = `Nueva propuesta de proyecto.\n\nEmail: ${email}\n\nMensaje:\n${subject || '(sin mensaje)'}`;
  const bodyHtml = `<p>Nueva propuesta de proyecto.</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Mensaje:</strong><br/>${(subject || '(sin mensaje)').replace(/\n/g, '<br/>')}</p>`;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to,
      replyTo: email,
      subject: PROPOSAL_SUBJECT,
      text: bodyText,
      html: bodyHtml,
      attachments,
    });

    return res.json({ ok: true, delivered: true });
  } catch (err) {
    console.error('[contact] fallo al enviar el correo:', err.message);
    return res.status(502).json({ ok: false, delivered: false, error: err.message });
  }
});

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`api on :${PORT}`)))
  .catch((err) => {
    console.error('mongo connect failed, starting api without db:', err.message);
    app.listen(PORT, () => console.log(`api on :${PORT} (no db)`));
  });
