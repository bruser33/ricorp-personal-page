import './Loader.css';

// Pantalla de carga con el progreso REAL de los frames ancla de la secuencia (o del arranque del 3D).
export default function Loader({ name, progress, done }: { name: string | null; progress: number; done: boolean }) {
  return (
    <div className={`loader${done ? ' is-done' : ''}`} role="progressbar" aria-label="Cargando el recorrido del local"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-hidden={done || undefined}>
      <div className="loader__inner">
        {name && <p className="loader__brand" data-field="name">{name}</p>}
        <div className="loader__track"><span className="loader__bar" style={{ transform: `scaleX(${progress / 100})` }}></span></div>
        <p className="loader__pct">{progress} %</p>
      </div>
    </div>
  );
}
