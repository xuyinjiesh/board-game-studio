import {createSession,baseObject,createFixedPile,captureSetup,applySetup,assetFor,shuffled,nextZ,appendDeckEntries,takeDeckCard,dimensions,pointOnObject} from '../model.js';
import {realmsAssets} from './52-realms-assets.js';

export const REALMS_MAPS=['永恒游荡之魂的陵墓','永恒午夜森林','钟表匠的迷宫'];
export const REALMS_HEROES=[
  {id:'barbarian',name:'野蛮人',limit:25,description:'致命反击、投掷战斧与狂乱。'},
  {id:'wizard',name:'法师',limit:20,description:'将伤害转为战利品，施展法术刷新装备。'},
  {id:'druid',name:'德鲁伊',limit:25,description:'耗尽装备变形；使用额外标记追踪形态。'},
  {id:'fallen-knight',name:'堕落骑士',limit:35,description:'带着一张创伤出发，以血怒反击，使用龙血。'},
  {id:'tinkerer',name:'修补匠',limit:20,description:'融合低等级装备，以备用零件与搜寻积累资源。'},
  {id:'hunter',name:'猎人',limit:25,description:'追猎敌人，将收藏与普通战利品分开计分。'}
];
const SUITS=['clubs','spades','hearts','diamonds'];
const LABELS=['梅花 · 力量','黑桃 · 欺诈','红心 · 治疗','方块 · 幸运'];
const byRole=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.realmsRole===role);
const poker=(s,id)=>assetFor(s,id)?.group==='poker';
const rank=(s,id)=>{const value=assetFor(s,id)?.number;return Number.isInteger(value)&&value>=1&&value<=13?value:0;};
const pile=(name,role,x,y,faceUp=true)=>({...createFixedPile(x,y),name,realmsRole:role,maxCards:52,width:120,height:168,faceUp,setupFace:'fixed',z:5});
const marker=(kind,name,x,y,color)=>({...baseObject('token',x,y,30),kind:'realms-'+kind,name,color,width:22,height:22});
const board=(assetId,x,y,width,height)=>({...baseObject('board',x,y,0),assetId,width,height,locked:true});

export function createRealmsSession(random=Math.random,mapNumber=1,heroId='barbarian'){
  const hero=REALMS_HEROES.find(h=>h.id===heroId);
  if(!hero||!Number.isInteger(mapNumber)||mapNumber<1||mapNumber>3)throw new Error('请选择有效的地图与角色');
  const s={...createSession('52王国'),gameId:'52-realms',mode:'play',assets:structuredClone(realmsAssets),meta:{
    players:'1 人',duration:'30–45 分钟',description:'一副扑克牌，三座地下城。管理装备、穿越险境，击败首领并带回战利品。',
    rules:'自由桌面：依中文地图与角色面板执行移动、战斗、诅咒及房间效果。侧放装备表示耗尽。将创伤、物品、战利品放入对应牌位后，工具栏可统计其点数。A 必须先结算诅咒，再弃置并重抽。'}
  };
  s.objects.push(board('realms-map-'+mapNumber,500,560,700,990),
    {...baseObject('card',1025,400,2),assetId:'realms-hero-'+heroId,faceUp:true,snapCards:false,locked:true},
    board('realms-items-'+heroId,1440,560,110,987));
  const draw=pile('牌库','draw',60,180,false);
  Object.assign(draw,{cards:s.assets.filter(a=>a.group==='poker').map(a=>a.id),setupKey:'realms-draw',setupOrder:'shuffle',
    realmsPrepare:true,realmsEquipment:{x:190,y:1250,spacing:160},drawTarget:{mode:'deck',deckKey:'realms-reveal'}});
  s.objects.push(draw,pile('弃牌堆','discard',60,420),pile('敌人牌','enemy',60,660),pile('奖励牌','reward',60,900),
    {...pile('揭示区 · A 先结算诅咒','reveal',1010,1120),drawKey:'realms-reveal'},
    pile('创伤','wounds',1010,870),pile('战利品','loot',1180,870,false));
  const itemLabels=[...LABELS];
  if(heroId==='fallen-knight')itemLabels[2]='红心 · 龙血';
  if(heroId==='tinkerer')itemLabels[0]='梅花 · 备用零件';
  if(heroId==='hunter')itemLabels[1]='黑桃 · 伪装';
  SUITS.forEach((suit,i)=>s.objects.push(pile(itemLabels[i],'item-'+suit,1295,185+i*245)));
  if(mapNumber===2)s.objects.push(pile('火炬 · 横置表示变暗','torch',1180,1120),{...pile('赏金','bounty',1188,185,false),width:86,height:120.4});
  if(mapNumber===3)s.objects.push(pile('上发条区','windup',1180,1120));
  if(heroId==='hunter')s.objects.push({...pile('猎人收藏 · 双倍计分','collection',1188,425,false),width:86,height:120.4});
  const start={1:[315,865],2:[533,865],3:[455,880]}[mapNumber];
  s.objects.push(marker('pawn','冒险者',150+start[0],65+start[1],'#c5a355'),
    marker('hp','敌人生命',338,1010,'#b94247'),marker('enemy','敌人类型',165,120,'#426e9e'));
  if(mapNumber===3)s.objects.push(marker('clock','时钟',150+538,65+923,'#9b713c'));
  if(heroId==='druid')s.objects.push(marker('form','德鲁伊形态',1190,390,'#65906b'));
  s.initialSetup=captureSetup(s,{name:`地图 ${mapNumber} · ${hero.name}`});
  const opening=applySetup(s,s.initialSetup,random);
  finishRealmsOpening(opening,s.initialSetup,random);
  return opening;
}

// Only a complete, undealt standard deck opts in. Custom authored openings,
// fixed card order and moved destinations retain their own setup policies.
export function finishRealmsOpening(s,setup,random=Math.random){
  const draw=byRole(s,'draw');
  if(!draw?.realmsPrepare||draw.cards.length!==52||new Set(draw.cards).size!==52||draw.cards.some(id=>!poker(s,id)))return;
  const hero=s.objects.find(o=>o.type==='card'&&assetFor(s,o.assetId)?.group==='hero');
  const items=SUITS.map(suit=>byRole(s,'item-'+suit)),wounds=byRole(s,'wounds');
  if(!hero||items.some(o=>!o||o.cards.length||o.locked)||!wounds||wounds.cards.length||wounds.locked||draw.locked)return;
  // Do not consume a second copy of cards already placed by an edited opening.
  if(s.objects.some(o=>o!==draw&&(o.type==='card'&&poker(s,o.assetId)||o.type==='deck'&&o.cards.some(id=>poker(s,id)))))return;
  const aces=[];
  const take=()=>{while(draw.cards.length){const entry=takeDeckCard(draw);if(rank(s,entry.assetId)===1)aces.push(entry.assetId);else return entry.assetId;}throw new Error('准备开局时牌库不足');};
  for(let i=0;i<2;i++){
    const id=take(),index=SUITS.indexOf(assetFor(s,id).suit);
    appendDeckEntries(items[index],[{assetId:id,faceUp:true}]);
  }
  const anchor=draw.realmsEquipment||{x:190,y:1250,spacing:160};
  let total=0,index=0;
  while(total<20){
    const id=take();total+=rank(s,id);
    s.objects.push({...baseObject('card',anchor.x+index++*anchor.spacing,anchor.y,nextZ(s)),assetId:id,faceUp:true,realmsRole:'equipment',snapCards:false});
  }
  if(assetFor(s,hero.assetId).hero==='fallen-knight')appendDeckEntries(wounds,[{assetId:take(),faceUp:true}]);
  // Aces are shuffled back only if they were set aside during preparation.
  // A fixed source keeps deterministic order, including the reinserted aces.
  if(aces.length)draw.cards=draw.setupOrder==='shuffle'?shuffled([...draw.cards,...aces],random):[...aces,...draw.cards];
  draw.faceUp=false;delete draw.cardFaces;
}

export function realmsStatus(s){
  const cards=role=>byRole(s,role)?.cards.filter(id=>poker(s,id)&&rank(s,id)!==1)||[];
  const sum=ids=>ids.reduce((n,id)=>n+rank(s,id),0);
  const hero=s.objects.find(o=>o.type==='card'&&assetFor(s,o.assetId)?.group==='hero');
  const wounds=sum(cards('wounds')),rawLimit=assetFor(s,hero?.assetId)?.woundLimit;
  const limit=Number.isInteger(rawLimit)&&rawLimit>0&&rawLimit<=999?rawLimit:undefined;
  const items=SUITS.reduce((n,suit)=>n+cards('item-'+suit).length,0);
  const bounty=cards('bounty');
  return {wounds,limit,items,loot:sum(cards('loot')),bounty:sum(bounty)*bounty.length,
    collection:sum(cards('collection'))*2,total:items*2+sum(cards('loot'))+sum(bounty)*bounty.length+sum(cards('collection'))*2,
    deck:byRole(s,'draw')?.cards.length||0};
}

export function revealRealmsCard(s){
  if(s.mode!=='play')throw new Error('请在游玩模式揭示卡牌');
  const draw=byRole(s,'draw'),reveal=byRole(s,'reveal');
  if(!draw||!reveal||draw.locked||reveal.locked)throw new Error('请先恢复并解锁牌库和揭示区');
  if(reveal.cards.length)throw new Error('请先处理揭示区的牌，再揭示下一张');
  if(!draw.cards.length)throw new Error('牌库已空；若规则要求抽牌，则冒险失败');
  if(!poker(s,draw.cards.at(-1)))throw new Error('牌库顶牌不是标准扑克牌');
  const entry=takeDeckCard(draw);appendDeckEntries(reveal,[{...entry,faceUp:true}]);
  return rank(s,entry.assetId)===1?'抽到 A：先执行地图左下角的诅咒，随后弃置 A，再揭示替代牌。':'已揭示一张牌，请依当前房间或战斗效果处理。';
}

// Coordinates are relative to the supplied map sheets, so moving, scaling or
// rotating the map preserves both the HP and clock track alignment.
export function realmsMarkerPlacement(s,o){
  if(s.mode!=='play'||!s.settings.snap||o.locked||!['realms-hp','realms-clock'].includes(o.kind))return null;
  const map=s.objects.find(m=>m.type==='board'&&assetFor(s,m.assetId)?.group==='map'&&pointOnObject(s,m,o.x,o.y).inside);
  if(!map)return null;
  const number=assetFor(s,map.assetId).mapNumber,{w,h}=dimensions(s,map),angle=map.rotation*Math.PI/180;
  const points=o.kind==='realms-clock'?(number===3?Array.from({length:12},(_,i)=>[265+i*39,923]):[]):
    Array.from({length:31},(_,i)=>[188,number===3?928-i*(883/30):950-i*(904/30)]);
  const world=points.map(([x,y])=>{const dx=(x/700-.5)*w,dy=(y/990-.5)*h;return {x:map.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:map.y+dx*Math.sin(angle)+dy*Math.cos(angle)};});
  const best=world.sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y))[0];
  return best&&Math.hypot(best.x-o.x,best.y-o.y)<Math.max(12,w*22/700)?best:null;
}

export function realmsJournal(){
  return `<span class="section-eyebrow">52 REALMS · ADVENTURES</span><h2>52王国 · 冒险手册</h2><p class="modal-lead">Matthew Dunstan · 3 张中文地图 / 6 位角色 / 52 张扑克牌。按地图上的路线与房间效果，自由探索地下城。</p><ol class="rule-steps">${[
    ['准备','选择地图与角色。开局自动发出 2 张物品（按花色入列），再发装备直到等级总和达到或超过 20；抽到的 A 暂时移出，准备完成后洗回牌库。堕落骑士额外带一张创伤出发。冒险者标记位于起点；地图 3 的时钟从 8 开始。'],
    ['卡牌与移动','2–10 按数字，J/Q/K 为 11/12/13，A 无等级。敌人选牌等平局按梅花、黑桃、红心、方块顺序判定。按箭头移动；通行费需要耗尽等级总和至少达到费用的装备。地图 3 可双向移动。侧放装备表示耗尽，旋转回竖向表示就绪。'],
    ['遭遇敌人','通常抽 2 张牌，高等级作为敌人，另一张作为奖励；按敌人牌花色确定类型。A/B/C 级敌人生命为等级 +5/+10/+15。将牌拖到敌人和奖励牌位，红色标记放在生命轨道。每回合揭示一张战斗牌；先处理带闪电的立即效果，再由你行动，敌人若仍存活则执行其余行动，最后弃置战斗牌。'],
    ['战斗行动','攻击：耗尽一张装备，按其等级造成伤害（扣除格挡）。防御：耗尽任意数量装备，本回合按总等级减伤。休息：重置全部装备。或执行一个角色技能。生命标记因你的行动停在特殊格时才触发该格效果；单纯经过不触发，敌人自行改变生命也不触发。胜利后弃置敌人，领取奖励。'],
    ['伤害、创伤与诅咒','受到伤害时抽一张牌：等级不大于伤害才成为创伤，否则弃置；幽灵造成的伤害自动视为创伤。创伤等级总和达到或超过角色阈值立即失败。任何原因抽到 A，都先执行地图左下角对应花色的诅咒，再弃置 A 并重抽。工具栏的揭示按钮每次只抽一张，诅咒由你结算。需要抽牌时牌库已空也会失败。'],
    ['奖励与物品','奖励可成为装备、按花色入列的物品，或背面朝上的战利品。物品可随时使用后弃置：梅花重置装备，黑桃暂改装备等级或花色，红心治疗一张创伤或抵消刚抽到的诅咒，方块替换新抽的牌（不能对抗诅咒）。堕落骑士、修补匠与猎人的专属物品以各自中文参考条为准。'],
    ['地图 2 · 黑暗森林','火炬放入专用牌位，等级达到火焰路线要求才能通过，通行本身不耗尽火炬。火炬第一次变暗时横置，第二次弃置；已耗尽的装备移作火炬仍保持横置。战斗牌等级高于火炬等级时敌人隐藏。神秘人遭遇抽 3 张，中间等级牌面朝下存入赏金，余下两张分配敌人和奖励。'],
    ['地图 3 · 时钟迷宫','时钟在 1–12 之间，增加超出 12 时承受一张创伤并停在 12。扭曲走廊抽牌决定费用：成功支付则移动并将时钟减少 1，否则传送至对应花色齿轮室，强制增加时钟并领取奖励。抽到的走廊牌随后弃置。上发条牌放入专用牌位，战斗结束后全部弃置。钟表匠的战斗牌等级加上当前时钟值。'],
    ['胜利与计分','到达终点并击败首领获胜。物品每张 2 分，战利品按等级相加；地图 2 赏金为等级总和乘张数；猎人收藏按等级双倍计分。工具栏按对应牌位统计候选得分和创伤，不自动判定胜负；请把物品、战利品、创伤与赏金分别放入对应牌位。'],
    ['桌面操作','拖动纸牌和标记，F 翻面、R 旋转，右键放大。拖牌到对应牌位中央即可收纳；同花色多件物品可叠放。牌库默认发到揭示区。将揭示区清空后可继续抽牌。敌人生命与时钟标记靠近轨道会吸附；金色冒险者、蓝色敌人类型与绿色形态标记自由摆放。Ctrl+滚轮缩放，空格+拖动平移。地图和角色默认锁定，在编辑模式解锁后可调整。']
  ].map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><div class="realms-rule-links"><a class="primary-button" href="/assets/52-realms/rules-zh.pdf" target="_blank" rel="noopener">原始中文规则 · 地图 1 ↗</a>${[1,2,3].map(i=>`<a class="primary-button" href="/assets/52-realms/rules-map-${i}.pdf" target="_blank" rel="noopener">地图 ${i} 补充规则 ↗</a>`).join('')}</div><p class="subtle-note">规则、地图与角色美术来自用户提供的 PnP 文件，版权归原作者及汉化者。工具提供准备、抽牌和牌位统计；移动、技能、房间、费用、战斗与胜负均由玩家结算。</p>`;
}

export const realms={
  id:'52-realms',title:'52王国',subtitle:'52 REALMS · ADVENTURES',players:'1 人',duration:'30–45 分钟',create:createRealmsSession,
  coverAssetIds:['realms-hero-barbarian','realms-hero-druid','realms-hero-tinkerer'],
  openingProfiles:()=>REALMS_MAPS.flatMap((map,i)=>REALMS_HEROES.map(hero=>({
    id:`realms-${i+1}-${hero.id}`,name:`地图 ${i+1} · ${hero.name}`,coverAssetId:'realms-hero-'+hero.id,
    description:`${map} · 创伤阈值 ${hero.limit}。${hero.description}`,setup:createRealmsSession(()=>.5,i+1,hero.id).initialSetup
  }))),openingProfileId:()=> 'realms-1-barbarian',afterOpening:finishRealmsOpening,
  tableBounds:{x:760,y:685,width:1610,height:1370},
  zones:[
    {className:'realms-zone',label:'52 王国',subtitle:'ADVENTURES · 探索 / 耗尽 / 生还',box:[910,20,460,45]},
    {className:'realms-zone',label:'装备 · 侧放表示耗尽',box:[125,1100,720,35]},
    {className:'realms-zone',label:'角色与创伤',box:[920,730,310,35]},
    {className:'realms-zone',label:'物品',subtitle:'按花色叠放',box:[1240,20,130,40]}
  ],
  tokens:[['pawn','冒险者','#c5a355'],['hp','敌人生命','#b94247'],['enemy','敌人类型','#426e9e'],['clock','时钟','#9b713c'],['form','德鲁伊形态','#65906b']].map(([kind,name,color])=>({kind:'realms-'+kind,name,color,width:22,height:22,description:'拖动到地图、轨道或角色形态上，用位置记录状态。'})),
  tokenIcon:()=>'<span class="realms-marker-core"></span>',
  onTokenDrop(s,o){const p=realmsMarkerPlacement(s,o);if(p)Object.assign(o,p);},
  toolbar(s){
    const v=realmsStatus(s);
    return `<div class="realms-toolbar"><button data-game-action="heroes">♜ 选择冒险</button><span class="realms-vitals ${v.limit&&v.wounds>=v.limit?'realms-danger':''}">创伤 ${v.wounds} / ${v.limit??'—'} <i>候选得分 ${v.total}</i></span><button data-game-action="realms-reveal" ${s.mode==='play'?'':'disabled'}>揭示一张牌</button><button data-game-action="journal">规则手册 ↗</button></div>`;
  },
  act(s,action){if(action==='realms-reveal')return revealRealmsCard(s);throw new Error('未知的冒险操作');},
  journal:realmsJournal
};
