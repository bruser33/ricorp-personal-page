import { useLang } from '../i18n';
import './Footer.css';

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-center">
          <p className="footer-links">
            <a href="#privacy">{t('footer.privacy')}</a>
            <span> · </span>
            <a href="#cookies">{t('footer.cookies')}</a>
          </p>
          <p className="footer-meta">{t('footer.rights')}</p>
        </div>
        <p className="footer-loc">{t('footer.loc')}</p>
      </div>
    </footer>
  );
}
