let timer;
export function notify(text){
  const toast=document.querySelector('#toast');
  toast.textContent=text;toast.classList.add('visible');
  clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('visible'),3200);
}
