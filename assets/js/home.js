/* HEFESTOLAB · portada v3.1 · tema, menú, vídeos y visor bajo demanda */
(() => {
  const here = document.currentScript ? document.currentScript.src : location.href;
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Tema: oscuro por defecto (la imagen del vídeo); el claro se guarda si alguien lo elige */
  const themeBtn = $('#theme');
  const applyTheme = v => {
    root.dataset.theme = v;
    if (!themeBtn) return;
    themeBtn.setAttribute('aria-pressed', String(v === 'dark'));
    themeBtn.title = v === 'dark' ? themeBtn.dataset.toLight : themeBtn.dataset.toDark;
  };
  let saved = null; try { saved = localStorage.getItem('hefestolab-theme'); } catch (e) {}
  applyTheme(saved || 'dark');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next); try { localStorage.setItem('hefestolab-theme', next); } catch (e) {}
  });

  /* Menú móvil */
  const menu = $('#menu'), mob = $('#mobile');
  if (menu && mob) {
    const setMenu = o => {
      mob.classList.toggle('open', o);
      menu.setAttribute('aria-expanded', String(o));
      menu.setAttribute('aria-label', o ? menu.dataset.close : menu.dataset.open);
    };
    menu.addEventListener('click', () => setMenu(!mob.classList.contains('open')));
    $$('a', mob).forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mob.classList.contains('open')) { setMenu(false); menu.focus(); } });
  }

  /* Bucles sin sonido: solo se reproducen mientras se ven */
  const loops = $$('video[data-loop]');
  const setPaused = (v, p) => { const box = v.closest('.clip, .stage'); if (box) box.classList.toggle('paused', p); };
  const tryPlay = v => { const r = v.play(); if (r && r.catch) r.catch(() => setPaused(v, true)); };
  loops.forEach(v => {
    v.muted = true;
    v.dataset.user = '';
    const btn = v.parentElement.querySelector('.clipToggle');
    if (btn) btn.addEventListener('click', () => {
      if (v.paused) { v.dataset.user = 'play'; tryPlay(v); } else { v.dataset.user = 'pause'; v.pause(); }
    });
    v.addEventListener('play', () => setPaused(v, false));
    v.addEventListener('pause', () => setPaused(v, true));
    if (calm) setPaused(v, true);
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting && e.intersectionRatio >= .35) {
        if (v.dataset.user !== 'pause' && (!calm || v.dataset.user === 'play')) tryPlay(v);
      } else if (!v.paused) { v.pause(); }
    }), { threshold: [0, .35, .7] });
    loops.forEach(v => io.observe(v));
  }

  /* Vídeos completos: se cargan al pulsar, con sonido y controles */
  const players = new Map();
  const openPlayer = (stage, at) => {
    let v = players.get(stage);
    if (!v) {
      v = document.createElement('video');
      v.controls = true; v.playsInline = true; v.preload = 'metadata';
      v.poster = stage.dataset.poster || '';
      v.src = stage.dataset.video;
      v.setAttribute('aria-label', stage.dataset.label || '');
      $$('video[data-loop]', stage).forEach(t => { t.pause(); t.remove(); });
      $$('img', stage).forEach(i => i.remove());
      stage.prepend(v);
      stage.classList.add('playing');
      players.set(stage, v);
      /* un solo vídeo con sonido a la vez */
      v.addEventListener('play', () => players.forEach(o => { if (o !== v && !o.paused) o.pause(); }));
    }
    const go = () => { if (typeof at === 'number') { try { v.currentTime = at; } catch (e) {} } const r = v.play(); if (r && r.catch) r.catch(() => {}); };
    if (v.readyState >= 1) go(); else { v.addEventListener('loadedmetadata', go, { once: true }); v.load(); }
    return v;
  };
  $$('.stage[data-video]').forEach(stage => {
    const play = $('.play', stage);
    if (play) play.addEventListener('click', e => { e.preventDefault(); openPlayer(stage).focus({ preventScroll: true }); });
  });
  /* Enlaces «ver el vídeo» que apuntan a una pantalla */
  $$('[data-play]').forEach(a => a.addEventListener('click', e => {
    const stage = document.getElementById(a.dataset.play);
    if (!stage) return;
    e.preventDefault();
    stage.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    openPlayer(stage);
  }));

  /* Capítulos de la grabación real */
  const real = $('#grabacion');
  const chapters = $$('.chapters button');
  if (real && chapters.length) {
    const mark = t => {
      let cur = null;
      chapters.forEach(b => { if (+b.dataset.t <= t + .25) cur = b; });
      chapters.forEach(b => b.setAttribute('aria-current', String(b === cur)));
    };
    chapters.forEach(b => b.addEventListener('click', () => {
      const v = openPlayer(real, +b.dataset.t);
      if (!v.dataset.wired) { v.dataset.wired = '1'; v.addEventListener('timeupdate', () => mark(v.currentTime)); }
      mark(+b.dataset.t);
      if (real.getBoundingClientRect().top < 70) real.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    }));
    const play = $('.play', real);
    if (play) play.addEventListener('click', () => {
      const v = players.get(real);
      if (v && !v.dataset.wired) { v.dataset.wired = '1'; v.addEventListener('timeupdate', () => mark(v.currentTime)); }
    });
  }

  /* Tira de capturas: flechas */
  const strip = $('.strip');
  if (strip) {
    const step = d => { const li = $('li', strip); strip.scrollBy({ left: d * ((li ? li.getBoundingClientRect().width : 600) + 18), behavior: calm ? 'auto' : 'smooth' }); };
    const prev = $('#stripPrev'), next = $('#stripNext');
    if (prev) prev.addEventListener('click', () => step(-1));
    if (next) next.addEventListener('click', () => step(1));
  }

  /* Visor del proyecto demo: three.js solo se descarga al acercarse */
  const viewer = $('[data-hefesto-viewer]');
  if (viewer) {
    const load = () => import(new URL('hefesto-viewer.js', here).href).catch(() => {
      viewer.textContent = viewer.dataset.error || '';
    });
    if ('IntersectionObserver' in window) {
      const vo = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { vo.disconnect(); load(); } }, { rootMargin: '600px 0px' });
      vo.observe(viewer);
    } else load();
  }
})();
