/* Transacciones (RN-05). Requieren replica set: el Mongo local y el de tests corren
   como replica set de un nodo (`mongod --replSet rs0` + `rs.initiate()`); Atlas ya
   lo es. Con un Mongo standalone se corre la función sin sesión: la reserva sigue
   siendo segura por el índice único de SlotLock (y appointments.js compensa
   borrando bloques si algo falla), pero se avisa en el log. */
import mongoose from 'mongoose';

let cached = null;

export async function supportsTransactions(conn = mongoose.connection) {
  if (cached && cached.conn === conn && cached.readyAt === conn.readyState) return cached.value;
  let value = false;
  try {
    const hello = await conn.db.admin().command({ hello: 1 });
    value = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    value = false;
  }
  cached = { conn, readyAt: conn.readyState, value };
  return value;
}

export async function withTransaction(fn, logger = console) {
  if (!(await supportsTransactions())) {
    logger.warn?.('[db] Mongo standalone: sin transacciones (la reserva se protege con el índice único de SlotLock)');
    return fn(null, { transactional: false });
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session, { transactional: true });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export const isDuplicateKey = (err) => err?.code === 11000 || err?.writeErrors?.some?.((e) => e.code === 11000) || /E11000/.test(err?.message || '');
