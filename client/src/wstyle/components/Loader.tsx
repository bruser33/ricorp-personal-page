import './Loader.css';

// Pantalla de carga (PR #9 D2): fondo ink opaco por encima de TODO (header, dock, badge), wordmark WS STYLE,
// progreso real de los frames ancla y "Powered by ricorp.cl". Sale con una máscara que sube.
export default function Loader({ name, progress, done, poweredBy }: { name: string | null; progress: number; done: boolean; poweredBy: boolean }) {
  return (
    <div className={`loader${done ? ' is-done' : ''}`} role="progressbar" aria-label="Cargando el recorrido del local"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-hidden={done || undefined}>
      <div className="loader__inner">
        {name && <p className="loader__brand" data-field="name">{name}</p>}
        <div className="loader__track"><span className="loader__bar" style={{ transform: `scaleX(${progress / 100})` }}></span></div>
        <p className="loader__pct">{progress} %</p>
      </div>
      {poweredBy && <p className="loader__by">Powered by <span>ricorp.cl</span></p>}
    </div>
  );
}
