(()=>{
  const root=document.documentElement;
  const theme=document.getElementById('theme');
  const menu=document.getElementById('menu');
  const mobile=document.getElementById('mobile');
  const systemTheme=()=>window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  let saved=null;
  try{saved=localStorage.getItem('hefestolab-theme')}catch(_error){}
  const apply=value=>{
    root.dataset.theme=value;
    if(theme){
      theme.setAttribute('aria-pressed',String(value==='dark'));
      theme.title=value==='dark'?(document.documentElement.lang==='es'?'Cambiar a tema claro':'Switch to light theme'):(document.documentElement.lang==='es'?'Cambiar a tema oscuro':'Switch to dark theme');
    }
  };
  apply(saved||systemTheme());
  if(theme){theme.addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';apply(next);try{localStorage.setItem('hefestolab-theme',next)}catch(_error){}})}
  const setMenu=open=>{if(!mobile||!menu)return;mobile.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open))};
  if(menu&&mobile){menu.addEventListener('click',()=>setMenu(!mobile.classList.contains('open')));mobile.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setMenu(false)))}
})();
