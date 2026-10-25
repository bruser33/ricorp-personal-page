import type { FacebookReturn } from './components/AuthPanel';
import type { useSession } from './session';

// Lo que comparten las páginas de la agenda: sesión, WhatsApp del local (degradación) y lo que trajo Facebook.
export interface AgendaCtx {
  session: ReturnType<typeof useSession>;
  whatsapp: string | null;
  fbReturn: FacebookReturn | null;
}
