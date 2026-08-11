/*
 * HEFESTOLAB · IFC Energy Model
 * viewer.js — Visor 3D sobre That Open Components + web-ifc
 * ---------------------------------------------------------------------------
 * El puente entre la auditoría y el modelo es el GlobalId del IFC: es estable,
 * sobrevive a la depuración del archivo y Fragments lo indexa
 * (getLocalIdsByGuids / getGuidsByLocalIds). Por eso pulsar una incidencia de
 * la auditoría aísla exactamente los mismos elementos que se van a corregir.
 *
 * Lo que se carga es el IFC ya depurado, no el original: pesa dos órdenes de
 * magnitud menos, abre en segundos y, sobre todo, es literalmente el archivo
 * que va a leer CYPE, con las alturas de los espacios ya recortadas.
 *
 * No se importa three por separado. Todos los objetos que hacen falta
 * (Color, Vector3, Box3) se obtienen de instancias vivas del propio motor, de
 * modo que no hay dos copias de three compartiendo escena.
 *
 * API verificada contra las definiciones de tipos de @thatopen/components
 * 3.4.8 y @thatopen/fragments 3.4.7.
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});

  const CDN = {
    components: 'https://cdn.jsdelivr.net/npm/@thatopen/components@3.4.8/+esm',
    wasm: 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.77/'
  };

  /** Paleta del diagnóstico: el color dice qué se va a escribir en el IFC. */
  const PALETTE = {
    fachada: 0xe0632b,
    particion: 0x2f6fdb,
    medianera: 0x7c8ea3,
    muro_sotano: 0x8b5e34,
    cubierta: 0x7c3aed,
    forjado: 0x3b82f6,
    solera: 0x8b5e34,
    muro_cortina: 0x0ea5e9,
    hueco_exterior: 0xf59e0b,
    hueco_interior: 0x60a5fa,
    pavimento_exterior: 0x94a3b8,
    losa_exterior: 0x94a3b8,
    otro: 0xb0bcc9
  };
  const SPACE_COLORS = {
    acondicionado: 0x22c1e8,
    no_acondicionado: 0x8fa3b8,
    no_habitable: 0xf59e0b,
    exterior: 0xef4444,
    descartado: 0xef4444
  };
  const GHOST = 0x9aa7b4;
  const SELECT_COLOR = 0xffd166;
  const PROBLEM_COLOR = 0xef4444;

  class Viewer {
    /**
     * @param {HTMLElement} container
     * @param {Object} handlers {onPick(guid), onStatus(text, kind), onProgress(p, text)}
     */
    constructor(container, handlers) {
      this.container = container;
      this.h = handlers || {};
      this.engine = null;
      this.enginePromise = null;
      this.model = null;
      this.project = null;
      this.localByGuid = new Map();
      this.guidByLocal = new Map();
      this.spaceIds = [];
      this.selected = [];
      this.ghosted = [];
      this.colorMode = 'diagnostico';
      this.spacesVisible = true;
      this.notes = [];
      this._visibilityQueue = Promise.resolve();
      this._disposed = false;
    }

    status(text, kind) { if (this.h.onStatus) this.h.onStatus(text, kind); }
    progress(p, text) { if (this.h.onProgress) this.h.onProgress(p, text); }

    /** Redimensiona cuando el panel ya tiene medidas estables (dos frames). */
    resize() {
      if (this._disposed) return;
      if (this._resizeFrame1) cancelAnimationFrame(this._resizeFrame1);
      if (this._resizeFrame2) cancelAnimationFrame(this._resizeFrame2);
      this._resizeFrame1 = requestAnimationFrame(() => {
        this._resizeFrame1 = null;
        this._resizeFrame2 = requestAnimationFrame(() => {
          this._resizeFrame2 = null;
          const e = this.engine;
          if (!e || this._disposed) return;
          const rect = this.container.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          try { e.world.renderer.resize(); } catch (err) { /* el panel se esta montando */ }
          this.refresh();
          this.paintOverlay();
        });
      });
    }

    /** Serializa cambios de visibilidad para que el ultimo control gane. */
    enqueueVisibility(task) {
      const run = async () => {
        if (this._disposed) return false;
        return task();
      };
      const next = this._visibilityQueue.catch(() => {}).then(run);
      this._visibilityQueue = next.catch(() => {});
      return next;
    }

    /* ==================================================================
     * Motor
     * ================================================================ */

    async boot() {
      if (this.engine) return this.engine;
      if (this.enginePromise) return this.enginePromise;
      this.enginePromise = (async () => {
        this.progress(0.02, 'Cargando That Open Components 3.4.8');
        const OBC = await import(CDN.components);

        this.progress(0.12, 'Preparando la escena');
        const components = new OBC.Components();
        const world = components.get(OBC.Worlds).create();
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = null;
        world.renderer = new OBC.SimpleRenderer(components, this.container, { antialias: true, preserveDrawingBuffer: true });
        try { world.renderer.showLogo = false; } catch (e) { /* versión sin logo */ }
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        components.init();
        // Inicializa el raycaster GPU asociado a este mundo. Sin él, las
        // selecciones pueden devolver vacío aunque haya geometría bajo el ratón.
        let raycaster = null;
        try { raycaster = components.get(OBC.Raycasters).get(world); } catch (err) { /* versión sin raycaster GPU */ }

        const ro = typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver((entries) => {
            const rect = entries && entries[0] && entries[0].contentRect;
            if (!rect || rect.width <= 0 || rect.height <= 0) return;
            this.resize();
          })
          : null;
        if (ro) ro.observe(this.container);

        try { components.get(OBC.Grids).create(world); } catch (e) { /* rejilla opcional */ }

        this.progress(0.2, 'Arrancando el worker de Fragments');
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init(await OBC.FragmentsManager.getWorker());

        world.camera.controls.addEventListener('update', () => fragments.core.update());
        if (world.onCameraChanged && world.onCameraChanged.add) {
          world.onCameraChanged.add((camera) => {
            for (const [, m] of fragments.list) m.useCamera(camera.three);
            fragments.core.update(true);
          });
        }
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          Promise.resolve(fragments.core.update(true)).catch(() => {});
        });

        this.progress(0.3, 'Configurando web-ifc 0.0.77');
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({ autoSetWasm: false, wasm: { path: CDN.wasm, absolute: true } });

        const mouse = new OBC.Mouse(world.renderer.three.domElement);
        const clipper = components.get(OBC.Clipper);

        this.engine = { OBC, components, world, fragments, ifcLoader, mouse, raycaster, clipper, ro };
        this.bindPicking();
        this.resize();
        return this.engine;
      })().catch(err => { this.enginePromise = null; throw err; });
      return this.enginePromise;
    }

    /* ------------------------------------------------------------------
     * Constructores de three tomados de instancias vivas del motor, para no
     * cargar una segunda copia de la biblioteca.
     * ---------------------------------------------------------------- */

    colorFrom(hex) {
      const e = this.engine;
      if (!this._ColorCtor && e) {
        let found = null;
        try {
          e.world.scene.three.traverse(o => {
            if (!found && o && o.color && o.color.isColor) found = o.color.constructor;
          });
        } catch (err) { /* escena vacía */ }
        this._ColorCtor = found || null;
      }
      if (this._ColorCtor) return new this._ColorCtor(hex);
      // Respaldo: objeto equivalente, que es lo que llega al worker tras
      // clonarse estructuradamente.
      return {
        isColor: true,
        r: ((hex >> 16) & 255) / 255,
        g: ((hex >> 8) & 255) / 255,
        b: (hex & 255) / 255
      };
    }

    vector3(x, y, z) {
      const c = this.engine && this.engine.world.camera.three;
      if (c && c.position && c.position.clone) return c.position.clone().set(x, y, z);
      return { x: x, y: y, z: z, isVector3: true };
    }

    material(hex, opacity) {
      return {
        color: this.colorFrom(hex),
        renderedFaces: 1,
        opacity: opacity === undefined ? 1 : opacity,
        transparent: opacity !== undefined && opacity < 1
      };
    }

    /* ==================================================================
     * Carga
     * ================================================================ */

    /**
     * @param {Uint8Array} bytes  IFC a mostrar (normalmente el ya depurado)
     * @param {string} name
     * @param {Project} project   índice de HEM.cype para el puente por GlobalId
     */
    async open(bytes, name, project) {
      // Dos cargas simultáneas dejaban el worker de Fragments bloqueado. Se
      // serializan: la nueva espera a que termine la anterior.
      const previous = this._busy;
      let release;
      this._busy = new Promise(r => { release = r; });
      if (previous) { try { await previous; } catch (err) { /* la anterior falló */ } }
      try {
        return await this._open(bytes, name, project);
      } finally {
        release();
        if (this._busy && this._busy.then) this._busy = null;
      }
    }

    async _open(bytes, name, project) {
      const e = await this.boot();
      this.project = project;
      this.notes = [];

      // disposeModel devuelve una promesa: si no se espera, se empieza a
      // convertir el modelo nuevo mientras el worker aún destruye el anterior
      // y la aplicación se queda colgada. Este era el cuelgue al recalcular.
      this.model = null;
      const pending = [];
      for (const [id] of [...e.fragments.list]) {
        try { pending.push(Promise.resolve(e.fragments.core.disposeModel(id))); } catch (err) { /* ya liberado */ }
      }
      if (pending.length) {
        this.progress(0.32, 'Liberando el modelo anterior');
        try { await Promise.all(pending); } catch (err) { /* seguimos igualmente */ }
      }
      this.localByGuid.clear();
      this.guidByLocal.clear();
      this.selected = [];
      this.ghosted = [];
      this.spaceIds = [];

      this.progress(0.35, 'Convirtiendo el IFC a Fragments');
      // Identificador único por carga: reutilizar el mismo nombre chocaba con
      // el modelo recién liberado.
      this._seq = (this._seq || 0) + 1;
      const modelName = safeName(name) + '__' + this._seq;
      this.model = await withTimeout(e.ifcLoader.load(bytes, false, modelName, {
        instanceCallback: (importer) => {
          importer.webIfcSettings = Object.assign({}, importer.webIfcSettings || {}, {
            COORDINATE_TO_ORIGIN: true,
            CIRCLE_SEGMENTS: 12
          });
          importer.doubleSidedMaterials = true;
          // Los recintos se dibujan translúcidos: es la única forma de ver a la
          // vez el volumen del espacio y el cerramiento que lo limita.
          try { importer.geometryProcessSettings.forceTransparentSpaces = true; } catch (err) { /* versión sin la opción */ }
        },
        processData: {
          progressCallback: (p) => this.progress(0.35 + (Number(p) || 0) * 0.45, 'Procesando geometría')
        }
      }), 180000, 'La conversión del IFC a Fragments no ha respondido en tres minutos.');

      this.progress(0.85, 'Enlazando la auditoría con el modelo');
      await this.buildBridge();

      this.progress(0.88, 'Agrupando por plantas y categorías');
      await this.buildClassifications();

      this.progress(0.9, 'Calibrando coordenadas');
      await this.calibrate();

      this.progress(0.93, 'Aplicando el diagnóstico');
      await this.applyColors();

      this.refresh();
      await new Promise(r => setTimeout(r, 120));
      await this.fit();
      this.refresh();
      this.progress(1, 'Modelo listo');
      return {
        elements: this.localByGuid.size, spaces: this.spaceIds.length, notes: this.notes,
        storeys: (this.storeys || []).map(s2 => s2.name),
        categories: (this.categories || []).map(c => c.name).sort(),
        planViews: this.planViews || []
      };
    }

    /** GlobalId ↔ localId, en los dos sentidos. */
    async buildBridge() {
      const P = this.project;
      if (!P || !this.model) return;
      const guids = [];
      for (const el of P.elements) if (el.guid) guids.push(el.guid);
      for (const sp of P.spaces) if (sp.guid) guids.push(sp.guid);
      if (!guids.length) return;

      let ids = [];
      try {
        ids = await this.model.getLocalIdsByGuids(guids);
      } catch (err) {
        this.notes.push('El modelo no expone los GlobalId: la selección quedará limitada.');
        this.status('No se han podido enlazar los elementos con la auditoría', 'warn');
        return;
      }
      for (let i = 0; i < guids.length; i++) {
        const localId = ids[i];
        if (localId === null || localId === undefined) continue;
        this.localByGuid.set(guids[i], localId);
        this.guidByLocal.set(localId, guids[i]);
      }
      this.spaceIds = P.spaces.map(s => this.localByGuid.get(s.guid)).filter(v => v !== undefined);
      if (!this.spaceIds.length && P.spaces.length) {
        this.notes.push('Este modelo no ha traído geometría de espacios al visor; puedes revisarlos en la vista de planta.');
      }
      const perdidos = P.elements.filter(el => el.keep && !el.container && !this.localByGuid.has(el.guid)).length;
      if (perdidos) this.notes.push(perdidos + ' elementos de la envolvente no se han podido enlazar con el 3D.');
    }

    /**
     * El importador recentra el modelo en el origen, así que las coordenadas
     * del visor no son las del proyecto. En lugar de suponer el desfase se
     * mide: se comparan las envolventes de unos cuantos elementos con las que
     * calcula nuestro propio motor.
     */
    async calibrate() {
      this.offset = [0, 0, 0];
      const P = this.project;
      if (!P || !this.model) return;
      const sample = P.elements
        .filter(el => el.keep && !el.container && el.poly && el.base != null && this.localByGuid.has(el.guid))
        .slice(0, 14);
      if (sample.length < 2) return;
      let boxes;
      try { boxes = await this.model.getBoxes(sample.map(el => this.localByGuid.get(el.guid))); } catch (err) { return; }
      if (!boxes || !boxes.length) return;

      const dx = [], dy = [], dz = [];
      for (let i = 0; i < sample.length && i < boxes.length; i++) {
        const b = boxes[i];
        if (!b || !b.min || !b.max) continue;
        const mine = HEM.geom.bbox(sample[i].poly);
        // three (x, y, z) ↔ proyecto (x, z, −y)
        dx.push((b.min.x + b.max.x) / 2 - (mine.minX + mine.maxX) / 2);
        dy.push((b.min.y + b.max.y) / 2 - (sample[i].base + sample[i].top) / 2);
        dz.push((b.min.z + b.max.z) / 2 + (mine.minY + mine.maxY) / 2);
      }
      if (dx.length < 2) return;
      const med = (a) => { const c = a.slice().sort((x, y) => x - y); return c[Math.floor(c.length / 2)]; };
      this.offset = [med(dx), med(dy), med(dz)];
      const spread = Math.max(...dx) - Math.min(...dx);
      if (spread > 0.5) {
        this.notes.push('El visor no ha podido fijar con precisión el desfase de coordenadas; dibujar recintos sobre el 3D puede desviarse.');
      }
    }

    /** Punto del visor → coordenadas de proyecto. */
    toProject(pt) {
      const o = this.offset || [0, 0, 0];
      return [pt.x - o[0], -(pt.z - o[2])];
    }

    /* ==================================================================
     * Niveles y clasificación
     * ------------------------------------------------------------------
     * That Open ya resuelve esto: Classifier agrupa por planta y por
     * categoría, Views genera las vistas de planta a partir de los
     * IfcBuildingStorey, y Hider aísla sobre esos grupos. Antes lo hacía a
     * mano con listas de identificadores, que era rehacer peor lo que la
     * biblioteca trae de fábrica.
     * ================================================================ */

    async buildClassifications() {
      const e = this.engine;
      this.storeys = [];
      this.categories = [];
      if (!e) return;
      const classifier = e.components.get(e.OBC.Classifier);
      this.classifier = classifier;

      const leer = (nombre) => {
        const c = classifier.list.get(nombre);
        if (!c) return [];
        const out = [];
        for (const [grupo, data] of c) out.push({ name: grupo, data });
        return out;
      };

      try {
        await classifier.byIfcBuildingStorey({ classificationName: 'Plantas' });
        this.storeys = leer('Plantas');
      } catch (err) { this.notes.push('No se han podido agrupar los elementos por planta.'); }
      try {
        await classifier.byCategory({ classificationName: 'Categorias' });
        this.categories = leer('Categorias');
      } catch (err) { /* la clasificación por categoría es opcional */ }

      // Vistas de planta nativas, con su plano de corte.
      try {
        const views = e.components.get(e.OBC.Views);
        views.world = e.world;
        this.views = views;
        const creadas = await views.createFromIfcStoreys({ offset: 0.35 });
        this.planViews = (creadas || []).map(v => v.id).filter(Boolean);
      } catch (err) { this.planViews = []; }

      // Cota de cada planta, tomada del índice propio: es la que se usa como
      // arranque al dibujar un recinto en ese nivel.
      const P = this.project;
      if (P && P.storeys.length) {
        for (const s of this.storeys) {
          const hit = P.storeys.find(x => x.name === s.name) ||
            P.storeys.find(x => s.name && x.name && s.name.indexOf(x.name) >= 0);
          s.elevation = hit ? hit.z : null;
        }
      }
      return this.storeys;
    }

    async groupMap(grupo) {
      if (!grupo) return null;
      let map = null;
      if (grupo.data && grupo.data.get) {
        try { map = await grupo.data.get(); } catch (err) { /* se usa el estático */ }
      }
      if (!map) map = grupo.data ? grupo.data.map : null;
      return this.currentModelMap(map);
    }

    /**
     * Classifier conserva mapas por modelId. Antes de aislar se limita siempre
     * el mapa al modelo vivo: un grupo vacío o de una carga anterior nunca
     * debe llegar a Hider.isolate(), porque Hider ocultaría toda la escena.
     */
    currentModelMap(map) {
      if (!map || !this.model) return null;
      const modelId = this.model.modelId;
      let raw = null;
      if (map instanceof Map) raw = map.get(modelId) || map.get(String(modelId));
      else raw = map[modelId] || map[String(modelId)];
      if (!raw) return null;
      let ids;
      try { ids = raw instanceof Set ? new Set(raw) : new Set(Array.from(raw)); }
      catch (err) { return null; }
      if (!ids.size) return null;
      const out = {};
      out[modelId] = ids;
      return out;
    }

    mapItemCount(map) {
      if (!map) return 0;
      let count = 0;
      const add = (value) => {
        if (!value) return;
        if (typeof value.size === 'number') count += value.size;
        else if (Array.isArray(value)) count += value.length;
      };
      if (map instanceof Map) {
        for (const value of map.values()) add(value);
      } else {
        for (const value of Object.values(map)) add(value);
      }
      return count;
    }

    /** Aísla una planta por su nombre; sin nombre, muestra todo. */
    isolateStorey(nombre) {
      return this.enqueueVisibility(async () => {
        const e = this.engine;
        if (!e) return false;
        this._closePlanViewNow();
        this.activeStorey = nombre || null;
        if (!nombre) return this._showAllNow();
        const grupo = this.storeys.find(s => s.name === nombre);
        const map = await this.groupMap(grupo);
        if (!map) {
          this.status('Esa planta no tiene elementos asociados; se mantiene la vista actual.', 'warn');
          return false;
        }
        try {
          await e.components.get(e.OBC.Hider).isolate(map);
          this.refresh();
          return true;
        } catch (err) {
          this.status('No se ha podido aislar la planta', 'warn');
          return false;
        }
      });
    }

    /**
     * Abre la vista de planta cortada que genera Views. El identificador de
     * cada vista es el nombre de la planta, tal y como la crea
     * createFromIfcStoreys.
     */
    openPlanView(nombre) {
      return this.enqueueVisibility(() => this._openPlanViewNow(nombre));
    }

    _openPlanViewNow(nombre) {
      if (!this.views) return false;
      try {
        if (!nombre) { this._closePlanViewNow(); return true; }
        this.views.open(nombre);
        this.activeView = nombre;
        this.refresh();
        return true;
      } catch (err) {
        this.status('No hay vista de planta para «' + nombre + '»', 'warn');
        return false;
      }
    }

    closePlanView() {
      return this.enqueueVisibility(() => this._closePlanViewNow());
    }

    _closePlanViewNow() {
      if (!this.views) return;
      try { this.views.close(); } catch (err) { /* */ }
      this.activeView = null;
      this.refresh();
      return true;
    }

    isolateCategory(cat) {
      return this.enqueueVisibility(async () => {
        const e = this.engine;
        if (!e) return false;
        this._closePlanViewNow();
        this.activeStorey = null;
        if (!cat) return this._showAllNow();
        const grupo = this.categories.find(c => c.name === cat);
        const map = await this.groupMap(grupo);
        if (!map) {
          this.status('Esa categoria no tiene elementos asociados; se mantiene la vista actual.', 'warn');
          return false;
        }
        try {
          await e.components.get(e.OBC.Hider).isolate(map);
          this.refresh();
          return true;
        } catch (err) {
          this.status('No se ha podido aislar la categoria', 'warn');
          return false;
        }
      });
    }

    /** Aísla lo seleccionado, usando el Hider en vez de setVisible a mano. */
    isolateSelection() {
      return this.enqueueVisibility(async () => {
        const e = this.engine;
        if (!e || !this.model || !this.selected.length) {
          this.status('Selecciona primero un elemento visible.', 'warn');
          return false;
        }
        const map = {};
        map[this.model.modelId] = new Set(this.selected);
        if (!this.mapItemCount(map)) return false;
        try {
          await e.components.get(e.OBC.Hider).isolate(map);
          this.refresh();
          return true;
        } catch (err) { return false; }
      });
    }

    hideSelection() {
      return this.enqueueVisibility(async () => {
        const e = this.engine;
        if (!e || !this.model || !this.selected.length) {
          this.status('Selecciona primero un elemento visible.', 'warn');
          return false;
        }
        const map = {};
        map[this.model.modelId] = new Set(this.selected);
        if (!this.mapItemCount(map)) return false;
        try {
          await e.components.get(e.OBC.Hider).set(false, map);
          this.refresh();
          return true;
        } catch (err) { return false; }
      });
    }

    /* ==================================================================
     * Color, selección y visibilidad
     * ================================================================ */

    refresh() {
      const e = this.engine;
      if (e) Promise.resolve(e.fragments.core.update(true)).catch(() => {});
    }

    localIds(guids) {
      const out = [];
      for (const g of guids || []) {
        const id = this.localByGuid.get(g);
        if (id !== undefined) out.push(id);
      }
      return out;
    }

    /** Pinta el modelo según el diagnóstico de la auditoría. */
    async applyColors(mode) {
      if (mode) this.colorMode = mode;
      const P = this.project;
      const model = this.model;
      if (!P || !model) return;

      try { await model.resetHighlight(); } catch (err) { /* nada que restablecer */ }
      this.selected = [];
      this.ghosted = [];

      if (this.colorMode === 'original') { this.refresh(); return; }

      const groups = new Map();
      const add = (color, id) => {
        if (id === undefined) return;
        if (!groups.has(color)) groups.set(color, []);
        groups.get(color).push(id);
      };

      const purged = [];
      for (const el of P.elements) {
        const id = this.localByGuid.get(el.guid);
        if (id === undefined) continue;
        if (!el.keep || el.container) { purged.push(id); continue; }
        if (this.colorMode === 'familia') {
          add(PALETTE[el.role] || PALETTE.otro, id);
        } else {
          add(el.decided === true ? PALETTE.fachada
            : (el.role === 'solera' || el.role === 'muro_sotano') ? PALETTE.muro_sotano
              : el.role === 'cubierta' ? PALETTE.cubierta
                : (PALETTE[el.role] || PALETTE.particion), id);
        }
      }
      for (const sp of P.spaces) {
        const id = this.localByGuid.get(sp.guid);
        if (id === undefined) continue;
        add(SPACE_COLORS[sp.use] || SPACE_COLORS.acondicionado, id);
      }

      for (const [color, ids] of groups) {
        try { await model.setColor(ids, this.colorFrom(color)); } catch (err) { /* color no admitido */ }
      }
      if (purged.length) {
        this.ghosted = purged;
        try { await model.highlight(purged, this.material(GHOST, 0.14)); } catch (err) { /* sin fantasma */ }
      }
      this.refresh();
    }

    async select(guids, options) {
      const opt = options || {};
      const model = this.model;
      if (!model) return 0;
      const ids = this.localIds(guids);

      if (this.selected.length) {
        try { await model.resetHighlight(this.selected); } catch (err) { /* ya restablecido */ }
        const back = this.selected.filter(id => this.ghosted.indexOf(id) >= 0);
        if (back.length) {
          try { await model.highlight(back, this.material(GHOST, 0.14)); } catch (err) { /* */ }
        }
      }
      this.selected = ids;
      if (ids.length) {
        try { await model.highlight(ids, this.material(opt.problem ? PROBLEM_COLOR : SELECT_COLOR)); } catch (err) { /* */ }
      }
      if (opt.zoom !== false) await this.zoomTo(guids);
      this.refresh();
      return ids.length;
    }

    async clearSelection() { await this.select([], { zoom: false }); }

    /** Une envolventes sin necesitar el constructor de Box3. */
    async boxOf(ids) {
      if (!this.model || !ids.length) return null;
      let boxes;
      try { boxes = await this.model.getBoxes(ids); } catch (err) { return null; }
      let box = null;
      for (const b of boxes || []) {
        if (!b || !b.min || !b.max) continue;
        if (!box) box = b.clone ? b.clone() : b;
        else box.union(b);
      }
      return box;
    }

    async zoomTo(guids) {
      const e = this.engine;
      if (!e) return;
      const box = await this.boxOf(this.localIds(guids));
      if (!box) return this.fit();
      try {
        if (box.getSize && box.expandByScalar) {
          const size = box.getSize(this.vector3(0, 0, 0));
          const diag = Math.hypot(size.x, size.y, size.z);
          if (diag < 0.8) box.expandByScalar(1);
        }
        await e.world.camera.controls.fitToBox(box, true);
      } catch (err) { /* controles sin fitToBox */ }
    }

    async fit(intento) {
      const e = this.engine;
      if (!e) return;
      // El encuadre puede llegar antes de que Fragments haya publicado la
      // envolvente del modelo, y entonces la cámara se queda mirando al vacío:
      // es la pantalla en negro. Se reintenta y, si no, se coloca en isométrica.
      const valida = (b) => b && b.min && b.max && Number.isFinite(b.min.x) &&
        (b.max.x - b.min.x + b.max.y - b.min.y + b.max.z - b.min.z) > 0.01;
      try {
        if (this.model && valida(this.model.box)) {
          await e.world.camera.controls.fitToBox(this.model.box, true);
          return true;
        }
      } catch (err) { /* se prueba con la escena */ }
      try {
        await e.world.camera.controls.fitToBox(e.world.scene.three, true);
        return true;
      } catch (err) { /* */ }
      if ((intento || 0) < 3) {
        await new Promise(r => setTimeout(r, 350));
        return this.fit((intento || 0) + 1);
      }
      try { await this.setView('iso'); } catch (err) { /* */ }
      this.notes.push('El visor no ha podido encuadrar el modelo automáticamente. Pulsa «Encuadrar» o usa las vistas ISO / Planta.');
      return false;
    }

    isolate(guids) {
      return this.enqueueVisibility(async () => {
        const e = this.engine;
        const model = this.model;
        if (!e || !model) return 0;
        const ids = this.localIds(guids);
        if (!ids.length) {
          this.status('Esos elementos no están en el modelo depurado. Usa «Original completo».', 'warn');
          return 0;
        }
        const map = {};
        map[model.modelId] = new Set(ids);
        this._closePlanViewNow();
        this.activeStorey = null;
        try {
          await e.components.get(e.OBC.Hider).isolate(map);
          this.refresh();
          return ids.length;
        } catch (err) {
          this.status('Este modelo no admite aislar elementos', 'warn');
          return 0;
        }
      });
    }

    showAll() {
      return this.enqueueVisibility(() => this._showAllNow());
    }

    async _showAllNow() {
      const e = this.engine;
      this.activeStorey = null;
      this._closePlanViewNow();
      if (e && e.clipper) {
        try { e.clipper.deleteAll(); } catch (err) { /* sin planos */ }
        try { e.clipper.enabled = false; } catch (err) { /* */ }
      }
      if (e) {
        try { await e.components.get(e.OBC.Hider).set(true); } catch (err) { /* */ }
      }
      if (this.model) {
        try { await this.model.setVisible(undefined, true); } catch (err) { /* */ }
        if (!this.spacesVisible && this.spaceIds.length) {
          try { await this.model.setVisible(this.spaceIds, false); } catch (err) { /* */ }
        }
      }
      this.refresh();
      return true;
    }

    setSpacesVisible(visible) {
      return this.enqueueVisibility(async () => {
        this.spacesVisible = !!visible;
        if (!this.model || !this.spaceIds.length) return true;
        try { await this.model.setVisible(this.spaceIds, this.spacesVisible); } catch (err) { return false; }
        this.refresh();
        return true;
      });
    }

    async setFamilyVisible(family, visible) {
      const P = this.project;
      if (!P || !this.model) return;
      const ids = [];
      for (const el of P.elements) {
        if (el.family !== family) continue;
        const id = this.localByGuid.get(el.guid);
        if (id !== undefined) ids.push(id);
      }
      if (!ids.length) return;
      try { await this.model.setVisible(ids, !!visible); } catch (err) { /* */ }
      this.refresh();
    }

    /* ==================================================================
     * Sección
     * ================================================================ */

    section(mode) {
      return this.enqueueVisibility(() => this._sectionNow(mode));
    }

    async _sectionNow(mode) {
      const e = this.engine;
      if (!e || !e.clipper) return false;
      try { e.clipper.deleteAll(); } catch (err) { /* sin planos previos */ }
      if (!mode || mode === 'off') {
        e.clipper.enabled = false;
        this.refresh();
        return true;
      }
      e.clipper.enabled = true;
      const box = this.model && this.model.box ? this.model.box : null;
      if (!box || !box.getCenter) { this.status('No se ha podido situar el plano de sección', 'warn'); return false; }
      const center = box.getCenter(this.vector3(0, 0, 0));
      let normal, point = center;
      if (mode === 'planta') {
        normal = this.vector3(0, -1, 0);
        point = this.vector3(center.x, box.min.y + (box.max.y - box.min.y) * 0.45, center.z);
      } else if (mode === 'alzado') {
        normal = this.vector3(0, 0, -1);
      } else {
        normal = this.vector3(-1, 0, 0);
      }
      try {
        e.clipper.createFromNormalAndCoplanarPoint(e.world, normal, point);
      } catch (err) {
        this.status('No se ha podido crear el plano de sección', 'warn');
        return false;
      }
      this.refresh();
      return true;
    }

    /* ==================================================================
     * Dibujo de recintos sobre el modelo
     * ------------------------------------------------------------------
     * El enganche lo resuelve el propio Fragments: raycast() admite clases
     * de captura a punto, arista y cara, así que las esquinas y los ejes de
     * los tabiques se cazan sobre la geometría real del modelo, no sobre una
     * aproximación en planta.
     * ================================================================ */

    beginDraw(baseZ, onChange) {
      const e = this.engine;
      if (!e) return false;
      this.draw = {
        active: true,
        pts: [],
        hover: null,
        snapped: false,
        snapKind: null,
        baseZ: Number.isFinite(baseZ) ? baseZ : 0,
        onChange: onChange || function () {}
      };
      this.draw.wallSnap = this.buildWallSnapGeometry(this.draw.baseZ);
      this.ensureOverlay();
      e.world.renderer.three.domElement.style.cursor = 'crosshair';
      this.draw.onChange('start', this.draw);
      return true;
    }

    endDraw(commit) {
      const d = this.draw;
      if (!d || !d.active) return null;
      const pts = d.pts.slice();
      d.active = false;
      if (this.engine) this.engine.world.renderer.three.domElement.style.cursor = '';
      this.clearOverlay();
      if (d.onChange) d.onChange(commit ? 'finish' : 'cancel', { pts });
      this.draw = null;
      return commit ? pts : null;
    }

    undoDrawPoint() {
      if (!this.draw || !this.draw.active) return;
      this.draw.pts.pop();
      this.paintOverlay();
      this.draw.onChange('point', this.draw);
    }

    /** Punto bajo el cursor, enganchado a la geometría del modelo. */
    /**
     * Plan references built from the real wall footprint. Using the polygon
     * before the analytical axis is essential: an IFC axis may sit on either
     * face and does not reliably identify the interior finish line.
     */
    buildWallSnapGeometry(baseZ) {
      const out = { points: [], segments: [] };
      const P = this.project;
      if (!P) return out;
      const point = (p, rank, kind) => out.points.push({ p: [p[0], p[1]], rank, kind });
      const segment = (a, b, rank, kind) => {
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-7) {
          out.segments.push({ a: [a[0], a[1]], b: [b[0], b[1]], rank, kind });
        }
      };
      for (const el of P.elements) {
        if (!el.keep || el.container || (el.family !== 'wall' && el.family !== 'curtain')) continue;
        if (Number.isFinite(el.base) && Number.isFinite(el.top) &&
            (baseZ < el.base - 0.35 || baseZ > el.top + 0.35)) continue;
        const poly = el.poly && el.poly.length >= 3 ? HEM.geom.dedupeRing(el.poly) : null;
        if (poly && poly.length >= 3) {
          for (const p of poly) point(p, 0, 'Esquina de muro');
          for (let i = 0; i < poly.length; i++) segment(poly[i], poly[(i + 1) % poly.length], 1, 'Cara de muro');
        }
        if (el.axis && el.axis.length >= 2) {
          for (const p of el.axis) point(p, poly ? 3 : 2, 'Eje de muro');
          for (let i = 0; i < el.axis.length - 1; i++) {
            const a = el.axis[i], b = el.axis[i + 1];
            segment(a, b, 3, 'Eje de muro');
            if (poly) continue;
            const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
            if (len < 1e-7) continue;
            const nx = -dy / len, ny = dx / len, half = Math.max(0.02, el.thickness || 0.1) / 2;
            const a1 = [a[0] + nx * half, a[1] + ny * half], b1 = [b[0] + nx * half, b[1] + ny * half];
            const a2 = [a[0] - nx * half, a[1] - ny * half], b2 = [b[0] - nx * half, b[1] - ny * half];
            point(a1, 0, 'Esquina de muro'); point(b1, 0, 'Esquina de muro');
            point(a2, 0, 'Esquina de muro'); point(b2, 0, 'Esquina de muro');
            segment(a1, b1, 1, 'Cara de muro'); segment(a2, b2, 1, 'Cara de muro');
          }
        }
      }
      return out;
    }

    /** Nearest real wall face or corner, measured in screen pixels. */
    wallSnapAt(ev) {
      const d = this.draw;
      if (!d || !d.wallSnap || !this.engine) return null;
      const dom = this.engine.world.renderer.three.domElement;
      const rect = dom.getBoundingClientRect();
      const mouse = [ev.clientX - rect.left, ev.clientY - rect.top];
      const tolerance = 16;
      let best = null;
      const accept = (p, screen, rank, kind) => {
        const distance = Math.hypot(screen[0] - mouse[0], screen[1] - mouse[1]);
        if (distance > tolerance) return;
        if (!best || rank < best.rank || (rank === best.rank && distance < best.distance)) {
          best = { p: [p[0], p[1]], distance, rank, kind, snapped: true };
        }
      };
      if (d.pts.length >= 3) {
        const first = d.pts[0], screen = this.toScreen(first);
        if (screen) accept(first, screen, -1, 'Cerrar recinto');
      }
      for (const item of d.wallSnap.points) {
        const screen = this.toScreen(item.p);
        if (screen) accept(item.p, screen, item.rank, item.kind);
      }
      for (const item of d.wallSnap.segments) {
        const sa = this.toScreen(item.a), sb = this.toScreen(item.b);
        if (!sa || !sb) continue;
        const dx = sb[0] - sa[0], dy = sb[1] - sa[1], l2 = dx * dx + dy * dy;
        if (l2 < 1e-7) continue;
        let t = ((mouse[0] - sa[0]) * dx + (mouse[1] - sa[1]) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const screen = [sa[0] + dx * t, sa[1] + dy * t];
        const p = [item.a[0] + (item.b[0] - item.a[0]) * t, item.a[1] + (item.b[1] - item.a[1]) * t];
        accept(p, screen, item.rank, item.kind);
      }
      return best;
    }

    /** Cursor ray intersected with the active storey plane, even over a void. */
    planePointAt(ev) {
      const e = this.engine, d = this.draw;
      if (!e || !d) return null;
      const dom = e.world.renderer.three.domElement, rect = dom.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      const camera = e.world.camera.three;
      const near = this.vector3(x, y, -1), far = this.vector3(x, y, 1);
      if (!near.unproject || !far.unproject) return null;
      near.unproject(camera); far.unproject(camera);
      const den = far.y - near.y;
      if (Math.abs(den) < 1e-9) return null;
      const planeY = d.baseZ + ((this.offset || [0, 0, 0])[1] || 0);
      const t = (planeY - near.y) / den;
      if (!Number.isFinite(t)) return null;
      const raw = near.clone().add(far.clone().sub(near).multiplyScalar(t));
      return { p: this.toProject(raw), snapped: false, kind: null, raw };
    }

    async snapAt(ev) {
      const e = this.engine;
      if (!e || !this.model) return null;
      // Real footprint faces win over the 3D raycast, including occluded
      // interior edges in a plan view.
      const wallSnap = this.wallSnapAt(ev);
      if (wallSnap) return wallSnap;
      // Los valores del enumerado están fijados por la propia biblioteca.
      const FR = { POINT: 0, LINE: 1, FACE: 2 };
      let hit = null;
      try {
        hit = e.raycaster
          ? await e.raycaster.castRay({ snappingClasses: [FR.POINT, FR.LINE] })
          : await e.fragments.raycast({
            camera: e.world.camera.three,
            mouse: e.mouse.position,
            dom: e.world.renderer.three.domElement,
            snappingClasses: [FR.POINT, FR.LINE]
          });
      } catch (err) { /* sin captura */ }
      let snapped = !!(hit && hit.point);
      if (!hit) {
        try {
          hit = e.raycaster
            ? await e.raycaster.castRay()
            : await e.fragments.raycast({
              camera: e.world.camera.three,
              mouse: e.mouse.position,
              dom: e.world.renderer.three.domElement
            });
        } catch (err) { /* nada bajo el cursor */ }
        snapped = false;
      }
      if (!hit || !hit.point) return this.planePointAt(ev);
      // Se trabaja en planta: la cota la fija el suelo del recinto.
      return { p: this.toProject(hit.point), snapped, kind: snapped ? 'Geometria 3D' : null, raw: hit.point };
    }

    /* ---------------- superposición de dibujo ---------------- */

    ensureOverlay() {
      if (this.overlay || !this.engine) return;
      const cv = document.createElement('canvas');
      cv.className = 'viewer-draw-layer';
      cv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4';
      this.container.appendChild(cv);
      this.overlay = cv;
      const repaint = () => this.paintOverlay();
      this._repaint = repaint;
      try { this.engine.world.camera.controls.addEventListener('update', repaint); } catch (err) { /* */ }
      window.addEventListener('resize', repaint);
      this.paintOverlay();
    }

    clearOverlay() {
      if (!this.overlay) return;
      try { this.engine.world.camera.controls.removeEventListener('update', this._repaint); } catch (err) { /* */ }
      window.removeEventListener('resize', this._repaint);
      this.overlay.remove();
      this.overlay = null;
    }

    /** Proyecta un punto de proyecto a píxeles del lienzo. */
    toScreen(p, z) {
      const e = this.engine;
      const cam = e.world.camera.three;
      const o = this.offset || [0, 0, 0];
      const zz = (z === undefined ? this.draw.baseZ : z) + o[1];
      const v = this.vector3(p[0] + o[0], zz, -p[1] + o[2]);
      if (!v.project) return null;
      v.project(cam);
      const rect = e.world.renderer.three.domElement.getBoundingClientRect();
      return [(v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height, rect];
    }

    paintOverlay() {
      const d = this.draw;
      if (!this.overlay || !d) return;
      const e = this.engine;
      const dom = e.world.renderer.three.domElement;
      const rect = dom.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.overlay.width = Math.max(1, Math.round(rect.width * dpr));
      this.overlay.height = Math.max(1, Math.round(rect.height * dpr));
      this.overlay.style.width = rect.width + 'px';
      this.overlay.style.height = rect.height + 'px';
      const ctx = this.overlay.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!d.active) return;

      const proj = d.pts.map(p => this.toScreen(p)).filter(Boolean);
      const hov = d.hover ? this.toScreen(d.hover) : null;

      if (proj.length) {
        ctx.beginPath();
        proj.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        if (hov) ctx.lineTo(hov[0], hov[1]);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (proj.length >= 3) {
          ctx.beginPath();
          proj.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
          ctx.closePath();
          ctx.fillStyle = 'rgba(37,99,235,.18)';
          ctx.fill();
        }
        for (const p of proj) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
          ctx.fillStyle = '#2563eb';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      if (hov) {
        ctx.beginPath();
        if (d.snapped) {
          ctx.rect(hov[0] - 6, hov[1] - 6, 12, 12);
          ctx.strokeStyle = '#118d68';
          ctx.lineWidth = 2.2;
        } else {
          ctx.arc(hov[0], hov[1], 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        if (d.snapped && d.snapKind) {
          ctx.font = '600 11px Inter, Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#118d68';
          ctx.fillText(d.snapKind, hov[0] + 9, hov[1] - 7);
        }
      }
    }

    /* ==================================================================
     * Selección con el ratón
     * ================================================================ */

    bindPicking() {
      const dom = this.engine.world.renderer.three.domElement;
      let down = null;
      dom.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
      dom.addEventListener('pointerup', async (ev) => {
        if (!down) return;
        const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
        down = null;
        if (moved > 4) return;      // era una órbita, no un clic
        if (this.draw && this.draw.active) {
          const snap = await this.snapAt(ev);
          if (!snap) return;
          // Volver al primer punto cierra el recinto.
          const first = this.draw.pts[0];
          if (first && this.draw.pts.length >= 3 &&
              Math.hypot(first[0] - snap.p[0], first[1] - snap.p[1]) < 0.25) {
            this.draw.onChange('close', this.draw);
            return;
          }
          this.draw.pts.push(snap.p);
          this.paintOverlay();
          this.draw.onChange('point', this.draw);
          return;
        }
        await this.pick();
      });
      dom.addEventListener('dblclick', (ev) => {
        if (this.draw && this.draw.active && this.draw.pts.length >= 3) {
          ev.preventDefault();
          this.draw.onChange('close', this.draw);
        }
      });
      let moveBusy = false;
      dom.addEventListener('pointermove', async (ev) => {
        if (!this.draw || !this.draw.active || moveBusy) return;
        moveBusy = true;
        try {
          const snap = await this.snapAt(ev);
          if (snap) { this.draw.hover = snap.p; this.draw.snapped = snap.snapped; this.draw.snapKind = snap.kind || null; }
          this.paintOverlay();
        } finally { moveBusy = false; }
      });
    }

    async pick() {
      const e = this.engine;
      if (!e || !this.model) return;
      let hit = null;
      try {
        hit = e.raycaster
          ? await e.raycaster.castRay()
          : await e.fragments.raycast({
            camera: e.world.camera.three,
            mouse: e.mouse.position,
            dom: e.world.renderer.three.domElement
          });
      } catch (err) { /* sin resultado */ }
      if (!hit) { if (this.h.onPick) this.h.onPick(null); return; }
      const guid = await this.guidOf(hit);
      if (this.h.onPick) this.h.onPick(guid);
    }

    async guidOf(hit) {
      if (!hit) return null;
      const cached = this.guidByLocal.get(hit.localId);
      if (cached) return cached;
      try {
        const model = hit.fragments || this.model;
        const guids = await model.getGuidsByLocalIds([hit.localId]);
        return (guids && guids[0]) || null;
      } catch (err) { return null; }
    }

    /* ==================================================================
     * Cámara y limpieza
     * ================================================================ */

    async setView(name) {
      const e = this.engine;
      if (!e) return;
      const box = this.model && this.model.box ? this.model.box : null;
      if (!box || !box.getCenter) return;
      const c = box.getCenter(this.vector3(0, 0, 0));
      const s = box.getSize(this.vector3(0, 0, 0));
      const d = Math.hypot(s.x, s.y, s.z) || 10;
      const views = {
        iso: [c.x + d * 0.55, c.y + d * 0.45, c.z + d * 0.55],
        planta: [c.x, c.y + d * 1.1, c.z + 0.001],
        alzado: [c.x, c.y, c.z + d * 1.1],
        lateral: [c.x + d * 1.1, c.y, c.z]
      };
      const p = views[name] || views.iso;
      try { await e.world.camera.controls.setLookAt(p[0], p[1], p[2], c.x, c.y, c.z, true); } catch (err) { /* */ }
      this.refresh();
    }

    async setProjection(kind) {
      const e = this.engine;
      if (!e || !e.world.camera.projection) return;
      try { await e.world.camera.projection.set(kind === 'ortho' ? 'Orthographic' : 'Perspective'); } catch (err) { /* */ }
      this.refresh();
    }

    dispose() {
      this._disposed = true;
      const e = this.engine;
      if (this._resizeFrame1) cancelAnimationFrame(this._resizeFrame1);
      if (this._resizeFrame2) cancelAnimationFrame(this._resizeFrame2);
      this._resizeFrame1 = this._resizeFrame2 = null;
      try { this.clearOverlay(); } catch (err) { /* */ }
      this.draw = null;
      if (!e) return;
      try { if (e.ro) e.ro.disconnect(); } catch (err) { /* */ }
      try { if (this.views) this.views.close(); } catch (err) { /* */ }
      try { if (e.clipper) { e.clipper.deleteAll(); e.clipper.enabled = false; } } catch (err) { /* */ }
      try { for (const [id] of [...e.fragments.list]) Promise.resolve(e.fragments.core.disposeModel(id)).catch(() => {}); } catch (err) { /* */ }
      try { e.components.dispose(); } catch (err) { /* */ }
      this.engine = null;
      this.enginePromise = null;
      this.model = null;
      this.project = null;
      this.localByGuid.clear();
      this.guidByLocal.clear();
      this.storeys = [];
      this.categories = [];
      this.planViews = [];
      this.views = null;
    }
  }

  /** Evita que un worker atascado deje la aplicación colgada para siempre. */
  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  function safeName(name) {
    return String(name || 'modelo').replace(/[^\w\-. áéíóúüñÁÉÍÓÚÜÑ]/g, '_').slice(0, 80);
  }

  HEM.Viewer = Viewer;
  HEM.viewerPalette = { PALETTE, SPACE_COLORS, SELECT_COLOR, PROBLEM_COLOR, GHOST };
})(typeof globalThis !== 'undefined' ? globalThis : this);
