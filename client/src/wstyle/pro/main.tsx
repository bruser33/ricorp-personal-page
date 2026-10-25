import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { takeFacebookParams } from '../agenda/session';
import ProApp from './ProApp';
import '../wstyle.css';
import '../agenda/agenda.css';
import './pro.css';

// Entrada del panel del barbero (SPEC-33). El HTML trae un aviso para cuando no hay JavaScript; React lo reemplaza.
const fbReturn = takeFacebookParams();
createRoot(document.getElementById('root')!).render(<StrictMode><ProApp fbReturn={fbReturn} /></StrictMode>);
