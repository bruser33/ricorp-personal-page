import './Footer.css';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p className="footer-links">
          <a href="#privacy">Política de Privacidad</a>
          <span> - </span>
          <a href="#cookies">Política de Cookies</a>
        </p>
        <p className="footer-meta">© 2023 All rights reserved.</p>
        <p className="footer-loc">Santiago de Chile, Chile.</p>
      </div>
    </footer>
  );
}
