import { str, type SiteContent } from '../content';

// Cifra destacada de "El local" (SPEC-29 a): la cifra y su palabra van en la misma familia (Anton) y comparten línea
// base; la nota va debajo. Lo que falte en el JSON no deja cajas vacías.
export default function Stat({ stat }: { stat: SiteContent['stat'] }) {
  const value = str(stat?.value), label = str(stat?.label), note = str(stat?.note);
  if (!value) return null;
  return (
    <p className="stat reveal">
      <span className="stat__value">{value}</span>
      {label && <> <span className="stat__label">{label}</span></>}
      {note && <> <em>{note}</em></>}
    </p>
  );
}
