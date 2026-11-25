# SPEC-65 · Dossier VIII: ropa inmersiva («Lo que parece 3D»)

## Historia
Como Pedro (Ricorp) quiero un dossier de los sitios de moda, ropa y calzado más inmersivos del mundo, del nivel de LAST DEPT. (Ascenta Studio) y oddlot.store, con el mismo estándar que los de DJs (`investigacion-dj`) y streetwear (`investigacion-streetwear`), para venderle a una tienda de ropa una experiencia donde la gente vea cómo se pone y cómo luce la ropa, sabiendo qué técnica hay detrás de cada efecto y cuánto cuesta.

## Alcance
**Incluye:** sitios del mundo agrupados por técnica (3D aparente con render/IA + video, salas y showrooms navegables, 3D real con GLB/WebGL, la prenda puesta, pasarelas y lookbooks WebGL), la técnica real detectada en vivo frente a lo que aparenta, Chile y LatAm con su brecha, cómo se hace cada técnica, costos y herramientas, y el demo que vende.
**No incluye:** ejemplos fáciles (tiendas de plantilla), pagos, textos legales ni el diseño del sitio de un cliente concreto.

## Reglas
- RN-01 Solo cuenta como premio el verificado en awwwards.com/sites/<slug> (tipo y fecha exacta). Sin verificación → "—".
- RN-02 Cada sitio con calidad (1–5: Descartar → Techo), dificultad (1–5: Plantilla → Mundo WebGL), técnica real detectada con un Chromium propio (canvas WebGL, modelos .glb/.gltf, video, plataforma), lo que aparenta, estudio y si está en línea hoy.
- RN-03 Los sitios que dependen de video llevan la etiqueta «Video» y un botón «Sin video» los oculta.
- RN-04 Datos de negocio (costos, herramientas, mercado) con fuente; lo estimado se marca como estimación.
- RN-05 Estructura de `client/public/investigacion-streetwear`: secciones por letra, filtros por categoría, orden por calidad/dificultad y casilla «revisado» que se guarda en el navegador.

## Criterios de aceptación
- AC-01 Página en `client/public/investigacion-ropa-inmersiva/` (noindex) con 30+ sitios del mundo y 10+ de Chile/LatAm.
- AC-02 Todo premio mostrado tiene tipo y fecha verificados en Awwwards.
- AC-03 Cada sitio dice qué aparenta y qué es en realidad (detectado en vivo) y si está en línea.
- AC-04 Filtros, orden, «Sin video» y «revisado» funcionan en escritorio y en el celular (390 px), en modo claro y oscuro.
- AC-05 Secciones de cómo se hace cada técnica (pipeline concreto), costos y herramientas, Chile/LatAm y demo que vende.
