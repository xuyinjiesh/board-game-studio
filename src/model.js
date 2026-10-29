import {sharedDice} from './shared-assets.js';
export const VERSION = 1;
export const CARD_W = 160, CARD_H = 240;
export const COLORS = { orange:'#dd791d', lemon:'#dfba32', lime:'#75a646', ivory:'#e6ddcb' };
export const COLOR_NAMES = {orange:'橙色',lemon:'黄色',lime:'绿色',ivory:'象牙色'};
export const DEFAULT_SCATTER = 1;
export function uid(){return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function shuffled(items, random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function rollDieValue(die,random=Math.random){return die.faces[Math.floor(random()*die.faces.length)];}
export function baseObject(type,x,y,z=1){return {id:uid(),type,x,y,z,rotation:0,locked:false};}
export const canMoveObject=(o,mode='play')=>!!o&&!o.locked&&(mode==='edit'||!o.fixedPosition);
export const deckCapacity=o=>o.maxCards??500;
export const canReceiveCards=(deck,count)=>deck.type==='deck'&&!deck.locked&&deck.cards.length+count<=deckCapacity(deck);
export function createFixedPile(x,y){return {...baseObject('deck',x,y),name:'固定牌位',cards:[],fixedPosition:true,snapCards:true,maxCards:1,faceUp:true,width:CARD_W,height:CARD_H};}
// Keep each card's live face separate from the opening's fixed-face policy.
export const deckEntries=deck=>deck.cards.map((assetId,i)=>({assetId,faceUp:deck.cardFaces?.[i]??deck.faceUp!==false}));
export function replaceDeckEntries(deck,entries){
  deck.cards=entries.map(card=>card.assetId);
  if(entries.length)deck.faceUp=entries.at(-1).faceUp;
  if(entries.some(card=>card.faceUp!==deck.faceUp))deck.cardFaces=entries.map(card=>card.faceUp);
  else delete deck.cardFaces;
}
export function takeDeckCard(deck,index=deck.cards.length-1){
  if(index<0||index>=deck.cards.length)return null;
  const entries=deckEntries(deck),[card]=entries.splice(index,1);replaceDeckEntries(deck,entries);return card;
}
export function appendDeckEntries(deck,entries){replaceDeckEntries(deck,[...deckEntries(deck),...entries]);}
export function setDeckFace(deck,faceUp){deck.faceUp=faceUp;delete deck.cardFaces;}
export function flipDeck(deck){const faceUp=deck.faceUp===false;replaceDeckEntries(deck,deckEntries(deck).map(card=>({...card,faceUp:!card.faceUp})));if(!deck.cards.length)deck.faceUp=faceUp;}
export function flipTopCard(deck){
  if(deck?.type!=='deck'||deck.locked||!deck.cards.length)return false;
  const entries=deckEntries(deck);entries.at(-1).faceUp=!entries.at(-1).faceUp;replaceDeckEntries(deck,entries);return true;
}
export function shuffleDeck(deck,random=Math.random){replaceDeckEntries(deck,shuffled(deckEntries(deck),random));}
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
export function dimensions(state,o){if(['card','deck','deal'].includes(o.type)) {const a=assetFor(state,o.type==='deck'?o.cards.at(-1):o.assetId);return {w:o.width||a?.width||CARD_W,h:o.height||a?.height||CARD_H};}if(o.type==='board')return {w:o.width||640,h:o.height||440};if(o.type==='die')return {w:o.width||50,h:o.height||50};return {w:o.width||58,h:o.height||58};}
export function pointOnObject(state,o,x,y){const a=-o.rotation*Math.PI/180,dx=x-o.x,dy=y-o.y;const px=dx*Math.cos(a)-dy*Math.sin(a),py=dx*Math.sin(a)+dy*Math.cos(a);const {w,h}=dimensions(state,o);return {inside:Math.abs(px)<=w/2&&Math.abs(py)<=h/2,px,py,w,h};}
export function objectsInRect(state,rect){
  const cx=(rect.left+rect.right)/2,cy=(rect.top+rect.bottom)/2,hw=(rect.right-rect.left)/2,hh=(rect.bottom-rect.top)/2;
  return state.objects.filter(o=>{
    // The board is the surface underneath the pieces; select it explicitly.
    if(!canMoveObject(o,state.mode)||o.type==='board')return false;
    const {w,h}=dimensions(state,o),angle=o.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=o.x-cx,dy=o.y-cy;
    return Math.abs(dx)<=hw+Math.abs(c)*w/2+Math.abs(s)*h/2&&
      Math.abs(dy)<=hh+Math.abs(s)*w/2+Math.abs(c)*h/2&&
      Math.abs(dx*c+dy*s)<=w/2+hw*Math.abs(c)+hh*Math.abs(s)&&
      Math.abs(-dx*s+dy*c)<=h/2+hw*Math.abs(s)+hh*Math.abs(c);
  });
}
export function drawDestination(state,source){
  const target=source.drawTarget;
  if(!target)return source;
  const mode=target.mode||'position';
  if(mode==='position')return target;
  if(mode==='deck'){
    const deck=state.objects.find(o=>o.type==='deck'&&o.drawKey===target.deckKey);
    if(!deck)throw new Error('目标牌堆已移除或尚未生成，请重新设置发牌位置');
    if(deck===source)throw new Error('不能发牌到来源牌堆自身');
    if(deck.locked)throw new Error('目标牌堆已锁定，请先解锁');
    if(!canReceiveCards(deck,1))throw new Error(`目标牌堆已满（最多 ${deckCapacity(deck)} 张）`);
    return {...deck,deck};
  }
  const {w,h}=dimensions(state,source),a=(source.rotation||0)*Math.PI/180;
  const dx=Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*h+(target.gap??30);
  const dy=Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*h+(target.gap??30);
  return {x:Math.max(-10000,Math.min(10000,source.x+(mode==='right'?dx:mode==='left'?-dx:0))),y:Math.max(-10000,Math.min(10000,source.y+(mode==='below'?dy:mode==='above'?-dy:0))),rotation:source.rotation||0};
}
export function drawFromDeck(state,deck,faceUp,destination){
  return drawDeckCard(state,deck,deck.cards.length-1,faceUp,destination);
}
export function drawDeckCard(state,deck,index,faceUp,destination){
  if(deck.locked||!Number.isInteger(index)||index<0||index>=deck.cards.length)return null;
  destination??=drawDestination(state,deck);
  if(destination.deck){const target=destination.deck;if(target===deck||!canReceiveCards(target,1))throw new Error('目标牌堆无法接收卡牌');const entry=takeDeckCard(deck,index);if(faceUp!==undefined)entry.faceUp=faceUp;appendDeckEntries(target,[entry]);return target;}
  const entry=takeDeckCard(deck,index),card={...baseObject('card',destination.x,destination.y,nextZ(state)),...entry,faceUp:faceUp??entry.faceUp,rotation:destination.rotation??0,...(deck.ihRole&&deck.maxCards===1?{ihRole:deck.ihRole}:{}),...(deck.width?{width:deck.width}:{}),...(deck.height?{height:deck.height}:{})};state.objects.push(card);return card;
}
export function mergeCards(state,ids,{targetId}={}){
  const selected=state.objects.filter(o=>ids.includes(o.id)&&['card','deck'].includes(o.type)&&!o.locked).sort((a,b)=>a.z-b.z);
  if(selected.length<2)return null;
  const fixed=selected.filter(o=>o.fixedPosition);
  const destination=targetId===undefined?null:selected.find(o=>o.id===targetId&&o.type==='deck');
  if(targetId!==undefined&&!destination)return null;
  const sources=selected.filter(o=>o.type==='deck'&&state.objects.some(slot=>slot.type==='deal'&&slot.sourceKey===o.setupKey));
  if(sources.length>1)return null;
  if(fixed.length||destination){
    if(fixed.length>1||fixed.length&&(fixed[0].type!=='deck'||destination&&destination!==fixed[0]))return null;
    const deck=destination||fixed[0],incoming=selected.filter(o=>o!==deck);
    if(sources.some(source=>source!==deck))return null;
    if(!canReceiveCards(deck,incoming.reduce((n,o)=>n+(o.type==='deck'?o.cards.length:1),0)))return null;
    const incomingKeys=new Set(incoming.map(o=>o.drawKey).filter(Boolean));
    if(incomingKeys.size){
      deck.drawKey||=uid();
      for(const o of state.objects)if(o.drawTarget?.mode==='deck'&&incomingKeys.has(o.drawTarget.deckKey))o.drawTarget.deckKey=deck.drawKey;
      if(deck.drawTarget?.mode==='deck'&&deck.drawTarget.deckKey===deck.drawKey)delete deck.drawTarget;
    }
    appendDeckEntries(deck,incoming.flatMap(o=>o.type==='deck'?deckEntries(o):[{assetId:o.assetId,faceUp:o.faceUp!==false}]));
    state.objects=state.objects.filter(o=>!incoming.includes(o));
    return deck;
  }
  const target=selected.at(-1), cards=selected.flatMap(o=>o.type==='deck'?o.cards:[o.assetId]);
  const policy=sources[0]||selected.filter(o=>o.type==='deck').at(-1)||target;
  if(cards.length>deckCapacity(policy))return null;
  const deck={...baseObject('deck',target.x,target.y,nextZ(state)),cards,faceUp:target.faceUp,rotation:target.rotation,name:policy.type==='deck'?policy.name:'组合牌堆',...(policy.setupOrder?{setupOrder:policy.setupOrder}:{}),...(policy.setupFace?{setupFace:policy.setupFace}:{}),...(policy.setupKey?{setupKey:policy.setupKey}:{}),...(policy.setupHideEmpty?{setupHideEmpty:true}:{}),...(policy.drawKey?{drawKey:policy.drawKey}:{}),...(policy.drawTarget?{drawTarget:structuredClone(policy.drawTarget)}:{})};
  const oldKeys=new Set(selected.map(o=>o.drawKey).filter(Boolean));
  replaceDeckEntries(deck,selected.flatMap(o=>o.type==='deck'?deckEntries(o):[{assetId:o.assetId,faceUp:o.faceUp!==false}]));
  if(policy.maxCards!==undefined)deck.maxCards=policy.maxCards;
  if(policy.snapCards!==undefined)deck.snapCards=policy.snapCards;
  deck.drawKey||=oldKeys.values().next().value;
  for(const o of state.objects)if(o.drawTarget?.mode==='deck'&&oldKeys.has(o.drawTarget.deckKey))o.drawTarget.deckKey=deck.drawKey;
  if(deck.drawTarget?.mode==='deck'&&oldKeys.has(deck.drawTarget.deckKey))delete deck.drawTarget;
  state.objects=state.objects.filter(o=>!selected.some(s=>s.id===o.id));state.objects.push(deck);return deck;
}
export function validateSession(raw){
  if(!raw||raw.version!==VERSION||!Array.isArray(raw.objects)||!Array.isArray(raw.assets)||!raw.settings)throw new Error('不是支持的桌面存档');
  if(raw.objects.length>1000||raw.assets.length>1000)throw new Error('存档过大（最多 1000 个物件和 1000 份资产）');
  const assets=new Map();
  const safeImage=s=>typeof s==='string'&&s.length<12000000&&(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)||/^\/assets\/[A-Za-z0-9/_-]+\.(webp|png|jpg|jpeg)$/.test(s));
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  for(const a of raw.assets){if(!a||typeof a.id!=='string'||assets.has(a.id)||!['card','board','token'].includes(a.type)||typeof a.name!=='string'||a.name.length>100||!safeImage(a.front)||a.back&&!safeImage(a.back)||!finite(a.width,20,2000)||!finite(a.height,20,2000))throw new Error('存档中的资产无效');assets.set(a.id,a);}
  const ids=new Set(),setupKeys=new Set(),drawKeys=new Set();
  for(const o of raw.objects){
    if(!o||typeof o.id!=='string'||ids.has(o.id)||!['card','deck','die','token','board','deal'].includes(o.type)||!finite(o.x,-10000,10000)||!finite(o.y,-10000,10000)||!finite(o.z,-10000,1000000)||!finite(o.rotation,-100000,100000))throw new Error('存档中的物件无效');
    ids.add(o.id);
    if(['card','board'].includes(o.type)&&!assets.has(o.assetId))throw new Error('存档缺少图片资产');
    if(o.type==='deck'&&(!Array.isArray(o.cards)||o.cards.length>500||o.cards.some(id=>!assets.has(id))))throw new Error('牌堆数据无效');
    if(o.cardFaces!==undefined&&(o.type!=='deck'||!Array.isArray(o.cardFaces)||o.cardFaces.length!==o.cards.length||o.cardFaces.some(face=>typeof face!=='boolean')||o.cards.length&&o.cardFaces.at(-1)!==(o.faceUp!==false)))throw new Error('牌堆卡牌朝向无效');
    if(o.type==='die'&&(!Array.isArray(o.faces)||![6,12].includes(o.faces.length)||o.faces.some(v=>!finite(v,1,100))||!o.faces.includes(o.value)||!Object.hasOwn(COLORS,o.color)))throw new Error('骰子数据无效');
    if(o.skin!==undefined&&(o.type!=='die'||!sharedDice.some(d=>d.skin===o.skin&&o.faces.length===d.faces.length&&o.faces.every(v=>d.faces.includes(v)))))throw new Error('骰子外观无效');
    if(o.type==='token'&&(typeof o.kind!=='string'||o.kind.length>100||o.kind==='custom'&&!assets.has(o.assetId)))throw new Error('标记数据无效');
    if(o.type==='token'&&o.value!==undefined&&!finite(o.value,-999,999))throw new Error('标记数值无效');
    if(o.width!==undefined&&!finite(o.width,20,2000)||o.height!==undefined&&!finite(o.height,20,2000))throw new Error('物件尺寸无效');
    if(o.lockAspect!==undefined&&(!['card','deck','board','deal'].includes(o.type)||typeof o.lockAspect!=='boolean'))throw new Error('尺寸比例设置无效');
    const pileSettings=o.type==='deck'||o.type==='deal'&&o.layout==='deck';
    if(o.fixedPosition!==undefined&&(!pileSettings||typeof o.fixedPosition!=='boolean'))throw new Error('固定牌位设置无效');
    if(o.maxCards!==undefined&&(!pileSettings||!Number.isInteger(o.maxCards)||o.maxCards<1||o.maxCards>500||(o.type==='deck'?o.cards.length:o.count)>o.maxCards))throw new Error('牌堆容量无效或已超出容量');
    if(o.snapCards!==undefined&&(!(pileSettings||o.type==='card')||typeof o.snapCards!=='boolean'))throw new Error('卡牌吸附设置无效');
    const drawOwner=o.type==='deck'||o.type==='deal'&&o.layout==='deck';
    if(o.drawKey!==undefined){if(!drawOwner||typeof o.drawKey!=='string'||!o.drawKey||o.drawKey.length>100||drawKeys.has(o.drawKey))throw new Error('发牌目标编号无效或重复');drawKeys.add(o.drawKey);}
    if(o.drawTarget!==undefined){
      const t=o.drawTarget,mode=t?.mode||'position';
      if(!drawOwner||!t||!['position','deck','right','left','above','below','center'].includes(mode)||
        mode==='position'&&(!finite(t.x,-10000,10000)||!finite(t.y,-10000,10000)||!finite(t.rotation,-360,360))||
        mode==='deck'&&(typeof t.deckKey!=='string'||t.deckKey.length>100||t.deckKey===o.drawKey)||
        !['position','deck'].includes(mode)&&t.gap!==undefined&&!finite(t.gap,0,2000))throw new Error('点击发牌位置无效');
    }
    if(o.setupOrder!==undefined&&(o.type!=='deck'||!['fixed','shuffle'].includes(o.setupOrder)))throw new Error('开局牌序设置无效');
    if(o.setupFace!==undefined&&(!['card','deck','token','die','deal'].includes(o.type)||!['fixed','random'].includes(o.setupFace)))throw new Error('开局朝向设置无效');
    if(o.faceUp!==undefined&&typeof o.faceUp!=='boolean')throw new Error('物件正背面设置无效');
    if(o.setupKey!==undefined){if(o.type!=='deck'||typeof o.setupKey!=='string'||!o.setupKey||o.setupKey.length>100||setupKeys.has(o.setupKey))throw new Error('发牌来源编号无效或重复');setupKeys.add(o.setupKey);}
    if(o.setupHideEmpty!==undefined&&(o.type!=='deck'||typeof o.setupHideEmpty!=='boolean'))throw new Error('空牌堆设置无效');
    if(o.type==='deal'&&(typeof o.sourceKey!=='string'||!o.sourceKey||o.sourceKey.length>100||!Number.isInteger(o.count)||!finite(o.count,1,500)||!['spread','deck'].includes(o.layout)||!finite(o.spacing,0,2000)||typeof o.name!=='string'||!o.name.trim()||o.name.length>100))throw new Error('开局发牌位置无效');
    if(o.type==='deal'&&o.order!==undefined&&(!Number.isInteger(o.order)||!finite(o.order,1,1000)))throw new Error('发牌先后顺序无效');
  }
  validateDeals(raw.objects);
  if(!finite(raw.settings.scatter,0,12)||!['forest','linen','night'].includes(raw.settings.theme)||!['play','edit'].includes(raw.mode))throw new Error('桌面设置无效');
  if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100)throw new Error('项目名称无效');
  if(raw.setupDraft!==undefined&&(typeof raw.setupDraft!=='string'||raw.setupDraft.length>1000000))throw new Error('初始设置草稿无效或过大');
  if(raw.awaitingOpening!==undefined&&typeof raw.awaitingOpening!=='boolean')throw new Error('开局选择状态无效');
  if(raw.gameId!==undefined&&(typeof raw.gameId!=='string'||raw.gameId.length>100))throw new Error('游戏类型无效');
  if(raw.projectId!==undefined&&(typeof raw.projectId!=='string'||!raw.projectId||raw.projectId.length>100))throw new Error('项目编号无效');
  if(raw.meta!==undefined){if(!raw.meta||typeof raw.meta!=='object')throw new Error('项目资料无效');for(const key of ['description','players','duration','rules'])if(raw.meta[key]!==undefined&&(typeof raw.meta[key]!=='string'||raw.meta[key].length>(key==='rules'?20000:1000)))throw new Error('项目资料过长或无效');}
  const result=structuredClone(raw);
  if(raw.setup!==undefined)result.setup=validateSetup(raw.setup,raw);
  if(raw.initialSetup!==undefined)result.initialSetup=validateSetup(raw.initialSetup,raw);
  if(raw.setupProfiles!==undefined){
    if(!Array.isArray(raw.setupProfiles)||!raw.setupProfiles.length||raw.setupProfiles.length>64)throw new Error('最多保存 64 个角色开局方案');
    const profileIds=new Set();
    result.setupProfiles=raw.setupProfiles.map(p=>{
      if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||profileIds.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw new Error('角色开局方案无效');
      if(p.coverAssetId!==undefined&&(typeof p.coverAssetId!=='string'||p.coverAssetId!==''&&assets.get(p.coverAssetId)?.type!=='card'))throw new Error('角色方案封面无效');
      if(p.description!==undefined&&(typeof p.description!=='string'||p.description.length>300))throw new Error('开局说明最多 300 字');
      profileIds.add(p.id);
      return {id:p.id,name:p.name.trim(),setup:validateSetup(p.setup,raw),...(p.coverAssetId!==undefined?{coverAssetId:p.coverAssetId}:{}),...(p.description!==undefined?{description:p.description}: {})};
    });
    if(!profileIds.has(raw.activeSetupProfileId))throw new Error('当前角色开局方案不存在');
  }else if(raw.activeSetupProfileId!==undefined)throw new Error('缺少角色开局方案');
  return result;
}

// Setup uses the same object vocabulary as the tabletop, without runtime IDs.
export function captureSetup(state,options={}){
  return {name:options.name??'我的初始设置',randomizeCards:options.randomizeCards??false,shuffleDecks:options.shuffleDecks??false,rollDice:options.rollDice??false,objects:state.objects.map(({id,...object})=>structuredClone(object))};
}
export function validateSetup(raw,state){
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||!Array.isArray(raw.objects))throw new Error('初始设置需要名称和 objects 物件列表');
  for(const key of ['randomizeCards','shuffleDecks','rollDice'])if(typeof raw[key]!=='boolean')throw new Error(`${key} 请填写 true 或 false`);
  const objects=raw.objects.map((o,i)=>({...o,id:`setup-${i}`}));
  // Validate all references and numbers, but never recursively validate a setup.
  const {setup,initialSetup,setupProfiles,activeSetupProfileId,...session}=state;
  validateSession({...session,objects});
  validateDeals(objects);
  return {name:raw.name.trim(),randomizeCards:raw.randomizeCards,shuffleDecks:raw.shuffleDecks,rollDice:raw.rollDice,objects:objects.map(({id,...o})=>o)};
}
export function applySetup(state,setup=state.setup||state.initialSetup,random=Math.random){
  const valid=validateSetup(setup,state),objects=valid.objects.map(o=>({...structuredClone(o),id:uid()}));
  if(valid.randomizeCards){
    const randomized=objects.filter(o=>o.setupOrder===undefined);
    const pool=shuffled(randomized.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]),random);
    let index=0;
    for(const o of randomized)if(o.type==='card')o.assetId=pool[index++];else if(o.type==='deck'){const count=o.cards.length;o.cards=pool.slice(index,index+count);index+=count;}
  }
  for(const o of objects){
    if(o.type==='deck')delete o.cardFaces;
    if(o.type==='deck'&&(o.setupOrder==='shuffle'||o.setupOrder===undefined&&valid.shuffleDecks))o.cards=shuffled(o.cards,random);
    if(o.type==='die'&&(o.setupFace==='random'||o.setupFace===undefined&&valid.rollDice))o.value=o.faces[Math.floor(random()*o.faces.length)];
    if(['card','deck','token'].includes(o.type)&&o.setupFace==='random')o.faceUp=random()>=.5;
  }
  const decks=new Map(objects.filter(o=>o.type==='deck'&&o.setupKey).map(o=>[o.setupKey,o]));
  const dealt=[];
  for(const slot of objects.filter(o=>o.type==='deal').map((o,index)=>({o,index})).sort((a,b)=>(a.o.order??a.index+1)-(b.o.order??b.index+1)).map(entry=>entry.o)){
    const source=decks.get(slot.sourceKey),cards=Array.from({length:slot.count},()=>source.cards.pop());
    const {id,type,sourceKey,count,layout,spacing,setupFace,...placement}=slot;
    if(layout==='deck')dealt.push({...placement,...baseObject('deck',slot.x,slot.y,slot.z),locked:slot.locked,rotation:slot.rotation,cards:cards.reverse(),name:slot.name,faceUp:slot.setupFace==='random'?random()>=.5:slot.faceUp!==false});
    else for(const [i,assetId] of cards.entries()){
      const angle=slot.rotation*Math.PI/180;
      dealt.push({...placement,...baseObject('card',slot.x+i*slot.spacing*Math.cos(angle),slot.y+i*slot.spacing*Math.sin(angle),slot.z+i/1000),locked:slot.locked,rotation:slot.rotation,assetId,faceUp:slot.setupFace==='random'?random()>=.5:slot.faceUp!==false});
    }
  }
  return {...state,objects:[...objects.filter(o=>o.type!=='deal'&&!(o.type==='deck'&&o.setupHideEmpty&&!o.cards.length)),...dealt]};
}

export function validateDeals(objects){
  const sources=new Map(objects.filter(o=>o.type==='deck'&&o.setupKey).map(o=>[o.setupKey,o])),used=new Map();
  let count=objects.filter(o=>o.type!=='deal').length;
  for(const slot of objects.filter(o=>o.type==='deal')){
    const source=sources.get(slot.sourceKey);if(!source)throw new Error(`「${slot.name}」缺少来源牌堆`);
    const total=(used.get(slot.sourceKey)||0)+slot.count;used.set(slot.sourceKey,total);
    if(total>source.cards.length)throw new Error(`「${source.name||'来源牌堆'}」需要发 ${total} 张，但只有 ${source.cards.length} 张`);
    count+=slot.layout==='deck'?1:slot.count;
    if(slot.layout==='spread'){
      const angle=slot.rotation*Math.PI/180,x=slot.x+(slot.count-1)*slot.spacing*Math.cos(angle),y=slot.y+(slot.count-1)*slot.spacing*Math.sin(angle);
      if(Math.abs(x)>10000||Math.abs(y)>10000)throw new Error(`「${slot.name}」展开后超出桌面范围，请减小间距`);
    }
  }
  for(const [key,source] of sources)if(source.setupHideEmpty&&used.get(key)===source.cards.length)count--;
  if(count>1000)throw new Error('开局发牌后超过 1000 个物件');
}

export function createDealSlot(state,source){
  if(source?.type!=='deck')throw new Error('请先选择来源牌堆');
  const available=source.cards.length-state.objects.filter(o=>o.type==='deal'&&o.sourceKey===source.setupKey).reduce((sum,o)=>sum+o.count,0);
  if(available<1)throw new Error('这个牌堆已没有可分配的初始牌');
  source.setupKey||=uid();const {w,h}=dimensions(state,source);
  return {...baseObject('deal',Math.max(-10000,Math.min(10000,source.x+w+60)),source.y,nextZ(state)),name:'初始牌位',sourceKey:source.setupKey,count:1,layout:'spread',spacing:40,order:Math.min(1000,Math.max(0,...state.objects.filter(o=>o.type==='deal').map((o,index)=>o.order??index+1))+1),faceUp:true,width:w,height:h,setupFace:'fixed'};
}
