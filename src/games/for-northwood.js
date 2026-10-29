import {createSession,baseObject,createFixedPile,captureSetup,applySetup,shuffled,assetFor,deckEntries,replaceDeckEntries,drawFromDeck,nextZ} from '../model.js';
import {northwoodAssets} from './for-northwood-assets.js';
import {insertHandCard} from '../hands.js';
import {cardEdgePlacement} from '../interactions.js';

const SUITS=['claws','flowers','eyes','leaves'];
const LABELS={claws:'爪',flowers:'花',eyes:'瞳',leaves:'叶'};
const handZone={id:'nw-hand',name:'你的手牌',capacity:8,acceptGroup:'dialogue',suits:SUITS};
const fiefX=i=>110+i*166;
const reservePosition=i=>({x:1460+(i%2)*135,y:330+Math.floor(i/2)*230});
const card=(id,x,y,z=2)=>({...baseObject('card',x,y,z),assetId:'nw-'+id,faceUp:true,setupFace:'fixed',snapCards:false});
const pile=(name,role,x,y,cards=[],faceUp=true)=>({...createFixedPile(x,y),z:4,name,nwRole:role,cards,faceUp,setupFace:'fixed',maxCards:65,width:140,height:195.56});
const deal=(sourceKey,role,x,y,order,extra={})=>({...baseObject('deal',x,y,5),name:role==='ally'?'初始盟友':role==='ruler'?'领地领主':'起始手牌',sourceKey,nwRole:role,count:1,layout:'spread',spacing:0,order,faceUp:true,setupFace:'fixed',width:140,height:195.56,...extra});

export function createNorthwoodSession(random=Math.random,variant='intro'){
  const s={...createSession('为了北境森林'),gameId:'for-northwood',mode:'play',assets:structuredClone(northwoodAssets),meta:{players:'1 人',duration:'15–30 分钟',description:'拜访八片领地，以恰到好处的对话让森林重归团结。',rules:'自由操作桌面。盟友能力、跟花、得墩和替补由玩家结算；拜访结果用领主位置及领地翻面记录，星数按领地牌手动结算。'}};
  s.handZone=structuredClone(handZone);s.northwoodHandVersion=1;s.northwoodReserveVersion=2;
  for(let i=0;i<8;i++){
    s.objects.push(card('fief-'+i,fiefX(i),360,1));
  }
  s.objects.push({...card('visit',1460,80,6),width:100,height:139.68});
  const dialogue=pile('对话牌库','dialogue-draw',950,650,s.assets.filter(a=>a.group==='dialogue').map(a=>a.id),false);
  Object.assign(dialogue,{setupKey:'nw-dialogue',setupOrder:'shuffle',drawTarget:{mode:'deck',deckKey:'nw-discard'}});
  s.objects.push(dialogue,{...pile('弃牌堆 · 领主陈述','discard',1140,650),drawKey:'nw-discard'},pile('得分堆 · 赢得的回应','score',1330,650));
  const slots=[deal('nw-dialogue','hand',110,970,30,{count:8,spacing:166,handId:'nw-hand',handOrder:0})];
  if(variant==='full'){
    for(const [i,suit] of SUITS.entries()){
      const {x,y}=reservePosition(i);
      const source=pile(`${LABELS[suit]} · 备用角色`,'unused',x,y,s.assets.filter(a=>a.group==='character'&&a.suit===suit).map(a=>a.id),false);
      Object.assign(source,{setupKey:'nw-characters-'+suit,setupOrder:'shuffle',width:100,height:139.68});
      s.objects.push(source);
      slots.push(deal(source.setupKey,'ally',170+i*190,650,i*3+1),
        ...[0,1].map(j=>deal(source.setupKey,'ruler',fiefX(i*2+j),275,i*3+j+2,{nwPool:source.setupKey})));
    }
  }else{
    for(const [i,suit] of SUITS.entries())s.objects.push({...card(suit+'-jack',170+i*190,650,5),nwRole:'ally'});
    const rulers=pile('入门领主 · 女王与国王','ruler-source',1460,320,s.assets.filter(a=>a.group==='character'&&['queen','king'].includes(a.rank)).map(a=>a.id));
    Object.assign(rulers,{setupKey:'nw-rulers',setupOrder:'shuffle',setupHideEmpty:true});
    s.objects.push(rulers,{...pile('备用 · 完整局角色','unused',1460,330,s.assets.filter(a=>a.group==='character'&&a.advanced).map(a=>a.id),false),width:100,height:139.68});
    for(let i=0;i<8;i++)slots.push(deal(rulers.setupKey,'ruler',fiefX(i),275,i+1));
  }
  s.initialSetup=captureSetup(s,{name:variant==='full'?'完整局 · 全角色':'入门局 · 四位骑士'});
  s.initialSetup.objects.push(...slots.map(({id,...o})=>o));
  const opening=applySetup(s,s.initialSetup,random);
  finishNorthwoodOpening(opening,s.initialSetup,random);
  return opening;
}

// The full game chooses one ally and two rulers per suit, then mixes the eight
// rulers across the fiefs. Fixed-order sources keep their authored assignments.
export function finishNorthwoodOpening(s,setup,random=Math.random){
  for(const o of s.objects)if(o.type==='card'&&o.nwRole)o.snapCards??=false;
  const pools=new Set(setup.objects.filter(o=>o.type==='deck'&&o.setupKey?.startsWith('nw-characters-')&&o.setupOrder==='shuffle').map(o=>o.setupKey));
  const rulers=s.objects.filter(o=>o.type==='card'&&o.nwRole==='ruler'&&pools.has(o.nwPool));
  const ids=shuffled(rulers.map(o=>o.assetId),random);
  rulers.forEach((o,i)=>o.assetId=ids[i]);
}

export function prepareNorthwoodSession(s){
  for(const table of [s,s.initialSetup,s.setup,...(s.setupProfiles||[]).map(p=>p.setup)].filter(Boolean)){
    table.objects=table.objects.filter(o=>!(o.type==='token'&&/^nw-fief-[0-7]$/.test(o.kind)));
    if(s.northwoodReserveVersion!==2)for(const o of table.objects){
      if(o.type!=='deck'||o.nwRole!=='unused'||o.x!==1460||o.rotation!==0)continue;
      const suit=SUITS.indexOf(o.setupKey?.replace('nw-characters-',''));
      if(suit>=0&&[270+suit*170,320+suit*225].includes(o.y))Object.assign(o,reservePosition(suit));
      else if(suit<0&&o.y===650&&o.name==='备用 · 完整局角色')o.y=330;
    }
  }
  s.northwoodReserveVersion=2;
  if(s.meta?.rules)s.meta.rules=s.meta.rules.replace('领地圆标记：滚轮向上为友好（✓），0 为未拜访（○），向下为失败（×）；星数依据标记统计。','');
  s.handZone??=structuredClone(handZone);
  if(s.northwoodHandVersion===1)return;
  // Upgrade legacy cards still in the authored hand row, leaving loose played
  // cards and every score/discard pile alone. Do not reset a game in progress.
  const saved=s.setup||s.initialSetup,anchor=saved?.objects.find(o=>o.type==='deal'&&o.nwRole==='hand');
  const a=-(anchor?.rotation||0)*Math.PI/180;
  let order=0;
  for(const o of s.objects)if(o.type==='card'&&o.nwRole==='hand'&&assetFor(s,o.assetId)?.group==='dialogue'){
    const dx=o.x-(anchor?.x??110),dy=o.y-(anchor?.y??970),x=dx*Math.cos(a)-dy*Math.sin(a),y=dx*Math.sin(a)+dy*Math.cos(a);
    if(Math.abs(y)<80&&x>=-70&&x<=((anchor?.count??8)-1)*(anchor?.spacing??166)+70){o.handId='nw-hand';o.handOrder=order++;}
  }
  const tables=[s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean);
  for(const objects of tables)for(const o of objects){
    if(o.type==='deal'&&o.nwRole==='hand'){o.handId='nw-hand';o.handOrder=0;}
  }
  s.northwoodHandVersion=1;
}

export const northwoodCardPlacement=(s,o,{zoom=1}={})=>cardEdgePlacement(s,o,{threshold:Math.max(8,Math.min(40,10/zoom))});

export function northwoodStatement(s){
  if(s.mode!=='play')throw new Error('请在游玩模式进行对话');
  const draw=s.objects.find(o=>o.type==='deck'&&o.nwRole==='dialogue-draw');
  if(!draw||draw.locked||!draw.cards.length)throw new Error('对话牌库为空、已锁定或已移除');
  if(assetFor(s,draw.cards.at(-1))?.group!=='dialogue')throw new Error('对话牌库顶牌不是对话牌，请先取出混入的组件');
  if(!draw.drawTarget)throw new Error('请为对话牌库设置弃牌堆发牌目标');
  drawFromDeck(s,draw,true);
  return '领主已陈述。请跟花回应，并将赢得的回应放入得分堆。';
}

// Only the dialogue cards are collected; allies, substitutes and visit results
// remain under player control. Reject missing/duplicated cards before mutation.
export function redealNorthwood(s,random=Math.random){
  if(s.mode!=='play')throw new Error('请在游玩模式重洗对话牌');
  const isDialogue=id=>assetFor(s,id)?.group==='dialogue';
  const expected=s.assets.filter(a=>a.group==='dialogue').map(a=>a.id);
  const draw=s.objects.find(o=>o.type==='deck'&&o.nwRole==='dialogue-draw');
  if(!draw)throw new Error('找不到对话牌库，请恢复牌库或重新开局');
  if(draw.cards.some(id=>!isDialogue(id)))throw new Error('对话牌库混入了其他组件，请先取出');
  const holders=s.objects.filter(o=>o.type==='card'?isDialogue(o.assetId):o.type==='deck'&&o.cards.some(isDialogue));
  if(draw.locked||holders.some(o=>o.locked))throw new Error('请先解锁包含对话牌的物件');
  const ids=holders.flatMap(o=>o.type==='card'?[o.assetId]:o.cards.filter(isDialogue));
  if(expected.length!==32||ids.length!==32||new Set(ids).size!==32||expected.some(id=>!ids.includes(id)))throw new Error('需要桌面上的完整 32 张对话牌；请先恢复缺失牌或移除重复牌');
  const setup=s.setup||s.initialSetup;
  const hand=setup.objects.find(o=>o.type==='deal'&&o.nwRole==='hand');
  const anchor=hand||{x:110,y:970,spacing:166,rotation:0};
  const angle=anchor.rotation*Math.PI/180;
  for(const o of holders)if(o.type==='deck')replaceDeckEntries(o,deckEntries(o).filter(e=>!isDialogue(e.assetId)));
  s.objects=s.objects.filter(o=>!(o.type==='card'&&isDialogue(o.assetId)));
  // Keep empty fixed piles as destinations, but clear obsolete loose stacks.
  s.objects=s.objects.filter(o=>o===draw||o.type!=='deck'||o.fixedPosition||o.cards.length||!holders.includes(o));
  replaceDeckEntries(draw,shuffled(ids,random).map(assetId=>({assetId,faceUp:false})));
  for(let i=0;i<8;i++){
    const o=drawFromDeck(s,draw,true,{x:anchor.x+i*anchor.spacing*Math.cos(angle),y:anchor.y+i*anchor.spacing*Math.sin(angle),rotation:anchor.rotation});
    o.nwRole='hand';o.z=nextZ(s);o.snapCards=false;insertHandCard(s,o);
  }
  return '32 张对话牌已重洗，并发出 8 张手牌；请依规则处理替补并重置盟友。';
}

export const northwood={
  id:'for-northwood',title:'为了北境森林',subtitle:'FOR NORTHWOOD!',players:'1 人',duration:'15–30 分钟',create:createNorthwoodSession,
  coverAssetIds:['nw-claws-jack','nw-flowers-jack','nw-eyes-jack'],
  openingProfiles:()=>[
    {id:'nw-intro',name:'入门局 · 四位骑士',coverAssetId:'nw-claws-jack',description:'固定四位骑士作为盟友，八位国王与女王随机成为领主。',setup:createNorthwoodSession(()=>.5,'intro').initialSetup},
    {id:'nw-full',name:'完整局 · 全角色',coverAssetId:'nw-leaves-king',description:'使用全部 24 位角色，每种花色随机选一位盟友、两位领主。',setup:createNorthwoodSession(()=>.5,'full').initialSetup}
  ],openingProfileId:()=> 'nw-intro',afterOpening:finishNorthwoodOpening,prepareSession:prepareNorthwoodSession,
  tableBounds:{x:785,y:430,width:1530,height:880},
  zones:[
    {className:'nw-zone',label:'为了北境森林 · 八片领地',subtitle:'将拜访指示牌移至当前领地上方',box:[40,105,1300,45]},
    {className:'nw-zone',label:'盟友 · 每次拜访各可使用一次',box:[80,520,730,32]},
    {className:'nw-zone',label:'对话牌',box:[865,520,550,32]},
    {className:'nw-zone nw-reserve',label:'备用角色',subtitle:'未选中的角色不参与本局',box:[1400,180,260,50]}
  ],
  act(s,action,value,selected,random=Math.random){if(action==='nw-redeal')return redealNorthwood(s,random);if(action==='nw-statement')return northwoodStatement(s);throw new Error('未知的森林操作');},
  cardPlacement:northwoodCardPlacement,snapLabel:'卡牌边缘吸附',
  onDrop(s,o,context){const p=northwoodCardPlacement(s,o,context);if(p)Object.assign(o,{x:p.x,y:p.y,rotation:p.rotation});},
  journal(){return `<span class="section-eyebrow">FOR NORTHWOOD!</span><h2>为了北境森林 · 规则手册</h2><p class="modal-lead">单人精确得墩游戏 · 以和平对话团结八片领地。中文牌面与完整英文规则均可离线使用。</p><ol class="rule-steps">${[
    ['准备与选地','领地按 0–7 排列。入门局使用四位骑士和八位女王、国王；完整局每种花色随机选一位盟友及两位领主，再随机安排领主位置。查看已发出的 8 张手牌，选择尚未拜访的领地，将指示牌移到其上方。每片领地整局仅拜访一次。'],
    ['借助友好领主','拜访前可让任意数量的友好领主各替代一位盟友，最多仍有四个可用能力。把替补放在盟友上；本次拜访结束，所有带来的替补均移出游戏，无论是否用过能力。已赢得的领地星数保留。'],
    ['盟友能力','每次领主陈述前，可用至多一个盟友能力；旋转 90° 标记耗竭，并完整执行中文牌面。每位盟友每次拜访可用一次。若能力有合法执行方式就必须执行；牌堆不足时尽可能执行。能力执行完毕若手牌或牌库已空，立即结束拜访。'],
    ['进行对话','将对话牌库顶牌拖至弃牌堆，按 F 翻至正面，作为领主的陈述。你出一张回应：有相同花色必须跟花，没有才可出任意花色。领主角色的花色为主牌；同花色且点数更大，或陈述不是主牌而回应是主牌时赢得这一墩。赢墩只将自己的回应放进得分堆，没赢则放入弃牌堆；陈述始终在弃牌堆。'],
    ['结束拜访','一次对话结束或能力完整执行后，只要手牌或牌库任一为空，拜访立即结束。得分堆张数必须恰好等于领地目标值，才成为友好领地：将领主略向下移。失败则领主移出游戏、领地翻面。用牌的位置与正背面记录拜访结果。'],
    ['继续与计分','移除本次所有替补，旋转重置四位盟友。收回全部 32 张对话牌，洗牌并重发 8 张手牌，再选择下一片领地。使用牌堆的洗牌操作，手动将牌拖入手牌区并翻至正面。八片领地拜访完毕后，手动累计友好领地牌的星数：标准 16 星、进阶 18 星、理想主义 20 星。'],
    ['桌面操作','底部手牌自动弧形叠放，悬停抬起；拖出出牌，拖回收纳，拖动或 Alt+方向键调整顺序，下方可按花色或点数整理。开启「卡牌边缘吸附」后，拖近另一张牌的边缘会显示对齐线，松手按边对齐，保留另一方向的错位。F 翻面，桌面上的牌用 R 旋转，右键放大中文牌面。弃牌堆和得分堆可随时搜寻，但按规则不可重排。拜访指示牌背面为奖牌表。操作可撤销，并随进度保存。']
  ].map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><a class="primary-button" href="/assets/for-northwood/rules-en.pdf" target="_blank" rel="noopener">完整英文规则 · 16 页 ↗</a><p class="subtle-note">工坊提供自由桌面、开局与整理辅助。出牌合法性、卡牌能力、拜访结束和胜负由玩家执行。素材未附进阶挑战册。</p>`;}
};
