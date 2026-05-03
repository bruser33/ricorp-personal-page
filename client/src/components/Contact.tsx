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
          <span key={`r-${i}`} style={{ top: `${50 + i * 7}%`, right: '0%' }}>
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
            <linearGradient id="ribbonIris2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C9B8FF" />
              <stop offset="40%" stopColor="#E4C8FF" />
              <stop offset="70%" stopColor="#FFC4DC" />
              <stop offset="100%" stopColor="#B8D4FF" />
            </linearGradient>
            <linearGradient id="ribbonShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8268B8" stopOpacity="0" />
              <stop offset="55%" stopColor="#5B4380" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3A2A60" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="ribbonHi" x1="20%" y1="15%" x2="55%" y2="65%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
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
          {/* ambient glow */}
          <ellipse cx="160" cy="200" rx="155" ry="135" fill="url(#ribbonGlow)" />

          {/* back band — curls behind */}
          <path
            d="M85 110 C55 160 55 230 105 270 C150 305 220 295 245 250 C265 215 245 175 210 175 C180 175 175 205 195 220 C215 232 240 225 245 200"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="46"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d="M85 110 C55 160 55 230 105 270 C150 305 220 295 245 250 C265 215 245 175 210 175 C180 175 175 205 195 220 C215 232 240 225 245 200"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="46"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* drop shadow under front band */}
          <path
            d="M215 60 C260 82 290 138 270 205 C248 280 175 312 115 290 C75 274 65 235 92 215 C115 198 145 220 130 240"
            fill="none"
            stroke="url(#ribbonIris)"
            strokeWidth="54"
            strokeLinecap="round"
            filter="url(#ribbonShadow)"
            opacity="0.32"
            transform="translate(6 12)"
          />

          {/* front band — main sweep */}
          <path
            d="M215 60 C260 82 290 138 270 205 C248 280 175 312 115 290 C75 274 65 235 92 215 C115 198 145 220 130 240"
            fill="none"
            stroke="url(#ribbonIris2)"
            strokeWidth="54"
            strokeLinecap="round"
          />
          <path
            d="M215 60 C260 82 290 138 270 205 C248 280 175 312 115 290 C75 274 65 235 92 215 C115 198 145 220 130 240"
            fill="none"
            stroke="url(#ribbonShade)"
            strokeWidth="54"
            strokeLinecap="round"
            opacity="0.45"
          />

          {/* specular highlight on top-front lobe */}
          <path
            d="M218 68 C254 90 278 138 264 195"
            fill="none"
            stroke="url(#ribbonHi)"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d="M225 78 C246 92 258 122 252 158"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* top tail flick */}
          <path
            d="M205 50 C220 32 245 32 258 44 C246 40 228 46 215 60Z"
            fill="url(#ribbonIris)"
            opacity="0.95"
          />

          {/* small inner-curl highlight */}
          <ellipse
            cx="195"
            cy="220"
            rx="12"
            ry="6"
            fill="#FFFFFF"
            opacity="0.4"
            transform="rotate(-15 195 220)"
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
