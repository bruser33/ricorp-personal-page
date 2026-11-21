# SPEC-62 · Espejo WS

Solicitado por: Joe (@jhoncamacho017-ai)

## Historia
Como barbero de WS Style quiero fotografiar de frente y de ambos perfiles al cliente, ensayar un degradado y dibujar líneas sobre sus propias fotos para acordar el diseño antes de cortar.

## Recorrido y criterios de aceptación
- AC-01. Un barbero aprobado abre Espejo WS desde su panel en el celular. Puede trabajar con una persona que llega sin reserva.
- AC-02. Puede tomar o elegir una imagen de cada vista, revisarla y repetirla. Reemplazar una foto elimina los trazos hechos sobre esa foto.
- AC-03. Puede comparar degradados bajo, medio y alto, cambiando por separado la altura y qué tan al ras queda. Si la detección del pelo falla, puede delimitarlo en la foto.
- AC-04. Sobre la misma foto dibuja una línea con el dedo, la mueve, cambia el grosor, la oculta y deshace trazos sin tomar la foto otra vez.
- AC-05. Puede comparar dos opciones en la misma vista, combinar el degradado de una con las líneas de la otra y fijar el diseño elegido para tenerlo a mano al cortar.
- AC-06. Antes de empezar una nueva consulta, puede terminar y descartar las imágenes. Una operación iniciada en la consulta anterior nunca recupera fotos del cliente anterior.

## Decisiones de la primera versión
La vista previa es orientativa, sobre fotos fijas procesadas en el celular. Joe delegó estas decisiones. El barbero puede conservar la referencia final mediante descarga al dispositivo con permiso del cliente. La consulta se descarta al terminar.
