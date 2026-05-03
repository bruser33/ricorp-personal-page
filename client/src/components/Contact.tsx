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
            <linearGradient id="ribbonIris" x1="20%" y1="5%" x2="80%" y2="95%">
              <stop offset="0%" stopColor="#D4C4FF" />
              <stop offset="25%" stopColor="#E8D5FF" />
              <stop offset="50%" stopColor="#FFD0E4" />
              <stop offset="75%" stopColor="#C8DFFF" />
              <stop offset="100%" stopColor="#A8C0FF" />
            </linearGradient>
            <linearGradient id="ribbonIris2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E4D0FF" />
              <stop offset="35%" stopColor="#FFD8E8" />
              <stop offset="70%" stopColor="#D8C4FF" />
              <stop offset="100%" stopColor="#B8C8FF" />
            </linearGradient>
            <linearGradient id="ribbonShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8268B8" stopOpacity="0" />
              <stop offset="55%" stopColor="#5B4380" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#3A2A60" stopOpacity="0.72" />
            </linearGradient>
            <linearGradient id="ribbonHi" x1="20%" y1="15%" x2="55%" y2="65%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="ribbonGlow" cx="50%" cy="58%" r="62%">
              <stop offset="0%" stopColor="#C8B0FF" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#8264D8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="ribbonShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          {/* ambient violet glow underneath */}
          <ellipse cx="160" cy="200" rx="155" ry="135" fill="url(#ribbonGlow)" />

          {/* === RIBBON A (back outer band, drawn first/back layer) === */}
          {/* Drop shadow under outer band */}
          <path
            d="M225 55 C285 80 305 145 285 210 C260 285 175 320 105 290 C55 268 35 215 55 165 C75 115 130 95 175 110"
            fill="none"
            stroke="#3A2A60"
            strokeWidth="50"
            strokeLinecap="round"
            filter="url(#ribbonShadow)"
            opacity="0.45"
            transform="translate(6 14)"
          />
          {/* Outer band base */}
          <path
            d="M225 55 C285 80 305 145 285 210 C260 285 175 320 105 290 C55 268 35 215 55 165 C75 115 130 95 175 110"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="50"
            strokeLinecap="round"
          />
          {/* Outer band shading (darker on lower-right curl) */}
          <path
            d="M225 55 C285 80 305 145 285 210 C260 285 175 320 105 290 C55 268 35 215 55 165 C75 115 130 95 175 110"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="50"
            strokeLinecap="round"
            opacity="0.5"
          />

          {/* === RIBBON B (inner band, crosses over outer at center, under at bottom) === */}
          {/* Inner band base — a smaller loop tilted across the outer */}
          <path
            d="M85 175 C105 130 175 130 215 165 C255 200 240 260 195 270 C150 280 120 245 130 210 C137 185 165 178 180 195"
            fill="none"
            stroke="url(#ribbonIris2)"
            strokeWidth="42"
            strokeLinecap="round"
          />
          {/* Inner band shading */}
          <path
            d="M85 175 C105 130 175 130 215 165 C255 200 240 260 195 270 C150 280 120 245 130 210 C137 185 165 178 180 195"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="42"
            strokeLinecap="round"
            opacity="0.5"
          />

          {/* === Re-paint top section of OUTER band so it appears over inner at top === */}
          <path
            d="M175 110 C200 105 220 80 225 55 C268 70 295 110 295 155"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="50"
            strokeLinecap="round"
          />
          <path
            d="M175 110 C200 105 220 80 225 55 C268 70 295 110 295 155"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="50"
            strokeLinecap="round"
            opacity="0.4"
          />

          {/* === Specular highlights to reinforce 3D feel === */}
          {/* Top-right outer band shine */}
          <path
            d="M232 65 C268 88 290 122 290 158"
            fill="none"
            stroke="url(#ribbonHi)"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d="M240 75 C264 92 280 118 282 145"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Inner band shine on top arc */}
          <path
            d="M115 168 C140 145 175 142 200 155"
            fill="none"
            stroke="url(#ribbonHi)"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.7"
          />

          {/* Crossing crease (subtle dark line where outer goes over inner) */}
          <path
            d="M165 110 C175 130 180 150 178 165"
            fill="none"
            stroke="#3A2A60"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.35"
          />

          {/* Top-right tail flick */}
          <path
            d="M218 48 C232 28 258 28 270 42 C258 38 240 44 226 60Z"
            fill="url(#ribbonIris)"
            opacity="0.95"
          />

          {/* Inner-curl center highlight */}
          <ellipse
            cx="160"
            cy="220"
            rx="14"
            ry="6"
            fill="#FFFFFF"
            opacity="0.35"
            transform="rotate(-12 160 220)"
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
