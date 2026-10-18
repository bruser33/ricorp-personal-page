import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n';
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_BYTES,
  MESSAGE_COUNTER_FROM,
  addFiles,
  canRetry,
  createSingleFlight,
  formatBytes,
  sendContact,
  validateEmail,
  validateMessage,
  type EmailIssue,
  type FileIssue,
  type MessageIssue,
  type SubmitError,
} from '../lib/contactValidation';
import { Footline } from './Footline';
import './Contact.css';

/* Los límites y la validación viven en lib/contactValidation.ts (funciones
   puras con tests en vitest); el server revalida los MISMOS valores. */

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function Contact() {
  const { t } = useLang();
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  /* Honeypot: campo oculto que un humano no ve; si llega lleno, el server
     finge éxito sin enviar correo. */
  const [website, setWebsite] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  /* Avisos de adjuntos de la última tanda: puede haber varios a la vez (un
     .exe y un duplicado), y cada uno lleva su propio texto. */
  const [fileIssues, setFileIssues] = useState<FileIssue[]>([]);
  const [messageIssue, setMessageIssue] = useState<MessageIssue | null>(null);
  const [emailIssue, setEmailIssue] = useState<EmailIssue | null>(null);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  /* Candado síncrono contra el doble clic: el `disabled` del botón recién se
     aplica en el próximo render. */
  const singleFlight = useMemo(() => createSingleFlight(), []);
  /* Coreografía de entrada/salida de la escena (ver Contact.css). Va con su
     propio observer y NO con el .reveal global porque el reveal es de una sola
     vez: acá la salida (título y orbe se desvanecen, el orbe se va a la derecha)
     y la re-entrada (se repite la secuencia) también son parte del diseño. */
  const sectionRef = useRef<HTMLElement>(null);
  /* Sin IntersectionObserver la escena arranca visible (nunca invisible). */
  const [live, setLive] = useState(() => typeof IntersectionObserver === 'undefined');
  /* El formulario entra una vez y se queda: la salida del video solo apaga
     título y orbe, y un campo a medio escribir no debe desvanecerse por un
     scroll parcial (p.ej. al abrir el teclado en mobile). */
  const [entered, setEntered] = useState(live);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    /* 35 % de la sección a la vista: con el snap la sección queda entera, y al
       irse hacia Proyectos o hacia abajo cruza este umbral antes de desaparecer,
       que es cuando la salida tiene que verse. */
    /* El ratio solo no alcanza: si la sección mide más de ~3 viewports (muchos
       adjuntos en mobile) nunca llegaría a 0.35 y la escena quedaría invisible.
       Por eso también cuenta que ocupe el 35 % del alto del viewport. */
    const io = new IntersectionObserver(
      ([entry]) => {
        const on =
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.35 ||
            entry.intersectionRect.height >= window.innerHeight * 0.35);
        setLive(on);
        if (on) setEntered(true);
      },
      { threshold: [0, 0.1, 0.2, 0.35, 0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sent = status === 'sent';
  const locked = sent || status === 'sending';
  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    /* Se limpia el input para que volver a elegir el MISMO archivo después de
       quitarlo vuelva a disparar el change (el value idéntico no emite evento). */
    e.target.value = '';
    if (!picked.length) return;

    const result = addFiles(files, picked);
    setFileIssues(result.issues);
    setFiles(result.files);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileIssues([]);
  }

  function fileIssueText(issue: FileIssue): string {
    const size = formatBytes(MAX_TOTAL_BYTES);
    switch (issue.code) {
      case 'tooMany':
        return t('contact.errorMaxFiles').replace('{n}', String(MAX_FILES));
      case 'tooLarge':
        return t('contact.errorMaxSize').replace('{size}', size);
      case 'fileTooLarge':
        return t('contact.errorFileTooLarge').replace('{file}', issue.file).replace('{size}', size);
      case 'type':
        return t('contact.errorFileType').replace('{file}', issue.file);
      case 'duplicate':
        return t('contact.errorDuplicate').replace('{file}', issue.file);
      case 'empty':
        return t('contact.errorEmptyFile').replace('{file}', issue.file);
    }
  }

  function submitErrorText(error: SubmitError): string {
    if (error === 'generic') return t('contact.error');
    return t(`contact.submit.${error}`)
      .replace('{n}', String(error === 'attachments' ? MAX_FILES : MAX_MESSAGE_LENGTH))
      .replace('{size}', formatBytes(MAX_TOTAL_BYTES));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    /* Validación propia (el form va con noValidate): cada error con su texto
       junto al campo, en vez del tooltip nativo que cambia según el navegador. */
    const mIssue = validateMessage(subject);
    /* De a un aviso por vez y en el orden de la pantalla: con el mensaje vacío
       el campo del email ni se ve todavía (stage initial). */
    const eIssue = mIssue ? null : validateEmail(email);
    setMessageIssue(mIssue);
    setEmailIssue(eIssue);
    if (mIssue || eIssue) return;

    await singleFlight(async () => {
      setStatus('sending');
      setSubmitError(null);
      const result = await sendContact({
        url: (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api/contact',
        message: subject,
        email,
        files,
        website,
      });
      if (result.ok) {
        setStatus('sent');
        return;
      }
      /* Antes cualquier fallo mostraba el mismo texto genérico; ahora cada
         status (400/413/429/502/503, red caída o timeout) tiene el suyo. */
      setSubmitError(result.error);
      setStatus('error');
    });
  }

  const retryable = submitError !== null && canRetry(submitError);
  const showCounter = subject.length >= MESSAGE_COUNTER_FROM;

  const stage = sent ? 'sent' : email ? 'composing' : subject ? 'subject-filled' : 'initial';

  return (
    /* UNA sola escena, como el prototipo: el glow (blob global, ver useBlobMorph
       en App.tsx) llega detrás del título, después entra el título, el orbe a su
       derecha y por último el campo. Antes eran dos secciones (#contact con el
       titular solo y #contact-form con el titular REPETIDO + formulario) y el
       título se leía dos veces. */
    <section ref={sectionRef} id="contact" className={'contact' + (live ? ' is-live' : '') + (entered ? ' has-entered' : '')}>
      {/* Halo móvil con grano: en ≤720px el blob global va display:none, así que
          el glow detrás del título lo pone este elemento (solo en mobile). */}
      <div className="contact-glow-mobile" aria-hidden="true" />

      {/* El orbe es el GIF animado del Figma (capa "yy3 1", 28 cuadros, vuelta de
          1.12s) pasado a WebP animado. Con movimiento reducido se sirve el PNG
          quieto: un WebP animado no se detiene con CSS. */}
      <div className="contact-orb-3d" aria-hidden="true">
        <picture>
          <source
            media="(prefers-reduced-motion: no-preference)"
            srcSet={`${import.meta.env.BASE_URL}figma-frames/contact-orb.webp`}
            type="image/webp"
          />
          <img
            src={`${import.meta.env.BASE_URL}figma-frames/contact-orb.png`}
            alt=""
            className="iridescent-img"
          />
        </picture>
      </div>

      <div className="container contact-inner">
        <div className="contact-headline">
          <h2>
            {t('contact.titlePre')}
            <span>{t('contact.titleAccent')}</span>
          </h2>
          <p className="contact-sub">{t('contact.sub')}</p>
        </div>
        <div className="contact-spacer" aria-hidden="true" />
      </div>

      <form className="contact-form container" data-stage={stage} onSubmit={submit} noValidate>
        {/* Honeypot: fuera de pantalla, sin foco por teclado y oculto para
            lectores de pantalla. Los bots que llenan todo lo delatan. */}
        <div className="contact-hp" aria-hidden="true">
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <label className={'field' + (showCounter ? ' has-counter' : '')}>
          <input
            type="text"
            placeholder={t('contact.subjectPlaceholder')}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              if (messageIssue) setMessageIssue(null);
            }}
            disabled={locked}
            required
            aria-invalid={messageIssue ? true : undefined}
            aria-describedby={messageIssue ? 'contact-message-error' : undefined}
          />
          {/* Contador solo cerca del tope; se pone rojo si lo pasa. */}
          {showCounter && (
            <span
              className={'field-counter' + (subject.length > MAX_MESSAGE_LENGTH ? ' over' : '')}
              aria-live="polite"
            >
              {t('contact.counter')
                .replace('{n}', String(subject.length))
                .replace('{max}', String(MAX_MESSAGE_LENGTH))}
            </span>
          )}
        </label>
        {messageIssue && (
          <p id="contact-message-error" className="form-error" role="alert">
            {messageIssue === 'empty'
              ? t('contact.errorMessageEmpty')
              : t('contact.errorMessageTooLong').replace('{n}', String(MAX_MESSAGE_LENGTH))}
          </p>
        )}

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
            {/* Sin texto de límites en reposo (pedido 2026-10-18): el límite se
                avisa recién si se pasa (fileError). Con archivos elegidos queda
                el contador. */}
            {files.length > 0 && (
              <span className="attach-hint">
                {`${files.length}/${MAX_FILES} · ${formatBytes(totalBytes)}`}
              </span>
            )}
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

          {fileIssues.length > 0 && (
            <div className="form-error" role="alert">
              {fileIssues.map((issue, i) => (
                <p key={`${issue.code}-${i}`}>{fileIssueText(issue)}</p>
              ))}
            </div>
          )}
        </div>

        {/* Mismo pill que el campo del mensaje (.field): antes era una línea
            suelta con borde inferior y se leía como otro formulario. El botón
            de enviar va adentro del pill, a la derecha. */}
        <label className="field field-email">
          <input
            type="email"
            placeholder={t('contact.emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailIssue) setEmailIssue(null);
            }}
            disabled={locked}
            required
            aria-invalid={emailIssue ? true : undefined}
            aria-describedby={emailIssue ? 'contact-email-error' : undefined}
          />
          {/* Sin `!email` en el disabled: el botón igual no se ve hasta que hay
              email (stage composing), y así Enter con el email vacío muestra
              el aviso propio en vez de no hacer nada. */}
          <button
            type="submit"
            className={'submit' + (sent ? ' sent' : '') + (status === 'error' ? ' failed' : '')}
            disabled={locked}
          >
            <span className="submit-label">
              {sent
                ? t('contact.sent')
                : status === 'sending'
                  ? t('contact.sending')
                  : status === 'error' && retryable
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

        {emailIssue && (
          <p id="contact-email-error" className="form-error" role="alert">
            {emailIssue === 'empty' ? t('contact.errorEmailEmpty') : t('contact.errorEmailInvalid')}
          </p>
        )}

        {status === 'error' && submitError && (
          <p className="form-error" role="alert">
            {submitErrorText(submitError)}
          </p>
        )}
      </form>

      {/* Políticas al pie de la escena de contacto (Footline compartido). */}
      <Footline />
    </section>
  );
}
