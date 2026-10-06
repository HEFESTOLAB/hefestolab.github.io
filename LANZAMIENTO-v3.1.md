# HEFESTOLAB v3.1 · «Proyectos BIM con 0 clics»

Fecha: 6 de octubre de 2026 (día del lanzamiento). Estado en toda la web: **Ya disponible**. Precio: **699,00 €/año + IVA**.

## Qué cambia

- **Portada nueva (ES y EN)** con la imagen del vídeo de lanzamiento: fondo casi negro, trazo cian, acento ámbar, tipografía Montserrat fina en mayúsculas. Pasa de unos 15.200 px de alto a unos 9.400 px, con mucho menos texto.
- **Eslogan «Proyectos BIM con 0 clics»** en el titular, el título de la página, la descripción, los datos estructurados, `llms.txt` y la imagen para redes.
- **Vídeo de lanzamiento** (1:59) en la portada: arranca un bucle mudo con el contador de clics y, al pulsar, se reproduce el vídeo completo con sonido.
- **Cuatro fragmentos en bucle** sacados del vídeo de lanzamiento: del plano, de la nube de puntos, del CAD y Component Studio. Más un quinto para CEREBRO.
- **Grabación real** (3:37) con siete capítulos que saltan al punto exacto del vídeo.
- **«Cero clics no es cero decisión»**: el técnico decide y revisa, la IA ejecuta.
- **Licencia**: «Ya disponible», 699,00 € al año + IVA, botón «Solicitar licencia» (mismo formulario).
- **Tema oscuro por defecto en todo el sitio** (portada, Forge, blog, herramientas y legal), con la misma paleta. El botón de tema claro sigue funcionando y recuerda la elección.
- **Fecha**: se sustituye «9 de octubre» por «Ya disponible» / 6 de octubre de 2026 en portada, curso, `llms.txt`, datos estructurados y manifiesto del curso.
- Se retira «Autodesk Certified Instructor» de la portada, los datos estructurados, `llms.txt` y la firma de los dos artículos del blog.
- Textos desfasados corregidos: «beta en septiembre» (página de herramientas) y «Proyecto en desarrollo» (pie del blog).
- Imagen para redes (`og-hefestolab.jpg` y `og-hefestolab-en.jpg`): la anterior aún decía «Beta pública · Early Access · 499 €/año». Ahora es el fotograma del vídeo con el eslogan.

## Archivos nuevos

- `assets/css/home.css` y `assets/js/home.js` — estilos y comportamiento de las dos portadas.
- `assets/fonts/montserrat-latin-{300,400,500,600,700}.woff2` y `MONTSERRAT-OFL.txt` — tipografía servida en local, sin CDN.
- `assets/video/hefesto-lanzamiento.mp4` (20,8 MB) — vídeo de lanzamiento, 1080p.
- `assets/video/hefesto-real.mp4` (24,2 MB) — grabación real, 1080p.
- `assets/video/clip-{intro,plano,nube,cad,component,cerebro}.mp4` — bucles sin sonido (1,1 a 2,6 MB).
- `assets/video/poster-*.webp` y `poster-*.jpg` — carátulas.

Las anclas antiguas siguen funcionando: `#producto`, `#flujo`, `#curso`, `#beta`, `#capturas`, `#casos`, `#componentes`, `#herramientas`, `#academia`, `#contenido-tecnico`, `#sobre`, `#contacto`. Nuevas: `#demo`, `#cerebro`, `#licencia`, `#precio`.

No se ha tocado ninguna de las tres aplicaciones IFC (`tools/ifc-drawing`, `tools/ifc2ia-ready`, `tools/ifc-energy-model`) ni la capa `agents/`.

## Subir a GitHub

- Los dos vídeos grandes pesan menos de 25 MB cada uno a propósito: es el máximo que admite la subida de archivos desde la web de GitHub. Con Git o GitHub Desktop no hay problema hasta 100 MB.
- La subida por la web admite 100 archivos por tanda; el sitio tiene más, así que conviene subir por carpetas.
- El sitio crece unos 57 MB por los vídeos.

## Cambiar un vídeo más adelante

Sustituye el archivo con el mismo nombre. Si el nuevo pesa más de 25 MB hay que recomprimirlo. Los capítulos de la grabación real están en `index.html` y `en/index.html`, en los botones `data-t="segundos"` del bloque `.chapters`.

## Revisar

- El formulario de «Solicitar licencia» sigue siendo https://forms.cloud.microsoft/r/D8F223JxTW; su título decía «beta».
- La línea «CEREBRO se crea solo al instalar una licencia profesional de HEFESTO» está copiada del vídeo. La licencia de 699 € no dice de forma expresa que incluya CEREBRO.
- La portada inglesa usa los mismos vídeos, con sus rótulos en español, y lo avisa.
- Forge, blog, herramientas y legal comparten ya el fondo y el tema oscuro, pero conservan su tipografía Inter.
