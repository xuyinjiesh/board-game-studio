// Apply the saved palette before the stylesheets paint the page.
(()=>{
  const storageKey='tablecraft.appearance.v1';
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  const valid=value=>value==='light'||value==='dark';
  let choice=null;
  try{const saved=localStorage.getItem(storageKey);if(valid(saved))choice=saved;}catch{}
  function render(){
    const mode=choice||(system.matches?'dark':'light');
    document.documentElement.dataset.colorMode=mode;
    document.querySelectorAll('[data-color-mode-choice]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.colorModeChoice===mode));
    });
  }
  render();
  document.addEventListener('DOMContentLoaded',render,{once:true});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-color-mode-choice]');
    if(!button||!valid(button.dataset.colorModeChoice))return;
    choice=button.dataset.colorModeChoice;
    render();
    try{localStorage.setItem(storageKey,choice);}catch{}
  });
  system.addEventListener('change',()=>{if(!choice)render();});
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey&&event.key!==null)return;
    choice=valid(event.newValue)?event.newValue:null;
    render();
  });
})();
