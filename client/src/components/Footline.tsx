import { useLang } from '../i18n';
import './Footline.css';

/* Per-screen footline (privacy · cookies / © rights / location). In the Figma
   "film", the full-screen sections (carousel, contact) each carry the footer at
   the bottom — so this is reused per section, pinned to the bottom by the parent
   (margin-top: auto). */
export function Footline() {
  const { t } = useLang();
  return (
    <div className="footline container">
      <div className="footline-center">
        <p>
          {t('footer.privacy')} · {t('footer.cookies')}
        </p>
        <p>{t('footer.rights')}</p>
      </div>
      <p className="footline-loc">{t('footer.loc')}</p>
    </div>
  );
}
