# SPEC-63 · Dossier VI: ropa de calle estilo rapero

## Historia
Como Pedro (Ricorp) quiero un dossier de los mejores sitios del mundo de ropa de calle estilo rapero / hip-hop, con el mismo estándar que los de barberías, DJs (`investigacion-dj`) y logística, para venderle a marcas, tiendas y artistas chilenos un sitio premium con referencias concretas.

## Alcance
**Incluye:** sitios premiados del mundo (marcas streetwear, merch de raperos, sneakers y boutiques, lujo urbano, colaboraciones), estudios premiados, marcas y tiendas de Chile y LatAm con su brecha, presupuestos, stack 2026, capa rentable y demo que vende.
**No incluye:** pagos, textos legales ni diseño del sitio de un cliente concreto.

## Reglas
- RN-01 Solo cuenta como premio el verificado en awwwards.com/sites/<slug> (tipo y fecha exacta). Sin verificación → "—".
- RN-02 Cada sitio con calidad (1–5: Descartar → Techo) y dificultad (1–5: Plantilla → Mundo WebGL), stack real detectado y estudio.
- RN-03 Los sitios que dependen de video llevan la etiqueta «Video» y un botón «Sin video» los oculta.
- RN-04 Datos de negocio (presupuestos, costos, mercado chileno) con fuente; lo estimado se marca como estimación.
- RN-05 Estructura de `client/public/investigacion-dj`: secciones A–J, filtros por categoría, orden por calidad/dificultad y casilla «revisado» que se guarda en el navegador.

## Criterios de aceptación
- AC-01 Publicado en `ricorp.cl/investigacion-streetwear/` (noindex) con 35+ sitios del mundo y 20+ de Chile/LatAm.
- AC-02 Todo premio mostrado tiene tipo y fecha verificados en Awwwards.
- AC-03 Filtros, orden, «Sin video» y «revisado» funcionan en escritorio y en el celular (390 px), en modo claro y oscuro.
- AC-04 Secciones de presupuesto, hallazgo, estudios, stack, capa rentable, Chile y demo que vende con contenido propio del rubro.
- AC-05 Link en el comentario de esta issue.
