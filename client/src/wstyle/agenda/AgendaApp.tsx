import { useEffect, useState } from 'react';
import { loadContent } from '../content';
import { ctaLinks } from '../links';
import type { FacebookReturn } from './components/AuthPanel';
import type { AgendaCtx } from './ctx';
import { useSession } from './session';
import BookingPage from './pages/BookingPage';
import AppointmentPage from './pages/AppointmentPage';
import ReviewPage from './pages/ReviewPage';
import { AccountPage, ConfirmPage, MyAppointmentsPage, RecoverPage } from './pages/AccountPages';
import { GiftBuyPage, GiftCardPage } from './pages/GiftPages';

// Enrutado por carpeta (location.pathname). El WhatsApp del local sale de site.json, como en la landing: es la
// salida cuando la agenda no responde (CB-15/AC-17).
export default function AgendaApp({ fbReturn }: { fbReturn: FacebookReturn | null }) {
  const session = useSession();
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadContent('/wstyle/').then((c) => { if (alive) setWhatsapp(ctaLinks(c.site).whatsapp); }, () => {});
    return () => { alive = false; };
  }, []);
  const ctx: AgendaCtx = { session, whatsapp, fbReturn };
  const path = location.pathname.replace(/\/+$/, '/');
  if (path.endsWith('/wstyle/cita/')) return <AppointmentPage ctx={ctx} />;
  // SPEC-60: comprar una gift card y verla por su enlace secreto.
  if (path.endsWith('/wstyle/regalar/')) return <GiftBuyPage ctx={ctx} />;
  if (path.endsWith('/wstyle/regalo/')) return <GiftCardPage ctx={ctx} />;
  if (path.endsWith('/wstyle/cuenta/mis-citas/')) return <MyAppointmentsPage ctx={ctx} />;
  if (path.endsWith('/wstyle/cuenta/resena/')) return <ReviewPage ctx={ctx} />;
  if (path.endsWith('/wstyle/cuenta/recuperar/')) return <RecoverPage ctx={ctx} />;
  if (path.endsWith('/wstyle/cuenta/confirmar/')) return <ConfirmPage ctx={ctx} />;
  if (path.endsWith('/wstyle/cuenta/')) return <AccountPage ctx={ctx} />;
  return <BookingPage ctx={ctx} />;
}
