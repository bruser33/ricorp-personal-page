import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WaitlistChip } from './components/WaitlistSheet';

// SPEC-54 AC-07: el chip del encabezado del día muestra cuántos esperan.
describe('chip de lista de espera del barbero', () => {
  it('muestra el número y se anuncia como "N en lista de espera"', () => {
    const html = renderToStaticMarkup(<WaitlistChip date="2026-11-21" count={3} onOpen={() => {}} />);
    expect(html).toContain('data-waitlist-chip="2026-11-21"');
    expect(html).toContain('aria-label="3 en lista de espera"');
    expect(html).toContain('<span>3</span>');
  });
});
