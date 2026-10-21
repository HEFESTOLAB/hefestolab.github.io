# Dédalo 0.6.0 · mejoras solicitadas · 20/10/2026

Esta entrega modifica Dédalo y sus conectores. El resto de archivos de la web proporcionada se conserva byte a byte. No se publica automáticamente y no se modifican los proyectos de referencia.

## Conexión IA

- Lectura canónica de la escena: cada definición una vez, con sus instancias y matrices. La pagoda suministrada contenía 144 MB de copia geométrica desplegada frente a aproximadamente 1,2 MB de escena canónica. Las lecturas MCP dejan de regenerar esa copia.
- Lecturas paginadas con revisión, consulta de definición individual y recuperación de fallos temporales. Las respuestas se reenvían con el mismo identificador sin repetir automáticamente la operación de modelado.
- El autoguardado del navegador usa la escena canónica, sin copia geométrica desplegada ni registro de auditoría. Así evita bloquear el visor antes de que localStorage rechace el tamaño. El guardado manual .dedalo conserva su compatibilidad y auditoría; la recuperación automática recupera el modelo, no ese registro.
- Conectores nuevos en `downloads/`: instalar la versión 0.6.0. La extensión Claude mantiene su identidad estable, sus rutas relativas y su runtime Node; se evita depender de rutas temporales y configuraciones de puerto ausentes.
- Las opciones «permitir a mi IA dibujar y modificar el modelo» y «permitir capturas del visor» conservan su funcionamiento y valores predeterminados.

Consulta también la guía actualizada de conexión incluida con cada conector. La instalación real dentro de Claude Desktop y una sesión real de Codex de larga duración requieren comprobarse en esos clientes; las pruebas de transporte y protocolo no sustituyen esa aceptación.

## Caja de sección

Abre **Sección** en la barra superior o **Caja de sección** en el menú/panel lateral. Ajusta a todo o a la selección y modifica X/Y/Z mínimo/máximo en metros. **Aplicar límites** recorta; **Desactivar caja** recupera la vista completa.

El recorte funciona en modo seguro por CPU y en el renderizador WebGL. Las caras, aristas, selección y enganches respetan los límites. Es una operación de visualización: no elimina geometría, no cambia las medidas del modelo ni recorta las exportaciones. Los cortes no tienen tapas.

La caja del contexto raíz se guarda y se recupera con el proyecto. Entrar/salir de un grupo cambia las coordenadas locales y desactiva la caja. Una caja creada dentro de un componente no se guarda como si fuera una caja del modelo raíz.

Comandos de IA/humano en consola:

```text
view.sectionBoxFit {"selection":false,"padding":0.05}
view.sectionBox {"min":[-5,-5,0],"max":[5,5,12],"showBox":true}
view.sectionBox {"read":true}
view.sectionBox {"enabled":false}
```

## Territorio España

Se amplían los tiempos de espera de consultas densas de Catastro. Si el conector deja de responder entre capas, se intenta el acceso HTTPS directo permitido por los servicios. El contexto y arbolado OSM comparten consulta; los errores parciales se muestran y no invalidan las capas correctas. Una respuesta vacía no se presenta como entorno utilizable.

Prueba real de 600 m en Burgos: 396 parcelas, 2.000 volúmenes, 77 huellas sin altura inventada y 2.048 caras de terreno; importación en aproximadamente 2,6 s después de la descarga. OSM no estuvo disponible: se declaró la ausencia de vías/árboles. Cinco geometrías de fuente inválidas fueron omitidas con aviso. Los servicios públicos y sus coberturas siguen siendo externos.

## BIM y exportación IFC

Abre **IFC** en la barra superior. Selecciona **IFC4** o **IFC2X3**, clasifica grupos/componentes y pulsa **Comprobar BIM**, después **Exportar**. Se incluyen jerarquía, instancias, colocación, materiales, propiedades y plantas. El catálogo deriva de los esquemas IFC reales; no de una lista de nombres inventada.

- Una clase se asigna a las instancias seleccionadas, o a la definición del contexto abierto. La definición se hereda salvo que una instancia tenga clasificación propia.
- **Revisar clases escritas en nombres** propone solo clases IFC literales (p. ej. `IfcColumn`). **Aplicar clases escritas en nombres** es una operación explícita y deshacible; no interpreta palabras genéricas ni fuerza coincidencias conflictivas.
- **Exigir clasificación de todos los elementos** está activado inicialmente. Impide una exportación que clasifique silenciosamente elementos desconocidos. Desactivarlo permite conservarlos como `IfcBuildingElementProxy`, enumerados en el informe.
- Algunas categorías requieren atributos obligatorios. Se muestran sus campos; los huecos/proyecciones requieren el UUID del anfitrión. Las clases no disponibles en un esquema se rechazan en modo estricto o se documentan en el informe.
- IFC2X3 expresa determinadas categorías MEP mediante una ocurrencia genérica y su tipo IFC específico, según ese esquema. Los subtipos StandardCase requieren geometría paramétrica específica y se exportan con su clase base compatible, declarando la conversión.
- Se conserva la geometría de superficies abiertas como superficie; no se declara un sólido cerrado inexistente. Las cotas/textos y aristas sin caras se enumeran en el informe si no constituyen productos BIM.

La IA debe agrupar cada elemento constructivo o crear su componente y asignar `metadata.ifc` mediante `bim.assign`. Debe consultar primero `bim.categories` y terminar con `bim.validate`. No basta con construir una malla sin clasificación.

```text
bim.categories {"schema":"IFC4"}
bim.assign {"scope":"instance","ifc":{"entity":"IfcColumn","predefinedType":"COLUMN","storey":{"name":"Planta baja","elevation":0}}}
bim.get {}
bim.classifyNamed {"schema":"IFC4","apply":false}
bim.validate {"schema":"IFC4","strictClassification":true}
export.ifc {"schema":"IFC4","strictClassification":true}
```

`export.ifc` descarga por defecto y devuelve el informe. Para obtener texto IFC directamente, usa `download:false`; en modelos grandes conviene descargar para evitar llenar el contexto del cliente IA.

La validación independiente con IfcOpenShell comprueba sintaxis, esquema, reglas EXPRESS y apertura de geometrías. La aceptación visual/importación nativa en HEFESTO, Revit u otro cliente BIM sigue siendo una prueba específica de cada aplicación.

## Verificación y fuentes

El inventario de pruebas, cambios y límites de aceptación se entrega en `_ENTREGA/`. Las pruebas del motor se ejecutan con Node; las nuevas pruebas integradas de DOM/CPU se distinguieron de la aceptación real en navegador. El navegador de este entorno bloqueó el acceso local: no se declara QA visual de navegador, GPU o instalación real de Claude.

Referencias primarias:

- [IFC4 ADD2 TC1 · buildingSMART](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/)
- [IfcOpenShell · documentación oficial](https://docs.ifcopenshell.org/)
- [Codex · Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [MCPB · especificación oficial](https://github.com/modelcontextprotocol/mcpb)
- [Claude Desktop · servidores MCP locales](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

## Subir a GitHub

Extrae el ZIP y copia su contenido sobre la raíz del repositorio, conservando los archivos heredados que ya existan. No se modifica `CNAME`, `.git` ni se incluye software privado. La web original suministrada ya carecía de las tres aplicaciones IFC independientes (`tools/ifc-drawing`, `tools/ifc-energy-model`, `tools/ifc2ia-ready`), fuentes Inter y RSS. La entrega conserva esas referencias y su inventario de ausencias; no inventa ni sustituye esas aplicaciones ajenas al cambio de Dédalo.
