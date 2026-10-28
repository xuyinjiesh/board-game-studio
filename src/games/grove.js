import {createSession,captureSetup,baseObject,createFixedPile,assetFor,pointOnObject,shuffled,DEFAULT_SCATTER} from '../model.js';
const CARD_W=160,CARD_H=240,CELL=80;
export const GROVE_FACES=[2,3,4,5,6,10];
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
export function createGroveSession(random=Math.random){
  const all=shuffled(builtinAssets.map(a=>a.id),random);
  const objects=[],tilt=()=>(random()-.5)*DEFAULT_SCATTER*2;
  objects.push({...baseObject('card',680,380,1),assetId:all[0],faceUp:true,planted:true});
  objects.push({...baseObject('card',590,820,3),assetId:all[1],faceUp:true,rotation:tilt()});
  objects.push({...baseObject('card',815,825,4),assetId:all[2],faceUp:true,rotation:tilt()});
  objects.push({...createFixedPile(245,360),z:2,maxCards:500,cards:all.slice(3,9),faceUp:false,name:'本局牌堆'});
  objects.push({...createFixedPile(245,740),z:2,maxCards:500,cards:all.slice(9),faceUp:false,name:'下一局 · 备用',reserve:true});
  for(const [c,color] of ['orange','lemon','lime'].entries()) for(let r=0;r<5;r++) objects.push({...baseObject('die',1090+c*78,300+r*82,20+r),color,value:2,faces:[...GROVE_FACES],rotation:tilt()});
  objects.push({...baseObject('token',1110,785,25),kind:'squirrel',color:'#b86231',name:'松鼠',rotation:tilt()});
  objects.push({...baseObject('token',1225,785,26),kind:'wheelbarrow',color:'#7fa75e',name:'独轮车',rotation:tilt()});
  const state={...createSession('果丛 · 我的桌面'),gameId:'grove',grovePileVersion:1,objects,assets:structuredClone(builtinAssets),mode:'play',meta:{description:'叠一片绿意，收一篮阳光。用 18 张双面卡牌，种出一座属于自己的果园。',players:'1 人',duration:'10 分钟',rules:''}};
  const source={...createFixedPile(245,1070),z:2,maxCards:500,cards:[...all],faceUp:false,name:'开局牌库 · 18 张',setupKey:'grove-opening-pool',setupOrder:'shuffle',setupHideEmpty:true};
  const placements=objects.filter(o=>['card','deck'].includes(o.type)).map((o,index)=>{
    const {id,assetId,cards,type,...placement}=o;
    return {...placement,type:'deal',sourceKey:source.setupKey,name:o.type==='deck'?o.name:o.planted?'起始果园':'初始待打牌',count:o.type==='deck'?o.cards.length:1,layout:o.type==='deck'?'deck':'spread',spacing:40,order:index+1,width:160,height:240,setupFace:'fixed'};
  });
  state.initialSetup={...captureSetup(state),name:'果丛 · 随机开局',objects:[(({id,...o})=>o)(source),...placements,...captureSetup(state).objects.filter(o=>!['card','deck'].includes(o.type))]};
  return state;
}
export function upgradeGrovePiles(state){
  if(state.grovePileVersion===1)return;
  const tables=[state.objects,state.initialSetup?.objects,state.setup?.objects,...(state.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean);
  for(const objects of tables)for(const o of objects){
    const generated=o.type==='deal'&&o.layout==='deck'&&o.sourceKey==='grove-opening-pool';
    const builtin=o.type==='deck'&&(o.setupKey==='grove-opening-pool'||['本局牌堆','下一局 · 备用'].includes(o.name)&&o.cards.every(id=>id.startsWith('grove-')));
    if(generated||builtin){o.fixedPosition??=true;o.snapCards??=true;o.maxCards??=500;}
  }
  state.grovePileVersion=1;
}
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
export function grovePlacement(state,o){
  if(state.mode!=='play'||o.type!=='card'||!assetFor(state,o.assetId)?.cells)return null;
  const cards=state.objects.filter(c=>c.id!==o.id&&c.type==='card'&&assetFor(state,c.assetId)?.cells);
  const near=cards.filter(c=>{
    const p=pointOnObject(state,c,o.x,o.y),horizontal=Math.round((o.rotation-c.rotation)/90)%2!==0;
    return Math.abs(p.px)<p.w/2+(horizontal?CARD_H:CARD_W)/2&&Math.abs(p.py)<p.h/2+(horizontal?CARD_W:CARD_H)/2;
  }).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y));
  if(!near.length&&!(o.x>390&&o.x<1020&&o.y<690))return null;
  // Preserve the orchard's lattice even when a saved or edited opening was moved.
  const anchor=near[0],aligned=anchor?snapCard({...anchor}):null;
  const dx=anchor?anchor.x-aligned.x:0,dy=anchor?anchor.y-aligned.y:0;
  const placement=snapCard({...o,x:o.x-dx,y:o.y-dy});
  placement.x+=dx;placement.y+=dy;
  return placement;
}
function tokenIcon(kind){if(kind==='squirrel')return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M35 50c-5 5-19 4-22-5-3-7 2-14 7-16-12-2-16-16-8-21 11-7 22 7 16 18 6-5 7-10 10-10l2-7 4 8c11 4 14 16 6 18l-5 1 2 10-12 4Z" fill="currentColor"/><circle cx="43" cy="24" r="2" fill="#a75a30"/><path d="M33 32c-6 8-3 14 3 15" stroke="#a75a30" stroke-width="3" fill="none"/></svg>';if(kind==='wheelbarrow')return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m11 22 7 24h32l6-24Z" fill="currentColor"/><path d="m8 16 8 4 5 29M22 48l-2 6" stroke="currentColor" stroke-width="4" fill="none"/><circle cx="45" cy="51" r="7" fill="none" stroke="currentColor" stroke-width="4"/><text x="34" y="40" text-anchor="middle" font-size="19" font-weight="800" fill="#668a45">15</text></svg>';return '<span class="disc-star">✦</span>';}
export const grove={
  id:'grove',title:'果丛',subtitle:'GROVE',tagline:'九张牌，一座果园。',players:'1 人',duration:'10 分钟',
  description:'在小小的卡牌之间，种下一座层层交叠的果园。',create:createGroveSession,prepareSession:upgradeGrovePiles,
  dice:['orange','lemon','lime'].map(color=>({id:'grove-'+color,color,faces:GROVE_FACES,name:({orange:'橘子',lemon:'柠檬',lime:'酸橙'})[color]+'收获骰'})),
  tokens:[{kind:'squirrel',name:'松鼠',color:'#b86231',description:'终局扣 1 分，正交相邻收获骰再各扣 1 分。'},{kind:'wheelbarrow',name:'独轮车',color:'#7fa75e',description:'替换再次收获的 10 点骰子，代表 15 分。'}],
  tokenIcon,score:scoreTable,cardPlacement:grovePlacement,snapLabel:'果树格点吸附',grid:{size:80,x:0,y:20},
  zones:[{className:'deck-zone',label:'抽牌区',subtitle:'DRAW PILE'},{className:'orchard-zone',label:'种下你的第一片果园',subtitle:'THE GROVE'},{className:'staging-zone',label:'待打出的牌',subtitle:'拖入果园，自由叠放'},{className:'dice-zone',label:'收获骰子',subtitle:'FRUIT RESERVE'}],
  onDrop(state,o){
    const placement=grovePlacement(state,o);
    if(placement)Object.assign(o,{x:placement.x,y:placement.y,rotation:placement.rotation});
    else if(['die','token'].includes(o.type)&&treeAt(state,o.x,o.y)){
      const target=treeAt(state,o.x,o.y),a=target.card.rotation*Math.PI/180;
      const asset=assetFor(state,target.card.assetId),w=target.card.width||asset.width,h=target.card.height||asset.height;
      const tx=(target.index%2-.5)*w/2,ty=(Math.floor(target.index/2)-1)*h/3;
      o.x=target.card.x+tx*Math.cos(a)-ty*Math.sin(a);o.y=target.card.y+tx*Math.sin(a)+ty*Math.cos(a);
    }
  },
  rules:{title:'九张牌，一座果园。',credit:'作者 Mark Tuck · 中文汉化 楚洋',pdf:'/assets/grove-original.pdf',image:'/assets/rules.webp',steps:[
    ['布置果园','18 张牌洗匀，取 9 张用于本局，另外 9 张备用。翻开首张作为起始果园，再抽两张放在待打区。'],
    ['叠放一张牌','可旋转 90° 或 180°。至少一个格子与果园重叠；重叠的水果须同色。空地可以盖住任意树，有骰子的空地被树覆盖时须与骰子同色。'],
    ['记录收获','首次同色重叠，放置骰子，点数等于两棵树的水果总数。再次覆盖增加新树的水果数量；超过 6 变为 10，再次收获可用独轮车替换，计 15 分。'],
    ['补牌与结算','补充待打牌，直到用完本局 9 张。空地上的骰子不计分。松鼠允许一次不匹配覆盖，终局扣 1 分，每颗正交相邻收获骰再扣 1 分。']
  ]}
};
