import { useState } from 'react';
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
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !email) return;
    try {
      const url = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api/contact';
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, email }),
      });
    } catch {}
    setSent(true);
  }

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
            disabled={sent || !email}
          >
            <span className="submit-label">{sent ? t('contact.sent') : t('contact.send')}</span>
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
