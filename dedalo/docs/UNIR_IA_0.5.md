# Unir tu IA a Dédalo

Pulsa **Unir IA** en la barra superior. El asistente se encuentra dentro de Dédalo y conserva el modelo abierto.

1. Elige **Claude Desktop**, **Codex**, **Claude Code** u otro cliente MCP local compatible.
2. Pulsa **Descargar conector**. Claude Desktop recibe el paquete .mcpb: abre Ajustes → Extensiones → Ajustes avanzados → Instalar extensión, selecciona el archivo y confirma. En Codex/Claude Code se descarga un ZIP: extráelo completo, instala Node.js 22+ si no lo tienes y sigue la configuración que muestra el asistente. No hace falta npm. La instalación se confirma en tu cliente y solo se realiza una vez.
3. Pulsa **Ya está instalado**. Copia al chat de IA el mensaje que muestra Dédalo. La herramienta dedalo_connection responde con un enlace local y un código. El enlace abre el asistente con el código preparado. Si ya estás trabajando en otra pestaña, pega allí el código para conservar ese modelo.
4. Revisa los permisos y pulsa **Unir mi IA a este modelo**. Si tu navegador pide acceso a la conexión local, concédelo. La pantalla confirma **IA conectada** y ofrece un ejemplo con una foto.

**Los 15 minutos son únicamente el plazo para usar el código inicial. No son tiempo de uso de Dédalo ni de la IA.** La conexión sigue mientras la pestaña y el conector estén activos. Se cierra al desconectar, cambiar de proyecto o perder la comunicación. El conector revoca sesiones sin señales de vida durante 30 minutos; los sondeos normales de la pestaña renuevan esa actividad. Un código caducado se sustituye solicitando dedalo_connection con reset: true.

Adjunta la foto en el chat de tu propia IA e indica una medida conocida. Pídele que consulte el estado y los comandos, conserve lo que ya existe y modele una aproximación editable. Una sola foto no aporta todas las dimensiones, caras ocultas ni escala: la IA debe aclararlas o declarar sus supuestos. Dédalo no interpreta imágenes por sí solo.

Al autorizar la conexión compartes el modelo con tu cliente y su proveedor de IA. Modificación y capturas tienen permisos separados. Dédalo no solicita claves de proveedores ni aporta una cuenta de IA. La disponibilidad depende de tu aplicación, plan y políticas de empresa. Un cliente que solo admita MCP remoto en la nube no puede llegar a este conector local.

Si la web no puede conectar con localhost, guarda tu modelo y abre el enlace local del conector; allí el visor y el puente comparten origen. La copia local no incluye otra descarga del conector, porque ya lo estás usando. No ejecutes dos conectores en el mismo puerto. No repitas a ciegas una modificación si se perdió su respuesta: consulta el modelo antes.

Instalación y sesiones de clientes reales pendientes de aceptación. Se han comprobado los flujos con pruebas CPU y dobles de transporte/interfaz; no se ha abierto aquí un navegador ni Claude/Codex para probarlo.

Fuentes: [Claude Desktop](https://support.claude.com/es/articles/10949351-primeros-pasos-con-servidores-mcp-locales-en-claude-desktop), [OpenAI Docs MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp).
