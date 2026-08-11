/*
 * HEFESTOLAB · IFC Energy Model
 * fix.js — Correcciones sobre el modelo y escritura del IFC saneado
 * ---------------------------------------------------------------------------
 * Todas las operaciones son reversibles en el sentido de que trabajan sobre
 * una copia en memoria: el archivo original del usuario nunca se toca.
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});
  const S = HEM.step;
  const G = HEM.geom;
  const { T, tokRef, tokNum, tokStr, tokEnum, isList } = S;

  const GUID_CHARS = '0123456789_$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  /** GUID IFC (base 64 propia de IFC, 22 caracteres). */
  function newGuid() {
    let out = '';
    const bytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    // 128 bits -> 22 caracteres: 2 bits + 21 grupos de 6 bits
    let bits = '';
    for (let i = 0; i < 16; i++) bits += bytes[i].toString(2).padStart(8, '0');
    out += GUID_CHARS[parseInt(bits.slice(0, 2), 2)];
    for (let i = 2; i < 128; i += 6) out += GUID_CHARS[parseInt(bits.slice(i, i + 6).padEnd(6, '0'), 2)];
    return out.slice(0, 22);
  }

  /* ======================================================================
   * Motor de correcciones
   * ==================================================================== */

  class Fixer {
    /**
     * @param {Project} P
     * @param {Object} opt  banderas de corrección
     */
    constructor(P, opt) {
      this.P = P;
      this.m = P.m;
      this.opt = Object.assign({
        target: 'analitico',        // 'analitico' | 'modelo3d'
        isExternal: true,
        predefined: true,
        quantities: true,
        spaceHeight: true,
        spaceCleanup: true,
        purge: true,
        purgeNoisePsets: true,
        orphanOpenings: true,
        curtainToWall: false,
        siteFix: false,
        createRooms: null,          // recintos a crear cuando el IFC no trae ninguno
        site: null,                 // {lat, lon, address, town, region, postal}
        spaceHeightMode: 'cubierta' // 'cubierta' | 'planta' | 'mantener'
      }, opt || {});
      this.log = [];
      this.ownerHistory = this.findOwnerHistory();
      this.counts = {
        isExternal: 0, predefined: 0, quantities: 0, spaceHeight: 0,
        spacesRemoved: 0, elementsRemoved: 0, psetsRemoved: 0, entitiesRemoved: 0,
        spacesSloped: 0, spacesEquivalent: 0, openingsRemoved: 0,
        curtainConverted: 0, siteFixed: 0
      };
      this.clips = new Map();   // spaceId -> resultado del recorte contra el techo
    }

    findOwnerHistory() {
      const list = this.m.idsOfType('IFCOWNERHISTORY');
      return list.length ? list[0] : 0;
    }

    note(kind, text) { this.log.push({ kind, text }); }

    run(onProgress) {
      const step = onProgress || function () {};
      if (this.opt.createRooms && this.opt.createRooms.length) {
        step('Creando los recintos', 0.05);
        this.createSpaces(this.opt.createRooms, this.opt.createStorey);
      }
      if (this.opt.spaceCleanup) { step('Depurando espacios', 0.08); this.fixSpaces(); }
      if (this.opt.spaceHeight) { step('Recortando los espacios contra la cubierta', 0.18); this.fixSpaceGeometry(); }
      if (this.opt.quantities) { step('Generando Qto_SpaceBaseQuantities', 0.32); this.fixQuantities(); }
      if (this.opt.isExternal) { step('Escribiendo IsExternal', 0.44); this.fixIsExternal(); }
      if (this.opt.predefined) { step('Asignando tipos predefinidos', 0.54); this.fixPredefined(); }
      if (this.opt.orphanOpenings) { step('Revisando huecos sin relleno', 0.62); this.fixOrphanOpenings(); }
      if (this.opt.curtainToWall) { step('Convirtiendo muros cortina', 0.68); this.fixCurtainWalls(); }
      if (this.opt.siteFix) { step('Corrigiendo el emplazamiento', 0.74); this.fixSite(); }
      step('Calculando conjunto a conservar', 0.82);
      this.keep = this.opt.purge ? this.computeKeepSet() : null;
      step('Correcciones aplicadas', 1);
      return this;
    }

    /* ---------------- huecos sin relleno ---------------- */

    /**
     * Un IfcOpeningElement sin IfcRelFillsElement recorta el muro pero no aloja
     * ninguna carpintería. CYPE lo interpretaría como una abertura adicional o
     * como una superficie sin referencia.
     */
    fixOrphanOpenings() {
      const P = this.P;
      const huerfanos = [];
      for (const [openId, hostId] of P.openingHost) {
        if (P.openingFill.get(openId)) continue;
        if (!this.m.exists(openId)) continue;
        huerfanos.push({ openId, hostId });
      }
      for (const h of huerfanos) {
        this.detachObject(h.openId);
        this.m.remove(h.openId);
        this.counts.openingsRemoved++;
        P.openingHost.delete(h.openId);
      }
      if (huerfanos.length) {
        this.note('hueco', 'Retirados ' + huerfanos.length + ' huecos que recortaban un muro sin alojar ninguna carpintería.');
      }
    }

    /* ---------------- creación de recintos ---------------- */

    /**
     * Escribe como IfcSpace los recintos detectados a partir de los muros.
     * Se crean con el contorno en planta y altura hasta el nivel superior; el
     * recorte contra la cubierta lo hace después fixSpaceGeometry.
     *
     * @param {Array<{poly, name, use, base, height}>} rooms
     * @param {number} storeyId
     */
    createSpaces(rooms, storeyId) {
      const m = this.m;
      const P = this.P;
      if (!rooms || !rooms.length) return [];
      const storey = storeyId || (P.storeys[0] && P.storeys[0].id);
      if (!storey) return [];

      // Los puntos del contorno van en el sistema local de la planta.
      const storeyPlacement = this.storeyPlacementId(storey);
      const toLocal = G.invertRigid(P.geo.placement(storeyPlacement));
      const created = [];
      let seq = P.spaces.length;

      for (const r of rooms) {
        if (!r.poly || r.poly.length < 3) continue;
        const base = r.base != null ? r.base : 0;
        const height = r.height && r.height > 0.3 ? r.height : 2.5;
        const ring = G.dedupeRing(r.poly);
        const local = ring.map(p => G.applyPoint(toLocal, [p[0], p[1], base]));

        const pts = local.map(p => m.add('IFCCARTESIANPOINT', [T.list([T.num(p[0]), T.num(p[1])])]));
        const poly = m.add('IFCPOLYLINE', [T.list(pts.concat([pts[0]]).map(id => T.ref(id)))]);
        const profile = m.add('IFCARBITRARYCLOSEDPROFILEDEF', [T.enum('AREA'), T.nul(), T.ref(poly)]);
        const origin = m.add('IFCCARTESIANPOINT', [T.list([T.num(0), T.num(0), T.num(local[0][2])])]);
        const axis = m.add('IFCAXIS2PLACEMENT3D', [T.ref(origin), T.nul(), T.nul()]);
        const dir = m.add('IFCDIRECTION', [T.list([T.num(0), T.num(0), T.num(1)])]);
        const solid = m.add('IFCEXTRUDEDAREASOLID', [T.ref(profile), T.ref(axis), T.ref(dir), T.num(height)]);

        const ctx = m.idsOfType('IFCGEOMETRICREPRESENTATIONSUBCONTEXT')[0] || m.idsOfType('IFCGEOMETRICREPRESENTATIONCONTEXT')[0];
        const rep = m.add('IFCSHAPEREPRESENTATION', [
          ctx ? T.ref(ctx) : T.nul(), T.str('Body'), T.str('SweptSolid'), T.list([T.ref(solid)])
        ]);
        const shape = m.add('IFCPRODUCTDEFINITIONSHAPE', [T.nul(), T.nul(), T.list([T.ref(rep)])]);

        const placeOrigin = m.add('IFCCARTESIANPOINT', [T.list([T.num(0), T.num(0), T.num(0)])]);
        const placeAxis = m.add('IFCAXIS2PLACEMENT3D', [T.ref(placeOrigin), T.nul(), T.nul()]);
        const placement = m.add('IFCLOCALPLACEMENT', [
          storeyPlacement ? T.ref(storeyPlacement) : T.nul(), T.ref(placeAxis)
        ]);

        const name = r.name || ('Recinto ' + (++seq));
        const spaceId = m.add('IFCSPACE', [
          T.str(newGuid()),
          this.ownerHistory ? T.ref(this.ownerHistory) : T.nul(),
          T.str(String(++seq)),
          T.nul(), T.nul(),
          T.ref(placement), T.ref(shape),
          T.str(name),
          T.enum('ELEMENT'), T.enum('INTERNAL'), T.nul()
        ]);

        // Referencia de tipo: CYPE agrupa los espacios por ella.
        this.setProperty(spaceId, 'Pset_SpaceCommon', 'Reference',
          T.list([T.str(r.reference || name)], 'IFCIDENTIFIER'));

        // Cuelga de la planta.
        m.add('IFCRELAGGREGATES', [
          T.str(newGuid()),
          this.ownerHistory ? T.ref(this.ownerHistory) : T.nul(),
          T.nul(), T.nul(), T.ref(storey), T.list([T.ref(spaceId)])
        ]);

        const areaNet = G.area(ring);
        const record = {
          id: spaceId, guid: null, name: String(seq), longName: name, solidId: solid,
          objectType: '', reference: r.reference || name, interior: true,
          storeyId: storey, solid: null, poly: ring, inners: [],
          areaNet, perimeter: G.perimeter(ring), height, base, top: base + height,
          volume: areaNet * height, include: true, use: r.use || 'acondicionado',
          reason: 'Recinto creado por HEFESTOLAB a partir de los muros',
          flags: [], label: name, created: true
        };
        const ga = m.args(spaceId);
        record.guid = tokStr(ga[0]);
        P.spaces.push(record);
        created.push(record);
      }

      if (created.length) {
        this.counts.spacesCreated = (this.counts.spacesCreated || 0) + created.length;
        this.note('espacio', 'Creados ' + created.length + ' IfcSpace a partir de los contornos cerrados por los muros. Revísalos: la detección no distingue una separación virtual de una puerta abierta.');
      }
      return created;
    }

    storeyPlacementId(storeyId) {
      const a = this.m.args(storeyId);
      return a ? tokRef(a[5]) : 0;
    }

    /* ---------------- muros cortina ---------------- */

    /**
     * El importador directo de CYPETHERM lee sobre todo IfcWall e
     * IfcWallStandardCase. Un tabique exportado como IfcCurtainWall puede
     * quedarse fuera y dejar un recinto sin cerrar.
     */
    fixCurtainWalls() {
      const m = this.m;
      for (const el of this.P.elements) {
        if (el.family !== 'curtain' || !el.keep) continue;
        if (el.type !== 'IFCCURTAINWALL') continue;
        const a = m.args(el.id);
        if (!a) continue;
        // IfcCurtainWall e IfcWallStandardCase comparten los ocho primeros
        // atributos de IfcElement, así que basta con cambiar la entidad.
        const slot = m.slotOf(el.id);
        if (slot < 0) continue;
        m._added.push({ id: el.id, type: 'IFCWALLSTANDARDCASE', args: a.slice(0, 8) });
        const newSlot = m.count + m._added.length - 1;
        m.slotById[el.id] = newSlot;
        m._argCache.set(newSlot, a.slice(0, 8));
        m._removed.add(slot);
        el.type = 'IFCWALLSTANDARDCASE';
        el.family = 'wall';
        el.converted = true;
        this.counts.curtainConverted++;
      }
      if (this.counts.curtainConverted) {
        this.note('cerramiento', 'Convertidos ' + this.counts.curtainConverted +
          ' muros cortina en IfcWallStandardCase para que el importador directo de CYPETHERM los lea.');
      }
    }

    /* ---------------- emplazamiento ---------------- */

    fixSite() {
      const m = this.m;
      const P = this.P;
      const s = this.opt.site || {};
      if (!P.siteId) return;
      const a = m.args(P.siteId);
      if (!a) return;

      if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
        m.setArg(P.siteId, 9, T.list(dms(s.lat).map(v => S.writeInt(v))));
        m.setArg(P.siteId, 10, T.list(dms(s.lon).map(v => S.writeInt(v))));
        this.counts.siteFixed++;
      }
      if (Number.isFinite(s.elevation)) m.setArg(P.siteId, 11, T.num(s.elevation));

      // Dirección postal: se sustituye la del edificio y la del emplazamiento.
      if (s.town || s.address || s.region) {
        // IfcPostalAddress (IFC2X3): Purpose, Description, UserDefinedPurpose,
        // InternalLocation, AddressLines, PostalBox, Town, Region, PostalCode,
        // Country. Diez atributos, ni uno más.
        const addr = m.add('IFCPOSTALADDRESS', [
          T.nul(), T.nul(), T.nul(), T.nul(),
          s.address ? T.list([T.str(s.address)]) : T.nul(),
          T.nul(),
          s.town ? T.str(s.town) : T.nul(),
          s.region ? T.str(s.region) : T.nul(),
          s.postal ? T.str(s.postal) : T.nul(),
          s.country ? T.str(s.country) : T.str('España')
        ]);
        // IfcSite.SiteAddress es el atributo 13; IfcBuilding.BuildingAddress, el 11.
        m.setArg(P.siteId, 13, T.ref(addr));
        if (P.buildingId && m.args(P.buildingId)) m.setArg(P.buildingId, 11, T.ref(addr));
        this.counts.siteFixed++;
      }
      if (this.counts.siteFixed) {
        this.note('emplazamiento', 'Actualizada la georreferenciación del IfcSite' +
          (s.town ? ' y la dirección postal (' + s.town + ')' : '') + '.');
      }
    }

    /* ---------------- espacios ---------------- */

    fixSpaces() {
      for (const sp of this.P.spaces) {
        if (sp.include) continue;
        this.detachObject(sp.id);
        this.m.remove(sp.id);
        this.counts.spacesRemoved++;
        this.note('espacio', 'Eliminado el espacio «' + sp.label + '» (' + sp.areaNet.toFixed(1) + ' m²): ' + (sp.reason || 'excluido por el usuario'));
      }
    }

    /**
     * Ajusta la geometría de cada recinto. Bajo cubierta inclinada el espacio
     * deja de ser un prisma: se recorta contra los faldones y se escribe como
     * IfcFacetedBrep, de modo que su cara superior es coplanaria con la cara
     * inferior de la cubierta, que es lo que exige CYPE.
     */
    fixSpaceGeometry() {
      if (this.opt.spaceHeightMode === 'mantener') return;
      const P = this.P;
      const planes = (this.opt.spaceHeightMode === 'cubierta' && HEM.rooms)
        ? HEM.rooms.ceilingPlanes(P) : [];

      for (const sp of P.spaces) {
        if (!sp.include || (!sp.solid && !sp.created) || !sp.poly) continue;
        const storey = sp.targetHeight != null ? sp.targetHeight : HEM.cype.storeyAbove(P, sp);
        const clip = planes.length && HEM.rooms
          ? HEM.rooms.clipSpace(sp, planes, storey || sp.height)
          : null;

        // --- techo inclinado: sólido real ---
        if (clip && !clip.flat && clip.coverage > 0.98) {
          const brep = HEM.rooms.spaceBrep(sp, clip);
          if (brep && brep.closed && this.writeSpaceBrep(sp, brep)) {
            this.clips.set(sp.id, clip);
            sp.height = null;
            sp.minH = clip.minH; sp.maxH = clip.maxH;
            sp.volume = clip.volume;
            sp.ceilingArea = clip.ceilingArea;
            sp.sloped = true;
            this.counts.spacesSloped++;
            this.note('espacio', '«' + sp.label + '» recortado contra la cubierta: altura de ' +
              clip.minH.toFixed(2) + ' a ' + clip.maxH.toFixed(2) + ' m, volumen real ' + clip.volume.toFixed(1) + ' m³.');
            continue;
          }
          // Malla no cerrada: prisma de volumen equivalente, que conserva el
          // dato que CYPE lee de las cantidades sin escribir geometría inválida.
          const hEq = clip.volume / (sp.areaNet || 1);
          if (this.setSpaceHeight(sp, hEq)) {
            this.clips.set(sp.id, clip);
            sp.height = hEq; sp.volume = clip.volume; sp.equivalent = true;
            sp.minH = clip.minH; sp.maxH = clip.maxH;
            this.counts.spacesEquivalent++;
            this.note('espacio', '«' + sp.label + '»: la malla inclinada no cerraba, se escribe un prisma de altura equivalente ' +
              hEq.toFixed(2) + ' m que mantiene el volumen real ' + clip.volume.toFixed(1) + ' m³.');
          }
          continue;
        }

        // --- techo plano: recorte a la altura de planta ---
        const target = clip && clip.flat ? clip.height : storey;
        if (!target || target <= 0.2) continue;
        if (Math.abs(sp.height - target) < 0.02) continue;
        if (this.setSpaceHeight(sp, target)) {
          this.note('espacio', 'Altura de «' + sp.label + '» ajustada de ' + sp.height.toFixed(2) + ' m a ' + target.toFixed(2) + ' m');
          sp.height = target;
          sp.top = sp.base + target;
          sp.volume = sp.areaNet * target;
          this.counts.spaceHeight++;
        }
      }
    }

    /**
     * Sustituye la representación del espacio por un IfcFacetedBrep con las
     * caras dadas en coordenadas de proyecto.
     */
    writeSpaceBrep(sp, brep) {
      const m = this.m;
      const a = m.args(sp.id);
      if (!a) return false;
      const shapeId = tokRef(a[6]);
      const shape = m.args(shapeId);
      if (!shape || !isList(shape[2]) || !shape[2].v.length) return false;
      const repId = tokRef(shape[2].v[0]);
      const rep = m.args(repId);
      if (!rep) return false;

      // Los puntos del brep van en el sistema local del emplazamiento.
      const toLocal = G.invertRigid(this.P.geo.placement(tokRef(a[5])));
      const cache = new Map();
      const pointId = (p) => {
        const q = G.applyPoint(toLocal, p);
        const key = q[0].toFixed(6) + ',' + q[1].toFixed(6) + ',' + q[2].toFixed(6);
        let id = cache.get(key);
        if (id === undefined) {
          id = m.add('IFCCARTESIANPOINT', [T.list([T.num(q[0]), T.num(q[1]), T.num(q[2])])]);
          cache.set(key, id);
        }
        return id;
      };

      const faces = [];
      for (const f of brep.faces) {
        if (!f || f.length < 3) continue;
        const loop = m.add('IFCPOLYLOOP', [T.list(f.map(p => T.ref(pointId(p))))]);
        const bound = m.add('IFCFACEOUTERBOUND', [T.ref(loop), T.bool(true)]);
        faces.push(m.add('IFCFACE', [T.list([T.ref(bound)])]));
      }
      if (faces.length < 4) return false;
      const shell = m.add('IFCCLOSEDSHELL', [T.list(faces.map(f => T.ref(f)))]);
      const solid = m.add('IFCFACETEDBREP', [T.ref(shell)]);

      m.setArg(repId, 2, T.str('Brep'));
      m.setArg(repId, 3, T.list([T.ref(solid)]));
      return true;
    }

    /** Cambia la profundidad de extrusión del sólido del espacio. */
    setSpaceHeight(sp, height) {
      const m = this.m;
      const a = m.args(sp.id);
      const shape = m.args(tokRef(a[6]));
      if (!shape || !isList(shape[2])) return false;
      for (const t of shape[2].v) {
        const rep = m.args(tokRef(t));
        if (!rep || !isList(rep[3])) continue;
        for (const it of rep[3].v) {
          let solidId = tokRef(it);
          let sa = m.args(solidId);
          let guard = 0;
          while (sa && /^IFCBOOLEAN/.test(m.typeOf(solidId)) && guard++ < 4) {
            solidId = tokRef(sa[1]); sa = m.args(solidId);
          }
          if (!sa || m.typeOf(solidId) !== 'IFCEXTRUDEDAREASOLID') continue;
          // Si el sólido lo comparten varias entidades, se clona antes de tocarlo.
          const users = m.referencedBy(solidId);
          if (users.length > 1) {
            const clone = m.add('IFCEXTRUDEDAREASOLID', sa.map(x => x));
            m.setArg(clone, 3, T.num(height));
            this.replaceRef(tokRef(t), solidId, clone);
          } else {
            m.setArg(solidId, 3, T.num(height));
          }
          return true;
        }
      }
      return false;
    }

    replaceRef(ownerId, oldId, newId) {
      const args = this.m.args(ownerId);
      if (!args) return;
      const walk = (list) => {
        for (let i = 0; i < list.length; i++) {
          const tk = list[i];
          if (!tk) continue;
          if (tk.t === 'ref' && tk.v === oldId) list[i] = T.ref(newId);
          else if (tk.t === 'list') walk(tk.v);
        }
      };
      walk(args);
      this.m.touch(ownerId);
    }

    /* ---------------- cantidades de espacio ---------------- */

    fixQuantities() {
      for (const sp of this.P.spaces) {
        if (!sp.include || !sp.poly) continue;
        const clip = this.clips.get(sp.id);
        const area = sp.areaNet;
        const per = sp.perimeter;
        const sloped = !!(clip && !clip.flat);
        const volume = sloped ? clip.volume : area * sp.height;
        const ceiling = sloped ? clip.ceilingArea : area;
        // Altura media, sólo como referencia del alzado de los cerramientos.
        const hMean = volume / (area || 1);

        const quantities = [
          this.quantity('IFCQUANTITYAREA', 'NetFloorArea', area, 'Superficie útil de suelo'),
          this.quantity('IFCQUANTITYAREA', 'GrossFloorArea', area, 'Superficie de suelo')
        ];
        // Con techo inclinado no existe una altura única: declararla induciría
        // a CYPE a recalcular el volumen como superficie × altura y a perder el
        // valor real. Se omite Height a propósito.
        if (!sloped) {
          quantities.push(this.quantity('IFCQUANTITYLENGTH', 'Height', sp.height, 'Altura libre del recinto'));
        }
        quantities.push(
          this.quantity('IFCQUANTITYLENGTH', 'GrossPerimeter', per, 'Perímetro del recinto'),
          this.quantity('IFCQUANTITYLENGTH', 'NetPerimeter', per, 'Perímetro interior'),
          this.quantity('IFCQUANTITYAREA', 'GrossWallArea', per * hMean, 'Superficie de cerramientos verticales'),
          this.quantity('IFCQUANTITYAREA', 'NetCeilingArea', ceiling, sloped ? 'Superficie real del techo inclinado' : 'Superficie de techo'),
          this.quantity('IFCQUANTITYVOLUME', 'GrossVolume', volume, 'Volumen bruto'),
          this.quantity('IFCQUANTITYVOLUME', 'NetVolume', volume, 'Volumen neto')
        );
        const qtoId = this.m.add('IFCELEMENTQUANTITY', [
          T.str(newGuid()),
          this.ownerHistory ? T.ref(this.ownerHistory) : T.nul(),
          T.str('Qto_SpaceBaseQuantities'),
          T.str('Cantidades base generadas por HEFESTOLAB IFC Energy Model'),
          T.nul(),
          T.list(quantities.map(q => T.ref(q)))
        ]);
        this.attachDefinition(sp.id, qtoId);
        this.counts.quantities++;
      }
      if (this.counts.quantities) {
        this.note('espacio', 'Generado Qto_SpaceBaseQuantities en ' + this.counts.quantities + ' espacios (superficie, perímetro, altura y volumen tomados de la geometría).');
      }
    }

    quantity(type, name, value, description) {
      return this.m.add(type, [
        T.str(name),
        T.str(description || ''),
        T.nul(),
        T.num(round(value, 6))
      ]);
    }

    /* ---------------- IsExternal ---------------- */

    fixIsExternal() {
      const psetFor = {
        wall: 'Pset_WallCommon', slab: 'Pset_SlabCommon', roof: 'Pset_RoofCommon',
        door: 'Pset_DoorCommon', window: 'Pset_WindowCommon',
        curtain: 'Pset_CurtainWallCommon', shading: 'Pset_ShadingDeviceCommon'
      };
      for (const el of this.P.elements) {
        if (!HEM.cype.ENVELOPE.has(el.family) || !el.keep || el.container) continue;
        const value = el.decided != null ? el.decided : el.detected;
        if (value == null) continue;
        if (el.declared === value) continue;
        const pname = psetFor[el.family] || 'Pset_' + el.type.replace(/^IFC/, '') + 'Common';
        this.setProperty(el.id, pname, 'IsExternal', T.list([T.bool(value)], 'IFCBOOLEAN'), 'IFCBOOLEAN');
        this.counts.isExternal++;
      }
      if (this.counts.isExternal) {
        this.note('cerramiento', 'Escrita la propiedad IsExternal en ' + this.counts.isExternal + ' elementos de la envolvente.');
      }
    }

    /* ---------------- tipos predefinidos ---------------- */

    fixPredefined() {
      for (const el of this.P.elements) {
        if (!el.keep || el.container) continue;
        const role = el.role;
        if (el.family === 'slab' && role === 'solera') {
          // BASESLAB es un valor propio de IfcSlabTypeEnum en IFC2X3 y en IFC4,
          // así que se escribe como tal y no como USERDEFINED. Se mantiene
          // además el ObjectType por compatibilidad con lectores antiguos.
          this.setNativePredefined(el, 'BASESLAB', 8, 4, 9, 8);
        } else if (el.family === 'wall' && role === 'muro_sotano') {
          this.setUserDefined(el, 'BASEMENTWALL', null, 4, 9, 8);
        } else if (el.family === 'wall' && role === 'medianera') {
          this.setUserDefined(el, 'PARTYWALL', null, 4, 9, 8);
        }
      }
      if (this.counts.predefined) {
        this.note('cerramiento', 'Asignado el tipo predefinido USERDEFINED a ' + this.counts.predefined + ' elementos (soleras, muros enterrados o medianeras).');
      }
    }

    /**
     * Escribe PredefinedType = USERDEFINED y el nombre en ObjectType/ElementType,
     * tanto en la ocurrencia (si el esquema tiene el atributo) como en el tipo.
     */
    /**
     * Igual que setUserDefined, pero cuando el valor existe en el propio
     * enumerado del esquema (caso de BASESLAB en IfcSlabTypeEnum).
     */
    setNativePredefined(el, label, occPredefIdx, occObjectIdx, typePredefIdx, typeElementIdx) {
      const m = this.m;
      let touched = false;
      const a = m.args(el.id);
      if (a && occPredefIdx != null && a.length > occPredefIdx) {
        m.setArg(el.id, occPredefIdx, T.enum(label));
        m.setArg(el.id, occObjectIdx, T.str(label));
        touched = true;
      }
      const tid = this.P.typeOfElem.get(el.id);
      if (tid) {
        const ta = m.args(tid);
        if (ta && ta.length > typePredefIdx) {
          m.setArg(tid, typePredefIdx, T.enum(label));
          m.setArg(tid, typeElementIdx, T.str(label));
          touched = true;
        }
      }
      if (touched) { this.counts.predefined++; el.appliedPredefined = label; }
      return touched;
    }

    setUserDefined(el, label, occPredefIdx, occObjectIdx, typePredefIdx, typeElementIdx) {
      const m = this.m;
      let touched = false;
      const a = m.args(el.id);
      if (a && occPredefIdx != null && a.length > occPredefIdx) {
        m.setArg(el.id, occPredefIdx, T.enum('USERDEFINED'));
        m.setArg(el.id, occObjectIdx, T.str(label));
        touched = true;
      }
      const tid = this.P.typeOfElem.get(el.id);
      if (tid) {
        const ta = m.args(tid);
        if (ta && ta.length > typePredefIdx) {
          m.setArg(tid, typePredefIdx, T.enum('USERDEFINED'));
          m.setArg(tid, typeElementIdx, T.str(label));
          touched = true;
        }
      }
      if (touched) { this.counts.predefined++; el.appliedPredefined = label; }
      return touched;
    }

    /* ---------------- utilidades de conjuntos de propiedades ---------------- */

    /**
     * Garantiza que el elemento tiene un Pset propio con la propiedad indicada.
     * Si el Pset está compartido con otros elementos, se clona para no
     * contaminarlos.
     */
    setProperty(elemId, psetName, propName, valueToken) {
      const m = this.m;
      const list = this.P.psetsOf.get(elemId) || [];
      let entry = list.find(e => e.name === psetName && e.kind === 'IFCPROPERTYSET');
      let psetId = entry ? entry.psetId : 0;

      // Un conjunto puede estar compartido tanto dentro de una relación con
      // varios objetos como a través de varias relaciones distintas.
      if (!this._psetUsers) {
        this._psetUsers = new Map();
        for (const [, entries] of this.P.psetsOf) {
          for (const e of entries) this._psetUsers.set(e.psetId, (this._psetUsers.get(e.psetId) || 0) + 1);
        }
      }
      const shared = entry && (!entry.sole || (this._psetUsers.get(entry.psetId) || 1) > 1);

      if (shared) {
        // Pset compartido: se desengancha este elemento y se le da una copia.
        this.detachFromRel(entry.relId, elemId);
        psetId = this.clonePset(entry.psetId);
        const relId = this.newRelDefines(elemId, psetId);
        const idx = list.indexOf(entry);
        entry = { relId, psetId, name: psetName, kind: 'IFCPROPERTYSET', sole: true };
        if (idx >= 0) list.splice(idx, 1, entry); else list.push(entry);
        this._psetUsers.set(psetId, 1);
      }

      if (!psetId) {
        psetId = m.add('IFCPROPERTYSET', [
          T.str(newGuid()),
          this.ownerHistory ? T.ref(this.ownerHistory) : T.nul(),
          T.str(psetName), T.nul(), T.list([])
        ]);
        const relId = this.newRelDefines(elemId, psetId);
        list.push({ relId, psetId, name: psetName, kind: 'IFCPROPERTYSET', sole: true });
        this.P.psetsOf.set(elemId, list);
      }

      // Los exportadores deduplican las propiedades: una misma
      // IfcPropertySingleValue con IsExternal = .F. puede estar compartida por
      // decenas de conjuntos. Modificarla en el sitio contaminaría a todos los
      // demás elementos, así que siempre se crea una propiedad nueva y se
      // sustituye la referencia dentro de este conjunto.
      const pa = m.args(psetId);
      if (!isList(pa[4])) pa[4] = T.list([]);
      const propId = m.add('IFCPROPERTYSINGLEVALUE', [T.str(propName), T.nul(), valueToken, T.nul()]);
      let replaced = false;
      for (let i = 0; i < pa[4].v.length; i++) {
        const p = m.args(tokRef(pa[4].v[i]));
        if (p && tokStr(p[0]) === propName) { pa[4].v[i] = T.ref(propId); replaced = true; break; }
      }
      if (!replaced) pa[4].v.push(T.ref(propId));
      m.touch(psetId);
      return psetId;
    }

    clonePset(psetId) {
      const m = this.m;
      const a = m.args(psetId);
      const props = isList(a[4]) ? a[4].v.slice() : [];
      return m.add('IFCPROPERTYSET', [
        T.str(newGuid()),
        a[1], a[2], a[3], T.list(props)
      ]);
    }

    newRelDefines(elemId, defId) {
      return this.m.add('IFCRELDEFINESBYPROPERTIES', [
        T.str(newGuid()),
        this.ownerHistory ? T.ref(this.ownerHistory) : T.nul(),
        T.nul(), T.nul(),
        T.list([T.ref(elemId)]),
        T.ref(defId)
      ]);
    }

    attachDefinition(elemId, defId) { return this.newRelDefines(elemId, defId); }

    detachFromRel(relId, elemId) {
      const a = this.m.args(relId);
      if (!a || !isList(a[4])) return;
      a[4].v = a[4].v.filter(t => tokRef(t) !== elemId);
      this.m.touch(relId);
      if (!a[4].v.length) this.m.remove(relId);
    }

    /** Quita un objeto de todas las relaciones que lo mencionan. */
    detachObject(objId) {
      const m = this.m;
      for (const slot of m.referencedBy(objId)) {
        const id = m.idOfSlot(slot);
        const ty = m.typeOf(id);
        if (!ty || !ty.startsWith('IFCREL')) continue;
        const a = m.args(id);
        let changed = false, empty = false;
        for (let i = 4; i < a.length; i++) {
          const tk = a[i];
          if (isList(tk)) {
            const before = tk.v.length;
            tk.v = tk.v.filter(t => tokRef(t) !== objId);
            if (tk.v.length !== before) { changed = true; if (!tk.v.length) empty = true; }
          } else if (tokRef(tk) === objId) { empty = true; changed = true; }
        }
        if (changed) m.touch(id);
        if (empty) m.remove(id);
      }
    }

    /* ======================================================================
     * Purga: conjunto de entidades a conservar
     * ==================================================================== */

    computeKeepSet() {
      const m = this.m;
      const P = this.P;
      const keepIds = new Set();
      const dropElems = new Set();

      // 1 · Qué productos se conservan
      const groupKeep = new Map();
      for (const g of P.groups) groupKeep.set(g.key, g.keep);
      const keptProducts = new Set();
      for (const el of P.elements) {
        const key = el.family + '|' + (el.typeName || el.objectType || el.type);
        const byGroup = groupKeep.has(key) ? groupKeep.get(key) : el.keep;
        const keep = el.keepOverride != null ? el.keepOverride : (byGroup && el.keep !== false);
        if (keep && !el.container) keptProducts.add(el.id);
        else dropElems.add(el.id);
      }
      for (const sp of P.spaces) if (sp.include) keptProducts.add(sp.id);

      // Los contenedores (IfcRoof que agrupa faldones, IfcCurtainWall que
      // agrupa paneles) no tienen geometría propia, pero si se eliminan sus
      // hijos quedan fuera de la estructura espacial y CYPE no los lee. Se
      // conservan siempre que sobreviva alguno de sus hijos.
      let guard = 0;
      let changed = true;
      while (changed && guard++ < 6) {
        changed = false;
        for (const el of P.elements) {
          if (!el.container || keptProducts.has(el.id)) continue;
          const kids = P.aggregates.get(el.id) || [];
          if (kids.some(k => keptProducts.has(k))) {
            keptProducts.add(el.id);
            dropElems.delete(el.id);
            changed = true;
          }
        }
      }
      this.counts.elementsRemoved = dropElems.size;

      // 1 bis · Tipos de elemento. Los IfcTypeObject (IfcBeamType, IfcDoorStyle,
      // IfcBuildingElementProxyType…) llevan colgados los RepresentationMaps con
      // TODA la geometría de la familia. Si no se descartan los tipos sin
      // ocurrencias vivas, la purga no reduce nada: es la fuga principal.
      const keptTypes = new Set();
      for (const id of keptProducts) {
        const tid = P.typeOfElem.get(id);
        if (tid) keptTypes.add(tid);
      }
      for (const sp of P.spaces) {
        if (!sp.include) continue;
        const tid = P.typeOfElem.get(sp.id);
        if (tid) keptTypes.add(tid);
      }
      this._keptTypes = keptTypes;

      // 2 · Raíces obligatorias
      const roots = [];
      const pushIf = (id) => { if (id) roots.push(id); };
      pushIf(P.projectId); pushIf(P.siteId); pushIf(P.buildingId);
      for (const st of P.storeys) pushIf(st.id);
      for (const id of keptProducts) roots.push(id);
      for (const id of m.idsOfType('IFCSIUNIT', 'IFCUNITASSIGNMENT', 'IFCCONVERSIONBASEDUNIT',
        'IFCDERIVEDUNIT', 'IFCMEASUREWITHUNIT', 'IFCMONETARYUNIT', 'IFCOWNERHISTORY',
        'IFCPERSON', 'IFCORGANIZATION', 'IFCPERSONANDORGANIZATION', 'IFCAPPLICATION',
        'IFCGEOMETRICREPRESENTATIONCONTEXT', 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
        'IFCPOSTALADDRESS')) roots.push(id);

      // Huecos cuyo anfitrión se conserva
      for (const [openId, hostId] of P.openingHost) {
        if (keptProducts.has(hostId)) { roots.push(openId); keptProducts.add(openId); }
      }

      // 3 · Relaciones: se filtran las listas y se conservan si queda contenido
      const relKept = [];
      const relTypes = ['IFCRELAGGREGATES', 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
        'IFCRELDEFINESBYPROPERTIES', 'IFCRELDEFINESBYTYPE', 'IFCRELASSOCIATESMATERIAL',
        'IFCRELASSOCIATESCLASSIFICATION', 'IFCRELVOIDSELEMENT', 'IFCRELFILLSELEMENT',
        'IFCRELSPACEBOUNDARY', 'IFCRELSPACEBOUNDARY1STLEVEL', 'IFCRELSPACEBOUNDARY2NDLEVEL',
        'IFCRELCONNECTSPATHELEMENTS'];
      const deadSpaces = new Set(P.spaces.filter(s => !s.include).map(s => s.id));
      const alive = (id) => {
        if (!id) return false;
        if (!m.exists(id)) return false;
        if (dropElems.has(id) || deadSpaces.has(id)) return false;
        if (keptProducts.has(id)) return true;
        const ty = m.typeOf(id);
        if (!ty) return false;
        if (/(TYPE|STYLE)$/.test(ty) && /^IFC/.test(ty)) return keptTypes.has(id);
        if (ty === 'IFCPROJECT' || ty === 'IFCSITE' || ty === 'IFCBUILDING' || ty === 'IFCBUILDINGSTOREY') return true;
        return true;   // materiales, conjuntos de propiedades y demás
      };

      for (const ty of relTypes) {
        for (const id of m.idsOfType(ty)) {
          if (!m.exists(id)) continue;
          const a = m.args(id);
          let ok = true;
          for (let i = 4; i < a.length; i++) {
            const tk = a[i];
            if (isList(tk) && tk.v.length && tk.v.every(t => t && t.t === 'ref')) {
              const before = tk.v.length;
              tk.v = tk.v.filter(t => alive(tokRef(t)));
              if (tk.v.length !== before) m.touch(id);
              if (!tk.v.length) ok = false;
            } else if (tk && tk.t === 'ref') {
              if (!alive(tk.v)) ok = false;
            }
          }
          // Conjuntos de propiedades sin interés para el cálculo
          if (ok && ty === 'IFCRELDEFINESBYPROPERTIES' && this.opt.purgeNoisePsets) {
            const defId = tokRef(a[5]);
            const da = m.args(defId);
            const pname = da ? tokStr(da[2]) : '';
            if (pname && HEM.cype.NOISE_PSETS.test(pname)) { ok = false; this.counts.psetsRemoved++; }
          }
          if (ok) relKept.push(id); else m.remove(id);
        }
      }
      roots.push(...relKept);

      // 4 · Cierre transitivo
      const keepSlots = new Set();
      const stack = roots.slice();
      while (stack.length) {
        const id = stack.pop();
        const slot = m.slotOf(id);
        if (slot < 0 || keepSlots.has(slot) || m._removed.has(slot)) continue;
        keepSlots.add(slot);
        const refs = m.refsOfSlot(slot);
        for (const r of refs) {
          const rs = m.slotOf(r);
          if (rs >= 0 && !keepSlots.has(rs) && !m._removed.has(rs)) stack.push(r);
        }
      }

      this.counts.entitiesRemoved = m.count + m._added.length - keepSlots.size;
      this.keepSlots = keepSlots;
      this.note('purga', 'El modelo se reduce de ' + m.count.toLocaleString('es-ES') + ' a ' +
        keepSlots.size.toLocaleString('es-ES') + ' entidades. Se retiran ' + dropElems.size +
        ' elementos ajenos a la envolvente y toda su geometría asociada.');
      return keepSlots;
    }

    /* ---------------- salida ---------------- */

    toIfc(sourceName) {
      const base = (sourceName || this.m.fileName || 'modelo').replace(/\.ifc$/i, '');
      return this.m.write({
        keep: this.keep || null,
        headerInfo: {
          description: [
            'ViewDefinition [CoordinationView_V2.0]',
            'HEFESTOLAB IFC Energy Model — modelo preparado para Open BIM Analytical Model'
          ],
          name: base + '_CYPE.ifc',
          organization: 'HEFESTOLAB',
          preprocessor: 'HEFESTOLAB IFC Energy Model v1.9.0',
          originating: this.m.originatingSystem
        }
      });
    }

    report() {
      const P = this.P;
      return {
        generado: new Date().toISOString(),
        herramienta: 'HEFESTOLAB IFC Energy Model v1.9.0',
        destino: 'CYPE Open BIM Analytical Model → CYPETHERM HE Plus (CTE 2019)',
        archivo: { nombre: this.m.fileName, esquema: this.m.schema, origen: this.m.originatingSystem },
        correcciones: this.counts,
        espacios: P.spaces.map(s => ({
          id: s.id, nombre: s.label, incluido: s.include, uso: s.use,
          superficie_m2: round(s.areaNet, 2), altura_m: round(s.height, 3),
          volumen_m3: round(s.areaNet * s.height, 2), perimetro_m: round(s.perimeter, 2),
          motivo: s.reason || null
        })),
        cerramientos: P.elements.filter(e => HEM.cype.ENVELOPE.has(e.family) && e.keep && !e.container).map(e => ({
          id: e.id, entidad: e.type, tipo: e.typeName || e.name,
          funcion: e.role, exterior: e.decided,
          espesor_m: e.thickness != null ? round(e.thickness, 3) : null,
          capas: e.layers.layers.map(l => ({ material: l.material, espesor_m: round(l.thickness, 4) })),
          predefinido: e.appliedPredefined || null
        })),
        purgados: P.groups.filter(g => !g.keep).map(g => ({ grupo: g.label, entidad: g.type, unidades: g.count, motivo: g.reason })),
        registro: this.log
      };
    }
  }

  /** Grados decimales a la lista [grados, minutos, segundos, millonésimas]. */
  function dms(deg) {
    const sign = deg < 0 ? -1 : 1;
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const mi = Math.floor(mFull);
    const sFull = (mFull - mi) * 60;
    const se = Math.floor(sFull);
    const mu = Math.round((sFull - se) * 1e6);
    return [sign * d, sign * mi, sign * se, sign * mu];
  }

  function round(v, n) {
    if (!Number.isFinite(v)) return 0;
    const f = Math.pow(10, n);
    return Math.round(v * f) / f;
  }

  HEM.fix = { Fixer, newGuid, dms };
})(typeof globalThis !== 'undefined' ? globalThis : this);
