import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { introTotalMs } from '../intro';
import './Hero.css';

export function Hero({ startAnim }: { startAnim: boolean }) {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);
  /* El delay del intro tiene que ser ONE-SHOT. Vive en la regla base de
     .hero-sub, así que se aplicaba cada vez que el subtítulo volvía al estado
     visible — no solo en el intro: al bajar a proyectos y subir, "Software
     {development}" tardaba ~6s en reaparecer (medido: 5957ms — la espera del
     beat B entera, más el fade). La salida ya estaba resuelta (.hero-scrolled
     pone delay 0), la re-entrada no.
     No hay forma de arreglarlo solo con CSS: la primera entrada y la re-entrada
     son exactamente el mismo selector, y CSS no tiene memoria de que la clase de
     scroll ya estuvo puesta alguna vez. De ahí esta marca, que se pone cuando el
     intro terminó y desde ahí apaga el delay (ver .hero-settled en Hero.css). */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!startAnim) return;
    const timer = window.setTimeout(() => setSettled(true), introTotalMs());
    return () => window.clearTimeout(timer);
  }, [startAnim]);
  useEffect(() => {
    /* `marcarFin`: irse del hero da el intro por terminado aunque el cronómetro
       no haya llegado. Si no, bajar a proyectos ANTES de que termine el intro y
       volver dejaba al subtítulo esperando el delay igual — el mismo bug, por la
       puerta de atrás. Solo suma: no puede colgar de `scrolled`, que va y viene.
       Va en false SOLO en la sincronización inicial: leer la posición al montar
       no es un gesto del usuario, así que no debería decidir nada sobre el intro.
       OJO igual con lo que esto NO arregla — medido: al recargar a media página
       el navegador restaura el scroll y eso SÍ dispara un evento real, así que
       `settled` termina en true antes del reveal igual. Se deja así a propósito:
       si recargaste con la página abajo ya estás pasado el hero, y que el
       subtítulo aparezca sin espera al subir es justo lo que pide el bug 3c. La
       única forma de verlo "mal" es recargar abajo y volver arriba en pleno
       intro, donde el subtítulo entra sin escalonar contra el título. */
    const leerScroll = (marcarFin: boolean) => {
      const fuera = window.scrollY > window.innerHeight * 0.3;
      setScrolled(fuera);
      if (fuera && marcarFin) setSettled(true);
    };
    const onScroll = () => leerScroll(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    leerScroll(false);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <section
      id="home"
      className={`hero ${startAnim ? 'hero-intro' : ''} ${scrolled ? 'hero-scrolled' : ''} ${
        settled ? 'hero-settled' : ''
      }`}
    >
      <div className="container hero-inner">
        <div className="hero-text">
          <h1 className="hero-title">
            {t('hero.title')
              .split('\n')
              .map((line, i, arr) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </span>
              ))}
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
        </div>
      </div>
      <div className="hero-portrait" aria-hidden="true">
        <img src={import.meta.env.BASE_URL + 'figma-frames/portrait.png'} alt="" />
      </div>
    </section>
  );
}
