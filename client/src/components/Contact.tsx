import { useMemo, useState } from 'react';
import { useLang } from '../i18n';
import { Footline } from './Footline';
import './Contact.css';

/* Límites de adjuntos. Viven acá como constantes exportadas para que no haya
   números sueltos repetidos entre la validación, el hint y los tests; el server
   revalida los MISMOS valores (server/src/index.js) porque el cliente es una
   sugerencia, no la autoridad. */
export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB entre todos los archivos
export const ACCEPTED_FILE_TYPES = 'image/*,.pdf,.doc,.docx,.txt,.zip';

/* Tamaño legible: KB/MB con un decimal, sin dependencias. No se exporta a
   propósito: react-refresh solo tolera exports de componentes y de constantes,
   y sacar una función de acá rompería el fast refresh del módulo. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

/* El titular es EL MISMO en las dos pantallas de contacto: la primera lo muestra
   solo (pantalla de entrada) y la segunda lo repite arriba del formulario. Vive
   en un subcomponente y no duplicado en el JSX para que copy y coreografía de
   entrada no se desincronicen entre ambas. */
function ContactHeadline() {
  const { t } = useLang();
  return (
    <div className="contact-headline reveal">
      <h2>
        {t('contact.titlePre')}
        <span>{t('contact.titleAccent')}</span>
      </h2>
      <p className="contact-sub">{t('contact.sub')}</p>
    </div>
  );
}

export function Contact() {
  const { t } = useLang();
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  const sent = status === 'sent';
  const locked = sent || status === 'sending';
  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    /* Se limpia el input para que volver a elegir el MISMO archivo después de
       quitarlo vuelva a disparar el change (el value idéntico no emite evento). */
    e.target.value = '';
    if (!picked.length) return;

    const merged = [...files];
    for (const f of picked) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }

    if (merged.length > MAX_FILES) {
      setFileError(t('contact.errorMaxFiles').replace('{n}', String(MAX_FILES)));
      return;
    }
    if (merged.reduce((acc, f) => acc + f.size, 0) > MAX_TOTAL_BYTES) {
      setFileError(t('contact.errorMaxSize').replace('{size}', formatBytes(MAX_TOTAL_BYTES)));
      return;
    }

    setFileError(null);
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !email || locked) return;
    setStatus('sending');
    try {
      const url = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api/contact';
      const body = new FormData();
      body.append('subject', subject);
      body.append('email', email);
      /* Sin Content-Type manual: el navegador tiene que poner el boundary del
         multipart, y fijarlo a mano rompe el parseo en multer. */
      for (const f of files) body.append('files', f);
      const res = await fetch(url, { method: 'POST', body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch {
      /* Antes esto se tragaba el error y mostraba "Enviado": el mensaje se perdía
         sin que nadie se enterara. Ahora queda un estado visible y reintentable. */
      setStatus('error');
    }
  }

  const stage = sent ? 'sent' : email ? 'composing' : subject ? 'subject-filled' : 'initial';

  return (
    <>
      {/* Pantalla 1 — SOLO el titular + el subtítulo violeta, centrados
          verticalmente. Es la entrada del bloque de contacto (a esto apunta el
          nav del header) y por eso no lleva orbe, formulario ni footline: en el
          diseño son dos pantallas con transiciones distintas, y meterlas en una
          sola las mostraba todas de golpe. */}
      <section id="contact" className="contact contact-intro">
        <div className="container contact-inner">
          <ContactHeadline />
        </div>
      </section>

      {/* Pantalla 2 — el contacto completo: mismo titular arriba, orbe a la
          derecha, formulario y footline al pie. El fondo es el de la página. */}
      <section id="contact-form" className="contact contact-compose">
        <div className="contact-orb" aria-hidden="true" />

        <div className="contact-orb-3d reveal reveal-delay-2" aria-hidden="true">
          <img
            src={`${import.meta.env.BASE_URL}figma-frames/contact-orb.png`}
            alt=""
            className="iridescent-img"
          />
        </div>

        <div className="container contact-inner">
          <ContactHeadline />
          <div className="contact-spacer" aria-hidden="true" />
        </div>

        <form className="contact-form container reveal reveal-delay-2" data-stage={stage} onSubmit={submit}>
          <label className="field">
            <input
              type="text"
              placeholder={t('contact.subjectPlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={locked}
              required
            />
          </label>

          {/* Adjuntos. El input queda oculto pero FOCUSABLE (no display:none) para
              que el label pueda mostrar el foco de teclado con el selector hermano. */}
          <div className="field-attach">
            <div className="attach-row">
              <input
                id="contact-files"
                className="file-input"
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                onChange={pickFiles}
                disabled={locked}
              />
              <label className="attach-label" htmlFor="contact-files">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{t('contact.attach')}</span>
              </label>
              <span className="attach-hint">
                {files.length > 0
                  ? `${files.length}/${MAX_FILES} · ${formatBytes(totalBytes)}`
                  : t('contact.attachHint')
                      .replace('{n}', String(MAX_FILES))
                      .replace('{size}', formatBytes(MAX_TOTAL_BYTES))}
              </span>
            </div>

            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li className="file-chip" key={`${f.name}-${f.size}-${i}`}>
                    <span className="file-name" title={f.name}>
                      {f.name}
                    </span>
                    <span className="file-size">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      className="file-remove"
                      onClick={() => removeFile(i)}
                      disabled={locked}
                      aria-label={`${t('contact.removeFile')} ${f.name}`}
                    >
                      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {fileError && (
              <p className="form-error" role="alert">
                {fileError}
              </p>
            )}
          </div>

          <label className="field-email">
            <input
              type="email"
              placeholder={t('contact.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={locked}
              required
            />
            <button
              type="submit"
              className={'submit' + (sent ? ' sent' : '') + (status === 'error' ? ' failed' : '')}
              disabled={locked || !email}
            >
              <span className="submit-label">
                {sent
                  ? t('contact.sent')
                  : status === 'sending'
                    ? t('contact.sending')
                    : status === 'error'
                      ? t('contact.retry')
                      : t('contact.send')}
              </span>
              {sent ? (
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </label>

          {status === 'error' && (
            <p className="form-error" role="alert">
              {t('contact.error')}
            </p>
          )}
        </form>

        {/* Footline compartido (mismo que carrusel y Análisis): antes esta
            sección tenía su propia copia y en mobile se llegaban a ver dos. */}
        <Footline />
      </section>
    </>
  );
}
