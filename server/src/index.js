/* dotenv primero: app.js lee process.env al evaluarse, y los imports ESM se
   evalúan en orden. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pagina_personal';

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`api on :${PORT}`)))
  .catch((err) => {
    console.error('mongo connect failed, starting api without db:', err.message);
    app.listen(PORT, () => console.log(`api on :${PORT} (no db)`));
  });
