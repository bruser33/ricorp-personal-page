import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { takeFacebookParams } from '../agenda/session';
import AdminApp from './AdminApp';
import '../wstyle.css';
import '../agenda/agenda.css';
import '../pro/pro.css';
import './admin.css';

// Entrada del panel del super admin (SPEC-34). El HTML trae un aviso para cuando no hay JavaScript; React lo reemplaza.
const fbReturn = takeFacebookParams();
createRoot(document.getElementById('root')!).render(<StrictMode><AdminApp fbReturn={fbReturn} /></StrictMode>);
