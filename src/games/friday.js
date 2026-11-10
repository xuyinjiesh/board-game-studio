import {createSession,baseObject,createFixedPile,captureSetup,applySetup,assetFor,shuffled,deckEntries,replaceDeckEntries,appendDeckEntries,takeDeckCard,drawFromDeck,nextZ} from '../model.js';
import {fridayAssets} from './friday-assets.js';

const byRole=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.frRole===role);
const stat=(s,kind)=>s.objects.find(o=>o.type==='token'&&o.kind==='fr-'+kind);
const ids=group=>fridayAssets.filter(a=>a.group===group).map(a=>a.id);
const pile=(name,role,x,y,cards=[],faceUp=true,extra={})=>({...createFixedPile(x,y),name,frRole:role,cards,faceUp,setupFace:'fixed',width:140,height:254,maxCards:80,z:5,...extra});
const fighting=(s,id)=>['starting','aging','hazard'].includes(assetFor(s,id)?.group);
const phases=['绿色阶段','黄色阶段','红色阶段','海盗决战'];
const read=s=>stat(s,'phase')?.value??1;
const level=s=>stat(s,'level')?.value??1;
const lifeCap=s=>level(s)===4?20:22;
const face=(deck,cards,up)=>replaceDeckEntries(deck,cards.map(assetId=>({assetId,faceUp:up})));

export function createFridaySession(random=Math.random,difficulty=1){
  if(!Number.isInteger(difficulty)||difficulty<1||difficulty>4)throw new Error('请选择难度 1–4');
  const s={...createSession('星期五'),gameId:'friday',mode:'play',assets:structuredClone(fridayAssets),meta:{players:'1 人',duration:'25–30 分钟',description:'教鲁宾逊在荒岛生存。挑战危险、精简牌库，最终击退两艘海盗船。',rules:'自由桌面：按中文牌面结算能力、免费抽牌额度、生命费用、战力与胜负。辅助负责危险二选一、抽牌、补入衰老牌重洗、收牌与阶段推进。所有结算均可撤销。'}};
  for(const [role,x] of [['robinson',180],['hazard',530],['aging',880]])s.objects.push({...baseObject('board',x,215,0),assetId:'fr-mat-'+role,width:245,height:249,locked:true});
  s.objects.push(
    pile('鲁宾逊牌库','draw',180,215,ids('starting'),false,{width:112,height:204,setupKey:'fr-draw',setupOrder:'shuffle',frPrepare:true}),
    pile('战斗弃牌','discard',350,215,[],true,{width:112,height:204}),
    pile('危险牌库','hazard',530,215,ids('hazard'),false,{width:112,height:204,setupKey:'fr-hazard',setupOrder:'shuffle'}),
    pile('危险弃牌','hazard-discard',700,215,[],true,{width:112,height:204,rotation:180}),
    pile('衰老 · 普通在上','aging',880,215,ids('aging').filter(id=>difficulty>=3||id!=='fr-aging-very-stupid'),false,{width:112,height:204,setupKey:'fr-aging',setupOrder:'shuffle',frPrepare:true}),
    pile('阶段 · 绿→黄→红','phase',1070,215,['fr-phase-red','fr-phase-yellow','fr-phase-green'],true,{width:112,height:204}),
    pile('海盗一','pirate-1',1310,205,ids('pirate'),true,{width:254,height:140,setupKey:'fr-pirates',setupOrder:'shuffle',frPrepare:true}),
    pile('海盗二','pirate-2',1610,205,[],true,{width:254,height:140}),
    pile('当前危险 / 海盗','active',880,620,[],true,{rotation:180,maxCards:1}),
    pile('候选危险 · 左','choice-1',1270,620,[],true,{rotation:180,maxCards:1}),
    pile('候选危险 · 右','choice-2',1500,620,[],true,{rotation:180,maxCards:1}),
    pile('移出游戏 · 含已摧毁牌','removed',1700,910,[],true,{width:112,height:204}),
    pile('已击败海盗','defeated',1410,940,[],true,{width:254,height:140}),
    pile('未抽中海盗','pirate-reserve',1700,410,[],false,{width:127,height:70}));
  const tokens=[['life','生命',difficulty===4?18:20,1110,970,'#75913e'],['phase','阶段',1,930,970,'#b89946'],['level','难度',difficulty,1010,970,'#8c6c4a']];
  for(const [kind,name,value,x,y,color] of tokens)s.objects.push({...baseObject('token',x,y,30),kind:'fr-'+kind,name,value,color,width:60,height:60,locked:kind==='level'});
  s.initialSetup=captureSetup(s,{name:`难度 ${difficulty}`});
  const opening=applySetup(s,s.initialSetup,random);finishFridayOpening(opening,s.initialSetup,random);return opening;
}

// Only untouched complete sources opt in. Edited fixed-order openings remain
// authored, and running preparation twice never consumes a second aging card.
export function finishFridayOpening(s,setup,random=Math.random){
  const draw=byRole(s,'draw'),aging=byRole(s,'aging'),pirates=byRole(s,'pirate-1'),second=byRole(s,'pirate-2'),reserve=byRole(s,'pirate-reserve');
  const complete=(deck,expected)=>deck&&!deck.locked&&deck.cards.length===expected.length&&new Set(deck.cards).size===expected.length&&expected.every(id=>deck.cards.includes(id));
  const expectedAging=ids('aging').filter(id=>level(s)>=3||id!=='fr-aging-very-stupid');
  if(draw?.frPrepare&&aging?.frPrepare&&draw.setupOrder==='shuffle'&&aging.setupOrder==='shuffle'&&complete(draw,ids('starting'))&&complete(aging,expectedAging)){
    // Array end is the top. Normal cards must be exhausted before hard cards.
    const normal=aging.cards.filter(id=>!assetFor(s,id).hard),hard=aging.cards.filter(id=>assetFor(s,id).hard);
    face(aging,[...shuffled(hard,random),...shuffled(normal,random)],false);
    if(level(s)>=2){const entry=takeDeckCard(aging);face(draw,shuffled([...draw.cards,entry.assetId],random),false);}
    draw.frPrepare=false;aging.frPrepare=false;
  }
  if(pirates?.frPrepare&&pirates.setupOrder==='shuffle'&&complete(pirates,ids('pirate'))&&second&&!second.locked&&!second.cards.length&&reserve&&!reserve.locked&&!reserve.cards.length){
    const first=takeDeckCard(pirates),next=takeDeckCard(pirates);
    face(reserve,pirates.cards,false);replaceDeckEntries(pirates,[{...first,faceUp:true}]);replaceDeckEntries(second,[{...next,faceUp:true}]);pirates.frPrepare=false;
  }
}

function requirePlay(s){if(s.mode!=='play')throw new Error('请在游玩模式操作');}
function requirePiles(s,roles){return roles.map(role=>{const o=byRole(s,role);if(!o||o.locked)throw new Error('请恢复并解锁相关牌位');return o;});}
function requireGroup(s,p,groups){if(p.cards.some(id=>!groups.includes(assetFor(s,id)?.group)))throw new Error('相关牌位混入了其他组件，请先取出');}

export function revealFridayHazards(s){
  requirePlay(s);
  if(read(s)===4)throw new Error('已经进入海盗决战，请选择一艘海盗船');
  const [source,left,right,active]=requirePiles(s,['hazard','choice-1','choice-2','active']);
  if(left.cards.length||right.cards.length||active.cards.length)throw new Error('请先处理候选危险和当前战斗');
  requireGroup(s,source,['hazard']);if(!source.cards.length)throw new Error('危险牌库已空，请推进阶段');
  for(const target of [left,right])if(source.cards.length)appendDeckEntries(target,[{...takeDeckCard(source),faceUp:true}]);
  return right.cards.length?'已揭示两张危险，选择左侧或右侧。':'本阶段仅剩一张危险，可挑战或跳过。';
}

export function chooseFridayHazard(s,choice){
  requirePlay(s);if(!['1','2','skip'].includes(String(choice)))throw new Error('请选择左侧或右侧危险');
  const [left,right,active,discard]=requirePiles(s,['choice-1','choice-2','active','hazard-discard']);
  if(read(s)===4||active.cards.length)throw new Error('请先结束当前战斗');
  const choices=[left,right];choices.forEach(p=>requireGroup(s,p,['hazard']));
  if(choice==='skip'){
    if(choices.reduce((n,p)=>n+p.cards.length,0)!==1||byRole(s,'hazard')?.cards.length)throw new Error('只能跳过本阶段最后单独的一张危险');
    for(const p of choices){appendDeckEntries(discard,deckEntries(p));replaceDeckEntries(p,[]);}return '最后一张危险已弃置，可以推进阶段。';
  }
  const selected=choices[Number(choice)-1];if(selected.cards.length!==1)throw new Error('该候选牌位没有一张危险');
  Object.assign(active,{width:140,height:254,rotation:180});
  appendDeckEntries(active,[{...takeDeckCard(selected),faceUp:true}]);
  for(const p of choices){appendDeckEntries(discard,deckEntries(p));replaceDeckEntries(p,[]);}
  return '危险已选定。按当前阶段的危险值战斗；免费额度与能力由你结算。';
}

// Refill only when a draw is actually requested from an empty deck. Never
// expose the aging card; a mixed-face discard is reset face down as a whole.
export function drawFridayCard(s,random=Math.random){
  requirePlay(s);
  const [draw,discard,aging,active]=requirePiles(s,['draw','discard','aging','active']);
  if(!active.cards.length)throw new Error('请先选择危险或海盗');
  requireGroup(s,draw,['starting','aging','hazard']);requireGroup(s,discard,['starting','aging','hazard']);requireGroup(s,aging,['aging']);
  if(!draw.cards.length){
    if(!discard.cards.length&&!aging.cards.length)throw new Error('战斗牌与衰老牌均已耗尽，无法继续抽牌');
    const cards=[...discard.cards];if(aging.cards.length)cards.push(aging.cards.at(-1));
    if(aging.cards.length)takeDeckCard(aging);face(draw,shuffled(cards,random),false);replaceDeckEntries(discard,[]);
  }
  const count=s.objects.filter(o=>o.type==='card'&&o.frRole==='combat').length;
  const card=drawFromDeck(s,draw,true,{x:115+(count%5)*145,y:580+Math.floor(count/5)*280,rotation:0});
  Object.assign(card,{frRole:'combat',snapCards:false,width:140,height:254});
  return '已抽一张战斗牌。请自行记录免费额度；额外抽牌或海盗费用用生命按钮支付，衰老效果须结算。';
}

export function advanceFridayPhase(s,random=Math.random){
  requirePlay(s);const [source,discard,left,right,active,phase]=requirePiles(s,['hazard','hazard-discard','choice-1','choice-2','active','phase']);
  const marker=stat(s,'phase');if(!marker||marker.locked)throw new Error('请恢复并解锁阶段标记');
  if(read(s)>=4)throw new Error('已进入海盗决战');
  if(source.cards.length||left.cards.length||right.cards.length||active.cards.length)throw new Error('请先处理本阶段全部危险与当前战斗');
  requireGroup(s,discard,['hazard']);
  if(marker.value<3){face(source,shuffled(discard.cards,random),false);replaceDeckEntries(discard,[]);}
  if(phase.cards.length)takeDeckCard(phase);
  marker.value++;
  return marker.value===4?'三轮危险已结束。选择一艘海盗船，必须依次击败两艘才能离岛。':`进入${phases[marker.value-1]}，危险弃牌已洗回牌库。`;
}

export function chooseFridayPirate(s,choice){
  requirePlay(s);if(read(s)!==4||!['1','2'].includes(String(choice)))throw new Error('请在海盗阶段选择海盗');
  const [pirate,active]=requirePiles(s,['pirate-'+choice,'active']);
  if(active.cards.length)throw new Error('请先击败当前海盗');
  requireGroup(s,pirate,['pirate']);if(pirate.cards.length!==1)throw new Error('该海盗已被选走');
  Object.assign(active,{width:254,height:140,rotation:0});appendDeckEntries(active,[{...takeDeckCard(pirate),faceUp:true}]);
  return '海盗已就位。请按牌面的特殊规则调整危险值、免费张数或额外抽牌费用。';
}

export function finishFridayBattle(s,won){
  requirePlay(s);const [active,discard,hazards,defeated]=requirePiles(s,['active','discard','hazard-discard','defeated']);
  if(active.cards.length!==1)throw new Error('请先选择一个危险或海盗');
  const opponent=assetFor(s,active.cards[0]);
  if(!['hazard','pirate'].includes(opponent?.group))throw new Error('当前牌位不是危险或海盗');
  if(opponent.group==='pirate'&&!won)throw new Error('海盗战不能认输，必须继续抽牌作战，或在无法支付生命时判负');
  const cards=s.objects.filter(o=>o.type==='card'&&fighting(s,o.assetId));
  if(cards.some(o=>o.locked))throw new Error('请先解锁本场已打出的战斗牌');
  // Loose fighting cards are the battle. Cards intentionally set aside belong
  // in the removed pile; no pile elsewhere is collected or searched.
  appendDeckEntries(discard,cards.map(o=>({assetId:o.assetId,faceUp:true})));
  s.objects=s.objects.filter(o=>!cards.includes(o));
  const target=opponent.group==='pirate'?defeated:won?discard:hazards;
  appendDeckEntries(target,[{...takeDeckCard(active),faceUp:true}]);
  return opponent.group==='pirate'?(defeated.cards.length===2?'两艘海盗均已击败！请核对生命支付和全部能力，再查看最终得分。':'第一艘海盗已击败，请立即挑战另一艘。'):won?'危险已作为知识卡加入战斗弃牌堆。':'危险已弃置。请确认已支付差额生命，并将允许摧毁的牌放入移出游戏牌位。';
}

export function adjustFridayToken(s,o,delta){
  const cap=o.kind==='fr-life'?lifeCap(s):o.kind==='fr-phase'?4:o.kind==='fr-level'?4:999;
  const min=o.kind==='fr-life'?0:['fr-phase','fr-level'].includes(o.kind)?1:-999;
  o.value=Math.max(min,Math.min(cap,o.value+delta));
}

export function fridayStatus(s){
  const draw=byRole(s,'draw')?.cards||[],discard=byRole(s,'discard')?.cards||[],loose=s.objects.filter(o=>o.type==='card'&&fighting(s,o.assetId)).map(o=>o.assetId);
  const combat=[...draw,...discard,...loose],defeated=(byRole(s,'defeated')?.cards||[]).filter(id=>assetFor(s,id)?.group==='pirate').length;
  const hazards=(byRole(s,'hazard-discard')?.cards||[]).filter(id=>assetFor(s,id)?.group==='hazard').length;
  const life=stat(s,'life')?.value??0,won=defeated===2;
  const deckScore=combat.reduce((n,id)=>n+(assetFor(s,id)?.group==='aging'?-5:assetFor(s,id)?.fight||0),0);
  return {life,cap:lifeCap(s),phase:read(s),level:level(s),defeated,won,score:deckScore+defeated*15-hazards*3+(won?life*5:0)};
}

export function fridayJournal(s){
  const v=fridayStatus(s);
  return `<span class="section-eyebrow">FRIDAY · FRIEDEMANN FRIESE</span><h2>星期五 · 荒岛生存手册</h2><p class="modal-lead">帮助鲁宾逊精简牌库、学习生存技能，最终击败两位海盗。当前难度 ${v.level}，生命 ${v.life} / ${v.cap}。</p><ol class="rule-steps">${[
    ['四档准备','难度一：18张起始牌，20生命，2点预备生命；移出「老年痴呆（Very Stupid，-3）」衰老牌。难度二再把一张随机普通衰老牌混入起始牌库。难度三加入全部11张衰老牌，再混入一张普通衰老牌。难度四同难度三，但18生命、2点预备生命，生命上限20。衰老牌始终普通在上、困难在下，各自独立洗牌。随机选出两位海盗，其余移出游戏。'],
    ['选择危险','点击「揭示危险」，从两张候选中选择一张，另一张弃至危险弃牌。候选与当前危险旋转180°显示危险侧；成为知识后按战斗侧使用。阶段最后只剩一张危险时，可挑战或跳过。'],
    ['逐张抽牌','按当前危险白框规定，逐张免费抽战斗牌；额外每张支付1生命，放在危险右侧。「抽战斗牌」负责抽一张及必要时重洗；免费额度、停止效果、能力抽牌及额外费用由你结算，生命按钮每次调整1。请把额外牌拖至右侧，并随抽随付；特殊海盗可能每张收费2生命。'],
    ['能力与衰老','已打出的卡牌每场各可用一次能力，R旋转90°表示使用过；先完整结算一个能力，再使用下一个。摧毁的牌放入「移出游戏」牌位；交换的牌放入战斗弃牌，替代牌可用抽牌按钮。复制、加倍、降低阶段、看3张并排序、放到牌库底等，按中文规则手动执行。摧毁用F翻面暂记失效，再于结束时移出。所有未移除衰老牌的负面效果必须结算，最高牌=0、停止免费抽取和生命损失不会由工具自动处理。'],
    ['结束与精简','抽过至少一张牌后，可自行决定结束；达到目标也不强制立即结束。先结算剩余能力与衰老，再比较战力和危险值。获胜：点击「获胜收牌」，危险成为知识，与桌面散放的战斗牌一起进入战斗弃牌。失败：支付差额生命，可用这次损失的生命摧毁已打出的牌，普通牌每张1点，衰老牌每张2点；不额外支付生命。先把摧毁牌拖入移出游戏，再点「败退收牌」。按钮不计算战力或扣血，全部桌面散放的起始／知识／衰老牌都会被收回；放在其他牌堆中的卡不会被收回。'],
    ['战斗牌用尽','只有需要抽牌但牌库已空时，抽牌辅助才将战斗弃牌与下一张背面衰老牌一起洗匀，并抽出一张。不会预先重洗，不收回本场已打出的卡。衰老牌用尽则只重洗战斗弃牌。也可手动洗牌或操作牌库，使用前自行加入衰老牌。'],
    ['推进阶段','处理完所有危险后，点击「推进阶段」。绿色→黄色→红色；前两次将危险弃牌洗回危险牌库。完成红色进入海盗决战，剩余危险留在弃牌堆，不再洗回。阶段标记可滚轮手动纠正，完整流程建议使用推进按钮。'],
    ['最终海盗与胜负','海盗阶段可任选一艘先战，获胜后立即挑战另一艘。海盗不能败退，必须继续抽牌直到获胜或无法付生命。特殊海盗：每张额外牌收费2；只计一半战斗牌但必须包含所有衰老牌（奇数向上取整）；每张打出的战斗牌+1；与剩余危险红色值之和战斗，免费张数为其白框之和；或每张已进入战斗牌系统的衰老牌让危险值+2。具体见完整规则。0生命仍可继续，需再付生命而无法支付才立即失败。'],
    ['计分与桌面','普通战斗牌按战斗值；衰老每张-5；击败海盗每张15；危险弃牌每张-3；获胜才将剩余生命每点计5。计分参考按鲁宾逊牌库、战斗弃牌及桌面散牌统计，需先完成收牌与胜负核对。拖动、F翻面、R旋转、右键查看大图；牌位可搜索、整叠移动；操作可撤销并自动保存。']
  ].map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><a class="primary-button" href="/assets/friday/rules-zh.pdf" target="_blank" rel="noopener">完整中文规则 · 9页 ↗</a><p class="subtle-note">参考得分 ${v.score} · ${v.won?'两艘海盗已收纳，已含剩余生命分':'未含剩余生命分'}。工坊提供自由桌面与流程辅助，能力、费用、战力和胜负由玩家执行。美术与规则版权归原作者及汉化者。</p>`;
}

export const friday={
  id:'friday',title:'星期五',subtitle:'FRIDAY',players:'1 人',duration:'25–30 分钟',create:createFridaySession,
  openingTitle:'选择生存难度',openingDescription:'从初次漂流到极限挑战。各牌库独立洗牌，衰老牌分层，两艘海盗随机抽取；当前进度可撤销恢复。',
  coverAssetIds:['fr-hazard-23','fr-start-7','fr-hazard-25'],
  openingProfiles:()=>[1,2,3,4].map(n=>({id:'fr-level-'+n,name:`难度 ${n} · ${['初次漂流','渐入险境','荒岛求生','极限挑战'][n-1]}`,coverAssetId:n===4?'fr-aging-suicide':'fr-hazard-23',description:`${n===4?18:20}点生命 · ${n===1?18:19}张起始牌 · ${n>=3?'全部衰老牌':'移出Very Stupid'}${n>=2?' · 初始混入一张衰老牌':''}`,setup:createFridaySession(()=>.5,n).initialSetup})),
  openingProfileId:()=> 'fr-level-1',afterOpening:finishFridayOpening,
  tableBounds:{x:925,y:570,width:1810,height:1100},
  zones:[
    {className:'fr-zone',label:'FRIDAY · 星期五',subtitle:'让每一次冒险，成为下一次生还的本领。',box:[65,5,900,50]},
    {className:'fr-zone',label:'战斗区',subtitle:'逐张抽牌 · 免费在左 / 额外在右 · 侧放表示能力已用',box:[55,365,1100,55]},
    {className:'fr-zone',label:'候选危险',subtitle:'揭示两张，选择其一',box:[1195,380,430,50]},
    {className:'fr-zone',label:'最终对手',subtitle:'红色阶段结束后，依次击败两位海盗',box:[1185,35,560,45]}
  ],
  tokens:[{kind:'fr-life',name:'生命',value:20,color:'#75913e',width:60,height:60},{kind:'fr-phase',name:'阶段',value:1,color:'#b89946',width:60,height:60},{kind:'fr-level',name:'难度',value:1,color:'#8c6c4a',width:60,height:60}],
  tokenIcon:(kind,o)=>`<span class="fr-token"><small>${kind==='fr-life'?'生命':kind==='fr-level'?'难度':'阶段'}</small><b>${Number.isFinite(o?.value)?o.value:''}</b></span>`,
  adjustToken:adjustFridayToken,
  toolbar(s){
    const v=fridayStatus(s),disabled=s.mode!=='play'?'disabled':'',active=byRole(s,'active')?.cards.length,choice=byRole(s,'choice-1')?.cards.length||byRole(s,'choice-2')?.cards.length;
    const button=(action,label,value='')=>`<button data-game-action="fr-${action}" data-game-value="${value}" ${disabled}>${label}</button>`;
    return `<div class="fr-toolbar"><div><button data-game-action="heroes">选择难度</button><span class="fr-vitals">${phases[v.phase-1]} <i>生命 ${v.life}/${v.cap}</i> 海盗 ${v.defeated}/2</span>${button('life','−1生命','-1')}${button('life','+1生命','1')}<button data-game-action="journal">中文规则 ↗</button></div><div>${active?button('draw','抽战斗牌')+button('win','获胜收牌')+(assetFor(s,byRole(s,'active').cards[0])?.group==='hazard'?button('lose','败退收牌'):''):choice?button('choose','挑战左侧','1')+(byRole(s,'choice-2')?.cards.length?button('choose','挑战右侧','2'):button('choose','跳过末张','skip')):v.phase===4?['1','2'].filter(n=>byRole(s,'pirate-'+n)?.cards.length).map(n=>button('pirate','挑战海盗'+n,n)).join(''):button('reveal','揭示危险')+button('advance','推进阶段')}<small>能力、免费额度、费用与胜负手动结算</small></div></div>`;
  },
  act(s,action,value,selected,random=Math.random){
    if(action==='fr-reveal')return revealFridayHazards(s);
    if(action==='fr-choose')return chooseFridayHazard(s,value);
    if(action==='fr-draw')return drawFridayCard(s,random);
    if(action==='fr-advance')return advanceFridayPhase(s,random);
    if(action==='fr-pirate')return chooseFridayPirate(s,value);
    if(action==='fr-win'||action==='fr-lose')return finishFridayBattle(s,action==='fr-win');
    if(action==='fr-life'){requirePlay(s);const o=stat(s,'life');if(!o||o.locked)throw new Error('请恢复并解锁生命标记');if(!['-1','1'].includes(String(value)))throw new Error('无效生命调整');if(value==='-1'&&o.value===0)throw new Error('生命已为0；若必须支付生命，则本局失败');adjustFridayToken(s,o,Number(value));return;}
    throw new Error('未知的荒岛操作');
  },
  journal:fridayJournal
};
