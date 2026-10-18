/* Selector cartográfico en planta: IGN WMTS, solo las teselas visibles.
 * Imagen normal: funciona desde file: sin CORS, claves ni puente MCP.
 * Servicio: https://www.ign.es/web/ign/portal/ide-area-nodo-ide-ign
 * Condiciones: https://www.ign.es/web/ign/portal/politica-datos (CC BY 4.0 compatible).
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const BASE = 'https://www.ign.es/wmts/ign-base?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=IGNBaseTodo&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible';
  function pixel(lon, lat, zoom) { const size = 256 * 2 ** zoom, sine = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180); return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size]; }
  function lonlat(x, y, zoom) { const size = 256 * 2 ** zoom; return [x / size * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI]; }
  function tileURL(zoom, x, y) { return BASE + '&TILEMATRIX=' + zoom + '&TILEROW=' + y + '&TILECOL=' + x; }
  class TerritoryMap {
    constructor(container, options) {
      this.el = container; this.options = options; this.center = options.center.slice(); this.zoom = 15; this.side = options.side || 600;
      this.listeners = []; this.destroyed = false; this.busy = false; this.fitMode = true;
      container.classList.add('territory-map'); container.setAttribute('aria-label', 'Vista previa en planta: arrastra el mapa o pulsa para centrar el recorte');
      this.tiles = document.createElement('div'); this.tiles.className = 'territory-tiles'; this.box = document.createElement('div'); this.box.className = 'territory-box';
      const credits = document.createElement('a'); credits.href = 'https://www.ign.es/web/ign/portal/politica-datos'; credits.target = '_blank'; credits.rel = 'noopener'; credits.textContent = '© IGN · Mapa base de España'; credits.className = 'map-credits';
      const zoom = document.createElement('div'); zoom.className = 'map-zoom'; this.controls = [];
      for (const [label, delta] of [['+', 1], ['−', -1]]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', delta > 0 ? 'Acercar mapa' : 'Alejar mapa'); this.listen(b, 'click', () => { if (!this.busy) { this.fitMode = false; this.zoom = Math.max(8, Math.min(18, this.zoom + delta)); this.draw(); } }); zoom.append(b); this.controls.push(b); }
      this.retry = document.createElement('button'); this.retry.type = 'button'; this.retry.textContent = '↻'; this.retry.hidden = true; this.retry.setAttribute('aria-label', 'Reintentar cargar el mapa');
      this.listen(this.retry, 'click', () => { if (!this.busy) { for (const img of [...this.tiles.children]) if (img.dataset.state === 'error') img.remove(); this.draw(); } }); zoom.append(this.retry); this.controls.push(this.retry);
      this.note = document.createElement('div'); this.note.className = 'map-note'; this.note.setAttribute('role', 'status'); this.note.setAttribute('aria-live', 'polite');
      container.append(this.tiles, this.box, zoom, credits, this.note);
      this.listen(container, 'pointerdown', e => { if (this.busy || e.target.closest('button,a') || e.button != null && e.button !== 0) return; e.preventDefault(); this.drag = { x: e.clientX, y: e.clientY, center: pixel(...this.center, this.zoom), pointerId: e.pointerId }; container.setPointerCapture(e.pointerId); });
      this.listen(container, 'pointermove', e => { if (this.drag && this.drag.pointerId === e.pointerId) this.tiles.style.transform = 'translate(' + (e.clientX - this.drag.x) + 'px,' + (e.clientY - this.drag.y) + 'px)'; });
      this.listen(container, 'pointerup', e => {
        if (!this.drag || this.drag.pointerId !== e.pointerId) return; const drag = this.drag; this.drag = null; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, rect = container.getBoundingClientRect();
        const click = Math.hypot(dx, dy) < 5, p = click ? [drag.center[0] + e.clientX - rect.left - rect.width / 2, drag.center[1] + e.clientY - rect.top - rect.height / 2] : [drag.center[0] - dx, drag.center[1] - dy];
        const center = lonlat(...p, this.zoom);
        try { D.TerritoryData.bboxAround(...center, this.side); this.center = center; if (this.options.onChange) this.options.onChange(center); } catch (_) { /* keep the prior valid Spanish recrop */ }
        this.draw();
      });
      this.listen(container, 'pointercancel', () => { this.drag = null; this.draw(); });
      if (typeof root.ResizeObserver === 'function') { this.resizeObserver = new root.ResizeObserver(() => this.fitMode ? this.fit() : this.draw()); this.resizeObserver.observe(container); }
      this.fit();
    }
    listen(node, name, listener) { node.addEventListener(name, listener); this.listeners.push([node, name, listener]); }
    set(center, side) { if (this.destroyed) return; D.TerritoryData.bboxAround(...center, side); const changedSize = side !== this.side; this.center = center.slice(); this.side = side; if (changedSize) this.fit(); else this.draw(); }
    fit() {
      if (this.destroyed) return;
      const width = this.el.clientWidth || 300, height = this.el.clientHeight || 250, bbox = D.TerritoryData.bboxAround(...this.center, this.side);
      const nw = pixel(bbox[0], bbox[3], 0), se = pixel(bbox[2], bbox[1], 0), availableWidth = Math.max(16, width - 40), availableHeight = Math.max(16, height - 40);
      this.zoom = Math.max(8, Math.min(18, Math.floor(Math.log2(Math.min(availableWidth / (se[0] - nw[0]), availableHeight / (se[1] - nw[1]))))));
      this.fitMode = true; this.draw();
    }
    setBusy(value, message) {
      this.busy = !!value; this.busyMessage = message || 'Preparando el entorno…'; this.drag = null; this.tiles.style.transform = '';
      for (const b of this.controls) b.disabled = this.busy; this.updateStatus();
    }
    updateStatus() {
      if (this.destroyed) return;
      const images = [...this.tiles.children], pending = images.filter(img => img.dataset.state === 'loading').length, errors = images.filter(img => img.dataset.state === 'error').length;
      this.retry.hidden = !errors; this.el.setAttribute('aria-busy', String(this.busy || pending > 0));
      this.note.dataset.state = this.busy || pending ? 'loading' : errors ? 'error' : 'ready';
      this.note.textContent = this.busy ? this.busyMessage : pending ? 'Cargando mapa…' : errors ? 'No se ha podido cargar parte del mapa. Pulsa ↻ para reintentar; también puedes introducir coordenadas.' : '';
    }
    draw() {
      if (this.destroyed) return;
      this.tiles.style.transform = ''; const width = this.el.clientWidth || 300, height = this.el.clientHeight || 250, center = pixel(...this.center, this.zoom);
      const bbox = D.TerritoryData.bboxAround(...this.center, this.side), nw = pixel(bbox[0], bbox[3], this.zoom), se = pixel(bbox[2], bbox[1], this.zoom);
      this.box.style.transform = 'none'; this.box.style.boxSizing = 'border-box'; this.box.style.left = (nw[0] - center[0] + width / 2) + 'px'; this.box.style.top = (nw[1] - center[1] + height / 2) + 'px';
      this.box.style.width = (se[0] - nw[0]) + 'px'; this.box.style.height = (se[1] - nw[1]) + 'px'; this.box.textContent = this.side + ' m';
      const needed = new Set(), max = 2 ** this.zoom, existing = new Map([...this.tiles.children].map(img => [img.dataset.tile, img]));
      for (let y = Math.floor((center[1] - height / 2) / 256); y < Math.ceil((center[1] + height / 2) / 256); y++) for (let x = Math.floor((center[0] - width / 2) / 256); x < Math.ceil((center[0] + width / 2) / 256); x++) {
        if (x < 0 || y < 0 || x >= max || y >= max) continue; const key = this.zoom + '/' + x + '/' + y; needed.add(key);
        let img = existing.get(key);
        if (!img) { img = document.createElement('img'); img.alt = ''; img.draggable = false; img.referrerPolicy = 'strict-origin-when-cross-origin'; img.dataset.tile = key; img.dataset.state = 'loading'; img.addEventListener('load', () => { img.dataset.state = 'ready'; this.updateStatus(); }); img.addEventListener('error', () => { img.dataset.state = 'error'; this.updateStatus(); }); this.tiles.append(img); img.src = tileURL(this.zoom, x, y); }
        img.style.left = (x * 256 - center[0] + width / 2) + 'px'; img.style.top = (y * 256 - center[1] + height / 2) + 'px';
      }
      for (const img of [...this.tiles.children]) if (!needed.has(img.dataset.tile)) img.remove();
      this.updateStatus();
    }
    destroy() {
      if (this.destroyed) return; this.destroyed = true; this.drag = null;
      if (this.resizeObserver) this.resizeObserver.disconnect();
      for (const [node, name, listener] of this.listeners) if (node.removeEventListener) node.removeEventListener(name, listener);
      this.listeners = []; this.tiles.replaceChildren(); this.el.setAttribute('aria-busy', 'false');
    }
  }
  D.TerritoryMap = TerritoryMap; D.TerritoryMapMath = { pixel, lonlat, tileURL };
})(typeof window !== 'undefined' ? window : globalThis);
