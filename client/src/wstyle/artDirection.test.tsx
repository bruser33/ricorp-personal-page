/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Membership } from './components/Extras';
import Stat from './components/Stat';
import type { SiteContent } from './content';

// SPEC-29: dirección de arte (cifra compuesta, carnet del club, token único de tracking de versalitas).
// Todas las hojas de wstyle leídas del disco (vitest vacía los .css importados, incluso con ?raw).
const DIR = import.meta.dirname;
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
});
const CSS: Record<string, string> = Object.fromEntries(cssFiles(DIR).map((f) => [`./${relative(DIR, f)}`, readFileSync(f, 'utf8')]));

describe('tracking de versalitas (SPEC-29 e)', () => {
  const root = CSS['./wstyle.css'];
  it('define --tracking-caps (.24em) y --tracking-caps-tight (.18em) en :root', () => {
    expect(root).toMatch(/--tracking-caps:\s*\.24em;/);
    expect(root).toMatch(/--tracking-caps-tight:\s*\.18em;/);
  });
  it('ningún letter-spacing ≥ .14em fuera de los tokens', () => {
    const bad: string[] = [];
    expect(Object.keys(CSS).length).toBeGreaterThan(5);
    for (const [f, text] of Object.entries(CSS)) {
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/letter-spacing:\s*\.([0-9]+)em/g)) if (parseFloat(`.${m[1]}`) >= .14) bad.push(`${f}:${i + 1} ${m[0]}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it('nav, etiquetas, hint, botones, píldora, franja demo, loader y h3 usan el token', () => {
    const all = Object.values(CSS).join('\n');
    for (const sel of ['.nav-links a', '.eyebrow', '.hint', '.btn', '.book-fab', '.demo-strip', '.loader__pct', 'h3']) {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(all, sel).toMatch(new RegExp(`(^|[\\s,}])${esc}\\s*\\{[^}]*letter-spacing:\\s*var\\(--tracking-caps(-tight)?\\)`, 'm'));
    }
  });
});

describe('cifra destacada (SPEC-29 a)', () => {
  it('cifra + palabra + nota', () => {
    const html = renderToStaticMarkup(<Stat stat={{ value: '1', label: 'silla.', note: 'Toda la atención.' }} />);
    expect(html).toContain('class="stat__value"');
    expect(html).toContain('class="stat__label"');
    expect(html).toContain('Toda la atención.');
  });
  it('sin label ni nota: solo la cifra, sin cajas vacías', () => {
    const html = renderToStaticMarkup(<Stat stat={{ value: '1', label: ' ' }} />);
    expect(html).toContain('stat__value');
    expect(html).not.toContain('stat__label');
    expect(html).not.toContain('<em');
  });
  it('sin valor no se publica', () => {
    expect(renderToStaticMarkup(<Stat stat={{ label: 'silla.' }} />)).toBe('');
    expect(renderToStaticMarkup(<Stat stat={undefined} />)).toBe('');
  });
});

describe('carnet del club (SPEC-29 c)', () => {
  const base: SiteContent = { membership: { name: 'Club WS', priceCLP: 25000, period: 'mes', perks: ['2 cortes al mes'], note: 'Sin matrícula.' } };
  const card = (html: string) => html.slice(html.indexOf('<article'), html.indexOf('</article>') + 10);
  it('encabezado "Club" + nombre, precio, perks, nota y CTA dentro de la tarjeta', () => {
    const html = card(renderToStaticMarkup(<Membership site={base} booking="https://wa.me/1" label="06 — Membresía" />));
    expect(html).toMatch(/class="member__kicker"[^>]*>Club</);
    expect(html).toContain('Club WS');
    expect(html).toContain('member__price');
    expect(html).toContain('<li>2 cortes al mes</li>');
    expect(html).toContain('Sin matrícula.');
    expect(html).toContain('Quiero el club');
  });
  it('sin perks ni precio: sin cajas vacías', () => {
    const site: SiteContent = { membership: { name: 'Club WS', perks: [' '] } };
    const html = renderToStaticMarkup(<Membership site={site} booking={null} label="" />);
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('member__price');
    expect(html).not.toContain('member__foot');
  });
});
