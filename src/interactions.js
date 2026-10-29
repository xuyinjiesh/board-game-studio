import {pointOnObject,dimensions,nextZ,canMoveObject,canReceiveCards,mergeCards} from './model.js';

// Align parallel card edges without centering the cards or making a pile.
// An axis that is outside the tolerance keeps its original offset, allowing
// a ruler to slide over a fief while its left/right edges stay aligned.
export function cardEdgePlacement(state,moving,{threshold=16}={}){
  if(!state.settings.snap||moving?.type!=='card'||moving.locked||moving.handId&&state.mode==='play')return null;
  let best=null;
  const mw=dimensions(state,moving);
  for(const target of state.objects){
    if(target.id===moving.id||target.type!=='card'||target.handId&&state.mode==='play')continue;
    const delta=((moving.rotation-target.rotation+180)%360+360)%360-180,turn=Math.round(delta/90);
    if(Math.abs(delta-turn*90)>5)continue;
    const p=pointOnObject(state,target,moving.x,moving.y),tw=dimensions(state,target);
    const w=Math.abs(turn)%2?mw.h:mw.w,h=Math.abs(turn)%2?mw.w:mw.h;
    if(Math.abs(p.px)>(tw.w+w)/2+threshold||Math.abs(p.py)>(tw.h+h)/2+threshold)continue;
    const nearest=(value,edges)=>edges.map(([position,edge])=>({position,edge,gap:Math.abs(value-position)})).filter(e=>e.gap<=threshold).sort((a,b)=>a.gap-b.gap)[0];
    const sx=nearest(p.px,[[-tw.w/2+w/2,-tw.w/2],[tw.w/2-w/2,tw.w/2],[-tw.w/2-w/2,-tw.w/2],[tw.w/2+w/2,tw.w/2]]);
    const sy=nearest(p.py,[[-tw.h/2+h/2,-tw.h/2],[tw.h/2-h/2,tw.h/2],[-tw.h/2-h/2,-tw.h/2],[tw.h/2+h/2,tw.h/2]]);
    if(!sx&&!sy)continue;
    const x=sx?.position??p.px,y=sy?.position??p.py,a=target.rotation*Math.PI/180;
    const world=(x,y)=>({x:target.x+x*Math.cos(a)-y*Math.sin(a),y:target.y+x*Math.sin(a)+y*Math.cos(a)});
    const guides=[];
    if(sx)guides.push({from:world(sx.edge,Math.min(-tw.h/2,y-h/2)-18),to:world(sx.edge,Math.max(tw.h/2,y+h/2)+18)});
    if(sy)guides.push({from:world(Math.min(-tw.w/2,x-w/2)-18,sy.edge),to:world(Math.max(tw.w/2,x+w/2)+18,sy.edge)});
    const distance=Math.hypot(p.px,p.py);
    if(!best||distance<best.distance)best={...world(x,y),rotation:((target.rotation+turn*90)%360+360)%360,kind:'edge',guides,distance};
  }
  return best;
}

export const DECK_HOLD_MS=500;
export const DECK_BOTTOM_HOVER_MS=800;
// One uninterrupted hover over the same receiving pile arms a bottom drop.
// Leaving it or entering a different pile starts a fresh hold.
export function createDeckBottomHover(onReady,{schedule=setTimeout,cancel=clearTimeout}={}){
  let targetId=null,ready=false,timer=null,generation=0;
  return {
    update(nextId){
      nextId??=null;if(nextId===targetId)return;
      if(timer!==null)cancel(timer);timer=null;targetId=nextId;ready=false;generation++;
      if(targetId!==null){const expected=targetId,revision=generation;timer=schedule(()=>{
        if(generation!==revision||targetId!==expected||ready)return;timer=null;ready=true;onReady(expected);
      },DECK_BOTTOM_HOVER_MS);}
    },
    readyFor(id){return ready&&targetId===id;},
    cancel(){if(timer!==null)cancel(timer);timer=null;targetId=null;ready=false;generation++;}
  };
}
export function startDeckMenuPress(onOpen,{schedule=setTimeout,cancel=clearTimeout}={}){
  let active=true;
  const timer=schedule(()=>{if(active){active=false;onOpen();}},DECK_HOLD_MS);
  const stop=()=>{if(active){active=false;cancel(timer);}};
  return {cancel:stop,finish:stop};
}
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
export function wheelIntent(event,object,{handTool=false,dragging=false,holding=false}={}){
  if(!Number.isFinite(event.deltaY)||event.deltaY===0||dragging&&!holding)return {kind:'none'};
  if(event.ctrlKey){
    if(dragging)return {kind:'none'};
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?800:1);
    return {kind:'zoom',factor:Math.exp(-Math.max(-700,Math.min(700,pixels))*.001)};
  }
  if(!handTool&&object?.type==='token'&&!object.locked&&Number.isFinite(object.value))return {kind:'counter',delta:event.deltaY<0?1:-1};
  if(!handTool&&object?.type==='die'&&!object.locked&&Number.isFinite(object.value))return {kind:'die-step',delta:event.deltaY<0?1:-1};
  if(!handTool&&!object?.locked&&['card','deck','token','board','deal'].includes(object?.type))return {kind:'rotate',delta:event.deltaY<0?1:-1};
  return {kind:'none'};
}
export const isPanGesture=(button,spaceDown)=>button===1||(button===0&&spaceDown);


export function findCardSnapTarget(state,moving,excludedIds=[moving?.id]){
  if(!canMoveObject(moving,state.mode)||moving.fixedPosition||!['card','deck'].includes(moving.type))return null;
  return state.objects.filter(o=>!(state.mode==='play'&&o.handId)&&!excludedIds.includes(o.id)&&!o.locked&&['card','deck'].includes(o.type)&&o.snapCards!==false&&(o.type!=='deck'||canReceiveCards(o,moving.type==='deck'?moving.cards.length:1)))
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
export function snapCardOnto(state,moving,target,{position='top'}={}){
  if(!canMoveObject(moving,state.mode)||!target||moving.id===target.id||target.locked||target.snapCards===false||![moving.type,target.type].every(type=>['card','deck'].includes(type)))return false;
  if(target.type==='deck')return !!mergeCards(state,[target.id,moving.id],{targetId:target.id,position});
  moving.x=target.x;moving.y=target.y;moving.rotation=target.rotation;moving.z=nextZ(state);
  return true;
}
