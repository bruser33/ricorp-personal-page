/* Infra de tests de la agenda (SPEC-32): BD de test REAL (replica set de un nodo,
   nunca la de desarrollo), reloj inyectable, mailer en dry-run, geocodificador y
   borde HTTP de Facebook inyectados (son servicios externos). */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { ALL_MODELS, AuthToken, User } from '../src/models/index.js';
import { createMailer } from '../src/lib/mailer.js';
import { newToken, sha256 } from '../src/lib/session.js';
import { seedBusiness } from '../src/seed.js';

export const TEST_URI = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/wstyle_test?replicaSet=rs0';
export const silent = { log() {}, error() {}, warn() {} };
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;

if (!/_test(\?|$)/.test(new URL(TEST_URI.replace('mongodb://', 'http://')).pathname + '')) {
  throw new Error(`MONGO_TEST_URI debe apuntar a una BD *_test (recibido ${TEST_URI})`);
}

export async function connectDb() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  for (const m of ALL_MODELS) await m.createCollection().catch(() => {});
  /* Los índices únicos son la garantía de "sin solapes": tienen que existir antes de cada test. */
  for (const m of ALL_MODELS) await m.syncIndexes();
}

export async function resetDb() {
  for (const m of ALL_MODELS) await m.deleteMany({});
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/* Negocio de prueba: L–V 10:00–20:00, sábado 10–18, domingo cerrado; local en
   Plaza de Armas. Barbero A: L–V 12:00–18:00 (domicilio 8 km, $3.000). */
export const SITE = {
  name: 'WS Style',
  contact: { whatsapp: '+56 9 5555 0000', address: { street: 'Calle Falsa 123', city: 'Santiago' } },
  hours: [
    { dayCodes: 'Mo-Fr', opens: '10:00', closes: '20:00' },
    { dayCodes: 'Sa', opens: '10:00', closes: '18:00' },
    { dayCodes: 'Su', opens: null, closes: null },
  ],
  policies: [{ title: 'Inasistencias', text: 'Avísanos con 3 horas.' }],
};
export const SERVICES = [
  { id: 'corte', name: 'Corte', priceCLP: 12000, durationMin: 40 },
  { id: 'corte-barba', name: 'Corte + barba', priceCLP: 18000, durationMin: 60 },
];
export const PRO_A = {
  displayName: 'Barbero A',
  email: 'a@barberos.test',
  phone: '+56911110000',
  homeService: { enabled: true, surchargeCLP: 3000, radiusKm: 8, travelBufferMin: 30 },
  rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '12:00', end: '18:00' })),
};
export const PRO_C = {
  displayName: 'Barbero C',
  email: 'c@barberos.test',
  phone: '+56933330000',
  homeService: { enabled: false, surchargeCLP: 0, radiusKm: 0, travelBufferMin: 30 },
  rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '12:00', end: '18:00' })),
  services: ['corte'],
};
export const PRO_B = {
  displayName: 'Barbero B',
  email: 'b@barberos.test',
  phone: '+56922220000',
  homeService: { enabled: false, surchargeCLP: 0, radiusKm: 0, travelBufferMin: 30 },
  rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '12:00', end: '18:00' })),
};
export const SHOP = [-70.6506, -33.4378];

export function seed({ site = SITE, services = SERVICES, pros = [PRO_A] } = {}) {
  return seedBusiness({ site, services, pros, location: SHOP });
}

/* Punto a `km` al este del local (1° de longitud a -33.44 ≈ 92.8 km). */
export const eastOf = (km) => ({ lat: SHOP[1], lng: SHOP[0] + km / 92.83, formatted: `${km} km al este` });

export async function start({ now, geocoder, facebookFetch, env = {}, ...opts } = {}) {
  const clock = { now: now ?? Date.parse('2026-11-01T12:00:00Z') };
  const mailer = opts.mailer || createMailer({ env: { MAIL_DRY_RUN: '1' }, logger: silent });
  const app = createApp({
    env: { FRONT_URL: 'http://localhost:5173', AUTH_SECRET: 'test-secret', ...env },
    logger: silent,
    clock: () => clock.now,
    agendaMailer: mailer,
    geocoder: geocoder || (async () => null),
    facebookFetch,
    bookingRateLimit: opts.bookingRateLimit || { max: 1000, windowMs: 10 * MIN },
    loginLimit: opts.loginLimit,
    onlinePayments: opts.onlinePayments,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { app, server, base, clock, mailer };
}

export function stop(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
}

/* Cliente con sesión creado directo en la BD (rápido: 20 clientes para la prueba de concurrencia). */
export async function makeClient({ name = 'Cliente', email, phone = '+56987654321', roles = ['client'] } = {}) {
  const user = await User.create({ name, email: email || `c${Math.random().toString(36).slice(2)}@clientes.test`, phoneE164: phone, roles, emailVerified: true });
  const token = newToken();
  await AuthToken.create({ type: 'session', userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 365 * 24 * HOUR) });
  return { user, cookie: `ws_session=${token}` };
}

export async function api(base, method, path, { body, cookie, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sin JSON */
  }
  return { status: res.status, json, headers: res.headers };
}

export const sessionCookie = (headers) => {
  const c = headers.getSetCookie?.().find((x) => x.startsWith('ws_session='));
  return c ? c.split(';')[0] : null;
};
