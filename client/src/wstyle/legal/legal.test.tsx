/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPage, TermsPage } from './LegalPages';
import { Footer } from '../components/Location';
import { DATA_DELETION_ANCHOR, DEMO_CONTACT_URL, PRIVACY_URL, TERMS_URL } from '../links';
import type { SiteContent } from '../content';
import siteJson from '../../../public/wstyle/content/site.json';

// Política de privacidad y Términos (requisito de Meta para publicar el inicio con Facebook).
const site = siteJson as SiteContent;
const CLIENT = join(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(CLIENT, p), 'utf8');

describe('rutas de las páginas legales', () => {
  it('URLs con barra final bajo /wstyle/', () => {
    expect(PRIVACY_URL).toBe('/wstyle/privacidad/');
    expect(TERMS_URL).toBe('/wstyle/terminos/');
  });
  it.each(['privacidad', 'terminos'])('%s: entrada HTML real, en vite.config y en el prerender', (k) => {
    expect(read(`wstyle/${k}/index.html`)).toContain(`<div id="root" data-legal="${k}"><!--legal-app--></div>`);
    expect(read('vite.config.ts')).toMatch(/\['privacidad', 'terminos'\]/);
    expect(read('scripts/prerender-wstyle.mjs')).toMatch(/for \(const kind of \['privacidad', 'terminos'\]\)/);
  });
});

describe('Política de privacidad', () => {
  const html = renderToStaticMarkup(<PrivacyPage site={site} />);
  it('tiene la sección de eliminación de datos de Facebook con id estable', () => {
    expect(DATA_DELETION_ANCHOR).toBe('eliminar-datos');
    expect(html).toContain('id="eliminar-datos"');
    expect(html).toMatch(/Apps y sitios web/);
  });
  it('describe cómo eliminar la cuenta desde Mi cuenta', () => {
    expect(html).toContain('id="eliminar-cuenta"');
    expect(html).toContain('Sí, eliminar mi cuenta');
    expect(html).toContain('href="/wstyle/cuenta/"');
  });
  it('nombra proveedores, permisos de Facebook, cookie de sesión y la ley chilena', () => {
    for (const s of ['MongoDB Atlas', 'Render', 'Resend', 'Mercado Pago', 'public_profile', 'ws_session', '19.628', '21.719']) expect(html).toContain(s);
    expect(html).toMatch(/nunca pasan por nuestros servidores/);
  });
  it('responsable Ricorp; en demo el WhatsApp del local lleva al contacto de Ricorp', () => {
    expect(html).toContain('Ricorp');
    expect(html).toContain(`href="${DEMO_CONTACT_URL}"`);
    expect(html).not.toContain('wa.me/');
  });
});

describe('Términos y condiciones', () => {
  const html = renderToStaticMarkup(<TermsPage site={site} />);
  it('reutiliza las políticas del local de site.json', () => {
    for (const p of site.policies ?? []) {
      expect(html).toContain(p.title!);
      expect(html).toContain(p.text!);
    }
  });
  it('cubre barberos independientes, Mercado Pago y boletas', () => {
    expect(html).toMatch(/profesionales independientes/);
    expect(html).toMatch(/Mercado Pago/);
    expect(html).toMatch(/boleta/);
  });
  it('sin políticas en el JSON no rompe', () => {
    expect(renderToStaticMarkup(<TermsPage site={{}} />)).toContain('Términos y condiciones');
  });
});

describe('enlaces a las páginas legales', () => {
  it('footer de la landing enlaza Privacidad y Términos', () => {
    const html = renderToStaticMarkup(<Footer name="WS Style" poweredBy={false} />);
    expect(html).toContain(`href="${PRIVACY_URL}"`);
    expect(html).toContain(`href="${TERMS_URL}"`);
  });
  it.each(['src/wstyle/agenda/components/AuthPanel.tsx', 'src/wstyle/pro/pages/RegisterPage.tsx'])('%s apunta a las páginas nuevas (no a #politicas)', (f) => {
    const src = read(f);
    expect(src).toContain('href={TERMS_URL}');
    expect(src).toContain('href={PRIVACY_URL}');
    expect(src).not.toContain('/wstyle/#politicas');
  });
});
