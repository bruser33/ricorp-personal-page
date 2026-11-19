import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceSummary, StylePicker } from './components/StylePhotos';
import { checkPhotoFile, MAX_PHOTO_BYTES, NO_CHOICE, stylesForService, type StyleItem } from './styles';

// SPEC-59: "Tu estilo" en la reserva (AC-09 / CB-06, CB-02, CB-10) y la referencia en la cita (RN-05).
const fade: StyleItem = { id: 's1', name: 'Low fade texturizado', category: 'barberia', serviceIds: [], photoUrl: '/api/wstyle/photos/aaaaaaaaaaaaaaaaaaaaaaaa' };
const barba: StyleItem = { id: 's2', name: 'Barba candado', category: 'barberia', serviceIds: ['corte-barba'], photoUrl: '/api/wstyle/photos/bbbbbbbbbbbbbbbbbbbbbbbb' };
const platinado: StyleItem = { id: 's3', name: 'Platinado', category: 'decoloracion', serviceIds: [], photoUrl: '/api/wstyle/photos/cccccccccccccccccccccccc' };

describe('Tu estilo (StylePicker)', () => {
  it('CB-06 sin estilos para el servicio: no hay grilla vacía, solo subir tu foto y decidir en la barbería', () => {
    const html = renderToStaticMarkup(<StylePicker serviceId="tratamientos-capilares" serviceName="Tratamientos capilares" value={NO_CHOICE} onChange={() => {}} initialItems={[]} />);
    expect(html).not.toContain('st-grid');
    expect(html).not.toContain('Ver todos');
    expect(html).toContain('Subir tu foto');
    expect(html).toContain('Decido en la barbería');
  });

  it('con estilos: radio group con alt = nombre (CB-10) y la elegida marcada "Elegido"', () => {
    const html = renderToStaticMarkup(<StylePicker serviceId="corte" serviceName="Corte" value={{ style: fade, photo: null }} onChange={() => {}} initialItems={[fade]} />);
    expect(html).toContain('type="radio"');
    expect(html).toContain('alt="Low fade texturizado"');
    expect(html).toContain('st-card is-selected');
    expect(html).toContain('Elegido');
    expect(html).toContain('Ver todos');
    expect(html).toContain('(opcional)');
  });
});

describe('validación previa a subir (CB-02)', () => {
  it('rechaza más de 5 MB y HEIC; acepta JPG/PNG/WebP', () => {
    expect(checkPhotoFile({ size: MAX_PHOTO_BYTES + 1, type: 'image/jpeg', name: 'a.jpg' })).toMatch(/5 MB/);
    expect(checkPhotoFile({ size: 1000, type: 'image/heic', name: 'a.heic' })).toMatch(/HEIC/);
    expect(checkPhotoFile({ size: 1000, type: 'application/pdf', name: 'a.pdf' })).toMatch(/JPG o PNG/);
    expect(checkPhotoFile({ size: MAX_PHOTO_BYTES, type: 'image/png', name: 'a.png' })).toBeNull();
    expect(checkPhotoFile({ size: 1000, type: 'image/webp', name: 'a.webp' })).toBeNull();
  });
});

describe('RN-06 estilos por servicio', () => {
  it('con servicios específicos solo para esos; sin servicios, para toda su categoría', () => {
    const all = [fade, barba, platinado];
    expect(stylesForService(all, 'corte', 'barberia').map((s) => s.id)).toEqual(['s1']);
    expect(stylesForService(all, 'corte-barba', 'barberia').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(stylesForService(all, 'decoloracion-global', 'decoloracion').map((s) => s.id)).toEqual(['s3']);
  });
});

describe('referencia en la cita', () => {
  it('RN-05: estilo oculto o borrado → nombre y "Foto ya no disponible"; aviso de foto quitada', () => {
    const html = renderToStaticMarkup(<ReferenceSummary reference={{ style: { id: 's1', name: 'Low fade texturizado', photoUrl: null }, clientPhoto: null, clientPhotoNotice: 'Foto quitada por el local' }} />);
    expect(html).toContain('Estilo: <strong>Low fade texturizado</strong>');
    expect(html).toContain('Foto ya no disponible');
    expect(html).toContain('Foto quitada por el local');
  });
  it('sin referencia no muestra nada (la reserva sin foto queda igual que hoy)', () => {
    expect(renderToStaticMarkup(<ReferenceSummary reference={null} />)).toBe('');
  });
});
