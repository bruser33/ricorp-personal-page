import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import type { Content } from './content';

// El build prerenderiza el HTML (titulares, nombre, JSON-LD) e incrusta el contenido usado en #wstyle-data: se
// hidrata con ese mismo contenido (sin diferencias) y luego se leen los JSON en runtime. En dev no hay prerender.
const root = document.getElementById('root')!;
const data = document.getElementById('wstyle-data');
const initial: Content | null = data ? JSON.parse(data.textContent || 'null') : null;
const app = <StrictMode><App initial={initial} /></StrictMode>;
if (initial && root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
