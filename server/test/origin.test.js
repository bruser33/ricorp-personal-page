/* SPEC-58 RN-03 / CB-02: normalización del origen de una reserva (utm_source). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrigin } from '../src/domain/origin.js';

test('minúsculas, solo [a-z0-9_-], máx. 40; inválido o ausente → directo', () => {
  assert.equal(normalizeOrigin('Instagram_Bio'), 'instagram_bio');
  assert.equal(normalizeOrigin(' cartel '), 'cartel');
  assert.equal(normalizeOrigin('tiktok'), 'tiktok');
  assert.equal(normalizeOrigin('a-b_9'), 'a-b_9');
  assert.equal(normalizeOrigin('x'.repeat(200)), 'x'.repeat(40));
  for (const bad of [undefined, null, '', '   ', '<script>', 'insta gram', 'ñandú', 'a.b', 42, ['cartel'], { a: 1 }]) assert.equal(normalizeOrigin(bad), 'directo', String(bad));
});
