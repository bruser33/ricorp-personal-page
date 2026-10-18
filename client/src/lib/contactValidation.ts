/* Validación del formulario de contacto: funciones puras, sin React ni i18n,
   para poder probarlas con vitest (contactValidation.test.ts). Devuelven
   CÓDIGOS de error; el componente los traduce con las claves contact.* de
   i18n.tsx. El server revalida los MISMOS límites (server/src/app.js) porque
   el cliente es una sugerencia, no la autoridad. */

export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB entre todos los archivos
export const MAX_MESSAGE_LENGTH = 5000;
/* El contador de caracteres aparece recién cerca del tope: en reposo no hay
   números a la vista (mismo criterio que el hint de adjuntos). */
export const MESSAGE_COUNTER_FROM = 4500;
export const SUBMIT_TIMEOUT_MS = 20_000;
export const ACCEPTED_FILE_TYPES = 'image/*,.pdf,.doc,.docx,.txt,.zip';
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.zip'];
/* Misma expresión que el server: algo@algo.algo, sin espacios. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Lo mínimo de un File que se necesita: así los tests no dependen del DOM. */
export type FileLike = { name: string; size: number; type: string };

export type FileIssue =
  | { code: 'tooMany' }
  | { code: 'tooLarge' }
  | { code: 'fileTooLarge'; file: string }
  | { code: 'type'; file: string }
  | { code: 'duplicate'; file: string }
  | { code: 'empty'; file: string };

/* Tamaño legible: KB/MB con un decimal, sin dependencias. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* Replica el `accept` del input: el selector del sistema se puede saltar
   (arrastrar, "Todos los archivos"), así que se vuelve a revisar acá. */
export function isAcceptedFile(file: FileLike): boolean {
  if (file.type.startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function sameFile(a: FileLike, b: FileLike): boolean {
  return a.name === b.name && a.size === b.size;
}

/* Suma una tanda de archivos elegidos a los ya adjuntos. Cada archivo malo
   (vacío, demasiado grande, tipo no permitido, duplicado) se descarta con SU
   aviso y los válidos de la tanda entran igual. Los topes de cantidad y peso
   total son de la tanda completa: si los pasa, no entra ninguno de ella. */
export function addFiles<T extends FileLike>(current: T[], picked: T[]): { files: T[]; issues: FileIssue[] } {
  const issues: FileIssue[] = [];
  const accepted: T[] = [];

  for (const f of picked) {
    if (f.size === 0) issues.push({ code: 'empty', file: f.name });
    else if (f.size > MAX_TOTAL_BYTES) issues.push({ code: 'fileTooLarge', file: f.name });
    else if (!isAcceptedFile(f)) issues.push({ code: 'type', file: f.name });
    else if (current.some((c) => sameFile(c, f)) || accepted.some((a) => sameFile(a, f)))
      issues.push({ code: 'duplicate', file: f.name });
    else accepted.push(f);
  }

  const merged = [...current, ...accepted];
  if (merged.length > MAX_FILES) return { files: current, issues: [...issues, { code: 'tooMany' }] };
  if (merged.reduce((acc, f) => acc + f.size, 0) > MAX_TOTAL_BYTES) {
    return { files: current, issues: [...issues, { code: 'tooLarge' }] };
  }
  return { files: merged, issues };
}

export type MessageIssue = 'empty' | 'tooLong';
export function validateMessage(message: string): MessageIssue | null {
  if (!message.trim()) return 'empty';
  if (message.length > MAX_MESSAGE_LENGTH) return 'tooLong';
  return null;
}

export type EmailIssue = 'empty' | 'invalid';
export function validateEmail(email: string): EmailIssue | null {
  const value = email.trim();
  if (!value) return 'empty';
  if (!EMAIL_RE.test(value)) return 'invalid';
  return null;
}

/* Errores del envío. Cada uno tiene su texto (contact.submit.<código>). */
export type SubmitError =
  | 'invalid'
  | 'invalidEmail'
  | 'tooLong'
  | 'fileType'
  | 'attachments'
  | 'rateLimited'
  | 'delivery'
  | 'unconfigured'
  | 'network'
  | 'generic';

/* Status HTTP (y el `error` del JSON, si vino) → código de error. */
export function errorFromResponse(status: number, body?: { error?: unknown } | null): SubmitError {
  const detail = typeof body?.error === 'string' ? body.error : '';
  switch (status) {
    case 400:
      if (detail === 'invalid email') return 'invalidEmail';
      if (detail === 'message too long') return 'tooLong';
      if (detail === 'file type not allowed' || detail === 'empty file') return 'fileType';
      return 'invalid';
    case 413:
      return 'attachments';
    case 429:
      return 'rateLimited';
    case 502:
      return 'delivery';
    case 503:
      return 'unconfigured';
    default:
      return 'generic';
  }
}

/* Reintentar tal cual solo sirve si el problema no está en los datos: con un
   400/413 hay que corregir algo antes, y el botón vuelve a "Enviar". */
export function canRetry(error: SubmitError): boolean {
  return !['invalid', 'invalidEmail', 'tooLong', 'fileType', 'attachments'].includes(error);
}

export type SendResult = { ok: true } | { ok: false; error: SubmitError };

export type SendInput = {
  url: string;
  message: string;
  email: string;
  files: Blob[] | File[];
  /* Honeypot: un humano no lo ve ni lo llena. */
  website?: string;
};

/* POST multipart con timeout. Nunca lanza: todo termina en un SendResult. */
export async function sendContact(
  input: SendInput,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<SendResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SUBMIT_TIMEOUT_MS);
  try {
    const body = new FormData();
    body.append('subject', input.message);
    body.append('email', input.email.trim());
    body.append('website', input.website ?? '');
    /* Sin Content-Type manual: el navegador tiene que poner el boundary del
       multipart, y fijarlo a mano rompe el parseo en multer. */
    for (const f of input.files) body.append('files', f);
    const res = await fetchImpl(input.url, { method: 'POST', body, signal: controller.signal });
    if (res.ok) return { ok: true };
    let json: { error?: unknown } | null = null;
    try {
      json = await res.json();
    } catch {
      /* cuerpo no JSON (proxy, HTML de error): alcanza con el status */
    }
    return { ok: false, error: errorFromResponse(res.status, json) };
  } catch {
    /* fetch rechaza por red caída, CORS o por el abort del timeout. */
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/* Candado de un solo vuelo: mientras una llamada está en curso, las demás se
   ignoran (devuelven undefined). Es síncrono a propósito: el estado de React
   recién se actualiza en el próximo render, y dos clics seguidos alcanzan a
   pasar antes de que el botón se deshabilite. */
export function createSingleFlight() {
  let busy = false;
  return async function run<R>(fn: () => Promise<R>): Promise<R | undefined> {
    if (busy) return undefined;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  };
}
