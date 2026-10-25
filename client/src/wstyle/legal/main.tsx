import '../wstyle.css';
import '../agenda/agenda.css';
import './legal.css';

// Entrada de /wstyle/privacidad/ y /wstyle/terminos/. En el build el HTML ya viene prerenderizado (data-prerendered):
// la página es estática y solo carga el CSS. En dev (sin prerender) se arma en el cliente desde site.json; el import
// diferido evita que React y el contenido se descarguen en producción.
const root = document.getElementById('root')!;
if (!root.dataset.prerendered) void import('./mount').then((m) => m.mount(root));
