export const VERSION = 1;
export const CARD_W = 160, CARD_H = 240, CELL = 80;
export const COLORS = { orange:'#dd791d', lemon:'#dfba32', lime:'#75a646', ivory:'#e6ddcb' };
export const FRUIT_NAMES = { orange:'橘子', lemon:'柠檬', lime:'酸橙', ivory:'标准' };
export const GROVE_FACES = [2,3,4,5,6,10];
const layouts = {
  1:['l1','y2','o2','_','o1','l1'],3:['_','o1','l2','o2','y1','y1'],5:['_','o2','o1','y1','l2','y1'],
  7:['o2','_','y2','l1','l1','o1'],9:['y1','o2','l2','_','y1','l1'],11:['l1','l1','y2','o2','y1','_'],
  13:['y2','_','l2','o1','o1','y1'],15:['y2','l2','o1','y1','_','o1'],17:['o2','o1','l1','y2','l1','_'],
  6:['o1','l2','_','o1','y2','l1'],4:['y1','_','l1','y1','o2','l2'],2:['_','l1','l1','o1','y2','o1'],
  12:['o2','y2','l2','o1','_','y1'],10:['y1','o2','l1','_','y2','l1'],8:['l1','y2','y1','l1','o2','_'],
  18:['o1','l2','y2','_','l1','o1'],16:['l1','o2','_','y1','l2','y1'],14:['y1','l2','l1','o2','_','l1']
};
const fruitMap={l:'lime',y:'lemon',o:'orange'};
export const builtinAssets = Array.from({length:18},(_,i)=>({id:`grove-${i+1}`,type:'card',name:`果丛 · ${String(i+1).padStart(2,'0')}`,number:i+1,width:CARD_W,height:CARD_H,front:`/assets/card-${String(i+1).padStart(2,'0')}-front.webp`,back:`/assets/card-${String(i+1).padStart(2,'0')}-back.webp`,cells:layouts[i+1].map(s=>s==='_'?null:{fruit:fruitMap[s[0]],count:Number(s[1])})}));
export function uid(){return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function shuffled(items, random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function baseObject(type,x,y,z=1){return {id:uid(),type,x,y,z,rotation:0,locked:false};}
export function newGame(random=Math.random){
  const all=shuffled(builtinAssets.map(a=>a.id),random);
  const objects=[];
  objects.push({...baseObject('card',680,380,1),assetId:all[0],faceUp:true,planted:true});
  objects.push({...baseObject('card',590,820,3),assetId:all[1],faceUp:true,rotation:-3});
  objects.push({...baseObject('card',815,825,4),assetId:all[2],faceUp:true,rotation:2});
  objects.push({...baseObject('deck',245,360,2),cards:all.slice(3,9),faceUp:false,name:'本局牌堆',rotation:-3});
  objects.push({...baseObject('deck',245,740,2),cards:all.slice(9),faceUp:false,name:'下一局 · 备用',rotation:4,reserve:true});
  for(const [c,color] of ['orange','lemon','lime'].entries()) for(let r=0;r<5;r++) objects.push({...baseObject('die',1090+c*78,300+r*82,20+r),color,value:2,faces:[...GROVE_FACES],rotation:(random()-.5)*16});
  objects.push({...baseObject('token',1110,785,25),kind:'squirrel',color:'#b86231',name:'松鼠',rotation:-8});
  objects.push({...baseObject('token',1225,785,26),kind:'wheelbarrow',color:'#7fa75e',name:'独轮车',rotation:10});
  return {version:VERSION,name:'果丛 · 我的桌面',objects,assets:[],settings:{sound:true,grid:false,snap:true,scatter:3,theme:'forest'},mode:'play',createdAt:Date.now()};
}
export function assetFor(state,id){return [...builtinAssets,...state.assets].find(a=>a.id===id);}
export function nextZ(state){return Math.max(1,...state.objects.map(o=>o.z))+1;}
export function dimensions(state,o){if(o.type==='card') {const a=assetFor(state,o.assetId);return {w:o.width||a?.width||CARD_W,h:o.height||a?.height||CARD_H};}if(o.type==='deck')return {w:CARD_W,h:CARD_H};if(o.type==='board')return {w:o.width||640,h:o.height||440};if(o.type==='die')return {w:50,h:50};return {w:58,h:58};}
export function pointOnObject(state,o,x,y){const a=-o.rotation*Math.PI/180,dx=x-o.x,dy=y-o.y;const px=dx*Math.cos(a)-dy*Math.sin(a),py=dx*Math.sin(a)+dy*Math.cos(a);const {w,h}=dimensions(state,o);return {inside:Math.abs(px)<=w/2&&Math.abs(py)<=h/2,px,py,w,h};}
export function treeAt(state,x,y){
  const cards=state.objects.filter(o=>o.type==='card').sort((a,b)=>b.z-a.z);
  for(const card of cards){const p=pointOnObject(state,card,x,y);if(p.inside){const col=Math.min(1,Math.floor((p.px+p.w/2)/(p.w/2))),row=Math.min(2,Math.floor((p.py+p.h/2)/(p.h/3)));return {card,tree:card.faceUp?assetFor(state,card.assetId)?.cells?.[row*2+col]??null:null,index:row*2+col};}}
  return null;
}
export function scoreTable(state){
  const groups={orange:0,lemon:0,lime:0};let wheel=0,penalty=0;const scored=[];
  const squirrel=state.objects.find(o=>o.type==='token'&&o.kind==='squirrel'&&treeAt(state,o.x,o.y));
  for(const die of state.objects.filter(o=>o.type==='die')){const at=treeAt(state,die.x,die.y);if(at?.tree&&at.tree.fruit===die.color){groups[die.color]=(groups[die.color]||0)+die.value;scored.push(die);}}
  for(const token of state.objects.filter(o=>o.type==='token'&&o.kind==='wheelbarrow'))if(treeAt(state,token.x,token.y)?.tree)wheel+=15;
  if(squirrel){penalty=1;for(const die of scored){const dx=Math.abs(die.x-squirrel.x),dy=Math.abs(die.y-squirrel.y);if((dx<25&&Math.abs(dy-CELL)<25)||(dy<25&&Math.abs(dx-CELL)<25))penalty++;}}
  return {groups,wheel,penalty,total:Object.values(groups).reduce((a,b)=>a+b,0)+wheel-penalty,count:scored.length};
}
export function snapCard(o){const turns=Math.round(o.rotation/90);o.rotation=((turns%4)+4)%4;const horizontal=o.rotation%2===1;o.rotation*=90;o.x=Math.round((o.x-(horizontal?0:40))/80)*80+(horizontal?0:40);o.y=Math.round((o.y-(horizontal?20:60))/80)*80+(horizontal?20:60);return o;}
export function snapSmall(o){o.x=Math.round(o.x/80)*80;o.y=Math.round((o.y-60)/80)*80+60;return o;}
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
  const assets=new Map(builtinAssets.map(a=>[a.id,a]));
  const safeImage=s=>typeof s==='string'&&s.length<12000000&&(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)||/^\/assets\/card-\d{2}-(front|back)\.webp$/.test(s));
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  for(const a of raw.assets){if(!a||typeof a.id!=='string'||assets.has(a.id)||!['card','board','token'].includes(a.type)||typeof a.name!=='string'||a.name.length>100||!safeImage(a.front)||a.back&&!safeImage(a.back)||!finite(a.width,20,2000)||!finite(a.height,20,2000))throw new Error('存档中的资产无效');assets.set(a.id,a);}
  const ids=new Set();
  for(const o of raw.objects){
    if(!o||typeof o.id!=='string'||ids.has(o.id)||!['card','deck','die','token','board'].includes(o.type)||!finite(o.x,-10000,10000)||!finite(o.y,-10000,10000)||!finite(o.z,-10000,1000000)||!finite(o.rotation,-100000,100000))throw new Error('存档中的物件无效');
    ids.add(o.id);
    if(['card','board'].includes(o.type)&&!assets.has(o.assetId))throw new Error('存档缺少图片资产');
    if(o.type==='deck'&&(!Array.isArray(o.cards)||o.cards.length>500||o.cards.some(id=>!assets.has(id))))throw new Error('牌堆数据无效');
    if(o.type==='die'&&(!Array.isArray(o.faces)||o.faces.length!==6||o.faces.some(v=>!finite(v,1,100))||!o.faces.includes(o.value)||!Object.hasOwn(COLORS,o.color)))throw new Error('骰子数据无效');
    if(o.type==='token'&&(!['squirrel','wheelbarrow','disc','custom'].includes(o.kind)||o.kind==='custom'&&!assets.has(o.assetId)))throw new Error('标记数据无效');
    if(o.width!==undefined&&!finite(o.width,20,2000)||o.height!==undefined&&!finite(o.height,20,2000))throw new Error('物件尺寸无效');
  }
  if(!finite(raw.settings.scatter,0,12)||!['forest','linen','night'].includes(raw.settings.theme)||!['play','edit'].includes(raw.mode))throw new Error('桌面设置无效');
  return structuredClone(raw);
}
