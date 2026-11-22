/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { WaBubble } from './pages/MessagesPage';
import { SECTIONS, sectionFromPath } from './util';

// SPEC-53: sección "Mensajes" del panel y la burbuja con el texto del WhatsApp.
const CLIENT = join(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(CLIENT, p), 'utf8');

describe('sección Mensajes', () => {
  it('está en SECTIONS, tiene ruta propia y entrada HTML real (recargar funciona en Pages)', () => {
    expect(SECTIONS.find((s) => s.key === 'mensajes')).toEqual({ key: 'mensajes', label: 'Mensajes', path: '/wstyle/admin/mensajes/' });
    expect(sectionFromPath('/wstyle/admin/mensajes/')).toBe('mensajes');
    expect(read('vite.config.ts')).toMatch(/'rendicion', 'mensajes', 'carta'/);
    expect(read('wstyle/admin/mensajes/index.html')).toContain('src="/src/wstyle/admin/main.tsx"');
  });

  it('la burbuja muestra el cuerpo, el pie y el botón "Ver o cancelar mi cita" (sin exponer el link)', () => {
    const text = 'Hola Pedro, tu hora en WS Style quedó confirmada: Corte con Joe, el lunes 2 de noviembre a las 12:00.\n\n[Ver o cancelar mi cita] https://ricorp.cl/wstyle/cita/?id=1&t=…\n\nEste número solo envía avisos.';
    const html = renderToStaticMarkup(<WaBubble text={text} />);
    expect(html).toContain('Hola Pedro, tu hora en WS Style quedó confirmada');
    expect(html).toContain('Este número solo envía avisos.');
    expect(html).toMatch(/<span class="adm-wa-bubble__btn"[^>]*>Ver o cancelar mi cita<\/span>/);
  });
});
