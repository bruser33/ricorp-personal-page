import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { createMirrorRouter } from '../src/routes/mirror.js';
import { HttpError } from '../src/lib/errors.js';

test('Espejo IA valida acceso, configuración, consentimiento y envía una sola edición', async t => {
  const png = await sharp({ create: { width: 1536, height: 1024, channels: 4, background: '#00000000' } }).png().toBuffer();
  let calls = 0;
  const app = express();
  const pro = { context(user, options) {
    assert.deepEqual(options, { operate: true });
    if (!user) throw new HttpError(401, 'unauthorized');
    if (!user.approved) throw new HttpError(403, 'not_approved');
  } };
  app.use((req, _res, next) => {
    if (req.get('test-role')) req.user = { _id: 'test', approved: req.get('test-role') === 'barber' };
    next();
  });
  const provider = async (url, { body, signal }) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.ok(body.get('image[]').size && body.get('mask').size);
    assert.match(body.get('prompt'), /degradado medio/);
    assert.equal(signal.aborted, false);
    return Response.json({ data: [{ b64_json: png.toString('base64') }] });
  };
  app.use('/active', createMirrorRouter({ pro, env: { WS_MIRROR_OPENAI_KEY: 'fixture' }, request: provider }));
  app.use('/inactive', createMirrorRouter({ pro, env: {}, request: provider }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'test-role': 'barber', 'X-WS-Mirror': '1' };
  assert.equal((await fetch(base + '/active/status')).status, 401);
  assert.equal((await fetch(base + '/active/status', { headers: { 'test-role': 'client' } })).status, 403);
  assert.deepEqual(await (await fetch(base + '/inactive/status', { headers })).json(), { enabled: false });
  assert.equal((await fetch(base + '/inactive/edit', { method: 'POST', headers })).status, 503);
  const body = new FormData();
  body.set('prompt', 'Quiero un degradado medio');
  async function edit() { return fetch(base + '/active/edit', { method: 'POST', headers, body }); }
  assert.equal((await edit()).status, 400);
  body.set('consent', 'yes');
  assert.equal((await edit()).status, 400);
  assert.equal(calls, 0);
  body.set('image', new Blob([png], { type: 'image/png' }), 'image.png');
  body.set('mask', new Blob([png], { type: 'image/png' }), 'mask.png');
  const response = await edit();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(calls, 1);
});
