// Wheel gestures belong to the table, never the browser's page zoom.
export function wheelIntent(event,object,{handTool=false,dragging=false}={}){
  if(!Number.isFinite(event.deltaY)||event.deltaY===0||dragging)return {kind:'none'};
  if(event.ctrlKey){
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?800:1);
    return {kind:'zoom',factor:Math.exp(-Math.max(-700,Math.min(700,pixels))*.001)};
  }
  if(!handTool&&object?.type==='token'&&!object.locked&&Number.isFinite(object.value))return {kind:'counter',delta:event.deltaY<0?1:-1};
  return {kind:'none'};
}
export const isPanGesture=(button,spaceDown)=>button===1||(button===0&&spaceDown);
