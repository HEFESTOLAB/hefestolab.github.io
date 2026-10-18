# DÉDALO: conectar la IA del visitante sin claves del editor

**Documento histórico de diseño de 0.3.0.** La entrega 0.4.0 incluye una primera
implementación experimental de este conector. Consulta la guía vigente
[Conectar IA por MCP](CONECTAR_IA_MCP_0.4.md). Las indicaciones de «no implementado»
que siguen describen la versión anterior.

Diseño técnico, 18 de octubre de 2026. Investigación y lectura de código; no es una implementación ni una prueba de integración.

## Decisión recomendada

Sí es viable entregar un conector local opcional. DÉDALO sigue siendo una web estática gratis. Cada visitante configura el conector en un cliente que admita MCP local y usa su propia cuenta/modelo. El editor de HEFESTOLAB no aporta claves de proveedor, no paga inferencia y no ejecuta un backend de IA.

La conexión propuesta es:

```text
IA/cliente MCP del visitante
       │ stdio, JSON-RPC
       ▼
conector Node local del visitante
       │ HTTP loopback autenticado, cola corta
       ▼
pestaña DÉDALO autorizada por el visitante
       │ window.dedalo.execute(...)
       ▼
documento abierto, historial y trazabilidad existentes
```

GitHub Pages publica HTML/CSS/JavaScript estático; de ello se deriva que no puede alojar por sí solo un proceso Node que atienda MCP. El conector debe ejecutarse en el ordenador del visitante. Una IA exclusivamente en la nube que solo acepte URL MCP remotas no puede alcanzar el `127.0.0.1` del visitante. Para ese caso haría falta otra arquitectura (extensión/cliente local, o servicio remoto y autenticación), que no forma parte de esta propuesta. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

No debe anunciarse «conecta cualquier IA»: anunciar «conecta tu cliente compatible con MCP local». Suscripción, disponibilidad y tratamiento de datos dependen del cliente/modelo elegido. El conector no llama a un proveedor, pero al devolver el modelo a una IA el visitante puede estar enviándolo al proveedor de esa IA.

## Lo que DÉDALO ya tiene realmente

Lectura del código incluido en `dedalo/`, en esta revisión:

- `app/js/app.js`, `exposeAPI()`: `window.dedalo.execute(name, params, {agent, channel})`, `commands()`, `model()`, `scene()`, `snapshot()`.
- `app/js/core/hierarchy.js`: `scene.tree`, `scene.get`, `trace.get`, `model.get`, grupos, componentes, `projectId`, `projectVersion` y transacciones; `transaction.batch` es atómico y limita a 100 comandos.
- `app/js/core/document.js`: registro de comandos, pero su campo `params` contiene descripciones de texto y **no** JSON Schema. No basta con reenviar ese catálogo como si ya fuera un contrato MCP validado.

La pasarela debe usar `execute`, que conserva transacciones, validación e historial. Nunca debe modificar mapas internos de geometría ni exponer `dedalo.test.app` por red. Los IDs numéricos de cara/arista necesitan el contexto y la revisión correspondientes; los grupos/instancias usan UUID.

## Transporte MCP: compatibilidad explícita

El canal estándar local es un subproceso lanzado por el cliente: una línea JSON-RPC UTF-8 por mensaje en stdin/stdout. Diagnósticos por stderr; stdout no puede contener banners, trazas ni instrucciones de emparejamiento. [MCP stdio vigente](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)

**Detalle que evita una promesa incorrecta:** la especificación latest consultada redirige a `2026-07-28`. Esta era es stateless y usa metadatos por petición y `server/discover`; las revisiones hasta `2025-11-25` usan `initialize`. La implementación mínima solicitada (`initialize`, `tools/list`, `tools/call`) es un servidor de compatibilidad 2025, no «MCP latest» por sí sola. [Versiones MCP](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

Dos opciones de entrega válidas:

1. Prototipo pequeño, declarado compatible con `2025-11-25`: `initialize` → respuesta con `capabilities.tools` y versión admitida → `notifications/initialized` → `tools/list` / `tools/call`; `ping`, cancelación y errores JSON-RPC correctos. Rechazar versiones no admitidas; no fingir soporte moderno.
2. Recomendado para publicar: SDK oficial con stdio y soporte de ambas eras, versión de dependencia fijada y lockfile. El SDK actual documenta `serveStdio(factory)` y compatibilidad legacy. Evita mantener a mano la negociación. [SDK oficial, eras y compatibilidad](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)

Para el prototipo 2025, cada línea de entrada es un objeto individual; parse error `-32700`, invalid request `-32600`, method not found `-32601`, invalid params `-32602`. Las notificaciones no llevan respuesta. Un fallo de una operación conocida debe volver como resultado de herramienta `isError:true`; fallo de método/protocolo usa error JSON-RPC. Incluir `structuredContent` más su JSON serializado en un bloque `content` de texto. [Lifecycle 2025](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [herramientas 2025](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

## Emparejamiento y permisos del puente

Esta parte es diseño propuesto, no un requisito impuesto por MCP:

1. El conector solo escucha `127.0.0.1` (IPv6 loopback opcional separado). Nunca `0.0.0.0`, dirección LAN, túnel público ni UPnP. Puerto de ejemplo 47651, configurable. Si está ocupado, fallar con explicación; no buscar otros puertos silenciosamente.
2. Configurar los orígenes exactos permitidos: dominio definitivo HTTPS y/o `https://usuario.github.io`. No usar comodín `*.github.io`; la ruta `/repo/dedalo` no forma parte de un Origin. Por tanto, otros proyectos del mismo usuario en ese origen comparten el límite de confianza. Si se requiere aislamiento fuerte, usar subdominio propio dedicado.
3. El visitante pulsa «Conectar mi IA»; no se sondea localhost al cargar la web. La web crea una solicitud de emparejamiento con nonce aleatorio de 128 bits y obtiene un código de comparación. Aún no puede leer ni modificar documentos.
4. El conector muestra una página de control local. Para acceder a ella usa un secreto de administración de 256 bits, efímero, pasado en fragmento a una URL local de un solo uso. La URL se presenta al humano desde el lanzador o stderr del cliente MCP; nunca se devuelve al modelo como resultado de herramienta. Como algunos clientes ocultan stderr, debe existir un lanzador explícito «Abrir control local» o una ruta de inicio documentada; no depender únicamente de que el usuario vea los logs.
5. En esa página el humano comprueba origen y código, elige el proyecto y autoriza «lectura» o «lectura y propuestas de cambio». La pantalla también explica que los datos devueltos serán visibles para su cliente/IA. Confirmar aquí es parte del producto que se entrega, no una petición adicional al editor de la web.
6. Solo entonces se emite un token de sesión de 256 bits, ligado al nonce, Origin exacto, instancia de pestaña, `projectId` y permisos. Se conserva en memoria, no en localStorage, URL, ZIP, Git, telemetría ni archivos `.dedalo`. Expira al desconectar, cambiar de proyecto, cerrar la pestaña o tras 30 minutos de inactividad.
7. El indicador de DÉDALO muestra cliente conectado y alcance; «Desconectar» revoca inmediatamente el token y cancela la cola. Reemparejar para otro proyecto. Si hay varias pestañas, ninguna selección implícita de «la última».

La página local de administración también necesita token/CSRF, CSP restrictiva, `frame-ancestors 'none'`, sin scripts de terceros y sin conexiones salientes. Una página accesible por localhost sin autorización no equivale a una autorización humana. No exponer endpoints genéricos de sistema de archivos, shell, `eval`, descarga de módulos ni URLs arbitrarias. Un proceso malicioso ya ejecutándose como el usuario queda fuera de lo que el token web puede solucionar.

## HTTPS de GitHub → localhost: condiciones reales

La web pública debe usar HTTPS. Los navegadores que implementan Local Network Access pueden pedir permiso para conectar a loopback; MDN actual incluye `fetch` y WebSocket entre las superficies afectadas y diferencia `local-network` de `loopback-network`. La concesión de ese permiso puede relajar las restricciones de contenido mixto. Esto requiere detección y manejo del rechazo, no una promesa de compatibilidad universal. [MDN LNA](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)

Para HTTP se recomienda `fetch('http://127.0.0.1:47651/...', {targetAddressSpace:'loopback', ...})`, iniciado por click. Consultar `navigator.permissions.query({name:'loopback-network'})` con try/catch; si no existe, permitir un intento controlado con explicación. No recurrir a desactivar protecciones del navegador. Los recursos loopback tienen tratamiento especial de confianza, pero hay que comprobar cada navegador y política corporativa. [MDN contenido mixto](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)

HTTP de origen distinto sigue necesitando CORS. El servidor valida `Host` contra su dirección y puerto reales y `Origin` contra la lista exacta. Responde a OPTIONS para métodos/cabeceras concretos, `Access-Control-Allow-Origin` exacto y `Vary: Origin`. Sesión mediante `Authorization: Bearer ...`, `credentials:'omit'`, `Content-Type: application/json`, sin cookies y sin GET que cambie estado. Rechazar `Origin:null`, incluso si proviene de `file://`; servir el paquete local por loopback. CORS no sustituye la autorización del servidor. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

Para esta primera versión, elegir HTTP con polling/long polling del navegador: evita añadir protocolo WebSocket y permite utilizar el encabezado Authorization. Si se elige WebSocket después, validar su Origin en el handshake y autenticar antes de datos/órdenes; WebSocket no obtiene protección CORS automáticamente. [MDN servidores WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)

La guía oficial reciente de GoogleChrome cubre `ws://127.0.0.1` desde HTTPS, permisos LNA y su excepción de contenido mixto; también advierte que el constructor WebSocket no admite `targetAddressSpace`. Su soporte es limitado. El blog Chrome de junio de 2025 conserva una sección que decía que WebSocket aún no estaba cubierto: no usar ese párrafo histórico para afirmar el comportamiento actual. [Guía GoogleChrome actual](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/security/local-network-access.md), [blog histórico con lanzamiento Chrome 142](https://developer.chrome.com/blog/local-network-access)

Fallback soportable: el mismo conector sirve una copia de DÉDALO incluida en el ZIP en `http://127.0.0.1:47651/app/`, con la pasarela en ese mismo origen. Evita el salto desde origen público y CORS entre web y puente. Sigue necesitando emparejamiento/autorización. No descargar ni ejecutar código remoto en el conector para conseguirlo. Si el navegador bloquea la conexión de la web online, ofrecer este modo local como alternativa explícita.

## Herramientas iniciales y esquemas verificables

Catálogo pequeño, nombres estables, lista ordenada. Cada herramienta tiene `inputSchema` JSON Schema real, `additionalProperties:false` y validación tanto en Node como en la pestaña. Las anotaciones son pistas para el cliente, no controles de permiso. [Herramientas MCP actuales](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

| Herramienta MCP propuesta | Operación real comprobada | Alcance |
|---|---|---|
| `dedalo.status` | metadatos del puente + `trace.get` | conexión/proyecto/revisión, sin modelo completo |
| `dedalo.commands` | `window.dedalo.commands()` filtrado | catálogo de operaciones publicadas |
| `dedalo.model_stats` | `model.stats` | lectura |
| `dedalo.scene_tree` | `scene.tree` | lectura |
| `dedalo.scene_get` | `scene.get` | lectura explícita del documento |
| `dedalo.trace_get` | `trace.get` | lectura de auditoría del proyecto |
| `dedalo.face_pushpull` | `face.pushPull` | propuesta con aprobación |
| `dedalo.entities_move` | `entities.move` | propuesta con aprobación |
| `dedalo.group_create` | `group.create` | propuesta con aprobación |
| `dedalo.component_instantiate` | `component.instantiate` | propuesta con aprobación |

No publicar un `execute` arbitrario con objeto libre. Las herramientas escribibles se agregan solo cuando estén documentadas y validadas. No publicar `model.get` completo por defecto, porque incluye auditoría y más datos que una consulta de jerarquía; habilitarlo con permiso aparte si hace falta. No publicar abrir/guardar/exportar archivos a rutas locales: las descargas siguen siendo gestos del usuario en la web.

Ejemplo de esquema de entrada íntegro para la primera modificación:

```json
{
  "name": "dedalo.face_pushpull",
  "description": "Propone empujar o tirar una cara del contexto actual. La persona revisa y aprueba en DÉDALO.",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "projectId": {"type":"string", "format":"uuid"},
      "expectedVersion": {"type":"integer", "minimum":0},
      "face": {"type":"integer", "minimum":1},
      "distance": {"type":"number", "minimum":-1000000, "maximum":1000000},
      "keep": {"type":"boolean", "default":false}
    },
    "required": ["projectId", "expectedVersion", "face", "distance"]
  },
  "annotations": {"readOnlyHint":false, "destructiveHint":true, "idempotentHint":false, "openWorldHint":false}
}
```

El puente elimina `projectId`/`expectedVersion` tras validarlos y envía exclusivamente `{face,distance,keep}` a `face.pushPull`. Comprueba versión otra vez en el mismo turno JavaScript inmediatamente antes de ejecutar. Distancia usa las unidades reales del documento; la UI/resultado debe exponerlas antes de permitir actuar. Una cara seleccionada no se interpreta como permiso para actuar sobre otra revisión.

`dedalo.entities_move`: campos obligatorios `projectId`, `expectedVersion`, `vector` (array de exactamente tres números), `copy` boolean y al menos una selección explícita no vacía de `faces`, `edges`, `verts`, `annots` (arrays de enteros positivos únicos) o `nodes` (array de UUID únicos); todas las listas con límite, por ejemplo 1000. `copies` opcional integer 1..100 solo si copy=true. No permitir que arrays omitidos signifiquen «usar lo que esté seleccionado ahora».

`dedalo.group_create`: `projectId`, `expectedVersion`, `name` (1..120 caracteres), y selección explícita como arriba; traduce a `group.create`. `dedalo.component_instantiate`: proyecto/revisión, `definitionId` UUID, `name` opcional y matriz afín invertible de 16 números validada según el modelo; nunca aceptar matrices no finitas. Las lecturas sin parámetros usan `{type:'object',additionalProperties:false}`. Validar también outputs y límites de tamaño.

## Cola, consentimiento y resultados

- El cliente MCP hace `tools/call`. Node encola una operación identificada por ID aleatorio, en una única sesión/proyecto. El navegador hace long polling autenticado para recibirla y devuelve el resultado autenticado con el mismo ID.
- Lecturas solo tras autorizar lectura. Cambios: DÉDALO muestra descripción, objetos y parámetros, con Aplicar/Rechazar. En una fase posterior se puede autorizar una tanda concreta, con alcance y caducidad visibles. No conceder autonomía permanente por emparejar.
- Una ejecución a la vez por proyecto; máximo 10 pendientes. Lecturas 15 s, espera de aprobación 60 s, sin reintento automático de cambios. Si la pestaña no tiene latido reciente (5 s), error `D_BROWSER_DISCONNECTED` y ninguna modificación.
- A los 60 s se cancela **antes** de ejecutar si seguía pendiente. Si una modificación ya se ejecutó pero su respuesta se perdió, devolver estado indeterminado y exigir relectura, nunca decir que fue cancelada o reejecutarla. Guardar temporalmente resultados por `operationId` para deduplicar durante la sesión.
- Cambio humano de proyecto/contexto/revisión durante revisión invalida la propuesta (`D_STALE_DOCUMENT`). Cerrar, navegar o desconectar vacía la cola. Resultado: `{ok, operationId, projectId, versionBefore, versionAfter, result}`. Los rechazos/timeout son `isError:true` con código reconocible.
- Límite de mensaje inicial 1 MiB y respuesta 5 MiB; contadores/rangos para escenas mayores. No enviar capturas, ruta de archivo, escena completa ni auditoría en cada llamada.

## Entrega y aceptación

Ejemplo **ilustrativo para la futura implementación**, sin credenciales. Este archivo no conecta todavía: `server.mjs` no forma parte de esta entrega. La clave contenedora y la pantalla de importación varían entre clientes MCP; cada cliente debe confirmar que admite procesos stdio locales.

```json
{
  "mcpServers": {
    "dedalo-local": {
      "command": "node",
      "args": ["C:/RUTA/DEDALO-MCP/server.mjs"],
      "env": {
        "DEDALO_BRIDGE_HOST": "127.0.0.1",
        "DEDALO_BRIDGE_PORT": "47651",
        "DEDALO_ALLOWED_ORIGINS": "https://TU-DOMINIO"
      }
    }
  }
}
```

Pasos previstos para el visitante, una vez exista y se haya probado el conector:

1. Elegir una IA/cliente que soporte servidores MCP stdio en su propio ordenador.
2. Descargar el conector oficial de DÉDALO y verificar la versión publicada.
3. Añadirlo desde la configuración de su cliente, con la ruta local correcta. El visitante usa su propia IA; no introduce claves en HEFESTOLAB.
4. Abrir DÉDALO y pulsar «Conectar mi IA». Abrir el control local, comparar el código y conceder alcance al proyecto actual.
5. Si usa la web HTTPS, permitir la conexión a loopback cuando su navegador lo solicite. Si no está soportada o está bloqueada, abrir DÉDALO servido por el conector local.
6. Pedir primero una lectura de jerarquía. Después revisar una propuesta pequeña, aplicarla en DÉDALO y comprobar deshacer. Usar Desconectar al terminar.

Entregable opcional, sin publicar: fuente del conector + lockfile + instrucciones, configuración MCP de ejemplo con rutas que el usuario rellena, y modo local con copia pública de DÉDALO. Para Node exigir una versión LTS probada; para público general es mejor empaquetar runtime propio después. No editar automáticamente configuración de ninguna IA.

Pruebas necesarias antes de decir «conectado»: handshake real de un cliente local, catálogo y validadores; emparejamiento aceptado/rechazado; origen ajeno/Origin null/Host incorrecto/token ausente; timeout sin ejecución tardía; proyecto cambiado/ID caducado; doble entrega sin duplicación; undo tras cambio aprobado; pestaña cerrada; prueba HTTPS publicada de ensayo a loopback con navegador actual y modo local. Una prueba de JSON-RPC o Node no acredita el permiso de Chrome ni la conexión con la IA de un cliente concreto.

Excluir por lista permitida al empaquetar: `DEDALO_PRIVADO.zip`, contenidos de ese archivo, claves, `.env*`, certificados privados, credenciales, sesiones, logs con tokens, modelos privados de usuario, configuración particular de la IA y cualquier puente privado HEFESTO. El conector nuevo solo usa el contrato público de DÉDALO.

**Conclusión para esta entrega:** se puede construir ese conector opcional sin un MCP remoto completo. La alternativa con menos fricción de navegador es DÉDALO servido por el propio loopback; el enlace directo desde GitHub HTTPS es viable condicionado a permisos/soporte y debe validarse por navegador. Mientras solo se entregue este diseño, la interfaz debe decir «propuesta de conexión», no «MCP disponible».
