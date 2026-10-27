export const VERSION = 1;
export const CARD_W = 160, CARD_H = 240;
export const COLORS = { orange:'#dd791d', lemon:'#dfba32', lime:'#75a646', ivory:'#e6ddcb' };
export const COLOR_NAMES = {orange:'橙色',lemon:'黄色',lime:'绿色',ivory:'象牙色'};
export const DEFAULT_SCATTER = 1;
export function uid(){return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function shuffled(items, random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function baseObject(type,x,y,z=1){return {id:uid(),type,x,y,z,rotation:0,locked:false};}
export function adjustTokenValue(state,object,delta,adjust){
  if(object?.type!=='token'||object.locked||!Number.isFinite(object.value)||![1,-1].includes(delta))return false;
  const before=object.value;
  if(adjust)adjust(state,object,delta);
  else object.value=Math.max(-999,Math.min(999,object.value+delta));
  return object.value!==before;
}
export function createSession(name='未命名游戏'){
  return {version:VERSION,projectId:uid(),gameId:'custom',name,meta:{description:'',players:'',duration:'',rules:''},objects:[],assets:[],settings:{sound:true,grid:false,snap:true,scatter:DEFAULT_SCATTER,scatterDefaultVersion:2,theme:'forest'},mode:'edit',createdAt:Date.now(),initialSetup:{name:'空白开局',randomizeCards:false,shuffleDecks:false,rollDice:false,objects:[]}};
}
export function assetFor(state,id){return state.assets.find(a=>a.id===id);}
export function nextZ(state){return Math.max(1,...state.objects.map(o=>o.z))+1;}
export function dimensions(state,o){if(o.type==='card'||o.type==='deck') {const a=assetFor(state,o.type==='deck'?o.cards.at(-1):o.assetId);return {w:o.width||a?.width||CARD_W,h:o.height||a?.height||CARD_H};}if(o.type==='board')return {w:o.width||640,h:o.height||440};if(o.type==='die')return {w:50,h:50};return {w:58,h:58};}
export function pointOnObject(state,o,x,y){const a=-o.rotation*Math.PI/180,dx=x-o.x,dy=y-o.y;const px=dx*Math.cos(a)-dy*Math.sin(a),py=dx*Math.sin(a)+dy*Math.cos(a);const {w,h}=dimensions(state,o);return {inside:Math.abs(px)<=w/2&&Math.abs(py)<=h/2,px,py,w,h};}
export function objectsInRect(state,rect){
  const cx=(rect.left+rect.right)/2,cy=(rect.top+rect.bottom)/2,hw=(rect.right-rect.left)/2,hh=(rect.bottom-rect.top)/2;
  return state.objects.filter(o=>{
    // The board is the surface underneath the pieces; select it explicitly.
    if(o.locked||o.type==='board')return false;
    const {w,h}=dimensions(state,o),angle=o.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=o.x-cx,dy=o.y-cy;
    return Math.abs(dx)<=hw+Math.abs(c)*w/2+Math.abs(s)*h/2&&
      Math.abs(dy)<=hh+Math.abs(s)*w/2+Math.abs(c)*h/2&&
      Math.abs(dx*c+dy*s)<=w/2+hw*Math.abs(c)+hh*Math.abs(s)&&
      Math.abs(-dx*s+dy*c)<=h/2+hw*Math.abs(s)+hh*Math.abs(c);
  });
}
export function drawFromDeck(state,deck){if(!deck.cards.length)return null;const assetId=deck.cards.pop();const card={...baseObject('card',deck.x+205,deck.y,nextZ(state)),assetId,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};state.objects.push(card);return card;}
export function mergeCards(state,ids){
  const selected=state.objects.filter(o=>ids.includes(o.id)&&['card','deck'].includes(o.type)&&!o.locked).sort((a,b)=>a.z-b.z);
  if(selected.length<2)return null;
  const target=selected.at(-1), cards=selected.flatMap(o=>o.type==='deck'?o.cards:[o.assetId]);
  const deck={...baseObject('deck',target.x,target.y,nextZ(state)),cards,faceUp:target.faceUp,rotation:target.rotation,name:'组合牌堆'};
  state.objects=state.objects.filter(o=>!selected.some(s=>s.id===o.id));state.objects.push(deck);return deck;
}
export function validateSession(raw){
  if(!raw||raw.version!==VERSION||!Array.isArray(raw.objects)||!Array.isArray(raw.assets)||!raw.settings)throw new Error('不是支持的桌面存档');
  if(raw.objects.length>1000||raw.assets.length>300)throw new Error('存档过大（最多 1000 个物件）');
  const assets=new Map();
  const safeImage=s=>typeof s==='string'&&s.length<12000000&&(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)||/^\/assets\/[A-Za-z0-9/_-]+\.(webp|png|jpg|jpeg)$/.test(s));
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  for(const a of raw.assets){if(!a||typeof a.id!=='string'||assets.has(a.id)||!['card','board','token'].includes(a.type)||typeof a.name!=='string'||a.name.length>100||!safeImage(a.front)||a.back&&!safeImage(a.back)||!finite(a.width,20,2000)||!finite(a.height,20,2000))throw new Error('存档中的资产无效');assets.set(a.id,a);}
  const ids=new Set();
  for(const o of raw.objects){
    if(!o||typeof o.id!=='string'||ids.has(o.id)||!['card','deck','die','token','board'].includes(o.type)||!finite(o.x,-10000,10000)||!finite(o.y,-10000,10000)||!finite(o.z,-10000,1000000)||!finite(o.rotation,-100000,100000))throw new Error('存档中的物件无效');
    ids.add(o.id);
    if(['card','board'].includes(o.type)&&!assets.has(o.assetId))throw new Error('存档缺少图片资产');
    if(o.type==='deck'&&(!Array.isArray(o.cards)||o.cards.length>500||o.cards.some(id=>!assets.has(id))))throw new Error('牌堆数据无效');
    if(o.type==='die'&&(!Array.isArray(o.faces)||o.faces.length!==6||o.faces.some(v=>!finite(v,1,100))||!o.faces.includes(o.value)||!Object.hasOwn(COLORS,o.color)))throw new Error('骰子数据无效');
    if(o.type==='token'&&(typeof o.kind!=='string'||o.kind.length>100||o.kind==='custom'&&!assets.has(o.assetId)))throw new Error('标记数据无效');
    if(o.type==='token'&&o.value!==undefined&&!finite(o.value,-999,999))throw new Error('标记数值无效');
    if(o.width!==undefined&&!finite(o.width,20,2000)||o.height!==undefined&&!finite(o.height,20,2000))throw new Error('物件尺寸无效');
  }
  if(!finite(raw.settings.scatter,0,12)||!['forest','linen','night'].includes(raw.settings.theme)||!['play','edit'].includes(raw.mode))throw new Error('桌面设置无效');
  if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100)throw new Error('项目名称无效');
  if(raw.setupDraft!==undefined&&(typeof raw.setupDraft!=='string'||raw.setupDraft.length>1000000))throw new Error('初始设置草稿无效或过大');
  if(raw.gameId!==undefined&&(typeof raw.gameId!=='string'||raw.gameId.length>100))throw new Error('游戏类型无效');
  if(raw.projectId!==undefined&&(typeof raw.projectId!=='string'||!raw.projectId||raw.projectId.length>100))throw new Error('项目编号无效');
  if(raw.meta!==undefined){if(!raw.meta||typeof raw.meta!=='object')throw new Error('项目资料无效');for(const key of ['description','players','duration','rules'])if(raw.meta[key]!==undefined&&(typeof raw.meta[key]!=='string'||raw.meta[key].length>(key==='rules'?20000:1000)))throw new Error('项目资料过长或无效');}
  const result=structuredClone(raw);
  if(raw.setup!==undefined)result.setup=validateSetup(raw.setup,raw);
  if(raw.initialSetup!==undefined)result.initialSetup=validateSetup(raw.initialSetup,raw);
  return result;
}

// Setup uses the same object vocabulary as the tabletop, without runtime IDs.
export function captureSetup(state){
  return {name:'我的初始设置',randomizeCards:false,shuffleDecks:false,rollDice:false,objects:state.objects.map(({id,...object})=>structuredClone(object))};
}
export function validateSetup(raw,state){
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||!Array.isArray(raw.objects))throw new Error('初始设置需要名称和 objects 物件列表');
  for(const key of ['randomizeCards','shuffleDecks','rollDice'])if(typeof raw[key]!=='boolean')throw new Error(`${key} 请填写 true 或 false`);
  const objects=raw.objects.map((o,i)=>({...o,id:`setup-${i}`}));
  // Validate all references and numbers, but never recursively validate a setup.
  const {setup,initialSetup,...session}=state;
  validateSession({...session,objects});
  return {name:raw.name.trim(),randomizeCards:raw.randomizeCards,shuffleDecks:raw.shuffleDecks,rollDice:raw.rollDice,objects:objects.map(({id,...o})=>o)};
}
export function applySetup(state,setup=state.setup||state.initialSetup,random=Math.random){
  const valid=validateSetup(setup,state),objects=valid.objects.map(o=>({...structuredClone(o),id:uid()}));
  if(valid.randomizeCards){
    const pool=shuffled(objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]),random);
    let index=0;
    for(const o of objects)if(o.type==='card')o.assetId=pool[index++];else if(o.type==='deck'){const count=o.cards.length;o.cards=pool.slice(index,index+count);index+=count;}
  }
  for(const o of objects){
    if(valid.shuffleDecks&&o.type==='deck')o.cards=shuffled(o.cards,random);
    if(valid.rollDice&&o.type==='die')o.value=o.faces[Math.floor(random()*o.faces.length)];
  }
  return {...state,objects};
}
