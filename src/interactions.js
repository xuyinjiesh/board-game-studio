import {pointOnObject,nextZ,canMoveObject,canReceiveCards,mergeCards} from './model.js';

export const DECK_HOLD_MS=500;
export const DECK_CLICK_MS=500;
export function scheduleDeckDraw(onDraw,{schedule=setTimeout,cancel=clearTimeout}={}){
  let active=true;
  const timer=schedule(()=>{if(active){active=false;onDraw();}},DECK_CLICK_MS);
  return {cancel(){if(active){active=false;cancel(timer);}}};
}
export function startDeckPress(onHold,{schedule=setTimeout,cancel=clearTimeout,fixedPosition=false}={}){
  let mode='card',active=true;
  const timer=fixedPosition?null:schedule(()=>{if(active){mode='deck';onHold();}},DECK_HOLD_MS);
  return {
    finish(){if(active){active=false;if(timer!==null)cancel(timer);}return mode;},
    cancel(){active=false;if(timer!==null)cancel(timer);}
  };
}

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


export function findCardSnapTarget(state,moving,excludedIds=[moving?.id]){
  if(!canMoveObject(moving,state.mode)||moving.fixedPosition||!['card','deck'].includes(moving.type))return null;
  return state.objects.filter(o=>!excludedIds.includes(o.id)&&!o.locked&&['card','deck'].includes(o.type)&&o.snapCards!==false&&(o.type!=='deck'||canReceiveCards(o,moving.type==='deck'?moving.cards.length:1)))
    .sort((a,b)=>Number(!!b.fixedPosition)-Number(!!a.fixedPosition)||Number(b.type==='deck')-Number(a.type==='deck')||b.z-a.z)
    .find(o=>{
      const p=pointOnObject(state,o,moving.x,moving.y);
      // Only magnetize the center, leaving edge overlaps available for tile games.
      return Math.abs(p.px)<=Math.min(p.w*.3,56)&&Math.abs(p.py)<=Math.min(p.h*.25,64);
    })||null;
}
export function cardDropPlan(state,moving,excludedIds=[moving?.id],{forceMerge=false,placementFor}={}){
  const target=findCardSnapTarget(state,moving,excludedIds);
  if(target?.type==='deck')return {target,placement:null};
  const placement=!forceMerge&&state.settings.snap&&placementFor?.(state,moving);
  return placement?{target:null,placement}:{target,placement:null};
}
export function snapCardOnto(state,moving,target){
  if(!canMoveObject(moving,state.mode)||!target||moving.id===target.id||target.locked||target.snapCards===false||![moving.type,target.type].every(type=>['card','deck'].includes(type)))return false;
  if(target.type==='deck')return !!mergeCards(state,[target.id,moving.id],{targetId:target.id});
  moving.x=target.x;moving.y=target.y;moving.rotation=target.rotation;moving.z=nextZ(state);
  return true;
}
