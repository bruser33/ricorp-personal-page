import { useEffect, useState } from 'react';
import { API_BASE } from '../agenda/api';
import { loadProgram } from '../points/program';

// SPEC-57 §10: bloque breve "Junta puntos con cada corte". No va en el HTML prerenderizado (sin cifras ni productos
// inventados): se monta solo si la API dice que el programa está activo. Si la API falla o tarda, no aparece.
export default function PointsTeaser() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    loadProgram(API_BASE).then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  if (!on) return null;
  return (
    <div className="points-teaser" data-points-teaser="">
      <p className="points-teaser__title">JUNTA PUNTOS CON CADA CORTE.</p>
      <p className="points-teaser__copy">Cada vez que te atiendes con una reserva hecha en la web, sumas puntos en tu cuenta.</p>
      <p className="points-teaser__copy">Después los canjeas por productos de la barbería y los retiras en el local.</p>
      <a className="points-teaser__link" href="/wstyle/cuenta/puntos/">Ver cómo funciona</a>
    </div>
  );
}
