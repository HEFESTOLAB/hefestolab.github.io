/* Caja de sección: recorte visual reversible en coordenadas del contexto abierto. */
(function(root) {
  'use strict';
  const D = root.DEDALO;
  const copy = x => JSON.parse(JSON.stringify(x));
  function normalize(value) {
    if (!value || value.enabled === false) return null;
    for (const k of ['min', 'max']) if (!Array.isArray(value[k]) || value[k].length !== 3 || value[k].some(x => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('Los límites de sección deben ser tres números finitos en metros.');
    if (value.min.some((x, i) => value.max[i] - x < 1e-7)) throw new Error('Cada máximo de sección debe ser mayor que su mínimo.');
    return { enabled: true, min: value.min.slice(), max: value.max.slice(), showBox: value.showBox !== false, showHandles: value.showHandles !== false };
  }
  const active = b => !!(b && b.enabled);
  const contains = (b, p) => !active(b) || p.every((x, i) => x >= b.min[i] - 1e-8 && x <= b.max[i] + 1e-8);
  // Sutherland-Hodgman, with interpolation of any extra attributes after XYZ.
  function polygon(b, points) {
    if (!active(b)) return points;
    let out = points;
    for (let axis = 0; axis < 3; axis++) for (let side = 0; side < 2; side++) {
      const input = out; out = [];
      const bound = side ? b.max[axis] : b.min[axis], sign = side ? -1 : 1;
      for (let i = 0; i < input.length; i++) {
        const a = input[i], c = input[(i + 1) % input.length];
        const da = sign * (a[axis] - bound), dc = sign * (c[axis] - bound);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (dc >= 0)) { const t = da / (da - dc); out.push(a.map((x, j) => x + (c[j] - x) * t)); }
      }
      if (!out.length) return out;
    }
    return out;
  }
  function segment(b, a, c) {
    if (!active(b)) return [a, c];
    let low = 0, high = 1;
    for (let i = 0; i < 3; i++) {
      const d = c[i] - a[i];
      if (Math.abs(d) < 1e-15) { if (a[i] < b.min[i] || a[i] > b.max[i]) return null; continue; }
      let x = (b.min[i] - a[i]) / d, y = (b.max[i] - a[i]) / d;
      if (x > y) [x, y] = [y, x];
      low = Math.max(low, x); high = Math.min(high, y);
      if (low > high) return null;
    }
    return [a.map((x, i) => x + (c[i] - x) * low), a.map((x, i) => x + (c[i] - x) * high)];
  }
  function wires(b) {
    if (!active(b) || !b.showBox) return [];
    const pts = Array.from({length:8}, (_, k) => [0,1,2].map(i => (k & (1 << i)) ? b.max[i] : b.min[i]));
    const lines = [];
    for (let k = 0; k < 8; k++) for (let i = 0; i < 3; i++) if (!(k & (1 << i))) lines.push({ a: pts[k], b: pts[k | (1 << i)], color: '#e47924', width: 2, dash: 4 });
    return lines;
  }
  function lines(b, list) {
    if (!active(b)) return list;
    return list.flatMap(l => { const s = segment(b, l.a, l.b); return s ? [Object.assign({}, l, { a:s[0], b:s[1] })] : []; }).concat(wires(b));
  }
  function install(app) {
    app.sectionController=new Controller(app);
    const set = value => {
      app.renderer.opts.sectionBox = normalize(value);
      app._fk = app._lk = null;
      app.doc.dirty = true;
      app.files.scheduleAutosave(); app.requestRender(); app.ui.refreshTitle(); app.ui.refreshPanels();
      return { ok:true, sectionBox:copy(app.renderer.opts.sectionBox) };
    };
    app.doc.register('view.sectionBox', { title:'Caja de sección', undoable:false,
      params:{ enabled:'bool; false desactiva', min:'[x,y,z] metros', max:'[x,y,z] metros', showBox:'bool', showHandles:'bool; tiradores 3D visibles con Seleccionar', read:'bool; solo consultar' },
      run(p) { if (p.read) return { ok:true, sectionBox:copy(app.renderer.opts.sectionBox || null), coordinates:'context-local', caps:false }; return set(p); } });
    app.doc.register('view.sectionBoxFit', { title:'Ajustar caja de sección', undoable:false,
      params:{ selection:'bool; ajustar a la selección', padding:'m, opcional' },
      run(p) {
        let points;
        if (p.selection) {
          if (app.doc.selectionEmpty()) throw new Error('Selecciona primero elementos para ajustar la sección.');
          points = [...app.doc.vertsOf(app.doc.selectionItems())].map(id => app.doc.model.P(id));
        } else points = [...app.doc.model.verts.values()].map(v => v.p);
        if (!points.length) throw new Error('No hay geometría para ajustar la sección.');
        const padding = p.padding === undefined ? 0.05 : p.padding;
        if (typeof padding !== 'number' || !Number.isFinite(padding) || padding < 0) throw new Error('El margen debe ser un número no negativo en metros.');
        const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
        for (const pt of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i],pt[i]); max[i] = Math.max(max[i],pt[i]); }
        for (let i = 0; i < 3; i++) { const pad = Math.max(padding,(max[i]-min[i]) < 1e-7 ? 0.005 : 0); min[i]-=pad; max[i]+=pad; }
        return set({min,max});
      } });
    app.doc.on(kind => {
      // Limits belong to the local coordinate system, so release on context switch.
      if (kind === 'context' || kind === 'reset') { app.sectionController.cancel(); app.renderer.opts.sectionBox = null; app._fk = app._lk = null; }
    });
  }
  function handles(box) {
    if(!active(box)||!box.showBox||box.showHandles===false)return [];
    const mid=box.min.map((v,i)=>(v+box.max[i])/2), result=[];
    for(let axis=0;axis<3;axis++)for(const side of ['min','max']){
      const p=mid.slice();p[axis]=box[side][axis];result.push({id:side+axis,kind:'face',axis,side,p,label:['X','Y','Z'][axis]+(side==='min'?' −':' +')});
    }
    for(let k=0;k<8;k++)result.push({id:'corner'+k,kind:'corner',sides:[0,1,2].map(i=>k&(1<<i)?'max':'min'),p:[0,1,2].map(i=>k&(1<<i)?box.max[i]:box.min[i]),label:'Esquina'});
    result.push({id:'move',kind:'move',p:mid,label:'Mover caja'});
    return result;
  }
  class Controller {
    constructor(app){this.app=app;this.drag=null;this.hover=null;}
    enabled(){return active(this.app.renderer.opts.sectionBox)&&this.app.tool?.id==='select'&&this.app.tool.state===0;}
    screenHandles(){
      if(!this.enabled())return [];
      const cam=this.app.camera;
      const list=handles(this.app.renderer.opts.sectionBox).map(h=>({...h,s:cam.project(h.p)})).filter(h=>!h.s.behind&&h.s.z>=-1&&h.s.z<=1),placed=[];
      for(const h of list){
        if(h.kind!=='corner'&&placed.some(p=>p.kind!=='corner'&&Math.hypot(h.s.x-p.s.x,h.s.y-p.s.y)<16)){
          h.s={...h.s,x:h.s.x+(h.kind==='move'?22:26),y:h.s.y+(h.kind==='move'?24:0)};
        }
        placed.push(h);
      }
      return list;
    }
    hit(x,y){return this.screenHandles().map(h=>({...h,d:Math.hypot(h.s.x-x,h.s.y-y)})).filter(h=>h.d<12).sort((a,b)=>a.d-b.d||a.s.z-b.s.z)[0]||null;}
    begin(ev){
      if(ev.button!==0)return false;
      const h=this.hit(ev.x,ev.y);if(!h)return false;
      const box=copy(this.app.renderer.opts.sectionBox),cam=this.app.camera;
      this.drag={deferred:!!this.app.renderer.software&&this.app.doc.model.faces.size>20000,handle:h,box,start:[ev.x,ev.y],pixel:cam.pixelSize(h.p),right:cam.right.slice(),up:cam.up.slice()};
      if(h.kind==='face'){
        const p=h.p.slice();p[h.axis]+=Math.max(this.drag.pixel*100,1e-5);
        const q=cam.project(p),origin=cam.project(h.p),dx=q.x-origin.x,dy=q.y-origin.y,len=Math.hypot(dx,dy);
        this.drag.axis=len>3?[dx/len,dy/len]:[0,-1];
        this.drag.metresPerPixel=len>3?(p[h.axis]-h.p[h.axis])/len:this.drag.pixel;
      }
      this.app._lastDown=null;this.app._clicks=0;this.app.el.ov.style.cursor='grabbing';this.app.requestRender();return true;
    }
    move(ev){
      if(!this.drag){
        const h=this.hit(ev.x,ev.y),changed=h?.id!==this.hover?.id;
        this.hover=h;if(changed)this.app.requestRender();
        if(h){this.app.el.ov.style.cursor=h.kind==='move'?'move':'grab';return true;}
        return false;
      }
      const d=this.drag,h=d.handle,b=copy(d.box),dx=ev.x-d.start[0],dy=ev.y-d.start[1];
      const delta=d.right.map((v,i)=>(v*dx-d.up[i]*dy)*d.pixel);
      const epsilon=1e-5;
      if(h.kind==='face'){
        const value=d.box[h.side][h.axis]+(dx*d.axis[0]+dy*d.axis[1])*d.metresPerPixel;
        b[h.side][h.axis]=h.side==='min'?Math.min(value,b.max[h.axis]-epsilon):Math.max(value,b.min[h.axis]+epsilon);
      }else if(h.kind==='corner'){
        for(let i=0;i<3;i++){const side=h.sides[i],v=d.box[side][i]+delta[i];b[side][i]=side==='min'?Math.min(v,b.max[i]-epsilon):Math.max(v,b.min[i]+epsilon);}
      }else for(let i=0;i<3;i++){b.min[i]+=delta[i];b.max[i]+=delta[i];}
      this.app.renderer.opts.sectionBox=normalize(b);this.app._fk=this.app._lk=null;this.app.requestRender();return true;
    }
    end(){
      if(!this.drag)return false;
      const value=copy(this.app.renderer.opts.sectionBox);this.drag=null;this.app._cursor=null;
      this.app.exec('view.sectionBox',value);return true;
    }
    cancel(){
      if(!this.drag)return false;
      this.app.renderer.opts.sectionBox=copy(this.drag.box);this.drag=null;
      this.app._fk=this.app._lk=null;this.app._cursor=null;this.app.requestRender();return true;
    }
    draw(overlay){
      if(!this.enabled())return;
      const box=this.app.renderer.opts.sectionBox,g=overlay.g;
      for(const line of wires(box))overlay.line3(line.a,line.b,'#d46b17',1.4,5);
      for(const h of this.screenHandles()){
        const activeHandle=(this.drag?.handle||this.hover)?.id===h.id,size=h.kind==='face'?7:h.kind==='move'?6:4.5;
        const color=activeHandle?'#fff':h.kind==='face'?['#b83f3f','#27844c','#3475c5'][h.axis]:'#d46b17';
        g.save();g.fillStyle=color;g.strokeStyle=activeHandle?'#b4532a':'#ffffff';g.lineWidth=2;
        g.beginPath();g.rect(h.s.x-size,h.s.y-size,size*2,size*2);g.fill();g.stroke();
        if(h.kind==='face'){g.fillStyle=activeHandle?'#b4532a':'#ffffff';g.font='bold 9px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(['X','Y','Z'][h.axis],h.s.x,h.s.y);}
        if(h.kind==='move'){g.strokeStyle='#fff';g.beginPath();g.moveTo(h.s.x-4,h.s.y);g.lineTo(h.s.x+4,h.s.y);g.moveTo(h.s.x,h.s.y-4);g.lineTo(h.s.x,h.s.y+4);g.stroke();}
        g.restore();
      }
      if(this.drag?.deferred)overlay.label2(130,24,'Suelta para aplicar el recorte',{color:'#8e3f1e'});
      const h=this.drag?.handle||this.hover;
      if(h){const s=this.app.camera.project(h.p);overlay.label2(s.x+22,s.y-22,h.label,{color:'#8e3f1e'});}
    }
  }

  D.SectionBox = { handles, Controller, normalize, active, contains, polygon, segment, wires, lines, install };
})(typeof window !== 'undefined' ? window : globalThis);
