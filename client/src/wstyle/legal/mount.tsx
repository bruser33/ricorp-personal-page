import { createRoot } from 'react-dom/client';
import { loadContent } from '../content';
import { LegalPage, type LegalKind } from './LegalPages';

// Solo en dev (o si el HTML no viene prerenderizado): arma la página legal en el cliente desde site.json.
export async function mount(root: HTMLElement) {
  const kind: LegalKind = root.dataset.legal === 'terminos' ? 'terminos' : 'privacidad';
  const site = await loadContent('/wstyle/').then((c) => c.site, () => ({}));
  createRoot(root).render(<LegalPage kind={kind} site={site} />);
}
