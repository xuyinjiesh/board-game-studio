// Compare dependencies without serializing image strings or session objects.
export function createRenderGate(){
  let previous;
  return values=>{
    if(previous&&previous.length===values.length&&values.every((value,i)=>Object.is(value,previous[i])))return false;
    previous=values;return true;
  };
}

const rendered=new WeakMap();
export function updateRegion(element,html,{force=false}={}){
  // Compare the source, since browsers normalize markup when reading innerHTML.
  if(!force&&rendered.get(element)===html)return false;
  const scrollTop=element.scrollTop,scrollLeft=element.scrollLeft;
  const active=element.ownerDocument.activeElement;
  let focus;
  if(element.contains(active)){
    const path=[];
    for(let node=active;node!==element;node=node.parentElement)path.unshift([...node.parentElement.children].indexOf(node));
    focus={path,tag:active.tagName,identity:JSON.stringify([active.id,active.type,active.name,{...active.dataset}]),start:active.selectionStart,end:active.selectionEnd};
  }
  element.innerHTML=html;rendered.set(element,html);
  if(focus){
    const target=focus.path.reduce((node,index)=>node?.children[index],element);
    if(target?.tagName===focus.tag&&JSON.stringify([target.id,target.type,target.name,{...target.dataset}])===focus.identity){
      target.focus({preventScroll:true});
      if(focus.start!==null&&focus.start!==undefined)target.setSelectionRange(focus.start,focus.end);
    }
  }
  element.scrollTop=scrollTop;element.scrollLeft=scrollLeft;
  return true;
}
