# Dédalo 0.6.1 · 21/10/2026

Actualización de Dédalo para copiar sobre el repositorio GitHub existente. El resto de la web se conserva; los originales y los proyectos de usuario no forman parte del ZIP público.

## Guardar y Guardar como
Ambas opciones guardan la escena canónica: cada definición geométrica una vez, sus instancias, transformaciones, materiales y categorías IFC. La copia geométrica expandida de compatibilidad ya no se añade al guardado normal. Se conserva la lectura de archivos anteriores.

La auditoría del archivo es un resumen de operaciones e identificadores, sin duplicar estados geométricos anteriores/posteriores. El historial completo de la sesión sigue disponible durante la edición. Como antes, abrir un archivo inicia una nueva pila de deshacer.

Comparación de los archivos aportados: 1.386.270 bytes frente a 148.551.196 bytes; ambos tienen exactamente la misma escena. El campo redundante "model" del segundo ocupa 147.164.890 bytes. El tamaño del proyecto depende de su geometría única, no del número de copias de componentes.

## Caja de sección
Activar desde Sección. Se elige Seleccionar y aparecen:
- Seis tiradores de cara, identificados X/Y/Z, para mover cada plano.
- Ocho tiradores de esquina para cambiar el tamaño.
- Un tirador central para trasladar la caja.
- Esc cancela el arrastre; el modelo conserva su geometría.
- En modelos grandes en CPU se previsualizan los tiradores con rapidez y el recorte completo se aplica al soltar.
- Se mantienen los límites numéricos y el ajuste al modelo o a la selección.

El recorte se aplica en los renderizadores CPU y WebGL. Los tiradores se dibujan en la capa 2D sin profundidad para que sigan siendo accesibles. La caja local se desactiva al cambiar de contexto. No se generan tapas de corte. El IFC siempre utiliza la geometría completa.

## IFC en tres pasos
1. Seleccionar un grupo o componente.
2. Elegir su categoría en Información o en Exportar IFC y pulsar Asignar categoría.
3. Exportar modelo completo: un único archivo IFC4 (predeterminado) o IFC2X3.

La categoría del grupo/componente abarca su geometría y todos sus descendientes sin categoría propia. Un hijo clasificado conserva su categoría y se exporta de forma independiente. Cada cara y cada arista libre se exportan una sola vez. Los grupos contenedores sin categoría propia siguen siendo contenedores; las piezas pendientes se muestran antes de exportar.

Se puede aplicar una categoría a la instancia o a todos los ejemplares del componente. Los atributos especiales, plantas, tipos y anfitriones están en opciones desplegables. No se inventan categorías por la apariencia. La exportación normal exige resolver la clasificación pendiente; la API mantiene la exportación genérica explícita para flujos de diagnóstico. Las guías, cotas y textos auxiliares no son elementos constructivos y se indican en el informe.

Iconos diferenciados para IFC, sección y jerarquía, y botones superiores con icono y texto.

## IA y conectores
Instalar/actualizar desde los nuevos archivos 0.6.1 de downloads. Los conectores mantienen su identidad y los permisos por proyecto.
- bim.inventory: inventario paginado de todo el modelo, categoría efectiva, ruta e identificadores.
- bim.assign: categoría persistente por instancia/definición; path permite indicar el contexto sin entrar a editar.
- bim.validate: comprobación IFC.
- export.ifc: siempre el modelo completo en un solo archivo; la selección y la sección no reducen el alcance.

Véase docs/IA_IFC_Y_SECCION.md. Se mantienen las lecturas canónicas paginadas y la recuperación de conexión de 0.6.0.

## Comprobación
Pruebas del motor, regresión, interfaz DOM y render CPU real; validación independiente IFC con IfcOpenShell. El informe de entrega enumera resultados y límites. La prueba de navegación real no se pudo realizar porque el entorno bloquea sockets locales; la interfaz se ejercitó mediante los manejadores reales de eventos y un lienzo CPU. No se ha ejecutado Dedalo.exe, compilado un ejecutable ni activado el renderizado acelerado. No se ha publicado el sitio.

