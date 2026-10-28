import {baseObject,createFixedPile,deckEntries,appendDeckEntries,replaceDeckEntries,setDeckFace} from '../model.js';
import {sharedDice} from '../shared-assets.js';

export const markerColors={health:'#a84248',energy:'#874b91',blessing:'#874b91',weight:'#9c9484',gold:'#b8943c',rations:'#b8663b',poison:'#63823f',morality:'#9c9484',level:'#97764e',turn:'#586f80',eyes:'#536d95',foe:'#45433e'};
export const ironHelmTableAssets=[
  {id:'ih-playmat',type:'board',name:'铁盔 · 中文大牌垫',width:2000,height:2000*320/780,front:'/assets/iron-helm/playmat-cn.webp'},
  ...Object.keys(markerColors).map(key=>({id:`ih-marker-${key}`,type:'token',name:`铁盔方形标记 · ${key}`,width:28,height:28,front:`/assets/iron-helm/marker-${key==='weight'?'morality':key==='blessing'?'energy':key}.webp`}))
];
const boardFor=s=>s.objects.find(o=>o.type==='board'&&o.assetId==='ih-playmat');
// Coordinates follow the 1548 × 635 preview of the shared 780 × 320 mm mat.
export function matPoint(s,x,y){
  const b=boardFor(s),w=b?.width||2000,h=b?.height||2000*320/780;
  const dx=(x/1548-.5)*w,dy=(y/635-.5)*h,a=(b?.rotation||0)*Math.PI/180;
  return {x:(b?.x??1000)+dx*Math.cos(a)-dy*Math.sin(a),y:(b?.y??h/2)+dx*Math.sin(a)+dy*Math.cos(a)};
}
const row=(start,count,x,y,step=24)=>Array.from({length:count},(_,i)=>({value:start+i,x:x+i*step,y}));
const tracks={
  health:[{value:0,x:582,y:235},...row(1,7,625,218),...row(8,7,625,245),...row(15,4,625,272)],
  poison:[{value:0,x:600,y:262},...row(1,7,625,218),...row(8,7,625,245),...row(15,4,625,272)],
  blessing:[{value:0,x:865,y:465},...row(1,7,904,451,23),...row(8,5,904,476,23)],
  energy:[{value:0,x:582,y:325},...row(1,7,625,310),...row(8,7,625,337)],
  gold:[{value:0,x:582,y:106},...row(1,7,625,91),...row(8,5,625,118)],
  rations:[{value:0,x:582,y:158},...row(1,7,625,145),...row(8,3,625,172)],
  weight:[{value:0,x:582,y:49},...row(1,7,625,38),...row(8,7,625,65)],
  level:[[860,227],[897,284],[898,343],[838,263],[838,336]].map(([x,y],i)=>({value:i+1,x,y})),
  morality:[[1028,345],[960,338],[995,319],[1046,312],[1020,288],[965,280],[997,260],[1040,246],[1006,238],[969,225],[1036,218]].map(([x,y],i)=>({value:i-5,x,y})),
  foe:[{value:0,x:51,y:615},...Array.from({length:24},(_,i)=>{const v=i+1;return {value:v,x:v<=7?183:v<=13?142:v<=20?101:61,y:v<=7?598-(v-1)*25:v<=13?598-(v-8)*25:v<=20?598-(v-14)*25:523-(v-21)*25};})]
};
export function syncMarker(s,o){
  const points=tracks[o.kind?.slice(3)];if(!points||!boardFor(s))return;
  const point=points.find(p=>p.value===o.value)||points[o.value<points[0].value?0:points.length-1];
  Object.assign(o,matPoint(s,point.x,point.y));
}
export function dropMarker(s,o,clamp){
  const points=tracks[o.kind?.slice(3)];if(o.type!=='token'||!points||!boardFor(s))return;
  const nearest=points.map(p=>({...p,...matPoint(s,p.x,p.y)})).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y))[0];
  const b=boardFor(s),radius=22*(b.width||2000)/1548;
  if(Math.hypot(nearest.x-o.x,nearest.y-o.y)<=radius){clamp(s,o,nearest.value-o.value);syncMarker(s,o);}
}
export function equipmentSlot(code){
  return ['4','12'].includes(code)?[1325,330]:['7','14'].includes(code)?[1325,150]:['8','11','3'].includes(code)?[1470,330]:['2','5','6'].includes(code)?[1180,515]:[1180,330];
}
export function equipmentSlotKey(code){return ['4','12'].includes(code)?'body':['7','14'].includes(code)?'head':['8','11','3'].includes(code)?'off':['2','5','6'].includes(code)?'accessory':'main';}
const slots={plot:[65,105],'plot-discard':[65,284],potion:[200,105],'potion-discard':[200,284],loot:[335,105],'loot-discard':[335,284],enemy:[465,105],'enemy-discard':[465,284],trapping:[863,105],skill:[1000,105],hero:[1180,150],learned:[1470,150],dungeon:[332,518],'dungeon-discard':[468,518],boss:[70,765],'hero-reserve':[235,765],blessing:[846,462],spent:[565,765],'level-track':[730,765],'morality-track':[895,765],'door-a':[603,518],'door-b':[738,518],'door-first':[603,518],'door-second':[738,518]};
function fixDeckPositions(s){
  for(const o of s.objects.filter(o=>o.type==='deck')){
    o.fixedPosition=true;
    if(slots[o.ihRole]){Object.assign(o,matPoint(s,...slots[o.ihRole]));o.rotation=boardFor(s)?.rotation||0;}
    if(['dungeon','dungeon-discard'].includes(o.ihRole)){o.width=150;o.height=210;}
  }
}
function addEquipmentPiles(s){
  const places=[['hero','角色',1180,150],['head','头部',1325,150],['learned','已学技能',1470,150],['main','主手',1180,330],['body','身体',1325,330],['off','副手',1470,330],['accessory','配饰',1180,515]];
  for(const [key,name,x,y] of places){
    if(s.objects.some(o=>o.ihSlot===key))continue;
    const p=matPoint(s,x,y);
    const card=s.objects.find(o=>o.type==='card'&&['hero','inventory','learned'].includes(o.ihRole)&&Math.hypot(o.x-p.x,o.y-p.y)<.01);
    const deck={...createFixedPile(p.x,p.y),width:140,height:196,rotation:boardFor(s)?.rotation||0,ihSlot:key,ihRole:card?.ihRole||(key==='hero'||key==='learned'?key:'equipment-slot'),name,maxCards:['learned','accessory'].includes(key)?500:1,z:card?.z??2};
    if(card){deck.id=card.id;deck.cards=[card.assetId];deck.faceUp=card.faceUp;s.objects.splice(s.objects.indexOf(card),1,deck);}
    else s.objects.push(deck);
  }
}
function addDoorPiles(s){
  for(const [side,x,name] of [['a',603,'左门'],['b',738,'右门']]){
    const key=`door-${side}`;
    if(s.objects.some(o=>o.ihSlot===key))continue;
    const point=matPoint(s,x,518),other=matPoint(s,side==='a'?738:603,518);
    const card=s.objects.find(o=>o.type==='card'&&(o.ihRole===key||['door-first','door-second'].includes(o.ihRole)&&Math.hypot(o.x-point.x,o.y-point.y)<=Math.hypot(o.x-other.x,o.y-other.y)));
    const source=s.objects.find(o=>o.ihRole==='dungeon'&&o.type==='deck');
    const slot={...createFixedPile(point.x,point.y),width:source?.width||150,height:source?.height||210,rotation:boardFor(s)?.rotation||0,ihSlot:key,ihRole:'door-slot',name,faceUp:false};
    if(card){Object.assign(slot,{id:card.id,x:card.x,y:card.y,width:card.width||slot.width,height:card.height||slot.height,rotation:card.rotation,cards:[card.assetId],faceUp:card.faceUp,ihRole:card.ihRole});s.objects.splice(s.objects.indexOf(card),1,slot);}
    else s.objects.push(slot);
  }
}
export function arrangeIronHelmTable(s){
  if(!boardFor(s))s.objects.unshift({...baseObject('board',1000,2000*320/780/2,0),assetId:'ih-playmat',width:2000,height:2000*320/780,locked:true});
  for(const o of s.objects){
    const asset=s.assets.find(a=>a.id===(o.assetId||o.cards?.at(-1)));
    const slot=o.ihRole==='inventory'?(asset?.slot?({main:[1180,330],off:[1470,330],head:[1325,150],body:[1325,330],accessory:[1180,515]})[asset.slot]:equipmentSlot((o.assetId||o.cards?.at(-1)||'').split('-').at(-1))):slots[o.ihRole];
    if(slot){Object.assign(o,matPoint(s,...slot));if(['card','deck'].includes(o.type)&&o.ihRole!=='blessing'){o.width=140;o.height=196;}}
    if(o.type==='token'&&o.kind?.startsWith('ih-')){
      const key=o.kind.slice(3);o.assetId=`ih-marker-${key}`;o.color=markerColors[key]||o.color;o.width=o.height=tracks[key]?28:48;
      if(tracks[key])syncMarker(s,o);
      else Object.assign(o,matPoint(s,key==='turn'?1060:1150,705));
    }
  }
  s.objects.filter(o=>o.type==='die').forEach((o,i)=>Object.assign(o,matPoint(s,1055+i*60,790)));
  fixDeckPositions(s);
  addEquipmentPiles(s);
  addDoorPiles(s);
}
function upgradePreviousTable(s){
  const known=new Set(s.assets.map(a=>a.id));s.assets.push(...structuredClone(ironHelmTableAssets.filter(a=>!known.has(a.id))));
  if(s.ironHelmTableVersion===5)return;
  const previousVersion=s.ironHelmTableVersion;
  if(previousVersion===4){
    for(const objects of [s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean))addDoorPiles({...s,objects});
    s.ironHelmTableVersion=5;return;
  }
  if(![1,2,3].includes(previousVersion)){
    arrangeIronHelmTable(s);
    if(s.initialSetup){const initial={...s,objects:s.initialSetup.objects};arrangeIronHelmTable(initial);s.initialSetup.objects=initial.objects.map(({id,...o})=>o);}
  }
  if(![2,3].includes(previousVersion)){
    fixDeckPositions(s);
    for(const setup of [s.initialSetup,s.setup])if(setup)fixDeckPositions({...s,objects:setup.objects});
  }
  // Only move cards still at the old printed-slot defaults; keep player edits.
  for(const table of [s,...[s.initialSetup,s.setup,...(s.setupProfiles||[]).map(p=>p.setup)].filter(Boolean).map(setup=>({...s,objects:setup.objects}))]){
    if(!boardFor(table))continue;
    for(const o of table.objects.filter(o=>['card','deck'].includes(o.type))){
      const code=(o.assetId||o.cards?.at(-1))?.split('-').at(-1);
      const old=o.ihRole==='learned'?[1450,150]:o.ihRole==='inventory'?(['8','11','3'].includes(code)?[1450,330]:['2','5','6'].includes(code)?[1180,530]:null):null;
      if(!old)continue;
      const point=matPoint(table,...old);
      if(Math.hypot(o.x-point.x,o.y-point.y)<.01)Object.assign(o,matPoint(table,...(o.ihRole==='learned'?slots.learned:equipmentSlot(code))));
    }
    addEquipmentPiles(table);
    addDoorPiles(table);
  }
  s.ironHelmTableVersion=5;
}

function upgradeWeightTable(s,weightFor){
  if(s.ironHelmTableVersion===7)return;
  if(s.ironHelmTableVersion===6){
    const known=new Set(s.assets.map(a=>a.id));
    s.assets.push(...structuredClone(ironHelmTableAssets.filter(a=>!known.has(a.id))));
  }else upgradePreviousTable(s);
  // Repair every saved opening using its carried equipment, preserving other resources.
  const tables=[s,...[s.initialSetup,s.setup,...(s.setupProfiles||[]).map(p=>p.setup)].filter(Boolean).map(setup=>({...s,objects:setup.objects}))];
  for(const table of tables){
    const obsolete=table.objects.find(o=>o.kind==='ih-capacity');
    const existing=table.objects.find(o=>o.kind==='ih-weight');
    for(let i=table.objects.length-1;i>=0;i--)if(table.objects[i].kind==='ih-capacity')table.objects.splice(i,1);
    if(!existing){
      const o={...(obsolete||baseObject('token',0,0,30)),kind:'ih-weight',name:'当前负重',value:weightFor(table),color:markerColors.weight,assetId:'ih-marker-weight',width:28,height:28};
      syncMarker(table,o);table.objects.push(o);
    }
    const poison=table.objects.find(o=>o.kind==='ih-poison');
    if(poison){
      const old=[{x:582,y:49},...row(1,7,625,38),...row(8,7,625,65)].map(p=>matPoint(table,p.x,p.y));
      if(old.some(p=>Math.hypot(p.x-poison.x,p.y-poison.y)<.01)){
        Object.assign(poison,matPoint(table,970,705),{width:48,height:48});
      }
    }
  }
  s.ironHelmTableVersion=7;
}

function upgradeResourcePositions(s,weightFor){
  if(s.ironHelmTableVersion===9)return;
  if(![7,8].includes(s.ironHelmTableVersion))upgradeWeightTable(s,weightFor);
  const tables=[s,...[s.initialSetup,s.setup,...(s.setupProfiles||[]).map(p=>p.setup)].filter(Boolean).map(setup=>({...s,objects:setup.objects}))];
  for(const table of tables){
    if(!boardFor(table))continue;
    const poison=table.objects.find(o=>o.kind==='ih-poison');
    if(poison){
      poison.width=poison.height=28;syncMarker(table,poison);
    }
    const blessing=table.objects.find(o=>o.type==='deck'&&o.ihRole==='blessing');
    if(blessing){
      Object.assign(blessing,matPoint(table,...slots.blessing),{rotation:boardFor(table).rotation||0});
    }
  }
  s.ironHelmTableVersion=9;
}

export function compactIronHelmTable(s){
  const level=s.objects.find(o=>o.kind==='ih-level');
  if(level){
    const turn=s.objects.find(o=>o.kind==='ih-turn'),eyes=s.objects.find(o=>o.kind==='ih-eyes');
    level.ihProgress||={turn:{value:0,phase:'ready',potionChoices:0},eyes:{value:0}};
    if(turn)level.ihProgress.turn={value:turn.value,phase:turn.phase||'ready',potionChoices:turn.potionChoices||0};
    if(eyes)level.ihProgress.eyes={value:eyes.value};
  }
  const grave=s.objects.find(o=>o.type==='deck'&&o.ihRole==='enemy-discard');
  if(grave?.name==='墓地 · 未花费经验')grave.name='墓地';
  const isTrack=assetId=>['ih-track-level','ih-track-morality'].includes(assetId);
  for(const o of s.objects.filter(o=>o.type==='deck')){
    if(o.ihRole==='spent'&&grave)appendDeckEntries(grave,deckEntries(o).map(card=>({...card,faceUp:false})));
    if(o.cards.some(isTrack))replaceDeckEntries(o,deckEntries(o).filter(card=>!isTrack(card.assetId)));
  }
  const kept=s.objects.filter(o=>!['ih-turn','ih-eyes'].includes(o.kind)&&!['spent','level-track','morality-track'].includes(o.ihRole)&&!isTrack(o.assetId));
  s.objects.splice(0,s.objects.length,...kept);
}

function upgradeCompactTable(s,weightFor){
  if(s.ironHelmTableVersion===10)return;
  upgradeResourcePositions(s,weightFor);
  for(const objects of [s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean))compactIronHelmTable({...s,objects});
  s.ironHelmTableVersion=10;
}

export function configureIronHelmComponents(s){
  for(const o of s.objects.filter(o=>o.type==='deck')){
    if(['trapping','skill'].includes(o.ihRole)){setDeckFace(o,false);o.setupFace='fixed';}
    if(o.ihSlot==='accessory'){o.maxCards=500;o.snapCards=true;}
  }
  const supply=s.objects.find(o=>o.type==='deck'&&o.ihRole==='blessing');
  let token=s.objects.find(o=>o.kind==='ih-blessing');
  if(!token){
    token={...baseObject('token',0,0,30),...(supply?{id:supply.id}:{}),kind:'ih-blessing',name:'祝福',value:0};
    s.objects.push(token);
  }
  if(supply){
    token.ihBlessingSupply=[...supply.cards];
    token.value=s.objects.filter(o=>o!==supply).flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]).filter(id=>id?.startsWith('ih-blessing-')).length;
    s.objects.splice(s.objects.indexOf(supply),1);
  }
  Object.assign(token,{assetId:'ih-marker-blessing',width:28,height:28,color:markerColors.blessing});
  syncMarker(s,token);
}

function upgradeComponents(s,weightFor){
  if(s.ironHelmTableVersion===11)return;
  upgradeCompactTable(s,weightFor);
  const known=new Set(s.assets.map(a=>a.id));
  s.assets.push(...structuredClone(ironHelmTableAssets.filter(a=>!known.has(a.id))));
  for(const objects of [s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean))configureIronHelmComponents({...s,objects});
  s.ironHelmTableVersion=11;
}

export function placeIronHelmDivineDie(s){
  const blessing=s.objects.find(o=>o.kind==='ih-blessing');
  if(blessing)syncMarker(s,blessing);
  if(!s.objects.some(o=>o.type==='die'&&o.ihRole==='divine-die')){
    const template=sharedDice.find(d=>d.id==='d12-sand');
    s.objects.push({...baseObject('die',0,0,35),...matPoint(s,1065,492),ihRole:'divine-die',width:70,height:70,skin:template.skin,color:template.color,name:'神圣干预 · 十二面骰',faces:[...template.faces],value:12});
  }
}

export function upgradeIronHelmTable(s,weightFor){
  if(s.ironHelmTableVersion===12)return;
  upgradeComponents(s,weightFor);
  for(const objects of [s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean))placeIronHelmDivineDie({...s,objects});
  s.ironHelmTableVersion=12;
}
