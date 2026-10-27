/* Mailer de la agenda: buzón local por SMTP_HOST/SMTP_PORT sin auth (Mailpit en desarrollo,
   SPEC-36) sin cambiar la prioridad de Resend. El "Mailpit" de este test es un servidor SMTP
   mínimo en un puerto efímero que guarda lo que recibe. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createMailer } from '../src/lib/mailer.js';
import { silent } from './helpers.js';

function fakeSmtp() {
  const received = [];
  const server = net.createServer((sock) => {
    let data = false;
    let buf = '';
    let msg = { from: '', to: [], body: '' };
    sock.write('220 mailpit-de-prueba ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') {
            data = false;
            received.push(msg);
            msg = { from: '', to: [], body: '' };
            sock.write('250 OK queued\r\n');
          } else msg.body += line + '\n';
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-mailpit-de-prueba\r\n250 8BITMIME\r\n');
        else if (cmd === 'HELO') sock.write('250 mailpit-de-prueba\r\n');
        else if (cmd === 'MAIL') { msg.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { msg.to.push(line); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { data = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 Bye\r\n'); sock.end(); }
        else if (cmd === 'AUTH') sock.write('503 auth no soportada\r\n');
        else sock.write('250 OK\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })));
}

describe('mailer · SMTP_HOST sin auth (buzón local)', () => {
  test('con SMTP_HOST/SMTP_PORT envía al buzón local sin autenticarse', async () => {
    const smtp = await fakeSmtp();
    try {
      const m = createMailer({ env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_FROM: 'WS Style <agenda@wstyle.local>' }, logger: silent });
      assert.equal(m.mode, 'smtp-local');
      const r = await m.send({ to: 'cliente@clientes.test', subject: 'Reserva recibida', text: 'Hola', html: '<p>Hola</p>' });
      assert.deepEqual(r, { ok: true, status: 'sent' });
      assert.equal(smtp.received.length, 1);
      assert.match(smtp.received[0].to[0], /cliente@clientes\.test/);
      assert.match(smtp.received[0].from, /agenda@wstyle\.local/);
      assert.match(smtp.received[0].body, /Subject: Reserva recibida/);
      assert.equal(m.outbox.length, 0);
    } finally {
      smtp.server.close();
    }
  });

  test('RESEND_API_KEY sigue ganando; MAIL_DRY_RUN sigue mandando al outbox', () => {
    assert.equal(createMailer({ env: { RESEND_API_KEY: 're_prueba', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }, logger: silent }).mode, 'resend');
    assert.equal(createMailer({ env: { MAIL_DRY_RUN: '1', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }, logger: silent }).mode, 'dry-run');
    assert.equal(createMailer({ env: { SMTP_USER: 'yo@gmail.com', SMTP_PASS: 'abcd efgh' }, logger: silent }).mode, 'smtp');
    assert.equal(createMailer({ env: {}, logger: silent }).mode, 'dry-run');
  });

  test('buzón local caído → el envío falla sin tumbar al que llama', async () => {
    const probe = net.createServer();
    const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => resolve(probe.address().port)));
    await new Promise((resolve) => probe.close(resolve));
    const m = createMailer({ env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port) }, logger: silent });
    const r = await m.send({ to: 'x@clientes.test', subject: 'Prueba', text: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'failed');
  });
});
