import { renderToString } from 'react-dom/server';
import App from './App';
import { headTexts, type Content } from './content';

// Prerender del build (scripts/prerender-wstyle.mjs): HTML del árbol con el contenido por defecto + textos de <head>.
export function render(content: Content) {
  return { html: renderToString(<App initial={content} />), head: headTexts(content.site) };
}
