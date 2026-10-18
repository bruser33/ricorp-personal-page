import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'eng' | 'esp';

type Dict = Record<string, string>;

/* UI copy per language. Only chrome/labels live here — news article bodies and
   project descriptions stay as content data. Multiline values use \n and are
   split at the component (hero title, hero sub). */
const translations: Record<Lang, Dict> = {
  eng: {
    'nav.contact': 'Contact',
    'nav.news': 'Timeline',
    'bitacora.title': 'Timeline',
    'bitacora.sub': 'My path in software, milestone by milestone.',
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
    'contact.sending': 'Sending...',
    'contact.retry': 'Try again',
    'contact.error': "Couldn't send your message. Try again.",
    'contact.attach': 'Attach files',
    'contact.removeFile': 'Remove',
    'contact.errorMaxFiles': 'You can attach up to {n} files.',
    'contact.errorMaxSize': 'Attachments must add up to less than {size}.',
    'contact.errorFileTooLarge': '{file} is over {size}. Try a lighter version.',
    'contact.errorFileType': "{file}: that file type isn't allowed. Use images, PDF, Word, TXT or ZIP.",
    'contact.errorDuplicate': 'That file is already attached: {file}.',
    'contact.errorEmptyFile': '{file} is empty (0 bytes).',
    'contact.errorMessageEmpty': 'Write your message before sending.',
    'contact.errorMessageTooLong': 'Your message is over {n} characters. Shorten it a bit.',
    'contact.errorEmailEmpty': 'Enter your email so I can reply.',
    'contact.errorEmailInvalid': "That email doesn't look right. Check it (e.g. you@mail.com).",
    'contact.counter': '{n}/{max} characters',
    'contact.submit.invalid': 'Some details need fixing before sending.',
    'contact.submit.invalidEmail': "The server didn't accept that email. Check it and send again.",
    'contact.submit.tooLong': 'Your message is over {n} characters. Shorten it and send again.',
    'contact.submit.fileType': "One of the attachments isn't allowed. Remove it and send again.",
    'contact.submit.attachments': 'Attachments are over the limit (up to {n} files and {size} in total).',
    'contact.submit.rateLimited': 'You sent several messages in a row. Wait a few minutes and try again.',
    'contact.submit.delivery': "I couldn't deliver your email. Try again in a moment.",
    'contact.submit.unconfigured': "The mail service isn't available right now. Try again later.",
    'contact.submit.network': 'No connection to the server. Check your internet and try again.',
    'footer.privacy': 'Privacy Policy',
    'footer.cookies': 'Cookie Policy',
    'footer.rights': '© 2023 All rights reserved.',
    'footer.loc': 'Santiago de Chile, Chile.',
    'news.cta': 'See all',
    'news.analysis': 'Analysis:',
    'projects.label': 'IT projects',
    'projects.prev': 'Previous project',
    'projects.next': 'Next project',
  },
  esp: {
    'nav.contact': 'Contacto',
    'nav.news': 'Trayectoria',
    'bitacora.title': 'Trayectoria',
    'bitacora.sub': 'Mi recorrido en el software, hito a hito.',
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
    'contact.sending': 'Enviando...',
    'contact.retry': 'Reintentar',
    'contact.error': 'No se pudo enviar tu mensaje. Inténtalo de nuevo.',
    'contact.attach': 'Adjuntar archivos',
    'contact.removeFile': 'Quitar',
    'contact.errorMaxFiles': 'Puedes adjuntar hasta {n} archivos.',
    'contact.errorMaxSize': 'Los adjuntos no pueden superar {size} en total.',
    'contact.errorFileTooLarge': '{file} pesa más de {size}. Prueba con una versión más liviana.',
    'contact.errorFileType': '{file}: ese tipo de archivo no está permitido. Usa imágenes, PDF, Word, TXT o ZIP.',
    'contact.errorDuplicate': 'Ese archivo ya está adjunto: {file}.',
    'contact.errorEmptyFile': '{file} está vacío (0 bytes).',
    'contact.errorMessageEmpty': 'Escribe tu mensaje antes de enviar.',
    'contact.errorMessageTooLong': 'Tu mensaje supera los {n} caracteres. Acórtalo un poco.',
    'contact.errorEmailEmpty': 'Escribe tu email para poder responderte.',
    'contact.errorEmailInvalid': 'Ese email no parece válido. Revísalo (ej: tu@correo.com).',
    'contact.counter': '{n}/{max} caracteres',
    'contact.submit.invalid': 'Hay datos que corregir antes de enviar.',
    'contact.submit.invalidEmail': 'El servidor no aceptó ese email. Revísalo y vuelve a enviar.',
    'contact.submit.tooLong': 'Tu mensaje supera los {n} caracteres. Acórtalo y vuelve a enviar.',
    'contact.submit.fileType': 'Uno de los adjuntos no está permitido. Quítalo y vuelve a enviar.',
    'contact.submit.attachments': 'Los adjuntos superan el límite (hasta {n} archivos y {size} en total).',
    'contact.submit.rateLimited': 'Enviaste varios mensajes seguidos. Espera unos minutos y reintenta.',
    'contact.submit.delivery': 'No pude entregar tu correo. Reintenta en un momento.',
    'contact.submit.unconfigured': 'El servicio de correo no está disponible ahora. Reintenta más tarde.',
    'contact.submit.network': 'Sin conexión con el servidor. Revisa tu internet y reintenta.',
    'footer.privacy': 'Política de Privacidad',
    'footer.cookies': 'Política de Cookies',
    'footer.rights': '© 2023 Todos los derechos reservados.',
    'footer.loc': 'Santiago de Chile, Chile.',
    'news.cta': 'Ver todos',
    'news.analysis': 'Análisis:',
    'projects.label': 'Proyectos informáticos',
    'projects.prev': 'Proyecto anterior',
    'projects.next': 'Proyecto siguiente',
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
