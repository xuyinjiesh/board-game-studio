import {dimensions,canMoveObject} from './model.js';

export const canResize=o=>['card','deck','board','deal'].includes(o?.type);
const validSize=(w,h)=>Number.isFinite(w)&&Number.isFinite(h)&&w>=20&&w<=2000&&h>=20&&h<=2000;
export function resizeObjects(state,objects,axis,value){
  if(state.mode!=='edit'||!['width','height'].includes(axis))throw new Error('请在编辑中调整尺寸');
  const changes=objects.filter(o=>canResize(o)&&canMoveObject(o,'edit')).map(o=>{
    const {w,h}=dimensions(state,o),ratio=w/h;
    const width=axis==='width'?value:o.lockAspect===false?w:value*ratio;
    const height=axis==='height'?value:o.lockAspect===false?h:value/ratio;
    if(!validSize(width,height))throw new Error('宽度和高度应在 20–2000 之间');
    return {o,width,height};
  });
  for(const {o,width,height} of changes)Object.assign(o,{width,height});
}
export function matchObjectSize(state,objects,reference){
  if(state.mode!=='edit')throw new Error('请在编辑中匹配尺寸');
  const {w,h}=dimensions(state,reference);
  if(!validSize(w,h))throw new Error('参考尺寸无效');
  for(const o of objects.filter(o=>canResize(o)&&canMoveObject(o,'edit')))Object.assign(o,{width:w,height:h});
}
