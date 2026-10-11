import './RicorpBadge.css';

// Marca de agua "Powered by ricorp.cl" (SPEC-11): fija abajo a la derecha, por encima de la pantalla de carga.
export default function RicorpBadge() {
  return (
    <a className="ricorp-badge" href="https://ricorp.cl" target="_blank" rel="noopener" aria-label="Sitio desarrollado por Ricorp">
      <span>Powered by</span><img src="/wstyle/brand/ricorp-logo.svg" alt="Ricorp" width={104} height={24} /><span className="ricorp-badge__domain">ricorp.cl</span>
    </a>
  );
}
