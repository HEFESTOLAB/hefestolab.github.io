/* Asistente Unir IA. Descarga y permisos parten de un clic del usuario. */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const CLIENTS = { claude: 'Claude Desktop', codex: 'Codex', code: 'Claude Code', other: 'Otro cliente MCP' };
  const PROMPT = 'Usa dedalo_connection y dame el enlace para unir Dédalo. Si Dédalo ya está abierto, dame también el código para conectar esa pestaña.';
  function pairFragment(location) {
    const p = new URLSearchParams(String(location.hash || '').replace(/^#/, '')), code = p.get('dedalo-pair');
    return code && /^[A-Z0-9]{8}$/i.test(code) ? code.toUpperCase() : null;
  }
  function config(client, path) {
    const value = String(path || '').trim();
    if (!value || /[\r\n"`$]/.test(value)) throw new Error('Escribe una ruta sin comillas ni caracteres de órdenes.');
    if (client === 'codex') return 'codex mcp add dedalo -- node "' + value + '"';
    if (client === 'code') return 'claude mcp add --transport stdio --scope user dedalo -- node "' + value + '"';
    return JSON.stringify({ mcpServers: { dedalo: { command: 'node', args: [value] } } }, null, 2);
  }
  D.AISetup = { pairFragment, config, clients: CLIENTS, prompt: PROMPT };
  D.UI.prototype.consumePairLink = function () {
    const code = pairFragment(root.location); if (!code) return;
    const url = new URL(root.location.href), hash = new URLSearchParams(url.hash.slice(1)); hash.delete('dedalo-pair'); url.hash = hash.toString(); root.history.replaceState(null, '', url.href);
    this.aiWizard = { step: 2, client: 'claude', code, port: root.location.hostname === '127.0.0.1' && root.location.port || '43127' };
    if (this.panel !== 'ai') this.openPanel('ai');
    else { const body = this.el.panel.querySelector('.panel-body'); if (body) this.panel_ai(body, true); }
  };
  D.UI.prototype.panel_ai = function (body, full) {
    if (!full && body.dataset.built) { this.refreshMCP(); return; }
    const s = this.aiWizard || (this.aiWizard = { step: 0, client: 'claude', code: '', port: '43127' });
    const bridge = this.app.mcpBridge, local = new URLSearchParams(root.location.search).has('conector');
    if (bridge.status().connected) s.step = 3;
    s.renderedConnected = bridge.status().connected;
    body.dataset.built = '1'; body.replaceChildren(); body.classList.add('ai-wizard');
    const draw = () => this.panel_ai(body, true);
    const button = (text, fn, primary) => { const b = el('button', text, primary ? 'primary' : ''); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const copy = (text, label) => {
      const box = el('textarea'); box.value = text; box.readOnly = true; box.rows = Math.min(7, text.split('\n').length + 2); box.setAttribute('aria-label', label); body.append(box);
      body.append(button('Copiar ' + label, async () => { try { await root.navigator.clipboard.writeText(box.value); this.app.toast('Copiado.', 'info'); } catch (_) { box.focus(); box.select(); this.app.toast('Pulsa Ctrl+C para copiar el texto seleccionado.', 'info'); } }));
    };
    body.append(el('p', 'Tu IA, dentro de tu modelo', 'ent-title'), el('p', 'Dédalo se conecta a la IA que ya utilizas. Instala el conector una vez; después solo une la sesión. No necesitas una clave de API en Dédalo.'));
    const nav = el('div', null, 'wizard-steps'); nav.setAttribute('aria-label', 'Pasos para unir IA');
    ['Tu IA', 'Instalar', 'Conectar', 'Listo'].forEach((title, i) => { const b = button((i + 1) + ' ' + title, () => { s.step = i; draw(); }); b.disabled = i === 3 && !bridge.status().connected; if (i === s.step) b.setAttribute('aria-current', 'step'); nav.append(b); }); body.append(nav);
    if (s.step === 0) {
      body.append(el('h3', '1. Elige dónde hablas con tu IA'));
      const choices = el('div', null, 'client-choices');
      for (const [id, label] of Object.entries(CLIENTS)) { const b = button(label, () => { s.client = id; draw(); }); b.setAttribute('aria-pressed', String(s.client === id)); choices.append(b); }
      body.append(choices, el('p', 'Necesitas una aplicación que admita servidores MCP locales (stdio). La disponibilidad depende de tu cliente, cuenta y política de empresa.', 'muted'));
      body.append(button('Continuar con ' + CLIENTS[s.client], () => { s.step = 1; draw(); }, true), button('Ya lo tengo instalado', () => { s.step = 2; draw(); }));
    } else if (s.step === 1) {
      body.append(el('h3', '2. Descarga e instala el conector'));
      if (local) body.append(el('p', 'Esta copia de Dédalo ya está servida por el conector de tu ordenador. Si tu IA ya muestra las herramientas Dédalo, continúa.'));
      else {
        const link = el('a', s.client === 'claude' ? 'Descargar conector para Claude (.mcpb)' : 'Descargar conector (.zip)', 'download-cta');
        link.href = 'downloads/' + (s.client === 'claude' ? 'DEDALO_MCP_CLAUDE_v0.5.1.mcpb' : 'DEDALO_MCP_LOCAL_v0.5.1.zip'); link.download = '';
        link.addEventListener('click', () => { s.downloadRequested = true; const n = body.querySelector('.download-status'); if (n) n.textContent = 'Descarga solicitada. Busca el archivo en Descargas y sigue estos pasos.'; });
        body.append(link, el('p', s.downloadRequested ? 'Descarga solicitada. Busca el archivo en Descargas.' : 'El archivo se descarga al pulsar el botón.', 'download-status muted'));
      }
      if (s.client === 'claude') {
        const steps = el('ol'); ['En Claude Desktop, abre Ajustes → Extensiones.', 'En Ajustes avanzados, pulsa Instalar extensión y selecciona el .mcpb descargado.', 'Confirma la instalación y activa Dédalo. Si lo pide, reinicia Claude.'].forEach(t => steps.append(el('li', t))); body.append(steps);
        const a = el('a', 'Ayuda oficial de Claude'); a.href = 'https://support.claude.com/es/articles/10949351-primeros-pasos-con-servidores-mcp-locales-en-claude-desktop'; a.target = '_blank'; a.rel = 'noopener'; body.append(a);
      } else {
        body.append(el('p', 'Extrae el ZIP completo en una carpeta estable. Necesitas Node.js 22 o posterior; no hace falta ejecutar npm.'));
        const field = el('label', 'Ruta del archivo server.mjs', 'field'), path = el('input'); path.className = 'wide'; path.value = s.path || 'C:/Herramientas/DEDALO_MCP_LOCAL/server.mjs'; field.append(path); body.append(field); path.addEventListener('change', () => { s.path = path.value; draw(); });
        body.append(el('p', s.client === 'codex' ? 'En Ajustes → Servidores MCP → Añadir servidor, elige STDIO, nombre dedalo, comando node y como argumento esta ruta. Guarda y reinicia el cliente. Si tienes Codex CLI, también puedes ejecutar esta orden una vez.' : s.client === 'code' ? 'Ejecuta esta orden una vez en tu terminal y vuelve a abrir Claude Code:' : 'Añade dedalo a la configuración MCP de tu cliente con comando node y la ruta como argumento. Conserva los demás servidores y ajustes. Este ejemplo es para clientes que usan mcpServers:'));
        try { copy(config(s.client, path.value), s.client === 'other' ? 'configuración' : 'orden'); } catch (e) { body.append(el('p', e.message)); }
        if (s.client === 'codex') { const a = el('a', 'Documentación oficial de OpenAI'); a.href = 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli'; a.target = '_blank'; a.rel = 'noopener'; body.append(a); }
      }
      body.append(el('p', 'La web no puede confirmar la instalación por ti: esa confirmación se hace en tu aplicación de IA.', 'muted'), button('Ya está instalado · continuar', () => { s.step = 2; draw(); }, true));
    } else if (s.step === 2) {
      body.append(el('h3', '3. Une esta sesión de Dédalo'), el('p', 'Copia este mensaje en tu chat de IA:')); copy(PROMPT, 'mensaje');
      body.append(el('p', 'El enlace que responde tu IA abre el paso de conexión con el código preparado. Para conservar el modelo de esta pestaña, pega aquí el código.'));
      const code = el('input'); code.className = 'wide'; code.placeholder = 'Código de 8 caracteres'; code.value = s.code || ''; code.maxLength = 32; code.autocomplete = 'off'; code.spellcheck = false;
      const label = el('label', 'Código de conexión', 'field'); label.append(code); body.append(label); code.addEventListener('input', () => { s.code = code.value; });
      body.append(el('p', 'El código dura 15 minutos para iniciar la conexión. La sesión continúa mientras Dédalo y el conector estén abiertos; no tienes un límite de 15 minutos para modelar.', 'wizard-note'));
      const check = (text, checked) => { const n = el('input'); n.type = 'checkbox'; n.checked = checked; const l = el('label', null, 'check'); l.append(n, document.createTextNode(text)); body.append(l); return n; };
      const write = check('Permitir a mi IA dibujar y modificar este modelo', s.write !== false), snapshot = check('Permitir capturas del visor', s.snapshot === true);
      write.addEventListener('change', () => { s.write = write.checked; }); snapshot.addEventListener('change', () => { s.snapshot = snapshot.checked; });
      body.append(el('p', 'Al unir la IA compartes el modelo abierto con tu cliente y su proveedor de IA. Puedes desconectar en cualquier momento. Al cargar otro proyecto se cierra la conexión.', 'muted'));
      const advanced = el('details'); advanced.append(el('summary', 'Opciones y ayuda de conexión')); const port = el('input'); port.type = 'number'; port.min = '1024'; port.max = '65535'; port.value = s.port || '43127'; port.className = 'wide';
      const pl = el('label', 'Puerto local', 'field'); pl.append(port); advanced.append(pl); port.addEventListener('input', () => { s.port = port.value; });
      advanced.append(el('p', 'Si tu navegador pide permiso para conectar con el ordenador, acéptalo. Si no lo permite, guarda tu modelo y usa el enlace local que te entrega la IA. Si caduca el código, pide uno nuevo con dedalo_connection (reset: true).')); body.append(advanced);
      const status = el('p', null, 'wizard-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const connect = button('Unir mi IA a este modelo', async () => {
        try { await bridge.connect({ code: code.value, port: Number(port.value), write: write.checked, snapshot: snapshot.checked }); s.code = ''; if (bridge.status().connected) { s.step = 3; draw(); } }
        catch (e) { status.textContent = e.message + ' Comprueba que tu cliente tiene el conector activo.'; }
      }, true); body.append(status, connect); this.mcpFields = { body, code, port, write, snapshot, status, connect };
    } else {
      body.append(el('h3', bridge.status().connected ? '4. IA conectada' : 'La sesión se ha cerrado'), el('p', bridge.status().connected ? 'Ya puedes modelar desde tu chat de IA. Adjunta allí la foto y añade una medida conocida para dar escala al modelo.' : 'Pide un código nuevo a tu IA y vuelve a unir esta pestaña.'));
      if (bridge.status().connected) {
        copy('Consulta el estado y los comandos de Dédalo. A partir de la foto adjunta, crea una aproximación editable. Antes de modelar, aclara conmigo la escala y las medidas desconocidas. Conserva la geometría que ya existe.', 'ejemplo con foto');
        body.append(button('Desconectar mi IA', () => { s.step = 2; void bridge.disconnect(); draw(); }));
      } else body.append(button('Volver a conectar', () => { s.step = 2; draw(); }, true));
    }
    this.refreshMCP();
  };
  D.UI.prototype.refreshMCP = function () {
    const bridge = this.app.mcpBridge; if (!bridge) return; const state = bridge.status();
    if (this.mcpButton) this.mcpButton.textContent = state.connected ? 'IA conectada' : state.connecting ? 'Conectando IA…' : 'Unir IA';
    if (this.panel === 'ai' && this.aiWizard && this.aiWizard.renderedConnected !== state.connected) {
      const body = this.el.panel.querySelector('.panel-body');
      if (body) { this.panel_ai(body, true); return; }
    }
    const f = this.mcpFields; if (f && f.body.isConnected && f.code.isConnected) {
      f.status.textContent = state.connected ? 'Conexión activa.' : state.connecting ? 'Uniendo tu IA…' : state.error || 'Listo para conectar.';
      for (const input of [f.code, f.port, f.write, f.snapshot, f.connect]) input.disabled = state.connected || state.connecting;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
