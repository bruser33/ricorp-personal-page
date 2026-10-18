import { describe, expect, it } from 'vitest';
import {
  MAX_FILES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_BYTES,
  addFiles,
  canRetry,
  createSingleFlight,
  errorFromResponse,
  isAcceptedFile,
  sendContact,
  validateEmail,
  validateMessage,
  type FileLike,
} from './contactValidation';

const MB = 1024 * 1024;
const file = (name: string, size = 1000, type = 'application/pdf'): FileLike => ({ name, size, type });
const pdfs = (n: number, size = 1000) => Array.from({ length: n }, (_, i) => file(`doc-${i}.pdf`, size));

describe('AC-01 demasiados archivos', () => {
  it('rechaza una tanda de 6 de una vez sin agregar ninguno', () => {
    const r = addFiles([], pdfs(6));
    expect(r.files).toHaveLength(0);
    expect(r.issues).toContainEqual({ code: 'tooMany' });
  });
  it('rechaza la tanda que, sumada a lo ya adjunto, pasa el tope', () => {
    const current = pdfs(4);
    const r = addFiles(current, [file('a.pdf'), file('b.pdf')]);
    expect(r.files).toBe(current);
    expect(r.issues).toEqual([{ code: 'tooMany' }]);
  });
  it('acepta exactamente el tope', () => {
    const r = addFiles(pdfs(3), [file('a.pdf'), file('b.pdf')]);
    expect(r.files).toHaveLength(MAX_FILES);
    expect(r.issues).toEqual([]);
  });
});

describe('AC-02 demasiado peso total', () => {
  it('rechaza si la suma supera 10 MB', () => {
    const r = addFiles([file('a.pdf', 6 * MB)], [file('b.pdf', 5 * MB)]);
    expect(r.files).toHaveLength(1);
    expect(r.issues).toEqual([{ code: 'tooLarge' }]);
  });
  it('acepta justo 10 MB', () => {
    const r = addFiles([file('a.pdf', 5 * MB)], [file('b.pdf', 5 * MB)]);
    expect(r.files).toHaveLength(2);
    expect(r.issues).toEqual([]);
  });
});

describe('AC-03 un archivo solo demasiado grande', () => {
  it('nombra el archivo y deja entrar a los demás', () => {
    const r = addFiles([], [file('video.zip', MAX_TOTAL_BYTES + 1, 'application/zip'), file('ok.pdf')]);
    expect(r.issues).toEqual([{ code: 'fileTooLarge', file: 'video.zip' }]);
    expect(r.files.map((f) => f.name)).toEqual(['ok.pdf']);
  });
});

describe('AC-04 tipo no permitido', () => {
  it('rechaza .exe y .js nombrándolos; los válidos entran', () => {
    const r = addFiles(
      [],
      [
        file('setup.exe', 100, 'application/x-msdownload'),
        file('foto.png', 100, 'image/png'),
        file('script.js', 100, 'text/javascript'),
        file('cv.docx', 100, ''),
      ]
    );
    expect(r.issues).toEqual([
      { code: 'type', file: 'setup.exe' },
      { code: 'type', file: 'script.js' },
    ]);
    expect(r.files.map((f) => f.name)).toEqual(['foto.png', 'cv.docx']);
  });
  it('replica el accept: image/* y .pdf .doc .docx .txt .zip (sin importar mayúsculas)', () => {
    expect(isAcceptedFile(file('x.HEIC', 1, 'image/heic'))).toBe(true);
    expect(isAcceptedFile(file('NOTAS.TXT', 1, ''))).toBe(true);
    expect(isAcceptedFile(file('a.zip', 1, 'application/zip'))).toBe(true);
    expect(isAcceptedFile(file('a.svg.exe', 1, ''))).toBe(false);
    expect(isAcceptedFile(file('pdf', 1, ''))).toBe(false);
  });
});

describe('AC-05 duplicado', () => {
  it('avisa si el archivo ya está adjunto', () => {
    const current = [file('cv.pdf', 500)];
    const r = addFiles(current, [file('cv.pdf', 500)]);
    expect(r.files).toEqual(current);
    expect(r.issues).toEqual([{ code: 'duplicate', file: 'cv.pdf' }]);
  });
  it('avisa si viene repetido dentro de la misma tanda', () => {
    const r = addFiles([], [file('cv.pdf', 500), file('cv.pdf', 500)]);
    expect(r.files).toHaveLength(1);
    expect(r.issues).toEqual([{ code: 'duplicate', file: 'cv.pdf' }]);
  });
  it('mismo nombre con otro tamaño NO es duplicado', () => {
    const r = addFiles([file('cv.pdf', 500)], [file('cv.pdf', 501)]);
    expect(r.files).toHaveLength(2);
  });
});

describe('AC-06 archivo vacío', () => {
  it('rechaza 0 bytes nombrando el archivo', () => {
    const r = addFiles([], [file('vacio.txt', 0, 'text/plain')]);
    expect(r.files).toHaveLength(0);
    expect(r.issues).toEqual([{ code: 'empty', file: 'vacio.txt' }]);
  });
});

describe('AC-07 mensaje vacío o solo espacios', () => {
  it.each(['', '   ', '\t\n '])('rechaza %j', (m) => {
    expect(validateMessage(m)).toBe('empty');
  });
  it('acepta un mensaje normal', () => {
    expect(validateMessage('Hola, quiero una web')).toBeNull();
  });
});

describe('AC-08 mensaje demasiado largo', () => {
  it('acepta exactamente el tope y rechaza uno más', () => {
    expect(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH))).toBeNull();
    expect(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe('tooLong');
  });
});

describe('AC-09 email vacío o inválido', () => {
  it.each(['', '   '])('vacío: %j', (e) => expect(validateEmail(e)).toBe('empty'));
  it.each(['a@b', 'sin-arroba', 'a b@c.com', 'a@b .com', '@dominio.cl', 'yo@'])('inválido: %j', (e) =>
    expect(validateEmail(e)).toBe('invalid')
  );
  it.each(['yo@ricorp.cl', '  yo@ricorp.cl  ', 'a.b+c@sub.dominio.com'])('válido: %j', (e) =>
    expect(validateEmail(e)).toBeNull()
  );
});

describe('AC-10 status HTTP → mensaje', () => {
  it.each([
    [400, null, 'invalid'],
    [400, { error: 'missing fields' }, 'invalid'],
    [400, { error: 'invalid email' }, 'invalidEmail'],
    [400, { error: 'message too long' }, 'tooLong'],
    [400, { error: 'file type not allowed' }, 'fileType'],
    [400, { error: 'empty file' }, 'fileType'],
    [413, { error: 'too many files' }, 'attachments'],
    [429, null, 'rateLimited'],
    [502, null, 'delivery'],
    [503, null, 'unconfigured'],
    [500, null, 'generic'],
    [404, null, 'generic'],
  ] as const)('%i %j → %s', (status, body, expected) => {
    expect(errorFromResponse(status, body)).toBe(expected);
  });
  it('reintentar solo cuando no hay que corregir datos', () => {
    expect(canRetry('delivery')).toBe(true);
    expect(canRetry('unconfigured')).toBe(true);
    expect(canRetry('rateLimited')).toBe(true);
    expect(canRetry('network')).toBe(true);
    expect(canRetry('generic')).toBe(true);
    expect(canRetry('invalid')).toBe(false);
    expect(canRetry('invalidEmail')).toBe(false);
    expect(canRetry('attachments')).toBe(false);
  });
  it('sendContact traduce la respuesta del server', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'mail delivery failed' }), { status: 502 })) as typeof fetch;
    const r = await sendContact({ url: 'http://x/api/contact', message: 'hola', email: 'a@b.cl', files: [] }, { fetchImpl });
    expect(r).toEqual({ ok: false, error: 'delivery' });
  });
  it('sendContact tolera un cuerpo que no es JSON', async () => {
    const fetchImpl = (async () => new Response('<html>', { status: 429 })) as typeof fetch;
    const r = await sendContact({ url: 'http://x', message: 'hola', email: 'a@b.cl', files: [] }, { fetchImpl });
    expect(r).toEqual({ ok: false, error: 'rateLimited' });
  });
  it('sendContact ok y arma el multipart con los campos', async () => {
    let sent: FormData | null = null;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      sent = init?.body as FormData;
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const r = await sendContact(
      { url: 'http://x', message: 'hola', email: ' a@b.cl ', files: [new Blob(['x'])], website: '' },
      { fetchImpl }
    );
    expect(r).toEqual({ ok: true });
    const fd = sent as unknown as FormData;
    expect(fd.get('subject')).toBe('hola');
    expect(fd.get('email')).toBe('a@b.cl');
    expect(fd.get('website')).toBe('');
    expect(fd.getAll('files')).toHaveLength(1);
  });
});

describe('AC-11 sin conexión / timeout', () => {
  it('fetch que falla → network', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const r = await sendContact({ url: 'http://x', message: 'hola', email: 'a@b.cl', files: [] }, { fetchImpl });
    expect(r).toEqual({ ok: false, error: 'network' });
  });
  it('fetch que no responde se aborta al vencer el timeout → network', async () => {
    let aborted = false;
    const fetchImpl = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as typeof fetch;
    const r = await sendContact(
      { url: 'http://x', message: 'hola', email: 'a@b.cl', files: [] },
      { fetchImpl, timeoutMs: 30 }
    );
    expect(aborted).toBe(true);
    expect(r).toEqual({ ok: false, error: 'network' });
  });
});

describe('AC-12 doble envío', () => {
  it('clics repetidos mientras envía → una sola llamada', async () => {
    const run = createSingleFlight();
    let calls = 0;
    let release!: () => void;
    const send = () => {
      calls++;
      return new Promise<string>((r) => (release = () => r('ok')));
    };
    const first = run(send);
    const second = run(send);
    const third = run(send);
    expect(calls).toBe(1);
    release();
    expect(await first).toBe('ok');
    expect(await second).toBeUndefined();
    expect(await third).toBeUndefined();
    /* Terminado el envío, se puede volver a enviar (p.ej. Reintentar). */
    const again = run(async () => 'otra vez');
    expect(await again).toBe('otra vez');
    expect(calls).toBe(1);
  });
  it('libera el candado aunque el envío falle', async () => {
    const run = createSingleFlight();
    await expect(run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await run(async () => 1)).toBe(1);
  });
});
