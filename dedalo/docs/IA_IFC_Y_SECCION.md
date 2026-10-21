# Contrato de trabajo IFC para IA conectadas
El usuario asigna una categoría semántica a cada elemento constructivo, formado por un grupo o componente. La forma de una malla no acredita una categoría. Conserva las categorías explícitas y consulta al usuario cuando la función del elemento sea incierta.

1. Lee status y commands; verifica el proyecto y la revisión antes de modificar.
2. bim.inventory {"offset":0,"limit":50,"unclassifiedOnly":true} recorre TODO el modelo. Sigue nextOffset; no mezcles revisiones.
3. bim.categories {"schema":"IFC4"} ofrece clases reales y tipos admitidos.
4. bim.assign {"path":["UUID_contexto"],"nodes":["UUID_elemento"],"scope":"instance","ifc":{"entity":"IfcBeam"}} clasifica una instancia en el contexto indicado.
   Para todos los ejemplares: {"scope":"definition","definitionId":"UUID_definicion","ifc":{"entity":"IfcColumn"}}.
5. Una categoría de grupo/componente es dueña de su geometría, incluso de las piezas internas sin categoría. Los hijos con categoría explícita conservan su clasificación y se exportan por separado. No asignes clases genéricas a los prototipos compartidos de dibujo si sus ejemplares tienen funciones distintas.
6. Relee bim.inventory y revisa bim.validate {"schema":"IFC4","strictClassification":true}. Resuelve los elementos pendientes y los atributos obligatorios.
7. export.ifc {"schema":"IFC4","strictClassification":true} produce UN archivo IFC con TODO el modelo. No depende de la selección, del contexto abierto, de la visibilidad ni de la caja de sección.

No explotes componentes ni dupliques geometría para exportar. Conserva las unidades (metros), las matrices y los materiales. Guardar y Guardar como utilizan la escena canónica compacta; no generes una copia expandida del modelo.

Caja de sección:
view.sectionBoxFit {"selection":false,"padding":0.05}
view.sectionBox {"min":[-5,-5,0],"max":[5,5,12],"showBox":true,"showHandles":true}
view.sectionBox {"read":true}
view.sectionBox {"enabled":false}
Es solo una operación de visualización. Durante un arrastre de los tiradores el conector declara busy; espera a que termine antes de escribir.

