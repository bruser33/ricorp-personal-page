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

      <div className="contact-orb-3d" aria-hidden="true">
        <svg viewBox="0 0 320 320" className="iridescent-svg">
          <defs>
            <radialGradient id="orb1" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#A8D8FF" stopOpacity="0.9" />
              <stop offset="30%" stopColor="#B8A0FF" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#FF8EC7" stopOpacity="0.85" />
              <stop offset="85%" stopColor="#994A7B" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#343CFF" stopOpacity="0.5" />
            </radialGradient>
            <radialGradient id="orb2" cx="60%" cy="60%" r="50%">
              <stop offset="0%" stopColor="#80FFEA" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#8080FF" stopOpacity="0.3" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <filter id="orbGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M160 40 C220 60 280 100 270 160 C260 220 200 260 160 280 C120 260 60 220 50 160 C40 100 100 60 160 40Z"
            fill="url(#orb1)"
            opacity="0.85"
            filter="url(#orbGlow)"
          />
          <path
            d="M160 60 C210 80 255 115 245 165 C235 215 185 250 160 265 C135 250 85 215 75 165 C65 115 110 80 160 60Z"
            fill="url(#orb2)"
            opacity="0.7"
          />
          <path
            d="M100 80 Q160 20 220 80 Q260 120 220 170 Q180 210 160 190 Q140 170 120 160 Q80 140 100 80Z"
            fill="rgba(180,160,255,0.35)"
            filter="url(#orbGlow)"
          />
          <path
            d="M200 200 Q240 230 200 260 Q160 290 120 260 Q80 230 120 200 Q150 185 160 195 Q170 205 200 200Z"
            fill="rgba(100,200,255,0.3)"
            filter="url(#orbGlow)"
          />
          <ellipse
            cx="130"
            cy="110"
            rx="30"
            ry="20"
            fill="rgba(255,255,255,0.5)"
            opacity="0.7"
            style={{ filter: 'blur(6px)' }}
          />
        </svg>
      </div>

      <div className="container contact-inner">
        <div className="contact-headline reveal">
          <h2>
            Let's start a new<br />
            <span>.project</span>
          </h2>
          <p className="contact-sub">What are you looking for?</p>
        </div>
        <div className="contact-spacer" aria-hidden="true" />
      </div>

      <form className="contact-form container reveal reveal-delay-2" onSubmit={submit}>
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
    </section>
  );
}
