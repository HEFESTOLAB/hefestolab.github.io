# 0.6.1 · 21/10/2026

Guardado canónico compacto también en Guardar como; categoría IFC de grupos/componentes aplicada a su geometría interna; un único archivo con todo el modelo; aristas libres conservadas; inventario IFC paginado para IA; tiradores de cara/esquina/traslación para la caja de sección; iconos y paneles simplificados. Véase docs/MEJORAS_0.6.1.md.

# 0.6.0 · 20/10/2026

MCP: lecturas canónicas paginadas y recuperación de conexión; MCPB Claude revisado. Caja de sección humana/IA en ambos renderizadores. Territorio: tiempos de espera, recuperación y capas parciales. Exportación general IFC4/IFC2X3 con catálogo de esquemas y clasificación explícita. Guía y límites: docs/MEJORAS_0.6.0.md.

# 0.5.1 · 18/10/2026

- Vista previa real IGN en planta también desde archivo local; carga/error/reintento y ajuste al panel.
- Metros y deslizador en vivo, superficie actualizada y recorte siempre encuadrado.
- Indicador de carga para consultas y creación/exportación; espera de pintura antes del trabajo CPU.
- Bloqueo temporal de entradas y cambios MCP durante creación, conservación de undo y protección contra doble clic.
- Fuentes, modelo, IFC y herramientas existentes conservados.

# 0.5.0 · 18/10/2026

- Unir IA: asistente por pasos, descargas por cliente y enlace que prepara el código sin autorizar automáticamente. El código inicial dura 15 minutos; no limita el uso.
- Territorio España: consulta real acotada Catastro/IGN/OSM, terreno, patios, árboles compartidos, contexto, procedencia y resultado parcial visible.
- Georreferencia persistente y exportación pública IFC4/JSON para programas compatibles.
- Ejemplo real de Burgos. Ver guías de 0.5 y límites de verificación.

# 0.4.0 · 18/10/2026

- Cinta métrica: puntos medios de arista, planos de trabajo, referencias de guías identificadas, distancias inmediatas, ejes y filtro de snaps fuera del plano.
- Copiar (V) con botón y menús propios; vista previa de anotaciones, grupos independientes y componentes compartidos.
- Menú contextual: se impide el menú del navegador también sobre el popup; Esc cierra primero y los campos conservan su edición nativa.
- Conectar IA: conector MCP local experimental con SDK oficial, dependencias incluidas, emparejamiento, permisos, revisión y lotes nativos. Sin claves ni servicios de inferencia del editor. Pendiente de aceptación con navegador y cliente MCP real.
- Las cotas de 0.3 y demás herramientas se conservan. Informes y limitaciones en la documentación incluida.

# 0.3.0 · 18/10/2026

- Cotas paralelas a X/Y/Z, separación por ejes, selección con flechas/Tab y distancia inclinada con Mayús. Vista previa y medida final compartidas; recolocar cotas antiguas conserva ID/UUID y texto.
- Transformaciones y copias de anotaciones preservan los dos extremos de la línea de cota; persistencia compatible con cotas anteriores.
- Corrección de caché de vista previa, muestras de movimiento agrupadas y rutas rápidas exactas para Empujar/Tirar.
- Inferencias sobre el modelo inicial, vista casi frontal y signos de distancias corregidos.
- Ctrl/Meta mantenido copia en Mover; soltar vuelve al movimiento.
- Elipsoides, paños Bézier, subdivisión Loop y deformación suave por radio; ejemplo nativo.
- Dédalo protagonista de Gratis; cursos/FORGE retirados, herramientas IFC conservadas.
- Propuesta de conector MCP local sin claves IA del editor; no implementado aún.
- 176 pruebas CPU y 12 controles estáticos web superados, sin renderizado.

# 0.2.0 · 18/10/2026

- Escena con grupos aislados/anidados y componentes compartidos, edición por contexto y UUID.
- Transformaciones, copias, reflejos, desagrupar y hacer único.
- Panel de jerarquía, biblioteca, selección por nivel y menús.
- Formato nativo v2, deshacer/rehacer de toda la escena, lotes y trazabilidad local.
- OBJ/STL mundiales; recuperación/autoguardado de componentes y cargas atómicas.
- 79 comprobaciones CPU superadas; sin navegador, DOM, canvas, WebGL, EXE ni compilaciones.
- Compatibilidad HEFESTO pública y geometría avanzada pendientes.

# Cambios

## 0.1.1 — modo seguro (sin probar en el equipo)

Escrito tras la incidencia 0x135 del 17/10/2026. Nada de esta versión se ha ejecutado todavía en el
equipo del usuario: falta su autorización para pasar las pruebas.

- **Modo gráfico seguro por defecto**: renderizador por software propio (`app/js/view/softrender.js`)
  con búfer de profundidad, aristas con trazo y selección. No usa WebGL. Se elige en Estilos →
  Gráficos o con `?seguro` / `?acelerado`. Indicador en la barra de estado.
- **Lanzador sin lecturas del Registro** (`launcher/Dedalo.cs`). No recompilado.
- **Complementos privados**: `app/plugins/privados.js`, fuera del control de versiones, para el
  puente con HEFESTO, que vive en `../DEDALO_PRIVADO`.
- Captura PNG correcta cuando el visor y la capa 2D tienen resoluciones distintas.
- Documentación: LÉEME, licencia MIT, informe de la incidencia y plan de fases.

## 0.1.0 — primera versión

- Motor de aristas y caras: caras automáticas, división y fusión de caras, huecos, empujar/tirar con
  estiramiento, cajeado, agujero pasante, muesca y fusión de paredes coplanarias; mover, rotar,
  escalar y copiar con plegado de caras no planas; equidistancia; círculos y arcos con aristas
  suaves.
- 25 pruebas del motor con resultados geométricos exactos.
- Interfaz completa, inferencias, cuadro Medidas, paneles, consola de comandos, archivos .dedalo,
  OBJ, STL y PNG.

