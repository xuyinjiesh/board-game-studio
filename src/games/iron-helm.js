import {deckEntries,replaceDeckEntries,appendDeckEntries,takeDeckCard,setDeckFace,createSession,baseObject,captureSetup,shuffled,nextZ,assetFor,canReceiveCards,mergeCards} from '../model.js';
import {ironHelmAssets} from './iron-helm-assets.js';
import {EXPANSIONS,expansionOptions,selectedAssets,activePool,expansionSummary} from './iron-helm-expansions.js';
import {ironHelmDlcAssets as allDlcAssets} from './iron-helm-dlc-assets.js';
import {DLC_CARD_INFO} from './iron-helm-dlc-info.js';
import {DLC_HEROES} from './iron-helm-dlc-heroes.js';
import {ironHelmTableAssets,markerColors,matPoint,syncMarker,dropMarker,equipmentSlot,equipmentSlotKey,arrangeIronHelmTable,compactIronHelmTable,configureIronHelmComponents,placeIronHelmDivineDie,upgradeIronHelmTable} from './iron-helm-table.js';

export const HEROES=[
  {id:'1',name:'法蓬',health:14,energy:11,capacity:10,gold:3,rations:1,items:['8','12'],skill:'7',proficiency:'敏捷'},
  {id:'2',name:'索塔布',health:12,energy:12,capacity:9,gold:3,rations:1,items:['9','6'],skill:'2',proficiency:'心智'},
  {id:'3',name:'佐拉',health:14,energy:12,capacity:8,gold:2,rations:1,items:['10','4'],skill:'5',proficiency:'敏捷'},
  {id:'4',name:'莫利坎',health:16,energy:10,capacity:11,gold:3,rations:1,items:['1','3'],skill:'12',proficiency:'力量'}
];
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=(group,code)=>`ih-${group}-${code}`;
const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.ihRole===role);
const marker=(s,key)=>s.objects.find(o=>o.type==='token'&&o.kind===`ih-${key}`)||s.objects.find(o=>o.kind==='ih-level')?.ihProgress?.[key];
export const value=(s,key)=>marker(s,key)?.value??0;
const progress=s=>marker(s,'turn');
const isActiveDoor=o=>/^door-(a|b|first|second)$/.test(o.ihRole||'')&&(o.type==='card'||o.type==='deck'&&o.cards.length>0);
const heroAsset=h=>h.assetId||id('hero',h.id);
export const availableHeroes=options=>[...HEROES,...DLC_HEROES.filter(h=>expansionOptions(options).packs.includes(h.expansion))];
const currentHero=s=>[...HEROES,...DLC_HEROES].find(h=>s.objects.some(o=>o.ihRole==='hero'&&(o.assetId||o.cards?.at(-1))===heroAsset(h)))||HEROES[0];
const limits={health:18,energy:14,blessing:12,weight:999,gold:999,rations:999,poison:999,morality:5,level:5,turn:9,eyes:99,foe:99};
export function changeValue(s,key,delta,o=marker(s,key)){
  if(!o)throw new Error('缺少状态标记，可撤销桌面修改或开始新一局');
  const h=currentHero(s),max=key==='health'?h.health:key==='energy'?h.energy:limits[key];
  o.value=Math.max(key==='morality'?-5:key==='level'?1:0,Math.min(max,o.value+delta));
  syncMarker(s,o);
}
const statNames={health:'生命',energy:'能量',blessing:'祝福',weight:'当前负重',gold:'金币',rations:'口粮',poison:'中毒',morality:'道德',level:'层数',foe:'敌人生命'};
const glyphs={health:'♥',energy:'✦',blessing:'✧',weight:'▱',gold:'●',rations:'▣',poison:'♦',morality:'⚖',level:'⌂',foe:'☠'};
const costs=[2,1,1,3,2,1,3,2,3,3,4,2,3,4];
const weights=[2,0,1,2,1,1,1,1,1,1,3,1,2,2];
function carriedEquipmentWeight(s){
  return s.objects.filter(o=>o.ihRole!=='trapping').flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[])
    .reduce((total,assetId)=>total+(assetId?.startsWith('ih-trapping-')?weights[Number(assetId.split('-').at(-1))-1]||0:0),0);
}
export function createIronHelmSession(random=Math.random,heroId='1',rawOptions={}){
  const options=expansionOptions(rawOptions);
  const assets=structuredClone([...ironHelmAssets,...selectedAssets(options)]);
  const available=availableHeroes(options),h=available.find(h=>h.id===heroId||heroAsset(h)===heroId)||HEROES[0],objects=[];
  const startingItems=h.items.map(n=>n.startsWith('ih-')?n:id('trapping',n)),startingSkill=h.skill?(h.skill.startsWith('ih-')?h.skill:id('skill',h.skill)):null;
  const startingSkills=[startingSkill,...(h.extraSkills||[])].filter(Boolean);
  const required=new Set(available.flatMap(hero=>[...hero.items,...(hero.skill?[hero.skill]:[]),...(hero.extraSkills||[])]));
  assets.push(...structuredClone(allDlcAssets.filter(a=>required.has(a.id)&&!assets.some(b=>b.id===a.id))));
  for(const a of assets){const hero=DLC_HEROES.find(h=>h.assetId===a.id);Object.assign(a,DLC_CARD_INFO[a.id]||{},hero?{name:hero.name}:{});}
  const initialWeight=h.startWeight??h.items.reduce((total,code)=>total+(weights[Number(code)-1]||0),0);
  const card=(assetId,x,y,role)=>objects.push({...baseObject('card',x,y,20),assetId,faceUp:true,ihRole:role});
  const deck=(group,x,y,role=group,cards=null,faceUp=false,width)=>objects.push({...baseObject('deck',x,y,2),cards:cards??shuffled(activePool(assets,group,options),random),name:({enemy:'敌人',loot:'战利品',plot:'剧情',potion:'药剂',dungeon:'地城',skill:'技能',trapping:'初始装备',boss:'首领',hero:'备用角色',blessing:'祝福'})[group]||group,ihRole:role,faceUp,width:width||(group==='blessing'?58:160),height:width?width*1.4:group==='blessing'?58:224});
  for(const [i,group] of ['enemy','loot','plot','potion','dungeon'].entries()){
    deck(group,150+i*220,160);
    deck(group,150+i*220,350,group+'-discard',[],group==='enemy',74);
    objects.at(-1).name=group==='enemy'?'墓地':group==='plot'?'已结算剧情':'弃牌';
  }
  deck('skill',1300,460,'skill',assets.filter(a=>a.group==='skill'&&!startingSkills.includes(a.id)).map(a=>a.id),false);
  deck('trapping',1510,460,'trapping',assets.filter(a=>a.group==='trapping'&&!startingItems.includes(a.id)).map(a=>a.id),false);
  deck('boss',1300,850);
  deck('hero',1510,850,'hero-reserve',available.filter(a=>a.id!==h.id).map(heroAsset));
  deck('blessing',1030,850);
  card(heroAsset(h),150,850,'hero');
  startingItems.forEach((assetId,i)=>card(assetId,370+i*220,850,'inventory'));
  startingSkills.forEach(assetId=>card(assetId,810,850,'learned'));
  for(const [i,key] of Object.keys(statNames).entries()){
    objects.push({...baseObject('token',150+i*100,1040,30),kind:`ih-${key}`,name:statNames[key],color:({health:'#ab4d55',energy:'#855487',poison:'#719242',gold:'#b48d3e'})[key]||'#756b5b',value:({health:h.health,energy:h.energy,weight:initialWeight,gold:h.gold,rations:h.rations,level:1})[key]||0,...(key==='level'?{ihProgress:{turn:{value:0,phase:'ready',potionChoices:startingSkills.includes('ih-skill-2')?2:0},eyes:{value:0}}}:{})});
  }
  for(let i=0;i<3;i++)objects.push({...baseObject('die',1110+i*75,610,35),color:'ivory',name:`战斗骰 ${i+1}`,faces:[1,2,3,4,5,6],value:1});
  const s={...createSession('铁盔 · 基础版'),gameId:'iron-helm',ironHelmTableVersion:12,ironHelmOptions:options,assets:structuredClone([...assets,...ironHelmTableAssets]),objects,mode:'play',meta:{description:'独自深入地下城，在每一扇门后做出取舍。可自由选择冒险包与扩展模块。',players:'1 人',duration:'30–60 分钟',rules:'按规则书与牌面自行结算探索、战斗、装备、负重和剧情效果；数值标记可拖动或滚轮调整。'}};
  arrangeIronHelmTable(s);
  const learned=s.objects.find(o=>o.ihSlot==='learned');
  for(const o of s.objects.filter(o=>o.type==='card'&&o.ihRole==='learned')){appendDeckEntries(learned,[{assetId:o.assetId,faceUp:true}]);s.objects.splice(s.objects.indexOf(o),1);}
  compactIronHelmTable(s);configureIronHelmComponents(s);placeIronHelmDivineDie(s);
  if(options.packs.length){
    const used=new Set(s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:o.ihBlessingSupply||[]));
    const unused=assets.filter(a=>a.group!=='track'&&!used.has(a.id));
    const groups=[...new Set(unused.map(a=>a.group))];
    groups.forEach((group,i)=>{const a=unused.find(a=>a.group===group),position=matPoint(s,i<6?420+i*185:70+((i-6)%8)*185,i<6?765:1015+Math.floor((i-6)/8)*250);
      const o={...baseObject('deck',position.x,position.y,3),cards:unused.filter(a=>a.group===group).map(a=>a.id),name:`${['enemy','plot','boss','dungeon'].includes(group)?'备用 · ':''}${a.groupLabel}${group==='artifact'&&!options.packs.includes('realms')?' · 需领域与遗迹':''}`,ihRole:`dlc-${group}`,fixedPosition:true,width:140,height:196,faceUp:false};s.objects.push(o);
    });
    s.objects.filter(o=>o.type==='die'&&o.ihRole!=='divine-die').forEach((o,i)=>Object.assign(o,matPoint(s,1055+i*60,900)));
    s.meta.description=`独自深入地下城 · 已加入 ${options.packs.length} 个扩展`;
  }
  s.settings.theme='night';s.settings.snap=false;
  s.initialSetup={...captureSetup(s),name:`铁盔 · ${h.name}${options.packs.length?' · 扩展开局':''}`,shuffleDecks:true};
  return s;
}
function putCard(s,assetId,x,y,role,faceUp=true){
  const group=assetFor(s,assetId)?.group;
  const o={...baseObject('card',x,y,nextZ(s)),assetId,faceUp,ihRole:role,...(group==='blessing'?{}:group==='dungeon'?{width:150,height:210}:{width:140,height:196})};s.objects.push(o);return o;
}
function takeTop(s,role,x=735,y=530,faceUp=true){
  if(role==='blessing'){
    const token=marker(s,'blessing');
    if(!token?.ihBlessingSupply?.length)throw new Error('祝福储备已空');
    const assetId=token.ihBlessingSupply.pop(),p=matPoint(s,x,y);
    changeValue(s,'blessing',1);
    return putCard(s,assetId,p.x,p.y,'blessing-owned',false);
  }
  const d=pile(s,role);if(!d?.cards.length)throw new Error('这个牌堆已空');
  const p=matPoint(s,x,y);
  return putCard(s,takeDeckCard(d).assetId,p.x,p.y,role==='blessing'?'blessing-owned':role==='plot'?'plot-active':'drawn',faceUp);
}
function discard(s,o,role,faceUp=false){
  const d=pile(s,role);if(!d)throw new Error('缺少弃牌区，请恢复初始设置');
  const entries=o.type==='deck'?deckEntries(o):[{assetId:o.assetId}];appendDeckEntries(d,entries.map(card=>({...card,faceUp})));
  if(o.type==='deck'&&o.ihSlot?.startsWith('door-')){replaceDeckEntries(o,[]);setDeckFace(o,false);o.ihRole='door-slot';}
  else s.objects=s.objects.filter(x=>x.id!==o.id);
}
export function explore(s){
  const p=progress(s);if(!p)throw new Error('缺少回合标记');
  if(p.phase!=='ready')throw new Error('先结算当前地城，再结束回合');
  if(p.potionChoices)throw new Error('先在牌库中选取炼金术的两瓶初始药剂');
  if(value(s,'health')<=0||value(s,'poison')>=value(s,'health'))throw new Error('冒险者已倒下，请开始新一局或撤销上一步');
  if(value(s,'turn')>=(expansionOptions(s.ironHelmOptions).dungeon==='dungeon2'?9:8))throw new Error('本层已完成，请进行换层结算');
  if((pile(s,'dungeon')?.cards.length||0)<2)throw new Error('地城牌不足两张，请归还误拿的牌或撤销');
  const doors=['a','b'].map(side=>s.objects.find(o=>o.type==='deck'&&o.ihSlot===`door-${side}`));
  if(doors.some(o=>!o||!canReceiveCards(o,1)||o.cards.length))throw new Error('请先清空并解锁左右门牌位，缺失的牌位可撤销恢复');
  if(s.objects.some(isActiveDoor))throw new Error('请先归还手动移出的地城牌');
  for(const [i,o] of doors.entries()){appendDeckEntries(o,[{...takeDeckCard(pile(s,'dungeon')),faceUp:false}]);o.ihRole=`door-${i?'b':'a'}`;}
  p.phase='choose';
}
export function revealDoor(s,side){
  const p=progress(s);if(p?.phase!=='choose')throw new Error('请先抽取两张地城');
  const first=s.objects.find(o=>o.ihRole===`door-${side}`&&isActiveDoor(o));if(!first)throw new Error('这张地城已移出桌面');
  if(first.type==='deck')setDeckFace(first,true);else first.faceUp=true;first.ihRole='door-first';p.phase='first';
}
export function switchDoor(s){
  const p=progress(s);if(p?.phase!=='first')throw new Error('仅在查看第一张门后可以换门');
  const first=s.objects.find(o=>o.ihRole==='door-first'&&isActiveDoor(o)),second=s.objects.find(o=>['door-a','door-b'].includes(o.ihRole)&&isActiveDoor(o));
  if(!first||!second)throw new Error('当前地城已被手动移走，请撤销后再试');
  discard(s,first,'dungeon-discard');if(second.type==='deck')setDeckFace(second,true);else second.faceUp=true;second.ihRole='door-second';p.phase='second';
}
export function finishTurn(s){
  const p=progress(s);if(!['first','second'].includes(p?.phase))throw new Error('请先查看地城并按牌面结算');
  const doors=s.objects.filter(isActiveDoor);
  if(!doors.length)throw new Error('缺少当前地城，请撤销后再试');
  for(const o of doors)discard(s,o,'dungeon-discard');
  changeValue(s,'turn',1);p.phase='ready';
}
export function nextLevel(s,random=Math.random){
  if(value(s,'turn')!==(expansionOptions(s.ironHelmOptions).dungeon==='dungeon2'?9:8)||progress(s)?.phase!=='ready')throw new Error('完成本层 8 回合后才能换层');
  if(value(s,'level')>=5)throw new Error('已到地图最深层，请按累计眼睛和首领规则完成冒险');
  const d=pile(s,'dungeon'),discarded=pile(s,'dungeon-discard');
  const count=expansionOptions(s.ironHelmOptions).dungeon==='dungeon2'?18:16;
  if(!d||!discarded||d.cards.length+discarded.cards.length!==count)throw new Error(`地城牌应为 ${count} 张；请先归还手动抽走的地城牌`);
  if(!pile(s,'plot')?.cards.length)throw new Error('剧情牌堆已空，请按首领规则结算');
  replaceDeckEntries(d,shuffled([...deckEntries(d),...deckEntries(discarded)],random).map(card=>({...card,faceUp:false})));replaceDeckEntries(discarded,[]);
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
    const price=a.cost??costs[Number(a.code)-1];if(!Number.isFinite(price))throw new Error('请按牌面价格从桌面取用这件扩展装备');if(value(s,'gold')<price)throw new Error('金币不足');
    changeValue(s,'gold',-price);
  }else if(a.group==='skill'){
    const proficiency=Number(a.code)<=4?'心智':Number(a.code)<=8?'敏捷':'力量';
    const price=proficiency===currentHero(s).proficiency?3:5,grave=pile(s,'enemy-discard');
    if(!grave)throw new Error('缺少墓地区域');
    const entries=deckEntries(grave);
    if(entries.filter(card=>card.faceUp).length<price)throw new Error(`需要 ${price} 张未花费的敌人卡`);
    let remaining=price;for(let i=entries.length-1;i>=0&&remaining;i--)if(entries[i].faceUp){entries[i].faceUp=false;remaining--;}
    replaceDeckEntries(grave,entries);
  }else if(a.group==='potion'){
    if(!p?.potionChoices)throw new Error('这里只用于炼金术的两瓶初始药剂；普通药剂请按牌面抽取');
    p.potionChoices--;
  }else throw new Error('只能在这里购买初始装备、学习技能或选择初始药剂');
  takeDeckCard(d,d.cards.indexOf(assetId));
  const slot=s.objects.find(o=>o.type==='deck'&&o.ihSlot===(a.group==='skill'?'learned':(a.slot||equipmentSlotKey(a.code))));
  const position=slot||matPoint(s,...(a.group==='skill'?[1470,150]:equipmentSlot(a.code)));
  const card=putCard(s,assetId,position.x,position.y,a.group==='skill'?'learned':'inventory');
  if(a.group==='trapping')changeValue(s,'weight',a.weight??weights[Number(a.code)-1]??0);
  if(slot){card.rotation=slot.rotation;if(canReceiveCards(slot,1))mergeCards(s,[slot.id,card.id]);else card.x+=slot.width+20;}
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
    if(!availableHeroes(s.ironHelmOptions).some(h=>h.id===arg))throw new Error('未知角色');
    const fresh=createIronHelmSession(random,arg,s.ironHelmOptions);s.objects=fresh.objects;s.initialSetup=fresh.initialSetup;delete s.setup;delete s.setupDraft;
    return '已按所选角色重置开局，可撤销。';
  }else throw new Error('未知的冒险操作');
  return '';
}
const button=(action,text,arg='',disabled=false)=>`<button data-game-action="${action}" data-game-value="${e(arg)}" ${action==='adjust'?`aria-label="${Number(arg.split(':')[1])>0?'增加':'减少'}${statNames[arg.split(':')[0]]}"`:''} ${disabled?'disabled':''}>${text}</button>`;
export function toolbar(){
  return `<div class="ih-toolbar"><button data-game-action="journal" data-game-value="" title="规则手册" aria-label="规则手册"><svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v14c-4-1-6 0-9 2-3-2-5-3-9-2Z"/></svg></button></div>`;
}
const ruleSummary=[
  ['准备','选择角色，按角色卡领取初始资源、装备与技能，从第 1 层开始。'],
  ['探索','每回合抽两张地城牌，查看一张后决定保留或换门，按牌面结算战斗、事件与奖励；每层进行 8 回合。'],
  ['终局','管理生命、能量、口粮与负重，推进剧情并迎战最终首领。击败首领获胜；详细结算与特殊效果见规则书。']
];
const ruleBooks=[
  {language:'zh-CN',label:'中文规则书资源',url:'https://www.ttclub.cc/pnpsc/460.html',note:'中文 PNP 与规则资源页；下载需站内积分。'},
  {language:'en',label:'English · 官方规则书',url:'/assets/iron-helm/rules-en.pdf',note:'基础版完整规则 · PDF'},
  {language:'en',label:'English · 官方附录',url:'/assets/iron-helm/appendix-en.pdf',note:'卡牌说明与规则补充 · PDF'}
];
export function journal(s){
  return `<span class="section-eyebrow">IRON HELM · BASE GAME</span><h2>铁盔 · 规则手册</h2><p class="modal-lead">本局内容：${e(expansionSummary(s?.ironHelmOptions))}。扩展的说明、地图与特殊牌均在牌垫下方的扩展区，可取出并翻面阅读；铁窖种族 / 职业自由组合，按双面牌叠加数值。</p><ol class="rule-steps">${ruleSummary.map(([title,text])=>`<li><strong>${e(title)}</strong><p>${e(text)}</p></li>`).join('')}</ol><div class="ih-section"><h3>规则书索引</h3><ul class="ih-rulebooks">${ruleBooks.map(({language,label,url,note})=>`<li><a href="${e(url)}" hreflang="${language}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a><small>${e(note)}</small></li>`).join('')}</ul></div>`;
}
export function catalog(s){
  const choices=s.assets.filter(a=>['trapping','skill',...(progress(s)?.potionChoices?['potion']:[])].includes(a.group)&&pile(s,a.group)?.cards.includes(a.id));
  return `<span class="section-eyebrow">THE SUPPLY</span><h2>装备与技能</h2><p class="modal-lead">初始装备按金币购买；技能使用 3 张同专精或 5 张其他专精的墓地敌人卡。负重、槽位和卡牌效果请自行检查。</p><div class="ih-catalog">${choices.map(a=>`<div><img src="${e(a.front)}" alt="${e(a.name)}"><strong>${e(a.name)}</strong><small>${a.group==='trapping'?`${costs[Number(a.code)-1]} 金币 · 负重 ${weights[Number(a.code)-1]}`:a.group==='skill'?`技能 · ${Number(a.code)<=4?'心智':Number(a.code)<=8?'敏捷':'力量'}`:'炼金术初始药剂'}</small>${button('take',a.group==='skill'?'学习':a.group==='trapping'?'购买':'选取',a.id)}</div>`).join('')}</div>`;
}
export function heroes(){return `<span class="section-eyebrow">CHOOSE YOUR HERO</span><h2>谁将踏入地下城？</h2><p class="modal-lead">选择角色将重新布置牌局、初始装备与技能。当前进度可通过撤销恢复。</p><div class="ih-heroes">${HEROES.map(h=>`<div><img src="/assets/iron-helm/hero-${h.id}.webp" alt="${h.name}"><strong>${h.name}</strong><small>♥ ${h.health} · ✦ ${h.energy} · 负重上限 ${h.capacity}</small>${button('choose-hero','以此角色开局',h.id)}</div>`).join('')}</div>`;}

export function expansionChoiceHTML(s){
  const options=expansionOptions(s.ironHelmOptions);
  return `<span class="section-eyebrow">IRON HELM · EXPANSIONS</span><h2>这次加入哪些扩展？</h2><p class="modal-lead">可以多选，也可以不加。选择完成后再选角色，新开一局才会应用。</p><div class="ih-expansion-tools"><button data-action="ih-clear-expansions">仅基础版</button><button data-action="ih-all-expansions">全部加入</button><button data-action="ih-choose-roles">下一步：选角色 →</button></div><div class="ih-expansion-list">${EXPANSIONS.map(p=>`<label><input type="checkbox" data-ih-expansion="${p.id}" ${options.packs.includes(p.id)?'checked':''}><img src="${e(p.cover)}" alt="" loading="lazy"><span><strong>${e(p.name)}</strong><small>${e(p.note)}</small></span></label>`).join('')}</div><div class="ih-expansion-selects"><label>本局冒险<select id="ih-adventure"><option value="base">基础冒险</option>${EXPANSIONS.filter(p=>p.kind==='adventure').map(p=>`<option value="${p.id}" ${options.adventure===p.id?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><label>本局地城牌组<select id="ih-dungeon"><option value="base">基础地城 · 16 张</option><option value="dungeon2" ${options.dungeon==='dungeon2'?'selected':''}>哀嚎深渊 · 18 张</option></select></label></div><p class="subtle-note">勾选冒险包后可在「本局冒险」中选用：替换敌人、剧情与首领，其余冒险牌保留在备用区。铁窖的种族 / 职业、星宿、环境、灾厄、随从及随机事件按附带说明手动使用。更换扩展会重建内置角色的默认开局，自建角色方案保留；本次更改在点击角色开始前不会改变当前牌局。</p><button class="primary-button" data-action="ih-choose-roles">选择角色 →</button>`;
}

export function configureOpening(s,rawOptions){
  const options=expansionOptions(rawOptions);
  if(JSON.stringify(expansionOptions(s.ironHelmOptions))===JSON.stringify(options))return structuredClone(s);
  const stockIds=new Set([...HEROES,...DLC_HEROES].map(heroAsset));
  const custom=(s.setupProfiles||[]).filter(p=>!stockIds.has(p.id));
  const fresh=createIronHelmSession(()=>.5,'1',options);
  const profiles=availableHeroes(options).map(h=>({id:heroAsset(h),name:h.name,description:h.note||`${h.proficiency}专精 · ${h.expansion?EXPANSIONS.find(p=>p.id===h.expansion).name:'基础版'}`,setup:createIronHelmSession(()=>.5,h.id,options).initialSetup}));
  // Keep assets used by authored profiles, while generated profiles only use enabled packs.
  const refs=new Set(custom.flatMap(p=>[p.coverAssetId,...p.setup.objects.flatMap(o=>o.type==='deck'?o.cards:o.assetId?[o.assetId]:[])]));
  fresh.assets.push(...structuredClone(s.assets.filter(a=>refs.has(a.id)&&!fresh.assets.some(b=>b.id===a.id))));
  return {...s,assets:fresh.assets,objects:fresh.objects,initialSetup:fresh.initialSetup,setup:structuredClone(profiles[0].setup),setupProfiles:[...profiles,...structuredClone(custom)],activeSetupProfileId:profiles[0].id,ironHelmOptions:options,ironHelmTableVersion:12};
}

export const ironHelm={
  expansionChoiceHTML,configureOpening,
  openingProfiles:s=>availableHeroes(s?.ironHelmOptions).map(h=>({id:heroAsset(h),name:h.name,setup:createIronHelmSession(()=>.5,h.id,s?.ironHelmOptions).initialSetup})),
  openingProfileId:s=>heroAsset(currentHero(s)),
  id:'iron-helm',title:'铁盔',subtitle:'IRON HELM',tagline:'再探一扇门，再赌一次命运。',players:'1 人',duration:'30–60 分钟',create:createIronHelmSession,
  toolbar,journal,catalog,heroes,act,prepareSession:s=>{expansionOptions(s.ironHelmOptions);upgradeIronHelmTable(s,carriedEquipmentWeight);},onTokenDrop(s,o){dropMarker(s,o,(s,o,delta)=>changeValue(s,o.kind.slice(3),delta,o));},startView:'heroes',
  adjustToken(s,o,delta){
    const key=o.kind?.slice(3);
    if(o.kind?.startsWith('ih-')&&Object.hasOwn(statNames,key))changeValue(s,key,delta,o);
    else o.value=Math.max(-999,Math.min(999,o.value+delta));
  },
  tokenIcon(kind,o){const key=kind.slice(3);return `<span class="ih-token ${['turn','eyes'].includes(key)?'ih-token-counter':''}" title="${statNames[key]||''}"><img src="/assets/iron-helm/marker-${e(key==='weight'?'morality':key==='blessing'?'energy':key)}.webp" alt="" draggable="false"><small>${glyphs[key]||'✦'} ${statNames[key]||''}</small><b>${Number.isFinite(o?.value)?o.value:0}</b></span>`;},
  tokens:Object.entries(statNames).map(([key,name])=>({kind:`ih-${key}`,name,color:markerColors[key],value:key==='level'?1:0,width:['turn','eyes'].includes(key)?48:28,height:['turn','eyes'].includes(key)?48:28,assetId:`ih-marker-${key}`,description:'方形标记 · 拖至轨道刻度或滚轮调整，随桌面保存。'})),
  zones:[],
  rules:{title:'铁盔 · 规则手册',credit:'Jason Glover / Grey Gnome Games · 基础版',pdf:'/assets/iron-helm/rules-en.pdf',links:ruleBooks.map(({label,url})=>[label,url]),steps:ruleSummary}
};
