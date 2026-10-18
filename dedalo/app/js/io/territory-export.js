/* Public IFC4/JSON exchange for Territorio. No private HEFESTO schema or API. */
(function (root) {
  'use strict';
  const D = root.DEDALO, M = D.SceneMath;
  const clone = x => JSON.parse(JSON.stringify(x));
  function guid(uuid) {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error('Identidad IFC inválida.');
    let n = BigInt('0x' + uuid.replace(/-/g, '')), out = '';
    for (let i = 0; i < 22; i++) { out = alphabet[Number(n % 64n)] + out; n /= 64n; }
    return out;
  }
  function occurrenceId(id, path) {
    let value = BigInt('0x' + id.replace(/-/g, '')); const mask = (1n << 128n) - 1n;
    for (const character of path.join('/')) value = ((value ^ BigInt(character.charCodeAt(0))) * 0x1000000000000000000013Bn) & mask;
    const hex = value.toString(16).padStart(32, '0'); return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  function string(value) {
    let out = '';
    for (const character of String(value == null ? '' : value)) {
      if (character === "'") out += "''";
      else if (character === '\\') out += '\\\\';
      else if (character.codePointAt(0) < 32 || character.codePointAt(0) > 126) {
        let hex = ''; for (let i = 0; i < character.length; i++) hex += character.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'); out += '\\X2\\' + hex + '\\X0\\';
      } else out += character;
    }
    return "'" + out + "'";
  }
  function real(value) {
    if (!Number.isFinite(value)) throw new Error('IFC no admite coordenadas no finitas.');
    const text = (Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(9))).toString().toUpperCase();
    return /[.E]/.test(text) ? text : text + '.';
  }
  function determinant(m) { return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]); }
  function triangleShellClosed(triangles) {
    const edges = new Map();
    for (const triangle of triangles) for (let i = 0; i < 3; i++) { const a = triangle[i], b = triangle[(i + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b), value = edges.get(key) || [0, 0]; value[0]++; value[1] += a < b ? 1 : -1; edges.set(key, value); }
    return edges.size > 0 && [...edges.values()].every(([count, direction]) => count === 2 && direction === 0);
  }
  function objects(doc) {
    if (!doc.scene || doc.scene.validate().length) throw new Error('La escena debe ser válida antes de exportar.');
    const out = [];
    function visit(def, matrix, node, path) {
      const territory = node && node.metadata && node.metadata.territory || def.metadata && def.metadata.territory || {};
      if (def.model.faces.size || def.model.edges.size) out.push({ id: node ? node.id : def.id, name: node ? node.name : def.name, definitionId: def.id, path: path.slice(), matrix: matrix.slice(), model: def.model, metadata: clone(node && node.metadata || def.metadata || {}), role: territory.role || 'native-geometry' });
      for (const child of def.nodes) visit(doc.scene.definitions.get(child.definitionId), M.multiply(matrix, child.matrix), child, [...path, child.id]);
    }
    visit(doc.scene.current([]), M.identity(), null, []); return out;
  }
  function manifest(doc) {
    const territories = doc.scene.current([]).nodes.filter(n => n.metadata && n.metadata.territory && n.metadata.territory.role === 'territory');
    return territories.map(n => ({ nodeId: n.id, name: n.name, ...clone(n.metadata.territory) }));
  }
  function jsonPackage(doc) {
    return { format: 'dedalo.territory-package', version: 1, units: 'm', application: 'Dédalo', appVersion: D.VERSION || '0.5.0', georeference: clone(doc.scene.georeference || null),
      territories: manifest(doc), note: 'Geometría nativa editable; las alturas inferidas y los símbolos vegetales conservan su procedencia. Intercambio IFC4 público disponible por separado.', native: doc.fileJSON() };
  }
  function ifc(doc, options) {
    options = options || {}; const entries = [], ref = id => '#' + id, list = values => '(' + values.join(',') + ')';
    const add = (type, args) => { const id = entries.length + 1; entries.push('#' + id + '=' + type + '(' + args.join(',') + ');'); return id; };
    const point = p => add('IFCCARTESIANPOINT', [list(p.map(real))]);
    const origin = point([0, 0, 0]), zdir = add('IFCDIRECTION', ['(0.,0.,1.)']), xdir = add('IFCDIRECTION', ['(1.,0.,0.)']);
    const axis = add('IFCAXIS2PLACEMENT3D', [ref(origin), ref(zdir), ref(xdir)]), placement = add('IFCLOCALPLACEMENT', ['$', ref(axis)]);
    const context = add('IFCGEOMETRICREPRESENTATIONCONTEXT', ['$', string('Model'), '3', '0.000001', ref(axis), '$']);
    const metre = add('IFCSIUNIT', ['*', '.LENGTHUNIT.', '$', '.METRE.']), area = add('IFCSIUNIT', ['*', '.AREAUNIT.', '$', '.SQUARE_METRE.']), volume = add('IFCSIUNIT', ['*', '.VOLUMEUNIT.', '$', '.CUBIC_METRE.']);
    const units = add('IFCUNITASSIGNMENT', [list([metre, area, volume].map(ref))]);
    const project = add('IFCPROJECT', [string(guid(doc.projectId)), '$', string(doc.name || 'Territorio'), string('Intercambio geométrico IFC4 de Dédalo; fuentes y calidades en propiedades.'), '$', '$', '$', list([ref(context)]), ref(units)]);
    const site = add('IFCSITE', [string(guid(occurrenceId(doc.scene.rootId, ['dedalo-ifc-site']))), '$', string('Territorio'), '$', '$', ref(placement), '$', '$', '.ELEMENT.', '$', '$', '$', '$', '$']);
    add('IFCRELAGGREGATES', [string(guid(D.uuid())), '$', '$', '$', ref(project), list([ref(site)])]);
    const georef = doc.scene.georeference;
    if (georef) {
      const info = D.Territory.crsInfo(georef.crs), crs = add('IFCPROJECTEDCRS', [string(info.crs), string(georef.horizontalTransform || ''), string(info.datum), string(georef.verticalDatum || 'not-provided'), string('Transverse Mercator'), string(info.zone + 'N'), ref(metre)]);
      add('IFCMAPCONVERSION', [ref(context), ref(crs), ...georef.origin.map(real), '1.', '0.', '1.']);
    }
    function pset(product, name, values) {
      const properties = Object.entries(values).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => {
        let nominal;
        if (typeof value === 'boolean') nominal = 'IFCBOOLEAN(' + (value ? '.T.' : '.F.') + ')';
        else if (typeof value === 'number') nominal = 'IFCREAL(' + real(value) + ')';
        else nominal = 'IFCTEXT(' + string(typeof value === 'string' ? value : JSON.stringify(value)) + ')';
        return add('IFCPROPERTYSINGLEVALUE', [string(key), '$', nominal, '$']);
      });
      if (!properties.length) return;
      const definition = add('IFCPROPERTYSET', [string(guid(D.uuid())), '$', string(name), '$', list(properties.map(ref))]);
      add('IFCRELDEFINESBYPROPERTIES', [string(guid(D.uuid())), '$', '$', '$', list([ref(product)]), ref(definition)]);
    }
    pset(site, 'Dedalo_Georeference', { Units: 'm', Georeference: georef || {}, Sources: manifest(doc).map(t => t.sources), Warnings: manifest(doc).map(t => t.warnings), Exchange: 'IFC4 public schema; HEFESTO application import not validated' });
    const products = [];
    const allObjects = objects(doc), identityCounts = new Map(); for (const item of allObjects) identityCounts.set(item.id, (identityCounts.get(item.id) || 0) + 1);
    for (const item of allObjects) {
      const model = item.model, representation = [], ids = new Map(), positions = [];
      for (const vertex of model.verts.values()) { ids.set(vertex.id, positions.length + 1); positions.push(M.point(item.matrix, vertex.p)); }
      const triangles = [], colors = [], reflected = determinant(item.matrix) < 0;
      for (const face of model.faces.values()) for (const raw of model.faceTriangles(face.id)) {
        const tri = raw.map(id => ids.get(id)); if (reflected) [tri[1], tri[2]] = [tri[2], tri[1]]; triangles.push(tri);
        const material = model.materials.get(face.mat); colors.push(material && /^#[0-9a-f]{6}$/i.test(material.color) ? material.color.toLowerCase() : '#f4f3ef');
      }
      if (triangles.length) {
        const coordinates = add('IFCCARTESIANPOINTLIST3D', [list(positions.map(p => list(p.map(real))))]);
        const closed = item.role !== 'tree' && model.isClosed([...model.faces.keys()]) && triangleShellClosed(triangles);
        const faceSet = add('IFCTRIANGULATEDFACESET', [ref(coordinates), '$', closed ? '.T.' : '.F.', list(triangles.map(t => list(t.map(String)))), '$']);
        const palette = [...new Set(colors)], rgb = palette.map(color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255));
        const colourList = add('IFCCOLOURRGBLIST', [list(rgb.map(p => list(p.map(real))))]);
        add('IFCINDEXEDCOLOURMAP', [ref(faceSet), '1.', ref(colourList), list(colors.map(color => String(palette.indexOf(color) + 1)))]);
        representation.push(add('IFCSHAPEREPRESENTATION', [ref(context), string('Body'), string('Tessellation'), list([ref(faceSet)])]));
      }
      const curves = [], points = new Map();
      const pointRef = id => { if (!points.has(id)) points.set(id, point(positions[ids.get(id) - 1])); return ref(points.get(id)); };
      for (const edge of model.edges.values()) if (!model.eFaces.get(edge.id).size) curves.push(add('IFCPOLYLINE', [list([pointRef(edge.a), pointRef(edge.b)])]));
      if (curves.length) representation.push(add('IFCSHAPEREPRESENTATION', [ref(context), string('Annotation'), string('Curve3D'), list(curves.map(ref))]));
      if (!representation.length) continue;
      const productGuid = guid(identityCounts.get(item.id) > 1 ? occurrenceId(item.id, item.path) : item.id);
      const shape = add('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', list(representation.map(ref))]), description = string('Dédalo node ' + item.id + '; role ' + item.role), base = [string(productGuid), '$', string(item.name), description, string(item.role), ref(placement), ref(shape)];
      let product;
      if (['terrain', 'tree'].includes(item.role)) product = add('IFCGEOGRAPHICELEMENT', [...base, string(item.id), item.role === 'terrain' ? '.TERRAIN.' : '.USERDEFINED.']);
      else if (!triangles.length) product = add('IFCANNOTATION', base);
      else product = add('IFCBUILDINGELEMENTPROXY', [...base, string(item.id), '.NOTDEFINED.']);
      products.push(product);
      const provenance = item.metadata.territory || {};
      pset(product, 'Dedalo_Territory', { NodeUUID: item.id, DefinitionUUID: item.definitionId, HierarchyPath: item.path, Role: item.role, SourceId: provenance.sourceId, FeatureId: provenance.featureId,
        HeightValue: provenance.height && provenance.height.value, HeightQuality: provenance.height && provenance.height.kind, BaseElevation: provenance.base, SourceProperties: provenance.properties, Provenance: provenance,
        GeometryStatus: item.role === 'tree' ? 'symbolic vegetation; position from source' : 'current editable native geometry; source attributes retain their original provenance' });
    }
    if (!products.length) throw new Error('No hay geometría para exportar.');
    add('IFCRELCONTAINEDINSPATIALSTRUCTURE', [string(guid(D.uuid())), '$', '$', '$', list(products.map(ref)), ref(site)]);
    const date = options.timestamp || new Date().toISOString();
    return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((" + string('Dédalo IFC4 geometric exchange') + "),'2;1');\nFILE_NAME(" + string((doc.name || 'Territorio') + '.ifc') + ',' + string(date) + ',(' + string('Dédalo') + "),('HEFESTOLAB')," + string('Dédalo IFC4 exporter') + ',' + string('Dédalo') + ",'');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n" + entries.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
  }
  D.TerritoryExport = { ifc, jsonPackage, objects, guid };
})(typeof window !== 'undefined' ? window : globalThis);
