export function bindModalControls(modal){
  modal.addEventListener('click',event=>{
    if(event.target.closest('[data-action="close-modal"]')){event.preventDefault();event.stopPropagation();modal.close();return;}
    if(event.target!==modal)return;
    const rect=modal.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();
  });
}
