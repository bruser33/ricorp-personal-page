import { useState } from 'react';
import { useLang } from '../i18n';
import { Footline } from './Footline';
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

/* Lluvia de código de fondo. Cada línea lleva marcada su columna porque en
   mobile la de la derecha se apaga: ahí el fondo queda confinado a una franja
   angosta del borde izquierdo, y una línea anclada a `right` caería justo sobre
   el titular y el campo de email. */
function CodeRain() {
  return (
    <div className="contact-bg reveal reveal-delay-2" aria-hidden="true">
      {leftLines.map((l, i) => (
        <span key={`l-${i}`} className="code-line code-line-left" style={{ top: `${4 + i * 5.2}%`, left: '0%' }}>
          {l}
        </span>
      ))}
      {rightLines.map((l, i) => (
        <span key={`r-${i}`} className="code-line code-line-right" style={{ top: `${44 + i * 6.5}%`, right: '1.5%' }}>
          {l}
        </span>
      ))}
    </div>
  );
}

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
    } catch {
      /* Silencio a propósito: si el backend local no está arriba, la UI igual
         pasa al estado "sent" (la coreografía del formulario no depende de la
         red). Lo único que se pierde es el registro del mensaje. */
    }
    setSent(true);
  }

  return (
    <>
      {/* Pantalla 1 — SOLO el titular + el subtítulo violeta, centrados
          verticalmente. Es la entrada del bloque de contacto (a esto apunta el
          nav del header) y por eso no lleva orbe, lluvia de código, formulario
          ni footline: en el diseño son dos pantallas con transiciones distintas,
          y meterlas en una sola las mostraba todas de golpe. */}
      <section id="contact" className="contact contact-intro">
        <div className="container contact-inner">
          <ContactHeadline />
        </div>
      </section>

      {/* Pantalla 2 — el contacto completo: mismo titular arriba, orbe a la
          derecha, lluvia de código de fondo, formulario y footline al pie. */}
      <section id="contact-form" className="contact contact-compose">
        <CodeRain />

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

        {/* Footline compartido (mismo que carrusel y Análisis): antes esta
            sección tenía su propia copia y en mobile se llegaban a ver dos. */}
        <Footline />
      </section>
    </>
  );
}
