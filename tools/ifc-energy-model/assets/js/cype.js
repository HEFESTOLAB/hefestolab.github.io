/*
 * HEFESTOLAB · IFC Energy Model
 * cype.js — Índice del modelo, auditoría y correcciones
 * ---------------------------------------------------------------------------
 * Reglas tomadas de la documentación oficial de CYPE «Requisitos del IFC para
 * el generador del modelo analítico» (Open BIM Analytical Model) y
 * «Recomendaciones para el modelado en Revit y configuración de la
 * exportación a IFC».
 *
 *   Cubiertas y voladizos ....... IfcRoof | IfcSlab  + IsExternal = TRUE
 *   Forjados entre plantas ...... IfcSlab            + IsExternal = FALSE
 *   Soleras ..................... IfcSlab            + USERDEFINED (BASESLAB)
 *   Particiones interiores ...... IfcWall
 *   Muros de sótano ............. IfcWall            + USERDEFINED (BASEMENTWALL)
 *   Fachadas .................... IfcWall            + IsExternal = TRUE
 *   Medianeras .................. IfcWall            + USERDEFINED (PARTYWALL)
 *   Huecos ...................... IfcDoor / IfcWindow + IsExternal
 *   Espacios .................... IfcSpace + Qto_SpaceBaseQuantities
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});
  const S = HEM.step;
  const G = HEM.geom;
  const { T, tokRef, tokNum, tokStr, tokEnum, tokBool, isList } = S;

  /* ======================================================================
   * Clasificación de tipos IFC
   * ==================================================================== */

  const WALL_TYPES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'];
  const SLAB_TYPES = ['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'];
  const ROOF_TYPES = ['IFCROOF'];
  const DOOR_TYPES = ['IFCDOOR', 'IFCDOORSTANDARDCASE'];
  const WINDOW_TYPES = ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'];
  const CURTAIN_TYPES = ['IFCCURTAINWALL', 'IFCPLATE', 'IFCPLATESTANDARDCASE'];
  const STRUCT_TYPES = ['IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCFOOTING', 'IFCPILE',
    'IFCCOLUMNSTANDARDCASE', 'IFCBEAMSTANDARDCASE', 'IFCMEMBERSTANDARDCASE'];
  const SHADE_TYPES = ['IFCSHADINGDEVICE'];
  const FURN_TYPES = ['IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT'];
  const PROXY_TYPES = ['IFCBUILDINGELEMENTPROXY'];
  const FINISH_TYPES = ['IFCCOVERING', 'IFCRAILING', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP',
    'IFCRAMPFLIGHT', 'IFCBUILDINGELEMENTPART', 'IFCDISCRETEACCESSORY', 'IFCFASTENER',
    'IFCMECHANICALFASTENER', 'IFCREINFORCINGBAR', 'IFCREINFORCINGMESH'];
  const MEP_PREFIXES = ['IFCFLOW', 'IFCDISTRIBUTION', 'IFCENERGYCONVERSION', 'IFCELECTRIC',
    'IFCAIRTERMINAL', 'IFCPIPE', 'IFCDUCT', 'IFCCABLE', 'IFCSANITARY', 'IFCVALVE',
    'IFCPUMP', 'IFCFAN', 'IFCBOILER', 'IFCCHILLER', 'IFCLIGHTFIXTURE', 'IFCPROTECTIVE',
    'IFCSWITCHING', 'IFCOUTLET', 'IFCJUNCTION', 'IFCSPACEHEATER', 'IFCTANK', 'IFCUNITARY'];
  const ANNOT_TYPES = ['IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT'];

  // Conjuntos de propiedades que sólo engordan el archivo y no aportan al cálculo.
  const NOISE_PSETS = /^(Pset_QuantityTakeOff|Pset_ReinforcementBarPitchOf|Pset_ManufacturerTypeInformation|Pset_ProfileProperties|Pset_Draughting)/i;

  function familyOf(type) {
    if (WALL_TYPES.includes(type)) return 'wall';
    if (SLAB_TYPES.includes(type)) return 'slab';
    if (ROOF_TYPES.includes(type)) return 'roof';
    if (DOOR_TYPES.includes(type)) return 'door';
    if (WINDOW_TYPES.includes(type)) return 'window';
    if (CURTAIN_TYPES.includes(type)) return 'curtain';
    if (SHADE_TYPES.includes(type)) return 'shading';
    if (STRUCT_TYPES.includes(type)) return 'struct';
    if (FURN_TYPES.includes(type)) return 'furniture';
    if (PROXY_TYPES.includes(type)) return 'proxy';
    if (FINISH_TYPES.includes(type)) return 'finish';
    if (ANNOT_TYPES.includes(type)) return 'annotation';
    if (MEP_PREFIXES.some(p => type.startsWith(p))) return 'mep';
    return 'other';
  }

  /** Familias que el modelo analítico de CYPE lee y que nunca se purgan. */
  const ENVELOPE = new Set(['wall', 'slab', 'roof', 'door', 'window', 'curtain', 'shading']);

  /** Entidades que no son ocurrencias de producto (tipos, grupos, estilos…). */
  function isProductType(name) {
    if (/(TYPE|STYLE|PROPERTIES)$/.test(name)) return false;
    if (/^IFC(GROUP|SYSTEM|ZONE|RELATIONSHIP|REL[A-Z]|PROPERTY|MATERIAL|PRESENTATION|STYLED|SHAPE|GEOMETRIC|REPRESENTATION|OWNER|PERSON|ORGANIZATION|APPLICATION|UNIT|SIUNIT|CONVERSION|DIMENSIONAL|MEASURE|CLASSIFICATION|LOCALPLACEMENT|AXIS|CARTESIAN|DIRECTION|VECTOR|LINE|CIRCLE|POLYLINE|POLYLOOP|FACE|CLOSEDSHELL|EXTRUDED|BOOLEAN|PROFILE|ARBITRARY|RECTANGLE|MAPPED|PRODUCTDEFINITION|COLOUR|SURFACE|PLANE|TRIMMED|COMPOSITE|ELEMENTQUANTITY|QUANTITY|PHYSICAL|SIMPLEPROPERTY|COMPLEXPROPERTY)/.test(name)) return false;
    return true;
  }

  /** Desenvuelve valores tipados: IFCIDENTIFIER('x'), IFCBOOLEAN(.T.), IFCLABEL('x')… */
  function unwrap(tok) {
    let t = tok;
    let guard = 0;
    while (t && t.t === 'list' && t.v && t.v.length === 1 && guard++ < 4) t = t.v[0];
    return t;
  }
  function valStr(tok) { const t = unwrap(tok); return t && t.t === 'str' ? S.decodeIfcString(t.v) : null; }
  function valBool(tok) { const t = unwrap(tok); return t && t.t === 'enum' ? (t.v === 'T' ? true : t.v === 'F' ? false : null) : null; }
  function valNum(tok) { const t = unwrap(tok); return t && t.t === 'num' ? t.v : null; }

  /* ======================================================================
   * Índice del modelo
   * ==================================================================== */

  class Project {
    constructor(model, onProgress) {
      this.m = model;
      this.geo = new G.Geo(model);
      this.progress = onProgress || function () {};
      this.warnings = [];
      this.build();
    }

    build() {
      const m = this.m;
      this.progress('Indexando relaciones', 0.05);

      // --- relaciones ---
      this.psetsOf = new Map();      // elemId -> [{relId, psetId, name, sole}]
      this.typeOfElem = new Map();   // elemId -> typeId
      this.elemsOfType = new Map();  // typeId -> [elemId]
      this.storeyOfElem = new Map(); // elemId -> storeyId
      this.openingHost = new Map();  // openingId -> hostId
      this.openingFill = new Map();  // openingId -> fillerId
      this.materialOf = new Map();   // elemId/typeId -> materialId
      this.aggregates = new Map();   // parentId -> [childId]

      for (const id of m.idsOfType('IFCRELDEFINESBYPROPERTIES')) {
        const a = m.args(id);
        const objs = isList(a[4]) ? a[4].v.map(tokRef) : [];
        const defId = tokRef(a[5]);
        const dt = m.typeOf(defId);
        const da = m.args(defId);
        const name = da ? tokStr(da[2]) : null;
        for (const o of objs) {
          let arr = this.psetsOf.get(o);
          if (!arr) { arr = []; this.psetsOf.set(o, arr); }
          arr.push({ relId: id, psetId: defId, name, kind: dt, sole: objs.length === 1 });
        }
      }
      for (const id of m.idsOfType('IFCRELDEFINESBYTYPE')) {
        const a = m.args(id);
        const tid = tokRef(a[5]);
        const objs = isList(a[4]) ? a[4].v.map(tokRef) : [];
        for (const o of objs) this.typeOfElem.set(o, tid);
        this.elemsOfType.set(tid, (this.elemsOfType.get(tid) || []).concat(objs));
      }
      for (const id of m.idsOfType('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
        const a = m.args(id);
        const st = tokRef(a[5]);
        if (isList(a[4])) for (const t of a[4].v) this.storeyOfElem.set(tokRef(t), st);
      }
      for (const id of m.idsOfType('IFCRELVOIDSELEMENT')) {
        const a = m.args(id);
        this.openingHost.set(tokRef(a[5]), tokRef(a[4]));
      }
      for (const id of m.idsOfType('IFCRELFILLSELEMENT')) {
        const a = m.args(id);
        this.openingFill.set(tokRef(a[4]), tokRef(a[5]));
      }
      for (const id of m.idsOfType('IFCRELASSOCIATESMATERIAL')) {
        const a = m.args(id);
        const mat = tokRef(a[5]);
        if (isList(a[4])) for (const t of a[4].v) this.materialOf.set(tokRef(t), mat);
      }
      for (const id of m.idsOfType('IFCRELAGGREGATES')) {
        const a = m.args(id);
        const parent = tokRef(a[4]);
        const kids = isList(a[5]) ? a[5].v.map(tokRef) : [];
        this.aggregates.set(parent, (this.aggregates.get(parent) || []).concat(kids));
      }

      // --- estructura espacial ---
      this.projectId = m.idsOfType('IFCPROJECT')[0] || 0;
      this.siteId = m.idsOfType('IFCSITE')[0] || 0;
      this.buildingId = m.idsOfType('IFCBUILDING')[0] || 0;
      this.storeys = m.idsOfType('IFCBUILDINGSTOREY').map(id => {
        const a = m.args(id);
        const mat = this.geo.placement(tokRef(a[5]));
        const elev = tokNum(a[9]);
        return {
          id, name: tokStr(a[2]) || tokStr(a[7]) || ('Planta ' + id),
          elevation: elev != null ? elev : mat[11],
          z: mat[11],
          zPlacement: mat[11]
        };
      });
      // Hay exportadores que dejan todos los emplazamientos en el origen y
      // guardan la cota sólo en el atributo Elevation. Si las cotas de
      // emplazamiento no distinguen las plantas pero las elevaciones sí, se
      // usan éstas: de otro modo todos los niveles caerían en la misma cota.
      const zsDistintas = new Set(this.storeys.map(s => Math.round(s.zPlacement * 1000))).size;
      const elevDistintas = new Set(this.storeys.map(s => Math.round((s.elevation || 0) * 1000))).size;
      if (this.storeys.length > 1 && zsDistintas === 1 && elevDistintas > 1) {
        for (const s of this.storeys) s.z = s.elevation;
        this.storeyZFromElevation = true;
      }
      this.storeys.sort((x, y) => x.z - y.z);

      this.progress('Leyendo espacios', 0.2);
      this.buildSpaces();
      this.progress('Leyendo cerramientos', 0.45);
      this.buildElements();
      this.progress('Analizando adyacencias', 0.7);
      this.detectAdjacency();
      this.progress('Agrupando elementos', 0.9);
      this.groupChoice = new Map();
      this.buildGroups();
      this.progress('Listo', 1);
    }

    /**
     * Vuelve a deducir funciones y adyacencias. Se llama cuando el usuario
     * cambia qué espacios entran en el cálculo, porque de ellos depende qué
     * muros quedan en contacto con el exterior.
     */
    recompute() {
      const transient = ['capa-interior', 'fuera-de-envolvente', 'sin-espacio-adyacente', 'sin-eje', 'sin-cota'];
      for (const el of this.elements) {
        el.detected = null; el.role = null; el.roleAuto = null;
        el.decided = el.userExternal != null ? el.userExternal : null;
        el.stackedUnder = null;
        el.flags = el.flags.filter(f => !transient.includes(f));
        el.keep = el.keepOverride != null ? el.keepOverride : ENVELOPE.has(el.family);
        el.keepAuto = ENVELOPE.has(el.family);
      }
      this.detectAdjacency();
      for (const el of this.elements) {
        if (el.userRole) el.role = el.userRole;
        if (el.userExternal != null) el.decided = el.userExternal;
        if (el.keepOverride != null) el.keep = el.keepOverride;
      }
      this.buildGroups();
    }

    /* ---------------- espacios ---------------- */

    buildSpaces() {
      const m = this.m;
      this.spaces = [];
      for (const id of m.idsOfType('IFCSPACE')) {
        const a = m.args(id);
        const ref = this.psetProp(id, 'Pset_SpaceCommon', 'Reference') || this.psetProp(id, null, 'Reference');
        const sp = {
          id,
          guid: tokStr(a[0]) || '',
          name: tokStr(a[2]) || '',
          longName: tokStr(a[7]) || '',
          objectType: tokStr(a[4]) || '',
          reference: (ref && valStr(ref.value)) || this.typeNameOf(id) || '',
          interior: tokEnum(a[9]) !== 'EXTERNAL',
          storeyId: this.parentOf(id),
          solid: null, poly: null, inners: [], areaNet: 0, perimeter: 0,
          height: 0, base: 0, top: 0, volume: 0,
          include: true, use: 'acondicionado', reason: '', flags: []
        };
        let ex = this.geo.productExtrusions(id);
        if (!ex.length) {
          // Recinto escrito como sólido facetado (techo inclinado): la huella
          // es la cara del suelo y las cotas salen de la propia malla.
          const fp = this.geo.brepFootprint(id);
          if (fp) {
            sp.brep = true;
            sp.poly = fp.poly;
            sp.inners = [];
            sp.areaNet = G.area(fp.poly);
            sp.perimeter = G.perimeter(fp.poly);
            sp.base = fp.base; sp.top = fp.top;
            sp.height = fp.top - fp.base;
            sp.sloped = true;
          }
        }
        if (ex.length) {
          const e = ex[0];
          sp.solid = e;
          sp.poly = e.outer;
          sp.inners = e.inners || [];
          sp.areaNet = G.area(e.outer) - sp.inners.reduce((s, r) => s + G.area(r), 0);
          sp.perimeter = G.perimeter(e.outer);
          sp.height = e.height;
          sp.base = e.base;
          sp.top = e.top;
          sp.volume = sp.areaNet * sp.height;
          sp.solidCount = ex.length;
        } else {
          const faces = this.geo.productFaces(id, 20000);
          const fp = faces.length ? this.geo.meshFootprint(faces) : null;
          if (fp) {
            sp.poly = fp.poly; sp.inners = [];
            sp.areaNet = G.area(fp.poly);
            sp.perimeter = G.perimeter(fp.poly);
            sp.base = fp.base; sp.top = fp.top;
            sp.height = fp.top - fp.base;
            sp.volume = sp.areaNet * sp.height;
            sp.tessellated = true;
          } else {
            sp.flags.push('sin-geometria');
          }
        }
        sp.label = sp.longName || sp.name || ('Espacio ' + id);
        this.spaces.push(sp);
      }

      // Detección de espacios "basura": áreas de Revit exportadas como IfcSpace,
      // solapadas con las estancias reales.
      const withGeom = this.spaces.filter(s => s.poly);
      for (const sp of withGeom) {
        const name = (sp.longName || sp.name || '').toLowerCase();
        if (/^(área|area|habitación$|room$|espacio$)$/.test(name.trim())) {
          sp.flags.push('nombre-generico');
        }
        let covers = 0;
        for (const other of withGeom) {
          if (other === sp || !other.poly) continue;
          const c = G.centroid(other.poly);
          if (G.pointInRing(c, sp.poly) && sp.areaNet > other.areaNet * 1.4) covers++;
        }
        sp.covers = covers;
        if (covers >= 2) sp.flags.push('solapado');
      }
      for (const sp of this.spaces) {
        const name = (sp.longName || sp.name || '').toLowerCase();
        if (sp.flags.includes('solapado') && sp.flags.includes('nombre-generico')) {
          sp.include = false; sp.use = 'descartado';
          sp.reason = 'Área de Revit solapada sobre las estancias reales';
        } else if (/garaje|garage|aparcamiento|trastero|s[oó]tano no habitable/.test(name)) {
          sp.use = 'no_habitable';
          sp.reason = 'Recinto no habitable según CTE DB HE';
        } else if (/porche|terraza|balc[oó]n|patio|exterior|soportal|p[eé]rgola/.test(name)) {
          sp.include = false; sp.use = 'exterior';
          sp.reason = 'Recinto exterior: no forma parte del volumen acondicionado';
        } else if (/pasillo|circulaci[oó]n|distribuidor|recibidor|vest[ií]bulo|escalera|ropero|vestidor|armario|despensa/.test(name)) {
          sp.use = 'no_acondicionado';
          sp.reason = 'Espacio de circulación o servicio';
        }
      }

      this.activeSpaces = () => this.spaces.filter(s => s.include && s.poly);
    }

    /* ---------------- cerramientos ---------------- */

    buildElements() {
      const m = this.m;
      this.elements = [];
      this.byId = new Map();

      const productTypes = new Set();
      for (const name of m.typeNames) {
        if (!isProductType(name)) continue;
        const f = familyOf(name);
        if (f !== 'other' || /^IFC(BUILDINGELEMENT|ELEMENT|PRODUCT|DISTRIBUTION|FLOW|TRANSPORT|CIVIL|GEOGRAPHIC)/.test(name)) productTypes.add(name);
      }
      // También cualquier entidad colgada de una planta mediante IfcRelContainedInSpatialStructure
      for (const [elemId] of this.storeyOfElem) {
        const t = m.typeOf(elemId);
        if (t && isProductType(t)) productTypes.add(t);
      }
      for (const skip of ['IFCSPACE', 'IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE', 'IFCPROJECT', 'IFCOPENINGELEMENT', 'IFCANNOTATION']) productTypes.delete(skip);

      for (const type of productTypes) {
        const fam = familyOf(type);
        for (const id of m.idsOfType(type)) {
          const a = m.args(id);
          if (!a || a.length < 6) continue;
          const el = {
            id, type, family: fam,
            guid: tokStr(a[0]) || '',
            name: tokStr(a[2]) || '',
            objectType: tokStr(a[4]) || '',
            typeId: this.typeOfElem.get(id) || 0,
            typeName: this.typeNameOf(id) || '',
            storeyId: this.storeyOfElem.get(id) || this.parentOf(id),
            declared: this.declaredIsExternal(id),
            detected: null, decided: null, role: null, roleAuto: null,
            keep: ENVELOPE.has(fam), keepAuto: ENVELOPE.has(fam),
            axis: null, poly: null, base: null, top: null, thickness: null,
            layers: this.materialLayers(id), flags: []
          };
          el.family5 = fam;
          this.elements.push(el);
          this.byId.set(id, el);
        }
      }

      // Geometría sólo para lo que forma la envolvente.
      for (const el of this.elements) {
        if (!ENVELOPE.has(el.family)) continue;
        try {
          if (el.family === 'wall') {
            el.axis = this.geo.wallAxis(el.id);
            const ex = this.geo.productExtrusions(el.id, 'Body');
            if (ex.length) {
              el.base = Math.min(...ex.map(e => e.base));
              el.top = Math.max(...ex.map(e => e.top));
              el.poly = ex[0].outer;
            } else {
              // Vista de referencia IFC4: la geometría llega teselada.
              const fp = this.meshOf(el);
              if (fp) {
                el.poly = fp.poly; el.base = fp.base; el.top = fp.top; el.tessellated = true;
                if (!el.axis) { el.axis = midlineOf(fp.poly); el.thickness = thicknessOf(fp.poly); }
              }
            }
            el.thickness = el.thickness || el.layers.total || this.guessThickness(el) || 0.2;
          } else {
            const ex = this.geo.productExtrusions(el.id);
            if (ex.length) {
              el.poly = ex[0].outer;
              el.base = Math.min(...ex.map(e => e.base));
              el.top = Math.max(...ex.map(e => e.top));
              el.areaProj = G.area(ex[0].outer);
            } else {
              const fp = this.meshOf(el);
              if (fp) {
                el.poly = fp.poly; el.base = fp.base; el.top = fp.top;
                el.areaProj = G.area(fp.poly); el.tessellated = true;
              } else {
                const b = this.geo.productBBox(el.id, 4000);
                if (b) { el.base = b.minZ; el.top = b.maxZ; el.bbox = b; }
              }
            }
            el.thickness = el.layers.total || (el.top != null ? el.top - el.base : null);
          }
        } catch (err) { el.flags.push('geometria-no-resuelta'); }
        // IfcRoof suele ser un contenedor que agrupa faldones: la geometría
        // está en sus hijos, no en él.
        // Un IfcRoof no suele tener geometría propia: agrupa faldones. Se
        // conserva para no romper la estructura espacial, pero no se audita
        // como superficie.
        const kids = this.aggregates.get(el.id);
        if (kids && kids.length) el.container = true;
        if (!el.container && !el.poly && !el.axis && el.base == null) el.flags.push('sin-geometria');
      }
    }

    /** Malla teselada del elemento, con caché para no rehacerla. */
    meshOf(el) {
      if (el._mesh !== undefined) return el._mesh;
      let fp = null;
      try {
        const faces = this.geo.productFaces(el.id, 60000);
        if (faces.length) { fp = this.geo.meshFootprint(faces); if (fp) fp.faces = faces; }
      } catch (err) { fp = null; }
      el._mesh = fp;
      return fp;
    }

    guessThickness(el) {
      const name = (el.typeName || el.name || '');
      const mm = /(\d{2,3})\s*mm/i.exec(name);
      if (mm) return +mm[1] / 1000;
      const cm = /(\d{1,2})\s*cm/i.exec(name);
      if (cm) return +cm[1] / 100;
      return null;
    }

    /* ---------------- adyacencia y detección de exterior ---------------- */

    detectAdjacency() {
      const spaces = this.activeSpaces();
      const polys = spaces.map(s => ({ outer: s.poly, inners: s.inners, sp: s }));
      const inAnySpace = (p) => {
        for (const poly of polys) if (G.pointInPolygon(p, poly)) return poly.sp;
        return null;
      };
      this._inAnySpace = inAnySpace;

      const zTop = spaces.length ? Math.max(...spaces.map(s => s.top)) : 0;
      const zBase = spaces.length ? Math.min(...spaces.map(s => s.base)) : 0;
      this.zBase = zBase; this.zTop = zTop;

      for (const el of this.elements) {
        if (el.family === 'wall') this.detectWall(el, inAnySpace);
        else if (el.family === 'slab' || el.family === 'roof') this.detectSlab(el, inAnySpace, zBase, zTop);
        else if (el.family === 'curtain') { el.detected = true; el.roleAuto = 'muro_cortina'; }
      }
      // Huecos: heredan del muro anfitrión.
      for (const el of this.elements) {
        if (el.family !== 'door' && el.family !== 'window') continue;
        const host = this.hostOf(el.id);
        const hostEl = host ? this.byId.get(host) : null;
        if (hostEl && hostEl.detected != null) {
          el.detected = hostEl.detected;
          el.hostId = host;
          el.roleAuto = hostEl.detected ? 'hueco_exterior' : 'hueco_interior';
        } else if (el.poly || el.bbox) {
          const c = el.poly ? G.centroid(el.poly) : [(el.bbox.minX + el.bbox.maxX) / 2, (el.bbox.minY + el.bbox.maxY) / 2];
          el.detected = !inAnySpace(c);
          el.roleAuto = el.detected ? 'hueco_exterior' : 'hueco_interior';
          el.flags.push('sin-muro-anfitrion');
        } else {
          el.flags.push('sin-muro-anfitrion');
        }
        el.decided = el.detected;
      }
      this.dedupeStackedSlabs();
      for (const el of this.elements) {
        if (el.decided == null) el.decided = el.detected;
        if (el.role == null) el.role = el.roleAuto;
      }
    }

    /**
     * Un suelo de proyecto suele ser una pila de capas (pavimento, aislamiento,
     * losa). Para el modelo analítico sólo debe existir UNA superficie por
     * cerramiento: la que es coplanaria con la cara del espacio. Las capas
     * inferiores se descartan porque generarían superficies duplicadas.
     */
    dedupeStackedSlabs() {
      const pick = (role, best) => {
        const list = this.elements.filter(e => e.role === role && e.poly && e.base != null);
        for (const a of list) {
          if (!a.keep) continue;
          const ca = G.centroid(a.poly);
          for (const b of list) {
            if (a === b || !b.keep) continue;
            if (!G.pointInRing(ca, b.poly)) continue;
            const better = best(a, b);
            if (better === b) {
              a.keep = false; a.keepAuto = false;
              a.flags.push('capa-interior');
              a.stackedUnder = b.id;
              break;
            }
          }
        }
      };
      // Solera: se conserva la capa superior (la que toca el suelo del espacio).
      pick('solera', (a, b) => (b.top > a.top + 1e-4 ? b : a));
      // Cubierta: se conserva la capa inferior (la que cierra el espacio).
      pick('cubierta', (a, b) => (b.base < a.base - 1e-4 ? b : a));
      pick('forjado', (a, b) => (b.top > a.top + 1e-4 ? b : a));
    }

    detectWall(el, inAnySpace) {
      const axis = el.axis;
      const th = Math.max(0.06, el.thickness || 0.2);
      const probe = th / 2 + 0.12;
      let outsideHits = 0, insideHits = 0, samples = 0;
      const seg = [];
      if (axis && axis.length >= 2) {
        for (let i = 0; i < axis.length - 1; i++) seg.push([axis[i], axis[i + 1]]);
      } else if (el.poly && el.poly.length >= 4) {
        // Sin eje: se usa el lado más largo de la huella como dirección.
        let best = null, bestLen = 0;
        for (let i = 0; i < el.poly.length; i++) {
          const a = el.poly[i], b = el.poly[(i + 1) % el.poly.length];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l > bestLen) { bestLen = l; best = [a, b]; }
        }
        if (best) seg.push(best);
      }
      if (!seg.length) { el.flags.push('sin-eje'); return; }

      for (const [a, b] of seg) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const steps = Math.max(3, Math.min(9, Math.round(len / 0.8)));
        for (let k = 1; k <= steps; k++) {
          const t = k / (steps + 1);
          const px = a[0] + dx * t, py = a[1] + dy * t;
          const s1 = inAnySpace([px + nx * probe, py + ny * probe]);
          const s2 = inAnySpace([px - nx * probe, py - ny * probe]);
          samples++;
          if (s1 && s2) insideHits++;
          else if (s1 || s2) outsideHits++;
        }
      }
      el.samples = samples;
      el.probeInside = insideHits;
      el.probeOutside = outsideHits;
      if (!samples) return;
      if (insideHits === 0 && outsideHits === 0) {
        el.detected = true;
        el.roleAuto = 'fachada';
        el.flags.push('sin-espacio-adyacente');
      } else if (outsideHits > insideHits) {
        el.detected = true;
        el.roleAuto = 'fachada';
      } else {
        el.detected = false;
        el.roleAuto = 'particion';
      }
      // Muro enterrado: cara superior por debajo del suelo de los espacios.
      if (el.top != null && this.zBase != null && el.top < this.zBase - 0.05) {
        el.roleAuto = 'muro_sotano';
        el.detected = true;
      }
      const n = (el.typeName || el.name || '').toLowerCase();
      if (/medianer/.test(n)) { el.roleAuto = 'medianera'; el.detected = false; }
      if (/s[oó]tano|contenci[oó]n|muro pantalla/.test(n)) { el.roleAuto = 'muro_sotano'; el.detected = true; }
      el.decided = el.detected;
      el.role = el.roleAuto;
    }

    detectSlab(el, inAnySpace, zBase, zTop) {
      const declaredRoof = /cubierta|roof|tejado/i.test(el.typeName || el.name || '') ||
        this.typePredefined(el.id) === 'ROOF' || el.family === 'roof';
      const c = el.poly ? G.centroid(el.poly) : (el.bbox ? [(el.bbox.minX + el.bbox.maxX) / 2, (el.bbox.minY + el.bbox.maxY) / 2] : null);
      const overSpace = c ? !!inAnySpace(c) : false;
      el.overSpace = overSpace;

      if (el.base == null) { el.flags.push('sin-cota'); return; }

      if (declaredRoof || (zTop && el.base >= zTop - 0.35)) {
        el.roleAuto = 'cubierta';
        el.detected = true;
      } else if (el.top <= zBase + 0.06) {
        // Por debajo del plano de piso de los espacios: en contacto con el terreno.
        el.roleAuto = overSpace ? 'solera' : 'pavimento_exterior';
        el.detected = false;
        if (!overSpace) { el.keepAuto = false; el.keep = false; el.flags.push('fuera-de-envolvente'); }
      } else {
        el.roleAuto = overSpace ? 'forjado' : 'losa_exterior';
        el.detected = !overSpace;
        if (!overSpace) { el.keepAuto = false; el.keep = false; el.flags.push('fuera-de-envolvente'); }
      }
      el.decided = el.detected;
      el.role = el.roleAuto;
    }

    hostOf(fillerId) {
      if (!this._hostIndex) {
        this._hostIndex = new Map();
        for (const [openId, fill] of this.openingFill) {
          const host = this.openingHost.get(openId);
          if (host) this._hostIndex.set(fill, host);
        }
      }
      return this._hostIndex.get(fillerId) || null;
    }

    /* ---------------- agrupación para la purga ---------------- */

    buildGroups() {
      const map = new Map();
      for (const el of this.elements) {
        const key = el.family + '|' + (el.typeName || el.objectType || el.type);
        let g = map.get(key);
        if (!g) {
          g = {
            key, family: el.family, type: el.type,
            label: el.typeName || el.objectType || el.type,
            count: 0, ids: [], keep: ENVELOPE.has(el.family), bytes: 0, envelope: ENVELOPE.has(el.family)
          };
          map.set(key, g);
        }
        g.count++; g.ids.push(el.id);
      }
      const groups = [...map.values()];
      // Heurística: grupos numerosos de piezas menudas (tejas, rastreles, tornillería)
      // no aportan nada al cálculo energético y multiplican el tamaño del archivo.
      for (const g of groups) {
        if (g.envelope) { g.keep = true; g.reason = 'Forma parte de la envolvente'; continue; }
        if (g.family === 'furniture' || g.family === 'mep' || g.family === 'annotation' || g.family === 'finish') {
          g.keep = false; g.reason = 'No interviene en el modelo analítico'; continue;
        }
        if (/topogr|terreno|site|solid/i.test(g.label)) { g.keep = false; g.reason = 'Topografía'; continue; }
        if (g.count >= 25 && /teja|tile|rastrel|listón|liston|tornillo|clavo|placa|panel|chapa|ripia/i.test(g.label)) {
          g.keep = false; g.reason = 'Serie repetitiva de piezas menudas'; continue;
        }
        if (g.count >= 100) { g.keep = false; g.reason = 'Serie de ' + g.count + ' piezas repetidas'; continue; }
        g.keep = false;
        g.reason = 'Fuera de la envolvente térmica';
      }
      // Las decisiones del usuario mandan sobre la heurística.
      for (const g of groups) {
        if (this.groupChoice && this.groupChoice.has(g.key)) {
          g.keep = this.groupChoice.get(g.key);
          g.reason = g.keep ? 'Conservado por decisión del usuario' : 'Descartado por decisión del usuario';
        }
        for (const id of g.ids) {
          const el = this.byId.get(id);
          if (el && el.keepOverride == null && !ENVELOPE.has(el.family)) el.keep = g.keep;
        }
      }
      groups.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
      this.groups = groups;
    }

    /* ---------------- utilidades ---------------- */

    parentOf(id) {
      for (const [parent, kids] of this.aggregates) if (kids.includes(id)) return parent;
      return 0;
    }

    typeNameOf(id) {
      const tid = this.typeOfElem.get(id);
      if (!tid) return null;
      const a = this.m.args(tid);
      return a ? tokStr(a[2]) : null;
    }

    typePredefined(id) {
      const tid = this.typeOfElem.get(id);
      if (!tid) return null;
      const a = this.m.args(tid);
      if (!a) return null;
      return tokEnum(a[a.length - 1]);
    }

    /**
     * Busca una propiedad o cantidad asociada al elemento.
     * IfcPropertySet guarda las propiedades en el índice 4 y el valor en el 2;
     * IfcElementQuantity las guarda en el índice 5 y el valor en el 3.
     */
    psetProp(elemId, psetName, propName) {
      const list = this.psetsOf.get(elemId) || [];
      for (const entry of list) {
        if (psetName && entry.name !== psetName) continue;
        const quantity = entry.kind === 'IFCELEMENTQUANTITY';
        const listIdx = quantity ? 5 : 4;
        const valIdx = quantity ? 3 : 2;
        const pa = this.m.args(entry.psetId);
        if (!pa || !isList(pa[listIdx])) continue;
        for (const t of pa[listIdx].v) {
          const pid = tokRef(t);
          const p = this.m.args(pid);
          if (!p) continue;
          if (tokStr(p[0]) === propName) return { propId: pid, value: p[valIdx], entry, quantity };
        }
      }
      return null;
    }

    declaredIsExternal(elemId) {
      let hit = this.psetProp(elemId, null, 'IsExternal');
      if (!hit) {
        const tid = this.typeOfElem.get(elemId);
        if (tid) hit = this.psetProp(tid, null, 'IsExternal');
      }
      if (!hit || !hit.value) return null;
      return valBool(hit.value);
    }

    materialLayers(elemId) {
      const matId = this.materialOf.get(elemId) || this.materialOf.get(this.typeOfElem.get(elemId));
      const out = { total: 0, layers: [], name: null };
      if (!matId) return out;
      const walk = (id, depth) => {
        if (!id || depth > 4) return;
        const ty = this.m.typeOf(id);
        const a = this.m.args(id);
        if (!a) return;
        if (ty === 'IFCMATERIALLAYERSETUSAGE') return walk(tokRef(a[0]), depth + 1);
        if (ty === 'IFCMATERIALLAYERSET') {
          out.name = tokStr(a[1]) || out.name;
          if (isList(a[0])) for (const t of a[0].v) walk(tokRef(t), depth + 1);
          return;
        }
        if (ty === 'IFCMATERIALLAYER') {
          const matRef = tokRef(a[0]);
          const ma = matRef ? this.m.args(matRef) : null;
          const thick = tokNum(a[1]) || 0;
          out.layers.push({ material: ma ? tokStr(ma[0]) : '—', thickness: thick });
          out.total += thick;
          return;
        }
        if (ty === 'IFCMATERIAL') { out.name = out.name || tokStr(a[0]); return; }
        if (ty === 'IFCMATERIALLIST' && isList(a[0])) { walk(tokRef(a[0].v[0]), depth + 1); return; }
      };
      walk(matId, 0);
      return out;
    }
  }

  /* ======================================================================
   * Auditoría
   * ==================================================================== */

  const SEVERITY = { error: 3, warn: 2, ok: 1, info: 0 };

  function audit(P) {
    const m = P.m;
    const checks = [];
    const add = (c) => { checks.push(c); return c; };
    const spaces = P.spaces;
    const active = P.activeSpaces();
    const walls = P.elements.filter(e => e.family === 'wall');
    const slabs = P.elements.filter(e => e.family === 'slab' || e.family === 'roof');
    const doors = P.elements.filter(e => e.family === 'door');
    const windows = P.elements.filter(e => e.family === 'window');
    const envelope = P.elements.filter(e => ENVELOPE.has(e.family) && e.keep && !e.container);

    /* 1 · Esquema y origen */
    add({
      id: 'schema', group: 'Archivo', title: 'Esquema IFC',
      level: (m.schema === 'IFC4' || m.schema === 'IFC2X3') ? 'ok' : 'warn',
      value: m.schema,
      detail: m.schema === 'IFC2X3'
        ? 'IFC2X3 es válido para Open BIM Analytical Model. Ten en cuenta que en este esquema no existe IfcShadingDevice: las sombras propias deben resolverse con cubiertas y voladizos como IfcSlab exterior.'
        : 'Esquema admitido por Open BIM Analytical Model.',
      rule: 'Open BIM Analytical Model lee IFC2X3 e IFC4.'
    });

    add({
      id: 'size', group: 'Archivo', title: 'Tamaño y número de entidades',
      level: m.count > 250000 ? 'warn' : 'ok',
      value: fmtBytes(m.text.length) + ' · ' + m.count.toLocaleString('es-ES') + ' entidades',
      detail: m.count > 250000
        ? 'Un archivo de este tamaño hace muy lenta la generación del modelo analítico. La mayor parte suele ser geometría que el cálculo energético no necesita.'
        : 'Tamaño razonable para el generador analítico.',
      rule: 'Cuanto menor sea el IFC, más rápida y estable es la generación del modelo analítico.'
    });

    /* 2 · Espacios */
    const noGeom = spaces.filter(s => !s.poly);
    add({
      id: 'spaces', group: 'Espacios', title: 'Definición de espacios (IfcSpace)',
      level: spaces.length === 0 ? 'error' : (noGeom.length ? 'warn' : 'ok'),
      value: spaces.length + ' espacios · ' + active.length + ' activos',
      count: spaces.length,
      detail: spaces.length === 0
        ? 'Sin IfcSpace no hay modelo analítico posible: el algoritmo de CYPE parte de los espacios para generar superficies, aristas y adyacencias.'
        : (noGeom.length ? noGeom.length + ' espacios no tienen representación geométrica utilizable.' : 'Todos los espacios tienen geometría de contorno.'),
      rule: 'El IFC debe contener la definición geométrica de los espacios según la entidad IfcSpace.'
    });

    const junk = spaces.filter(s => s.flags.includes('solapado'));
    if (junk.length) add({
      id: 'space-overlap', group: 'Espacios', title: 'Espacios solapados',
      level: 'error', value: junk.length + ' solapados',
      count: junk.length,
      items: junk.map(s => s.label + ' · ' + s.areaNet.toFixed(1) + ' m²'),
      targets: junk.map(s => s.guid),
      detail: 'Hay espacios que envuelven a otros. Suelen ser áreas de Revit exportadas como IfcSpace. Generan volúmenes duplicados y adyacencias imposibles.',
      rule: 'Cada recinto debe corresponder a un único IfcSpace sin solapes.',
      fix: 'spaceCleanup'
    });

    const qto = spaces.filter(s => P.psetProp(s.id, 'Qto_SpaceBaseQuantities', 'NetFloorArea'));
    add({
      id: 'space-qto', group: 'Espacios', title: 'Qto_SpaceBaseQuantities',
      level: qto.length === spaces.length && spaces.length ? 'ok' : 'error',
      value: qto.length + ' de ' + spaces.length,
      count: spaces.length - qto.length,
      targets: spaces.filter(s => !P.psetProp(s.id, 'Qto_SpaceBaseQuantities', 'NetFloorArea')).map(s => s.guid),
      detail: qto.length === spaces.length
        ? 'Todos los espacios declaran superficie y volumen.'
        : 'Sin este conjunto de cantidades, CYPE deduce superficie y volumen de la geometría generada, con el riesgo de que no coincidan con los del proyecto.',
      rule: 'El volumen y la superficie de los espacios se obtienen de Qto_SpaceBaseQuantities.',
      fix: 'quantities'
    });

    // Un espacio sobrepasa su planta sólo si rebasa el techo real. Bajo
    // cubierta inclinada lo correcto es precisamente que llegue hasta el
    // faldón, así que se compara contra el plano de techo, no contra el nivel.
    const ceilings = (HEM.rooms && HEM.rooms.ceilingPlanes) ? HEM.rooms.ceilingPlanes(P) : [];
    const badHeight = active.filter(s => {
      if (!s.poly) return false;
      if (ceilings.length) {
        // Bajo cubierta inclinada el recinto llega hasta la cumbrera: se
        // compara con el punto más alto del techo sobre su propia huella.
        let top = null;
        const probes = s.poly.concat([G.centroid(s.poly)]);
        for (const p of probes) {
          const ceil = HEM.rooms.ceilingAt(ceilings, p[0], p[1], s.base);
          if (ceil && (top === null || ceil.z > top)) top = ceil.z;
        }
        if (top !== null) return s.top > top + 0.10;
      }
      const st = storeyAbove(P, s);
      return st && s.height > st + 0.10;
    });
    if (badHeight.length) add({
      id: 'space-height', group: 'Espacios', title: 'Altura de los espacios',
      level: 'error', value: badHeight.length + ' espacios sobrepasan su planta',
      count: badHeight.length,
      items: badHeight.slice(0, 12).map(s => s.label + ' · ' + s.height.toFixed(2) + ' m'),
      targets: badHeight.map(s => s.guid),
      detail: 'Los espacios se extruyen más allá del nivel superior, atravesando el forjado o la cubierta. El generador analítico no encontrará el cierre superior y creará superficies exteriores erróneas.',
      rule: 'Las superficies que delimitan el espacio deben ser coplanarias con una de las caras de los elementos constructivos.',
      fix: 'spaceHeight'
    });

    const noRef = spaces.filter(s => !s.reference);
    add({
      id: 'space-ref', group: 'Espacios', title: 'Referencia de tipo en espacios',
      level: noRef.length ? 'warn' : 'ok',
      value: (spaces.length - noRef.length) + ' de ' + spaces.length,
      count: noRef.length,
      targets: noRef.map(s => s.guid),
      detail: noRef.length
        ? 'Los espacios sin referencia de tipo no se agrupan en el modelo analítico y hay que clasificarlos a mano en CYPETHERM.'
        : 'Todos los espacios llevan referencia de tipo.',
      rule: 'Para que espacios y superficies se agrupen por tipos, éstos deben estar definidos en el modelo físico.'
    });

    /* 3 · IsExternal */
    const declared = envelope.filter(e => e.declared !== null);
    const missing = envelope.filter(e => e.declared === null);
    const wrong = envelope.filter(e => e.declared !== null && e.detected !== null && e.declared !== e.detected);
    add({
      id: 'isexternal', group: 'Cerramientos', title: 'Propiedad IsExternal',
      level: missing.length ? 'error' : (wrong.length ? 'warn' : 'ok'),
      value: declared.length + ' de ' + envelope.length + ' declarados',
      count: missing.length,
      targets: (missing.length ? missing : wrong).map(e => e.guid),
      detail: missing.length
        ? missing.length + ' elementos de la envolvente no declaran IsExternal. Sin ella, CYPE no detecta las adyacencias y asigna las superficies como colindantes con «elemento constructivo», que es el error más habitual al importar modelos de Revit.'
        : (wrong.length ? wrong.length + ' elementos declaran un valor que contradice su posición real en el modelo.' : 'Todos los elementos de la envolvente declaran IsExternal.'),
      rule: 'Debe utilizarse IsExternal en IfcWall e IfcSlab para indicar que están en contacto con el exterior.',
      fix: 'isExternal'
    });

    /* 4 · Tipos predefinidos */
    const soleras = slabs.filter(e => e.role === 'solera' && e.keep);
    const soleraOk = soleras.filter(e => isBaseSlab(P, e));
    if (soleras.length) add({
      id: 'baseslab', group: 'Cerramientos', title: 'Soleras en contacto con el terreno',
      level: soleraOk.length === soleras.length ? 'ok' : 'error',
      value: soleraOk.length + ' de ' + soleras.length,
      count: soleras.length - soleraOk.length,
      items: soleras.map(e => shortName(e)),
      targets: soleras.map(e => e.guid),
      detail: soleraOk.length === soleras.length
        ? 'Las soleras están correctamente identificadas.'
        : 'Los elementos en contacto con el terreno deben identificarse o CYPE los tratará como colindantes con «elemento constructivo» en lugar de con el terreno.',
      rule: 'Para las soleras, el parámetro IfcSlabType debe fijarse en USERDEFINED con ObjectType BASESLAB.',
      fix: 'predefined'
    });

    const basement = P.elements.filter(e => e.role === 'muro_sotano');
    if (basement.length) add({
      id: 'basementwall', group: 'Cerramientos', title: 'Muros en contacto con el terreno',
      level: 'warn', value: basement.length + ' detectados', count: basement.length,
      items: basement.map(e => shortName(e)),
      targets: basement.map(e => e.guid),
      rule: 'Para los muros enterrados, IfcWallType debe fijarse en USERDEFINED con ObjectType BASEMENTWALL.',
      detail: 'Se marcarán como muros de sótano para que la adyacencia con el terreno se resuelva correctamente.',
      fix: 'predefined'
    });

    /* 5 · Huecos */
    const orphan = [...doors, ...windows].filter(e => e.flags.includes('sin-muro-anfitrion'));
    add({
      id: 'openings', group: 'Huecos', title: 'Puertas y ventanas',
      level: orphan.length ? 'warn' : 'ok',
      value: doors.length + ' puertas · ' + windows.length + ' ventanas',
      count: orphan.length,
      targets: orphan.map(e => e.guid),
      detail: orphan.length
        ? orphan.length + ' huecos no están alojados en ningún muro mediante IfcOpeningElement, por lo que no se recortarán en el modelo analítico.'
        : 'Todos los huecos están alojados en un muro anfitrión.',
      rule: 'Los huecos deben definirse en una sola planta y estar alojados en el elemento que perforan.'
    });

    const multiStorey = [...doors, ...windows].filter(e => {
      if (e.base == null || e.top == null) return false;
      const h = e.top - e.base;
      return h > 3.2;
    });
    if (multiStorey.length) add({
      id: 'opening-multistorey', group: 'Huecos', title: 'Huecos que atraviesan plantas',
      level: 'warn', value: multiStorey.length + ' huecos', count: multiStorey.length,
      items: multiStorey.map(e => shortName(e) + ' · ' + (e.top - e.base).toFixed(2) + ' m'),
      targets: multiStorey.map(e => e.guid),
      detail: 'Un hueco que abarca más de una planta no se importa correctamente. Deben crearse tantos huecos como plantas atraviesa.',
      rule: 'Ventanas y puertas deben definirse en un solo nivel.'
    });

    /* 5 bis · Huecos sin carpintería y muros cortina */
    const orphanOpenings = [];
    for (const [openId, host] of P.openingHost) {
      if (!P.openingFill.get(openId) && P.byId.has(host)) orphanOpenings.push(openId);
    }
    if (orphanOpenings.length) add({
      id: 'orphan-openings', group: 'Huecos', title: 'Huecos sin carpintería',
      level: 'warn', value: orphanOpenings.length + ' de ' + P.openingHost.size,
      count: orphanOpenings.length,
      detail: 'Perforan un muro pero no alojan puerta ni ventana. CYPE puede generar una abertura adicional o una superficie sin referencia. Suelen ser restos de recortes del modelo original.',
      rule: 'Cada IfcOpeningElement debería rellenarse con un IfcDoor o un IfcWindow mediante IfcRelFillsElement.',
      fix: 'orphanOpenings'
    });

    const curtains = P.elements.filter(e => e.type === 'IFCCURTAINWALL' && e.keep);
    if (curtains.length) add({
      id: 'curtainwall', group: 'Cerramientos', title: 'Tabiques exportados como muro cortina',
      level: 'warn', value: curtains.length + ' IfcCurtainWall',
      count: curtains.length,
      items: curtains.map(e => shortName(e)),
      targets: curtains.map(e => e.guid),
      detail: 'Open BIM Analytical Model lee IfcCurtainWall, pero el importador directo de CYPETHERM se apoya sobre todo en IfcWall e IfcWallStandardCase. Si alguno de estos elementos cierra un recinto, por esa vía quedaría sin muro.',
      rule: 'Los cerramientos que delimitan recintos deben llegar como IfcWall o IfcWallStandardCase.',
      fix: 'curtainToWall'
    });

    /* 5 ter · Dirección postal coherente */
    const siteAddr = P.siteId ? tokRef(m.args(P.siteId)[13]) : 0;
    const addrArgs = siteAddr ? m.args(siteAddr) : null;
    const town = addrArgs ? tokStr(addrArgs[6]) : null;
    const lines = addrArgs && isList(addrArgs[4]) && addrArgs[4].v.length ? tokStr(addrArgs[4].v[0]) : null;
    // Sólo se considera incoherente si la línea de dirección nombra un
    // municipio distinto del declarado, no si es el nombre del edificio.
    const otherTown = !!(town && lines && /\b(calle|avda|avenida|plaza|c\/|carretera)\b/i.test(lines) &&
      lines.toLowerCase().indexOf(String(town).toLowerCase().slice(0, 6)) < 0 && lines.indexOf(',') >= 0);
    const mixed = otherTown;
    add({
      id: 'address', group: 'Archivo', title: 'Dirección del emplazamiento',
      level: (!town || mixed) ? 'warn' : 'ok',
      value: town ? String(town).slice(0, 34) : 'sin definir',
      detail: mixed
        ? 'La dirección postal y el municipio no concuerdan: el IFC arrastra datos de otra obra o de la plantilla. No afecta al cálculo si defines el emplazamiento en CYPETHERM, pero conviene corregirlo antes de compartir el archivo.'
        : (town ? 'El IfcSite declara municipio.' : 'Sin dirección postal en el IfcSite. Conviene rellenarla antes de publicar el modelo.'),
      rule: 'El emplazamiento determina la zona climática del CTE.',
      fix: 'siteFix'
    });

    /* 6 · Sombras */
    const shading = P.elements.filter(e => e.family === 'shading');
    add({
      id: 'shading', group: 'Sombras', title: 'Elementos de sombra',
      level: shading.length ? 'ok' : 'info',
      value: shading.length + ' IfcShadingDevice',
      detail: shading.length
        ? 'Se exportarán como sombras propias o remotas.'
        : (m.schema === 'IFC2X3'
          ? 'No hay IfcShadingDevice, entidad que además no existe en IFC2X3. Los aleros y voladizos deben quedar como IfcSlab con IsExternal en verdadero para que CYPE los lea como cubiertas o voladizos que proyectan sombra.'
          : 'No hay elementos exportados como IfcShadingDevice. Los obstáculos remotos habrá que introducirlos en CYPE a mano.'),
      rule: 'Las sombras deben exportarse con la entidad IfcShadingDevice.'
    });

    /* 7 · Ruido */
    const dropGroups = P.groups.filter(g => !g.keep);
    const dropCount = dropGroups.reduce((s, g) => s + g.count, 0);
    add({
      id: 'noise', group: 'Archivo', title: 'Elementos ajenos al cálculo',
      level: dropCount > 200 ? 'warn' : 'info',
      value: dropCount + ' elementos en ' + dropGroups.length + ' grupos',
      count: dropCount,
      items: dropGroups.slice(0, 10).map(g => g.count + ' × ' + g.label),
      targets: dropGroups.reduce((acc, g) => acc.concat(g.ids.map(id => { const el = P.byId.get(id); return el ? el.guid : null; })), []).filter(Boolean),
      detail: 'Mobiliario, instalaciones, topografía y series repetitivas de piezas menudas. No aportan nada al modelo analítico y son la causa principal del tamaño del archivo.',
      rule: 'Reducir el modelo a la envolvente acelera y estabiliza la generación analítica.',
      fix: 'purge'
    });

    /* 8 · Georreferenciación */
    const site = P.siteId ? m.args(P.siteId) : null;
    const lat = site ? degList(site[9]) : null;
    const lon = site ? degList(site[10]) : null;
    add({
      id: 'geo', group: 'Archivo', title: 'Georreferenciación del emplazamiento',
      level: (lat != null && lon != null) ? 'ok' : 'warn',
      value: (lat != null && lon != null) ? (lat.toFixed(5) + ', ' + lon.toFixed(5)) : 'no definida',
      detail: (lat != null && lon != null)
        ? 'IfcSite declara latitud y longitud. Verifica que la zona climática que asigne CYPE coincide con el municipio real del proyecto.'
        : 'Sin latitud y longitud en IfcSite habrá que fijar el emplazamiento y la zona climática a mano en CYPETHERM.',
      rule: 'La zona climática del CTE depende del municipio y la altitud.'
    });

    checks.sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level]);
    const score = scoreOf(checks);
    return { checks, score };
  }

  function scoreOf(checks) {
    let errors = 0, warns = 0, oks = 0;
    for (const c of checks) {
      if (c.level === 'error') errors++;
      else if (c.level === 'warn') warns++;
      else if (c.level === 'ok') oks++;
    }
    const total = errors + warns + oks || 1;
    return { errors, warns, oks, pct: Math.round((oks + warns * 0.5) / total * 100) };
  }

  function storeyAbove(P, sp) {
    const base = sp.base;
    const above = P.storeys.filter(s => s.z > base + 0.3).sort((a, b) => a.z - b.z)[0];
    return above ? above.z - base : null;
  }

  function isBaseSlab(P, el) {
    // BASESLAB es un valor propio de IfcSlabTypeEnum, pero CYPE Architecture y
    // algunos exportadores lo escriben como USERDEFINED con el nombre en
    // ObjectType. Se aceptan las dos formas.
    const a = P.m.args(el.id);
    if (a) {
      const pd = tokEnum(a[8]);
      if (pd === 'BASESLAB') return true;
      if (pd === 'USERDEFINED' && /BASESLAB/i.test(tokStr(a[4]) || '')) return true;
    }
    const tid = P.typeOfElem.get(el.id);
    if (tid) {
      const ta = P.m.args(tid);
      if (ta) {
        const pd = tokEnum(ta[9]);
        if (pd === 'BASESLAB') return true;
        if (pd === 'USERDEFINED' && /BASESLAB/i.test(tokStr(ta[8]) || '')) return true;
      }
    }
    return false;
  }

  /** Eje medio de una huella rectangular: los dos lados largos promediados. */
  function midlineOf(poly) {
    if (!poly || poly.length < 4) return null;
    const lados = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      lados.push({ a, b, l: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
    lados.sort((x, y) => y.l - x.l);
    const p = lados[0], q = lados[1];
    if (!q || q.l < p.l * 0.5) return [p.a, p.b];
    // Se empareja el extremo más cercano para no cruzar el eje.
    const d1 = Math.hypot(q.a[0] - p.a[0], q.a[1] - p.a[1]);
    const d2 = Math.hypot(q.b[0] - p.a[0], q.b[1] - p.a[1]);
    const qa = d1 <= d2 ? q.a : q.b, qb = d1 <= d2 ? q.b : q.a;
    return [[(p.a[0] + qa[0]) / 2, (p.a[1] + qa[1]) / 2], [(p.b[0] + qb[0]) / 2, (p.b[1] + qb[1]) / 2]];
  }

  /** Espesor de una huella rectangular: su lado corto. */
  function thicknessOf(poly) {
    if (!poly || poly.length < 3) return null;
    const largo = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      largo.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    largo.sort((x, y) => x - y);
    const corto = largo.filter(l => l > 1e-4)[0];
    return corto && corto < 2 ? corto : null;
  }

  function shortName(el) {
    const n = el.typeName || el.name || el.type;
    return n.length > 62 ? n.slice(0, 60) + '…' : n;
  }

  function degList(tok) {
    if (!tok || !isList(tok)) return null;
    const v = tok.v.map(tokNum);
    if (v[0] == null) return null;
    const sign = v[0] < 0 ? -1 : 1;
    return sign * (Math.abs(v[0]) + (Math.abs(v[1] || 0)) / 60 + (Math.abs(v[2] || 0)) / 3600 + (Math.abs(v[3] || 0)) / 3600e6);
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  HEM.cype = { Project, audit, familyOf, ENVELOPE, NOISE_PSETS, fmtBytes, shortName, storeyAbove, isBaseSlab, SEVERITY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
