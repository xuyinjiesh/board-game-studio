import {createSession,baseObject,captureSetup,applySetup,assetFor,dimensions,pointOnObject} from '../model.js';
import {pocketPaladinAssets} from './pocket-paladin-assets.js';
import {POCKET_MAP_STEP,pocketHexes,pocketPawnPlacement,pocketMapDrop,upgradePocketMaps} from './pocket-paladin-map.js';

const labels={round:'轮次',turn:'回合',wounds:'创伤',level:'等级',blue:'蓝水晶',black:'黑水晶',purple:'紫水晶',ability:'能力位置'};
const positionMarkers=new Set(['round','turn','wounds','level','ability']);
const limits={round:[1,6],turn:[1,6],wounds:[0,10],level:[1,8],blue:[0,5],black:[0,5],purple:[0,5],ability:[1,8]};
const card=(id,x,y,z=2,faceUp=true)=>({...baseObject('card',x,y,z),assetId:'pp-'+id,faceUp,setupFace:'fixed'});
const trackPoints={round:[132,162,192,222,252,282].map(x=>[x,54]),turn:[65,107,150,193,235,278].map(x=>[x,205]),level:[56,94,132,170,207,244,282,319].map(x=>[x,98]),wounds:[[310,140],[288,164],[267,143],[246,164],[225,143],[204,164],[183,143],[162,164],[140,143],[119,164],[98,143]]};
// Pixel centers measured on the upright 813 × 597 ability crop. Both faces
// share nine squares, but the starred starting square differs by character.
const abilityPoints=[[138,130],[397,131],[605,134],[230,283],[582,283],[135,468],[321,450],[500,468],[686,468]].map(([x,y])=>[x/813*360,y/597*264]);
export function pocketMarkerAnchors(s,card,key){
  if(card.type!=='card'||card.assetId!==(key==='ability'?'pp-ability':'pp-tracks'))return [];
  const points=key==='ability'?abilityPoints:trackPoints[key]||[],{w,h}=dimensions(s,card),a=card.rotation*Math.PI/180;
  return points.map(([px,py])=>{
    const dx=(px/360-.5)*w,dy=(py/264-.5)*h;
    return {x:card.x+dx*Math.cos(a)-dy*Math.sin(a),y:card.y+dx*Math.sin(a)+dy*Math.cos(a),px,py};
  });
}
export function dropPocketMarker(s,o){
  if(!s.settings.snap||o.locked||o.type!=='token'||!o.kind?.startsWith('pp-'))return;
  const key=o.kind.slice(3);if(!positionMarkers.has(key))return;
  for(const card of s.objects.filter(c=>c.type==='card'&&c.assetId===(key==='ability'?'pp-ability':'pp-tracks')).sort((a,b)=>b.z-a.z)){
    const p=pointOnObject(s,card,o.x,o.y),px=(p.px/p.w+.5)*360,py=(p.py/p.h+.5)*264;
    const anchors=pocketMarkerAnchors(s,card,key),nearest=anchors.reduce((best,a)=>!best||Math.hypot(a.px-px,a.py-py)<Math.hypot(best.px-px,best.py-py)?a:best,null);
    // A small card-relative radius attracts nearby drops without pulling a
    // marker back from a staging area or onto a different kind of track.
    if(nearest&&Math.hypot(nearest.px-px,nearest.py-py)<=(key==='ability'?34:key==='wounds'?22:30)){
      o.x=nearest.x;o.y=nearest.y;return;
    }
  }
}
// Opening positions use the same printed centers as manual drag snapping.
function locate(s,o){
  const key=o.kind?.slice(3),track=s.objects.find(c=>c.assetId===(key==='ability'?'pp-ability':'pp-tracks')&&c.type==='card');
  if(!track)return;
  const anchors=pocketMarkerAnchors(s,track,key);
  const p=anchors[key==='ability'?(track.faceUp===false?6:3):key==='wounds'?o.value:o.value-1];
  if(!p)return;
  o.x=p.x;o.y=p.y;
}
export function adjustPocketToken(s,o,delta){
  const key=o.kind?.slice(3),range=limits[key];
  if(!range||positionMarkers.has(key)||!Number.isFinite(o.value))return;
  o.value=Math.max(range[0],Math.min(range[1],o.value+delta));
  if(['blue','black','purple'].includes(key)){
    const shard=s.objects.find(c=>c.assetId==='pp-'+key&&c.type==='card');if(shard)shard.rotation=-60*o.value;
  }else locate(s,o);
}
export function preparePocketSession(s){
  upgradePocketMaps(s);
  // A dragged track marker records its position, not a separate counter value.
  // Remove stale values from progress and every authored opening alike.
  const tables=[s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)];
  for(const objects of tables)for(const o of objects||[]){
    if(o.type==='token'&&o.kind?.startsWith('pp-')&&positionMarkers.has(o.kind.slice(3)))delete o.value;
  }
}
export function createPocketPaladinSession(random=Math.random,hero='red',start='A'){
  const red=hero==='red',other=start==='A'?'B':'A';
  const s={...createSession('口袋骑士'),gameId:'pocket-paladin',mode:'play',assets:structuredClone(pocketPaladinAssets),meta:{players:'1 人',duration:'30–60 分钟',description:'沿能力路线穿越荒野，招募盟友，赶在黑暗降临前攻克城堡。',rules:'自由桌面：依照规则执行移动、战斗、升级与昼夜结算。默认简单难度：5 轮，城堡 2 名塔楼敌人和 1 名游荡敌人。红骑士开局须从展示区选取一个技能，再补满展示区。'}};
  s.assets.push({id:'pp-table',type:'board',name:'冒险桌垫',width:1540,height:1100,front:'/assets/pocket-paladin/table.webp'});
  s.objects.push({...baseObject('board',770,550,0),assetId:'pp-table',width:1540,height:1100,locked:true});
  const bottom={...card('map-'+start,698,675,2),snapCards:false},top={...card('map-'+other,698,675-POCKET_MAP_STEP,1),snapCards:false};
  s.objects.push(bottom,top,card('tracks',235,360,4,red),card('ability',1035,430,4,red));
  const startHex=pocketHexes(s,bottom).find(p=>p.row===5&&p.col===1);
  s.objects.push(card('hero',startHex.x,startHex.y,20,red));
  s.pocketMapVersion=2;
  for(const [i,c] of ['blue','black','purple'].entries())s.objects.push(card(c,950+i*85,230,5));
  s.objects.push({...card('source',1260,230,5),rotation:Math.floor(random()*6)*60});
  const sources={};
  for(const [i,type] of ['monster','mage'].entries()){
    const source={...baseObject('deck',540+i*90,100,4),name:type==='monster'?'怪物牌堆':'法师牌堆',cards:s.assets.filter(a=>a.enemyType===type).map(a=>a.id),faceUp:true,width:68,height:68,setupKey:'pp-'+type,setupOrder:'shuffle',maxCards:16,fixedPosition:true,snapCards:true,ppPool:type,drawTarget:{mode:'below',gap:28}};
    sources[type]=source;s.objects.push(source);
  }
  const targets=[];
  for(const map of [bottom,top]){
    const hexes=pocketHexes(s,map),redHex=hexes.find(p=>p.row===(map.assetId==='pp-map-A'?4:2)&&p.col===(map.assetId==='pp-map-A'?0:1));
    targets.push({type:'monster',x:redHex.x,y:redHex.y,z:10});
    if(map.assetId==='pp-map-A'){
      const purpleHex=hexes.find(p=>p.row===3&&p.col===2);
      targets.push({type:'mage',x:purpleHex.x,y:purpleHex.y,z:10});
    }
  }
  // Draw from whichever enemy pool is larger, as required for the Offer.
  const counts={monster:8-targets.filter(t=>t.type==='monster').length,mage:8-targets.filter(t=>t.type==='mage').length};
  for(let i=0;i<3;i++){const type=counts.monster>=counts.mage?'monster':'mage';counts[type]--;targets.push({type,x:790+i*84,y:100,z:12,offer:true});}
  const deals=targets.map((t,i)=>({...baseObject('deal',t.x,t.y,t.z),name:t.offer?'展示区 · 盟友／技能':'游荡敌人',sourceKey:sources[t.type].setupKey,count:1,layout:'spread',spacing:0,order:i+1,width:68,height:68,faceUp:!t.offer,setupFace:'fixed',ppOffer:!!t.offer}));
  for(const [i,key] of Object.keys(labels).entries()){
    const value=['round','turn','level','ability'].includes(key)?1:0;
    const o={...baseObject('token',920+i*60,600,30),kind:'pp-'+key,name:labels[key],color:key==='wounds'?'#9c393a':'#b99a5d',value,width:26,height:26,faceUp:true};
    if(['blue','black','purple'].includes(key)){o.x=950+['blue','black','purple'].indexOf(key)*85;o.y=285;}
    s.objects.push(o);locate(s,o);if(positionMarkers.has(key))delete o.value;
  }
  s.initialSetup=captureSetup(s);s.initialSetup.objects.push(...deals.map(({id,...o})=>o));
  // Use the same generic shuffle/deal engine as edited openings.
  return applySetup(s,s.initialSetup,random);
}
export const canRollPocketSource=(s,o)=>o?.type==='card'&&o.assetId==='pp-source';
export function rollPocketSource(s,o,random=Math.random){
  if(!canRollPocketSource(s,o)||o.locked)return false;
  o.rotation=Math.floor(random()*6)*60;
  return true;
}
export function pocketJournal(){
  return `<span class="section-eyebrow">POCKET PALADIN</span><h2>口袋骑士 · 冒险手册</h2><p class="modal-lead">Joe Klipfel / Mythfield Games · 按实体规则自由游玩，桌面提供摆放与记录。默认简单难度：5 轮，城堡 2 名塔楼敌人 + 1 名游荡敌人。</p><ol class="rule-steps"><li><strong>开始冒险</strong><p>敌人、展示区已随机发放，骑士位于底边起始格。水晶从 0 开始，双击水晶源片，或选中后按 D 投掷。红骑士先从展示区取一枚技能圆片，放到技能区，再手动补充展示区；紫骑士从一个盟友容量开始，不免费获得盟友。</p></li><li><strong>沿箭头使用能力</strong><p>每回合至多使用 3 次能力。沿已解锁颜色的箭头移动能力标记，选择基础或支付对应水晶使用强化能力；等级 3 解锁白色箭头，等级 5 解锁绿色箭头。水晶源每回合可提供一次免费水晶。</p></li><li><strong>探索与交战</strong><p>按地形花费移动点，按地点效果互动。战斗依次处理远程、格挡与近战；防御类型、抗性和敌人特性见完整手册。击败敌人后把圆片放入经验区，塔楼敌人倒置记录奖励。升级费用与奖励按轨道支付。</p></li><li><strong>回合与轮末</strong><p>轮次、回合、创伤、等级和能力位置使用无数字指示物，直接拖动到相应格子；水晶计数可用滚轮调整并同步转盘。回合达到 6 或被创伤阻挡时结束本轮。轮末推进昼夜、重置回合、水晶源、展示区和耗竭圆片；创伤保留，能力标记不复位。花园、创伤额外惩罚与盟友负伤依手册处理。</p></li><li><strong>向北推进</strong><p>探索时按手册第 19 页翻转并移动地图，补充新出现的游荡敌人。右键可放大圆片，F 翻面，R 旋转。拖动展示区圆片可自行招募或学习，并自行补满展示区。</p></li><li><strong>胜负与难度</strong><p>时限内击败全部城堡守军获胜；超过轮数或创伤达到轨道最左端落败。休闲 6 轮／2 塔楼；简单 5 轮／2 塔楼+1 游荡；普通 4 轮／3 塔楼；困难 4 轮／3 塔楼+1 游荡；专家 3 轮／3 塔楼；不可能 3 轮／4 塔楼。自行按所选难度布置守军。</p></li></ol><a class="primary-button" href="/assets/pocket-paladin/rules-en.pdf" target="_blank" rel="noopener">完整英文规则 · 40 页 ↗</a><a class="primary-button" href="https://boardgamegeek.com/filepage/299338/rulebook" target="_blank" rel="noopener">BGG 规则页 ↗</a><p class="subtle-note">移动合法性、能力次数、费用、战斗及胜负由玩家依手册结算。能力位置标记直接拖至路线格；创伤 10 表示抵达最左端。备用地图翻面后按原图继续使用。</p>`;
}
export const pocketPaladin={
  id:'pocket-paladin',title:'口袋骑士',subtitle:'POCKET PALADIN',players:'1 人',duration:'30–60 分钟',create:createPocketPaladinSession,
  openingProfiles:()=>['red','purple'].flatMap(hero=>['A','B'].map(start=>({id:`pp-${hero}-${start}`,name:`${hero==='red'?'红':'紫'}骑士 · 地图 ${start} 出发`,coverAssetId:'pp-hero',description:hero==='red'?'开局从展示区选择一个技能。':'开局具有一个盟友容量。',setup:createPocketPaladinSession(()=>.5,hero,start).initialSetup}))),
  openingProfileId:()=> 'pp-red-A',zones:[],journal:pocketJournal,canRoll:canRollPocketSource,rollObject:rollPocketSource,
  prepareSession:preparePocketSession,cardPlacement:pocketPawnPlacement,onDrop:pocketMapDrop,onTokenDrop:dropPocketMarker,snapLabel:'卡面格点吸附',
  tokens:Object.entries(labels).map(([key,name])=>({kind:'pp-'+key,name,color:key==='wounds'?'#9c393a':'#b99a5d',...(!positionMarkers.has(key)?{value:limits[key][0]}:{}),width:26,height:26,description:positionMarkers.has(key)?'空白指示物 · 拖近对应轨道或能力格时吸附到格子中心，用位置记录状态。':'滚轮增减水晶数值，并同步水晶转盘。'})),
  tokenIcon:(kind,o)=>`<span title="${labels[kind.slice(3)]||''}" style="font-size:13px;font-weight:bold;color:#fff">${positionMarkers.has(kind.slice(3))?'':o?.value??''}</span>`,adjustToken:adjustPocketToken,
};
