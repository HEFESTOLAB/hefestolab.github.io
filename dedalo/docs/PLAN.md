# Plan de fases de Dédalo

Reglas que no cambian:

1. **Motor propio.** No se copia código de SketchUp, Hew (AGPL) ni otros. De proyectos permisivos
   (SolidCraft, MIT/Apache) se pueden tomar ideas, y código solo citando su licencia.
2. **Nada del esquema de HEFESTO en el núcleo abierto.** La compatibilidad vive en
   `../DEDALO_PRIVADO` y se carga como complemento.
3. **Pruebas con resultados geométricos conocidos**: volumen, número de caras y sólido cerrado.
   Las capturas no bastan como prueba.
4. **Modo seguro**: en este equipo no se ejecuta nada sin autorización expresa del usuario. Ver
   [INCIDENCIA-2026-10-17-0x135.md](INCIDENCIA-2026-10-17-0x135.md).

## Hecho

- **0.1.0** — núcleo, herramientas e interfaz del flujo del vídeo de referencia.
- **0.1.1** — modo gráfico seguro, lanzador sin Registro y puente de exportación a HEFESTO
  (privado). Pendiente de verificación.

## Pendiente de autorización (para cerrar 0.1.1)

| Prueba | Qué ejecuta | Riesgo |
|---|---|---|
| Motor | `node DEDALO/tests/run-tests.js` | Bajo: Node sin navegador ni gráficos. Ya se ejecutó 6 veces sin problemas antes de la incidencia. |
| Puente HEFESTO | `node DEDALO_PRIVADO/puente-hefesto/pruebas.js` | Igual que el anterior. |
| Visual en modo seguro | Abrir Dédalo en el navegador integrado con `?seguro` | Medio: arranca un navegador, aunque sin WebGL. |
| Abrir el `.json` exportado en HEFESTO | Lo hace el usuario | Es el uso normal de HEFESTO. |
| Recompilar `Dedalo.exe` | `launcher\compilar.cmd` | No recomendado hasta identificar el controlador del 0x135. |

## Siguientes fases

1. **Grupos y componentes**: aislar geometría para que no se pegue, editar dentro con doble clic y
   usar ejemplares que comparten definición. Es lo que más falta respecto al vídeo, donde salen
   «Crear grupo» y «Crear componente».
2. **Importar proyectos de HEFESTO** (privado): muros con huecos, forjados, pilares, vigas,
   zapatas y componentes de perfiles, cajas y cilindros. Las booleanas de resta necesitan la fase 3.
3. **Intersecar caras y booleanas** (unión, resta, intersección) con motor propio.
4. **Sígueme, transportador, planos de sección, escenas y etiquetas.**
5. **Servidor MCP** para que un agente maneje Dédalo con los mismos comandos JSON.
6. **Rendimiento**: índice espacial para inferencias y selección, y render por GPU opcional cuando
   se haya resuelto la incidencia.
