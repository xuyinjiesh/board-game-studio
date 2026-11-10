import {createSession,baseObject,createFixedPile,captureSetup,applySetup,assetFor,shuffled,deckEntries,replaceDeckEntries,appendDeckEntries,takeDeckCard,dimensions,canReceiveCards} from '../model.js';
import {tinHelmAssets} from './tin-helm-assets.js';

export const tinHelmHeroes=tinHelmAssets.filter(a=>a.group==='hero');
const gear=tinHelmAssets.filter(a=>a.group==='trapping');
const byRole=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.thRole===role);
const token=(s,key)=>s.objects.find(o=>o.type==='token'&&o.kind==='th-'+key);
const value=(s,key)=>Number.isFinite(token(s,key)?.value)?token(s,key).value:0;
const progress=s=>token(s,'room');
const roomCount=s=>progress(s)?.thRooms===7?7:6;
const hero=(s,role)=>tinHelmHeroes.find(a=>a.id===s.objects.find(o=>o.thRole===role)?.assetId);
const baseRooms=tinHelmAssets.filter(a=>a.group==='dungeon'&&!a.bonus).map(a=>a.id);
const allRooms=tinHelmAssets.filter(a=>a.group==='dungeon').map(a=>a.id);
const pile=(name,role,x,y,cards=[],faceUp=true,extra={})=>({...createFixedPile(x,y),name,thRole:role,cards,faceUp,setupFace:'fixed',width:160,height:220,maxCards:80,z:5,...extra});
const card=(assetId,x,y,role,faceUp=true)=>({...baseObject('card',x,y,10),assetId,thRole:role,faceUp,width:160,height:220,setupFace:'fixed'});
const names={health:'生命',energy:'能量',food:'食物',favor:'声望',shards:'碎片',level:'层数',room:'房间',enemy:'敌人生命'};
const caps=s=>({health:hero(s,'race')?.hp+hero(s,'class')?.bonusHp,energy:hero(s,'race')?.energy+hero(s,'class')?.bonusEnergy,food:5,favor:15,shards:3,level:5,room:roomCount(s),enemy:99});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createTinHelmSession(random=Math.random,raceId='human',jobId='footpad',extraRooms=false){
  const race=tinHelmHeroes.find(a=>a.race===raceId),job=tinHelmHeroes.find(a=>a.job===jobId);
  if(!race||!job||race.id===job.id)throw new Error('种族和职业必须来自不同的双面卡');
  const s={...createSession('锡盔'),gameId:'tin-helm',mode:'play',assets:structuredClone(tinHelmAssets),meta:{players:'1 人',duration:'20–30 分钟',description:'在黑山深处寻找三枚碎片。选择种族与职业，在每一间地城里权衡风险与补给。',rules:'自由桌面与流程辅助：双面地城探索、收牌、换层和属性记录由工具辅助。战斗、卡牌能力、事件选择、费用与胜负请按中文牌面结算。奖励角色和地城可在自选开局中启用。'}};
  s.settings.theme='night';s.settings.snap=true;
  const items=job.items.map(side=>{const a=gear.find(a=>a.sides.includes(side));return {id:a.id,faceUp:a.sides[0]===side};});
  // The bonus Adventurer needs both Bedroll and Potion. Use the separate loot
  // potion, preserving the two sides of every physical trapping card.
  if(new Set(items.map(a=>a.id)).size!==items.length){const potion=items.find((a,i)=>items.findIndex(b=>b.id===a.id)!==i);potion.id='th-loot-potion';potion.faceUp=true;}
  const owned=new Set(items.map(a=>a.id));if(race.race==='halfling')owned.add('th-loot-ring');
  s.objects.push(card(race.id,140,210,'race'),card(job.id,330,210,'class',false));
  const inventory=(id,i,faceUp=true)=>({...card(id,110+i*145,510,'inventory',faceUp),width:125,height:172});
  items.forEach((a,i)=>s.objects.push(inventory(a.id,i,a.faceUp)));
  if(race.race==='halfling')s.objects.push(inventory('th-loot-ring',items.length));
  const rooms=extraRooms?allRooms:baseRooms;
  s.objects.push(pile('地城 · 地图朝上','dungeon',740,210,rooms,true,{setupKey:'th-dungeon',setupOrder:'shuffle'}),
    pile('当前地图','map',950,210,[],true,{maxCards:1}),pile('对应结果 · 背面','result',1150,210,[],false,{maxCards:1}),
    pile('已探索地城','discard',1350,210),pile('当前敌人','enemy',1150,550,[],true,{maxCards:1}),
    pile('敌人图鉴','enemies',1510,210,tinHelmAssets.filter(a=>a.group==='enemy').map(a=>a.id),false),
    pile('战利品','loot',1510,520,tinHelmAssets.filter(a=>a.group==='loot'&&!owned.has(a.id)).map(a=>a.id),false),
    pile('备用装备 · 人类额外选择','gear',1510,830,gear.filter(a=>!owned.has(a.id)).map(a=>a.id)),
    pile('已消耗物品','spent',1320,830),pile('备用种族／职业','heroes-reserve',550,210,tinHelmHeroes.filter(a=>a.id!==race.id&&a.id!==job.id).map(a=>a.id)),
    pile('奖励地城 · 默认不加入','bonus-rooms',1700,830,extraRooms?[]:allRooms.filter(id=>!baseRooms.includes(id))),
    pile('魅惑暗黑鼠','charmed',1700,520,[],true,{maxCards:1}));
  for(const [i,code] of ['health','energy','favor','level'].entries())s.objects.push({...baseObject('board',680+(i%2)*210,570+Math.floor(i/2)*285,0),assetId:'th-track-'+code,width:190,height:261,locked:true});
  for(const [i,key] of Object.keys(names).entries()){
    const initial={health:race.hp+job.bonusHp,energy:race.energy+job.bonusEnergy,food:race.food,level:1};
    s.objects.push({...baseObject('token',1100+(i%4)*115,1030+Math.floor(i/4)*100,30),kind:'th-'+key,name:names[key],value:initial[key]||0,color:key==='shards'?'#9179bb':key==='health'?'#a45258':'#8b846e',width:62,height:62,setupFace:'fixed',...(key==='room'?{thPhase:'ready',thRooms:rooms.length/2,thExtra:race.race==='human',thEnded:false}:{})});
  }
  for(let i=0;i<2;i++)s.objects.push({...baseObject('die',1110+i*85,790,30),color:'ivory',name:'战斗骰 '+(i+1),faces:[1,2,3,4,5,6],value:1,width:56,height:56,setupFace:'fixed'});
  for(const o of s.objects.filter(o=>o.type==='token'))syncToken(s,o);
  for(const [i,code] of ['altar','grove','shrine'].entries())s.objects.push(card('th-ref-'+code,140+i*185,855,'reference'));
  s.objects.push(card('th-ref-charm',1700,210,'reference'));
  s.initialSetup=captureSetup(s,{name:`${race.raceName} · ${job.jobName}${extraRooms?' · 奖励地城':''}`});
  return applySetup(s,s.initialSetup,random);
}

function requirePlay(s){if(s.mode!=='play')throw new Error('请在游玩模式操作');}
function active(s){requirePlay(s);if(tinHelmStatus(s).outcome!=='playing')throw new Error('本次冒险已结束，可撤销或重新开局');}
function requirePiles(s,roles){return roles.map(role=>{const o=byRole(s,role);if(!o||o.locked)throw new Error('请恢复并解锁相关牌位');return o;});}
function requireTokens(s,keys){for(const k of keys)if(!token(s,k)||token(s,k).locked)throw new Error('请恢复并解锁属性标记');}
function checkRooms(s,p){if(p.cards.some(id=>assetFor(s,id)?.group!=='dungeon'))throw new Error('地城牌位混入其他组件');}
export function tinHelmAnchors(s,key){
  const track={health:'health',energy:'energy',food:'energy',favor:'favor',level:'level',enemy:'level'}[key];
  const mat=s.objects.find(o=>o.type==='board'&&o.assetId==='th-track-'+track);if(!mat)return [];
  let points=[];
  if(key==='health')points=Array.from({length:15},(_,v)=>[v===0?250:v>=10?65:v>=5?163:250,v===0?294:90+(v>=10?14-v:v>=5?9-v:4-v)*51,v]);
  if(key==='energy')points=Array.from({length:14},(_,v)=>[v===0?65:v>=8?65:163,v===0?399:v>=8?94+(13-v)*51:43+(7-v)*51,v]);
  if(key==='food')points=Array.from({length:6},(_,v)=>[250,94+(5-v)*51,v]);
  if(key==='favor')points=Array.from({length:16},(_,v)=>[v===0?250:v>=11?65:v>=6?163:250,v===0?349:91+(v>=11?15-v:v>=6?10-v:5-v)*51,v]);
  if(key==='level')points=[[65,73,1],[142,45,2],[220,62,3],[172,104,4],[238,137,5]];
  if(key==='enemy')points=Array.from({length:13},(_,v)=>[v===0?250:v>=9?65:v>=5?163:250,v===0?395:203+(v>=9?12-v:v>=5?8-v:4-v)*48,v]);
  const {w,h}=dimensions(s,mat),angle=mat.rotation*Math.PI/180;
  return points.map(([x,y,value])=>{const dx=(x/300-.5)*w,dy=(y/411-.5)*h;return {x:mat.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:mat.y+dx*Math.sin(angle)+dy*Math.cos(angle),value};});
}
function syncToken(s,o){const point=tinHelmAnchors(s,o.kind.slice(3)).find(p=>p.value===o.value);if(point)Object.assign(o,{x:point.x,y:point.y,width:22,height:22});}
export function dropTinHelmToken(s,o){
  if(!s.settings.snap||o.locked||!o.kind?.startsWith('th-'))return;
  const closest=tinHelmAnchors(s,o.kind.slice(3)).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y))[0];
  if(closest&&Math.hypot(closest.x-o.x,closest.y-o.y)<24&&closest.value<=caps(s)[o.kind.slice(3)])Object.assign(o,{x:closest.x,y:closest.y,value:closest.value});
}
export function adjustTinHelmToken(s,o,delta){
  const key=o.kind?.slice(3),cap=caps(s)[key];if(!Number.isFinite(cap))return;
  o.value=Math.max(key==='level'?1:0,Math.min(cap,o.value+delta));syncToken(s,o);
}
function change(s,key,delta){adjustTinHelmToken(s,token(s,key),delta);}

export function exploreTinHelm(s,choice){
  active(s);if(!['enter','skip'].includes(choice))throw new Error('请选择进入或跳过');
  requireTokens(s,['room']);const p=progress(s);
  if(p.thExtra)throw new Error('人类请先从备用装备选择一张额外装备');
  if(p.thPhase!=='ready'||p.value>=roomCount(s))throw new Error('请先完成当前房间，或在本层结束后下层');
  const [source,map,result]=requirePiles(s,['dungeon','map','result']);
  if(map.cards.length||result.cards.length||byRole(s,'enemy')?.cards.length)throw new Error('请先清空当前房间与敌人');
  if(!canReceiveCards(map,1)||!canReceiveCards(result,1))throw new Error('当前地图与结果牌位容量不足');
  checkRooms(s,source);if(source.cards.length<2)throw new Error('地城牌不足两张，请归还手动取出的地城牌');
  const first=takeDeckCard(source),second=takeDeckCard(source);
  appendDeckEntries(map,[{...(choice==='enter'?first:second),faceUp:true}]);
  appendDeckEntries(result,[{...(choice==='enter'?second:first),faceUp:false}]);
  p.thPhase='room';p.thChoice=choice;
  return `${choice==='enter'?'进入第一间':'跳过第一间，进入第二间'}。依地图图标从左到右，在结果卡背面查找并结算；营地、水源直接依规则处理。`;
}
export function finishTinHelmRoom(s){
  active(s);requireTokens(s,['room']);const p=progress(s);
  if(p.thPhase!=='room')throw new Error('请先探索一个房间');
  const [map,result,discard,enemy]=requirePiles(s,['map','result','discard','enemy']);
  if(enemy.cards.length)throw new Error('请先击败或手动归还当前敌人');
  if(map.cards.length!==1||result.cards.length!==1)throw new Error('请归还当前地图与结果卡');
  if(!canReceiveCards(discard,2))throw new Error('已探索地城牌位容量不足');
  for(const o of [map,result,discard])checkRooms(s,o);
  for(const o of [map,result]){appendDeckEntries(discard,deckEntries(o).map(a=>({...a,faceUp:true})));replaceDeckEntries(o,[]);}
  p.value++;p.thPhase='ready';delete p.thChoice;
  return p.value===roomCount(s)?'本层探索完毕。点击下层以消耗食物并重洗地城。':'房间已收回，可继续查看牌库顶部的地图。';
}
export function nextTinHelmLevel(s,random=Math.random){
  active(s);requireTokens(s,['room','level','food','health']);const p=progress(s);
  if(p.thPhase!=='ready'||p.value!==roomCount(s))throw new Error('先完成本层全部房间');
  const [source,discard,map,result,enemy]=requirePiles(s,['dungeon','discard','map','result','enemy']);
  if(source.cards.length||map.cards.length||result.cards.length||enemy.cards.length)throw new Error('请先收回本层全部地城与敌人');
  const expected=roomCount(s)===7?allRooms:baseRooms;
  if(discard.cards.length!==expected.length||new Set(discard.cards).size!==expected.length||expected.some(id=>!discard.cards.includes(id)))throw new Error('地城卡不完整或重复，请先归还并核对');
  if(value(s,'level')===5){p.thEnded=true;return '第五层已经结束，未集齐三枚碎片，本次冒险失败。';}
  change(s,'level',1);if(value(s,'food')>0)change(s,'food',-1);else change(s,'health',-3);
  replaceDeckEntries(source,shuffled(discard.cards,random).map(assetId=>({assetId,faceUp:true})));replaceDeckEntries(discard,[]);p.value=0;
  return value(s,'health')===0?'饥饿耗尽生命，本次冒险失败。':'进入下一层；食物或饥饿已结算。请重置每层一次的角色与物品能力。';
}

export function takeTinHelmComponent(s,id,faceUp=true){
  active(s);const a=tinHelmAssets.find(a=>a.id===id);
  if(!['loot','enemy','trapping'].includes(a?.group))throw new Error('请选择敌人、装备或战利品');
  const role={loot:'loot',enemy:'enemies',trapping:'gear'}[a.group];
  const [source]=requirePiles(s,[role]);const index=source.cards.indexOf(id);if(index<0)throw new Error('该卡已被取走或消耗，不重复生成');
  if(a.group==='enemy'){
    const [target]=requirePiles(s,['enemy']);requireTokens(s,['enemy']);
    if(progress(s)?.thPhase!=='room'||target.cards.length)throw new Error('请在当前房间内先处理上一位敌人');
    if(!canReceiveCards(target,1))throw new Error('当前敌人牌位容量不足');
    takeDeckCard(source,index);appendDeckEntries(target,[{assetId:id,faceUp:true}]);token(s,'enemy').value=a.hp+value(s,'level');syncToken(s,token(s,'enemy'));
    return '敌人已就位，生命已加当前层数。先按牌面结算先攻、能量损失与特殊能力；战斗伤害请手动调整。';
  }
  if(a.group==='trapping'){
    requireTokens(s,['room']);if(!progress(s).thExtra||value(s,'room')||value(s,'level')!==1||progress(s).thPhase!=='ready')throw new Error('备用装备仅供人类在冒险前额外选择一张；其他取用可自由拖牌');
    progress(s).thExtra=false;
  }
  takeDeckCard(source,index);
  const count=s.objects.filter(o=>o.thRole==='inventory').length;
  s.objects.push({...card(id,110+(count%4)*145,510+Math.floor(count/4)*205,'inventory',faceUp),width:125,height:172});
  return a.group==='trapping'?'人类额外装备已选定。':'战利品已取出；效果与消耗请按卡面执行。';
}
export function defeatTinHelmEnemy(s){
  active(s);const [enemy,source]=requirePiles(s,['enemy','enemies']);requireTokens(s,['enemy','favor','food','shards']);
  if(enemy.cards.length!==1||assetFor(s,enemy.cards[0])?.group!=='enemy')throw new Error('当前没有一位敌人');
  if(value(s,'enemy')!==0)throw new Error('先手动结算战斗，将敌人生命降至0；跳过或消灭敌人请手动归还，不使用击败奖励');
  const a=tinHelmAssets.find(a=>a.id===enemy.cards[0]);
  if(!a||!canReceiveCards(source,1))throw new Error('敌人图鉴无法接收这张牌');
  change(s,'favor',a.id==='th-enemy-mimic'?value(s,'level'):a.favor);
  if(a.id==='th-enemy-rats')change(s,'food',1);if(a.id==='th-enemy-possessor')change(s,'shards',1);
  appendDeckEntries(source,[{...takeDeckCard(enemy),faceUp:false}]);
  return '敌人已归还图鉴，声望与牌面击败奖励已记录。';
}
export function tinHelmStatus(s){
  const stats=Object.fromEntries(Object.keys(names).map(k=>[k,value(s,k)])),p=progress(s);
  const outcome=stats.health<=0?'lost':stats.shards>=3?'won':p?.thEnded?'lost':'playing';
  return {...stats,rooms:roomCount(s),phase:p?.thPhase??'ready',outcome,score:stats.shards*10+stats.health+stats.energy+stats.food+stats.favor*2-stats.level*2};
}

function roster(s){
  const race=hero(s,'race'),job=hero(s,'class');
  return `<span class="section-eyebrow">TIN HELM · CHOOSE YOUR ADVENTURER</span><h2>自选种族与职业</h2><p class="modal-lead">同一张卡的正反两面不能同时选择。四个基础种族与职业有12种组合；素材附带的奖励卡也可选用。此操作重新开始一局。</p><form data-game-submit="th-adventurer"><label>冒险者组合<select name="value" class="th-select">${tinHelmHeroes.map(r=>`<optgroup label="${r.raceName}${r.bonus?' · 奖励卡':''}">${tinHelmHeroes.filter(j=>j.id!==r.id).map(j=>`<option value="${r.race}|${j.job}" ${r.id===race?.id&&j.id===job?.id?'selected':''}>${r.raceName} · ${j.jobName}（生命${r.hp+j.bonusHp} / 能量${r.energy+j.bonusEnergy}）</option>`).join('')}</optgroup>`).join('')}</select></label><p class="subtle-note">默认12张基础地城，每层6房间。加入深渊和隧道的14张变体，可用下方按钮开局。</p><button class="primary-button" type="submit">基础地城开局 →</button></form><form data-game-submit="th-adventurer-bonus"><input type="hidden" name="value" value="${race?.race||'human'}|${job?.job||'footpad'}"><button class="quiet" type="submit">用当前种族职业加入两张奖励地城（每层7房间）</button></form>`;
}
function catalog(s){
  const section=(title,group,role)=>{
    const entries=tinHelmAssets.filter(a=>a.group===group).map(a=>{
      const display=assetFor(s,a.id)||a,available=byRole(s,role)?.cards.includes(a.id);
      const buttons=!available?'<small>已取用</small>':a.sides?
        progress(s)?.thExtra?a.sides.map((side,i)=>`<button data-game-action="th-take" data-game-value="${a.id}|${i===0?'front':'back'}">选择${a.name.split(' / ')[i]}</button>`).join(''):'<small>备用 · 可在桌面取用</small>':
        `<button data-game-action="th-take" data-game-value="${a.id}" ${group==='enemy'&&(progress(s)?.thPhase!=='room'||byRole(s,'enemy')?.cards.length)?'disabled':''}>${group==='enemy'?'开始战斗':'取到物品区'}</button>`;
      return `<article><img src="${display.front}" alt="${escape(display.name)}" loading="lazy"><strong>${escape(display.name)}${a.bonus?' · 奖励卡':''}</strong>${buttons}</article>`;
    }).join('');
    return `<h3>${title}</h3><div class="th-catalog">${entries}</div>`;
  };
  const equipment=()=>section('备用双面装备','trapping','gear');
  return `<span class="section-eyebrow">TIN HELM · COMPONENTS</span><h2>敌人与物品</h2><p class="modal-lead">敌人可重复遭遇，击败后归还图鉴。物品取用实体卡，不生成副本；已消耗物品拖入对应牌位。人类开局先从剩余双面装备选择一面。</p>${progress(s)?.thExtra?equipment():''}${section('敌人图鉴','enemy','enemies')}${section('战利品','loot','loot')}${progress(s)?.thExtra?'':equipment()}`;
}
const steps=[
  ['目标与开局','在第五层结束前集齐三枚碎片。选择不同双面卡上的种族与职业，生命和能量相加作为本局上限，食物取种族数值，声望从0开始。人类需额外选一张剩余装备；半身人携带戒指。开局按本素材的中文卡面数值设置，奖励职业与原基础版可能不同。'],
  ['探索两张地城','牌库顶部地图始终可见。进入：第一张做地图，第二张翻至结果面。跳过：第一张翻至结果面，第二张做地图。按地图图标由左至右，查结果卡相应行，依次处理。每次消耗两张，基础版每层6个房间。营地与水源不查结果行。'],
  ['战斗','从图鉴取对应敌人，敌人生命=牌面生命+当前层数。通常玩家先手，厄运头骨先手；监视者战前扣1能量。先决定花费1、2或3能量，再投双骰：点数差加职业对应奖励，再扣敌人防御；同点落空，特殊武器另计。不花能量时可直接造成1点无视防御的伤害。敌人反击也投双骰：点数差+攻击，同点落空；骨蜈蚣同点重投。双方轮流直到一方生命为0。按钮只投骰，不代算伤害与能力。'],
  ['战斗奖励与装备','手动扣减敌人生命到0后点「击败并领奖」，自动记录声望、暗黑鼠的食物或附身灵的碎片，再归还敌人。宝箱怪声望等于当前层数。怨灵、蛛形怪、盾牌、长剑、匕首、鸦人翻骰等请按卡面手动结算。卷轴消灭、门楔或戒指绕过战斗时无击败奖励，应手动归还敌人。'],
  ['事件与补给','营地：恢复2生命和1能量，或获得1食物；地精两者兼得，书籍与铺盖卷增加恢复。水源：投1骰，5/6获得1食物；渔网允许投3次。鱼人水源加1生命或1能量。蘑菇林、祭坛、迷宫、猪面人、圣所见桌面双面参考卡，双击或F翻面阅读。事件、陷阱和消耗效果手动调整属性。'],
  ['碎片与换层','圣所、附身灵、祭坛、萝卜交易和地城战利品均可能获得碎片。完成所有房间后点下层，消耗1食物，无食物则失去3生命；重洗完整地城，重置每层一次能力。奖励地城变体为14张、每层7房间，默认关闭。生命为0即失败，第三枚碎片即胜利，第五层结束仍不足三枚则失败。'],
  ['桌面与参考分','拖动卡牌，F翻面，R侧放记录能力，标记滚轮增减，右键看大图。已用物品放入已消耗牌位，物品和敌人可搜索取用。所有辅助操作可撤销、自动保存与导出。分数=碎片×10+生命+能量+食物+声望×2−层数×2；只是当前属性参考，不代判手动结算是否合法。']
];
export const tinHelm={
  id:'tin-helm',title:'锡盔',subtitle:'TIN HELM',players:'1 人',duration:'20–30 分钟',create:createTinHelmSession,
  coverAssetIds:['th-hero-human','th-room-catacombs','th-enemy-possessor'],
  openingProfiles:()=>tinHelmHeroes.filter(a=>!a.bonus).flatMap(r=>tinHelmHeroes.filter(j=>!j.bonus&&j.id!==r.id).map(j=>({id:`th-${r.race}-${j.job}`,name:`${r.raceName} · ${j.jobName}`,coverAssetId:r.id,description:`生命 ${r.hp+j.bonusHp} · 能量 ${r.energy+j.bonusEnergy} · 食物 ${r.food}${r.race==='human'?' · 额外选一件装备':''}`,setup:createTinHelmSession(()=>.5,r.race,j.job).initialSetup}))),
  openingProfileId:()=> 'th-human-footpad',
  tableBounds:{x:900,y:620,width:1820,height:1240},
  zones:[{className:'th-zone',label:'TIN HELM · 锡盔',subtitle:'深入黑山，寻找三枚碎片',box:[65,5,700,50]},
    {className:'th-zone',label:'地城探索',subtitle:'进入第一间，或跳过并进入下一间 · 结果卡背面对应地图图标',box:[665,10,1000,50]},
    {className:'th-zone',label:'冒险者装备',subtitle:'已消耗物品请移至右侧牌位',box:[65,345,550,50]},
    {className:'th-zone',label:'事件参考',subtitle:'双击翻面 · 祭坛 / 营地 · 蘑菇林 / 迷宫 · 圣所 / 猪面人',box:[65,680,550,50]}],
  tokens:Object.keys(names).map(key=>({kind:'th-'+key,name:names[key],value:key==='level'?1:0,color:key==='shards'?'#9179bb':'#8b846e',width:62,height:62})),
  tokenIcon:(kind,o)=>`<span class="th-token ${o?.width===22?'th-track-token':''}"><small>${names[kind.slice(3)]||''}</small><b>${Number.isFinite(o?.value)?o.value:''}</b></span>`,adjustToken:adjustTinHelmToken,
  snapLabel:'属性轨道吸附',onDrop:dropTinHelmToken,
  views:['roster'],roster,catalog,
  journal(s){const v=tinHelmStatus(s);return `<span class="section-eyebrow">TIN HELM · JASON GLOVER</span><h2>锡盔 · 冒险手册</h2><p class="modal-lead">${hero(s,'race')?.raceName||''} · ${hero(s,'class')?.jobName||''} / 第${v.level}层 / 碎片 ${v.shards}/3 / 参考分 ${v.score}</p><ol class="rule-steps">${steps.map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><a class="primary-button" href="/assets/tin-helm/sheets-zh.pdf" target="_blank" rel="noopener">中文组件素材 · 10页 ↗</a><a class="primary-button" href="https://www.thegamecrafter.com/games/tin-helm" target="_blank" rel="noopener">作者介绍与教学 ↗</a><p class="subtle-note">素材PDF是组件打印文件，不是完整规则书。美术、游戏与翻译权利归原作者及汉化者。</p>`;},
  toolbar(s){
    const v=tinHelmStatus(s),disabled=s.mode!=='play'?'disabled':'',p=progress(s);
    const button=(action,label,val='')=>`<button data-game-action="th-${action}" data-game-value="${val}" ${disabled}>${label}</button>`;
    return `<div class="th-toolbar"><div><button data-game-action="heroes">基础组合</button><button data-game-action="roster">自选 / 奖励卡</button><span>第 ${v.level} 层 · 房间 ${v.room}/${v.rooms} · 碎片 ${v.shards}/3</span><button data-game-action="catalog">敌人与物品</button><button data-game-action="journal">中文规则</button></div><div>${v.outcome!=='playing'?`<strong>${v.outcome==='won'?'三枚碎片齐聚 · 冒险成功':'冒险结束'} · 参考分 ${v.score}</strong>`:p?.thExtra?'<button data-game-action="catalog">人类：选择额外装备 →</button>':v.phase==='room'?button('finish','结算完毕 · 收回房间'):v.room>=v.rooms?button('next','结束本层 · 下层'):button('explore','进入当前房间','enter')+button('explore','跳过 · 进入下一间','skip')}${button('roll','投双骰')}${byRole(s,'enemy')?.cards.length?button('defeat','击败并领奖'):''}<small>战斗、事件与能力按牌面手动结算</small></div><div><select aria-label="选择调整属性" data-game-input="th-stat">${['health','energy','food','favor','shards','enemy'].map(k=>`<option value="${k}" ${p?.thStat===k?'selected':''}>${names[k]} ${v[k]}</option>`).join('')}</select>${button('adjust','−1','-1')}${button('adjust','+1','1')}<span>生命 ${v.health}/${caps(s).health} · 能量 ${v.energy}/${caps(s).energy} · 食物 ${v.food} · 声望 ${v.favor}</span></div></div>`;
  },
  act(s,action,raw,selected,random=Math.random){
    if(action==='th-explore')return exploreTinHelm(s,raw);
    if(action==='th-finish')return finishTinHelmRoom(s);
    if(action==='th-next')return nextTinHelmLevel(s,random);
    if(action==='th-take'){const [id,side]=raw.split('|');return takeTinHelmComponent(s,id,side!=='back');}
    if(action==='th-defeat')return defeatTinHelmEnemy(s);
    requirePlay(s);
    if(action==='th-stat'){const key=raw.split('|').at(-1);if(!['health','energy','food','favor','shards','enemy'].includes(key))throw new Error('无效属性');requireTokens(s,['room']);progress(s).thStat=key;return;}
    if(action==='th-adjust'){const key=progress(s)?.thStat||'health';requireTokens(s,[key]);if(!['1','-1'].includes(raw))throw new Error('无效调整');change(s,key,Number(raw));return;}
    if(action==='th-roll'){const dice=s.objects.filter(o=>o.type==='die'&&o.name.startsWith('战斗骰'));if(dice.length!==2||dice.some(o=>o.locked))throw new Error('请恢复并解锁两枚战斗骰');for(const d of dice)d.value=1+Math.floor(random()*6);const [a,b]=dice.map(d=>d.value);return `投出 ${a} 和 ${b}，${a===b?'同点，通常落空；请核对武器或敌人能力':`点数差 ${Math.abs(a-b)}`}。请自行加减职业奖励、防御与能力。`;}
    if(['th-adventurer','th-adventurer-bonus'].includes(action)){
      const [,race,job]=raw.split('|');
      if(s.setupProfiles?.length>=64&&!s.setupProfiles.some(p=>p.id==='th-custom'))throw new Error('开局方案已达上限，请先移除一个方案');
      const fresh=createTinHelmSession(random,race,job,action.endsWith('-bonus'));
      const setup=fresh.initialSetup;
      Object.assign(s,{objects:fresh.objects,initialSetup:setup,setup:structuredClone(setup)});
      if(s.setupProfiles){
        let profile=s.setupProfiles.find(p=>p.id==='th-custom');
        if(!profile){profile={id:'th-custom'};s.setupProfiles.push(profile);}
        Object.assign(profile,{setup:structuredClone(setup),name:setup.name,coverAssetId:'th-hero-'+race,description:'自选组合 · '+(action.endsWith('-bonus')?'14张奖励地城':'12张基础地城')});
        s.activeSetupProfileId=profile.id;
      }
      return {closeDialog:true,message:'新冒险已准备，可用撤销返回上一局。'};
    }
    throw new Error('未知的锡盔操作');
  }
};
