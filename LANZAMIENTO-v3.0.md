# HEFESTOLAB v3.0 · Lanzamiento HEFESTO Pre-BIM Modeler

Fecha de lanzamiento: viernes 9 de octubre de 2026. Precio: 699 €/año + IVA.

## Cambios en la web

- Portada (ES): precio 699 € en datos estructurados, bloque de licencia y botones; fecha 9 de octubre de 2026; se retira el programa Early Access (25 plazas, 499 €, precio congelado).
- Portada (ES): nueva sección #curso con visor 3D interactivo del proyecto demo y acceso a las lecciones.
- Portada (EN): mismos cambios de precio, fecha y textos de licencia (sin sección de curso: el curso está solo en español).
- llms.txt: precio, fecha y enlace al curso.
- FORGE: nuevo Course 002 en /forge/courses/pre-bim-modeler/ (índice + 8 lecciones, manifest y changelog), tarjeta en /forge/ y entrada en forge/courses.json.
- sitemap.xml: 9 URL nuevas.

## Archivos nuevos

- assets/js/hefesto-viewer.js — visor 3D (three.js r160 servido en local, sin CDN). Rueda = zoom al cursor, botón central o Mayús + arrastrar = desplazar.
- assets/vendor/three/ — three.module.min.js, OrbitControls.js y licencia MIT.
- assets/data/hefesto-demo-model.json — geometría del proyecto demo creado en HEFESTO 0.31.10 (revisión 7) por MCP.
- assets/images/manual/plano-cad-vivienda-pb.svg — planta 2D de partida (lección 04).
- assets/images/manual/og-curso-prebim.jpg — imagen para redes sociales del curso.
- forge/assets/prebim.css — estilos del curso y del visor.

## Proyecto demo en HEFESTO

- JSON: Documentos\HEFESTO\ExportacionesMCP\HEFESTO_HEFESTO_demo_lanzamiento.json
- PDF (7 hojas A3): Documentos\HEFESTO\ExportacionesMCP\HEFESTO_HEFESTO_demo_planos_A3.pdf
- La hoja 01 (planta baja con la nave) no se exportó: tiene cotas solapadas y hay que revisarla en el compositor.

## Revisar antes de publicar

- Condiciones que venían del Early Access y se mantienen en la licencia: soporte directo por correo, influencia en la hoja de ruta y sesión de puesta en marcha en remoto.
- Formulario de reserva: sigue apuntando a https://forms.cloud.microsoft/r/D8F223JxTW; conviene cambiar su título de «beta» a «licencia».
- Lección 07: precios unitarios de ejemplo (PEM de ejemplo 100.851,70 €). Están marcados como ejemplo en la página.

## Capturas recomendadas para sustituir o añadir (opcional)

Abrir el JSON del proyecto demo y guardar en assets/images/app/ en WebP, 1600 px de ancho:

1. demo-vivienda-3d.webp — vivienda en 3D desde el suroeste, con el muro cortina.
2. demo-vivienda-capas.webp — muro de fachada seleccionado con el gestor de capas abierto.
3. demo-nave-mep.webp — nave con pórticos, correas e instalaciones.
4. demo-tablas.webp — tablas de planificación de la vivienda agrupadas por tipo.
5. demo-hoja-planta.webp — hoja 02, planta primera 1:100 con cotas.
6. demo-referencia-pdf.webp — plano PDF importado como referencia con el modelo encima.
