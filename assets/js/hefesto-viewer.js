// HEFESTO · visor web del proyecto demo (geometría exportada del modelo real, revisión 7)
// Controles: rueda = zoom hacia el cursor · botón central o Mayús + arrastrar = desplazar · izquierdo = orbitar
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const DISC_LABEL = { arq: 'Arquitectura', est: 'Estructura', mep: 'Instalaciones' };
const TYPE_LABEL = { wall: 'Muro', slab: 'Losa / forjado', roof: 'Cubierta', stair: 'Escalera', railing: 'Barandilla', room: 'Espacio', gridline: 'Eje', footing: 'Zapata', column: 'Pilar', beam: 'Viga', pipe: 'Tubería', duct: 'Conducto', tray: 'Bandeja', opening: 'Hueco' };
const ROOM_COLORS = { salon_cocina: '#8ec5ff', dormitorio_principal: '#f5d97a', dormitorio: '#f5d97a', bano: '#9fe3c9', oficina: '#c9b8ff' };

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: color || '#cccccc', roughness: 0.78, metalness: 0.02, ...extra });
}
const glassMat = () => mat('#9fd0f0', { transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0.1, depthWrite: false });

function ipeShape(b, h) {
  const tf = Math.max(h * 0.036, 0.006), tw = Math.max(h * 0.024, 0.004);
  const s = new THREE.Shape();
  const B = b / 2, H = h / 2, T = tw / 2;
  s.moveTo(-B, -H); s.lineTo(B, -H); s.lineTo(B, -H + tf); s.lineTo(T, -H + tf); s.lineTo(T, H - tf);
  s.lineTo(B, H - tf); s.lineTo(B, H); s.lineTo(-B, H); s.lineTo(-B, H - tf); s.lineTo(-T, H - tf);
  s.lineTo(-T, -H + tf); s.lineTo(-B, -H + tf); s.closePath();
  return s;
}

function boxAlong(len, w, h) { return new THREE.BoxGeometry(w, h, len); }

function orientBetween(obj, a, b) {
  obj.position.copy(a);
  obj.lookAt(b);
}

function textSprite(text, color = '#0b5fb8', size = 0.9) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = '700 64px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(size, size, 1); sp.renderOrder = 10;
  return sp;
}

function buildWall(e) {
  const g = new THREE.Group();
  const [x1, z1] = e.p1, [x2, z2] = e.p2;
  const L = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
  g.position.set(x1, e.y0, z1); g.rotation.y = -ang;
  const H = e.h, T = e.t;
  const piece = (u0, u1, v0, v1, m) => {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, v1 - v0, T), m);
    mesh.position.set((u0 + u1) / 2, (v0 + v1) / 2, 0); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  };
  if (e.curtain) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.02), glassMat()); glass.position.set(L / 2, H / 2, 0); g.add(glass);
    const mm = mat('#44515e', { metalness: 0.6, roughness: 0.35 }); const s = 0.06;
    for (let u = 0; u <= L + 1e-6; u += 1.25) piece(Math.max(0, u - s / 2), Math.min(L, u + s / 2), 0, H, mm);
    for (let v = 0; v <= H + 1e-6; v += 1.5) { const m = new THREE.Mesh(new THREE.BoxGeometry(L, s, s), mm); m.position.set(L / 2, Math.min(Math.max(v, s / 2), H - s / 2), 0); g.add(m); }
    return g;
  }
  const m = mat(e.color);
  const ops = [...(e.openings || [])].map(o => ({ ...o, u0: o.offset - o.w / 2, u1: o.offset + o.w / 2 })).sort((a, b) => a.u0 - b.u0);
  let u = 0;
  for (const o of ops) {
    piece(u, o.u0, 0, H, m);
    piece(o.u0, o.u1, 0, o.sill, m);
    piece(o.u0, o.u1, o.sill + o.h, H, m);
    u = o.u1;
    const frame = mat(o.kind === 'door' ? '#6d4c35' : '#dfe5ea');
    if (o.kind === 'window') {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, 0.02), glassMat()); gl.position.set(o.offset, o.sill + o.h / 2, 0); g.add(gl);
      const f = 0.05;
      [[o.offset, o.sill + f / 2, o.w, f], [o.offset, o.sill + o.h - f / 2, o.w, f]].forEach(([cx, cy, w, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frame); b.position.set(cx, cy, 0); g.add(b); });
      [[o.u0 + f / 2], [o.u1 - f / 2], ...(o.w > 1.3 ? [[o.offset]] : [])].forEach(([cx]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(f, o.h, 0.07), frame); b.position.set(cx, o.sill + o.h / 2, 0); g.add(b); });
    } else if (o.kind === 'door') {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.04, o.h - 0.02, 0.04), frame); leaf.position.set(o.offset, o.h / 2, T / 2 - 0.03); leaf.castShadow = true; g.add(leaf);
    }
  }
  piece(u, L, 0, H, m);
  return g;
}

function buildSlab(e) {
  const shape = new THREE.Shape(e.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  (e.holes || []).forEach(h => shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: e.th, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat(e.color || '#c9ced4'));
  mesh.position.y = e.top - e.th; mesh.receiveShadow = mesh.castShadow = true;
  return mesh;
}

function buildHipRoof(e) {
  const xs = e.pts.map(p => p[0]), zs = e.pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const d = z1 - z0, zc = (z0 + z1) / 2, t = Math.tan(e.slope * Math.PI / 180), hr = d / 2 * t;
  const y = e.y0, th = e.th;
  const A = [x0, y, z0], B = [x1, y, z0], C = [x1, y, z1], D = [x0, y, z1], R1 = [x0 + d / 2, y + hr, zc], R2 = [x1 - d / 2, y + hr, zc];
  const up = v => [v[0], v[1] + th * 0.6, v[2]];
  const tris = [[A, B, R2], [A, R2, R1], [B, C, R2], [C, D, R1], [C, R1, R2], [D, A, R1]];
  const pos = [];
  tris.forEach(tr => tr.map(up).forEach(v => pos.push(...v)));
  tris.forEach(tr => [tr[0], tr[2], tr[1]].forEach(v => pos.push(...v)));
  [[A, B], [B, C], [C, D], [D, A]].forEach(([p, q]) => { const pu = up(p), qu = up(q); [p, q, qu, p, qu, pu].forEach(v => pos.push(...v)); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(e.color || '#b5553c', { side: THREE.DoubleSide, roughness: 0.9 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function buildStair(e) {
  const g = new THREE.Group(); const m = mat(e.color || '#8d6e63');
  const run = e.length / e.steps, rise = e.rise / e.steps;
  for (let i = 0; i < e.steps; i++) {
    const h = rise * (i + 1);
    const s = new THREE.Mesh(new THREE.BoxGeometry(run, h, e.w), m);
    s.position.set(e.x0 + run * (i + 0.5), e.y0 + h / 2, e.zc); s.castShadow = s.receiveShadow = true; g.add(s);
  }
  return g;
}

function buildRailing(e) {
  const g = new THREE.Group();
  const a = new THREE.Vector3(e.p1[0], e.y0, e.p1[1]), b = new THREE.Vector3(e.p2[0], e.y0, e.p2[1]);
  const L = a.distanceTo(b), ang = Math.atan2(b.z - a.z, b.x - a.x);
  const gl = new THREE.Mesh(new THREE.BoxGeometry(L, e.h - 0.08, 0.015), glassMat()); gl.position.set(L / 2, (e.h - 0.08) / 2, 0);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.06), mat('#5d6b78', { metalness: 0.6 })); rail.position.set(L / 2, e.h - 0.025, 0);
  g.add(gl, rail); g.position.copy(a); g.rotation.y = -ang;
  return g;
}

function buildColumn(e) {
  const shape = ipeShape(e.d, e.w); // h de la sección en X local
  const geo = new THREE.ExtrudeGeometry(shape, { depth: e.h, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // extrusión +Z -> +X
  geo.rotateZ(Math.PI / 2); // +X -> +Y (vertical)
  const mesh = new THREE.Mesh(geo, mat(e.color, { metalness: 0.45, roughness: 0.45 }));
  mesh.position.set(e.x, e.y0, e.z); mesh.rotation.y = e.rot || 0; mesh.castShadow = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.025, 0.45), mat('#6c7a88', { metalness: 0.5 })); plate.position.set(e.x, e.y0 + 0.0125, e.z);
  const g = new THREE.Group(); g.add(mesh, plate); return g;
}

function buildBeam(e) {
  const a = new THREE.Vector3(e.p1[0], e.y1 - e.h / 2, e.p1[1]), b = new THREE.Vector3(e.p2[0], e.y2 - e.h / 2, e.p2[1]);
  const geo = new THREE.ExtrudeGeometry(ipeShape(e.w, e.h), { depth: a.distanceTo(b), bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat(e.color, { metalness: 0.45, roughness: 0.45 }));
  orientBetween(mesh, a, b); mesh.castShadow = true; return mesh;
}

function buildLinear(e) {
  const a = new THREE.Vector3(...e.a), b = new THREE.Vector3(...e.b), L = a.distanceTo(b);
  let geo;
  if (e.type === 'pipe') { geo = new THREE.CylinderGeometry(e.dia / 2, e.dia / 2, L, 20); geo.rotateX(Math.PI / 2); }
  else if (e.type === 'tray') {
    const s = new THREE.Shape(); const W = e.w / 2, H = e.h, t = 0.004;
    s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, H); s.lineTo(W - t, H); s.lineTo(W - t, t); s.lineTo(-W + t, t); s.lineTo(-W + t, H); s.lineTo(-W, H); s.closePath();
    geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }); geo.translate(0, -H / 2, -L / 2);
  } else geo = boxAlong(L, e.w, e.h);
  geo.translate(0, 0, L / 2);
  const mesh = new THREE.Mesh(geo, mat(e.color, { metalness: e.type === 'duct' ? 0.5 : 0.2, roughness: 0.4 }));
  if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) { mesh.position.copy(a); mesh.rotation.x = b.y > a.y ? -Math.PI / 2 : Math.PI / 2; }
  else orientBetween(mesh, a, b);
  mesh.castShadow = true; return mesh;
}

function buildRoom(e) {
  const shape = new THREE.Shape(e.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ROOM_COLORS[e.useKey] || ROOM_COLORS[guessUse(e.name)] || '#bcd7ff', transparent: true, opacity: 0.55, depthWrite: false }));
  mesh.position.y = e.y0 + 0.012; mesh.renderOrder = 2; return mesh;
}
const guessUse = n => /ba[ñn]o/i.test(n) ? 'bano' : /sal[oó]n/i.test(n) ? 'salon_cocina' : /estudio/i.test(n) ? 'oficina' : 'dormitorio';

function buildGrid(e) {
  const g = new THREE.Group();
  const pts = [new THREE.Vector3(e.p1[0], 0.03, e.p1[1]), new THREE.Vector3(e.p2[0], 0.03, e.p2[1])];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#0b5fb8', dashSize: 0.6, gapSize: 0.25 }));
  line.computeLineDistances(); g.add(line);
  const lab = textSprite(e.name); lab.position.set(e.p1[0], 0.6, e.p1[1]); g.add(lab);
  return g;
}

function buildFooting(e) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(e.w, e.h, e.d), mat(e.color || '#9aa0a6'));
  mesh.position.set(e.x, e.y0 - e.h / 2, e.z); mesh.receiveShadow = true; return mesh;
}

const BUILDERS = { wall: buildWall, slab: buildSlab, roof: buildHipRoof, stair: buildStair, railing: buildRailing, column: buildColumn, beam: buildBeam, pipe: buildLinear, duct: buildLinear, tray: buildLinear, room: buildRoom, gridline: buildGrid, footing: buildFooting };

function describe(e) {
  const rows = [['ID', e.id], ['Categoría', TYPE_LABEL[e.type] || e.type], ['Disciplina', DISC_LABEL[e.disc] || '']];
  if (e.typeName) rows.push(['Tipo', e.typeName]);
  const f = v => v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (e.type === 'wall') { rows.push(['Longitud', f(Math.hypot(e.p2[0] - e.p1[0], e.p2[1] - e.p1[1])) + ' m'], ['Altura', f(e.h) + ' m'], ['Espesor', f(e.t) + ' m']); if (e.curtain) rows.push(['Sistema', 'Muro cortina con montantes']); if (e.openings?.length) rows.push(['Huecos alojados', e.openings.map(o => o.id).join(', ')]); }
  if (e.type === 'room') rows.push(['Nombre', e.name]);
  if (e.type === 'stair') rows.push(['Peldaños', e.steps], ['Tabica', f(e.rise / e.steps * 100) + ' cm'], ['Huella', f(e.length / e.steps * 100) + ' cm']);
  if (e.type === 'beam') rows.push(['Longitud', f(Math.hypot(e.p2[0] - e.p1[0], e.p2[1] - e.p1[1], e.y2 - e.y1)) + ' m']);
  if (e.type === 'column') rows.push(['Altura', f(e.h) + ' m'], ['Sección', 'IPE 330 · giro 90°']);
  if (['pipe', 'duct', 'tray'].includes(e.type)) rows.push(['Longitud', f(new THREE.Vector3(...e.a).distanceTo(new THREE.Vector3(...e.b))) + ' m'], ['Material', e.mat]);
  if (e.type === 'footing') rows.push(['Dimensiones', `${f(e.w)} × ${f(e.d)} × ${f(e.h)} m`], ['Volumen', f(e.w * e.d * e.h) + ' m³']);
  return rows;
}

export async function initViewer(root, opts = {}) {
  const dataUrl = opts.data || root.dataset.model;
  const site = opts.site || root.dataset.site || 'all';
  const ui = root.dataset.ui !== 'none';
  root.classList.add('hv');
  root.innerHTML = `<div class="hv-stage"><canvas aria-label="Modelo BIM 3D interactivo"></canvas><div class="hv-hint">Arrastra para orbitar · rueda para acercar al cursor · botón central o Mayús + arrastrar para desplazar · clic para ver propiedades</div><div class="hv-info" hidden></div><div class="hv-loading">Cargando modelo…</div></div>${ui ? '<div class="hv-bar" role="toolbar" aria-label="Controles del visor"></div>' : ''}`;
  const canvas = root.querySelector('canvas'), info = root.querySelector('.hv-info'), loading = root.querySelector('.hv-loading');
  let data;
  try { data = await (await fetch(dataUrl)).json(); }
  catch (err) { loading.textContent = 'El visor 3D necesita abrirse desde la web o desde el servidor local.'; return; }
  loading.remove();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 800);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.zoomToCursor = true; controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.maxPolarAngle = Math.PI * 0.495;

  scene.add(new THREE.HemisphereLight('#eaf4ff', '#8c96a0', 1.35));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.1); sun.position.set(-30, 45, -25); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.target.position.set(19, 0, 6); scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(120, 60, '#7fb3e6', '#7fb3e6'); grid.material.transparent = true; grid.material.opacity = 0.22; grid.position.set(19, -0.3, 6); scene.add(grid);

  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  const groups = { arq: new THREE.Group(), est: new THREE.Group(), mep: new THREE.Group(), rooms: new THREE.Group(), roof: new THREE.Group() };
  Object.values(groups).forEach(g => scene.add(g));
  const pickables = [];
  for (const e of data.elements) {
    if (site !== 'all' && e.site !== site) continue;
    const b = BUILDERS[e.type]; if (!b) continue;
    const obj = b(e);
    obj.traverse(o => { o.userData.el = e; if (o.isMesh) { pickables.push(o); if (o.material) o.material.clippingPlanes = [clip]; } });
    (e.type === 'room' ? groups.rooms : e.type === 'roof' ? groups.roof : groups[e.disc] || groups.arq).add(obj);
  }
  groups.rooms.visible = false;
  (root.dataset.hide || '').split(',').filter(Boolean).forEach(k => { if (groups[k]) groups[k].visible = false; });
  if (root.dataset.cut) clip.constant = +root.dataset.cut;

  const box = new THREE.Box3();
  const frame = (which = site, view = 'iso') => {
    box.makeEmpty();
    scene.traverse(o => { if (o.isMesh && o.userData.el && (which === 'all' || o.userData.el.site === which)) box.expandByObject(o); });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    const dir = view === 'top' ? new THREE.Vector3(0.001, 1, 0.001) : view === 'front' ? new THREE.Vector3(0.15, 0.25, -1) : new THREE.Vector3(-0.85, 0.62, -0.95);
    camera.position.copy(c).add(dir.normalize().multiplyScalar(s * (view === 'top' ? 1.1 : 1.08) * Math.max(1, 1.5 / camera.aspect)));
    controls.target.copy(c); controls.update();
  };

  const resize = () => { const r = root.querySelector('.hv-stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(root.querySelector('.hv-stage')); resize();

  const bg = () => { const dark = document.documentElement.dataset.theme !== 'light'; scene.background = new THREE.Color(dark ? '#06111f' : '#eef5fc'); grid.material.opacity = dark ? 0.16 : 0.3; };
  bg(); new MutationObserver(bg).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let selected = null; const hl = new THREE.MeshStandardMaterial({ color: '#34a8ff', emissive: '#0b5fb8', emissiveIntensity: 0.55 });
  const restore = () => { if (selected) selected.forEach(([m, orig]) => m.material = orig); selected = null; };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', ev => down = [ev.clientX, ev.clientY]);
  canvas.addEventListener('pointerup', ev => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4 || ev.button !== 0) return;
    const r = canvas.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables.filter(m => m.visible && m.parent && isShown(m)), false).find(h => clip.distanceToPoint(h.point) >= 0);
    restore();
    if (!hit) { info.hidden = true; return; }
    const el = hit.object.userData.el; selected = [];
    scene.traverse(o => { if (o.isMesh && o.userData.el === el && !o.material.transparent) { selected.push([o, o.material]); o.material = hl; } });
    info.innerHTML = `<button class="hv-close" aria-label="Cerrar propiedades">×</button><b>Propiedades BIM</b><dl>${describe(el).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    info.hidden = false; info.querySelector('.hv-close').onclick = () => { info.hidden = true; restore(); };
  });
  const isShown = m => { let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return true; };

  if (ui) {
    const bar = root.querySelector('.hv-bar');
    const btn = (label, fn, pressed) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (pressed !== undefined) { b.setAttribute('aria-pressed', String(pressed)); } b.onclick = () => fn(b); bar.appendChild(b); return b; };
    const toggle = (label, g, on = g.visible) => btn(label, b => { g.visible = !g.visible; b.setAttribute('aria-pressed', String(g.visible)); }, on);
    if (site === 'all') { btn('Todo', () => frame('all')); btn('Vivienda', () => frame('casa')); btn('Nave', () => frame('nave')); }
    btn('Planta', () => frame(site, 'top')); btn('3D', () => frame(site, 'iso'));
    const sep = () => { const s = document.createElement('span'); s.className = 'hv-sep'; bar.appendChild(s); }; sep();
    if (site !== 'nave') toggle('Arquitectura', groups.arq);
    if (site !== 'casa') { toggle('Estructura', groups.est); toggle('Instalaciones', groups.mep); }
    if (site !== 'nave') { toggle('Cubierta', groups.roof); toggle('Espacios', groups.rooms); }
    sep();
    const lab = document.createElement('label'); lab.className = 'hv-cut';
    lab.innerHTML = '<span>Corte horizontal</span><input type="range" min="0.2" max="9" step="0.05" value="' + (root.dataset.cut || 9) + '" aria-label="Altura del plano de corte">';
    bar.appendChild(lab);
    lab.querySelector('input').addEventListener('input', ev => { const v = +ev.target.value; clip.constant = v >= 9 ? 100 : v; });
  }
  frame(site, opts.view || root.dataset.view || 'iso');
  const loop = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
  return { scene, camera, controls, frame };
}

// Component Studio · demostración paramétrica de una placa de anclaje
export function initPlateDemo(root) {
  root.classList.add('hv', 'hv-plate');
  root.innerHTML = `<div class="hv-stage"><canvas aria-label="Placa de anclaje paramétrica en 3D"></canvas></div><div class="hv-params">
    <label>Lado de placa <output data-o="a">400 mm</output><input type="range" data-p="a" min="300" max="600" step="10" value="400"></label>
    <label>Espesor <output data-o="t">25 mm</output><input type="range" data-p="t" min="15" max="40" step="1" value="25"></label>
    <label>Diámetro de perno <output data-o="d">24 mm</output><input type="range" data-p="d" min="16" max="32" step="2" value="24"></label>
    <label>Distancia al borde <output data-o="e">60 mm</output><input type="range" data-p="e" min="40" max="100" step="5" value="60"></label>
    <label class="hv-check"><input type="checkbox" data-p="rig" checked> Rigidizadores</label>
    <div class="hv-mass"><span>Masa calculada (acero 7850 kg/m³)</span><b data-o="m">—</b></div></div>`;
  const canvas = root.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  camera.position.set(0.95, 0.75, 1.15);
  const controls = new OrbitControls(camera, canvas); controls.target.set(0, 0.12, 0); controls.enableDamping = true; controls.zoomToCursor = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  scene.add(new THREE.HemisphereLight('#eef6ff', '#6b7580', 1.5)); const l = new THREE.DirectionalLight('#fff', 2); l.position.set(1, 2, 1.5); scene.add(l);
  const grp = new THREE.Group(); scene.add(grp);
  const steel = mat('#8a99a8', { metalness: 0.6, roughness: 0.35 }), col = mat('#2E6DA4', { metalness: 0.45, roughness: 0.45 }), bolt = mat('#c9a227', { metalness: 0.7, roughness: 0.3 });
  const P = { a: 400, t: 25, d: 24, e: 60, rig: true };
  const rebuild = () => {
    grp.clear();
    const a = P.a / 1000, t = P.t / 1000, d = P.d / 1000, e = P.e / 1000;
    const plateGeo = new THREE.BoxGeometry(a, t, a); const plate = new THREE.Mesh(plateGeo, steel); plate.position.y = t / 2; grp.add(plate);
    const c = new THREE.Mesh(new THREE.ExtrudeGeometry(ipeShape(0.16, 0.33), { depth: 0.45, bevelEnabled: false }).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), col);
    c.position.y = t; c.rotation.y = Math.PI / 2; grp.add(c);
    const off = a / 2 - e;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, 0.5, 20), bolt); b.position.set(sx * off, t - 0.5 / 2 + 0.06, sz * off); grp.add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.95, d * 0.95, d * 0.8, 6), bolt); n.position.set(sx * off, t + d * 0.4, sz * off); grp.add(n);
    }
    let vol = a * a * t - 4 * Math.PI * (d / 2 + 0.002) ** 2 * t;
    if (P.rig) {
      const h = 0.15, L = a / 2 - 0.08, tr = 0.012;
      for (const s of [1, -1]) {
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(0, h); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: tr, bevelEnabled: false }); g.translate(0, 0, -tr / 2);
        const m = new THREE.Mesh(g, steel); m.position.set(s * 0.08, t, 0); if (s < 0) m.rotation.y = Math.PI; grp.add(m);
        vol += L * h / 2 * tr;
      }
    }
    root.querySelector('[data-o="m"]').textContent = (vol * 7850).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' kg';
  };
  root.querySelectorAll('[data-p]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.p; P[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
    const o = root.querySelector(`[data-o="${k}"]`); if (o) o.textContent = inp.value + ' mm'; rebuild();
  }));
  const bg = () => scene.background = new THREE.Color(document.documentElement.dataset.theme !== 'light' ? '#06111f' : '#eef5fc');
  bg(); new MutationObserver(bg).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const resize = () => { const r = root.querySelector('.hv-stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(root.querySelector('.hv-stage')); resize(); rebuild();
  const loop = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
}

// Autoarranque
document.querySelectorAll('[data-hefesto-viewer]').forEach(el => initViewer(el));
document.querySelectorAll('[data-hefesto-plate]').forEach(el => initPlateDemo(el));
document.querySelectorAll('[data-compare]').forEach(el => {
  const r = el.querySelector('input[type=range]'); const set = () => el.style.setProperty('--pos', r.value + '%'); r.addEventListener('input', set); set();
});
