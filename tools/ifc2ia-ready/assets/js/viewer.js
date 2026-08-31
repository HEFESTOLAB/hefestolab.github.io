/* HEFESTOLAB IFC2IA Ready · visor 3D local sobre That Open Components */
(function (global) {
  'use strict';

  const SCRIPT_URL = new URL((document.currentScript && document.currentScript.src) || location.href, location.href);
  const LOCAL = {
    worker: new URL('../vendor/fragments-worker.mjs', SCRIPT_URL).href,
    wasm: new URL('../vendor/web-ifc/', SCRIPT_URL).href
  };
  const COLORS = { normal: 0x2f6fdb, review: 0xf59e0b, error: 0xef4444, selected: 0xffd166 };

  class Ifc2IaViewer {
    constructor(container, handlers) {
      this.container = container;
      this.handlers = handlers || {};
      this.engine = null;
      this.enginePromise = null;
      this.model = null;
      this.elements = [];
      this.localByGuid = new Map();
      this.guidByLocal = new Map();
      this.selectedIds = [];
      // Por defecto se respeta el material del IFC; el color por estado es opcional.
      this.qaColorMode = false;
      this._painted = false;
      this._visibility = Promise.resolve();
      this._disposed = false;
    }

    status(text, kind) { if (this.handlers.onStatus) this.handlers.onStatus(text, kind); }
    progress(value, text) { if (this.handlers.onProgress) this.handlers.onProgress(value, text); }

    async boot() {
      if (this.engine) return this.engine;
      if (this.enginePromise) return this.enginePromise;
      this.enginePromise = (async () => {
        this.progress(0.04, 'Iniciando That Open Components 3.4.8 local');
        const OBC = global.HEFESTO_THATOPEN_COMPONENTS;
        if (!OBC) {
          const error = new Error('No se encontró el motor gráfico local de That Open.');
          error.code = 'VENDOR_MISSING';
          throw error;
        }
        const components = new OBC.Components();
        const world = components.get(OBC.Worlds).create();
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = null;
        world.renderer = new OBC.SimpleRenderer(components, this.container, { antialias: true, preserveDrawingBuffer: false });
        try { world.renderer.showLogo = false; } catch (_) {}
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        components.init();
        try { components.get(OBC.Grids).create(world); } catch (_) {}

        this.progress(0.16, 'Preparando el worker local de fragmentos');
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init(LOCAL.worker);
        world.camera.controls.addEventListener('update', () => fragments.core.update());
        if (world.onCameraChanged && world.onCameraChanged.add) {
          world.onCameraChanged.add(camera => {
            for (const [, model] of fragments.list) model.useCamera(camera.three);
            fragments.core.update(true);
          });
        }
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          Promise.resolve(fragments.core.update(true)).catch(() => {});
        });

        this.progress(0.25, 'Configurando web-ifc 0.0.77 local');
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({ autoSetWasm: false, wasm: { path: LOCAL.wasm, absolute: true } });
        const mouse = new OBC.Mouse(world.renderer.three.domElement);
        let raycaster = null;
        try { raycaster = components.get(OBC.Raycasters).get(world); } catch (_) {}
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
        if (ro) ro.observe(this.container);
        this.engine = { OBC, components, world, fragments, ifcLoader, mouse, raycaster, ro };
        this.bindPicking();
        this.resize();
        return this.engine;
      })().catch(error => { this.enginePromise = null; throw error; });
      return this.enginePromise;
    }

    async open(bytes, name, elements) {
      const e = await this.boot();
      this.elements = elements || [];
      this.localByGuid.clear();
      this.guidByLocal.clear();
      this.selectedIds = [];
      this._painted = false;
      const pending = [];
      for (const [id] of [...e.fragments.list]) {
        try { pending.push(Promise.resolve(e.fragments.core.disposeModel(id))); } catch (_) {}
      }
      if (pending.length) await Promise.allSettled(pending);

      this.progress(0.34, 'Convirtiendo el IFC a geometría interactiva');
      this._seq = (this._seq || 0) + 1;
      const modelName = String(name || 'modelo').replace(/[^\w\-. áéíóúüñ]/gi, '_').slice(0, 70) + '__' + this._seq;
      const conversionTimeout = Math.max(240000, Math.min(600000, 180000 + bytes.byteLength * 12));
      this.model = await withTimeout(e.ifcLoader.load(bytes, false, modelName, {
        instanceCallback(importer) {
          importer.webIfcSettings = Object.assign({}, importer.webIfcSettings || {}, {
            COORDINATE_TO_ORIGIN: true,
            CIRCLE_SEGMENTS: 12,
            MEMORY_LIMIT: 2147483648
          });
          // IFC2IA ya ha extraído propiedades, relaciones y cantidades con su
          // lector STEP. El visor solo necesita geometría y IDs: evitar repetir
          // cientos de miles de propiedades reduce memoria y permite modelos grandes.
          importer.includeUniqueAttributes = false;
          importer.includeRelationNames = false;
          importer.includeMaterialProperties = false;
          try { importer.relations.clear(); } catch (_) {}
          try { importer.classes.abstract.clear(); } catch (_) {}
          importer.doubleSidedMaterials = true;
        },
        processData: {
          progressCallback: value => this.progress(0.34 + (Number(value) || 0) * 0.46, 'Procesando geometría IFC')
        }
      }), conversionTimeout, 'La conversión 3D ha superado el tiempo máximo para este tamaño de archivo.');

      this.progress(0.84, 'Enlazando incidencias con GlobalId');
      await this.buildBridge();
      await this.applyQaColors();
      this.refresh();
      await new Promise(resolve => setTimeout(resolve, 120));
      try { await withTimeout(this.fit(), 6000, 'Encuadre no disponible'); } catch (_) {}
      this.progress(1, 'Modelo 3D listo');
      return { linked: this.localByGuid.size, source: this.elements.length };
    }

    async buildBridge() {
      if (!this.model) return;
      // El visor abre exactamente el IFC auditado, por lo que el expressID de
      // web-ifc coincide con el STEP # conservado por IFC2IA. Esta unión evita
      // una consulta masiva al worker y mantiene GlobalId como clave pública.
      for (const element of this.elements) {
        if (!element.globalId || !Number.isFinite(element.stepId)) continue;
        this.localByGuid.set(element.globalId, element.stepId);
        this.guidByLocal.set(element.stepId, element.globalId);
      }
    }

    localIds(guids) {
      const out = [];
      for (const guid of guids || []) {
        const id = this.localByGuid.get(guid);
        if (id !== undefined) out.push(id);
      }
      return out;
    }

    color(hex) {
      const e = this.engine;
      if (!this._Color && e) {
        try {
          e.world.scene.three.traverse(object => {
            if (!this._Color && object && object.color && object.color.isColor) this._Color = object.color.constructor;
          });
        } catch (_) {}
      }
      if (this._Color) return new this._Color(hex);
      // Sin la clase Color de three a mano, se devuelve un color plano SIN isColor:
      // así el motor lo reconoce como {r,g,b} y lo convierte él mismo. Marcarlo como
      // isColor hacía que lo tratara como Color real y el coloreado fallaba en silencio.
      return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
    }

    material(hex) { return { color: this.color(hex), renderedFaces: 1, opacity: 1, transparent: false }; }

    /**
     * Devuelve los elementos indicados a su aspecto de reposo: el material real
     * del IFC, o el color del control de calidad si esa vista está activada. Por
     * defecto manda el material del archivo, que es lo que el modelador ve en su
     * programa; el color QA es una capa que se enciende cuando hace falta.
     */
    async restoreColors(ids) {
      if (!this.model || !ids || !ids.length) return;
      if (!this.qaColorMode) {
        try { await withTimeout(this.model.resetColor(ids), 3500, 'Color original no disponible'); } catch (_) {}
        return;
      }
      const groups = { normal: [], review: [], error: [] };
      const wanted = new Set(ids);
      for (const element of this.elements) {
        const id = this.localByGuid.get(element.globalId);
        if (id === undefined || !wanted.has(id)) continue;
        groups[element.status === 'Error' ? 'error' : element.status === 'Revisar' ? 'review' : 'normal'].push(id);
      }
      this._painted = true;
      await Promise.allSettled(Object.keys(groups).filter(key => groups[key].length).map(key =>
        withTimeout(this.model.setColor(groups[key], this.color(COLORS[key])), 3500, 'Color no disponible')
      ));
    }

    allLinkedIds() {
      const ids = [];
      for (const [, id] of this.localByGuid) ids.push(id);
      return ids;
    }

    async applyQaColors() {
      if (!this.model) return;
      // Recién cargado el modelo ya tiene sus materiales: no hace falta pedir al
      // worker que reponga miles de colores que nadie ha tocado.
      if (!this.qaColorMode && !this._painted) return;
      this._painted = this.qaColorMode;
      const selected = new Set(this.selectedIds);
      await this.restoreColors(this.allLinkedIds().filter(id => !selected.has(id)));
      this.refresh();
    }

    /** Alterna entre el color real del IFC y el color por estado de la medición. */
    async setQaColorMode(enabled) {
      this.qaColorMode = !!enabled;
      await this.applyQaColors();
      return this.qaColorMode;
    }

    async select(guids, options) {
      if (!this.model) return 0;
      const ids = this.localIds(guids);
      if (this.selectedIds.length) await this.restoreColors(this.selectedIds);
      this.selectedIds = ids;
      if (ids.length) {
        this._painted = true;
        try { await withTimeout(this.model.setColor(ids, this.color((options && options.problem) ? COLORS.error : COLORS.selected)), 2500, 'Selección no disponible'); } catch (_) {}
      }
      if (!options || options.zoom !== false) await this.zoomTo(guids);
      this.refresh();
      return ids.length;
    }

    async clearSelection() { return this.select([], { zoom: false }); }

    queueVisibility(task) {
      const next = this._visibility.catch(() => {}).then(task);
      this._visibility = next.catch(() => {});
      return next;
    }

    isolate(guids) {
      return this.queueVisibility(async () => {
        const e = this.engine;
        let ids = this.localIds(guids);
        if (!e || !this.model || !ids.length) return 0;
        // Aislar solo lo que se puede ver. Si ninguno de los elementos tiene
        // geometría, no se oculta nada: dejar la escena vacía no ayuda a nadie.
        const drawable = await this.drawableIds(ids);
        if (!drawable.length) return 0;
        ids = drawable;
        // No se usa Hider.isolate: internamente lanza «ocultar todo» y «mostrar
        // la selección» a la vez con Promise.all, y cuando el ocultado termina
        // el último desaparece el modelo entero. Aquí se hace en orden.
        try {
          await this.model.setVisible(undefined, false);
          await this.model.setVisible(ids, true);
          this.refresh();
          return ids.length;
        } catch (_) {
          try { await this.model.setVisible(undefined, true); this.refresh(); } catch (__) {}
          return 0;
        }
      });
    }

    showAll() {
      return this.queueVisibility(async () => {
        const e = this.engine;
        if (!e || !this.model) return false;
        try { await this.model.setVisible(undefined, true); } catch (_) {}
        try { await e.components.get(e.OBC.Hider).set(true); } catch (_) {}
        this.refresh();
        return true;
      });
    }

    vector3(x, y, z) {
      const camera = this.engine && this.engine.world.camera.three;
      return camera && camera.position && camera.position.clone ? camera.position.clone().set(x, y, z) : { x, y, z, isVector3: true };
    }

    /**
     * Una caja es válida solo si tiene números reales. Los elementos sin malla
     * propia (un IfcStair de conjunto, una anotación) devuelven una caja vacía
     * con min/max a null: si se aceptaba, la cámara se iba al origen y parecía
     * que el modelo había desaparecido.
     */
    validBox(item) {
      if (!item || !item.min || !item.max) return false;
      if (typeof item.isEmpty === 'function' && item.isEmpty()) return false;
      const { min, max } = item;
      return Number.isFinite(min.x) && Number.isFinite(min.y) && Number.isFinite(min.z) &&
        Number.isFinite(max.x) && Number.isFinite(max.y) && Number.isFinite(max.z) &&
        max.x >= min.x && max.y >= min.y && max.z >= min.z;
    }

    async boxOf(ids) {
      if (!this.model || !ids.length) return null;
      let boxes;
      try { boxes = await this.model.getBoxes(ids); } catch (_) { return null; }
      let box = null;
      for (const item of boxes || []) {
        if (!this.validBox(item)) continue;
        if (!box) box = item.clone ? item.clone() : item;
        else if (box.union) box.union(item);
      }
      return box;
    }

    /** Identificadores que realmente tienen geometría dibujada en el modelo. */
    async drawableIds(ids) {
      if (!this.model || !ids.length) return [];
      let boxes;
      try { boxes = await this.model.getBoxes(ids); } catch (_) { return ids.slice(); }
      if (!boxes || boxes.length !== ids.length) return ids.slice();
      const out = [];
      for (let i = 0; i < ids.length; i++) if (this.validBox(boxes[i])) out.push(ids[i]);
      return out;
    }

    /**
     * Encuadra una caja. La transición animada solo avanza mientras el navegador
     * emite fotogramas, así que si no termina a tiempo se coloca la cámara de
     * golpe a partir de la propia caja. Sin este respaldo la cámara se quedaba
     * en su posición inicial y el modelo aparecía diminuto, descentrado o fuera
     * de cuadro, y además el rayo de selección no acertaba en nada.
     */
    async frameBox(box) {
      const controls = this.engine && this.engine.world.camera.controls;
      if (!controls || !box || !box.min || !box.max) return false;
      try {
        await withTimeout(controls.fitToBox(box, true), 2000, 'Encuadre no disponible');
        return true;
      } catch (_) {}
      try {
        const center = box.getCenter(this.vector3(0, 0, 0));
        const size = box.getSize(this.vector3(0, 0, 0));
        const distance = Math.max(1, Math.hypot(size.x, size.y, size.z));
        await controls.setLookAt(
          center.x + distance * 0.62, center.y + distance * 0.5, center.z + distance * 0.62,
          center.x, center.y, center.z, false
        );
        // camera-controls solo escribe en la cámara dentro de update(); sin esta
        // llamada la posición no cambiaba y el modelo seguía fuera de cuadro.
        try { controls.update(1 / 60); } catch (_) {}
        this.refresh();
        return true;
      } catch (_) { return false; }
    }

    async zoomTo(guids) {
      if (!this.engine) return false;
      const box = await this.boxOf(this.localIds(guids));
      if (!box) return false;
      if (box.getSize && box.expandByScalar) {
        try {
          const size = box.getSize(this.vector3(0, 0, 0));
          if (Math.hypot(size.x, size.y, size.z) < 0.8) box.expandByScalar(1);
        } catch (_) {}
      }
      return this.frameBox(box);
    }

    async fit(attempt) {
      if (!this.engine) return false;
      const box = this.model && this.model.box;
      if (box && box.min && box.max && await this.frameBox(box)) return true;
      if ((attempt || 0) < 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return this.fit((attempt || 0) + 1);
      }
      return false;
    }

    async setView(name) {
      const e = this.engine, box = this.model && this.model.box;
      if (!e || !box || !box.getCenter) return;
      const center = box.getCenter(this.vector3(0, 0, 0));
      const size = box.getSize(this.vector3(0, 0, 0));
      const distance = Math.hypot(size.x, size.y, size.z) || 10;
      const views = {
        iso: [center.x + distance * .55, center.y + distance * .45, center.z + distance * .55],
        planta: [center.x, center.y + distance * 1.1, center.z + .001],
        alzado: [center.x, center.y, center.z + distance * 1.1]
      };
      const point = views[name] || views.iso;
      try { await withTimeout(e.world.camera.controls.setLookAt(point[0], point[1], point[2], center.x, center.y, center.z, true), 2000, 'Vista no disponible'); }
      catch (_) {
        try {
          await e.world.camera.controls.setLookAt(point[0], point[1], point[2], center.x, center.y, center.z, false);
          e.world.camera.controls.update(1 / 60);
        } catch (__) {}
      }
      this.refresh();
    }

    async setProjection(kind) {
      const projection = this.engine && this.engine.world.camera.projection;
      if (!projection) return;
      try { await projection.set(kind === 'perspective' ? 'Perspective' : 'Orthographic'); } catch (_) {}
      this.refresh();
    }

    bindPicking() {
      const dom = this.engine.world.renderer.three.domElement;
      let down = null;
      dom.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
      dom.addEventListener('pointerup', async event => {
        if (!down) return;
        const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
        down = null;
        if (moved > 4) return;
        // La posición se toma del propio evento en coordenadas normalizadas. Antes
        // se dependía del ratón interno del motor, que no siempre está al día
        // (táctil, lápiz o un canvas que ha cambiado de tamaño) y entonces el
        // rayo salía de la esquina y no acertaba nunca en el modelo.
        const rect = dom.getBoundingClientRect();
        const position = rect.width && rect.height ? {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((event.clientY - rect.top) / rect.height) * 2 + 1
        } : null;
        const guid = await this.pick(position);
        if (this.handlers.onPick) this.handlers.onPick(guid);
      });
    }

    /** Vector2 real del motor con las coordenadas del clic: el rayo lo clona. */
    pointerVector(position) {
      if (!position || !this.engine || !this.engine.mouse) return null;
      try {
        const vector = this.engine.mouse.position;
        if (!vector || typeof vector.clone !== 'function') return null;
        vector.x = position.x;
        vector.y = position.y;
        return vector;
      } catch (_) { return null; }
    }

    async pick(position) {
      const e = this.engine;
      if (!e || !this.model) return null;
      this.resize();
      const vector = this.pointerVector(position);
      let hit = null;
      // Se prueban las dos vías del motor: el raycaster de la escena y el del
      // gestor de fragmentos. Antes, si la primera devolvía vacío, no se probaba
      // la segunda y el clic en el modelo no seleccionaba nada.
      if (e.raycaster) {
        try { hit = await e.raycaster.castRay(vector ? { position: vector } : undefined); } catch (_) {}
      }
      if (!hit) {
        try {
          hit = await e.fragments.raycast({
            camera: e.world.camera.three,
            mouse: vector || (e.mouse && e.mouse.position),
            dom: e.world.renderer.three.domElement
          });
        } catch (_) {}
      }
      if (!hit) return null;
      if (this.guidByLocal.has(hit.localId)) return this.guidByLocal.get(hit.localId);
      try {
        const guids = await (hit.fragments || this.model).getGuidsByLocalIds([hit.localId]);
        return guids && guids[0] || null;
      } catch (_) { return null; }
    }

    refresh() {
      const e = this.engine;
      if (!e) return;
      try { e.fragments.core.update(true); } catch (_) {}
      try { e.world.renderer.three.render(e.world.scene.three, e.world.camera.three); } catch (_) {}
    }

    /**
     * Ajusta el lienzo y, sobre todo, la relación de aspecto de la cámara. Se
     * hace de inmediato y no dentro de requestAnimationFrame: si el visor se
     * monta con el contenedor a cero (otra fase abierta, pestaña en segundo
     * plano) el fotograma no llegaba, la cámara se quedaba sin aspecto y el
     * rayo de selección salía mal calculado, así que hacer clic en el modelo no
     * seleccionaba nada.
     */
    resize() {
      if (!this.engine || this._disposed) return;
      const apply = () => {
        if (!this.engine || this._disposed) return false;
        const rect = this.container.getBoundingClientRect();
        if (!rect || rect.width < 2 || rect.height < 2) return false;
        try { this.engine.world.renderer.resize(); } catch (_) {}
        try {
          const camera = this.engine.world.camera;
          if (camera && camera.updateAspect) camera.updateAspect();
          const three = camera && camera.three;
          if (three && 'aspect' in three && !(three.aspect > 0)) {
            three.aspect = rect.width / rect.height;
            three.updateProjectionMatrix();
          }
        } catch (_) {}
        this.refresh();
        return true;
      };
      if (apply()) return;
      // Contenedor aún sin medidas: se reintenta cuando el navegador las tenga.
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => { if (!apply()) this.resize(); }, 120);
    }

    dispose() {
      this._disposed = true;
      const e = this.engine;
      if (!e) return;
      try { if (e.ro) e.ro.disconnect(); } catch (_) {}
      try { for (const [id] of [...e.fragments.list]) Promise.resolve(e.fragments.core.disposeModel(id)).catch(() => {}); } catch (_) {}
      try { e.components.dispose(); } catch (_) {}
      this.engine = null;
      this.enginePromise = null;
      this.model = null;
      this.localByGuid.clear();
      this.guidByLocal.clear();
    }
  }

  function withTimeout(promise, milliseconds, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
    ]).finally(() => clearTimeout(timer));
  }

  global.HEFESTO_IFC2IA_VIEWER = { Viewer: Ifc2IaViewer, colors: COLORS };
})(typeof globalThis === 'undefined' ? window : globalThis);
