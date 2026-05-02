import { useState } from 'react';
import './Contact.css';

const codeLines = [
  '<th>Performed</th>',
  'ng-repeat="i in model.m',
  '[i].projName}}</td>',
  '[i].start}}</td>',
  '[i].end}}</td>',
  '[i].customerName}}</td>',
  '[i].location}}</td>',
  '[i].description}}</td>',
];

export function Contact() {
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
      <div className="contact-bg" aria-hidden="true">
        {codeLines.map((l, i) => (
          <span
            key={i}
            style={{
              top: `${8 + i * 6}%`,
              left: `${(i % 2) * 3}%`,
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="contact-orb" aria-hidden="true" />
      <div className="container contact-inner">
        <div className="contact-headline">
          <h2>
            Let's start a new<br />
            <span>.project</span>
          </h2>
          <p className="contact-sub">What are you looking for?</p>
        </div>
        <form className="contact-form" onSubmit={submit}>
          <label className="field">
            <input
              type="text"
              placeholder="Branding for a new App."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </label>
          <label className="field-email">
            <input
              type="email"
              placeholder="Customer101@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" className={'submit' + (sent ? ' sent' : '')}>
            {sent ? (
              <>
                Sent!{' '}
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            ) : (
              <>
                Send <span aria-hidden>→</span>
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
