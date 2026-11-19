import { useEffect, useState } from 'react';

const MOBILE = '(max-width: 699px)';

// < 700 px: móvil (3 días en la agenda del barbero; un barbero a la vez en la del admin).
export function useMobile() {
  const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = matchMedia(MOBILE);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
