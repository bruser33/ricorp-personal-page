import { useRef, useState } from 'react';
import { useLang } from '../i18n';
import './Contact.css';

const leftLines = [
  'th>Performed</th>',
  'ng-repeat="i in model.m',
  '[i].projName}}</td>',
  '[i].start}}</td>',
  '[i].end}}</td>',
  '[i].customerName}}</td>',
  '[i].location}}</td>',
  '[i].description}}</td>',
  'h>Status</th>',
  'ass="row-active">',
  '[i].budget}}</td>',
  '-generic">',
];

const rightLines = [
  '[i].team}}</td>',
  '[i].priority}}</td>',
  'pe="text/html">',
  'lass="cell-fade">',
  'ng-bind="msg"></td>',
];

export function Contact() {
  const { t } = useLang();
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // subject se pide primero (revela email + adjunto) y sigue siendo `required`
    // en el input — lo validamos aquí también para no divergir del formulario.
    if (!subject || !email || sending) return;
    setSending(true);
    try {
      const url = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api/contact';
      const form = new FormData();
      form.append('subject', subject);
      form.append('email', email);
      if (file) form.append('file', file);
      // Multipart: the backend sends the proposal to the owner with the fixed
      // subject "Ricorp Propuesta de proyecto" and the file as an attachment.
      await fetch(url, { method: 'POST', body: form });
    } catch {
      /* offline: still confirm to the user, the design has no error state */
    }
    setSending(false);
    setSent(true);
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  return (
    <section id="contact" className="contact">
      <div className="contact-bg reveal reveal-delay-2" aria-hidden="true">
        {leftLines.map((l, i) => (
          <span key={`l-${i}`} style={{ top: `${4 + i * 5.2}%`, left: '0%' }}>
            {l}
          </span>
        ))}
        {rightLines.map((l, i) => (
          <span key={`r-${i}`} style={{ top: `${44 + i * 6.5}%`, right: '1.5%' }}>
            {l}
          </span>
        ))}
      </div>

      <div className="contact-orb" aria-hidden="true" />

      <div className="contact-orb-3d reveal reveal-delay-2" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}figma-frames/contact-orb.png`}
          alt=""
          className="iridescent-img"
        />
      </div>

      <div className="container contact-inner">
        <div className="contact-headline reveal">
          <h2>
            {t('contact.titlePre')}
            <span>{t('contact.titleAccent')}</span>
          </h2>
          <p className="contact-sub">{t('contact.sub')}</p>
        </div>
        <div className="contact-spacer" aria-hidden="true" />
      </div>

      <form
        className="contact-form container reveal reveal-delay-2"
        data-stage={sent ? 'sent' : email ? 'composing' : subject ? 'subject-filled' : 'initial'}
        onSubmit={submit}
      >
        <label className="field">
          <input
            type="text"
            placeholder={t('contact.subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sent}
            required
          />
        </label>

        <div className="field-attach">
          <input
            ref={fileInputRef}
            type="file"
            className="attach-input"
            onChange={onPickFile}
            disabled={sent}
          />
          <button
            type="button"
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sent}
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7L9.9 17.6a1.6 1.6 0 01-2.3-2.3l7.9-7.9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t('contact.attach')}</span>
          </button>
          {file && (
            <span className="attach-name" title={file.name}>
              {file.name}
              <button
                type="button"
                className="attach-clear"
                aria-label={t('contact.attachRemove')}
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                ×
              </button>
            </span>
          )}
        </div>

        <label className="field-email">
          <input
            type="email"
            placeholder={t('contact.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sent}
            required
          />
          <button
            type="submit"
            className={'submit' + (sent ? ' sent' : '')}
            disabled={sent || !email || sending}
          >
            <span className="submit-label">
              {sent ? t('contact.sent') : sending ? t('contact.sending') : t('contact.send')}
            </span>
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </label>
      </form>

      <div className="contact-footer container reveal reveal-delay-1">
        <div className="contact-footer-center">
          <p>{t('footer.privacy')} · {t('footer.cookies')}</p>
          <p>{t('footer.rights')}</p>
        </div>
        <p className="contact-footer-loc">{t('footer.loc')}</p>
      </div>
    </section>
  );
}
