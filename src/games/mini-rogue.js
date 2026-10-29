import {createSession,baseObject,createFixedPile,captureSetup,applySetup,assetFor,dimensions,deckEntries,replaceDeckEntries,shuffled,takeDeckCard,appendDeckEntries,nextZ} from '../model.js';
import {miniRogueAssets} from './mini-rogue-assets.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MINI_ROGUE_PACKS=[
  {id:'depths',name:'诅咒深渊',note:'3 位角色、2 张首领、7 张房间与 26 张独立传说牌',cover:'mr-room-p13c1'},
  {id:'old-gods',name:'古神扩展',note:'骨士、死灵法师与实验室、壁龛、持盾怪物',cover:'mr-hero-skeleton'},
  {id:'death-bat',name:'死亡蝙蝠与赃物贩子',note:'2 张推广房间牌',cover:'mr-room-p17c2'},
  {id:'wolf-forge',name:'狼与熔炉',note:'2 张推广房间牌',cover:'mr-room-p17c6'}
];
export function miniRogueOptions(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('迷你游侠配置无效');
  const packs=raw.packs??[],map=raw.map??'dungeon';
  if(!Array.isArray(packs)||packs.length>MINI_ROGUE_PACKS.length||new Set(packs).size!==packs.length||packs.some(id=>!MINI_ROGUE_PACKS.some(p=>p.id===id)))throw new Error('扩展选择无效');
  if(!['dungeon','tower'].includes(map))throw new Error('请选择地牢或高塔');
  return {packs:MINI_ROGUE_PACKS.filter(p=>packs.includes(p.id)).map(p=>p.id),map};
}
export const miniRogueHeroes=raw=>miniRogueAssets.filter(a=>a.group==='hero'&&(!a.expansion||miniRogueOptions(raw).packs.includes(a.expansion)));
const byRole=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.mrRole===role);
const stat=(s,key)=>s.objects.find(o=>o.kind==='mr-'+key);
const roomId=(s,id)=>assetFor(s,id)?.group==='room';
const card=(assetId,x,y,z=3)=>({...baseObject('card',x,y,z),assetId,faceUp:true,setupFace:'fixed',snapCards:false});
const pile=(role,name,x,y,faceUp=false)=>({...createFixedPile(x,y),mrRole:role,name,faceUp,setupFace:'fixed',width:160,height:224,maxCards:100,z:4});
const rowSlots=()=>Array.from({length:8},(_,i)=>({row:Math.floor(i/3),col:i%3,x:455+(i%3)*185,y:200+Math.floor(i/3)*250}));
const ranges={xp:[0,23],hp:[0,20],armor:[0,4],food:[0,4],gold:[0,10],area:[1,10],monster:[0,50]};
const stats=[['xp','经验','#54a792'],['hp','生命','#b7414b'],['armor','护甲','#7d8a67'],['food','食物','#9c6452'],['gold','金币','#b6a03c'],['area','区域','#353b47'],['monster','怪物生命','#bb3d44']];
const heroIn=s=>assetFor(s,s.objects.find(o=>o.mrRole==='hero')?.assetId);

export function miniRogueAnchors(s,key){
  const panel=s.objects.find(o=>o.assetId===(['area','monster'].includes(key)?'mr-dungeon':'mr-player')&&['card','board'].includes(o.type));
  if(!panel)return [];
  let points=[];
  if(key==='xp')points=Array.from({length:24},(_,i)=>[i<16?125+i*110:235+(i-16)*110,i<16?135:245,i]);
  if(key==='armor'||key==='food')points=Array.from({length:5},(_,i)=>[125+i*110,key==='armor'?355:465,i]);
  if(key==='gold')points=Array.from({length:11},(_,i)=>[680+i*110,575,i]);
  if(key==='hp')points=Array.from({length:21},(_,i)=>[i===0?680:790+((i-1)%10)*110,i<=10?355:465,i]);
  if(key==='monster')points=Array.from({length:51},(_,i)=>{
    if(i===0)return [1038,1605,0];
    const col=i<=11?3:i<=24?2:i<=37?1:0,top=[50,37,24,11][col];
    return [643+(col)*131,163+(top-i)*131,i];
  });
  if(key==='area'){
    const front=[[105,800],[247,833],[105,1080],[247,1110],[105,1350],[247,1380],[390,1415],[105,1665],[247,1700],[390,1735]];
    const back=[[105,1735],[247,1700],[390,1665],[390,1415],[247,1380],[105,1350],[105,1110],[247,1080],[247,833],[390,800]];
    points=(panel.faceUp===false?back:front).map(([x,y],i)=>[x,y,i+1]);
  }
  if(key==='potion')points=[[125,695,'fire'],[125,830,'frost'],[535,695,'poison'],[535,830,'healing'],[935,695,'holy'],[935,830,'perception']];
  const source=['area','monster'].includes(key)?[1127,1893]:[1889,925],{w,h}=dimensions(s,panel),a=panel.rotation*Math.PI/180;
  return points.map(([x,y,value])=>{const dx=(x/source[0]-.5)*w,dy=(y/source[1]-.5)*h;return {x:panel.x+dx*Math.cos(a)-dy*Math.sin(a),y:panel.y+dx*Math.sin(a)+dy*Math.cos(a),value};});
}
function locate(s,o,key){const p=miniRogueAnchors(s,key).find(p=>p.value===o.value);if(p){o.x=p.x;o.y=p.y;}}
export function adjustMiniRogueToken(s,o,delta){
  const key=o.kind?.slice(3),range=ranges[key];
  if(!range||!Number.isInteger(o.value))return;
  let value=o.value+delta;
  if(key==='xp'&&value>23){const hp=stat(s,'hp');if(hp)adjustMiniRogueToken(s,hp,value-23);}
  o.value=Math.max(range[0],Math.min(range[1],value));locate(s,o,key);
}
export function dropMiniRogueToken(s,o){
  if(!s.settings.snap||o.locked||!o.kind?.startsWith('mr-'))return;
  const key=o.kind.slice(3),anchors=miniRogueAnchors(s,key),best=anchors.sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y))[0];
  if(best&&Math.hypot(best.x-o.x,best.y-o.y)<23){o.x=best.x;o.y=best.y;if(key!=='potion')o.value=best.value;}
}

export const miniRogueDice=[['character','角色骰','ivory'],['dungeon','地城骰','lemon'],['poison','中毒骰','lime'],['curse','诅咒骰','orange']].map(([id,name,color])=>({id:'mr-'+id,name,color,faces:[1,2,3,4,5,6]}));
export function miniRogueDieImage(o){const d=miniRogueDice.find(d=>d.name===o.name&&d.faces.length===o.faces?.length&&d.faces.every((v,i)=>v===o.faces[i]));return d&&`/assets/mini-rogue/die-${d.id.slice(3)}-${o.value}.webp`;}

export function createMiniRogueSession(random=Math.random,heroId='priestess',raw={}){
  const options=miniRogueOptions(raw),hero=miniRogueHeroes(options).find(a=>a.hero===heroId);
  if(!hero)throw new Error('请先启用该角色所属扩展');
  const s={...createSession('迷你游侠'),gameId:'mini-rogue',mode:'play',miniRogueOptions:options,
    assets:structuredClone(miniRogueAssets.filter(a=>!a.expansion||options.packs.includes(a.expansion))),
    meta:{players:'1 人',duration:'25–45 分钟',description:'在九宫格地城中向右或向下探索，管理补给、掷出暴击，寻找古神之血。',rules:'自由桌面：房间效果、战斗、药剂、技能和胜负由玩家按中文卡面结算。工具提供随机开局、区域重布、传说抽取与轨道标记。入口先选扩展和地图，再选角色。'}};
  s.objects.push({...card('mr-dungeon',1150,370,0),faceUp:options.map==='dungeon',locked:true,width:350,height:587},
    {...baseObject('board',1260,910,0),assetId:'mr-player',width:650,height:319,locked:true},
    {...card(hero.id,600,995),mrRole:'hero'},card('mr-rewards',1710,900),card('mr-stance',1710,620),
    {...baseObject('board',1260,1290,0),assetId:'mr-campaign',width:650,height:313,locked:true},
    card('mr-versus',1710,1220));
  const rooms=pile('rooms','房间牌库',240,200);Object.assign(rooms,{cards:s.assets.filter(a=>a.group==='room').map(a=>a.id),setupKey:'mr-rooms',setupOrder:'shuffle',drawTarget:{mode:'below',gap:28}});
  const bosses=pile('bosses','出口 · 首领',825,700);Object.assign(bosses,{cards:s.assets.filter(a=>a.group==='boss'&&!a.finalBoss).map(a=>a.id),setupKey:'mr-bosses',setupOrder:'shuffle',mrPrepareBosses:true});
  s.objects.push(rooms,bosses,pile('boss-reserve','备用首领',240,700),pile('defeated','已击败首领',240,950),{...pile('inventory','持有物品 · 不参与重洗',825,1250,true),maxCards:1});
  for(const {row,col,x,y} of rowSlots())s.objects.push({...baseObject('deal',x,y,3),name:row===0&&col===0?'入口':'房间',sourceKey:rooms.setupKey,count:1,layout:'spread',spacing:0,order:row*3+col+1,faceUp:row===0&&col===0,setupFace:'fixed',mrRole:'room',width:160,height:224});
  if(options.packs.includes('depths')){
    const lore=pile('lore','传说牌库',1510,200);Object.assign(lore,{cards:s.assets.filter(a=>a.group==='lore').map(a=>a.id),setupOrder:'shuffle',drawTarget:{mode:'deck',deckKey:'mr-lore-reveal'}});
    s.objects.push(lore,{...pile('lore-reveal','当前传说',1710,200,true),drawKey:'mr-lore-reveal'},pile('lore-discard','已结算传说',1510,475,true));
  }
  for(const [i,[key,name,color]] of stats.entries()){
    const value=key==='area'?1:hero[key]??0,o={...baseObject('token',1000+i*45,1100,30),kind:'mr-'+key,name,color,value,width:22,height:22};
    s.objects.push(o);locate(s,o,key);
  }
  s.objects.push({...baseObject('token',455,200,40),kind:'mr-pawn',name:'冒险者 · 翻面表示失明',color:'#d2ac5b',width:30,height:30},
    {...baseObject('token',770,1180,30),kind:'mr-item',name:'物品使用次数',color:'#b19d74',width:22,height:22});
  for(let i=0;i<2;i++){
    const o={...baseObject('token',965+i*45,1110,30),kind:'mr-potion',name:'药剂标记',color:'#a075bd',width:22,height:22};
    const anchor=i===0&&miniRogueAnchors(s,'potion').find(p=>p.value===hero.potion);if(anchor){o.x=anchor.x;o.y=anchor.y;}
    s.objects.push(o);
  }
  for(let i=0;i<3;i++)s.objects.push({...baseObject('die',1030+i*70,720,30),name:miniRogueDice[0].name,color:miniRogueDice[0].color,faces:[...miniRogueDice[0].faces],value:1,width:48,height:48,setupFace:'fixed'});
  for(const [i,d] of miniRogueDice.slice(1).entries())s.objects.push({...baseObject('die',1260+i*70,720,30),name:d.name,color:d.color,faces:[...d.faces],value:d.id==='mr-'+hero.affliction?1:6,width:48,height:48,setupFace:'fixed'});
  s.initialSetup=captureSetup(s,{name:(options.map==='tower'?'高塔':'地牢')+' · '+hero.name});
  const opening=applySetup(s,s.initialSetup,random);finishMiniRogueOpening(opening,s.initialSetup,random);return opening;
}

// Preparation is opt-in on the complete source. Authored or already dealt
// boss stacks keep their order and never gain duplicate cards.
export function finishMiniRogueOpening(s,setup,random=Math.random){
  const boss=byRole(s,'bosses'),reserve=byRole(s,'boss-reserve');
  if(!boss?.mrPrepareBosses||boss.locked||!reserve||reserve.locked||reserve.cards.length||boss.cards.includes('mr-boss-og'))return;
  const expected=s.assets.filter(a=>a.group==='boss'&&!a.finalBoss).map(a=>a.id);
  if(boss.cards.length!==expected.length||new Set(boss.cards).size!==expected.length||boss.cards.some(id=>!expected.includes(id)))return;
  const used=s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'&&o!==boss?o.cards:[]);
  if(used.some(id=>expected.includes(id)||id==='mr-boss-og'))return;
  const selected=Array.from({length:3},()=>takeDeckCard(boss).assetId);
  reserve.cards=[...boss.cards];boss.cards=['mr-boss-og',...selected.reverse()];boss.faceUp=false;
}

export function configureMiniRogueOpening(s,raw){
  const options=miniRogueOptions(raw);
  if(JSON.stringify(options)===JSON.stringify(miniRogueOptions(s.miniRogueOptions)))return structuredClone(s);
  const stock=new Set(miniRogueAssets.filter(a=>a.group==='hero').map(a=>a.id));
  const custom=(s.setupProfiles||[]).filter(p=>!stock.has(p.id));
  const fresh=createMiniRogueSession(()=>.5,'priestess',options),profiles=miniRogueProfiles(fresh);
  const refs=new Set(custom.flatMap(p=>[p.coverAssetId,...p.setup.objects.flatMap(o=>o.type==='deck'?o.cards:o.assetId?[o.assetId]:[])]));
  fresh.assets.push(...structuredClone(s.assets.filter(a=>refs.has(a.id)&&!fresh.assets.some(b=>b.id===a.id))));
  return {...s,assets:fresh.assets,objects:fresh.objects,miniRogueOptions:options,initialSetup:fresh.initialSetup,setup:structuredClone(profiles[0].setup),setupProfiles:[...profiles,...structuredClone(custom)],activeSetupProfileId:profiles[0].id};
}
const miniRogueProfiles=s=>miniRogueHeroes(s.miniRogueOptions).map(a=>({id:a.id,name:a.name,coverAssetId:a.id,description:`${a.expansion?MINI_ROGUE_PACKS.find(p=>p.id===a.expansion).name:'基础版'} · 生命 ${a.hp} / 食物 ${a.food} / 金币 ${a.gold}${a.affliction?' · 初始诅咒':''}${a.potion?' · 携带初始药剂':''}`,setup:createMiniRogueSession(()=>.5,a.hero,s.miniRogueOptions).initialSetup}));

export function miniRogueExpansionHTML(s){
  const o=miniRogueOptions(s.miniRogueOptions);
  return `<span class="section-eyebrow">MINI ROGUE · DLC</span><h2>选择这次的地城</h2><p class="modal-lead">基础版默认不含扩展。勾选 DLC 后，再选择角色开始冒险。</p><div class="ih-expansion-list">${MINI_ROGUE_PACKS.map(p=>`<label><input type="checkbox" data-mr-expansion="${p.id}" ${o.packs.includes(p.id)?'checked':''}><img src="${miniRogueAssets.find(a=>a.id===p.cover).front}" alt=""><span><strong>${p.name}</strong><small>${p.note}</small></span></label>`).join('')}</div><div class="ih-expansion-selects"><label>地图<select id="mr-map"><option value="dungeon" ${o.map==='dungeon'?'selected':''}>地牢 · 2 / 4 / 7 / 10 区首领</option><option value="tower" ${o.map==='tower'?'selected':''}>高塔 · 3 / 6 / 8 / 10 区首领</option></select></label></div><p class="subtle-note">传说独立洗牌，已用传说不洗回。骨士与死灵法师属于古神扩展；两组推广房间可分别启用。更改只在点击角色开局时应用，自建开局方案保留。</p><button class="primary-button" data-action="mr-choose-roles">下一步：选择角色 →</button>`;
}

export function dealMiniRogueArea(s,random=Math.random){
  if(s.mode!=='play')throw new Error('请在游玩模式布置区域');
  const source=byRole(s,'rooms'),bosses=byRole(s,'bosses'),area=stat(s,'area');
  if(!source||source.locked||!bosses||bosses.locked||!area)throw new Error('请恢复并解锁房间牌库、首领与区域标记');
  const slots=rowSlots(),table=s.objects.filter(o=>o.type==='card'&&roomId(s,o.assetId));
  if(table.some(o=>o.locked))throw new Error('请先解锁桌面房间');
  const stacks=s.objects.filter(o=>o.type==='deck'&&o!==source&&o.mrRole!=='inventory'&&o.cards.some(id=>roomId(s,id)));
  if(stacks.some(o=>o.locked))throw new Error('请先解锁待回收的房间牌堆');
  const cards=[...source.cards,...table.map(o=>o.assetId),...stacks.flatMap(o=>o.cards.filter(id=>roomId(s,id)))];
  if(cards.length<8||cards.some(id=>!roomId(s,id))||new Set(cards).size!==cards.length)throw new Error('房间牌不足或包含重复牌；持有物品请留在专用牌位');
  const ordered=source.setupOrder==='fixed'?cards:shuffled(cards,random);
  for(const stack of stacks)replaceDeckEntries(stack,deckEntries(stack).filter(c=>!roomId(s,c.assetId)));
  s.objects=s.objects.filter(o=>!table.includes(o)&&!(stacks.includes(o)&&!o.fixedPosition&&!o.cards.length));source.cards=ordered;source.faceUp=false;delete source.cardFaces;
  for(const {x,y,row,col} of slots){const entry=takeDeckCard(source);s.objects.push({...card(entry.assetId,x,y,nextZ(s)),mrRole:'room',faceUp:row===0&&col===0});}
  const pawn=stat(s,'pawn');if(pawn&&!pawn.locked){pawn.x=slots[0].x;pawn.y=slots[0].y;}
  const mat=s.objects.find(o=>o.assetId==='mr-dungeon');
  const exit=(mat?.faceUp===false?[3,6,8,10]:[2,4,7,10]).includes(area.value);
  replaceDeckEntries(bosses,bosses.cards.map((assetId,i)=>({assetId,faceUp:exit&&i===bosses.cards.length-1})));
  return '已布置 8 张房间并翻开入口；持有物品与已用传说保留。';
}
export function drawMiniRogueLore(s){
  if(s.mode!=='play')throw new Error('请在游玩模式抽取传说');
  const source=byRole(s,'lore'),target=byRole(s,'lore-reveal');
  if(!source||!target)throw new Error('请先在入口启用诅咒深渊扩展');
  if(source.locked||target.locked)throw new Error('请先解锁传说牌位');
  if(target.cards.length)throw new Error('请先把当前传说放入已结算传说牌位');
  if(!source.cards.length)throw new Error('传说牌库已空；已结算传说不再使用');
  appendDeckEntries(target,[{...takeDeckCard(source),faceUp:true}]);return '请按传说卡选择一项结算，随后移入已结算传说。';
}

export function miniRogueJournal(){
  const steps=[
    ['准备','入口选择 DLC 与地牢／高塔，再选择角色。按角色卡设置初始属性。8 张房间随机布成九宫格，入口朝上；右下角为首领牌堆，底牌是奥格之骸，上方随机 3 张首领，未使用首领留在备用区。起始只使用 1 颗角色骰，其余 2 颗备用。'],
    ['探索','结算当前房间后，翻开右侧和下侧房间，选择移动。只能向右或向下，不能退回或斜走。失明时只有进入房间后才翻开。右下出口在对应首领区域才发生首领战；其他区域直接深入。'],
    ['深入与重布','每区结束先自行消耗 1 食物，没有食物则失去 3 生命；骨士的亡灵技能例外。翻回角色卡、推进区域标记。再点击「布置当前区域」，回收桌面的房间并洗牌，持有物品留在专用牌位。击败首领后手动取出顶牌放入已击败首领。此按钮只布牌，不扣补给或推进轨道。'],
    ['骰子与技能检定','角色骰：1 是失误，2–4 是普通伤害，5 与 6 是成功星，6 可暴击重掷。检定时任一角色骰出现 5 或 6 即成功。地城骰用于查表。中毒和诅咒骰的 1–3 为触发面、4–6 为空白；仅在相应状态下加入骰池。经验 6 解锁第二颗角色骰，18 解锁第三颗；等级下降时减少骰子。'],
    ['战斗','角色先攻，投掷当前骰池并结算中毒／诅咒。暴击可重掷累加，掷出失误则该骰累计伤害清零。每颗角色骰每回合可用一次奖励点，付 1 经验或 2 生命重掷。敌人存活时掷地城骰：1 未命中，2–5 造成卡面伤害减护甲，6 穿甲。战斗、伤害、奖励与受伤反应均自行结算。'],
    ['属性与药剂','拖动方块到印刷轨道会吸附并同步数值；滚轮可微调。生命最多 20、经验 23、护甲与食物 4、金币 10。超过经验上限的部分转为生命。最多持有两瓶不同药剂；紫色方块拖到对应图标记录。药剂、物品使用和中毒／诅咒触发由玩家执行。'],
    ['技能与物品','使用主动技能后 F 翻转角色卡表示冷却；房间刷新符号或深入时恢复。物品最多一件，拖到「持有物品」牌位后不会参与区域重洗；用完后放回房间牌库。翻转冒险者标记记录失明。'],
    ['扩展与战役','诅咒深渊新增角色、房间、首领和独立传说。抽一张传说，按职业与情境选择一项，结算后放入已用传说，不再洗回。古神与两组推广牌各自可选。战役技能树已铺在角色板下方，章节与永久成长按原中文规则手动记录。'],
    ['结束','生命归零则失败。第 10 区最终首领分两阶段战斗，伤害溢出、霜冻及毒药不会带入第二阶段；击败第二阶段获胜。桌面提供组件与记录，不自动裁判胜负。F 翻面、R 旋转，右键放大，Ctrl+滚轮缩放，空格+拖动平移。']
  ];
  return `<span class="section-eyebrow">MINI ROGUE</span><h2>迷你游侠 · 冒险手册</h2><p class="modal-lead">Paolo Di Stefano & Gabriel Gendron · 基础版与可选 DLC，自由探索纸牌地城。</p><ol class="rule-steps">${steps.map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><a class="primary-button" href="/assets/mini-rogue/rules-zh.pdf" target="_blank" rel="noopener">完整中文规则 · 28 页 ↗</a><p class="subtle-note">使用用户提供的中文 PnP 素材，版权归游戏作者、出版方与汉化者。当前开局为单人冒险；合作与对战可在编辑模式自行增设第二套组件。</p>`;
}

export const miniRogue={
  id:'mini-rogue',title:'迷你游侠',subtitle:'MINI ROGUE',players:'1 人',duration:'25–45 分钟',create:createMiniRogueSession,
  coverAssetIds:['mr-hero-priestess','mr-boss-og','mr-hero-mage'],
  openingProfiles:miniRogueProfiles,openingProfileId:s=>heroIn(s)?.id||'mr-hero-priestess',afterOpening:finishMiniRogueOpening,
  expansionChoiceHTML:miniRogueExpansionHTML,configureOpening:configureMiniRogueOpening,prepareSession:s=>miniRogueOptions(s.miniRogueOptions),
  tableBounds:{x:1020,y:750,width:1740,height:1460},dice:miniRogueDice,dieImage:miniRogueDieImage,
  tokens:[...stats.map(([key,name,color])=>({kind:'mr-'+key,name,color,value:key==='area'?1:0,width:22,height:22,description:'拖至印刷轨道或用滚轮调整数值。'})),
    ...[['pawn','冒险者','#d2ac5b'],['potion','药剂标记','#a075bd'],['item','物品使用次数','#b19d74']].map(([key,name,color])=>({kind:'mr-'+key,name,color,description:'自由摆放；F 翻面记录状态。'}))],
  tokenIcon:(kind,o)=>kind==='mr-pawn'?'<span class="mr-pawn-icon">♟</span>':`<span class="mr-marker-core">${Number.isFinite(o?.value)?o.value:''}</span>`,
  adjustToken:adjustMiniRogueToken,onTokenDrop:dropMiniRogueToken,
  toolbar:s=>`<div class="mr-toolbar"><button data-game-action="heroes">角色 / DLC</button><span>区域 ${escape(stat(s,'area')?.value??'—')} · 生命 ${escape(stat(s,'hp')?.value??'—')} · 角色骰 ${1+(stat(s,'xp')?.value>=6?1:0)+(stat(s,'xp')?.value>=18?1:0)}</span><button data-game-action="mr-area" ${s.mode==='play'?'':'disabled'}>布置当前区域</button>${byRole(s,'lore')?`<button data-game-action="mr-lore" ${s.mode==='play'?'':'disabled'}>抽取传说</button>`:''}<button data-game-action="journal">中文规则 ↗</button></div>`,
  act(s,action){if(action==='mr-area')return dealMiniRogueArea(s);if(action==='mr-lore')return drawMiniRogueLore(s);throw new Error('未知的地城操作');},
  journal:miniRogueJournal,
  zones:[{className:'mr-zone',label:'MINI ROGUE',subtitle:'迷你游侠 · 探索 / 冒险 / 生还',box:[350,12,500,35]},
    {className:'mr-zone mr-dice-zone',label:'角色骰（起始 1） / 地城 / 中毒 / 诅咒',box:[975,669,510,26]},
    {className:'mr-zone',label:'战役 · 技能与遗物',subtitle:'按中文规则手动记录',box:[960,1090,600,35]}]
};
