import {createSession,baseObject,captureSetup,assetFor,rollDieValue} from '../model.js';
import {cleverAssets} from './clever-assets.js';
import {CLEVER_SHEETS,cleverSheet,cleverCells} from './clever-sheets.js';
export {CLEVER_SHEETS,cleverCells};

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const CLEVER_DICE={yellow:['黄色','#eecb26'],blue:['蓝色','#277bbc'],green:['绿色','#94bc35'],orange:['橙色','#ef9335'],purple:['紫色','#7756aa'],pink:['粉色','#e979bc'],silver:['灰银色','#a1a2a6'],teal:['青绿色','#49b9b5'],brown:['棕色','#a97946'],white:['白色','#eeeae0']};
const button=(action,label,value='',disabled=false)=>`<button data-game-action="${action}" data-game-value="${escape(value)}" ${disabled?'disabled':''}>${label}</button>`;
const closeButton=label=>`<button data-action="close-modal">${label}</button>`;
const sheetBoard=s=>s.objects.find(o=>o.type==='board'&&assetFor(s,o.assetId)?.group==='sheet');
const config=(s,b=sheetBoard(s))=>cleverSheet(assetFor(s,b?.assetId)?.sheet);
const initialTurn=()=>({round:1,roll:0,phase:'ready',plusUsed:[]});
const phases={ready:'准备主动回合',pick:'选择一颗骰',roll:'投剩余骰',endActive:'结算主动回合',passivePick:'选择银盘上的骰',endRound:'结算被动回合',done:'六轮完成'};

export function createCleverSession(random=Math.random,sheetId='one'){
  const sheet=cleverSheet(sheetId),s={...createSession('聪明系列'),gameId:'clever',mode:'play',assets:structuredClone(cleverAssets),meta:{
    players:'1–4 人',duration:'约 30 分钟',description:'绝顶、双倍、三倍与四倍聪明，附三张挑战纸。掷骰、落笔，让奖励连成漂亮的一串。',
    rules:'点击原版计分纸的格子，划叉、圈记或填入最终记入纸面的数字。单人流程辅助负责掷骰、选择和银盘；落笔条件、轮初奖励与连锁效果按各代规则执行。多人可在编辑模式复制计分纸，自由操作骰子。'}
  };
  const a=s.assets.find(a=>a.sheet===sheetId);
  s.objects.push({...baseObject('board',390,530,0),assetId:a.id,width:a.width,height:a.height,locked:true,
    cleverNotes:{'round-0':'×'},cleverScores:{},cleverTurn:initialTurn()});
  sheet.colors.forEach((color,i)=>s.objects.push({...baseObject('die',840+(i%3)*90,230+Math.floor(i/3)*84,2+i),
    cleverDie:color,cleverZone:'pool',name:CLEVER_DICE[color][0]+'骰',color:'ivory',faces:[1,2,3,4,5,6],value:1,setupFace:'fixed'}));
  s.initialSetup=captureSetup(s,{name:sheet.name});
  return s;
}

function playable(s){if(s.mode!=='play')throw new Error('请在游玩模式使用计分纸和掷骰助手');const b=sheetBoard(s);if(!b)throw new Error('请先放回聪明系列计分纸');return b;}
function dice(s){
  const colors=config(s).colors,ds=colors.map(color=>s.objects.filter(o=>o.type==='die'&&o.cleverDie===color));
  if(ds.some(group=>group.length!==1||group[0].locked||group[0].faces.length!==6||group[0].faces.some((n,i)=>n!==i+1)||!Number.isInteger(group[0].value)||group[0].value<1||group[0].value>6))throw new Error('助手需要原有的六颗未锁定六面骰；请恢复它们后重试');
  return ds.map(group=>group[0]);
}
function turn(b){const t=b.cleverTurn;if(!t||!Number.isInteger(t.round)||t.round<1||t.round>6||!Number.isInteger(t.roll)||t.roll<0||t.roll>3||!Object.hasOwn(phases,t.phase)||!Array.isArray(t.plusUsed)||t.plusUsed.length>6||t.plusUsed.some(c=>!Object.hasOwn(CLEVER_DICE,c)))throw new Error('回合记录无效，请重新开局');return t;}
function rearrange(ds){
  for(const zone of ['pool','chosen','plate','outside'])ds.filter(d=>d.cleverZone===zone).forEach((d,i)=>Object.assign(d,{x:840+i%3*90,y:({pool:230,chosen:465,plate:680,outside:900}[zone])+Math.floor(i/3)*84,rotation:0}));
}
function resource(b,s,prefix){return cleverCells(config(s,b).id).find(c=>c.key.startsWith(prefix+'-')&&b.cleverNotes?.[c.key]==='○');}
export function cleverRoll(s,random=Math.random,{reroll=false}={}){
  const b=playable(s),t=turn(b),ds=dice(s);
  if(!(reroll?t.phase==='pick':['ready','roll'].includes(t.phase)))throw new Error(reroll?'请在选骰前使用重投奖励':'请先选择骰子或结束当前回合');
  const award=reroll?resource(b,s,'reroll'):null;
  if(reroll&&!award)throw new Error('请先在重投轨道圈出已获得、尚未使用的奖励');
  const pool=ds.filter(d=>d.cleverZone==='pool');if(!pool.length)throw new Error('没有可投的骰子');
  const values=pool.map(d=>rollDieValue(d,random));
  if(award)b.cleverNotes[award.key]='×';else t.roll++;
  pool.forEach((d,i)=>d.value=values[i]);t.phase='pick';rearrange(ds);
  return '选一颗骰后，按规则在计分纸上落笔。蓝白之和使用两颗骰当前显示的点数。';
}
export function cleverChoose(s,id){
  const b=playable(s),t=turn(b),ds=dice(s),d=ds.find(d=>d.id===id);
  if(!d||t.phase==='pick'&&d.cleverZone!=='pool'||t.phase==='passivePick'&&d.cleverZone!=='plate'||!['pick','passivePick'].includes(t.phase))throw new Error('请选择当前可用的骰子');
  if(t.phase==='passivePick'){
    d.cleverZone='chosen';t.phase='endRound';
  }else{
    const value=d.value;d.cleverZone='chosen';
    ds.filter(o=>o.cleverZone==='pool'&&o.value<value).forEach(o=>o.cleverZone='plate');
    t.phase=t.roll===3||!ds.some(d=>d.cleverZone==='pool')?'endActive':'roll';
    if(t.phase==='endActive')ds.filter(d=>d.cleverZone==='pool').forEach(d=>d.cleverZone='plate');
  }
  rearrange(ds);
  return `已选${CLEVER_DICE[d.cleverDie][0]} ${d.value}：请填写计分纸并结算奖励。`;
}
export function cleverPassive(s,random=Math.random){
  const b=playable(s),t=turn(b),ds=dice(s);
  if(!['pick','roll','endActive'].includes(t.phase))throw new Error('请先完成主动回合');
  const rolled=ds.map((d,i)=>({d,value:rollDieValue(d,random),i}));
  // The tray is below the dice pool. Equal dice nearer the tray sort first;
  // distance then the printed pool order makes ties reproducible.
  rolled.sort((a,b)=>a.value-b.value||Math.hypot(a.d.x-930,a.d.y-720)-Math.hypot(b.d.x-930,b.d.y-720)||a.i-b.i);
  rolled.forEach(({d,value},i)=>Object.assign(d,{value,cleverZone:i<3?'plate':'outside'}));
  t.phase='passivePick';t.plusUsed=[];rearrange(ds);
  return '模拟对手已投六骰，最低三颗放入银盘。选择其中一颗并填写；被动阶段不能重投。';
}
export function cleverNextRound(s){
  const b=playable(s),t=turn(b),ds=dice(s);
  if(t.phase!=='endRound')throw new Error('请先选择被动回合的骰子；无法落笔时可跳过');
  if(t.round===6){t.phase='done';return '六轮结束。请结算剩余奖励，打开计分面板核对各区得分。';}
  t.round++;t.roll=0;t.phase='ready';t.plusUsed=[];
  b.cleverNotes[`round-${t.round-1}`]='×';ds.forEach(d=>d.cleverZone='pool');rearrange(ds);
  return `第 ${t.round} 轮：请先按纸面领取轮初奖励，再投骰。`;
}
function cellTarget(s,boardId,key){
  const b=s.objects.find(o=>o.id===boardId&&o.type==='board'&&assetFor(s,o.assetId)?.group==='sheet');
  if(!b)throw new Error('计分纸不存在');
  const cell=cleverCells(config(s,b).id).find(c=>c.key===key);if(!cell)throw new Error('计分格不存在');return {b,cell};
}
export function writeCleverCell(s,boardId,key,value){
  playable(s);const {b,cell}=cellTarget(s,boardId,key);
  const marks=cell.type==='number'?['','×']:['','×','○','✓','/'];
  if(!marks.includes(value)&&!(cell.type==='number'&&/^\d{1,3}$/.test(value)))throw new Error('请填写 0–999 的整数或使用标记');
  b.cleverNotes||={};if(value==='')delete b.cleverNotes[key];else b.cleverNotes[key]=value;
}
function firstEditionScore(b){
  const notes=b.cleverNotes||{},marked=k=>!!notes[k],pre=[[0,3],[1,2],[2,1],[3,0]];
  const yellow=(r,c)=>pre.some(([a,b])=>a===r&&b===c)||marked(`yellow-${r}-${c}`);
  const blueCount=[...Array.from({length:3},(_,c)=>`blue-top-${c}`),...Array.from({length:8},(_,i)=>`blue-${Math.floor(i/4)}-${i%4}`)].filter(marked).length;
  const green=Array.from({length:11},(_,i)=>`green-${i}`).filter(marked).length;
  const sum=prefix=>Array.from({length:11},(_,i)=>Number(notes[`${prefix}-${i}`])||0).reduce((a,b)=>a+b,0);
  const scores=[ [10,14,16,20].reduce((n,v,c)=>n+(Array.from({length:4},(_,r)=>yellow(r,c)).every(Boolean)?v:0),0),
    [0,1,2,4,7,11,16,22,29,37,46,56][blueCount],green*(green+1)/2,sum('orange'),sum('purple')];
  const foxes=Number([0,1,2,3].every(c=>yellow(3,c)))+Number([0,1,2,3].every(c=>marked(`blue-1-${c}`)))+
    Number(marked('green-6'))+Number(marked('orange-7'))+Number(marked('purple-6'));
  return {scores,foxes};
}
export function cleverScore(s,b=sheetBoard(s)){
  const sheet=config(s,b),auto=sheet.id==='one'?firstEditionScore(b):{scores:[0,0,0,0,0],foxes:0};
  const scores=auto.scores.map((n,i)=>Number.isInteger(b.cleverScores?.[i])?b.cleverScores[i]:n);
  const foxes=Number.isInteger(b.cleverScores?.foxes)?b.cleverScores.foxes:auto.foxes;
  const foxScore=Math.min(...scores)*foxes;
  return {scores,foxes,foxScore,total:scores.reduce((a,b)=>a+b,0)+foxScore,automatic:sheet.id==='one'};
}
export function cleverBoardOverlay(s,b){
  if(assetFor(s,b.assetId)?.group!=='sheet')return '';
  return `<div class="clever-paper" aria-label="可填写计分纸">${cleverCells(config(s,b).id).map(c=>{
    const value=typeof b.cleverNotes?.[c.key]==='string'?b.cleverNotes[c.key]:'';
    return `<button class="clever-cell ${value?'written':''} ${c.type==='number'?'number-cell':''}" data-game-action="clever-cell" data-game-value="${escape(b.id)}|${c.key}" aria-label="${escape(c.label)}${value?'，已记 '+escape(value):''}" title="${escape(c.label)}：${escape(value||'点击填写')}" style="left:${c.x/893*100}%;top:${c.y/1263*100}%;width:${c.w/893*100}%;height:${c.h/1263*100}%" ${s.mode==='play'?'':'disabled'}>${escape(value)}</button>`;
  }).join('')}</div>`;
}
function entryDialog(s,value){
  const [id,key]=value.split('|'),{b,cell}=cellTarget(s,id,key),notes=b.cleverNotes||{};
  const write=(v,label=v)=>button('clever-write',escape(label),`${id}|${key}|${v}`);
  return `<span class="section-eyebrow">CLEVER · 落笔</span><h2>${escape(cell.label)}</h2><p class="modal-lead">当前：${escape(notes[key]||'空白')}。按原规则填写；倍数、减法或折半请记最终写在纸上的数值。</p><div class="clever-keypad">${cell.type==='number'?Array.from({length:13},(_,i)=>write(String(i))).join(''):write('×')+write('○')+write('✓')+write('/')}</div>${cell.type==='number'?`<form data-game-submit="clever-write" data-game-value="${escape(id)}|${key}" class="clever-number-form"><label class="create-project-label">其他整数（0–999）<input type="number" name="value" required min="0" max="999" step="1" aria-label="填写其他整数"></label><button type="submit" class="primary-button">填写数值</button></form>`:''}<div class="two-buttons">${write('','擦除')}${closeButton('取消')}</div><p class="subtle-note">奖励轨道：○ 表示已获得，× 表示已使用。关闭窗口后可撤销修改。</p>`;
}
function scorecard(s){
  const b=sheetBoard(s);if(!b)return '<p>请先选择计分纸。</p>';
  const sheet=config(s,b),v=cleverScore(s,b);
  return `<span class="section-eyebrow">CLEVER · 计分</span><h2>${sheet.name}</h2><p class="modal-lead">${v.automatic?'基础一代按纸面记录估算各区和狐狸，允许手动修正。':'请按原规则填写各区最终得分和狐狸数。'}狐狸分 = 最低区域分 × 狐狸数。</p><div class="clever-score-fields">${[...sheet.areas,'狐狸数量'].map((name,i)=>`<label>${name}<input type="number" step="1" min="${i===5?0:-999}" max="${i===5?99:999}" value="${i===5?v.foxes:v.scores[i]}" data-game-input="clever-score" data-game-value="${escape(b.id)}|${i===5?'foxes':i}" aria-label="${name}"></label>`).join('')}</div><p class="clever-total">总分 <strong>${v.total}</strong><small>狐狸 ${v.foxes} × ${Math.min(...v.scores)} = ${v.foxScore}</small></p><div class="two-buttons">${button('clever-score-reset','清除手动修正')}${closeButton('返回计分纸')}</div>`;
}
const versionNotes={
  1:'黄色与蓝色划叉，绿色从左到右划叉，橙色与紫色填写数值；紫色递增，6 后可重新从任意数开始。蓝色使用蓝白之和。',
  2:'银色按行划叉；黄色先圈后叉；蓝色填写蓝白之和且不得递增；绿色成对计算差值；粉色满足门槛后领取奖励。取回骰奖励在下一次投掷前，选中银盘上的骰后使用。',
  3:'黄色区按第几次掷骰在对应行划叉；青绿区可以按相同点数骰的数量划叉；蓝色从中间的 7 向两侧填写；棕色从左向右选格，允许跳格；粉色按纸面规则折半与倍增。',
  4:'黄色逐行填写，第二行扣分、第三行加分；蓝色按蓝白之和决定落笔次数；灰色按所选点数在连续同色子区划叉；绿色分别填写上下三角；粉色按点数附加效果。'
};
export function cleverJournal(s){
  const sheet=sheetBoard(s)?config(s):CLEVER_SHEETS[0];
  return `<span class="section-eyebrow">WOLFGANG WARSCH · CLEVER</span><h2>聪明系列 · 玩法与操作</h2><p class="modal-lead">四代基础版与三张挑战纸，使用提供的原版计分纸及中文规则。</p><ol class="rule-steps">${[
    ['纸面操作','点击数字格、圈或奖励图标。数值格可填 0–12，也可输入 0–999；圈记轨道用 ○ 记录获得、× 记录用掉；在奖励图标上打 ✓ 记录已结算。Ctrl+滚轮缩放，空格+拖动平移。纸默认锁定，在编辑模式可解锁、移动或调整大小。'],
    ['单人流程','共 6 轮，每轮先主动后被动。轮初自行按计分纸领取奖励并圈出。先投六骰，选一颗并落笔；更低点数的可用骰自动放进银盘。最多投三次，其余骰全部入盘；没有可写的骰时可跳过本次选择。'],
    ['模拟对手','主动回合落笔和奖励处理完后，点击“模拟对手”。六骰重新投掷，最低三颗入银盘；平局按投掷前与银盘的距离，等距再按骰池顺序。点选其中一颗，按规则落笔，然后完成本轮。不能在被动选骰前重投。'],
    ['奖励与额外行动','重投按钮消耗纸上一个尚未使用的 ○，重投全部可用骰且不占一次常规投掷。额外骰在主动或被动回合末使用：先选中桌面的一颗骰再点击按钮，每颗每回合限一次。第 1 代按所给中文单人规则禁用额外骰。第 2 代取回奖励在下一次投掷前使用，取回的骰子随骰池一起投掷。第 3 代任意点数、第 4 代擦亮骰与连锁奖励按原规则执行，必要时自由调整骰面。'],
    ['当前计分纸',versionNotes[sheet.version]],
    ['挑战纸','挑战模式 1、2、3 分别配合第 1、2、3 代的规则。优先遵循挑战纸印刷的格值、门槛、倍数和奖励。素材没有单独的挑战说明，不额外假设变体规则。'],
    ['计分与多人','点击“计分”。基础一代自动估算纸面分数，其余版由你填写各区最终得分；狐狸分与总分自动合计。多人游戏可在编辑模式复制计分纸，轮数按人数选择 4 / 5 / 6 轮，骰子自由拖放与投掷；侧边助手只提供单人六轮流程。'],
    ['存档','落笔、骰子、辅助回合和手工计分随游玩进度自动保存，并支持撤销、重做与 JSON 导出。重新开局恢复所选方案；切换计分纸会开启对应方案的新局。助手不审核落笔条件、轮初奖励、狐狸来源与奖励连锁。']
  ].map(([title,text])=>`<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol><div class="clever-rules-links">${[1,2,3,4].map(i=>`<a class="primary-button" href="/assets/clever/rules-${i}-zh.pdf" target="_blank" rel="noopener">第 ${i} 代中文规则 ↗</a>`).join('')}</div><p class="subtle-note">原游戏、规则、美术和汉化版权归各自作者与出版方。素材来自用户提供的 PnP，仅作为本地游戏组件使用。</p>`;
}
function toolbar(s){
  const b=sheetBoard(s);if(!b)return '';
  const sheet=config(s,b),t=b.cleverTurn?turn(b):initialTurn(),all=s.objects.filter(o=>o.type==='die'&&sheet.colors.includes(o.cleverDie)),v=cleverScore(s,b),canPlay=s.mode==='play'&&!!b.cleverTurn;
  const candidates=all.filter(d=>t.phase==='pick'?d.cleverZone==='pool':t.phase==='passivePick'&&d.cleverZone==='plate');
  const badges=all.filter(d=>d.cleverZone==='chosen').map(d=>`${CLEVER_DICE[d.cleverDie][0]} ${d.value}`).join(' · ');
  return `<div class="clever-toolbar"><div class="clever-toolbar-heading"><strong>${sheet.name}</strong>${button('heroes','换计分纸')}</div><small>单人流程辅助 · 第 ${t.round} / 6 轮 · 第 ${t.roll} 次投掷</small><b>${phases[t.phase]}</b><p>蓝白之和：${(all.find(d=>d.cleverDie==='blue')?.value||0)+(all.find(d=>d.cleverDie==='white')?.value||0)}${badges?`<br>已选 ${badges}`:''}</p><div class="clever-choices">${candidates.map(d=>button('clever-pick',`<i style="background:${CLEVER_DICE[d.cleverDie][1]}"></i>${CLEVER_DICE[d.cleverDie][0]} ${d.value}`,d.id,!canPlay)).join('')}</div><div class="clever-flow-buttons">${button('clever-roll',t.phase==='ready'?'投六颗骰':'投剩余骰','',!canPlay||!['ready','roll'].includes(t.phase))}${button('clever-skip','本次无法落笔，跳过','',!canPlay||!['pick','passivePick'].includes(t.phase))}${button('clever-passive','主动结束 · 模拟对手','',!canPlay||!['endActive','roll','pick'].includes(t.phase))}${button('clever-next',t.round===6?'结束第六轮':'完成本轮','',!canPlay||t.phase!=='endRound')}</div><details><summary>奖励行动</summary><p>先在纸上圈出已获得的奖励。</p>${button('clever-reroll','重投奖励','',!canPlay||t.phase!=='pick')}${button('clever-plus','选中骰 → 额外骰','',!canPlay||!['endActive','endRound'].includes(t.phase)||sheet.version===1)}${sheet.version===2?button('clever-retrieve','选中银盘骰 → 取回','',!canPlay||!['roll','endActive'].includes(t.phase)||t.roll>=3):''}<p>任意点数、擦亮骰、轮初与连锁效果按规则自行操作。</p></details><div class="clever-toolbar-footer">${button('scorecard',`计分 · ${v.total}`)}${button('journal','规则 ↗')}</div><small>点击纸面记数 · 奖励与落笔条件自行结算</small></div>`;
}
export const clever={
  id:'clever',title:'聪明系列',subtitle:'CLEVER · 四代掷写',players:'1–4 人',duration:'约 30 分钟',create:createCleverSession,
  openingProfiles:()=>CLEVER_SHEETS.map(sheet=>({id:'clever-'+sheet.id,name:sheet.name,description:`第 ${sheet.version} 代 · 六色骰 / 可填写原版计分纸${sheet.id.startsWith('challenge')?' / 挑战布局':''}`,setup:createCleverSession(()=>.5,sheet.id).initialSetup})),
  openingProfileId:()=> 'clever-one',
  prepareSession(s){
    const groups=[s.objects,s.setup?.objects,s.initialSetup?.objects,...(s.setupProfiles||[]).map(p=>p.setup?.objects)];
    for(const objects of groups)for(const o of objects||[]){
      if(o.type!=='board'||assetFor(s,o.assetId)?.group!=='sheet')continue;
      const cells=new Map(cleverCells(config(s,o).id).map(c=>[c.key,c]));
      if(o.cleverNotes!==undefined){
        if(!o.cleverNotes||typeof o.cleverNotes!=='object'||Array.isArray(o.cleverNotes)||Object.entries(o.cleverNotes).some(([key,value])=>{
          const c=cells.get(key);return !c||typeof value!=='string'||!['','×','○','✓','/'].includes(value)&&!(c.type==='number'&&/^\d{1,3}$/.test(value));
        }))throw new Error('计分纸记录无效');
      }
      if(o.cleverScores!==undefined&&(!o.cleverScores||typeof o.cleverScores!=='object'||Array.isArray(o.cleverScores)||Object.entries(o.cleverScores).some(([key,n])=>!['0','1','2','3','4','foxes'].includes(key)||!Number.isInteger(n)||n<(key==='foxes'?0:-999)||n>(key==='foxes'?99:999))))throw new Error('计分记录无效');
      if(o.cleverTurn!==undefined)turn(o);
    }
  },
  openingTitle:'选择计分纸',openingDescription:'选择四代基础版或对应挑战纸，开始一局新的掷写。当前进度可撤销恢复。',
  viewInsets:r=>r.width>850?{right:310}:{bottom:r.height*.36},
  tableBounds:{x:550,y:530,width:1120,height:1100},
  zones:[{className:'clever-zone',label:'可用骰',box:[800,155,300,35]},{className:'clever-zone',label:'已选骰 · 请在纸面落笔',box:[800,390,300,35]},{className:'clever-zone',label:'银盘 · 弃骰',box:[800,605,300,35]},{className:'clever-zone',label:'被动回合未入盘',box:[800,825,300,35]}],
  dice:Object.entries(CLEVER_DICE).map(([id,[name]])=>({id:'clever-'+id,name:name+'骰',color:'ivory',faces:[1,2,3,4,5,6]})),
  dieImage(o){const color=o.cleverDie||Object.keys(CLEVER_DICE).find(k=>o.name===CLEVER_DICE[k][0]+'骰');if(color&&Number.isInteger(o.value)&&o.value>=1&&o.value<=6)return `/assets/clever/die-${color}-${o.value}.webp`;},
  boardOverlay:cleverBoardOverlay,objectSignature:o=>[o.cleverNotes],toolbar,
  views:['scorecard'],scorecard,journal:cleverJournal,
  dialog(s,action,value){if(action==='clever-cell'){playable(s);return entryDialog(s,value);}},
  act(s,action,value,selected=[]){
    if(action==='clever-write'){const [id,key,n]=value.split('|');writeCleverCell(s,id,key,n);return {closeDialog:true};}
    const b=playable(s);
    if(action==='clever-score'){
      const [id,key,input]=value.split('|'),target=s.objects.find(o=>o.id===id&&o.type==='board'&&assetFor(s,o.assetId)?.group==='sheet'),n=Number(input);
      if(!target||!['0','1','2','3','4','foxes'].includes(key)||!input.trim()||!Number.isInteger(n)||n<(key==='foxes'?0:-999)||n>(key==='foxes'?99:999))throw new Error('区域分数须为 −999–999 整数，狐狸数为 0–99');
      target.cleverScores||={};target.cleverScores[key]=n;return;
    }
    if(action==='clever-score-reset'){b.cleverScores={};return;}
    if(action==='clever-roll')return cleverRoll(s);
    if(action==='clever-reroll')return cleverRoll(s,Math.random,{reroll:true});
    if(action==='clever-pick')return cleverChoose(s,value);
    if(action==='clever-passive')return cleverPassive(s);
    if(action==='clever-next')return cleverNextRound(s);
    const t=turn(b),ds=dice(s);
    if(action==='clever-skip'){
      if(!['pick','passivePick'].includes(t.phase))throw new Error('当前不能跳过');
      if(t.phase==='passivePick')t.phase='endRound';else{
        t.phase=t.roll===3?'endActive':'roll';
        if(t.phase==='endActive')ds.filter(d=>d.cleverZone==='pool').forEach(d=>d.cleverZone='plate');
      }
      rearrange(ds);return '已跳过；本次没有落笔。';
    }
    if(action==='clever-plus'){
      const d=ds.find(d=>selected.includes(d.id)),award=resource(b,s,'plus')||resource(b,s,'plus-extra');
      if(config(s).version===1)throw new Error('按所给第 1 代中文规则，单人不使用 +1 奖励');
      if(!['endActive','endRound'].includes(t.phase)||!d||selected.length!==1||t.plusUsed.includes(d.cleverDie)||!award)throw new Error('请在回合末选中一颗本回合未额外使用的骰，并确认纸上有可用的额外骰奖励');
      b.cleverNotes[award.key]='×';t.plusUsed.push(d.cleverDie);return `额外使用${CLEVER_DICE[d.cleverDie][0]} ${d.value}：请在纸面落笔并结算连锁。`;
    }
    if(action==='clever-retrieve'){
      const d=ds.find(d=>selected.includes(d.id)),award=resource(b,s,'retrieve');
      if(config(s).version!==2||!['roll','endActive'].includes(t.phase)||t.roll>=3||!d||selected.length!==1||d.cleverZone!=='plate'||!award)throw new Error('请在下一次投掷前选中一颗银盘骰，并先圈出可用的取回奖励');
      b.cleverNotes[award.key]='×';d.cleverZone='pool';t.phase='roll';rearrange(ds);return '骰子已取回，请随剩余骰一起投掷。';
    }
    throw new Error('未知的聪明系列操作');
  }
};
