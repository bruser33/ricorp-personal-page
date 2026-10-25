import { renderToStaticMarkup } from 'react-dom/server';
import type { SiteContent } from '../content';
import { LegalPage, type LegalKind } from './LegalPages';

// Prerender del build (scripts/prerender-wstyle.mjs): HTML estático de /wstyle/privacidad/ y /wstyle/terminos/ con
// el contenido por defecto (public/wstyle/content/site.json).
export function renderLegal(kind: LegalKind, site: SiteContent) {
  return renderToStaticMarkup(<LegalPage kind={kind} site={site} />);
}
