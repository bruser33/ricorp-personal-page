import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'eng' | 'esp';

type Dict = Record<string, string>;

/* UI copy per language. Only chrome/labels live here — news article bodies and
   project descriptions stay as content data. Multiline values use \n and are
   split at the component (hero title, hero sub). */
const translations: Record<Lang, Dict> = {
  eng: {
    'nav.contact': 'contact',
    'nav.news': 'news',
    'nav.about': 'about',
    'nav.home': 'Home',
    'nav.menu': 'MENU',
    'lang.switch': 'español',
    'hero.title': 'Keep it\nsimple.',
    'hero.sub': 'Software {development}\nand innovation.',
    'contact.titlePre': "Let's start a new ",
    'contact.titleAccent': '.project',
    'contact.sub': 'What are you looking for?',
    'contact.subjectPlaceholder': 'Write here...',
    'contact.emailPlaceholder': 'Enter your @email...',
    'contact.send': 'Send email',
    'contact.sent': 'Sent!',
    'footer.privacy': 'Privacy Policy',
    'footer.cookies': 'Cookie Policy',
    'footer.rights': '© 2023 All rights reserved.',
    'footer.loc': 'Santiago de Chile, Chile.',
    'news.cta': 'See all',
    'news.analysis': 'Analysis:',
    'projects.label': 'IT projects',
  },
  esp: {
    'nav.contact': 'contacto',
    'nav.news': 'noticias',
    'nav.about': 'nosotros',
    'nav.home': 'Inicio',
    'nav.menu': 'MENÚ',
    'lang.switch': 'english',
    'hero.title': 'Hazlo\nsimple.',
    'hero.sub': '{Desarrollo} de software\ne innovación.',
    'contact.titlePre': 'Empecemos un nuevo ',
    'contact.titleAccent': '.proyecto',
    'contact.sub': '¿Qué estás buscando?',
    'contact.subjectPlaceholder': 'Escribe aquí...',
    'contact.emailPlaceholder': 'Ingresa tu @email...',
    'contact.send': 'Enviar email',
    'contact.sent': '¡Enviado!',
    'footer.privacy': 'Política de Privacidad',
    'footer.cookies': 'Política de Cookies',
    'footer.rights': '© 2023 Todos los derechos reservados.',
    'footer.loc': 'Santiago de Chile, Chile.',
    'news.cta': 'Ver todos',
    'news.analysis': 'Análisis:',
    'projects.label': 'Proyectos informáticos',
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);
const STORAGE_KEY = 'ricorp-lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'eng' || saved === 'esp') return saved;
    }
    return 'eng';
  });

  useEffect(() => {
    document.documentElement.lang = lang === 'esp' ? 'es' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore storage errors (private mode) */
    }
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      toggle: () => setLang((l) => (l === 'eng' ? 'esp' : 'eng')),
      t: (key: string) => translations[lang][key] ?? translations.eng[key] ?? key,
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
