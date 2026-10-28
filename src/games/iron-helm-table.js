import {baseObject} from '../model.js';

export const markerColors={health:'#a84248',energy:'#874b91',gold:'#b8943c',rations:'#b8663b',poison:'#63823f',morality:'#9c9484',level:'#97764e',turn:'#586f80',eyes:'#536d95',foe:'#45433e'};
export const ironHelmTableAssets=[
  {id:'ih-playmat',type:'board',name:'铁盔 · 中文大牌垫',width:2000,height:2000*320/780,front:'/assets/iron-helm/playmat-cn.webp'},
  ...Object.keys(markerColors).map(key=>({id:`ih-marker-${key}`,type:'token',name:`铁盔方形标记 · ${key}`,width:28,height:28,front:`/assets/iron-helm/marker-${key}.webp`}))
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
  energy:[{value:0,x:582,y:325},...row(1,7,625,310),...row(8,7,625,337)],
  gold:[{value:0,x:582,y:106},...row(1,7,625,91),...row(8,5,625,118)],
  rations:[{value:0,x:582,y:158},...row(1,7,625,145),...row(8,3,625,172)],
  poison:[{value:0,x:582,y:49},...row(1,7,625,38),...row(8,7,625,65)],
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
  return ['4','12'].includes(code)?[1325,330]:['7','14'].includes(code)?[1325,150]:['8','11','3'].includes(code)?[1450,330]:['2','5','6'].includes(code)?[1180,530]:[1180,330];
}
const slots={plot:[65,105],'plot-discard':[65,284],potion:[200,105],'potion-discard':[200,284],loot:[335,105],'loot-discard':[335,284],enemy:[465,105],'enemy-discard':[465,284],trapping:[863,105],skill:[1000,105],hero:[1180,150],learned:[1450,150],dungeon:[332,518],'dungeon-discard':[468,518],boss:[70,765],'hero-reserve':[235,765],blessing:[400,765],spent:[565,765],'level-track':[730,765],'morality-track':[895,765],'door-a':[603,518],'door-b':[738,518],'door-first':[603,518],'door-second':[738,518]};
function fixDeckPositions(s){
  for(const o of s.objects.filter(o=>o.type==='deck')){
    o.fixedPosition=true;
    if(slots[o.ihRole]){Object.assign(o,matPoint(s,...slots[o.ihRole]));o.rotation=boardFor(s)?.rotation||0;}
    if(['dungeon','dungeon-discard'].includes(o.ihRole)){o.width=150;o.height=210;}
  }
}
export function arrangeIronHelmTable(s){
  if(!boardFor(s))s.objects.unshift({...baseObject('board',1000,2000*320/780/2,0),assetId:'ih-playmat',width:2000,height:2000*320/780,locked:true});
  for(const o of s.objects){
    const slot=o.ihRole==='inventory'?equipmentSlot(o.assetId.split('-').at(-1)):slots[o.ihRole];
    if(slot){Object.assign(o,matPoint(s,...slot));if(['card','deck'].includes(o.type)&&o.ihRole!=='blessing'){o.width=140;o.height=196;}}
    if(o.type==='token'&&o.kind?.startsWith('ih-')){
      const key=o.kind.slice(3);o.assetId=`ih-marker-${key}`;o.color=markerColors[key]||o.color;o.width=o.height=tracks[key]?28:48;
      if(tracks[key])syncMarker(s,o);
      else Object.assign(o,matPoint(s,key==='turn'?1060:1150,705));
    }
  }
  s.objects.filter(o=>o.type==='die').forEach((o,i)=>Object.assign(o,matPoint(s,1055+i*60,790)));
  fixDeckPositions(s);
}
export function upgradeIronHelmTable(s){
  const known=new Set(s.assets.map(a=>a.id));s.assets.push(...structuredClone(ironHelmTableAssets.filter(a=>!known.has(a.id))));
  if(s.ironHelmTableVersion===2)return;
  if(s.ironHelmTableVersion!==1){
    arrangeIronHelmTable(s);
    if(s.initialSetup){const initial={...s,objects:s.initialSetup.objects};arrangeIronHelmTable(initial);s.initialSetup.objects=initial.objects.map(({id,...o})=>o);}
  }
  fixDeckPositions(s);
  for(const setup of [s.initialSetup,s.setup])if(setup)fixDeckPositions({...s,objects:setup.objects});
  s.ironHelmTableVersion=2;
}
