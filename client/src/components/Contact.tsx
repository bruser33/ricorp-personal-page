import { useState } from 'react';
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
        <svg viewBox="0 0 320 360" className="iridescent-svg">
          <defs>
            <linearGradient id="ribL" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D4C4FF" />
              <stop offset="35%" stopColor="#E8D5FF" />
              <stop offset="65%" stopColor="#FFD0E4" />
              <stop offset="100%" stopColor="#A8C0FF" />
            </linearGradient>
            <linearGradient id="ribR" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#D4C4FF" />
              <stop offset="35%" stopColor="#E8D5FF" />
              <stop offset="65%" stopColor="#FFD0E4" />
              <stop offset="100%" stopColor="#A8C0FF" />
            </linearGradient>
            <linearGradient id="ribShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8268B8" stopOpacity="0" />
              <stop offset="55%" stopColor="#5B4380" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3A2A60" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="ribHi" x1="20%" y1="15%" x2="55%" y2="65%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="ribGlow" cx="50%" cy="55%" r="60%">
              <stop offset="0%" stopColor="#C8B0FF" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#8264D8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="ribShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* ambient violet glow */}
          <ellipse cx="160" cy="195" rx="150" ry="135" fill="url(#ribGlow)" />

          {/* === LEFT RIBBON (tilted ellipse, leans to top-left) === */}
          <ellipse
            cx="135"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="#3A2A60"
            strokeWidth="36"
            transform="rotate(-22 135 180)"
            filter="url(#ribShadow)"
            opacity="0.45"
          />
          <ellipse
            cx="135"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="url(#ribL)"
            strokeWidth="36"
            transform="rotate(-22 135 180)"
          />
          <ellipse
            cx="135"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="url(#ribShade)"
            strokeWidth="36"
            transform="rotate(-22 135 180)"
            opacity="0.45"
          />

          {/* === RIGHT RIBBON (mirrored, leans to top-right) === */}
          <ellipse
            cx="185"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="#3A2A60"
            strokeWidth="36"
            transform="rotate(22 185 180)"
            filter="url(#ribShadow)"
            opacity="0.45"
          />
          <ellipse
            cx="185"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="url(#ribR)"
            strokeWidth="36"
            transform="rotate(22 185 180)"
          />
          <ellipse
            cx="185"
            cy="180"
            rx="68"
            ry="118"
            fill="none"
            stroke="url(#ribShade)"
            strokeWidth="36"
            transform="rotate(22 185 180)"
            opacity="0.45"
          />

          {/* === Re-paint TOP arc of LEFT ribbon so it appears over right at top crossing === */}
          {/* Approximate top-arc with bezier matching the rotated ellipse */}
          <path
            d="M85 95 C95 70 130 60 165 80 C195 96 215 130 215 175"
            fill="none"
            stroke="url(#ribL)"
            strokeWidth="36"
            strokeLinecap="round"
          />
          <path
            d="M85 95 C95 70 130 60 165 80 C195 96 215 130 215 175"
            fill="none"
            stroke="url(#ribShade)"
            strokeWidth="36"
            strokeLinecap="round"
            opacity="0.4"
          />

          {/* === Specular highlights === */}
          {/* Left ribbon shine */}
          <path
            d="M95 110 C108 90 130 78 152 88"
            fill="none"
            stroke="url(#ribHi)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M105 115 C118 100 135 92 150 96"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.55"
          />
          {/* Right ribbon shine */}
          <path
            d="M168 88 C190 78 215 90 230 110"
            fill="none"
            stroke="url(#ribHi)"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M175 96 C195 92 215 102 224 115"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.5"
          />

          {/* Bottom crease where right ribbon goes over left */}
          <path
            d="M150 270 C160 275 175 275 185 270"
            fill="none"
            stroke="#3A2A60"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.4"
          />

          {/* Top tail flicks (one per ribbon) */}
          <path
            d="M85 95 C75 78 88 60 105 65 C92 70 85 82 85 95Z"
            fill="url(#ribL)"
            opacity="0.95"
          />
          <path
            d="M236 95 C246 78 232 60 215 65 C228 70 236 82 236 95Z"
            fill="url(#ribR)"
            opacity="0.95"
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
