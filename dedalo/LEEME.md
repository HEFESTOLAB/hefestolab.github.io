# Dédalo 0.5.1

**Territorio España y Unir IA.** Corrección 0.5.1: mapa en planta desde archivo local, tamaño del recorte en vivo e indicador de carga. [Guía de territorio](docs/TERRITORIO_ESPANA_0.5.md) · [Unir IA paso a paso](docs/UNIR_IA_0.5.md).

Conserva las herramientas, cotas, jerarquía, formas libres y controles de la versión anterior. Las consultas públicas y el intercambio IFC se han comprobado en CPU; cliente IA real y aceptación gráfica pendientes.

## Documentación anterior (0.4.0)

**Guías corregidas, Copiar (V) y Conectar IA.** Consulta [Novedades 0.4](docs/NOVEDADES_0.4.md). La cinta conserva planos y crea paralelas desde puntos medios. El menú derecho ya cubre el propio popup para impedir el menú del navegador. [Guía MCP](docs/CONECTAR_IA_MCP_0.4.md): conector local experimental con dependencias incluidas, configuración inicial y emparejamiento explícito; pendiente de probar con clientes reales.

Se conservan las mejoras de [movimiento y primeras formas libres de 0.3](docs/NOVEDADES_0.3.md). Mover copia mientras mantienes Ctrl. El panel Formas libres crea elipsoides/paños y permite subdividir y deformar mallas. Abre `examples/formas-libres.dedalo` para empezar.

**Cotas paralelas a X/Y/Z.** Con D elige puntos/arista y separa la cota con el cursor. Flechas → X / ← Y / ↑ Z; Tab cambia de eje y Mayús mantenida mide una distancia inclinada. Una cota antigua se puede recolocar desde Información, con Deshacer y sin duplicarla.

**Grupos y componentes reales implementados.** Consulta [la guía de esta versión](docs/GRUPOS_COMPONENTES_0.2.md) y abre el ejemplo `examples/grupos-componentes.dedalo` desde Archivo → Abrir. El panel Jerarquía permite crear, editar, instanciar, hacer único y explotar. Se conservan abajo las instrucciones del proyecto original; el ejecutable y el lanzador no forman parte de esta entrega web.

Modelador 3D libre con el flujo de trabajo de los modeladores de caras: dibujas líneas, las caras
aparecen solas al cerrarse, y les das volumen con **Empujar/Tirar**. Motor geométrico, render,
interfaz e iconos propios, escritos desde cero.

## Abrirlo

**Doble clic en `Dedalo.html`.** Se abre en el navegador predeterminado (Edge o Chrome recomendados).
No hace falta instalar nada ni conexión a internet.

> ⚠️ **No uses `Dedalo.exe` por ahora.** El 17/10/2026 hubo un pantallazo azul (0x135) al probar
> ese lanzador. Está explicado en [docs/INCIDENCIA-2026-10-17-0x135.md](docs/INCIDENCIA-2026-10-17-0x135.md).
> El código del lanzador ya no lee el Registro, pero el `.exe` de la carpeta es el antiguo y no se ha
> vuelto a compilar.

### Modo gráfico seguro (por defecto)

Dédalo dibuja **por software**, sin WebGL ni aceleración 3D. En la barra de estado aparece la
etiqueta «Modo seguro». La aceleración (WebGL2) se activa en **Estilos → Gráficos → Acelerado**, o
abriendo `Dedalo.html?acelerado`. `Dedalo.html?seguro` fuerza siempre el modo seguro.

## Lo que hace

| Herramienta | Tecla | Notas |
|---|---|---|
| Seleccionar | Espacio | Clic, ventana → / cruce ←, Ctrl añade, Mayús alterna; doble clic: cara y aristas; triple: todo lo conectado |
| Borrar | E | Arrastra sobre aristas, guías, cotas y textos; Ctrl suaviza |
| Pintar | B | Alt toma material, Ctrl conectadas iguales, Mayús todas las iguales |
| Línea | L | Cara automática al cerrar; divide caras; longitud tecleada |
| Arco | A | Dos puntos y flecha; «12s» segmentos; semicírculo |
| Rectángulo | R | «5;4» con medidas; cuadrado y sección áurea; sobre cualquier cara |
| Círculo / Polígono | C / G | Radio tecleado; «32s» segmentos o lados |
| Empujar/Tirar | P | Estira cajas, cajea, atraviesa (agujero pasante), funde paredes coplanarias; doble clic repite; Ctrl conserva la cara |
| Mover | M | Mueve lo seleccionado o lo que hay bajo el ratón; mantén Ctrl para copiar; «x5» repite, «/5» reparte |
| Copiar | V | Herramienta propia sin mantener Ctrl; conserva el original; grupos independientes y componentes compartidos |
| Rotar | Q | Transportador sobre la cara; ajuste cada 15°; Ctrl copia |
| Escala | S | Tiradores en la caja; factor «2» o medida «3m» |
| Equidistancia | F | Hacia dentro o hacia fuera |
| Cinta métrica | T | Mide y crea guías (paralela si empiezas en una arista) |
| Cota / Texto | D / K | Cota paralela a X/Y/Z; Tab cambia eje, Mayús distancia inclinada. Texto con área, longitud o coordenadas propuestas |
| Orbitar / Desplazar / Zoom | O / H / Z | Botón central orbita, Mayús+central desplaza, rueda hace zoom al cursor; Mayús+Z ver todo |

**Inferencias**: extremo, punto medio, en arista, en cara, centro, ejes rojo/verde/azul, paralela a
arista, desde punto (alinear con un punto en el que te has parado) y guías. Mayús bloquea la
dirección; las flechas → ← ↑ bloquean los ejes rojo, verde y azul.

**Cuadro Medidas**: basta con escribir y pulsar Intro. Admite `2,5`, `250cm`, `2500mm`, `5;4`,
coordenadas absolutas `[x;y;z]` y relativas `<dx;dy;dz>`.

**Archivos**: guarda y abre `.dedalo` (JSON propio, documentado en el código). Exporta OBJ con MTL, STL
y captura PNG. Hay autoguardado local por si se cierra la ventana.

## Para agentes de IA

Todo lo que hacen las herramientas pasa por **comandos JSON** con deshacer. Por ejemplo:

```js
dedalo.execute('draw.rectangle', { origin: [0, 0, 0], width: 5, height: 4 });
dedalo.execute('face.pushPull', { face: 12, distance: 3 });
dedalo.commands();   // lista de comandos y parámetros
```

El panel **Consola de comandos** sirve para escribirlos a mano.

## Código

```
Dedalo.html          ← lo que se abre
app/js/core/         ← motor sin interfaz: geom.js, model.js (aristas y caras), document.js (comandos, historial)
app/js/view/         ← cámara, render WebGL2, render por software, inferencias, capa 2D
app/js/tools/        ← herramientas
app/js/ui/           ← interfaz e iconos
app/js/io/           ← archivos y complementos
app/plugins/         ← complementos opcionales
tests/run-tests.js   ← pruebas del motor (Node): node tests/run-tests.js
launcher/            ← lanzador opcional de Windows (ver aviso arriba)
docs/                ← incidencias y plan de fases
```

Los complementos se registran con `DEDALO.registerPlugin({ id, name, importers, exporters, menu })`.

## Licencia

MIT. Ver [LICENSE](LICENSE).
