# Conectar tu IA con Dédalo

> Documento histórico de 0.4. La versión 0.5 incorpora el asistente **Unir IA**. Sigue la [guía actual](UNIR_IA_0.5.md): su código dura 15 minutos solo para iniciar la conexión; no limita el tiempo de uso.

El conector permite que un **cliente MCP ejecutado en tu ordenador** controle el
modelo abierto en Dédalo. Necesitas Node.js 22 o posterior y un cliente con
soporte de MCP local: por ejemplo, Claude Code, Claude Desktop o un cliente local
de Codex que admita servidores stdio. La disponibilidad depende del cliente,
cuenta y políticas del equipo; Dédalo no amplía las funciones de tu plan.

Es la primera implementación de la conexión. Tiene verificaciones automáticas
con transportes y HTTP simulados; falta probarla en un navegador y con clientes
reales. No se han modificado configuraciones de Claude o Codex en tu ordenador.

## 1. Configurar el conector una vez

Desde **Conectar IA** tienes dos alternativas:

- **Claude Desktop compatible: paquete `.mcpb` experimental.** Contiene el
  conector, dependencias y manifiesto de instalación. Claude Desktop proporciona
  el runtime Node; debe ser 22 o posterior. El manifiesto está validado con el
  esquema oficial, pero la instalación y versión real del host siguen pendientes
  de probar. No incluye ejecutables y no se ha instalado en este equipo.
- **Otros clientes: ZIP del conector.** Extráelo en una carpeta estable y usa
  Node.js 22 o posterior instalado en tu ordenador. Incluye el SDK MCP y sus
  dependencias: no necesitas instalar paquetes con npm. Su `README.md` explica la
  configuración exacta.

Si tienes las respectivas herramientas de terminal instaladas, estos comandos
añaden el MCP. Sustituye la ruta de ejemplo por la de tu `server.mjs` extraído:

```powershell
codex mcp add dedalo -- node "C:/Herramientas/DEDALO_MCP/server.mjs"
claude mcp add --transport stdio dedalo -- node "C:/Herramientas/DEDALO_MCP/server.mjs"
```

Son **alternativas** para el cliente que elijas. No es necesario lanzar los dos.
Cada cliente arranca su conector al usar MCP. En una interfaz de escritorio,
añade un servidor de tipo stdio con comando `node` y argumento la ruta absoluta
de `server.mjs`, siguiendo la configuración admitida por esa versión.

No reemplaces el archivo completo de configuración del cliente: conserva las
opciones y MCP que ya tengas. El conector no registra ni modifica nada por sí
solo. Un segundo conector usando el mismo puerto debe usar otro puerto según su
README; el panel de Dédalo permite indicar ese puerto.

## 2. Emparejar la pestaña

1. Abre Dédalo y guarda una copia de un proyecto que quieras conservar.
2. En el chat de tu cliente IA, pide: **«Usa dedalo_connection y dame el código
   para conectar Dédalo»**.
3. En Dédalo pulsa **Conectar IA**, introduce ese código y elige los permisos.
4. Pulsa **Emparejar con mi IA**. Autoriza la conexión local si tu navegador la
   solicita. Los códigos caducan y solo sirven una vez.
5. Pide a la IA que consulte el estado de Dédalo antes de dibujar.

El navegador de la web GitHub se comunica únicamente con el conector en
`127.0.0.1`. Algunos navegadores o políticas bloquean HTTPS → red local. En ese
caso utiliza la copia local de Dédalo que sirve el conector; su README y
`dedalo_connection` indican la dirección. No desactives protecciones del navegador.
Mantén la pestaña abierta y visible durante el trabajo.

El permiso de modificación permite leer y editar **el modelo abierto**. Las
capturas son otro permiso, desactivado por defecto. Puedes desconectar en todo
momento. Al abrir o crear otro proyecto necesitas emparejar de nuevo.

## 3. Pedir un modelo a partir de una foto

Adjunta la imagen **en el chat de tu propia IA**, que es quien debe admitirla e
interpretarla. Por ejemplo:

> Usa Dédalo para crear una aproximación editable de la casa de esta imagen.
> Pregúntame una medida de referencia. Distingue lo visible de lo supuesto,
> organiza muros, huecos y cubierta en grupos, consulta el estado antes de cada
> lote y comprueba el resultado. No borres el modelo que ya existe.

La IA descubre los comandos, consulta la jerarquía y usa geometría nativa,
componentes, materiales, cotas y operaciones deshacibles. Puede solicitar una
captura si la autorizaste. Debe leer de nuevo cuando una revisión cambia.

Una sola foto no contiene las medidas, cara posterior ni detalles ocultos. El
resultado será una interpretación con las limitaciones de las herramientas
actuales. Para una carrocería o un retrovisor hay mallas y deformación suave;
no se promete un modelo de fabricación ni una reconstrucción exacta automática.

## Qué comparte y qué no cuesta Dédalo

La conexión comparte el modelo y, si lo permites, capturas con tu cliente IA. El
tratamiento posterior depende del servicio que uses. El conector no llama a
OpenAI, Anthropic ni otros proveedores, no pide sus claves y no usa las del editor
de HEFESTOLAB. Tu cliente conserva sus condiciones, cuotas y posibles costes.

Los clientes MCP que se ejecutan exclusivamente en la nube necesitan otra
arquitectura para alcanzar tu ordenador; este paquete no crea túneles públicos.

Fuentes de configuración verificadas el 18/10/2026:
[MCP en clientes locales de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Claude Code](https://code.claude.com/docs/en/mcp) y
[SDK MCP oficial: stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio).
El formato de extensión se describe en
[MCPB](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) y
[extensiones de Claude Desktop](https://www.anthropic.com/engineering/desktop-extensions).
