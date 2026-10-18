# DÉDALO 0.4.0 · guías, Copiar y conexión IA

La cinta métrica conserva el plano de trabajo de la cara o arista. Los puntos
medios también permiten crear una paralela, y las referencias ajenas al plano ya
no se proyectan al origen anulando la separación. Puedes escribir una distancia
tras el primer clic sin tener que mover antes el ratón. Las flechas fijan ejes y
Mayús fija la dirección actual. Crear una guía vuelve a mostrar las guías.

**Copiar (V)** tiene botón propio y entradas en Edición y en el menú derecho.
Elige el punto de partida y el destino, o escribe una distancia/coordenadas.
El original permanece. Funciona con geometría, anotaciones, grupos y componentes;
los grupos copiados son independientes y los componentes comparten definición.
`x5` repite y `/5` reparte. Mover conserva la copia mientras mantienes Ctrl.

El menú contextual de Dédalo impide el menú del navegador tanto sobre el visor
como sobre el propio menú insertado bajo el cursor. Esc cierra primero el menú.
Los campos de texto y diálogos conservan su menú nativo de edición.

## Conectar IA

Esta versión incluye una **primera implementación del conector MCP local**, su
código, dependencias y botón de emparejamiento. No se ha validado todavía con
Claude/Codex reales ni con el permiso de red local de un navegador. Lee
[Conectar IA por MCP](CONECTAR_IA_MCP_0.4.md) antes de probarlo.

La persona configura el conector una vez en un cliente compatible. Luego pide a
su IA un código mediante `dedalo_connection`, abre **Conectar IA** en Dédalo y lo
introduce. Decide si permite modificar el modelo y compartir capturas. El cliente
interpreta las imágenes adjuntas en su propio chat; Dédalo recibe comandos de
modelado. Este conector no analiza fotos ni crea modelos por sí solo.

No hay claves IA del editor, inferencia pagada por HEFESTOLAB ni servidor público
de modelos. Cada visitante usa su propio cliente, permisos y condiciones de
cuenta. La conexión es local; los clientes que solo ejecutan MCP en la nube no
acceden a este conector directamente.

Las escrituras requieren el proyecto y revisión actuales. Si el usuario cambia
la selección, edita, deshace o abre otro contexto, la IA debe consultar de nuevo
antes de aplicar instrucciones antiguas. No puede editar durante un gesto del
ratón. Cambiar de proyecto desconecta la sesión. Se usa el mismo historial y los
lotes atómicos de Dédalo; no se admite código JavaScript arbitrario ni acceso a
archivos del ordenador mediante herramientas MCP.

Los originales y entregas anteriores se conservan. Las comprobaciones de esta
entrega son CPU y estáticas, sin iniciar navegador, aplicación, EXE, renderizado
ni servidor de escucha en este ordenador. El informe incluido distingue estas
pruebas de la aceptación visual y del uso con un cliente MCP real, pendientes.
