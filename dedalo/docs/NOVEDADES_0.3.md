# DÉDALO 0.3.0 — cotas, movimiento y formas libres

## Cotas paralelas a los ejes

Con **Cota (D)** elige dos puntos, o una arista completa, y mueve el cursor para
separar la cota. Por defecto mide la componente mayor de X/Y/Z y mantiene su línea
paralela a ese eje. La separación sigue otro eje del modelo, con un plano estable;
ya no se calcula como un desplazamiento libre orientado hacia la cámara.

- **→ X, ← Y, ↑ Z**: elegir el eje de medida. **Tab** alterna los ejes con longitud.
- **Mayús mantenida**: medir la distancia inclinada real entre los puntos.
- Haz clic para colocarla. El rótulo queda horizontal; las cotas cortas sacan sus
  flechas y texto hacia fuera para facilitar la lectura.
- Para una cota antigua, selecciónala y pulsa **Volver a colocar la cota** en
  Información. Conserva su identidad y texto; Esc cancela y Deshacer restaura.
  Si está dentro de un grupo, entra primero en su contexto.

Una cota X/Y/Z entre puntos inclinados muestra la distancia proyectada sobre el
eje elegido. Mayús muestra la distancia completa. Las cotas antiguas conservan
su posición al abrirlas hasta que decidas recolocarlas. La perspectiva sigue
proyectando los ejes del modelo sobre la pantalla; puedes usar una vista frontal
o superior para acotar en dos dimensiones.

## Empujar/Tirar y copiar

Se corrigió un fallo de caché: restaurar una vista previa podía reiniciar su número
de revisión y conservar la imagen de una operación anterior. La revisión de la
vista previa crece ahora también al restaurar o cancelar.

El movimiento procesa la última posición del ratón una vez por actualización.
En extrusiones aisladas y estiramientos válidos se actualizan los vértices sin
reconstruir la topología en cada muestra; la confirmación vuelve a ejecutar el
comando exacto. Cajeados, huecos y casos complejos conservan el cálculo geométrico
completo. Las inferencias leen la geometría de partida, evitando engancharse a la
cara que se está moviendo. Con una vista casi frontal al eje, arrastrar arriba tira
y abajo empuja. Las distancias `-1m` y `+1m` respetan el signo escrito.

Con **Mover (M), mantén Ctrl para copiar**; en macOS también sirve Meta. Puedes
pulsarlo antes de empezar o durante la operación. Al soltar, vuelve a mover.
Las copias de grupos son independientes y las de componentes comparten definición.
Tras copiar, `x5` repite y `/5` reparte, como antes. Rotar conserva su alternancia
con una pulsación de Ctrl; no se ha cambiado ese gesto.

## Primeras herramientas orgánicas

Abre **Menú → Ver → Formas libres**, o el panel lateral con ese nombre.

1. Crea un **elipsoide** como base de una carcasa o un **paño curvo** como base de
   un panel. Las medidas son metros; el bulto del paño es su altura central.
2. Selecciona la malla y usa **Subdividir y suavizar (Loop)** si necesita más
   detalle. La opción Conservar borde fija el borde de los paños abiertos.
3. **Entrar y deformar suavemente**, o doble clic seguido de **U**, abre su grupo.
   Arrastra sobre la superficie hacia arriba/abajo. El radio limita la zona
   afectada y el desplazamiento disminuye suavemente hacia su borde.
4. Esc cancela. Al soltar el ratón se confirma una operación deshacible. Puedes
   escribir una distancia mientras deformas. Guarda en `.dedalo`; OBJ/STL exportan
   la malla. Si se trata de un componente, la definición compartida se actualiza.

Prueba `examples/formas-libres.dedalo`, con una base de carcasa deformada y un paño.
Son formas orientativas para diseño conceptual, no piezas de fabricante.

Esto permite empezar a explorar un retrovisor o el interior de una puerta de un
coche mediante mallas. No equivale todavía a superficies de automoción para
fabricación: faltan NURBS, control de continuidad entre paños, espesores, recortes
y validación de autointersecciones. El paño es una superficie abierta y el
renderizador por software puede mostrar facetas. No se afirma que esas funciones
pendientes existan. La subdivisión produce una malla refinada Loop, sin evaluación
analítica de su superficie límite. Límite de esta herramienta: 16000 triángulos.

Los comandos son `mesh.ellipsoid`, `mesh.patch`, `mesh.subdivide` y `mesh.deform`.
`mesh.patch` también admite 16 puntos de control Bézier; el resultado nativo es
una malla editable, no una definición paramétrica persistente de esos controles.
La subdivisión conserva los UUID de los vértices previos y genera nuevos para la
topología añadida. El algoritmo usa las máscaras descritas en
[PBRT](https://pbr-book.org/3ed-2018/Shapes/Subdivision_Surfaces), con implementación propia.

## Web y agentes

Dédalo es la entrada principal de Gratis. Se han retirado los cursos y FORGE de
la web ES/EN; las otras herramientas IFC, precios, producto, vídeos y blog se
conservan. Un ZIP copiado sobre el repositorio no borra archivos viejos: el
paquete de GitHub explica cómo retirarlos, con un ayudante que crea respaldo.

La propuesta de conexión con la IA de cada visitante está en
`IA_Y_MCP_PROPUESTA.md`. Es un diseño, no una conexión MCP disponible en esta
versión. No se han añadido claves, peticiones a proveedores ni endpoints públicos.

## Comprobaciones

Pruebas CPU de geometría y dobles de interacción, sin DOM, canvas, navegador,
WebGL, antiguo EXE ni compilación. Se han conservado las pruebas anteriores y
añadido casos de caché, gestos, cancelación, último destino y modelado orgánico.
No se ha medido una tasa de fotogramas ni comprobado la fluidez visual en este
equipo. El renderizado por software puede seguir costando con modelos grandes.
