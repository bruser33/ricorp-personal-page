import { useState } from 'react';
import { addDays } from '../../agenda/util';
import { Hourglass } from '../../pro/components/WaitlistSheet';
import WaitlistSheet from '../../pro/components/WaitlistSheet';
import { useWaitlist } from '../../pro/useWaitlist';
import { adminWaitlist } from '../api';
import { useToday } from '../hooks';

// SPEC-54 §6: en "Citas", "Lista de espera: N personas en los próximos 7 días" (solo si está encendida y hay gente).
// Abre la misma hoja del barbero con un chip por día y el barbero pedido.
export default function WaitlistSummary() {
  const today = useToday();
  const { data, reload } = useWaitlist(adminWaitlist, today, addDays(today, 6));
  const [open, setOpen] = useState(false);
  const days = data?.days.filter((d) => d.count > 0) ?? [];
  const n = data?.summary?.next7 ?? days.reduce((a, d) => a + d.count, 0);
  if (!data?.enabled || n <= 0) return null;
  return (
    <>
      <button type="button" className="adm-wait-summary" data-waitlist-summary="" onClick={() => setOpen(true)}>
        <Hourglass /> Lista de espera: {n} {n === 1 ? 'persona' : 'personas'} en los próximos 7 días
      </button>
      {open && <WaitlistSheet source={adminWaitlist} days={days} showProfessional onChanged={reload} onClose={() => setOpen(false)} />}
    </>
  );
}
