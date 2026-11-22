/* SPEC-57 + SPEC-52: el "Gracias por venir" lleva a la vez los puntos ganados y la invitación a reseñar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentMail } from '../src/lib/emails.js';

const appt = { professionalSnapshot: { displayName: 'Joe' }, serviceSnapshot: { name: 'Corte' }, pricing: { totalCLP: 10000 } };

test('finished: puntos + link de reseña en el mismo correo', () => {
  const m = appointmentMail({ kind: 'finished', to: 'client', appt, when: 'hoy', url: 'https://x/cita', points: { earned: 100, balance: 300 }, reviewUrl: 'https://x/resena' });
  assert.match(m.text, /Sumaste 100 puntos\. Tu saldo: 300 puntos\./);
  assert.match(m.text, /Cuéntalo en una reseña/);
  assert.match(m.text, /https:\/\/x\/resena/);
  assert.match(m.text, /https:\/\/x\/cita/);
});

test('finished sin puntos ni cuenta: solo el agradecimiento y el link a la cita', () => {
  const m = appointmentMail({ kind: 'finished', to: 'client', appt, when: 'hoy', url: 'https://x/cita' });
  assert.doesNotMatch(m.text, /Sumaste|reseña/);
});
