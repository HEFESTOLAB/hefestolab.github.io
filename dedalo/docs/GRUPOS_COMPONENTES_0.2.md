# DÉDALO 0.2.0 — grupos y componentes reales

Esta versión implementa la primera prioridad del encargo de desarrollo: jerarquía
y componentes en el motor, conectados con las herramientas y los archivos nativos.

## Uso

1. Selecciona geometría y usa **Menú → Edición → Crear grupo**, o abre el panel
   **Jerarquía** en la barra lateral. El grupo queda separado de la geometría exterior.
2. Doble clic sobre un objeto, o **Entrar a editar**, abre su contexto. La edición es
   **aislada y en coordenadas locales**: se muestra su contenido, con sus hijos,
   y la cámara vuelve a encuadrarlo. **Esc** cancela primero una herramienta activa;
   otro Esc vuelve al padre. También puedes usar el recorrido de la barra superior.
3. Agrupa varios objetos para anidar grupos. **Explotar** elimina un nivel,
   conservando la colocación de la geometría y los objetos hijos.
4. **Crear componente** convierte un grupo o una selección en una definición reutilizable.
   En la biblioteca del panel Jerarquía, **Instanciar** crea referencias a esa definición.
   Mover con Ctrl copia: las copias de componentes siguen vinculadas; las de grupos son independientes.
5. Editar dentro de una instancia actualiza su definición y, al volver al padre,
   se ven actualizadas todas sus instancias. **Hacer único** conserva la instancia
   seleccionada y le asigna una definición independiente, con nuevas identidades geométricas.
6. Mover, Rotar y Escala funcionan sobre objetos completos. El panel ofrece
   **Reflejar X**; la API también admite Y y Z. Las matrices permiten escala no uniforme.
7. Guarda en `.dedalo`. El formato 2 conserva el grafo, las definiciones, las matrices
   y los UUID. Abre archivos planos de la versión 1. OBJ/STL exportan toda la geometría
   mundial, incluso mientras se edita un grupo, y no conservan el grafo de instancias.

Abre `examples/grupos-componentes.dedalo` con **Archivo → Abrir**. Hay tres módulos
que comparten definición; dos están dentro de dos niveles de grupos. Puedes editar
uno, hacer otro único y guardar/reabrir para comprobar los vínculos.

## Arquitectura y API

`core/scene.js` conserva los modelos independientes de cada definición y las matrices
de sus nodos. `core/hierarchy.js` los integra con el documento, transacciones e historial.
Los modelos planos de visualización son evaluaciones temporales; sus IDs negativos
identifican primitivas de instancias y nunca sustituyen a la geometría canónica.
La selección resuelve esas primitivas al hijo directo del contexto actual.
Los UUID canónicos se conservan en guardado y recarga; las copias independientes
obtienen UUID nuevos. Las instancias comparten los UUID de su definición.

Las operaciones invocadas desde ratón, menús, consola o `window.dedalo.execute`
usan el mismo registro de comandos. `dedalo.commands()` enumera sus parámetros.
Nuevos comandos:

| Comando | Parámetros principales |
| --- | --- |
| `group.create` | `name`, selección o `faces`, `edges`, `annots`, `nodes` |
| `group.explode` | `nodes` o selección |
| `component.create` | `name`, selección o un grupo en `nodes` |
| `component.instantiate` | `definitionId`, `name`, `matrix` opcionales |
| `component.makeUnique` | una instancia en `nodes` o selección |
| `node.rename` | `node`, `name` |
| `context.enter` / `context.exit` | `node` para entrar |
| `entities.move` | `vector`, `nodes`, `copy`, `copies` |
| `entities.rotate` | `center`, `axis`, `angle` en grados, `nodes`, `copy`, `copies` |
| `entities.scale` / `entities.mirror` | `origin`, `factors` o `axis`, `nodes` |
| `scene.get` / `scene.tree` | lectura de escena y contexto |
| `model.get` | proyecto completo, no solo el contexto abierto |
| `transaction.batch` | `commands: [{command, params}]`, máximo 100 |
| `trace.get` | historial local de trazabilidad |
| `project.rename` | `name` |

Las matrices son 4×4 afines en orden column-major; unidades en metros y Z vertical.
Un lote es una única transacción y se revierte por completo si falla un comando.
El guardado incluye, para las últimas 100 transacciones, sesión, agente, canal,
UUID de transacción, fecha, versión y estados anteriores/posteriores de las
definiciones modificadas. La API admite atribución opcional:

```js
dedalo.execute('entities.move', {nodes: ['UUID'], vector: [2, 0, 0]},
  {agent: 'mi-agente', channel: 'api'});
```

El registro es local y editable: prepara futuras integraciones, sin afirmar
inmutabilidad criptográfica. No hay todavía servidor MCP/WebMCP ni blockchain.

## Validación y alcance

Se han ejecutado pruebas CPU con Node, sin DOM ni renderizado. Cubren el motor
previo, grupos anidados, componentes compartidos/únicos, transformaciones y copias,
selección atómica, edición por contexto, deshacer/rehacer, lotes, UUID, persistencia,
exportación de geometría mundial y rechazo atómico de archivos corruptos.
Las pruebas de interacción usan dobles de prueba, sin navegador ni canvas.
El detalle de la ejecución está en `_ENTREGA/VALIDACION.txt`, en cada ZIP.

La aplicación no se ha abierto en el navegador de este equipo. Quedan pendientes
la comprobación visual/manual y de rendimiento con proyectos grandes. La edición
aislada no muestra el resto del proyecto atenuado. El modo por software y los
enlaces `?seguro` se conservan; no se ha ejecutado el antiguo EXE ni WebGL.

**Aún pendientes del encargo integral:** compatibilidad JSON HEFESTO pública de ida
y vuelta, revolución, barridos, booleanas, edición de subelementos avanzada,
subdivisión, lofts, B-Rep/NURBS y exposición MCP/WebMCP. Se conservan las herramientas
geométricas existentes; esta entrega no presenta esas fases como implementadas.
El puente privado y los modelos de trabajo del usuario no se publican.
