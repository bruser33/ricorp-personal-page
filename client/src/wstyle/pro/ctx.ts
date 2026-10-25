import type { FacebookReturn } from '../agenda/components/AuthPanel';
import type { useSession } from '../agenda/session';
import type { ProMe } from './api';

export type MeState = 'idle' | 'loading' | 'ready' | 'not_barber' | 'error';

// Lo que comparten las páginas del panel: sesión (la misma de la agenda), el perfil de barbero y lo que trajo Facebook.
export interface ProCtx {
  session: ReturnType<typeof useSession>;
  me: ProMe | null;
  meState: MeState;
  setMe: (m: ProMe) => void;
  reloadMe: () => Promise<ProMe | null>;
  fbReturn: FacebookReturn | null;
  whatsapp: string | null;
}
