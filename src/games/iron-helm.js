import {createSession,baseObject,captureSetup,shuffled,nextZ,assetFor} from '../model.js';
import {ironHelmAssets} from './iron-helm-assets.js';
import {ironHelmTableAssets,markerColors,matPoint,syncMarker,dropMarker,equipmentSlot,arrangeIronHelmTable,upgradeIronHelmTable} from './iron-helm-table.js';

export const HEROES=[
  {id:'1',name:'法蓬',health:14,energy:11,capacity:10,gold:3,rations:1,items:['8','12'],skill:'7',proficiency:'敏捷'},
  {id:'2',name:'索塔布',health:12,energy:12,capacity:9,gold:3,rations:1,items:['9','6'],skill:'2',proficiency:'心智'},
  {id:'3',name:'佐拉',health:14,energy:12,capacity:8,gold:2,rations:1,items:['10','4'],skill:'5',proficiency:'敏捷'},
  {id:'4',name:'莫利坎',health:16,energy:10,capacity:11,gold:3,rations:1,items:['1','3'],skill:'12',proficiency:'力量'}
];
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=(group,code)=>`ih-${group}-${code}`;
const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.ihRole===role);
const marker=(s,key)=>s.objects.find(o=>o.type==='token'&&o.kind===`ih-${key}`);
export const value=(s,key)=>marker(s,key)?.value??0;
const progress=s=>marker(s,'turn');
const currentHero=s=>HEROES.find(h=>s.objects.some(o=>o.ihRole==='hero'&&o.assetId===id('hero',h.id)))||HEROES[0];
const limits={health:18,energy:14,gold:999,rations:999,poison:999,morality:5,level:5,turn:8,eyes:30,foe:99};
export function changeValue(s,key,delta,o=marker(s,key)){
  if(!o)throw new Error('缺少状态标记，可撤销桌面修改或开始新一局');
  const h=currentHero(s),max=key==='health'?h.health:key==='energy'?h.energy:limits[key];
  o.value=Math.max(key==='morality'?-5:key==='level'?1:0,Math.min(max,o.value+delta));
  syncMarker(s,o);
}
const statNames={health:'生命',energy:'能量',gold:'金币',rations:'口粮',poison:'中毒',morality:'道德',level:'层数',turn:'回合',eyes:'眼睛',foe:'敌人生命'};
const glyphs={health:'♥',energy:'✦',gold:'●',rations:'▣',poison:'♦',morality:'⚖',level:'⌂',turn:'◷',eyes:'◉',foe:'☠'};
const costs=[2,1,1,3,2,1,3,2,3,3,4,2,3,4];
const weights=[2,0,1,2,1,1,1,1,1,1,3,1,2,2];
export function createIronHelmSession(random=Math.random,heroId='1'){
  const h=HEROES.find(h=>h.id===heroId)||HEROES[0],objects=[];
  const card=(assetId,x,y,role)=>objects.push({...baseObject('card',x,y,20),assetId,faceUp:true,ihRole:role});
  const deck=(group,x,y,role=group,cards=null,faceUp=false,width)=>objects.push({...baseObject('deck',x,y,2),cards:cards??shuffled(ironHelmAssets.filter(a=>a.group===group).map(a=>a.id),random),name:({enemy:'敌人',loot:'战利品',plot:'剧情',potion:'药剂',dungeon:'地城',skill:'技能',trapping:'初始装备',boss:'首领',hero:'备用角色',blessing:'祝福'})[group]||group,ihRole:role,faceUp,width:width||(group==='blessing'?58:160),height:width?width*1.4:group==='blessing'?58:224});
  for(const [i,group] of ['enemy','loot','plot','potion','dungeon'].entries()){
    deck(group,150+i*220,160);
    deck(group,150+i*220,350,group+'-discard',[],false,74);
    objects.at(-1).name=group==='enemy'?'墓地 · 未花费经验':group==='plot'?'已结算剧情':'弃牌';
  }
  deck('skill',1300,460,'skill',ironHelmAssets.filter(a=>a.group==='skill'&&a.code!==h.skill).map(a=>a.id),true);
  deck('trapping',1510,460,'trapping',ironHelmAssets.filter(a=>a.group==='trapping'&&!h.items.includes(a.code)).map(a=>a.id),true);
  deck('boss',1300,850);
  deck('hero',1510,850,'hero-reserve',HEROES.filter(a=>a.id!==h.id).map(a=>id('hero',a.id)));
  deck('blessing',1030,850);
  deck('enemy',1300,1040,'spent',[],false,74);objects.at(-1).name='墓地 · 已花费经验';
  card(id('hero',h.id),150,850,'hero');
  h.items.forEach((n,i)=>card(id('trapping',n),370+i*220,850,'inventory'));
  card(id('skill',h.skill),810,850,'learned');
  card('ih-track-level',1300,160,'level-track');card('ih-track-morality',1510,160,'morality-track');
  for(const [i,key] of Object.keys(statNames).entries()){
    objects.push({...baseObject('token',150+i*100,1040,30),kind:`ih-${key}`,name:statNames[key],color:({health:'#ab4d55',energy:'#855487',poison:'#719242',gold:'#b48d3e'})[key]||'#756b5b',value:({health:h.health,energy:h.energy,gold:h.gold,rations:h.rations,level:1})[key]||0,...(key==='turn'?{phase:'ready',potionChoices:h.id==='2'?2:0}:{})});
  }
  for(let i=0;i<3;i++)objects.push({...baseObject('die',1110+i*75,610,35),color:'ivory',name:`战斗骰 ${i+1}`,faces:[1,2,3,4,5,6],value:1});
  const s={...createSession('铁盔 · 基础版'),gameId:'iron-helm',ironHelmTableVersion:2,assets:structuredClone([...ironHelmAssets,...ironHelmTableAssets]),objects,mode:'play',meta:{description:'独自深入地下城，在每一扇门后做出取舍。仅包含基础版。',players:'1 人',duration:'30–60 分钟',rules:'冒险工具负责抽牌、计数与换层整理。战斗、装备槽位、负重、剧情选项和卡牌特殊效果请按牌面结算；资源可在规则手册中调整。'}};
  arrangeIronHelmTable(s);
  s.settings.theme='night';s.settings.snap=false;
  s.initialSetup={...captureSetup(s),name:`铁盔基础版 · ${h.name}`,shuffleDecks:true};
  return s;
}
function putCard(s,assetId,x,y,role,faceUp=true){
  const group=assetFor(s,assetId)?.group;
  const o={...baseObject('card',x,y,nextZ(s)),assetId,faceUp,ihRole:role,...(group==='blessing'?{}:group==='dungeon'?{width:150,height:210}:{width:140,height:196})};s.objects.push(o);return o;
}
function takeTop(s,role,x=735,y=530,faceUp=true){
  const d=pile(s,role);if(!d?.cards.length)throw new Error('这个牌堆已空');
  const p=matPoint(s,x,y);
  return putCard(s,d.cards.pop(),p.x,p.y,role==='blessing'?'blessing-owned':role==='plot'?'plot-active':'drawn',faceUp);
}
function discard(s,o,role,faceUp=false){
  const d=pile(s,role);if(!d)throw new Error('缺少弃牌区，请恢复初始设置');
  d.cards.push(o.assetId);d.faceUp=faceUp;s.objects=s.objects.filter(x=>x.id!==o.id);
}
export function explore(s){
  const p=progress(s);if(!p)throw new Error('缺少回合标记');
  if(p.phase!=='ready')throw new Error('先结算当前地城，再结束回合');
  if(p.potionChoices)throw new Error('先在牌库中选取炼金术的两瓶初始药剂');
  if(value(s,'health')<=0||value(s,'poison')>=value(s,'health'))throw new Error('冒险者已倒下，请开始新一局或撤销上一步');
  if(value(s,'turn')>=8)throw new Error('本层已完成，请进行换层结算');
  if((pile(s,'dungeon')?.cards.length||0)<2)throw new Error('地城牌不足两张，请归还误拿的牌或撤销');
  const a=takeTop(s,'dungeon',603,518,false),b=takeTop(s,'dungeon',738,518,false);
  a.ihRole='door-a';b.ihRole='door-b';p.phase='choose';
}
export function revealDoor(s,side){
  const p=progress(s);if(p?.phase!=='choose')throw new Error('请先抽取两张地城');
  const first=s.objects.find(o=>o.ihRole===`door-${side}`);if(!first)throw new Error('这张地城已移出桌面');
  first.faceUp=true;first.ihRole='door-first';p.phase='first';
}
export function switchDoor(s){
  const p=progress(s);if(p?.phase!=='first')throw new Error('仅在查看第一张门后可以换门');
  const first=s.objects.find(o=>o.ihRole==='door-first'),second=s.objects.find(o=>['door-a','door-b'].includes(o.ihRole));
  if(!first||!second)throw new Error('当前地城已被手动移走，请撤销后再试');
  discard(s,first,'dungeon-discard');second.faceUp=true;second.ihRole='door-second';p.phase='second';
}
export function finishTurn(s){
  const p=progress(s);if(!['first','second'].includes(p?.phase))throw new Error('请先查看地城并按牌面结算');
  const doors=s.objects.filter(o=>o.type==='card'&&/^door-/.test(o.ihRole||''));
  if(!doors.length)throw new Error('缺少当前地城，请撤销后再试');
  for(const o of doors)discard(s,o,'dungeon-discard');
  changeValue(s,'turn',1);p.phase='ready';
}
export function nextLevel(s,random=Math.random){
  if(value(s,'turn')!==8||progress(s)?.phase!=='ready')throw new Error('完成本层 8 回合后才能换层');
  if(value(s,'level')>=5)throw new Error('已到地图最深层，请按累计眼睛和首领规则完成冒险');
  const d=pile(s,'dungeon'),discarded=pile(s,'dungeon-discard');
  if(!d||!discarded||d.cards.length+discarded.cards.length!==16)throw new Error('地城牌应为 16 张；请先归还手动抽走的地城牌');
  if(!pile(s,'plot')?.cards.length)throw new Error('剧情牌堆已空，请按首领规则结算');
  d.cards=shuffled([...d.cards,...discarded.cards],random);discarded.cards=[];
  if(value(s,'rations'))changeValue(s,'rations',-1);else changeValue(s,'health',-3);
  changeValue(s,'poison',Math.floor(value(s,'poison')/2));
  progress(s).value=0;
  syncMarker(s,progress(s));
  if(value(s,'health')<=0||value(s,'poison')>=value(s,'health'))return '换层消耗后冒险者倒下，游戏结束。';
  changeValue(s,'level',1);takeTop(s,'plot');
  return '已消耗口粮、结算中毒并进入下一层；请结算新剧情。';
}
export function takeFromCatalog(s,assetId){
  const a=assetFor(s,assetId);if(!a)throw new Error('卡牌未找到');
  const d=pile(s,a.group);if(!d?.cards.includes(assetId))throw new Error('这张牌已经取走');
  const p=progress(s);
  if(a.group==='trapping'){
    if(value(s,'level')!==1||value(s,'turn')||p?.phase!=='ready')throw new Error('初始装备只在冒险开始前购买');
    const price=costs[Number(a.code)-1];if(value(s,'gold')<price)throw new Error('金币不足');
    changeValue(s,'gold',-price);
  }else if(a.group==='skill'){
    const proficiency=Number(a.code)<=4?'心智':Number(a.code)<=8?'敏捷':'力量';
    const price=proficiency===currentHero(s).proficiency?3:5,grave=pile(s,'enemy-discard'),spent=pile(s,'spent');
    if(!grave||!spent||grave.cards.length<price)throw new Error(`需要 ${price} 张未花费的敌人卡`);
    spent.cards.push(...grave.cards.splice(-price));
  }else if(a.group==='potion'){
    if(!p?.potionChoices)throw new Error('这里只用于炼金术的两瓶初始药剂；普通药剂请按牌面抽取');
    p.potionChoices--;
  }else throw new Error('只能在这里购买初始装备、学习技能或选择初始药剂');
  d.cards.splice(d.cards.indexOf(assetId),1);
  const position=matPoint(s,...(a.group==='skill'?[1450,150]:equipmentSlot(a.code)));
  putCard(s,assetId,position.x,position.y,a.group==='skill'?'learned':'inventory');
}
export function act(s,action,arg,selected=[],random=Math.random){
  if(action==='explore')explore(s);
  else if(action==='reveal')revealDoor(s,arg);
  else if(action==='switch')switchDoor(s);
  else if(action==='finish')finishTurn(s);
  else if(action==='next-level')return nextLevel(s,random);
  else if(action==='adjust'){const [key,amount]=arg.split(':');if(!Object.hasOwn(statNames,key)||![1,-1].includes(Number(amount)))throw new Error('无效的状态调整');changeValue(s,key,Number(amount));}
  else if(action==='take')takeFromCatalog(s,arg);
  else if(action==='draw'){
    if(!['enemy','loot','plot','potion','blessing'].includes(arg))throw new Error('无效牌堆');
    takeTop(s,arg,arg==='enemy'?600:735,arg==='blessing'?705:530,arg!=='blessing');
  }else if(action==='discard'){
    const cards=s.objects.filter(o=>selected.includes(o.id)&&o.type==='card'&&!o.locked);
    if(!cards.length)throw new Error('先选中要归入弃牌区的卡牌');
    const valid=cards.filter(o=>['enemy','loot','potion','plot'].includes(assetFor(s,o.assetId)?.group));
    if(!valid.length)throw new Error('此操作用于敌人、战利品、药剂和剧情牌');
    for(const o of valid){const a=assetFor(s,o.assetId);discard(s,o,a.group+'-discard',a.group==='enemy');if(a.group==='plot')changeValue(s,'eyes',a.eyes);}
  }else if(action==='choose-hero'){
    if(!HEROES.some(h=>h.id===arg))throw new Error('未知角色');
    const fresh=createIronHelmSession(random,arg);s.objects=fresh.objects;s.initialSetup=fresh.initialSetup;delete s.setup;delete s.setupDraft;
    return '已按所选角色重置开局，可撤销。';
  }else throw new Error('未知的冒险操作');
  return '';
}
const button=(action,text,arg='',disabled=false)=>`<button data-game-action="${action}" data-game-value="${e(arg)}" ${action==='adjust'?`aria-label="${Number(arg.split(':')[1])>0?'增加':'减少'}${statNames[arg.split(':')[0]]}"`:''} ${disabled?'disabled':''}>${text}</button>`;
export function toolbar(){
  return `<div class="ih-toolbar"><span class="ih-title"><span aria-hidden="true">⚔</span> 铁盔</span>${button('journal','规则手册')}</div>`;
}
function turnActions(s){
  const phase=progress(s)?.phase||'ready',turn=value(s,'turn');
  return `<div class="ih-buttons">${phase==='ready'?(turn===8?button('next-level','换层结算'):button('explore','抽两张门')):phase==='choose'?button('reveal','先看左门','a')+button('reveal','先看右门','b'):(phase==='first'?button('switch','放弃，换门'):'')+button('finish','结算完毕')}</div>`;
}
export function journal(s){
  const h=currentHero(s),p=progress(s),blessings=s.objects.filter(o=>o.ihRole==='blessing-owned').length;
  return `<span class="section-eyebrow">IRON HELM · BASE GAME</span><h2>铁盔 · 规则手册</h2><p class="modal-lead">${h.name} · ${h.proficiency}专精 · 负重上限 ${h.capacity} · 祝福 ${blessings} 枚。方形标记可拖到轨道刻度，或在标记上滚轮调整；也可使用下方按钮记录。</p>${value(s,'health')<=0||value(s,'poison')>=value(s,'health')?'<p class="ih-alert">冒险者已倒下。可撤销上一步或开始新一局。</p>':value(s,'eyes')>=10?'<p class="ih-alert">已达到 10 只眼睛。结算当前剧情后，揭晓首领、神圣干预，再进行最终战斗。</p>':''}<div class="ih-section"><h3>第 ${value(s,'level')} 层 · ${value(s,'turn')}/8 回合</h3>${turnActions(s)}</div><div class="ih-stats">${Object.keys(statNames).map(key=>`<div><span>${glyphs[key]} ${statNames[key]}</span><div>${button('adjust','−',key+':-1')}<strong>${value(s,key)}</strong>${button('adjust','＋',key+':1')}</div></div>`).join('')}</div><div class="ih-section"><h3>牌库与归档</h3><div class="ih-buttons">${['enemy','loot','plot','potion','blessing'].map(group=>button('draw',`抽${({enemy:'敌人',loot:'战利品',plot:'剧情',potion:'药剂',blessing:'祝福'})[group]} · ${pile(s,group)?.cards.length||0}`,group)).join('')}${button('discard','归档选中的卡牌')}${button('catalog','装备 / 技能牌库')}${button('heroes','选角色并重新开局')}</div><p class="subtle-note">选中桌面卡牌后归档：敌人放入墓地供学习技能；剧情归档时累计眼睛。战利品和药剂归入各自弃牌区。祝福抽出后保持背面朝上。</p>${p?.potionChoices?`<p class="ih-alert">炼金术：还需在牌库选择 ${p.potionChoices} 瓶初始药剂。</p>`:''}</div><div class="ih-section"><h3>当前地城 · ${p?.phase==='second'?'执行牌面第 2 段':p?.phase==='first'?'执行牌面第 1 段':p?.phase==='choose'?'选择先看哪一扇门':'准备探索'}</h3><p>抽两张背面朝上的门，翻开一张。可保留并结算第 1 段，或放弃并翻开另一张、结算第 2 段。完成效果后再点击「结算完毕」。每层 8 回合。</p><p>敌人攻击：2d6 的差值加基础伤害；双骰相同则未命中。你的攻击：花费 1–3 能量掷等量骰子，合计后加牌面加成；徒手为 1 点伤害且不耗能。装备、药剂和技能效果由玩家执行。</p><div class="ih-buttons"><button data-action="rules">完整玩法速查</button><button data-action="help">桌面操作</button><button data-action="undo">撤销上一步</button></div></div>`;
}
export function catalog(s){
  const choices=s.assets.filter(a=>['trapping','skill',...(progress(s)?.potionChoices?['potion']:[])].includes(a.group)&&pile(s,a.group)?.cards.includes(a.id));
  return `<span class="section-eyebrow">THE SUPPLY</span><h2>装备与技能</h2><p class="modal-lead">初始装备按金币购买；技能使用 3 张同专精或 5 张其他专精的墓地敌人卡。负重、槽位和卡牌效果请自行检查。</p><div class="ih-catalog">${choices.map(a=>`<div><img src="${e(a.front)}" alt="${e(a.name)}"><strong>${e(a.name)}</strong><small>${a.group==='trapping'?`${costs[Number(a.code)-1]} 金币 · 负重 ${weights[Number(a.code)-1]}`:a.group==='skill'?`技能 · ${Number(a.code)<=4?'心智':Number(a.code)<=8?'敏捷':'力量'}`:'炼金术初始药剂'}</small>${button('take',a.group==='skill'?'学习':a.group==='trapping'?'购买':'选取',a.id)}</div>`).join('')}</div><button class="full-width quiet" data-game-action="journal">返回规则手册</button>`;
}
export function heroes(){return `<span class="section-eyebrow">CHOOSE YOUR HERO</span><h2>谁将踏入地下城？</h2><p class="modal-lead">选择角色将重新布置牌局、初始装备与技能。当前进度可通过撤销恢复。</p><div class="ih-heroes">${HEROES.map(h=>`<div><img src="/assets/iron-helm/hero-${h.id}.webp" alt="${h.name}"><strong>${h.name}</strong><small>♥ ${h.health} · ✦ ${h.energy} · 负重 ${h.capacity}</small>${button('choose-hero','以此角色开局',h.id)}</div>`).join('')}</div>`;}

export const ironHelm={
  openingProfiles:()=>HEROES.map(h=>({id:`ih-hero-${h.id}`,name:h.name,setup:createIronHelmSession(()=>.5,h.id).initialSetup})),
  openingProfileId:s=>`ih-hero-${currentHero(s).id}`,
  id:'iron-helm',title:'铁盔 · 基础版',subtitle:'IRON HELM',tagline:'再探一扇门，再赌一次命运。',players:'1 人',duration:'30–60 分钟',create:createIronHelmSession,
  toolbar,journal,catalog,heroes,act,prepareSession:upgradeIronHelmTable,onTokenDrop(s,o){dropMarker(s,o,(s,o,delta)=>changeValue(s,o.kind.slice(3),delta,o));},startView:'heroes',
  adjustToken(s,o,delta){
    const key=o.kind?.slice(3);
    if(o.kind?.startsWith('ih-')&&Object.hasOwn(statNames,key))changeValue(s,key,delta,o);
    else o.value=Math.max(-999,Math.min(999,o.value+delta));
  },
  tokenIcon(kind,o){const key=kind.slice(3);return `<span class="ih-token ${['turn','eyes'].includes(key)?'ih-token-counter':''}" title="${statNames[key]||''}"><img src="/assets/iron-helm/marker-${e(key)}.webp" alt="" draggable="false"><small>${glyphs[key]||'✦'} ${statNames[key]||''}</small><b>${Number.isFinite(o?.value)?o.value:0}</b></span>`;},
  tokens:Object.entries(statNames).map(([key,name])=>({kind:`ih-${key}`,name,color:markerColors[key],value:key==='level'?1:0,width:['turn','eyes'].includes(key)?48:28,height:['turn','eyes'].includes(key)?48:28,assetId:`ih-marker-${key}`,description:'方形标记 · 拖至轨道刻度或滚轮调整，随桌面保存。'})),
  zones:[],
  rules:{title:'一人，一盔，一座地下城。',credit:'Jason Glover / Grey Gnome Games · 中文素材：假装不在意汉化、老方分享 · 仅基础版',pdf:'/assets/iron-helm/rules-en.pdf',links:[['官方规则附录','/assets/iron-helm/appendix-en.pdf']],steps:[
    ['选择角色','按角色卡取得初始生命、能量、口粮、金币、装备及技能。初始金币可购买初始装备。索塔布的炼金术允许自选两瓶药剂。始于地下城第 1 层、道德 0。'],
    ['探索地城','每回合抽两张门并保持背面，任意翻一张。保留它则结算第 1 段；或弃掉它并翻另一张，必须结算第 2 段。营地、商人、祭坛和空地按整张卡处理。未看的门不展示。'],
    ['战斗','根据地城牌增加敌人生命。敌人初始攻击与反击掷 2d6，差值加基础伤害；双骰相同则失手。玩家可花费最多 3 能量，每点掷 1d6，再加装备与技能。也可徒手造成 1 伤害，不耗能。双方交替攻击。'],
    ['战利品与技能','宝物等级 1 可抽战利品或拿 1 金币；等级 2 抽战利品和药剂。击败的敌人保留在墓地；花费 3 张同专精或 5 张其他专精敌人学习技能，已花费的卡仍用于最终首领判定。装备不得超过负重与槽位限制。'],
    ['完成一层','结算第 8 回合后重洗全部 16 张地城，消耗 1 口粮（没有则失去 3 生命），每 2 点中毒额外增加 1 点中毒，进入下一层并抽取剧情。生命为 0 或中毒不小于生命时立即失败。'],
    ['剧情与祝福','剧情在空地与换层时抽取，只选一个选项。累计眼睛达到 10 时，先结算该剧情，再开始终局。祝福保持背面，可消耗一枚重掷整次攻击骰；终局神圣干预时揭示并获得对应奖励，恢复不得超过角色初始上限。'],
    ['最终首领','统计墓地全部敌人的弱点，最多的弱点决定首领。两种并列：火胜亡灵、亡灵胜冰、冰胜火；三种并列随机。首领使用印刷生命，不叠加地城层数。揭晓首领、神圣干预、战斗；击败首领获胜。'],
    ['胜利计分','剩余生命与能量各 1 分，金币各 3 分，每名击败的敌人 2 分，所有持有物品的标价分数，当前层数 ×2，再加道德值（负值扣分）。牌面特殊规则优先。']
  ]}
};
