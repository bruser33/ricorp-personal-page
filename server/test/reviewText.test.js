/* SPEC-52: reglas puras de las reseñas (sanitización RN-05, nombre a mostrar RN-06, validación RN-04). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { displayName, sanitizeComment, starsText, validateReviewBody } from '../src/lib/reviewText.js';

describe('sanitizeComment (RN-05)', () => {
  test('CB-04: quita <script> con su contenido y las etiquetas', () => {
    assert.equal(sanitizeComment('<script>alert(1)</script>Muy bueno el corte'), 'Muy bueno el corte');
    assert.equal(sanitizeComment('<b>Excelente</b> <a href="x">atención</a>'), 'Excelente atención');
    assert.equal(sanitizeComment('<style>body{}</style><img src=x onerror=alert(1)>Buen trato'), 'Buen trato');
    assert.equal(sanitizeComment('Hola <!-- oculto --> mundo'), 'Hola mundo');
    /* Etiqueta sin cerrar al final: también fuera. */
    assert.equal(sanitizeComment('Muy bueno el corte <img src=x onerror=alert(1)'), 'Muy bueno el corte');
  });
  test('caracteres de control fuera, espacios colapsados, un salto de línea seguido como máximo, bordes recortados', () => {
    assert.equal(sanitizeComment('  Muy' + String.fromCharCode(0) + ' buen' + String.fromCharCode(0x200b) + '   corte\t\t y barba  '), 'Muy buen corte y barba');
    assert.equal(sanitizeComment('Primera línea\r\n\r\n\n  Segunda'), 'Primera línea\nSegunda');
  });
  test('el texto sin HTML no cambia (URL incluidas, como texto)', () => {
    assert.equal(sanitizeComment('Vean https://ejemplo.cl, 5 > 3'), 'Vean https://ejemplo.cl, 5 > 3');
  });
});

describe('displayName (RN-06)', () => {
  test('nombre de pila + inicial del último apellido', () => {
    assert.equal(displayName('Pedro Rico Díaz'), 'Pedro D.');
    assert.equal(displayName('María José Pérez'), 'María P.');
    assert.equal(displayName('  ana   ruiz '), 'ana R.');
    assert.equal(displayName('Pedro'), 'Pedro');
    assert.equal(displayName(''), 'Cliente de WS Style');
    assert.equal(displayName(null), 'Cliente de WS Style');
  });
});

describe('validateReviewBody (RN-04)', () => {
  const ok = 'Excelente degradado, muy buena atención.';
  test('válido → estrellas y comentario saneado', () => {
    assert.deepEqual(validateReviewBody({ rating: 5, comment: `  ${ok} `, author: 'Hacker' }), { rating: 5, comment: ok });
  });
  test('CB-06: estrellas 0, 6, 4.5, "5" o ausentes → 400', () => {
    for (const rating of [0, 6, 4.5, '5', null, undefined]) {
      assert.throws(() => validateReviewBody({ rating, comment: ok }), (e) => e.status === 400 && e.code === 'invalid_rating', String(rating));
    }
  });
  test('comentario < 10 o > 300 caracteres (después de sanitizar) → 400', () => {
    assert.throws(() => validateReviewBody({ rating: 4, comment: 'Corto' }), (e) => e.status === 400 && e.code === 'comment_too_short');
    assert.throws(() => validateReviewBody({ rating: 4, comment: '<b>Hola</b>  ' }), (e) => e.code === 'comment_too_short');
    assert.throws(() => validateReviewBody({ rating: 4, comment: 'a'.repeat(301) }), (e) => e.code === 'comment_too_long');
    assert.equal(validateReviewBody({ rating: 4, comment: 'a'.repeat(300) }).comment.length, 300);
    /* Por caracteres visibles: 300 emojis valen. */
    assert.equal([...validateReviewBody({ rating: 4, comment: '👍'.repeat(300) }).comment].length, 300);
  });
  test('starsText', () => assert.equal(starsText(4), '★★★★☆'));
});
