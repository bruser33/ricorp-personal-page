import { useState } from 'react';
import './Contact.css';

const leftLines = [
  'th>Performed</th>',
  'ng-repeat="i in model.m',
  '[i].projName}}</td>',
  '[i].start}}</td>',
  '[i].end}}</td>',
  '[i].customerName}}</td>',
];

const rightLines = [
  '[i].location}}</td>',
  '[i].description}}</td>',
  '-generic">',
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
      <div className="contact-bg reveal reveal-delay-2" aria-hidden="true">
        {leftLines.map((l, i) => (
          <span key={`l-${i}`} style={{ top: `${8 + i * 8}%`, left: '0%' }}>
            {l}
          </span>
        ))}
        {rightLines.map((l, i) => (
          <span key={`r-${i}`} style={{ top: `${58 + i * 10}%`, right: '0%' }}>
            {l}
          </span>
        ))}
      </div>

      <div className="contact-orb" aria-hidden="true" />

      <div className="contact-orb-3d reveal reveal-delay-2" aria-hidden="true">
        <svg viewBox="0 0 320 360" className="iridescent-svg">
          <defs>
            <linearGradient id="ribbonIris" x1="15%" y1="10%" x2="85%" y2="95%">
              <stop offset="0%" stopColor="#C9B8FF" />
              <stop offset="28%" stopColor="#E4C8FF" />
              <stop offset="52%" stopColor="#FFB8D8" />
              <stop offset="78%" stopColor="#B8D4FF" />
              <stop offset="100%" stopColor="#8FB8FF" />
            </linearGradient>
            <linearGradient id="ribbonShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7B5FA8" stopOpacity="0" />
              <stop offset="55%" stopColor="#5B4380" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3A2A60" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="ribbonHi" x1="20%" y1="20%" x2="60%" y2="70%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="ribbonGlow" cx="50%" cy="62%" r="55%">
              <stop offset="0%" stopColor="#B89CFF" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#8264D8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="ribbonShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <ellipse cx="160" cy="210" rx="135" ry="120" fill="url(#ribbonGlow)" />
          <path
            d="M95 95 C70 145 70 215 115 255 C150 285 215 280 240 240 C260 208 245 175 215 175 C190 175 185 200 200 215 C212 227 232 222 235 205"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="34"
            strokeLinecap="round"
            opacity="0.92"
          />
          <path
            d="M95 95 C70 145 70 215 115 255 C150 285 215 280 240 240 C260 208 245 175 215 175 C190 175 185 200 200 215 C212 227 232 222 235 205"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="34"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M205 70 C245 90 270 140 255 200 C238 268 170 300 120 280 C85 266 78 232 100 215 C120 200 140 218 132 235"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="42"
            strokeLinecap="round"
            filter="url(#ribbonShadow)"
            opacity="0.35"
            transform="translate(4 8)"
          />
          <path
            d="M205 70 C245 90 270 140 255 200 C238 268 170 300 120 280 C85 266 78 232 100 215 C120 200 140 218 132 235"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="42"
            strokeLinecap="round"
          />
          <path
            d="M205 70 C245 90 270 140 255 200 C238 268 170 300 120 280 C85 266 78 232 100 215 C120 200 140 218 132 235"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="42"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M210 80 C240 100 258 140 248 188"
            fill="none"
            stroke="url(#ribbonHi)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M198 62 C212 48 232 50 244 60 C232 56 218 60 208 72Z"
            fill="url(#ribbonIris)"
            opacity="0.9"
          />
        </svg>
      </div>

      <div className="container contact-inner">
        <div className="contact-headline reveal">
          <h2>
            Let's start a new <span>.project</span>
          </h2>
          <p className="contact-sub">What are you looking for?</p>
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
            placeholder="Write here..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sent}
            required
          />
        </label>
        <label className="field-email">
          <input
            type="email"
            placeholder="Enter your @email..."
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
            <span className="submit-label">{sent ? 'Sent!' : 'Send email'}</span>
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
          <p>Política de Privacidad · Política de Cookies</p>
          <p>© 2023 All rights reserved.</p>
        </div>
        <p className="contact-footer-loc">Santiago de Chile, Chile.</p>
      </div>
    </section>
  );
}
