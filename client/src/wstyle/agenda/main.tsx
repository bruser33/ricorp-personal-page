import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AgendaApp from './AgendaApp';
import { takeFacebookParams } from './session';
import '../wstyle.css';
import './agenda.css';

// Entrada de las páginas de la agenda (SPEC-32): /wstyle/reservar/, /wstyle/cita/, /wstyle/cuenta/ y sus
// subpáginas. Cada ruta es una carpeta real en dist/ con su index.html (Pages no reescribe rutas). El HTML trae un
// aviso con el link de WhatsApp para cuando no hay JavaScript (CB-16); React lo reemplaza al montar.
const fbReturn = takeFacebookParams();
createRoot(document.getElementById('root')!).render(<StrictMode><AgendaApp fbReturn={fbReturn} /></StrictMode>);
