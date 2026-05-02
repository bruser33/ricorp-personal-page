import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(cors());
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

app.post('/api/contact', async (req, res) => {
  const { subject, email } = req.body ?? {};
  if (!subject || !email) return res.status(400).json({ error: 'missing fields' });
  if (mongoose.connection.readyState === 1) {
    await Contact.create({ subject, email });
  }
  res.json({ ok: true });
});

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`api on :${PORT}`)))
  .catch((err) => {
    console.error('mongo connect failed, starting api without db:', err.message);
    app.listen(PORT, () => console.log(`api on :${PORT} (no db)`));
  });
