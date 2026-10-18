/* Dédalo — consultas públicas acotadas y normalización GIS, sin geometría inventada. */
(function (root) {
  'use strict';
  const D = root.DEDALO = root.DEDALO || {};
  const MAX_AREA_M2 = 1000000, MAX_GML = 16 * 1024 * 1024;
  const ENDPOINTS = Object.freeze({
    parcels: 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx',
    buildings: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx',
    terrain: 'https://servicios.idee.es/wcs-inspire/mdt',
    candidates: 'https://www.cartociudad.es/geocoder/api/geocoder/candidates',
    find: 'https://www.cartociudad.es/geocoder/api/geocoder/find',
    osm: 'https://overpass-api.de/api/interpreter'
  });
  const LICENSES = Object.freeze({
    catastro: 'https://datos.gob.es/es/catalogo/e0dat0002-spanish-general-directorate-for-cadastre-cadastral-parcel-inspire-download-service-wfs1',
    catastroBuildings: 'https://datos.gob.es/en/catalogo/e0dat0002-spanish-general-directorate-for-cadastre-building-inspire-download-service-wfs1',
    catastroLegacy: 'https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf',
    ign: 'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf',
    osm: 'https://www.openstreetmap.org/copyright'
  });
  function error(message, code) { const e = new Error(message); e.code = code || 'TERRITORY_DATA'; return e; }
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function validateBBox(value) {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(finite)) throw error('BBox debe ser [oeste,sur,este,norte] numérica.', 'BBOX');
    const [w, s, e, n] = value;
    if (w >= e || s >= n || w < -18.3 || e > 4.5 || s < 27.5 || n > 43.9) throw error('Selecciona una zona pequeña dentro de España.', 'BBOX');
    const r = Math.PI / 180, area = 6371008.8 ** 2 * (e - w) * r * (Math.sin(n * r) - Math.sin(s * r));
    const widthM = (e - w) * 111195.0802 * Math.cos((s + n) * r / 2), heightM = (n - s) * 111195.0802;
    if (area > MAX_AREA_M2 + 0.01 || widthM > 1100 || heightM > 1100) throw error('La selección admite como máximo 1 km² y 1,1 km por lado. Reduce el área.', 'AREA_LIMIT');
    return { bbox: value.slice(), areaM2: area, widthM, heightM };
  }
  function bboxAround(lon, lat, widthM, heightM) {
    widthM = widthM == null ? 600 : Number(widthM); heightM = heightM == null ? widthM : Number(heightM);
    if (![lon, lat, widthM, heightM].every(finite) || widthM <= 0 || heightM <= 0) throw error('Centro y dimensiones inválidos.', 'BBOX');
    const dx = widthM / (2 * 111195.0802 * Math.cos(lat * Math.PI / 180)), dy = heightM / (2 * 111195.0802);
    const bbox = [lon - dx, lat - dy, lon + dx, lat + dy]; validateBBox(bbox); return bbox;
  }
  function plainTags(tags) {
    const out = {}; for (const [k, v] of Object.entries(tags || {})) if (typeof v === 'string' && k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = v.slice(0, 1000); return out;
  }
  function url(base, params) { const u = new URL(base); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v)); return u.href; }
  function buildRequest(desc) {
    if (!desc || typeof desc.operation !== 'string') throw error('Operación GIS inválida.');
    const op = desc.operation;
    if (op === 'address.candidates' || op === 'address.find') {
      const query = String(desc.query || '').trim();
      if (query.length < 3 || query.length > 200) throw error('Introduce una dirección o referencia de 3 a 200 caracteres.', 'QUERY');
      const params = { q: query };
      if (op === 'address.candidates') params.limit = 5;
      else {
        if (!/^[\w.-]{1,80}$/.test(String(desc.id || '')) || !/^[a-zA-Z_]{1,40}$/.test(String(desc.type || ''))) throw error('Candidato de dirección inválido.', 'QUERY');
        params.id = desc.id; params.type = desc.type;
      }
      return { url: url(op === 'address.find' ? ENDPOINTS.find : ENDPOINTS.candidates, params), method: 'GET', format: 'json', maxBytes: 2 * 1024 * 1024,
        source: { provider: 'IGN / CNIG — CartoCiudad', crs: 'EPSG:4326', attribution: 'Direcciones y geocodificación: CartoCiudad (IGN/CNIG y fuentes colaboradoras)' } };
    }
    const b = validateBBox(desc.bbox).bbox, [w, s, e, n] = b;
    if (op === 'catastro.parcels' || op === 'catastro.buildings') {
      return { url: url(op === 'catastro.parcels' ? ENDPOINTS.parcels : ENDPOINTS.buildings, {
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: op === 'catastro.parcels' ? 'CP.CadastralParcel' : 'BU.BuildingPart',
        srsName: 'EPSG:4326', bbox: [s, w, n, e, 'urn:ogc:def:crs:EPSG::4326'].join(','), count: 5000
      }), method: 'GET', format: 'gml', maxBytes: MAX_GML,
      source: { provider: 'Dirección General del Catastro', crs: 'EPSG:4326', attribution: 'Dirección General del Catastro — INSPIRE' } };
    }
    if (op === 'ign.terrain') return { url: url(ENDPOINTS.terrain, { service: 'WCS', version: '1.0.0', request: 'GetCoverage', coverage: 'Elevacion4258_5',
      bbox: b.join(','), crs: 'EPSG:4258', interpolationMethod: 'bilinear', format: 'ArcGrid', width: 33, height: 33 }), method: 'GET', format: 'ascii-grid', maxBytes: 1024 * 1024,
      source: { provider: 'IGN / CNIG — MDT05', crs: 'EPSG:4258', attribution: 'Obra derivada de MDT05 © Instituto Geográfico Nacional de España / CNIG — CC BY 4.0' } };
    if (op === 'osm.trees' || op === 'osm.context') {
      const bb = [s, w, n, e].join(','), selectors = op === 'osm.trees' ? ['node["natural"="tree"]'] :
        ['way["natural"="wood"]', 'way["landuse"="forest"]', 'way["leisure"="park"]', 'way["highway"]', 'way["waterway"]', 'way["natural"="water"]'];
      const query = '[out:json][timeout:20][maxsize:16777216];(' + selectors.map(q => q + '(' + bb + ');').join('') + ');out geom;';
      return { url: ENDPOINTS.osm, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query),
        format: 'json', maxBytes: 2 * 1024 * 1024, source: { provider: 'OpenStreetMap / Overpass API', crs: 'EPSG:4326', attribution: '© OpenStreetMap contributors — ODbL' } };
    }
    throw error('Operación GIS no permitida: ' + op, 'OPERATION');
  }
  // A bounded XML tree is used in browsers and CPU tests alike. No DTD/entities/network resolution.
  function parseXML(input) {
    if (typeof input !== 'string' || !input.trim() || input.length > MAX_GML) throw error('XML vacío o demasiado grande.', 'XML');
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(input)) throw error('DTD y entidades externas no permitidas.', 'XML');
    function decode(t) { return t.replace(/&([^;]+);/g, (_, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (Object.prototype.hasOwnProperty.call(named, entity)) return named[entity];
      if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) { const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : +entity.slice(1); if (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) return String.fromCodePoint(n); }
      throw error('Entidad XML no permitida.', 'XML');
    }); }
    const doc = { name: '#document', local: '#document', attrs: {}, children: [], text: '', parent: null }, stack = [doc];
    input = input.replace(/^\uFEFF/, '');
    const tokens = input.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g) || [];
    if (tokens.join('') !== input) throw error('XML mal formado.', 'XML');
    let nodes = 0;
    for (const token of tokens) {
      const top = stack[stack.length - 1];
      if (token.startsWith('<!--') || token.startsWith('<?')) continue;
      if (token.startsWith('<![CDATA[')) { top.text += token.slice(9, -3); continue; }
      if (token.startsWith('</')) { if (stack.length === 1 || top.name !== token.slice(2, -1).trim()) throw error('XML con etiquetas desparejadas.', 'XML'); stack.pop(); continue; }
      if (token.startsWith('<')) {
        const match = /^<([\w:.-]+)([\s\S]*?)(\/?)>$/.exec(token); if (!match) throw error('Etiqueta XML inválida.', 'XML');
        if (++nodes > 250000 || stack.length > 64) throw error('XML demasiado complejo.', 'XML');
        const attrs = {}, rest = match[2], re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m, end = 0, count = 0;
        while ((m = re.exec(rest))) {
          if (rest.slice(end, m.index).trim() || ++count > 100 || Object.prototype.hasOwnProperty.call(attrs, m[1])) throw error('Atributos XML inválidos.', 'XML');
          Object.defineProperty(attrs, m[1], { value: decode(m[2] == null ? m[3] : m[2]), enumerable: true }); end = re.lastIndex;
        }
        if (rest.slice(end).trim()) throw error('Atributos XML inválidos.', 'XML');
        const node = { name: match[1], local: match[1].split(':').pop(), attrs, children: [], text: '', parent: top }; top.children.push(node);
        if (!match[3]) stack.push(node);
      } else { if (top === doc && token.trim()) throw error('Texto fuera del documento XML.', 'XML'); top.text += decode(token); }
    }
    if (stack.length !== 1 || doc.children.length !== 1) throw error('Documento XML incompleto.', 'XML');
    return doc.children[0];
  }
  function descendants(node, local) { const out = []; function walk(n) { if (n.local === local) out.push(n); for (const child of n.children) walk(child); } walk(node); return out; }
  function first(node, local) { if (node.local === local) return node; for (const child of node.children) { const result = first(child, local); if (result) return result; } return null; }
  function value(node) { return node ? (node.text + node.children.map(value).join('')).trim() : ''; }
  function attr(node, local) { if (!node) return null; for (const key of Object.keys(node.attrs)) if (key.split(':').pop() === local) return node.attrs[key]; return null; }
  function numeric(node, name, integer) {
    const n = first(node, name); if (!n || attr(n, 'nil') === 'true' || value(n) === '') return null;
    const v = Number(value(n)); return Number.isFinite(v) && (!integer || Number.isInteger(v)) ? v : null;
  }
  function inherited(node, name) { while (node) { const a = attr(node, name); if (a != null) return a; node = node.parent; } return null; }
  function inverseUTM(x, y, zone) {
    const a = 6378137, e2 = 0.0066943800229, ep = e2 / (1 - e2), k = 0.9996;
    const mu = y / k / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + 151 * e1 ** 3 / 96 * Math.sin(6 * mu) + 1097 * e1 ** 4 / 512 * Math.sin(8 * mu);
    const n = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), t = Math.tan(p) ** 2, c = ep * Math.cos(p) ** 2, rr = a * (1 - e2) / (1 - e2 * Math.sin(p) ** 2) ** 1.5, dd = (x - 500000) / k / n;
    const lat = p - n * Math.tan(p) / rr * (dd ** 2 / 2 - (5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * ep) * dd ** 4 / 24 + (61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * ep - 3 * c ** 2) * dd ** 6 / 720);
    const lon = (dd - (1 + 2 * t + c) * dd ** 3 / 6 + (5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * ep + 24 * t ** 2) * dd ** 5 / 120) / Math.cos(p);
    return [zone * 6 - 183 + lon * 180 / Math.PI, lat * 180 / Math.PI];
  }
  function coordinate(pair, crs, axisOrder) {
    if (!pair.slice(0, 2).every(finite)) throw error('Coordenada no numérica.', 'GML');
    const label = String(crs || ''), code = label.match(/(?:EPSG(?::|\/|::|\/0\/)+)(\d+)$/i), epsg = code ? +code[1] : null; let out;
    if (/CRS:?84/i.test(label)) out = pair.slice(0, 2);
    else if (epsg === 4326 || epsg === 4258) out = axisOrder === 'xy' ? pair.slice(0, 2) : [pair[1], pair[0]];
    else if (epsg === 3857) out = [pair[0] / 6378137 * 180 / Math.PI, (2 * Math.atan(Math.exp(pair[1] / 6378137)) - Math.PI / 2) * 180 / Math.PI];
    else if ((epsg >= 25828 && epsg <= 25831) || (epsg >= 32628 && epsg <= 32631) || epsg === 4083) out = inverseUTM(pair[0], pair[1], epsg === 4083 ? 28 : epsg % 100);
    else throw error('CRS GML no soportado: ' + label, 'CRS');
    if (Math.abs(out[0]) > 180 || Math.abs(out[1]) > 90) throw error('Coordenada fuera del mundo.', 'GML');
    return out;
  }
  function ring(node, options) {
    const list = first(node, 'posList'), points = [];
    if (list) {
      const numbers = value(list).split(/\s+/).map(Number), dim = +(inherited(list, 'srsDimension') || 2), crs = inherited(list, 'srsName') || options.sourceCRS;
      if (![2, 3].includes(dim) || numbers.length % dim || numbers.length < dim * 3 || !numbers.every(finite)) throw error('Anillo GML inválido.', 'GML');
      const count = attr(list, 'count'); if (count != null && +count !== numbers.length / dim) throw error('Conteo GML posList incorrecto.', 'GML');
      for (let i = 0; i < numbers.length; i += dim) points.push(coordinate(numbers.slice(i, i + dim), crs, options.axisOrder));
    } else {
      for (const p of descendants(node, 'pos')) points.push(coordinate(value(p).split(/\s+/).map(Number), inherited(p, 'srsName') || options.sourceCRS, options.axisOrder));
    }
    const clean = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
    if (clean.length < 3) throw error('Anillo sin tres vértices distintos.', 'GML');
    if (clean[0][0] !== clean[clean.length - 1][0] || clean[0][1] !== clean[clean.length - 1][1]) clean.push(clean[0].slice());
    if (clean.length < 4) throw error('Anillo degenerado.', 'GML'); return clean;
  }
  function geometry(node, options) {
    let patches = descendants(node, 'PolygonPatch'); if (!patches.length) patches = descendants(node, 'Polygon');
    const polygons = patches.map(patch => {
      const exterior = patch.children.find(n => n.local === 'exterior') || first(patch, 'outerBoundaryIs');
      if (!exterior) throw error('Polígono sin contorno exterior.', 'GML');
      return [ring(exterior, options), ...patch.children.filter(n => n.local === 'interior' || n.local === 'innerBoundaryIs').map(n => ring(n, options))];
    });
    if (!polygons.length) throw error('No hay huella poligonal en la entidad.', 'GML');
    return polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
  }
  function parseGML(input, options) {
    options = options || {}; const doc = parseXML(input), warnings = [];
    const exception = first(doc, 'ExceptionText') || first(doc, 'ServiceException');
    if (exception || /ExceptionReport|ServiceExceptionReport/.test(doc.local)) throw error('El servicio GIS respondió: ' + value(exception || doc).slice(0, 500), 'PROVIDER');
    if (doc.local !== 'FeatureCollection') throw error('Se esperaba un FeatureCollection GML.', 'GML');
    const kind = options.featureType || (descendants(doc, 'BuildingPart').length ? 'BuildingPart' : 'CadastralParcel'), nodes = descendants(doc, kind);
    if (nodes.length > 5000) throw error('Respuesta WFS supera 5000 entidades.', 'TRUNCATED');
    const sourceId = options.sourceId || (kind === 'BuildingPart' ? 'catastro-buildings' : 'catastro-parcels'), features = [], sourceCRSs = new Set();
    for (const node of nodes) {
      try {
        const id = attr(node, 'id') || value(first(node, 'localId')); if (!id) throw error('Entidad sin identificador.', 'GML');
        const localId = value(first(node, 'localId')), ref = value(first(node, 'nationalCadastralReference')) || (localId.match(/^([0-9A-Z]{14})(?:_|$)/) || [])[1] || null;
        const properties = { nationalCadastralReference: ref, beginLifespanVersion: value(first(node, 'beginLifespanVersion')) || null };
        if (kind === 'BuildingPart') {
          properties.numberOfFloorsAboveGround = numeric(node, 'numberOfFloorsAboveGround', true);
          properties.numberOfFloorsBelowGround = numeric(node, 'numberOfFloorsBelowGround', true);
          properties.heightBelowGround = numeric(node, 'heightBelowGround');
          properties.floors = properties.numberOfFloorsAboveGround;
          properties.horizontalGeometryEstimatedAccuracy = numeric(node, 'horizontalGeometryEstimatedAccuracy');
          properties.heightEvidence = 'No measured above-ground height; storeys are cadastral attributes. Any extrusion from storeys is estimated.';
        } else properties.areaValue = numeric(node, 'areaValue');
        const g = first(node, 'geometry'); if (!g) throw error('Entidad sin geometría.', 'GML');
        for (const p of descendants(g, 'posList')) sourceCRSs.add(inherited(p, 'srsName') || options.sourceCRS || 'unknown');
        features.push({ type: 'Feature', id, geometry: geometry(g, options), properties, sourceId });
      } catch (e) { warnings.push('Entidad ' + (attr(node, 'id') || '?') + ' omitida: ' + e.message); }
    }
    if (nodes.length && !features.length) throw error('Ninguna entidad WFS tiene geometría válida. ' + warnings.slice(0, 2).join(' '), 'GML');
    const count = name => { const v = attr(doc, name); return v != null && /^\d+$/.test(v) ? +v : null; };
    const numberMatched = count('numberMatched'), numberReturned = count('numberReturned');
    const countMismatch = numberReturned != null && numberReturned !== nodes.length;
    if (countMismatch) warnings.push('El contador WFS declara ' + numberReturned + ' entidades pero el XML contiene ' + nodes.length + ' de tipo ' + kind + '. Comprueba la respuesta o reduce el área.');
    const truncated = (numberMatched != null && numberMatched > (numberReturned == null ? nodes.length : numberReturned)) || !!attr(doc, 'next') || nodes.length >= 5000;
    if (truncated) warnings.push('La respuesta WFS está truncada o alcanza el límite de 5000 entidades. Reduce el área.');
    return { features, warnings, crs: 'EPSG:4326', sourceCRSs: [...sourceCRSs], numberMatched, numberReturned, truncated, countMismatch, skipped: nodes.length - features.length };
  }
  function parseElevationASCII(input, options) {
    options = options || {};
    if (typeof input !== 'string' || input.length > 1024 * 1024) throw error('Malla ASCII demasiado grande.', 'TERRAIN');
    if (/^\s*</.test(input)) { const doc = parseXML(input); throw error('El servicio MDT respondió: ' + value(first(doc, 'ExceptionText') || first(doc, 'ServiceException') || doc).slice(0, 400), 'PROVIDER'); }
    const lines = input.trim().split(/\r?\n/), header = {}, data = []; let inData = false;
    const allowed = new Set(['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'dx', 'dy', 'nodata_value']);
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/), key = parts[0].toLowerCase();
      if (!inData && allowed.has(key)) { if (parts.length !== 2 || !Number.isFinite(+parts[1]) || header[key] != null) throw error('Cabecera ArcGrid inválida.', 'TERRAIN'); header[key] = +parts[1]; }
      else { inData = true; data.push(...parts.map(Number)); }
    }
    const cols = header.ncols, rows = header.nrows, dx = header.dx == null ? header.cellsize : header.dx, dy = header.dy == null ? header.cellsize : header.dy;
    const xc = header.xllcorner == null ? header.xllcenter - dx / 2 : header.xllcorner, yc = header.yllcorner == null ? header.yllcenter - dy / 2 : header.yllcorner;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 1024 || rows > 1024 || ![xc, yc, dx, dy].every(finite) || dx <= 0 || dy <= 0 || data.length !== cols * rows || !data.every(finite)) throw error('Dimensiones o valores ArcGrid inválidos.', 'TERRAIN');
    const crs = options.crs || 'EPSG:4258'; if (crs !== 'EPSG:4258' && crs !== 'EPSG:4326') throw error('Se requiere terreno geográfico EPSG4258/4326.', 'CRS');
    const grid = []; let validCount = 0;
    for (let r = 0; r < rows; r++) { const row = data.slice(r * cols, (r + 1) * cols).map(v => v === header.nodata_value || v < -12000 || v > 10000 ? null : v); validCount += row.filter(v => v != null).length; grid.push(row); }
    if (!validCount) throw error('MDT sin cotas válidas en esta selección.', 'NO_TERRAIN');
    return { bbox: [xc + dx / 2, yc + dy / 2, xc + (cols - 0.5) * dx, yc + (rows - 0.5) * dy], coverageBBox: [xc, yc, xc + cols * dx, yc + rows * dy],
      crs: 'EPSG:4326', originalCRS: crs, rows, cols, grid, rowOrder: 'north-to-south', cellSize: [dx, dy], nodata: null, validCount,
      verticalDatum: 'Altitudes ortométricas, fuente MDT05 IGN; no es un levantamiento de la parcela.', sourceId: 'ign-terrain',
      resampling: 'Bilinear por el WCS IGN; malla solicitada 33×33, no equivale a detalle nuevo de 5 m.' };
  }
  // Liang–Barsky clips each segment without connecting separated pieces outside the selection.
  function clipLine(coords, bbox) {
    if (!bbox) return [coords]; const pieces = []; let current = [];
    function flush() { if (current.length >= 2) pieces.push(current); current = []; }
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i], dx = b[0] - a[0], dy = b[1] - a[1]; let lo = 0, hi = 1, valid = true;
      const ps = [-dx, dx, -dy, dy], qs = [a[0] - bbox[0], bbox[2] - a[0], a[1] - bbox[1], bbox[3] - a[1]];
      for (let j = 0; j < 4; j++) { if (ps[j] === 0) { if (qs[j] < 0) valid = false; } else { const t = qs[j] / ps[j]; if (ps[j] < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t); } }
      if (!valid || lo >= hi) { flush(); continue; }
      const start = [a[0] + lo * dx, a[1] + lo * dy], end = [a[0] + hi * dx, a[1] + hi * dy];
      if (!current.length || Math.abs(current[current.length - 1][0] - start[0]) > 1e-10 || Math.abs(current[current.length - 1][1] - start[1]) > 1e-10) { flush(); current.push(start); }
      current.push(end); if (hi < 1) flush();
    }
    flush(); return pieces;
  }
  function parseOverpass(input, options) {
    options = options || {}; const json = typeof input === 'string' ? JSON.parse(input) : input;
    if (!json || !Array.isArray(json.elements) || json.elements.length > 4000) throw error('Respuesta Overpass inválida o demasiado grande. Reduce el área.', 'OSM');
    const out = { trees: [], vegetationAreas: [], roads: [], waterways: [], waterAreas: [], warnings: [], timestamp: json.osm3s && json.osm3s.timestamp_osm_base || null };
    if (json.remark) throw error('Overpass no completó la consulta: ' + String(json.remark).slice(0, 500), 'PROVIDER');
    const inside = (lon, lat) => !options.bbox || (lon >= options.bbox[0] && lon <= options.bbox[2] && lat >= options.bbox[1] && lat <= options.bbox[3]);
    for (const el of json.elements) {
      const tags = plainTags(el.tags), id = 'osm/' + el.type + '/' + el.id;
      if (el.type === 'node' && tags.natural === 'tree' && finite(el.lon) && finite(el.lat) && inside(el.lon, el.lat)) { out.trees.push({ id, lon: el.lon, lat: el.lat, tags, sourceId: 'osm-trees' }); continue; }
      if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
      const coords = el.geometry.map(p => [p.lon, p.lat]);
      if (coords.length < 2 || !coords.every(p => p.every(finite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) { out.warnings.push('Vía OSM incompleta omitida: ' + id); continue; }
      const feature = (type, points, suffix) => ({ type: 'Feature', id: id + (suffix || ''), geometry: { type, coordinates: type === 'Polygon' ? [points || coords] : points || coords }, properties: { tags, evidence: type === 'LineString' && options.bbox ? 'OpenStreetMap mapped line clipped to the selected bbox; completeness and accuracy vary.' : 'OpenStreetMap observed mapping; completeness and accuracy vary.' }, sourceId: 'osm-context' });
      const closed = coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
      if (closed && (tags.natural === 'wood' || tags.landuse === 'forest' || tags.leisure === 'park' || tags.natural === 'water')) {
        const bounds = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of coords) { bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]); bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]); }
        const width = (bounds[2] - bounds[0]) * 111195.0802 * Math.cos((bounds[1] + bounds[3]) * Math.PI / 360), height = (bounds[3] - bounds[1]) * 111195.0802;
        if (width > 2000 || height > 2000 || width * height > 1000000) out.warnings.push('Área OSM extensa omitida para conservar una importación local: ' + id);
        else {
          const f = feature('Polygon'); f.properties.originalBBox = bounds;
          if (options.bbox && (bounds[0] < options.bbox[0] || bounds[1] < options.bbox[1] || bounds[2] > options.bbox[2] || bounds[3] > options.bbox[3])) out.warnings.push('El contorno OSM ' + id + ' se conserva íntegro y se extiende fuera de la selección.');
          out[tags.natural === 'water' ? 'waterAreas' : 'vegetationAreas'].push(f);
        }
      }
      const segments = clipLine(coords, options.bbox);
      if (tags.highway && tags.area !== 'yes') for (let i = 0; i < segments.length; i++) { const f = feature('LineString', segments[i], segments.length > 1 ? '#segment-' + i : ''), width = tags.width && /^\d+(?:\.\d+)?(?:\s*m)?$/.test(tags.width) ? parseFloat(tags.width) : null; if (width > 0 && width < 100) f.properties.width = width; out.roads.push(f); }
      if (tags.waterway && tags.area !== 'yes') for (let i = 0; i < segments.length; i++) out.waterways.push(feature('LineString', segments[i], segments.length > 1 ? '#segment-' + i : ''));
    }
    return out;
  }
  function sourceRecord(op, response, request) {
    const fixed = buildRequest(request), s = Object.assign({}, fixed.source, response.source || {}), catastro = op.startsWith('catastro.'), osm = op.startsWith('osm.');
    return { id: op.replace('.', '-'), operation: op, title: s.provider, url: s.url || fixed.url, crs: s.crs, attribution: s.attribution,
      license: osm ? 'ODbL 1.0 — OpenStreetMap contributors' : catastro ? 'CC BY 4.0 según catálogo HVD datos.gob.es; consultar también condiciones DGC enlazadas' : 'CC BY 4.0 — condiciones de reutilización IGN/CNIG',
      licenseURL: osm ? LICENSES.osm : catastro ? op === 'catastro.buildings' ? LICENSES.catastroBuildings : LICENSES.catastro : LICENSES.ign,
      legacyLicenseURL: catastro ? LICENSES.catastroLegacy : null,
      licenseNote: catastro ? 'El catálogo HVD indica CC BY 4.0 y el portal mantiene una licencia histórica con restricciones distintas. Se conservan ambas referencias; revisar el uso de redistribución previsto.' : null,
      retrievedAt: response.retrievedAt || new Date().toISOString(), cached: !!response.cached, request: Object.assign({}, request),
      evidence: osm ? 'Solo objetos cartografiados; una respuesta vacía no acredita ausencia de árboles, vías o agua.' : catastro ? 'Huellas y atributos catastrales; no alturas de fachadas/tejados medidas ni propietarios. DGC no cubre Navarra ni País Vasco.' : op === 'ign.terrain' ? 'MDT del terreno; no superficie de tejados ni árboles.' : 'Resultado de geocodificación oficial; confirmar el candidato antes de consultar geometría.' };
  }
  async function directRequest(desc, options) {
    const spec = buildRequest(desc), fetcher = options.fetch || root.fetch;
    if (typeof fetcher !== 'function') throw error('No hay transporte de red. Usa el conector local o una web con acceso a los servicios.', 'NETWORK');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null, abort = () => { if (controller) controller.abort(); };
    if (options.signal && options.signal.aborted) throw error('Consulta cancelada.', 'ABORTED');
    if (options.signal) options.signal.addEventListener('abort', abort, { once: true });
    const timer = controller ? setTimeout(abort, 45000) : null;
    try {
      const headers = Object.assign({ Accept: spec.format === 'json' ? 'application/json' : 'text/plain, application/xml' }, spec.headers);
      if (typeof window === 'undefined') headers['User-Agent'] = 'DEDALO/' + (D.VERSION || '0.5.0') + ' (HEFESTOLAB; small public geodata query)';
      const r = await fetcher(spec.url, { method: spec.method, headers, body: spec.body, signal: controller ? controller.signal : options.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw error('El servicio respondió HTTP ' + r.status + '.', 'HTTP');
      if (+(r.headers && r.headers.get('content-length') || 0) > spec.maxBytes) throw error('Respuesta GIS demasiado grande.', 'SIZE');
      let text;
      if (r.body && typeof r.body.getReader === 'function') {
        const reader = r.body.getReader(), parts = []; let length = 0;
        try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > spec.maxBytes) { await reader.cancel(); throw error('Respuesta GIS demasiado grande.', 'SIZE'); } parts.push(part.value); } }
        finally { reader.releaseLock(); }
        const bytes = new Uint8Array(length); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.byteLength; }
        const declaration = new TextDecoder('utf-8').decode(bytes.subarray(0, 150));
        text = new TextDecoder(/encoding=["'](?:ISO-8859-1|windows-1252)["']/i.test(declaration) ? 'windows-1252' : 'utf-8').decode(bytes);
      } else text = await r.text();
      if (text.length > spec.maxBytes) throw error('Respuesta GIS demasiado grande.', 'SIZE');
      return { ok: true, operation: desc.operation, format: spec.format, text, source: Object.assign({ url: spec.url }, spec.source), cached: false };
    } catch (e) {
      if (options.signal && options.signal.aborted) throw error('Consulta cancelada.', 'ABORTED');
      if (e.name === 'AbortError') throw error('El servicio tardó demasiado. Vuelve a intentarlo con una zona menor.', 'TIMEOUT');
      if (!e.code && e instanceof TypeError) throw error('No se pudo acceder al servicio público. Puede deberse a CORS o a la red; usa Conectar IA / conector local para la consulta.', 'NETWORK');
      throw e;
    } finally { if (timer) clearTimeout(timer); if (options.signal) options.signal.removeEventListener('abort', abort); }
  }
  async function requestData(desc, options) {
    const spec = buildRequest(desc); // validate the same narrow contract even when using the local connector
    if (options.signal && options.signal.aborted) throw error('Consulta cancelada.', 'ABORTED');
    const response = options.request ? await options.request(Object.assign({}, desc), { signal: options.signal }) : await directRequest(desc, options);
    if (!response || response.ok !== true || typeof response.text !== 'string') throw error(response && (response.error && response.error.message || response.error) || 'El conector no devolvió datos válidos.', 'PROVIDER');
    if (response.operation && response.operation !== desc.operation) throw error('Operación de respuesta inesperada.', 'PROVIDER');
    if (response.text.length > spec.maxBytes) throw error('Respuesta GIS demasiado grande.', 'SIZE');
    if (options.signal && options.signal.aborted) throw error('Consulta cancelada.', 'ABORTED');
    return response;
  }
  function candidateValue(c) {
    const lon = Number(c.lng == null ? c.lon : c.lng), lat = Number(c.lat), hasPoint = finite(lon) && finite(lat) && lat >= 27.5 && lat <= 43.9 && lon >= -18.3 && lon <= 4.5;
    return { id: String(c.id || ''), type: String(c.type || ''), label: String(c.address || c.label || c.name || ''), lon: hasPoint ? lon : null, lat: hasPoint ? lat : null,
      municipality: c.muni || null, province: c.province || null, reference: c.refCatastral || null };
  }
  async function resolveLocation(options) {
    options = options || {}; const desc = { operation: 'address.candidates', query: options.query }, response = await requestData(desc, options), json = JSON.parse(response.text);
    const list = Array.isArray(json) ? json : json.results || json.candidates;
    if (!Array.isArray(list)) throw error('Respuesta del geocodificador no reconocida.', 'GEOCODER');
    return { candidates: list.slice(0, 5).map(candidateValue), sources: [sourceRecord(desc.operation, response, desc)], warnings: list.length ? [] : ['No se encontraron direcciones o referencias. Prueba municipio y número de portal.'] };
  }
  async function resolveCandidate(options) {
    options = options || {}; const c = options.candidate;
    if (!c || !c.id || !c.type) throw error('Selecciona un candidato del geocodificador.', 'GEOCODER');
    if (finite(c.lon) && finite(c.lat)) { bboxAround(c.lon, c.lat, 50); return Object.assign({}, c); }
    const desc = { operation: 'address.find', query: c.label, id: c.id, type: c.type }, response = await requestData(desc, options), json = JSON.parse(response.text);
    const result = candidateValue(Array.isArray(json) ? json[0] || {} : json);
    if (!finite(result.lon) || !finite(result.lat)) throw error('El candidato no contiene una ubicación puntual válida. Elige un portal o selecciona coordenadas.', 'GEOCODER');
    result.source = sourceRecord(desc.operation, response, desc); return result;
  }
  async function loadArea(options) {
    options = options || {}; const validated = validateBBox(options.bbox), layers = Object.assign({ parcels: true, buildings: true, terrain: true, trees: true, context: true }, options.layers || {});
    const out = { format: 'dedalo.territory-data', version: 1, bbox: validated.bbox, crs: 'EPSG:4326', areaM2: validated.areaM2,
      parcels: [], buildingParts: [], terrain: null, trees: [], vegetationAreas: [], roads: [], waterways: [], waterAreas: [], sources: [], warnings: [], layerErrors: [], partial: false };
    const operations = [['parcels', 'catastro.parcels'], ['buildings', 'catastro.buildings'], ['terrain', 'ign.terrain'], ['trees', 'osm.trees'], ['context', 'osm.context']].filter(([key]) => layers[key]);
    if (!operations.length) throw error('Activa al menos una capa de territorio.', 'LAYERS');
    // Sequential requests avoid burst traffic to free public providers and preserve readable progress.
    for (let i = 0; i < operations.length; i++) {
      const [layer, operation] = operations[i], desc = { operation, bbox: validated.bbox };
      if (typeof options.onProgress === 'function') options.onProgress({ layer, operation, index: i, total: operations.length });
      try {
        const response = await requestData(desc, options), source = sourceRecord(operation, response, desc); out.sources.push(source);
        if (layer === 'parcels' || layer === 'buildings') {
          const parsed = parseGML(response.text, { featureType: layer === 'parcels' ? 'CadastralParcel' : 'BuildingPart', sourceId: source.id });
          out[layer === 'parcels' ? 'parcels' : 'buildingParts'] = parsed.features; out.warnings.push(...parsed.warnings);
          source.numberMatched = parsed.numberMatched; source.numberReturned = parsed.numberReturned; source.originalCRSs = parsed.sourceCRSs;
          if (parsed.truncated || parsed.skipped || parsed.countMismatch) out.partial = true;
          if (!parsed.features.length) out.warnings.push(layer === 'buildings' ? 'Catastro no devolvió partes de edificios para esta zona; no se inventarán edificios. Navarra y País Vasco requieren fuentes forales aún no conectadas.' : 'Catastro no devolvió parcelas; comprueba la selección y la cobertura DGC (sin Navarra/País Vasco).');
        } else if (layer === 'terrain') out.terrain = parseElevationASCII(response.text, { crs: response.source && response.source.crs || 'EPSG:4258' });
        else {
          const parsed = parseOverpass(response.text, { bbox: validated.bbox });
          for (const key of layer === 'trees' ? ['trees'] : ['vegetationAreas', 'roads', 'waterways', 'waterAreas']) out[key].push(...parsed[key]);
          out.warnings.push(...parsed.warnings); source.datasetTimestamp = parsed.timestamp;
          if (parsed.warnings.length) out.partial = true;
        }
      } catch (e) {
        if (e.code === 'ABORTED' || options.signal && options.signal.aborted) throw e;
        out.partial = true; out.layerErrors.push({ layer, operation, code: e.code || 'DATA', message: e.message }); out.warnings.push(layer + ': ' + e.message);
      }
    }
    for (const key of ['trees', 'vegetationAreas', 'roads', 'waterways', 'waterAreas']) out[key] = [...new Map(out[key].map(item => [item.id, item])).values()];
    if (layers.trees) out.warnings.push('Los árboles son únicamente puntos natural=tree de OSM. La cobertura es incompleta; no se generan árboles reales aleatorios.');
    if (layers.context) out.warnings.push('Contexto OSM: vías lineales y áreas cerradas cartografiadas; sin relaciones multipolígono ni garantía de exhaustividad.');
    if (layers.buildings) out.warnings.push('Catastro aporta huellas y plantas. La altura extruida por plantas es estimada, no una medición de fachada o tejado.');
    if (!out.sources.length || out.layerErrors.length === operations.length) throw Object.assign(error('No se pudo obtener ninguna capa real. ' + out.warnings.join(' '), 'NO_DATA'), { details: out.layerErrors });
    return out;
  }
  D.TerritoryData = { MAX_AREA_M2, ENDPOINTS, LICENSES, validateBBox, bboxAround, buildRequest, parseXML, parseGML, parseElevationASCII, parseOverpass, resolveLocation, resolveCandidate, loadArea };
})(typeof window !== 'undefined' ? window : globalThis);
