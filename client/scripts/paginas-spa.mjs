// Páginas con URL propia (lib/rutas.ts): ricorp.cl/contacto y ricorp.cl/trayectoria.
// GitHub Pages es estático: si alguien recarga o comparte /contacto, tiene que existir
// dist/contacto/index.html. Es el MISMO index.html de la home (el cliente lee la ruta y
// arma la página); los assets van con ruta absoluta (base '/'), así que funcionan desde
// cualquier carpeta. 404.html también es una copia: cualquier ruta desconocida carga el
// sitio en vez de la página de error de GitHub (y el router la trata como el inicio).
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '../dist');
const INDEX = resolve(DIST, 'index.html');
for (const ruta of ['contacto', 'trayectoria']) {
  mkdirSync(resolve(DIST, ruta), { recursive: true });
  copyFileSync(INDEX, resolve(DIST, ruta, 'index.html'));
}
copyFileSync(INDEX, resolve(DIST, '404.html'));
console.log('[paginas-spa] dist/contacto/, dist/trayectoria/ y dist/404.html');
